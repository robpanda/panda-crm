"""
Roof Segmentation and Edge Detection Module

Uses open-source ML models to extract roof geometry from aerial imagery.
Based on research from:
- tudelft3d/Roofline-extraction-from-orthophotos
- loosgagnet/Roofline-Extraction

This module provides:
1. Roof boundary detection
2. Edge classification (ridge, hip, valley, eave, rake)
3. Facet segmentation
4. Pitch estimation
"""

import os
import json
import math
import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass, asdict
from enum import Enum
from io import BytesIO

try:
    from PIL import Image, ImageDraw, ImageFilter
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


class EdgeType(str, Enum):
    """Types of roof edges"""
    RIDGE = "ridge"       # Top edge where two facets meet
    HIP = "hip"           # Sloped edge going down from ridge
    VALLEY = "valley"     # Inward corner between facets
    EAVE = "eave"         # Bottom horizontal edge
    RAKE = "rake"         # Sloped side edge
    STEP_FLASHING = "step_flashing"  # Edge against wall
    UNKNOWN = "unknown"


@dataclass
class RoofEdge:
    """Represents a detected roof edge"""
    edge_type: EdgeType
    start_point: Tuple[float, float]  # (x, y) in image coords
    end_point: Tuple[float, float]
    length_pixels: float
    confidence: float
    geo_start: Optional[Tuple[float, float]] = None  # (lat, lon)
    geo_end: Optional[Tuple[float, float]] = None


@dataclass
class RoofFacet:
    """Represents a roof facet/plane"""
    facet_id: int
    vertices: List[Tuple[float, float]]  # Polygon vertices
    area_pixels: float
    pitch_degrees: Optional[float]
    aspect_degrees: Optional[float]  # Direction facet faces (0=N, 90=E, etc)
    edges: List[RoofEdge]


@dataclass
class RoofSegmentationResult:
    """Complete roof segmentation result"""
    facets: List[RoofFacet]
    edges: List[RoofEdge]
    total_area_pixels: float
    bounding_box: Tuple[float, float, float, float]  # x, y, width, height
    confidence: float
    processing_time_ms: float


class RoofSegmenter:
    """
    Segments roof structures from aerial imagery.

    Uses traditional computer vision techniques with optional ML enhancement.
    Works without GPU for basic segmentation.
    """

    def __init__(self, use_ml: bool = False):
        self.use_ml = use_ml

        # Color ranges for roof detection (HSV)
        # Widened ranges for better detection while relying on max_facet_area_ratio
        # to filter out false positives (roads, concrete, etc.)
        # HSV format: H (0-180), S (0-255), V (0-255)
        self.roof_color_ranges = [
            # Gray roofs (asphalt shingles) - widened for better detection
            # Low saturation, broad value range to catch light and medium grays
            ((0, 0, 40), (180, 50, 180)),
            # Brown roofs - common on residential (widened hue range)
            ((8, 30, 50), (30, 220, 200)),
            # Dark roofs (black/dark gray) - widened value range
            ((0, 0, 15), (180, 50, 90)),
            # Red/terracotta roofs
            ((0, 60, 70), (12, 255, 230)),
            ((168, 60, 70), (180, 255, 230)),  # Red wraps around hue
            # Blue roofs (rare but exist)
            ((100, 40, 50), (135, 220, 210)),
            # Slate/blue-gray roofs
            ((95, 15, 50), (135, 100, 180)),
            # Green roofs (moss, algae, or painted)
            ((35, 30, 40), (85, 180, 180)),
        ]

        # Maximum area threshold - reject facets > 40% of total image
        # A single roof facet shouldn't cover more than 40% of the aerial view
        self.max_facet_area_ratio = 0.40

    def segment_roof(
        self,
        image_data: bytes,
        gsd_meters: float = 0.3,  # Ground sample distance
        building_footprint: Optional[List[Tuple[float, float]]] = None
    ) -> RoofSegmentationResult:
        """
        Segment roof from aerial image.

        Args:
            image_data: PNG/JPEG image bytes
            gsd_meters: Ground sample distance (meters per pixel)
            building_footprint: Optional building outline to constrain detection

        Returns:
            RoofSegmentationResult with facets and edges
        """
        import time
        start_time = time.time()

        if HAS_CV2:
            result = self._segment_with_cv2(image_data, gsd_meters, building_footprint)
        elif HAS_PIL:
            result = self._segment_with_pil(image_data, gsd_meters, building_footprint)
        else:
            raise RuntimeError("Either opencv-python or Pillow required")

        result.processing_time_ms = (time.time() - start_time) * 1000
        return result

    def _segment_with_cv2(
        self,
        image_data: bytes,
        gsd_meters: float,
        building_footprint: Optional[List[Tuple[float, float]]]
    ) -> RoofSegmentationResult:
        """OpenCV-based roof segmentation with enhanced road/roof discrimination"""
        # Decode image
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        height, width = img.shape[:2]

        # Convert to HSV for color-based segmentation
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

        # Create roof mask using color ranges
        roof_mask = np.zeros((height, width), dtype=np.uint8)
        for lower, upper in self.roof_color_ranges:
            mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
            roof_mask = cv2.bitwise_or(roof_mask, mask)

        # Apply morphological operations to clean up mask
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        roof_mask = cv2.morphologyEx(roof_mask, cv2.MORPH_CLOSE, kernel)
        roof_mask = cv2.morphologyEx(roof_mask, cv2.MORPH_OPEN, kernel)

        # ENHANCEMENT: Use edge detection to find internal structure
        # Roads are typically smooth; roofs have ridges and edges
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)

        # Dilate edges to create edge regions
        edge_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edge_dilated = cv2.dilate(edges, edge_kernel, iterations=2)

        # ENHANCEMENT: Use edges to split large contiguous regions
        # This helps separate roads from buildings
        # Invert edges to create watershed markers
        edge_boundaries = cv2.dilate(edges, edge_kernel, iterations=1)

        # If building footprint provided, mask to that area
        if building_footprint:
            footprint_mask = np.zeros((height, width), dtype=np.uint8)
            pts = np.array(building_footprint, dtype=np.int32)
            cv2.fillPoly(footprint_mask, [pts], 255)
            roof_mask = cv2.bitwise_and(roof_mask, footprint_mask)

        # Find contours (roof outlines)
        contours, _ = cv2.findContours(
            roof_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        # Filter contours by size - must be reasonable for a roof facet
        min_area = (10 / gsd_meters) ** 2  # At least 10m² roof area
        max_area = width * height * self.max_facet_area_ratio  # No facet can be >40% of image

        valid_contours = []
        for c in contours:
            area = cv2.contourArea(c)

            # Skip if too small
            if area < min_area:
                continue

            # If contour is too large, try to split it using edges
            if area > max_area:
                # Create a mask for this contour
                contour_mask = np.zeros((height, width), dtype=np.uint8)
                cv2.drawContours(contour_mask, [c], 0, 255, -1)

                # Use edges to split - subtract edge regions from the mask
                split_mask = cv2.subtract(contour_mask, edge_boundaries)

                # Find new contours after splitting
                sub_contours, _ = cv2.findContours(
                    split_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
                )

                # Add valid sub-contours
                for sc in sub_contours:
                    sc_area = cv2.contourArea(sc)
                    if min_area <= sc_area <= max_area:
                        # Additional check: roof structures should be somewhat compact
                        # Calculate compactness (circularity)
                        perimeter = cv2.arcLength(sc, True)
                        if perimeter > 0:
                            compactness = 4 * math.pi * sc_area / (perimeter * perimeter)
                            # Roofs are typically compact (0.3-1.0)
                            # Roads are typically elongated (low compactness)
                            if compactness > 0.15:
                                valid_contours.append(sc)
            else:
                # Check compactness for normal-sized contours too
                perimeter = cv2.arcLength(c, True)
                if perimeter > 0:
                    compactness = 4 * math.pi * area / (perimeter * perimeter)
                    if compactness > 0.1:  # Less strict for smaller contours
                        valid_contours.append(c)
                else:
                    valid_contours.append(c)

        if not valid_contours:
            # No roof found - return empty result
            return RoofSegmentationResult(
                facets=[],
                edges=[],
                total_area_pixels=0,
                bounding_box=(0, 0, width, height),
                confidence=0.0,
                processing_time_ms=0
            )

        # Process each contour as a facet
        facets = []
        all_edges = []

        for i, contour in enumerate(valid_contours):
            # Simplify contour to polygon
            epsilon = 0.02 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)

            vertices = [(float(p[0][0]), float(p[0][1])) for p in approx]
            area = cv2.contourArea(contour)

            # Detect edges and classify them
            edges = self._classify_edges(vertices, img, gsd_meters)
            all_edges.extend(edges)

            facets.append(RoofFacet(
                facet_id=i,
                vertices=vertices,
                area_pixels=area,
                pitch_degrees=self._estimate_pitch_from_shadows(img, contour),
                aspect_degrees=self._estimate_aspect(vertices),
                edges=edges
            ))

        # Calculate total area and bounding box
        total_area = sum(f.area_pixels for f in facets)
        all_points = [p for f in facets for p in f.vertices]
        xs = [p[0] for p in all_points]
        ys = [p[1] for p in all_points]
        bbox = (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))

        return RoofSegmentationResult(
            facets=facets,
            edges=all_edges,
            total_area_pixels=total_area,
            bounding_box=bbox,
            confidence=self._calculate_confidence(facets, roof_mask),
            processing_time_ms=0
        )

    def _segment_with_pil(
        self,
        image_data: bytes,
        gsd_meters: float,
        building_footprint: Optional[List[Tuple[float, float]]]
    ) -> RoofSegmentationResult:
        """Pillow-based roof segmentation (fallback when OpenCV not available)"""
        img = Image.open(BytesIO(image_data))
        width, height = img.size

        # Convert to grayscale for edge detection
        gray = img.convert('L')

        # Apply edge detection filter
        edges = gray.filter(ImageFilter.FIND_EDGES)

        # Simple thresholding to find roof boundaries
        threshold = 50
        binary = edges.point(lambda x: 255 if x > threshold else 0)

        # This is a simplified version - in production, use OpenCV
        # For now, return a single facet based on the entire image

        facets = [RoofFacet(
            facet_id=0,
            vertices=[(0, 0), (width, 0), (width, height), (0, height)],
            area_pixels=width * height * 0.6,  # Estimate 60% roof coverage
            pitch_degrees=25,  # Default estimate
            aspect_degrees=0,
            edges=[]
        )]

        return RoofSegmentationResult(
            facets=facets,
            edges=[],
            total_area_pixels=facets[0].area_pixels,
            bounding_box=(0, 0, width, height),
            confidence=0.5,  # Lower confidence for PIL-based
            processing_time_ms=0
        )

    def _classify_edges(
        self,
        vertices: List[Tuple[float, float]],
        img: np.ndarray,
        gsd_meters: float
    ) -> List[RoofEdge]:
        """
        Classify edges between vertices.

        Roofing terminology:
        - RIDGE: Horizontal edge at the top where two roof planes meet
        - EAVE: Horizontal edge at the bottom (gutter line)
        - RAKE: Sloped/diagonal edge along gable ends (sides of triangular gable)
        - HIP: Sloped ridge where two roof planes meet at external corner
        - VALLEY: Sloped trough where two roof planes meet at internal corner
        """
        edges = []
        n = len(vertices)
        height, width = img.shape[:2]

        # Calculate centroid of the roof polygon
        center_x = sum(v[0] for v in vertices) / n
        center_y = sum(v[1] for v in vertices) / n

        # Calculate polygon bounds for relative positioning
        xs = [v[0] for v in vertices]
        ys = [v[1] for v in vertices]
        poly_min_x, poly_max_x = min(xs), max(xs)
        poly_min_y, poly_max_y = min(ys), max(ys)
        poly_height = poly_max_y - poly_min_y
        poly_width = poly_max_x - poly_min_x

        # Pre-calculate edge properties for relative positioning
        edge_data = []
        for i in range(n):
            start = vertices[i]
            end = vertices[(i + 1) % n]
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            length = math.sqrt(dx*dx + dy*dy)
            angle = math.degrees(math.atan2(dy, dx)) % 180
            avg_x = (start[0] + end[0]) / 2
            avg_y = (start[1] + end[1]) / 2
            edge_data.append({
                'start': start, 'end': end, 'dx': dx, 'dy': dy,
                'length': length, 'angle': angle, 'avg_x': avg_x, 'avg_y': avg_y
            })

        for i, ed in enumerate(edge_data):
            start = ed['start']
            end = ed['end']
            dx, dy = ed['dx'], ed['dy']
            length = ed['length']
            angle = ed['angle']
            avg_x, avg_y = ed['avg_x'], ed['avg_y']

            # Determine position relative to POLYGON bounds (not image bounds)
            # This is key for detecting eaves even when roof is at top of image
            rel_y = (avg_y - poly_min_y) / poly_height if poly_height > 0 else 0.5
            rel_x = (avg_x - poly_min_x) / poly_width if poly_width > 0 else 0.5

            # Also check image-relative position for context
            is_at_left = avg_x < width * 0.25
            is_at_right = avg_x > width * 0.75
            is_at_perimeter = is_at_left or is_at_right

            # Check if this is near the polygon edge (top 20% or bottom 20%)
            is_at_poly_top = rel_y < 0.25
            is_at_poly_bottom = rel_y > 0.75

            # Is edge near polygon sides (left/right 20%)?
            is_at_poly_left = rel_x < 0.25
            is_at_poly_right = rel_x > 0.75
            is_at_poly_side = is_at_poly_left or is_at_poly_right

            # Classify based on angle and position
            is_horizontal = abs(angle) < 25 or abs(angle - 180) < 25
            is_vertical = 65 < angle < 115  # Near vertical

            if is_horizontal:
                # Near horizontal edges - ridge or eave
                if is_at_poly_bottom:
                    # Bottom of polygon = EAVE (gutter line)
                    edge_type = EdgeType.EAVE
                elif is_at_poly_top:
                    # Top of polygon = RIDGE
                    edge_type = EdgeType.RIDGE
                else:
                    # Horizontal edge in middle - compare to center
                    if avg_y > center_y:
                        edge_type = EdgeType.EAVE
                    else:
                        edge_type = EdgeType.RIDGE

            elif is_vertical:
                # Near vertical edges - typically HIP in aerial view
                edge_type = EdgeType.HIP

            else:
                # Diagonal edges - distinguish rake, hip, valley
                if is_at_perimeter or is_at_poly_side:
                    # Diagonal edge at perimeter = RAKE (gable edge)
                    edge_type = EdgeType.RAKE
                else:
                    # Diagonal edge in interior
                    to_edge_x = avg_x - center_x
                    to_edge_y = avg_y - center_y
                    cross = dx * to_edge_y - dy * to_edge_x

                    # Long diagonal edges at sides are rakes
                    if length > poly_height * 0.4:
                        edge_type = EdgeType.RAKE
                    elif abs(cross) < length * 10:
                        # Edge roughly parallel to center vector - valley
                        edge_type = EdgeType.VALLEY
                    else:
                        # Edge perpendicular to center vector - hip
                        edge_type = EdgeType.HIP

            # Calculate confidence based on how clearly the edge matches criteria
            confidence = 0.7
            if is_horizontal and (is_at_poly_top or is_at_poly_bottom):
                confidence = 0.85  # High confidence for clear ridge/eave
            elif is_at_perimeter:
                confidence = 0.75

            edges.append(RoofEdge(
                edge_type=edge_type,
                start_point=start,
                end_point=end,
                length_pixels=length,
                confidence=confidence
            ))

        return edges

    def _estimate_pitch_from_shadows(
        self,
        img: np.ndarray,
        contour: np.ndarray
    ) -> Optional[float]:
        """
        Estimate roof pitch from shadow analysis.

        This is a simplified approach - actual pitch estimation requires
        stereo imagery or LiDAR data for accuracy.
        """
        # Create mask for this facet
        mask = np.zeros(img.shape[:2], dtype=np.uint8)
        cv2.drawContours(mask, [contour], 0, 255, -1)

        # Extract region
        roi = cv2.bitwise_and(img, img, mask=mask)

        # Analyze brightness gradient
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        # Calculate gradient
        grad_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        avg_gradient = np.mean(np.abs(grad_y[mask > 0]))

        # Map gradient to pitch estimate (very rough)
        # Higher gradient suggests steeper pitch
        estimated_pitch = min(45, max(5, avg_gradient * 2))

        return float(estimated_pitch)

    def _estimate_aspect(self, vertices: List[Tuple[float, float]]) -> float:
        """Estimate which direction the facet faces (aspect)"""
        if len(vertices) < 3:
            return 0

        # Find the longest edge - this is often the eave
        # The facet faces perpendicular to the eave
        max_length = 0
        max_angle = 0

        n = len(vertices)
        for i in range(n):
            dx = vertices[(i+1) % n][0] - vertices[i][0]
            dy = vertices[(i+1) % n][1] - vertices[i][1]
            length = math.sqrt(dx*dx + dy*dy)

            if length > max_length:
                max_length = length
                max_angle = math.degrees(math.atan2(dy, dx))

        # Perpendicular to longest edge
        aspect = (max_angle + 90) % 360
        return aspect

    def _calculate_confidence(
        self,
        facets: List[RoofFacet],
        mask: np.ndarray
    ) -> float:
        """Calculate overall confidence in the segmentation"""
        if not facets:
            return 0.0

        # Factors affecting confidence:
        # 1. Facet count factor - having 1-6 facets is typical for residential
        facet_count = len(facets)
        if 1 <= facet_count <= 6:
            facet_factor = 0.8 + (0.2 * (1 - abs(facet_count - 3) / 3))  # Optimal around 3 facets
        elif facet_count < 10:
            facet_factor = 0.5
        else:
            facet_factor = 0.3  # Too many facets suggests noise

        # 2. Regularity of facet shapes (3-6 vertices is typical for roof facets)
        regularity = 0
        for facet in facets:
            verts = len(facet.vertices)
            if 3 <= verts <= 6:
                regularity += 1.0
            elif verts <= 8:
                regularity += 0.7
            else:
                regularity += 0.4
        regularity = regularity / len(facets) if facets else 0

        # 3. Total detected area is reasonable (5-40% of image for a typical aerial view)
        total_area = sum(f.area_pixels for f in facets)
        coverage_ratio = total_area / mask.size
        if 0.02 <= coverage_ratio <= 0.40:
            size_factor = 0.8 + (0.2 * min(1.0, coverage_ratio / 0.15))  # Optimal around 15%
        elif coverage_ratio < 0.02:
            size_factor = coverage_ratio / 0.02 * 0.5  # Very small = low confidence
        else:
            size_factor = 0.4  # Too large = possible false positive

        # 4. Edge detection quality - check if we found ridge/eave edges
        edge_types = set()
        for facet in facets:
            for edge in facet.edges:
                edge_types.add(edge.edge_type)
        edge_diversity = min(1.0, len(edge_types) / 3)  # Having multiple edge types is good
        edge_factor = 0.6 + (0.4 * edge_diversity)

        # Weighted average - adjusted for better scores
        confidence = (facet_factor * 0.25 + regularity * 0.25 + size_factor * 0.25 + edge_factor * 0.25)
        return min(1.0, max(0.1, confidence))  # Minimum 0.1 if we found something


def to_json_serializable(obj: Any) -> Any:
    """Convert dataclasses and enums to JSON-serializable dicts"""
    if hasattr(obj, '__dataclass_fields__'):
        return {k: to_json_serializable(v) for k, v in asdict(obj).items()}
    elif isinstance(obj, Enum):
        return obj.value
    elif isinstance(obj, list):
        return [to_json_serializable(item) for item in obj]
    elif isinstance(obj, tuple):
        return list(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.float64, np.float32)):
        return float(obj)
    return obj


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler for roof segmentation.

    Event format:
    {
        "image_base64": str,  # Base64 encoded image
        "gsd_meters": float,  # Optional, default 0.3
        "building_footprint": [[x,y], ...]  # Optional polygon
    }
    """
    import base64

    image_b64 = event.get("image_base64")
    if not image_b64:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "image_base64 required"})
        }

    try:
        image_data = base64.b64decode(image_b64)
    except Exception as e:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": f"Invalid base64: {e}"})
        }

    # NAIP imagery is typically 1.0m/pixel resolution
    gsd = event.get("gsd_meters", 1.0)
    footprint = event.get("building_footprint")

    segmenter = RoofSegmenter()

    try:
        result = segmenter.segment_roof(image_data, gsd, footprint)

        return {
            "statusCode": 200,
            "body": json.dumps({
                "success": True,
                "segmentation": to_json_serializable(result)
            })
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }


if __name__ == "__main__":
    # Test with a sample image
    print("Roof Segmenter initialized")
    print(f"OpenCV available: {HAS_CV2}")
    print(f"Pillow available: {HAS_PIL}")
