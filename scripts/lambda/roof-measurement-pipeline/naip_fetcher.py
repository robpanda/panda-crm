"""
NAIP (National Agriculture Imagery Program) Fetcher

Fetches free, high-resolution aerial imagery from USGS for roof measurement processing.
NAIP imagery is public domain and can be freely used for commercial purposes.

Resolution: ~1m/pixel (some areas have 0.6m)
Coverage: Continental United States
Update frequency: Every 2-3 years
"""

import os
import json
import requests
from typing import Optional, Tuple, Dict, Any
from dataclasses import dataclass
from datetime import datetime
import math

# USGS STAC API for NAIP imagery
NAIP_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
NAIP_COLLECTION = "naip"

# Alternative: AWS Open Data NAIP
AWS_NAIP_BUCKET = "naip-visualization"


@dataclass
class NAIPImage:
    """Represents a NAIP image tile"""
    url: str
    bounds: Tuple[float, float, float, float]  # west, south, east, north
    capture_date: str
    resolution: float  # meters per pixel
    crs: str
    metadata: Dict[str, Any]


class NAIPFetcher:
    """
    Fetches NAIP aerial imagery for roof measurement processing.

    Uses Microsoft Planetary Computer STAC API (free, no API key required)
    or direct AWS S3 access for NAIP tiles.
    """

    def __init__(self, cache_dir: Optional[str] = None):
        self.stac_url = NAIP_STAC_URL
        self.cache_dir = cache_dir or "/tmp/naip_cache"
        os.makedirs(self.cache_dir, exist_ok=True)

    def search_imagery(
        self,
        latitude: float,
        longitude: float,
        buffer_meters: float = 100,
        max_cloud_cover: float = 10,
        min_date: Optional[str] = None
    ) -> list[NAIPImage]:
        """
        Search for NAIP imagery covering a specific location.

        Args:
            latitude: Center latitude
            longitude: Center longitude
            buffer_meters: Buffer around point (default 100m for typical roof)
            max_cloud_cover: Maximum cloud cover percentage
            min_date: Minimum capture date (YYYY-MM-DD)

        Returns:
            List of available NAIP images sorted by date (newest first)
        """
        # Convert buffer to degrees (approximate)
        buffer_deg = buffer_meters / 111000  # ~111km per degree

        # Create bounding box
        bbox = [
            longitude - buffer_deg,
            latitude - buffer_deg,
            longitude + buffer_deg,
            latitude + buffer_deg
        ]

        # Build STAC search query
        search_params = {
            "collections": [NAIP_COLLECTION],
            "bbox": bbox,
            "limit": 10,
            "sortby": [{"field": "datetime", "direction": "desc"}]
        }

        if min_date:
            search_params["datetime"] = f"{min_date}T00:00:00Z/.."

        try:
            response = requests.post(
                f"{self.stac_url}/search",
                json=search_params,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            response.raise_for_status()
            results = response.json()

            images = []
            for feature in results.get("features", []):
                props = feature.get("properties", {})
                assets = feature.get("assets", {})

                # Get the visual/RGB asset
                image_asset = assets.get("image") or assets.get("visual") or assets.get("data")
                if not image_asset:
                    continue

                # Check cloud cover if available
                cloud_cover = props.get("eo:cloud_cover", 0)
                if cloud_cover > max_cloud_cover:
                    continue

                images.append(NAIPImage(
                    url=image_asset.get("href"),
                    bounds=tuple(feature.get("bbox", [0, 0, 0, 0])),
                    capture_date=props.get("datetime", "")[:10],
                    resolution=props.get("gsd", 1.0),
                    crs=props.get("proj:epsg", "EPSG:4326"),
                    metadata={
                        "id": feature.get("id"),
                        "cloud_cover": cloud_cover,
                        "state": props.get("naip:state"),
                        "year": props.get("naip:year"),
                    }
                ))

            return images

        except requests.RequestException as e:
            print(f"STAC search failed: {e}")
            return []

    def fetch_tile(
        self,
        latitude: float,
        longitude: float,
        zoom: int = 18,
        tile_size: int = 512,
        item_id: Optional[str] = None
    ) -> Optional[bytes]:
        """
        Fetch a specific tile centered on coordinates.

        Args:
            latitude: Center latitude
            longitude: Center longitude
            zoom: Zoom level (18 recommended for roof detail)
            tile_size: Tile size in pixels
            item_id: STAC item ID for the specific image

        Returns:
            PNG image bytes or None if not available
        """
        # Calculate tile coordinates
        tile_x, tile_y = self._latlon_to_tile(latitude, longitude, zoom)

        # If we have a specific item ID, use the item tile endpoint
        if item_id:
            tile_url = (
                f"https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/"
                f"WebMercatorQuad/{zoom}/{tile_x}/{tile_y}@1x?"
                f"collection={NAIP_COLLECTION}&item={item_id}&assets=image&"
                f"asset_bidx=image%7C1%2C2%2C3&format=png"
            )
            try:
                response = requests.get(tile_url, timeout=30)
                if response.status_code == 200:
                    return response.content
            except requests.RequestException as e:
                print(f"Item tile fetch failed: {e}")

        # Fallback: Try the mosaic endpoint (all NAIP imagery merged)
        mosaic_tile_url = (
            f"https://planetarycomputer.microsoft.com/api/data/v1/mosaic/tiles/"
            f"WebMercatorQuad/{zoom}/{tile_x}/{tile_y}@1x.png?"
            f"collection={NAIP_COLLECTION}&assets=image&"
            f"asset_bidx=image%7C1%2C2%2C3"
        )
        try:
            response = requests.get(mosaic_tile_url, timeout=30)
            if response.status_code == 200:
                return response.content
        except requests.RequestException as e:
            print(f"Mosaic tile fetch failed: {e}")

        # Try the rendered preview if tiles fail
        if item_id:
            preview_url = (
                f"https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png?"
                f"collection={NAIP_COLLECTION}&item={item_id}&assets=image&"
                f"asset_bidx=image%7C1%2C2%2C3&format=png&"
                f"max_size=1024"
            )
            try:
                response = requests.get(preview_url, timeout=30)
                if response.status_code == 200:
                    return response.content
            except requests.RequestException as e:
                print(f"Preview fetch failed: {e}")

        return None

    def fetch_area(
        self,
        latitude: float,
        longitude: float,
        width_meters: float = 100,
        height_meters: float = 100,
        zoom: int = 19
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch imagery covering a specific area (e.g., a property).

        Args:
            latitude: Center latitude
            longitude: Center longitude
            width_meters: Width of area in meters
            height_meters: Height of area in meters
            zoom: Zoom level

        Returns:
            Dict with image data, bounds, and metadata
        """
        # Search for best available imagery
        images = self.search_imagery(
            latitude, longitude,
            buffer_meters=max(width_meters, height_meters)
        )

        if not images:
            return None

        best_image = images[0]  # Newest image

        # Get the item ID for fetching the specific tile
        item_id = best_image.metadata.get("id")

        # Fetch the tile using the item ID
        tile_data = self.fetch_tile(latitude, longitude, zoom, item_id=item_id)

        if not tile_data:
            # Try without item_id (use mosaic)
            tile_data = self.fetch_tile(latitude, longitude, zoom)

        if not tile_data:
            return None

        # Calculate actual bounds of the tile
        tile_bounds = self._get_tile_bounds(latitude, longitude, zoom)

        return {
            "image_data": tile_data,
            "bounds": tile_bounds,
            "capture_date": best_image.capture_date,
            "resolution": best_image.resolution,
            "source": "NAIP",
            "attribution": "USDA NAIP Imagery - Public Domain",
            "metadata": best_image.metadata
        }

    def get_coverage_status(self, latitude: float, longitude: float) -> Dict[str, Any]:
        """
        Check if NAIP coverage exists for a location.

        Returns:
            Coverage status including available years and resolution
        """
        images = self.search_imagery(latitude, longitude, buffer_meters=50)

        if not images:
            return {
                "covered": False,
                "message": "No NAIP imagery available for this location"
            }

        years = sorted(set(
            img.metadata.get("year") or img.capture_date[:4]
            for img in images
        ), reverse=True)

        best_resolution = min(img.resolution for img in images)

        return {
            "covered": True,
            "available_years": years,
            "best_resolution_m": best_resolution,
            "newest_date": images[0].capture_date,
            "state": images[0].metadata.get("state"),
            "image_count": len(images)
        }

    def _latlon_to_tile(self, lat: float, lon: float, zoom: int) -> Tuple[int, int]:
        """Convert lat/lon to tile coordinates"""
        n = 2 ** zoom
        x = int((lon + 180) / 360 * n)
        y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
        return x, y

    def _get_tile_bounds(
        self, lat: float, lon: float, zoom: int
    ) -> Tuple[float, float, float, float]:
        """Get the geographic bounds of a tile"""
        tile_x, tile_y = self._latlon_to_tile(lat, lon, zoom)
        n = 2 ** zoom

        west = tile_x / n * 360 - 180
        east = (tile_x + 1) / n * 360 - 180

        north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * tile_y / n))))
        south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (tile_y + 1) / n))))

        return (west, south, east, north)


# USGS 3DEP Elevation Data Fetcher
class USGSElevationFetcher:
    """
    Fetches elevation data from USGS 3DEP for roof pitch estimation.

    3DEP provides high-resolution DSM/DEM data for the US.
    """

    ELEVATION_API = "https://epqs.nationalmap.gov/v1/json"

    def get_elevation(self, latitude: float, longitude: float) -> Optional[float]:
        """Get ground elevation at a point (meters)"""
        try:
            response = requests.get(
                self.ELEVATION_API,
                params={
                    "x": longitude,
                    "y": latitude,
                    "units": "Meters",
                    "output": "json"
                },
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            return float(data.get("value", 0))
        except (requests.RequestException, ValueError, KeyError):
            return None

    def get_elevation_grid(
        self,
        center_lat: float,
        center_lon: float,
        grid_size: int = 10,
        spacing_meters: float = 1.0
    ) -> Optional[list[list[float]]]:
        """
        Get a grid of elevation points for roof analysis.

        Args:
            center_lat: Center latitude
            center_lon: Center longitude
            grid_size: Number of points per side
            spacing_meters: Distance between points

        Returns:
            2D grid of elevation values
        """
        # Convert spacing to degrees
        spacing_deg = spacing_meters / 111000

        grid = []
        half = grid_size // 2

        for i in range(-half, half + 1):
            row = []
            for j in range(-half, half + 1):
                lat = center_lat + i * spacing_deg
                lon = center_lon + j * spacing_deg
                elev = self.get_elevation(lat, lon)
                row.append(elev if elev is not None else 0)
            grid.append(row)

        return grid


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler for NAIP imagery fetching.

    Event format:
    {
        "action": "fetch" | "coverage" | "search",
        "latitude": float,
        "longitude": float,
        "width_meters": float (optional),
        "height_meters": float (optional)
    }
    """
    action = event.get("action", "fetch")
    lat = event.get("latitude")
    lon = event.get("longitude")

    if lat is None or lon is None:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "latitude and longitude required"})
        }

    fetcher = NAIPFetcher()

    if action == "coverage":
        result = fetcher.get_coverage_status(lat, lon)
        return {
            "statusCode": 200,
            "body": json.dumps(result)
        }

    elif action == "search":
        images = fetcher.search_imagery(lat, lon)
        return {
            "statusCode": 200,
            "body": json.dumps({
                "images": [
                    {
                        "url": img.url,
                        "capture_date": img.capture_date,
                        "resolution": img.resolution,
                        "metadata": img.metadata
                    }
                    for img in images
                ]
            })
        }

    elif action == "fetch":
        width = event.get("width_meters", 100)
        height = event.get("height_meters", 100)

        result = fetcher.fetch_area(lat, lon, width, height)

        if result is None:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "No imagery available for this location"})
            }

        # Don't return raw image bytes in JSON - return URL or base64
        import base64
        result["image_base64"] = base64.b64encode(result.pop("image_data")).decode()

        return {
            "statusCode": 200,
            "body": json.dumps(result)
        }

    return {
        "statusCode": 400,
        "body": json.dumps({"error": f"Unknown action: {action}"})
    }


if __name__ == "__main__":
    # Test the fetcher
    fetcher = NAIPFetcher()

    # Test location: Baltimore, MD
    lat, lon = 39.2904, -76.6122

    print("Checking NAIP coverage...")
    coverage = fetcher.get_coverage_status(lat, lon)
    print(f"Coverage: {json.dumps(coverage, indent=2)}")

    print("\nSearching for imagery...")
    images = fetcher.search_imagery(lat, lon)
    for img in images[:3]:
        print(f"  - {img.capture_date}: {img.resolution}m resolution")

    print("\nFetching area imagery...")
    result = fetcher.fetch_area(lat, lon, 100, 100)
    if result:
        print(f"  Got image: {len(result['image_data'])} bytes")
        print(f"  Capture date: {result['capture_date']}")
        print(f"  Attribution: {result['attribution']}")
