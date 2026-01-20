"""
Roof Measurement Calculator

Converts segmented roof geometry into construction-ready measurements:
- Total roof area (square feet)
- Roof squares (area / 100)
- Linear measurements (ridge, hip, valley, eave, rake, drip edge)
- Recommended material quantities with waste factors

This module takes the output of roof_segmenter.py and produces
measurements comparable to EagleView or GAF QuickMeasure reports.
"""

import math
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass, asdict
from enum import Enum


class PitchNotation(str, Enum):
    """Pitch notation formats"""
    RATIO = "ratio"      # e.g., "6/12"
    DEGREES = "degrees"  # e.g., "26.57°"
    PERCENTAGE = "percentage"  # e.g., "50%"


@dataclass
class LinearMeasurement:
    """A linear measurement with confidence"""
    length_ft: float
    confidence: str  # HIGH, ESTIMATED, NONE
    source: str  # edge_detection, calculated, google_solar


@dataclass
class RoofMeasurements:
    """Complete roof measurements"""
    # Area measurements
    total_area_sqft: float
    roof_squares: float  # total_area / 100

    # Pitch information
    predominant_pitch: str  # e.g., "6/12"
    pitch_degrees: float
    pitch_factor: float  # Multiplier for flat area to get slope area

    # Facet information
    facet_count: int
    facets: List[Dict[str, Any]]

    # Linear measurements
    ridge: LinearMeasurement
    hip: LinearMeasurement
    valley: LinearMeasurement
    eave: LinearMeasurement
    rake: LinearMeasurement
    drip_edge: LinearMeasurement  # rake + eave
    starter: LinearMeasurement    # eave length
    step_flashing: LinearMeasurement

    # Feature counts
    chimneys: int
    skylights: int
    vents: int
    pipes: int

    # Derived quantities with waste factors
    recommended_shingles_squares: float
    recommended_underlayment_sqft: float
    recommended_ridge_cap_lf: float
    recommended_starter_lf: float
    recommended_drip_edge_lf: float
    recommended_ice_water_lf: float  # Usually eave + valley

    # Quality metrics
    overall_confidence: float
    data_sources: List[str]
    warnings: List[str]


class MeasurementCalculator:
    """
    Calculates construction measurements from segmented roof data.
    """

    # Waste factors for material ordering
    SHINGLE_WASTE_FACTOR = 1.15  # 15% waste
    UNDERLAYMENT_WASTE_FACTOR = 1.10  # 10% waste
    LINEAR_WASTE_FACTOR = 1.10  # 10% waste for linear materials

    # Area calibration factor to account for:
    # 1. Eave overhangs (typically 12-18 inches) not visible in aerial imagery
    # 2. Rake overhangs (typically 6-12 inches) not visible in aerial imagery
    # 3. Segmentation algorithm may slightly undercount roof area
    # Calibrated against EagleView/GAF reference measurements
    AREA_CALIBRATION_FACTOR = 1.13  # Adds ~13% to raw area calculation

    # Pitch multipliers (flat area to slope area)
    # pitch_factor = 1 / cos(pitch_degrees)
    PITCH_FACTORS = {
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
        "14/12": 1.537,
        "16/12": 1.667,
    }

    def __init__(self, gsd_meters: float = 0.3, apply_calibration: bool = True):
        """
        Initialize calculator.

        Args:
            gsd_meters: Ground sample distance (meters per pixel)
            apply_calibration: Whether to apply area calibration factor (default True)
        """
        self.apply_calibration = apply_calibration
        self.gsd_meters = gsd_meters
        self.gsd_feet = gsd_meters * 3.28084  # Convert to feet

    def calculate(
        self,
        segmentation_result: Dict[str, Any],
        solar_data: Optional[Dict[str, Any]] = None,
        elevation_data: Optional[List[List[float]]] = None
    ) -> RoofMeasurements:
        """
        Calculate measurements from segmentation result.

        Args:
            segmentation_result: Output from RoofSegmenter
            solar_data: Optional Google Solar API data for enhancement
            elevation_data: Optional elevation grid for pitch refinement

        Returns:
            RoofMeasurements with all calculated values
        """
        facets = segmentation_result.get("facets", [])
        edges = segmentation_result.get("edges", [])
        total_area_pixels = segmentation_result.get("total_area_pixels", 0)

        # Initialize data sources tracking
        data_sources = ["aerial_imagery"]
        warnings = []

        # Calculate total area in square feet
        pixels_to_sqft = self.gsd_feet ** 2
        flat_area_sqft = total_area_pixels * pixels_to_sqft

        # Determine predominant pitch
        pitch_info = self._calculate_predominant_pitch(facets, solar_data, elevation_data)

        if solar_data:
            data_sources.append("google_solar_api")

        # Apply pitch factor to get actual roof area
        pitch_factor = pitch_info["factor"]
        total_area_sqft = flat_area_sqft * pitch_factor

        # Apply calibration factor if enabled (accounts for overhangs not visible in aerial)
        if self.apply_calibration:
            total_area_sqft = total_area_sqft * self.AREA_CALIBRATION_FACTOR
            data_sources.append("calibration_applied")

        roof_squares = total_area_sqft / 100

        # Calculate linear measurements from edges
        linear = self._calculate_linear_measurements(edges, solar_data)

        # Count features
        features = self._count_features(segmentation_result, solar_data)

        # Calculate facet details
        facet_details = self._process_facets(facets, pitch_info)

        # Calculate recommended quantities with waste
        recommended = self._calculate_recommendations(
            total_area_sqft, roof_squares, linear, pitch_info
        )

        # Validate and add warnings
        warnings.extend(self._validate_measurements(
            total_area_sqft, linear, features
        ))

        # Calculate overall confidence
        confidence = self._calculate_overall_confidence(
            segmentation_result, linear, data_sources
        )

        return RoofMeasurements(
            total_area_sqft=round(total_area_sqft, 1),
            roof_squares=round(roof_squares, 2),
            predominant_pitch=pitch_info["notation"],
            pitch_degrees=round(pitch_info["degrees"], 1),
            pitch_factor=round(pitch_factor, 3),
            facet_count=len(facets),
            facets=facet_details,
            ridge=linear["ridge"],
            hip=linear["hip"],
            valley=linear["valley"],
            eave=linear["eave"],
            rake=linear["rake"],
            drip_edge=linear["drip_edge"],
            starter=linear["starter"],
            step_flashing=linear["step_flashing"],
            chimneys=features["chimneys"],
            skylights=features["skylights"],
            vents=features["vents"],
            pipes=features["pipes"],
            recommended_shingles_squares=recommended["shingles"],
            recommended_underlayment_sqft=recommended["underlayment"],
            recommended_ridge_cap_lf=recommended["ridge_cap"],
            recommended_starter_lf=recommended["starter"],
            recommended_drip_edge_lf=recommended["drip_edge"],
            recommended_ice_water_lf=recommended["ice_water"],
            overall_confidence=confidence,
            data_sources=data_sources,
            warnings=warnings
        )

    def _calculate_predominant_pitch(
        self,
        facets: List[Dict],
        solar_data: Optional[Dict],
        elevation_data: Optional[List[List[float]]]
    ) -> Dict[str, Any]:
        """Determine predominant roof pitch"""

        # Try to get pitch from solar data first (most accurate)
        if solar_data:
            segments = solar_data.get("roofSegmentStats", [])
            if segments:
                # Weight by area
                total_area = sum(s.get("area", 0) for s in segments)
                if total_area > 0:
                    weighted_pitch = sum(
                        s.get("pitchDegrees", 0) * s.get("area", 0) / total_area
                        for s in segments
                    )
                    return self._pitch_degrees_to_info(weighted_pitch)

        # Try to get from segmentation facets
        if facets:
            pitches = [f.get("pitch_degrees") for f in facets if f.get("pitch_degrees")]
            if pitches:
                avg_pitch = sum(pitches) / len(pitches)
                return self._pitch_degrees_to_info(avg_pitch)

        # Default to common residential pitch
        return self._pitch_degrees_to_info(26.57)  # 6/12

    def _pitch_degrees_to_info(self, degrees: float) -> Dict[str, Any]:
        """Convert pitch degrees to full info dict"""
        # Convert to rise/run notation
        rise = math.tan(math.radians(degrees)) * 12
        rise_rounded = round(rise)

        notation = f"{rise_rounded}/12"
        factor = 1 / math.cos(math.radians(degrees))

        return {
            "degrees": degrees,
            "notation": notation,
            "rise": rise_rounded,
            "factor": factor
        }

    def _calculate_linear_measurements(
        self,
        edges: List[Dict],
        solar_data: Optional[Dict]
    ) -> Dict[str, LinearMeasurement]:
        """Calculate linear measurements from edges"""

        # Initialize counters
        totals = {
            "ridge": 0.0,
            "hip": 0.0,
            "valley": 0.0,
            "eave": 0.0,
            "rake": 0.0,
            "step_flashing": 0.0
        }

        confidences = {k: [] for k in totals.keys()}

        # Sum up edges by type
        for edge in edges:
            edge_type = edge.get("edge_type", "unknown")
            length_pixels = edge.get("length_pixels", 0)
            conf = edge.get("confidence", 0.5)

            if edge_type in totals:
                length_ft = length_pixels * self.gsd_feet
                totals[edge_type] += length_ft
                confidences[edge_type].append(conf)

        # Try to enhance with solar data
        if solar_data:
            # Solar API doesn't provide linear measurements directly,
            # but we can estimate from segment geometry
            pass

        # Create LinearMeasurement objects
        def make_measurement(key: str) -> LinearMeasurement:
            conf_list = confidences.get(key, [])
            avg_conf = sum(conf_list) / len(conf_list) if conf_list else 0
            conf_level = "HIGH" if avg_conf > 0.7 else "ESTIMATED" if avg_conf > 0.4 else "NONE"

            return LinearMeasurement(
                length_ft=round(totals.get(key, 0), 1),
                confidence=conf_level,
                source="edge_detection" if conf_list else "estimated"
            )

        # Calculate derived measurements
        eave_ft = totals["eave"]
        rake_ft = totals["rake"]
        ridge_ft = totals["ridge"]
        hip_ft = totals["hip"]
        valley_ft = totals["valley"]

        return {
            "ridge": make_measurement("ridge"),
            "hip": make_measurement("hip"),
            "valley": make_measurement("valley"),
            "eave": make_measurement("eave"),
            "rake": make_measurement("rake"),
            "drip_edge": LinearMeasurement(
                length_ft=round(eave_ft + rake_ft, 1),
                confidence="ESTIMATED",
                source="calculated"
            ),
            "starter": LinearMeasurement(
                length_ft=round(eave_ft, 1),
                confidence="ESTIMATED",
                source="calculated"
            ),
            "step_flashing": make_measurement("step_flashing")
        }

    def _count_features(
        self,
        segmentation: Dict,
        solar_data: Optional[Dict]
    ) -> Dict[str, int]:
        """Count roof features like chimneys, skylights, vents"""

        features = {
            "chimneys": 0,
            "skylights": 0,
            "vents": 0,
            "pipes": 0
        }

        # Try to get from segmentation result
        seg_features = segmentation.get("features", {})
        for key in features:
            if key in seg_features:
                features[key] = len(seg_features[key]) if isinstance(seg_features[key], list) else seg_features[key]

        # Solar API can provide some feature hints
        if solar_data:
            # Check for panels (indicates roof obstructions accounted for)
            pass

        return features

    def _process_facets(
        self,
        facets: List[Dict],
        pitch_info: Dict
    ) -> List[Dict[str, Any]]:
        """Process facets into detail list"""
        details = []

        for i, facet in enumerate(facets):
            area_pixels = facet.get("area_pixels", 0)
            area_sqft = area_pixels * (self.gsd_feet ** 2) * pitch_info["factor"]

            details.append({
                "facet_id": facet.get("facet_id", i),
                "area_sqft": round(area_sqft, 1),
                "pitch": facet.get("pitch_degrees", pitch_info["degrees"]),
                "aspect": facet.get("aspect_degrees", 0),
                "edge_count": len(facet.get("edges", []))
            })

        return details

    def _calculate_recommendations(
        self,
        total_area: float,
        roof_squares: float,
        linear: Dict[str, LinearMeasurement],
        pitch_info: Dict
    ) -> Dict[str, float]:
        """Calculate recommended material quantities"""

        return {
            "shingles": round(roof_squares * self.SHINGLE_WASTE_FACTOR, 1),
            "underlayment": round(total_area * self.UNDERLAYMENT_WASTE_FACTOR, 0),
            "ridge_cap": round(
                (linear["ridge"].length_ft + linear["hip"].length_ft) * self.LINEAR_WASTE_FACTOR, 0
            ),
            "starter": round(linear["eave"].length_ft * self.LINEAR_WASTE_FACTOR, 0),
            "drip_edge": round(linear["drip_edge"].length_ft * self.LINEAR_WASTE_FACTOR, 0),
            "ice_water": round(
                (linear["eave"].length_ft + linear["valley"].length_ft) * self.LINEAR_WASTE_FACTOR, 0
            )
        }

    def _validate_measurements(
        self,
        total_area: float,
        linear: Dict[str, LinearMeasurement],
        features: Dict[str, int]
    ) -> List[str]:
        """Validate measurements and return warnings"""
        warnings = []

        # Check for unrealistic values
        if total_area < 500:
            warnings.append("Total roof area seems low (<500 sqft)")
        elif total_area > 10000:
            warnings.append("Total roof area seems high (>10,000 sqft)")

        # Check for missing linear measurements
        if linear["ridge"].length_ft == 0:
            warnings.append("Ridge length not detected - manual verification recommended")

        if linear["eave"].length_ft == 0:
            warnings.append("Eave length not detected - manual verification recommended")

        return warnings

    def _calculate_overall_confidence(
        self,
        segmentation: Dict,
        linear: Dict[str, LinearMeasurement],
        data_sources: List[str]
    ) -> float:
        """Calculate overall confidence score"""

        # Base confidence from segmentation
        seg_confidence = segmentation.get("confidence", 0.5)

        # Bonus for multiple data sources
        source_bonus = 0.1 if len(data_sources) > 1 else 0

        # Penalty for missing linear measurements
        missing_penalty = 0
        for key, measurement in linear.items():
            if measurement.confidence == "NONE":
                missing_penalty += 0.05

        confidence = seg_confidence + source_bonus - missing_penalty
        return round(min(1.0, max(0.0, confidence)), 2)


def to_dict(obj: Any) -> Any:
    """Convert to JSON-serializable dict"""
    if hasattr(obj, '__dataclass_fields__'):
        return {k: to_dict(v) for k, v in asdict(obj).items()}
    elif isinstance(obj, list):
        return [to_dict(item) for item in obj]
    return obj


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler for measurement calculation.

    Event format:
    {
        "segmentation": {...},  # Output from roof_segmenter
        "gsd_meters": float,    # Ground sample distance (default 1.0 for NAIP)
        "solar_data": {...},    # Optional Google Solar API data
        "apply_calibration": bool  # Apply 13% area calibration (default True)
    }
    """
    import json

    segmentation = event.get("segmentation")
    if not segmentation:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "segmentation data required"})
        }

    # NAIP imagery is typically 1.0m/pixel resolution
    gsd = event.get("gsd_meters", 1.0)
    solar_data = event.get("solar_data")
    apply_calibration = event.get("apply_calibration", True)

    calculator = MeasurementCalculator(gsd_meters=gsd, apply_calibration=apply_calibration)

    try:
        result = calculator.calculate(segmentation, solar_data)

        return {
            "statusCode": 200,
            "body": json.dumps({
                "success": True,
                "measurements": to_dict(result)
            })
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }


if __name__ == "__main__":
    # Test with sample data
    sample_segmentation = {
        "facets": [
            {"facet_id": 0, "area_pixels": 50000, "pitch_degrees": 26.57}
        ],
        "edges": [
            {"edge_type": "ridge", "length_pixels": 200, "confidence": 0.8},
            {"edge_type": "eave", "length_pixels": 400, "confidence": 0.9},
            {"edge_type": "rake", "length_pixels": 300, "confidence": 0.7}
        ],
        "total_area_pixels": 50000,
        "confidence": 0.75
    }

    calc = MeasurementCalculator(gsd_meters=0.3)
    result = calc.calculate(sample_segmentation)

    print(f"Total Area: {result.total_area_sqft} sqft")
    print(f"Roof Squares: {result.roof_squares}")
    print(f"Pitch: {result.predominant_pitch} ({result.pitch_degrees}°)")
    print(f"Ridge: {result.ridge.length_ft} ft")
    print(f"Eave: {result.eave.length_ft} ft")
    print(f"Recommended Shingles: {result.recommended_shingles_squares} squares")
