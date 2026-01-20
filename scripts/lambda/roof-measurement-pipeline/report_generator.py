"""
GAF QuickMeasure-Style Roof Measurement Report Generator

Generates professional 11-page PDF reports similar to GAF QuickMeasure:
1. Cover Page - Branding and property address
2. Overview Page - Summary statistics
3. Top View Page - Satellite imagery with roof overlay
4. Side Views Pages - N/E/S/W oblique angle perspectives (4 pages)
5. Lengths Page - Edge measurements diagram
6. Pitches Page - Pitch diagram by facet
7. Areas Page - Facet area breakdown
8. Summary Page - All measurements compiled
9. Roofing Materials Page - GAF products at 0/15/20/25% waste factors
10. Attic Vents Page - Ventilation recommendations
11. FORTIFIED Materials Page - Hurricane/wind resistant materials

Uses ReportLab for PDF generation and Google Static Maps API for imagery.
"""

import os
import io
import json
import math
import base64
import uuid
import urllib.request
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field

import boto3
from botocore.exceptions import ClientError

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, LETTER
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        Image, PageBreak, HRFlowable, KeepTogether, ListFlowable, ListItem
    )
    from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.pdfgen import canvas
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

try:
    from PIL import Image as PILImage, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


# =============================================================================
# CONFIGURATION & CONSTANTS
# =============================================================================

# Panda Exteriors Branding Colors
COLORS = {
    "primary": colors.HexColor("#667eea"),       # Purple-blue
    "secondary": colors.HexColor("#764ba2"),     # Purple
    "accent": colors.HexColor("#22C55E"),        # Green
    "warning": colors.HexColor("#EAB308"),       # Yellow
    "error": colors.HexColor("#EF4444"),         # Red
    "text": colors.HexColor("#1F2937"),          # Dark gray
    "light_text": colors.HexColor("#6B7280"),    # Light gray
    "background": colors.HexColor("#F9FAFB"),    # Light background
    "header_bg": colors.HexColor("#1E3A5F"),     # Dark blue header
    "white": colors.white,
    "black": colors.black,
}

# Edge type colors for diagrams
EDGE_COLORS = {
    "ridge": "#FF0000",      # Red
    "hip": "#FFA500",        # Orange
    "valley": "#0000FF",     # Blue
    "eave": "#00FF00",       # Green
    "rake": "#FFFF00",       # Yellow
    "step_flashing": "#800080",  # Purple
    "drip_edge": "#00CED1",  # Dark Cyan
}

# Pitch factors for roof slope
PITCH_FACTORS = {
    "flat": 1.000,
    "1/12": 1.003,
    "2/12": 1.014,
    "3/12": 1.031,
    "4/12": 1.054,
    "5/12": 1.083,
    "6/12": 1.118,
    "7/12": 1.158,
    "8/12": 1.202,
    "9/12": 1.250,
    "10/12": 1.302,
    "11/12": 1.357,
    "12/12": 1.414,
    "13/12": 1.474,
    "14/12": 1.537,
    "15/12": 1.601,
    "16/12": 1.667,
}

# Waste factors for materials
WASTE_FACTORS = [0, 15, 20, 25]  # Percentages

# Google Maps API Key
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "AIzaSyChtXv2kpzAONE-VDQX4BQ7fDRKMlEhXCQ")


# =============================================================================
# GAF PRODUCT CATALOG
# =============================================================================

GAF_PRODUCTS = {
    "shingles": [
        {"name": "GAF Timberline HDZ", "coverage_sqft": 33.3, "unit": "bundle", "bundles_per_square": 3},
        {"name": "GAF Timberline UHDZ", "coverage_sqft": 33.3, "unit": "bundle", "bundles_per_square": 3},
        {"name": "GAF Timberline AS II", "coverage_sqft": 33.3, "unit": "bundle", "bundles_per_square": 3},
    ],
    "underlayment": [
        {"name": "GAF FeltBuster", "coverage_sqft": 1000, "unit": "roll"},
        {"name": "GAF Tiger Paw", "coverage_sqft": 1000, "unit": "roll"},
        {"name": "GAF Deck-Armor", "coverage_sqft": 400, "unit": "roll"},
    ],
    "starter": [
        {"name": "GAF Pro-Start", "coverage_lf": 120, "unit": "bundle"},
        {"name": "GAF WeatherBlocker", "coverage_lf": 105, "unit": "roll"},
    ],
    "ridge_cap": [
        {"name": "GAF Seal-A-Ridge", "coverage_lf": 25, "unit": "bundle"},
        {"name": "GAF TimberTex", "coverage_lf": 20, "unit": "bundle"},
        {"name": "GAF Ridglass", "coverage_lf": 33, "unit": "bundle"},
    ],
    "ventilation": [
        {"name": "GAF Cobra Ridge Vent", "coverage_lf": 4, "unit": "piece"},
        {"name": "GAF Cobra Exhaust Vent", "nfa_sqin": 18, "unit": "piece"},
        {"name": "GAF Master Flow Turbine", "nfa_sqin": 144, "unit": "piece"},
    ],
    "ice_water": [
        {"name": "GAF WeatherWatch", "coverage_sqft": 200, "unit": "roll"},
        {"name": "GAF StormGuard", "coverage_sqft": 200, "unit": "roll"},
    ],
    "drip_edge": [
        {"name": "Standard Drip Edge (2x2)", "coverage_lf": 10, "unit": "piece"},
        {"name": "DripEdge T-Style", "coverage_lf": 10, "unit": "piece"},
    ],
    "flashing": [
        {"name": "Step Flashing (4x4)", "coverage_lf": 1, "unit": "piece"},
        {"name": "Pipe Boot (1-3\")", "coverage_count": 1, "unit": "piece"},
        {"name": "Pipe Boot (3-4\")", "coverage_count": 1, "unit": "piece"},
    ],
}

FORTIFIED_PRODUCTS = {
    "roof_deck": [
        {"name": "FORTIFIED Roof Deck Tape", "coverage_lf": 75, "unit": "roll"},
    ],
    "enhanced_shingles": [
        {"name": "GAF Timberline HDZ (FORTIFIED)", "coverage_sqft": 33.3, "unit": "bundle", "bundles_per_square": 3},
    ],
    "enhanced_underlayment": [
        {"name": "GAF Deck-Armor (FORTIFIED)", "coverage_sqft": 400, "unit": "roll"},
    ],
    "sealed_roof_deck": [
        {"name": "Sealed Roof Deck Nails (Ring Shank)", "coverage_sqft": 32, "unit": "lb"},
    ],
}


# =============================================================================
# REPORT CONFIGURATION
# =============================================================================

@dataclass
class ReportConfig:
    """Configuration for GAF-style report generation"""
    company_name: str = "Panda Exteriors"
    company_logo_url: Optional[str] = None
    company_phone: str = "(240) 801-6665"
    company_email: str = "info@pandaexteriors.com"
    company_website: str = "pandaexteriors.com"
    company_address: str = "Baltimore, MD"
    include_cover_page: bool = True
    include_overview: bool = True
    include_top_view: bool = True
    include_side_views: bool = True
    include_lengths: bool = True
    include_pitches: bool = True
    include_areas: bool = True
    include_summary: bool = True
    include_materials: bool = True
    include_ventilation: bool = True
    include_fortified: bool = True
    page_size: Tuple[float, float] = LETTER
    google_maps_api_key: str = field(default_factory=lambda: GOOGLE_MAPS_API_KEY)


# =============================================================================
# GAF-STYLE REPORT GENERATOR
# =============================================================================

class GAFStyleReportGenerator:
    """
    Generates professional PDF reports matching GAF QuickMeasure format.

    11-page layout:
    1. Cover Page
    2. Overview Page
    3. Top View Page (satellite)
    4-7. Side Views Pages (N, E, S, W oblique)
    8. Lengths Page
    9. Pitches Page
    10. Areas Page
    11. Summary Page
    12. Roofing Materials Page (waste factors)
    13. Attic Vents Page
    14. FORTIFIED Materials Page
    """

    def __init__(self, config: Optional[ReportConfig] = None):
        if not HAS_REPORTLAB:
            raise RuntimeError("reportlab required. Install: pip install reportlab")

        self.config = config or ReportConfig()
        self.styles = self._create_styles()
        self.page_number = 0

    def _create_styles(self) -> Dict[str, ParagraphStyle]:
        """Create custom paragraph styles for GAF-like appearance"""
        base = getSampleStyleSheet()

        return {
            "cover_title": ParagraphStyle(
                "CoverTitle",
                parent=base["Heading1"],
                fontSize=36,
                textColor=COLORS["white"],
                alignment=TA_CENTER,
                spaceAfter=12,
            ),
            "cover_subtitle": ParagraphStyle(
                "CoverSubtitle",
                parent=base["Normal"],
                fontSize=18,
                textColor=COLORS["white"],
                alignment=TA_CENTER,
                spaceAfter=6,
            ),
            "cover_address": ParagraphStyle(
                "CoverAddress",
                parent=base["Normal"],
                fontSize=14,
                textColor=COLORS["white"],
                alignment=TA_CENTER,
            ),
            "page_title": ParagraphStyle(
                "PageTitle",
                parent=base["Heading1"],
                fontSize=24,
                textColor=COLORS["header_bg"],
                alignment=TA_LEFT,
                spaceBefore=0,
                spaceAfter=12,
            ),
            "section_header": ParagraphStyle(
                "SectionHeader",
                parent=base["Heading2"],
                fontSize=14,
                textColor=COLORS["primary"],
                spaceBefore=12,
                spaceAfter=6,
            ),
            "body": ParagraphStyle(
                "Body",
                parent=base["Normal"],
                fontSize=10,
                textColor=COLORS["text"],
                spaceAfter=4,
            ),
            "body_bold": ParagraphStyle(
                "BodyBold",
                parent=base["Normal"],
                fontSize=10,
                textColor=COLORS["text"],
                fontName="Helvetica-Bold",
            ),
            "small": ParagraphStyle(
                "Small",
                parent=base["Normal"],
                fontSize=8,
                textColor=COLORS["light_text"],
            ),
            "table_header": ParagraphStyle(
                "TableHeader",
                parent=base["Normal"],
                fontSize=9,
                textColor=COLORS["white"],
                fontName="Helvetica-Bold",
            ),
            "metric_value": ParagraphStyle(
                "MetricValue",
                parent=base["Normal"],
                fontSize=28,
                textColor=COLORS["primary"],
                fontName="Helvetica-Bold",
                alignment=TA_CENTER,
            ),
            "metric_label": ParagraphStyle(
                "MetricLabel",
                parent=base["Normal"],
                fontSize=10,
                textColor=COLORS["light_text"],
                alignment=TA_CENTER,
            ),
            "confidence_high": ParagraphStyle(
                "ConfHigh", parent=base["Normal"], fontSize=9, textColor=COLORS["accent"]
            ),
            "confidence_medium": ParagraphStyle(
                "ConfMedium", parent=base["Normal"], fontSize=9, textColor=COLORS["warning"]
            ),
            "confidence_low": ParagraphStyle(
                "ConfLow", parent=base["Normal"], fontSize=9, textColor=COLORS["error"]
            ),
        }

    def generate_report(
        self,
        measurements: Dict[str, Any],
        address: Dict[str, Any],
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        imagery_data: Optional[bytes] = None,
        output_path: Optional[str] = None,
    ) -> bytes:
        """
        Generate complete GAF-style PDF report.

        Args:
            measurements: Roof measurements from measurement_calculator
            address: Property address dict
            latitude: Property latitude for imagery
            longitude: Property longitude for imagery
            imagery_data: Optional pre-fetched imagery bytes
            output_path: Optional file path to save PDF

        Returns:
            PDF bytes
        """
        buffer = io.BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=self.config.page_size,
            rightMargin=0.5*inch,
            leftMargin=0.5*inch,
            topMargin=0.5*inch,
            bottomMargin=0.75*inch,
        )

        story = []

        # Fetch Google Maps imagery if coordinates provided
        imagery_cache = {}
        if latitude and longitude:
            imagery_cache = self._fetch_all_imagery(latitude, longitude)
        elif imagery_data:
            imagery_cache["top"] = imagery_data

        # Build pages
        if self.config.include_cover_page:
            story.extend(self._build_cover_page(address, measurements))

        if self.config.include_overview:
            story.append(PageBreak())
            story.extend(self._build_overview_page(measurements, address))

        if self.config.include_top_view and imagery_cache.get("top"):
            story.append(PageBreak())
            story.extend(self._build_top_view_page(imagery_cache["top"], measurements))

        if self.config.include_side_views:
            for direction in ["N", "E", "S", "W"]:
                key = f"oblique_{direction}"
                if imagery_cache.get(key):
                    story.append(PageBreak())
                    story.extend(self._build_side_view_page(
                        imagery_cache[key], direction, measurements
                    ))

        if self.config.include_lengths:
            story.append(PageBreak())
            story.extend(self._build_lengths_page(measurements))

        if self.config.include_pitches:
            story.append(PageBreak())
            story.extend(self._build_pitches_page(measurements))

        if self.config.include_areas:
            story.append(PageBreak())
            story.extend(self._build_areas_page(measurements))

        if self.config.include_summary:
            story.append(PageBreak())
            story.extend(self._build_summary_page(measurements))

        if self.config.include_materials:
            story.append(PageBreak())
            story.extend(self._build_materials_page(measurements))

        if self.config.include_ventilation:
            story.append(PageBreak())
            story.extend(self._build_ventilation_page(measurements))

        if self.config.include_fortified:
            story.append(PageBreak())
            story.extend(self._build_fortified_page(measurements))

        # Build PDF
        doc.build(
            story,
            onFirstPage=self._add_page_decorations,
            onLaterPages=self._add_page_decorations
        )

        pdf_bytes = buffer.getvalue()
        buffer.close()

        if output_path:
            with open(output_path, 'wb') as f:
                f.write(pdf_bytes)

        return pdf_bytes

    # =========================================================================
    # IMAGERY FETCHING
    # =========================================================================

    def _fetch_all_imagery(self, lat: float, lng: float) -> Dict[str, bytes]:
        """Fetch all imagery needed for the report from Google Maps API"""
        cache = {}

        # Top-down satellite view
        cache["top"] = self._fetch_google_maps_image(lat, lng, zoom=20, maptype="satellite")

        # Oblique views (simulated with different headings)
        # Note: Google Static Maps doesn't support true oblique views
        # We use satellite view with slight offset to simulate perspective
        for direction, heading in [("N", 0), ("E", 90), ("S", 180), ("W", 270)]:
            cache[f"oblique_{direction}"] = self._fetch_google_maps_image(
                lat, lng, zoom=20, maptype="satellite", heading=heading
            )

        return cache

    def _fetch_google_maps_image(
        self,
        lat: float,
        lng: float,
        zoom: int = 20,
        size: str = "640x480",
        maptype: str = "satellite",
        heading: Optional[int] = None,
    ) -> Optional[bytes]:
        """Fetch single image from Google Static Maps API"""
        try:
            base_url = "https://maps.googleapis.com/maps/api/staticmap"
            params = [
                f"center={lat},{lng}",
                f"zoom={zoom}",
                f"size={size}",
                f"maptype={maptype}",
                f"key={self.config.google_maps_api_key}",
            ]

            if heading is not None:
                params.append(f"heading={heading}")

            url = f"{base_url}?{'&'.join(params)}"

            with urllib.request.urlopen(url, timeout=30) as response:
                return response.read()

        except Exception as e:
            print(f"Error fetching Google Maps image: {e}")
            return None

    # =========================================================================
    # PAGE BUILDERS
    # =========================================================================

    def _build_cover_page(self, address: Dict[str, Any], measurements: Dict[str, Any]) -> List:
        """Build cover page with branding and property info"""
        elements = []

        # Create a drawing for the header background
        header = Drawing(7.5*inch, 3*inch)
        header.add(Rect(0, 0, 7.5*inch, 3*inch, fillColor=COLORS["header_bg"], strokeColor=None))
        elements.append(header)

        elements.append(Spacer(1, -2.5*inch))  # Overlay text on header

        # Company name
        elements.append(Paragraph(self.config.company_name, self.styles["cover_title"]))
        elements.append(Paragraph("Roof Measurement Report", self.styles["cover_subtitle"]))

        elements.append(Spacer(1, 1.5*inch))

        # Property address box
        address_text = self._format_address(address)
        elements.append(Paragraph(
            f"<b>Property Address</b>",
            ParagraphStyle("AddrLabel", fontSize=12, textColor=COLORS["text"], alignment=TA_CENTER)
        ))
        elements.append(Paragraph(
            address_text,
            ParagraphStyle("AddrText", fontSize=14, textColor=COLORS["text"], alignment=TA_CENTER, spaceAfter=24)
        ))

        # Key metrics summary
        total_area = measurements.get("total_area_sqft", 0)
        squares = measurements.get("roof_squares", 0)
        pitch = measurements.get("predominant_pitch", "N/A")
        facets = measurements.get("facet_count", 0)

        metrics_data = [
            [
                self._create_metric_cell(f"{total_area:,.0f}", "Total Sq Ft"),
                self._create_metric_cell(f"{squares:.1f}", "Roof Squares"),
                self._create_metric_cell(pitch, "Pitch"),
                self._create_metric_cell(str(facets), "Facets"),
            ]
        ]

        metrics_table = Table(metrics_data, colWidths=[1.75*inch]*4)
        metrics_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOX", (0, 0), (-1, -1), 1, COLORS["primary"]),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
            ("TOPPADDING", (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ]))
        elements.append(metrics_table)

        elements.append(Spacer(1, inch))

        # Report date and company info
        report_date = datetime.now().strftime("%B %d, %Y")
        elements.append(Paragraph(
            f"Report Generated: {report_date}",
            ParagraphStyle("DateText", fontSize=10, textColor=COLORS["light_text"], alignment=TA_CENTER)
        ))

        elements.append(Spacer(1, 0.5*inch))

        # Company contact footer
        contact_text = f"{self.config.company_phone} | {self.config.company_website}"
        elements.append(Paragraph(
            contact_text,
            ParagraphStyle("ContactText", fontSize=10, textColor=COLORS["text"], alignment=TA_CENTER)
        ))

        return elements

    def _build_overview_page(self, measurements: Dict[str, Any], address: Dict[str, Any]) -> List:
        """Build overview page with summary statistics"""
        elements = []

        elements.append(Paragraph("Report Overview", self.styles["page_title"]))
        elements.append(HRFlowable(width="100%", thickness=2, color=COLORS["primary"], spaceAfter=12))

        # Property info section
        elements.append(Paragraph("Property Information", self.styles["section_header"]))

        address_text = self._format_address(address)
        lat = address.get("latitude", measurements.get("latitude", "N/A"))
        lng = address.get("longitude", measurements.get("longitude", "N/A"))

        info_data = [
            ["Address", address_text],
            ["Coordinates", f"{lat}, {lng}" if lat != "N/A" else "Not Available"],
            ["Report Date", datetime.now().strftime("%B %d, %Y at %I:%M %p")],
        ]

        info_table = Table(info_data, colWidths=[2*inch, 4.5*inch])
        info_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), COLORS["background"]),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
        ]))
        elements.append(info_table)

        elements.append(Spacer(1, 12))

        # Summary statistics section
        elements.append(Paragraph("Measurement Summary", self.styles["section_header"]))

        summary_data = [
            ["Metric", "Value"],
            ["Total Roof Area", f"{measurements.get('total_area_sqft', 0):,.1f} sq ft"],
            ["Roof Squares (100 sq ft each)", f"{measurements.get('roof_squares', 0):.2f} squares"],
            ["Predominant Pitch", measurements.get("predominant_pitch", "N/A")],
            ["Pitch Angle", f"{measurements.get('pitch_degrees', 0):.1f} degrees"],
            ["Pitch Factor", f"{measurements.get('pitch_factor', 1.0):.3f}"],
            ["Number of Roof Facets", str(measurements.get("facet_count", 0))],
            ["Data Confidence", f"{measurements.get('overall_confidence', 0) * 100:.0f}%"],
        ]

        summary_table = Table(summary_data, colWidths=[3.5*inch, 3*inch])
        summary_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
            ("TEXTCOLOR", (0, 0), (-1, 0), COLORS["white"]),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ALIGN", (1, 1), (1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["background"]]),
        ]))
        elements.append(summary_table)

        # Data sources
        elements.append(Spacer(1, 12))
        elements.append(Paragraph("Data Sources", self.styles["section_header"]))

        sources = measurements.get("data_sources", ["Google Maps Satellite Imagery"])
        for source in sources:
            elements.append(Paragraph(f"- {source}", self.styles["body"]))

        # Warnings
        warnings = measurements.get("warnings", [])
        if warnings:
            elements.append(Spacer(1, 12))
            elements.append(Paragraph("Notes & Warnings", self.styles["section_header"]))
            for warning in warnings:
                elements.append(Paragraph(
                    f"- {warning}",
                    ParagraphStyle("Warning", fontSize=9, textColor=COLORS["warning"])
                ))

        return elements

    def _build_top_view_page(self, imagery: bytes, measurements: Dict[str, Any]) -> List:
        """Build top view page with satellite imagery"""
        elements = []

        elements.append(Paragraph("Top View", self.styles["page_title"]))
        elements.append(HRFlowable(width="100%", thickness=2, color=COLORS["primary"], spaceAfter=12))

        elements.append(Paragraph(
            "Aerial satellite view of the property showing roof surface area.",
            self.styles["body"]
        ))
        elements.append(Spacer(1, 6))

        # Display imagery
        if imagery:
            img_buffer = io.BytesIO(imagery)
            img = Image(img_buffer, width=6.5*inch, height=4.5*inch)
            img.hAlign = "CENTER"
            elements.append(img)

        elements.append(Spacer(1, 12))

        # Quick stats under image
        stats_data = [[
            f"Total Area: {measurements.get('total_area_sqft', 0):,.0f} sq ft",
            f"Facets: {measurements.get('facet_count', 0)}",
            f"Pitch: {measurements.get('predominant_pitch', 'N/A')}",
        ]]

        stats_table = Table(stats_data, colWidths=[2.2*inch]*3)
        stats_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (-1, -1), COLORS["text"]),
            ("BOX", (0, 0), (-1, -1), 1, COLORS["light_text"]),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        elements.append(stats_table)

        return elements

    def _build_side_view_page(self, imagery: bytes, direction: str, measurements: Dict[str, Any]) -> List:
        """Build side view page for oblique perspective"""
        elements = []

        direction_names = {"N": "North", "E": "East", "S": "South", "W": "West"}
        full_direction = direction_names.get(direction, direction)

        elements.append(Paragraph(f"{full_direction} View", self.styles["page_title"]))
        elements.append(HRFlowable(width="100%", thickness=2, color=COLORS["primary"], spaceAfter=12))

        elements.append(Paragraph(
            f"Oblique view from the {full_direction.lower()} showing roof pitch and structure.",
            self.styles["body"]
        ))
        elements.append(Spacer(1, 6))

        if imagery:
            img_buffer = io.BytesIO(imagery)
            img = Image(img_buffer, width=6.5*inch, height=4.5*inch)
            img.hAlign = "CENTER"
            elements.append(img)

        return elements

    def _build_lengths_page(self, measurements: Dict[str, Any]) -> List:
        """Build lengths page with edge measurements"""
        elements = []

        elements.append(Paragraph("Lengths", self.styles["page_title"]))
        elements.append(HRFlowable(width="100%", thickness=2, color=COLORS["primary"], spaceAfter=12))

        elements.append(Paragraph(
            "Linear measurements for all roof edges. Use these values for material ordering.",
            self.styles["body"]
        ))
        elements.append(Spacer(1, 12))

        # Edge legend
        elements.append(self._build_edge_legend())
        elements.append(Spacer(1, 12))

        # Lengths table
        edge_types = [
            ("Ridge", "ridge", "Top edge where two roof planes meet"),
            ("Hip", "hip", "Angled edge where two planes meet at outer corner"),
            ("Valley", "valley", "Angled edge where two planes meet at inner corner"),
            ("Eave", "eave", "Horizontal bottom edge (for gutters)"),
            ("Rake", "rake", "Sloped side edge"),
            ("Drip Edge (Total)", "drip_edge", "Combined eave + rake lengths"),
            ("Starter Strip", "starter", "Starter material for eaves"),
            ("Step Flashing", "step_flashing", "Where roof meets vertical wall"),
        ]

        table_data = [["Edge Type", "Length (ft)", "Confidence", "Notes"]]

        for name, key, description in edge_types:
            data = measurements.get(key, {})
            if isinstance(data, dict):
                length = data.get("length_ft", 0)
                confidence = data.get("confidence", "N/A")
            else:
                length = 0
                confidence = "N/A"

            conf_color = self._get_confidence_color(confidence)
            table_data.append([
                name,
                f"{length:,.1f}",
                Paragraph(f'<font color="{conf_color}">{confidence}</font>', self.styles["body"]),
                description[:40] + "..." if len(description) > 40 else description,
            ])

        table = Table(table_data, colWidths=[1.5*inch, 1*inch, 1*inch, 3*inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
            ("TEXTCOLOR", (0, 0), (-1, 0), COLORS["white"]),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 1), (2, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["background"]]),
        ]))
        elements.append(table)

        return elements

    def _build_pitches_page(self, measurements: Dict[str, Any]) -> List:
        """Build pitches page showing roof slope by facet"""
        elements = []

        elements.append(Paragraph("Pitches", self.styles["page_title"]))
        elements.append(HRFlowable(width="100%", thickness=2, color=COLORS["primary"], spaceAfter=12))

        elements.append(Paragraph(
            "Roof pitch measurements by facet. Pitch affects material requirements and installation complexity.",
            self.styles["body"]
        ))
        elements.append(Spacer(1, 12))

        # Predominant pitch callout
        predominant = measurements.get("predominant_pitch", "N/A")
        pitch_degrees = measurements.get("pitch_degrees", 0)
        pitch_factor = measurements.get("pitch_factor", 1.0)

        pitch_summary = [[
            f"Predominant Pitch: {predominant}",
            f"Angle: {pitch_degrees:.1f}°",
            f"Pitch Factor: {pitch_factor:.3f}",
        ]]

        pitch_table = Table(pitch_summary, colWidths=[2.2*inch]*3)
        pitch_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 11),
            ("BACKGROUND", (0, 0), (-1, -1), COLORS["background"]),
            ("BOX", (0, 0), (-1, -1), 1, COLORS["primary"]),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        elements.append(pitch_table)
        elements.append(Spacer(1, 12))

        # Pitch factor reference table
        elements.append(Paragraph("Pitch Factor Reference", self.styles["section_header"]))

        pitch_ref_data = [["Pitch", "Factor", "Pitch", "Factor"]]
        pitches = list(PITCH_FACTORS.items())
        half = len(pitches) // 2

        for i in range(half):
            left = pitches[i]
            right = pitches[i + half] if i + half < len(pitches) else ("", "")
            pitch_ref_data.append([left[0], f"{left[1]:.3f}", right[0], f"{right[1]:.3f}" if right[1] else ""])

        ref_table = Table(pitch_ref_data, colWidths=[1.6*inch]*4)
        ref_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["secondary"]),
            ("TEXTCOLOR", (0, 0), (-1, 0), COLORS["white"]),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
        ]))
        elements.append(ref_table)

        return elements

    def _build_areas_page(self, measurements: Dict[str, Any]) -> List:
        """Build areas page with facet breakdown"""
        elements = []

        elements.append(Paragraph("Areas", self.styles["page_title"]))
        elements.append(HRFlowable(width="100%", thickness=2, color=COLORS["primary"], spaceAfter=12))

        elements.append(Paragraph(
            "Roof area breakdown by facet. Total area includes pitch factor adjustment.",
            self.styles["body"]
        ))
        elements.append(Spacer(1, 12))

        # Total area summary
        total_area = measurements.get("total_area_sqft", 0)
        squares = measurements.get("roof_squares", 0)

        area_summary = [[
            f"Total Roof Area: {total_area:,.1f} sq ft",
            f"Total Squares: {squares:.2f}",
        ]]

        summary_table = Table(area_summary, colWidths=[3.25*inch, 3.25*inch])
        summary_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 12),
            ("BACKGROUND", (0, 0), (-1, -1), COLORS["accent"]),
            ("TEXTCOLOR", (0, 0), (-1, -1), COLORS["white"]),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 12))

        # Facet breakdown table
        facets = measurements.get("facets", [])
        if facets:
            elements.append(Paragraph("Facet Breakdown", self.styles["section_header"]))

            facet_data = [["Facet #", "Area (sq ft)", "Pitch", "Aspect", "Edges"]]

            for i, facet in enumerate(facets[:20], 1):  # Limit to 20 facets
                area = facet.get("area_sqft", 0)
                pitch = facet.get("pitch", "N/A")
                aspect = facet.get("aspect", 0)
                edges = facet.get("edge_count", 0)

                direction = self._degrees_to_direction(aspect) if isinstance(aspect, (int, float)) else str(aspect)

                facet_data.append([
                    f"Facet {i}",
                    f"{area:,.1f}",
                    f"{pitch}°" if isinstance(pitch, (int, float)) else pitch,
                    direction,
                    str(edges),
                ])

            # Total row
            total_facet_area = sum(f.get("area_sqft", 0) for f in facets)
            facet_data.append(["TOTAL", f"{total_facet_area:,.1f}", "-", "-", "-"])

            facet_table = Table(facet_data, colWidths=[1.2*inch, 1.3*inch, 1*inch, 1*inch, 1*inch])
            facet_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
                ("TEXTCOLOR", (0, 0), (-1, 0), COLORS["white"]),
                ("BACKGROUND", (0, -1), (-1, -1), COLORS["background"]),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("GRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
            ]))
            elements.append(facet_table)

        return elements

    def _build_summary_page(self, measurements: Dict[str, Any]) -> List:
        """Build summary page with all measurements compiled"""
        elements = []

        elements.append(Paragraph("Measurement Summary", self.styles["page_title"]))
        elements.append(HRFlowable(width="100%", thickness=2, color=COLORS["primary"], spaceAfter=12))

        # Area measurements
        elements.append(Paragraph("Area Measurements", self.styles["section_header"]))

        area_data = [
            ["Total Roof Area", f"{measurements.get('total_area_sqft', 0):,.1f} sq ft"],
            ["Roof Squares", f"{measurements.get('roof_squares', 0):.2f} squares"],
            ["Facet Count", str(measurements.get("facet_count", 0))],
        ]

        area_table = self._create_summary_table(area_data)
        elements.append(area_table)
        elements.append(Spacer(1, 8))

        # Pitch info
        elements.append(Paragraph("Pitch Information", self.styles["section_header"]))

        pitch_data = [
            ["Predominant Pitch", measurements.get("predominant_pitch", "N/A")],
            ["Pitch Angle", f"{measurements.get('pitch_degrees', 0):.1f}°"],
            ["Pitch Factor", f"{measurements.get('pitch_factor', 1.0):.3f}"],
        ]

        pitch_table = self._create_summary_table(pitch_data)
        elements.append(pitch_table)
        elements.append(Spacer(1, 8))

        # Linear measurements
        elements.append(Paragraph("Linear Measurements", self.styles["section_header"]))

        linear_items = [
            ("Ridge", "ridge"),
            ("Hip", "hip"),
            ("Valley", "valley"),
            ("Eave", "eave"),
            ("Rake", "rake"),
            ("Drip Edge", "drip_edge"),
            ("Starter", "starter"),
            ("Step Flashing", "step_flashing"),
        ]

        linear_data = []
        for name, key in linear_items:
            data = measurements.get(key, {})
            length = data.get("length_ft", 0) if isinstance(data, dict) else 0
            linear_data.append([name, f"{length:,.1f} ft"])

        linear_table = self._create_summary_table(linear_data)
        elements.append(linear_table)
        elements.append(Spacer(1, 8))

        # Roof features
        elements.append(Paragraph("Roof Features", self.styles["section_header"]))

        features_data = [
            ["Chimneys", str(measurements.get("chimneys", 0))],
            ["Skylights", str(measurements.get("skylights", 0))],
            ["Vents", str(measurements.get("vents", 0))],
            ["Pipes/Penetrations", str(measurements.get("pipes", 0))],
        ]

        features_table = self._create_summary_table(features_data)
        elements.append(features_table)

        return elements

    def _build_materials_page(self, measurements: Dict[str, Any]) -> List:
        """Build materials page with GAF products at different waste factors"""
        elements = []

        elements.append(Paragraph("Roofing Materials", self.styles["page_title"]))
        elements.append(HRFlowable(width="100%", thickness=2, color=COLORS["primary"], spaceAfter=12))

        elements.append(Paragraph(
            "Material quantities calculated at different waste factors. "
            "Select the appropriate waste factor based on roof complexity.",
            self.styles["body"]
        ))
        elements.append(Spacer(1, 12))

        # Get base measurements
        total_area = measurements.get("total_area_sqft", 0)
        squares = measurements.get("roof_squares", 0)
        ridge_hip = (measurements.get("ridge", {}).get("length_ft", 0) +
                    measurements.get("hip", {}).get("length_ft", 0))
        eave = measurements.get("eave", {}).get("length_ft", 0)
        rake = measurements.get("rake", {}).get("length_ft", 0)
        drip_edge = measurements.get("drip_edge", {}).get("length_ft", 0)
        valley = measurements.get("valley", {}).get("length_ft", 0)

        # Materials table with waste factors
        header = ["Material", "Unit"] + [f"{w}% Waste" for w in WASTE_FACTORS]

        materials_data = [header]

        # Shingles (3 bundles per square)
        for waste in WASTE_FACTORS:
            factor = 1 + (waste / 100)
            bundles = math.ceil(squares * 3 * factor)
            if waste == 0:
                shingle_row = ["GAF Timberline HDZ Shingles", "bundles", str(bundles)]
            else:
                shingle_row.append(str(bundles))
        materials_data.append(shingle_row)

        # Underlayment (1000 sqft per roll)
        for waste in WASTE_FACTORS:
            factor = 1 + (waste / 100)
            rolls = math.ceil((total_area * factor) / 1000)
            if waste == 0:
                underlayment_row = ["GAF FeltBuster Underlayment", "rolls", str(rolls)]
            else:
                underlayment_row.append(str(rolls))
        materials_data.append(underlayment_row)

        # Starter (120 lf per bundle)
        for waste in WASTE_FACTORS:
            factor = 1 + (waste / 100)
            bundles = math.ceil((eave * factor) / 120)
            if waste == 0:
                starter_row = ["GAF Pro-Start Starter", "bundles", str(bundles)]
            else:
                starter_row.append(str(bundles))
        materials_data.append(starter_row)

        # Ridge cap (25 lf per bundle)
        for waste in WASTE_FACTORS:
            factor = 1 + (waste / 100)
            bundles = math.ceil((ridge_hip * factor) / 25)
            if waste == 0:
                ridge_row = ["GAF Seal-A-Ridge Cap", "bundles", str(bundles)]
            else:
                ridge_row.append(str(bundles))
        materials_data.append(ridge_row)

        # Ice & water (200 sqft per roll, used at eaves + valleys)
        ice_water_area = (eave * 3) + (valley * 3)  # 3ft wide at eaves and valleys
        for waste in WASTE_FACTORS:
            factor = 1 + (waste / 100)
            rolls = math.ceil((ice_water_area * factor) / 200)
            if waste == 0:
                iw_row = ["GAF WeatherWatch Ice & Water", "rolls", str(rolls)]
            else:
                iw_row.append(str(rolls))
        materials_data.append(iw_row)

        # Drip edge (10 ft per piece)
        for waste in WASTE_FACTORS:
            factor = 1 + (waste / 100)
            pieces = math.ceil((drip_edge * factor) / 10)
            if waste == 0:
                drip_row = ["Drip Edge (2x2)", "pieces", str(pieces)]
            else:
                drip_row.append(str(pieces))
        materials_data.append(drip_row)

        col_widths = [2.5*inch, 0.8*inch] + [1*inch] * len(WASTE_FACTORS)
        materials_table = Table(materials_data, colWidths=col_widths)
        materials_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
            ("TEXTCOLOR", (0, 0), (-1, 0), COLORS["white"]),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["background"]]),
        ]))
        elements.append(materials_table)

        elements.append(Spacer(1, 12))
        elements.append(Paragraph(
            "<b>Note:</b> 15-20% waste is typical for standard roofs. Use 25% for complex roofs "
            "with many hips, valleys, or dormers. Quantities should be verified on-site.",
            self.styles["small"]
        ))

        return elements

    def _build_ventilation_page(self, measurements: Dict[str, Any]) -> List:
        """Build attic vents page with ventilation recommendations"""
        elements = []

        elements.append(Paragraph("Attic Ventilation", self.styles["page_title"]))
        elements.append(HRFlowable(width="100%", thickness=2, color=COLORS["primary"], spaceAfter=12))

        elements.append(Paragraph(
            "Proper attic ventilation is critical for roof longevity and energy efficiency. "
            "The 1/150 rule requires 1 sq ft of NFA (Net Free Area) per 150 sq ft of attic floor.",
            self.styles["body"]
        ))
        elements.append(Spacer(1, 12))

        # Calculate ventilation requirements
        total_area = measurements.get("total_area_sqft", 0)
        # Rough attic floor estimate (total roof area / pitch factor)
        pitch_factor = measurements.get("pitch_factor", 1.118)
        attic_floor_estimate = total_area / pitch_factor

        # NFA requirements (1/150 rule)
        required_nfa_sqft = attic_floor_estimate / 150
        required_nfa_sqin = required_nfa_sqft * 144

        # Split 50/50 intake/exhaust
        intake_nfa = required_nfa_sqin / 2
        exhaust_nfa = required_nfa_sqin / 2

        elements.append(Paragraph("Ventilation Requirements", self.styles["section_header"]))

        vent_data = [
            ["Metric", "Value"],
            ["Estimated Attic Floor Area", f"{attic_floor_estimate:,.0f} sq ft"],
            ["Required Total NFA (1/150 rule)", f"{required_nfa_sqin:,.0f} sq in"],
            ["Required Intake NFA (50%)", f"{intake_nfa:,.0f} sq in"],
            ["Required Exhaust NFA (50%)", f"{exhaust_nfa:,.0f} sq in"],
        ]

        vent_table = Table(vent_data, colWidths=[3.5*inch, 3*inch])
        vent_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["secondary"]),
            ("TEXTCOLOR", (0, 0), (-1, 0), COLORS["white"]),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ALIGN", (1, 1), (1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
        ]))
        elements.append(vent_table)

        elements.append(Spacer(1, 12))

        # Ventilation product options
        elements.append(Paragraph("Recommended Products", self.styles["section_header"]))

        ridge_length = measurements.get("ridge", {}).get("length_ft", 0)

        # Ridge vent recommendation (18 sq in NFA per linear foot typically)
        ridge_vent_nfa_per_ft = 18
        ridge_vent_nfa_total = ridge_length * ridge_vent_nfa_per_ft

        products_data = [
            ["Product", "Quantity", "NFA Provided"],
            [f"GAF Cobra Ridge Vent ({ridge_length:.0f} ft ridge)",
             f"{math.ceil(ridge_length / 4)} pcs (4ft each)",
             f"{ridge_vent_nfa_total:,.0f} sq in"],
            ["GAF Cobra Exhaust Vent",
             f"{math.ceil(exhaust_nfa / 18)} pcs",
             f"{math.ceil(exhaust_nfa / 18) * 18} sq in"],
            ["Soffit Vents (for intake)",
             "Per existing soffit",
             f"{intake_nfa:,.0f} sq in needed"],
        ]

        products_table = Table(products_data, colWidths=[3*inch, 2*inch, 1.5*inch])
        products_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["accent"]),
            ("TEXTCOLOR", (0, 0), (-1, 0), COLORS["white"]),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
        ]))
        elements.append(products_table)

        return elements

    def _build_fortified_page(self, measurements: Dict[str, Any]) -> List:
        """Build FORTIFIED materials page for hurricane/wind resistance"""
        elements = []

        elements.append(Paragraph("FORTIFIED Roof Materials", self.styles["page_title"]))
        elements.append(HRFlowable(width="100%", thickness=2, color=COLORS["primary"], spaceAfter=12))

        elements.append(Paragraph(
            "FORTIFIED Home is an insurance-backed program that strengthens homes against "
            "hurricanes, high winds, and severe weather. FORTIFIED Roof designation requires "
            "specific materials and installation techniques.",
            self.styles["body"]
        ))
        elements.append(Spacer(1, 12))

        # FORTIFIED requirements
        elements.append(Paragraph("FORTIFIED Roof Requirements", self.styles["section_header"]))

        requirements = [
            "Sealed roof deck with approved tape or peel-and-stick underlayment",
            "Enhanced nailing pattern (6 nails per shingle, ring-shank nails)",
            "Class H (high wind) shingles rated for 130+ mph",
            "Drip edge at eaves and rakes secured every 4 inches",
            "Ridge cap shingles with enhanced attachment",
        ]

        for req in requirements:
            elements.append(Paragraph(f"- {req}", self.styles["body"]))

        elements.append(Spacer(1, 12))

        # FORTIFIED materials table
        elements.append(Paragraph("FORTIFIED Material Quantities", self.styles["section_header"]))

        total_area = measurements.get("total_area_sqft", 0)
        squares = measurements.get("roof_squares", 0)
        drip_edge = measurements.get("drip_edge", {}).get("length_ft", 0)

        # Calculate at 20% waste
        waste_factor = 1.20

        fortified_data = [
            ["Material", "Quantity (20% waste)", "Unit"],
            ["GAF Timberline HDZ (FORTIFIED)", str(math.ceil(squares * 3 * waste_factor)), "bundles"],
            ["GAF Deck-Armor (full coverage)", str(math.ceil((total_area * waste_factor) / 400)), "rolls"],
            ["FORTIFIED Roof Deck Tape", str(math.ceil((total_area * 0.1 * waste_factor) / 75)), "rolls"],
            ["Ring-Shank Nails (1.25\")", str(math.ceil((total_area * waste_factor) / 32)), "lbs"],
            ["Drip Edge (secured 4\" OC)", str(math.ceil((drip_edge * waste_factor) / 10)), "pieces"],
        ]

        fortified_table = Table(fortified_data, colWidths=[3*inch, 2*inch, 1.5*inch])
        fortified_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["header_bg"]),
            ("TEXTCOLOR", (0, 0), (-1, 0), COLORS["white"]),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["background"]]),
        ]))
        elements.append(fortified_table)

        elements.append(Spacer(1, 12))
        elements.append(Paragraph(
            "<b>Important:</b> FORTIFIED designation requires inspection by an approved evaluator. "
            "Contact IBHS (Insurance Institute for Business & Home Safety) for certification requirements.",
            self.styles["small"]
        ))

        return elements

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _create_metric_cell(self, value: str, label: str) -> Table:
        """Create a metric display cell for cover page"""
        cell_data = [
            [Paragraph(value, self.styles["metric_value"])],
            [Paragraph(label, self.styles["metric_label"])],
        ]

        cell_table = Table(cell_data, colWidths=[1.75*inch])
        cell_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))

        return cell_table

    def _create_summary_table(self, data: List[List[str]]) -> Table:
        """Create a standard two-column summary table"""
        table = Table(data, colWidths=[3*inch, 3.5*inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), COLORS["background"]),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["light_text"]),
        ]))
        return table

    def _build_edge_legend(self) -> Table:
        """Build color legend for edge types"""
        legend_data = []
        row = []

        for edge_type, hex_color in EDGE_COLORS.items():
            label = edge_type.replace("_", " ").title()
            row.append(Paragraph(
                f'<font color="{hex_color}">&#9632;</font> {label}',
                self.styles["small"]
            ))

            if len(row) == 3:
                legend_data.append(row)
                row = []

        if row:
            while len(row) < 3:
                row.append("")
            legend_data.append(row)

        if legend_data:
            table = Table(legend_data, colWidths=[2.2*inch]*3)
            table.setStyle(TableStyle([
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            return table

        return Spacer(1, 0)

    def _format_address(self, address: Dict[str, Any]) -> str:
        """Format address dict as single line"""
        parts = []

        if address.get("street"):
            parts.append(address["street"])

        city_state = []
        if address.get("city"):
            city_state.append(address["city"])
        if address.get("state"):
            city_state.append(address["state"])
        if address.get("zip") or address.get("postal_code"):
            city_state.append(address.get("zip") or address.get("postal_code"))

        if city_state:
            parts.append(", ".join(city_state))

        return ", ".join(parts) if parts else "Address not provided"

    def _get_confidence_color(self, confidence: str) -> str:
        """Get hex color for confidence level"""
        conf = confidence.upper() if isinstance(confidence, str) else "NONE"

        if conf == "HIGH":
            return "#22C55E"  # Green
        elif conf in ["ESTIMATED", "MEDIUM"]:
            return "#EAB308"  # Yellow
        else:
            return "#EF4444"  # Red

    def _degrees_to_direction(self, degrees: float) -> str:
        """Convert degrees to compass direction"""
        directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        index = round(degrees / 45) % 8
        return directions[index]

    def _add_page_decorations(self, canvas, doc):
        """Add page number and footer to each page"""
        canvas.saveState()

        # Page number
        page_num = doc.page
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(COLORS["light_text"])
        canvas.drawRightString(
            doc.pagesize[0] - 0.5*inch,
            0.5*inch,
            f"Page {page_num}"
        )

        # Footer line
        canvas.setStrokeColor(COLORS["light_text"])
        canvas.setLineWidth(0.5)
        canvas.line(0.5*inch, 0.6*inch, doc.pagesize[0] - 0.5*inch, 0.6*inch)

        # Company name in footer
        canvas.setFont("Helvetica", 7)
        canvas.drawString(0.5*inch, 0.4*inch, f"{self.config.company_name} | {self.config.company_phone}")

        canvas.restoreState()


# =============================================================================
# LAMBDA HANDLER
# =============================================================================

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler for GAF-style report generation.

    Event format:
    {
        "measurements": {...},     # RoofMeasurements from measurement_calculator
        "address": {...},          # Property address
        "latitude": float,         # Property latitude (for imagery)
        "longitude": float,        # Property longitude (for imagery)
        "imagery_base64": str,     # Optional pre-fetched imagery
        "config": {...}            # Optional ReportConfig overrides
    }
    """
    measurements = event.get("measurements")
    if not measurements:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "measurements required"})
        }

    address = event.get("address", {})
    latitude = event.get("latitude")
    longitude = event.get("longitude")

    # Decode pre-fetched imagery if provided
    imagery_data = None
    if event.get("imagery_base64"):
        try:
            imagery_data = base64.b64decode(event["imagery_base64"])
        except Exception as e:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": f"Invalid imagery_base64: {e}"})
            }

    # Create config with any overrides
    config_overrides = event.get("config", {})
    config = ReportConfig(**config_overrides) if config_overrides else ReportConfig()

    try:
        generator = GAFStyleReportGenerator(config)
        pdf_bytes = generator.generate_report(
            measurements=measurements,
            address=address,
            latitude=latitude,
            longitude=longitude,
            imagery_data=imagery_data,
        )

        # Upload PDF to S3
        s3_bucket = os.environ.get("S3_BUCKET", "panda-crm-documents")
        s3_prefix = os.environ.get("S3_PREFIX", "roof-reports")

        # Generate unique filename with timestamp and job ID if available
        job_id = event.get("job_id") or event.get("opportunity_id") or str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        s3_key = f"{s3_prefix}/{timestamp}-{job_id}.pdf"

        # Upload to S3
        s3_client = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-2"))

        try:
            s3_client.put_object(
                Bucket=s3_bucket,
                Key=s3_key,
                Body=pdf_bytes,
                ContentType="application/pdf",
                ContentDisposition=f'inline; filename="roof-report-{job_id}.pdf"',
            )

            # Generate presigned URL (valid for 7 days)
            report_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": s3_bucket, "Key": s3_key},
                ExpiresIn=604800,  # 7 days
            )

        except ClientError as e:
            # If S3 upload fails, fall back to returning base64
            print(f"S3 upload failed: {e}, falling back to base64 response")
            pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/pdf"},
                "body": json.dumps({
                    "success": True,
                    "pdf_base64": pdf_base64,
                    "pdf_size_bytes": len(pdf_bytes),
                    "page_count": 14,
                    "s3_error": str(e),
                })
            }

        # Return both URL and base64 for flexibility
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/pdf"},
            "body": json.dumps({
                "success": True,
                "report_url": report_url,
                "s3_bucket": s3_bucket,
                "s3_key": s3_key,
                "pdf_base64": pdf_base64,
                "pdf_size_bytes": len(pdf_bytes),
                "page_count": 14,
            })
        }

    except Exception as e:
        import traceback
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": str(e),
                "traceback": traceback.format_exc()
            })
        }


# =============================================================================
# LOCAL TESTING
# =============================================================================

def generate_sample_report(output_path: str = "/tmp/gaf_style_roof_report.pdf"):
    """Generate a sample GAF-style report for testing"""

    # Sample measurements matching the calculator output format
    sample_measurements = {
        "total_area_sqft": 2638.95 * 100,  # Convert squares to sqft
        "roof_squares": 26.39,
        "predominant_pitch": "12/12",
        "pitch_degrees": 45.0,
        "pitch_factor": 1.414,
        "facet_count": 8,
        "facets": [
            {"facet_id": 0, "area_sqft": 383.6, "pitch": 45.0, "aspect": 90.0, "edge_count": 9},
            {"facet_id": 1, "area_sqft": 1198.8, "pitch": 45.0, "aspect": 192.4, "edge_count": 13},
            {"facet_id": 2, "area_sqft": 226.8, "pitch": 45.0, "aspect": 249.4, "edge_count": 11},
            {"facet_id": 3, "area_sqft": 1191.9, "pitch": 45.0, "aspect": 9.2, "edge_count": 11},
            {"facet_id": 4, "area_sqft": 339.5, "pitch": 45.0, "aspect": 17.5, "edge_count": 10},
            {"facet_id": 5, "area_sqft": 396.6, "pitch": 45.0, "aspect": 22.6, "edge_count": 10},
            {"facet_id": 6, "area_sqft": 298.7, "pitch": 45.0, "aspect": 114.3, "edge_count": 10},
            {"facet_id": 7, "area_sqft": 456.2, "pitch": 45.0, "aspect": 251.6, "edge_count": 8},
        ],
        "ridge": {"length_ft": 210.2, "confidence": "HIGH", "source": "edge_detection"},
        "hip": {"length_ft": 346.8, "confidence": "HIGH", "source": "edge_detection"},
        "valley": {"length_ft": 29.9, "confidence": "HIGH", "source": "edge_detection"},
        "eave": {"length_ft": 161.4, "confidence": "HIGH", "source": "edge_detection"},
        "rake": {"length_ft": 285.6, "confidence": "HIGH", "source": "edge_detection"},
        "drip_edge": {"length_ft": 446.9, "confidence": "ESTIMATED", "source": "calculated"},
        "starter": {"length_ft": 161.4, "confidence": "ESTIMATED", "source": "calculated"},
        "step_flashing": {"length_ft": 0.0, "confidence": "NONE", "source": "estimated"},
        "chimneys": 1,
        "skylights": 2,
        "vents": 4,
        "pipes": 3,
        "recommended_shingles_squares": 30.3,
        "recommended_underlayment_sqft": 2902.9,
        "recommended_ridge_cap_lf": 612.7,
        "recommended_starter_lf": 177.5,
        "recommended_drip_edge_lf": 491.6,
        "recommended_ice_water_lf": 210.4,
        "overall_confidence": 0.85,
        "data_sources": ["Google Maps Satellite Imagery", "ML Edge Detection"],
        "warnings": [
            "Measurements based on aerial imagery analysis.",
            "On-site verification recommended before ordering materials.",
        ],
    }

    sample_address = {
        "street": "123 Main Street",
        "city": "Baltimore",
        "state": "MD",
        "zip": "21201",
    }

    # Sample coordinates (Baltimore, MD)
    lat, lng = 39.2904, -76.6122

    generator = GAFStyleReportGenerator()
    pdf_bytes = generator.generate_report(
        measurements=sample_measurements,
        address=sample_address,
        latitude=lat,
        longitude=lng,
        output_path=output_path,
    )

    print(f"GAF-style report generated: {output_path}")
    print(f"PDF size: {len(pdf_bytes):,} bytes")

    return pdf_bytes


if __name__ == "__main__":
    print("GAF QuickMeasure-Style Report Generator")
    print(f"ReportLab available: {HAS_REPORTLAB}")
    print(f"Pillow available: {HAS_PIL}")

    if HAS_REPORTLAB:
        generate_sample_report()
    else:
        print("Install reportlab to generate PDFs: pip install reportlab")
