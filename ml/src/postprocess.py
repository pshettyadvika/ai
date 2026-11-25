from __future__ import annotations

from typing import Any

import geopandas as gpd
import numpy as np
import osmnx as ox
from rasterio.features import shapes
from scipy import ndimage
from shapely.geometry import shape
from skimage.morphology import remove_small_objects

from ml.config import (
    AOI_BBOX,
    BSI_DELTA_THRESHOLD,
    KARNATAKA_STATUS_LABEL,
    MANDATORY_CHANGE_LABEL,
    MIN_CHANGE_AREA_HA,
    MIN_FLOOD_AREA_HA,
    NDVI_DROP_THRESHOLD,
    RIVER_PROXIMITY_M,
    TARGET_METRIC_CRS,
)


def clean_flood_mask(
    flood_mask: np.ndarray,
    permanent_water_mask: np.ndarray | None = None,
    min_pixels: int = 45,
) -> np.ndarray:
    """Mask out JRC permanent water, apply morphological closing, and drop tiny speckles."""
    cleaned = flood_mask.astype(bool)
    if permanent_water_mask is not None:
        cleaned = cleaned & (~permanent_water_mask.astype(bool))
    cleaned = ndimage.binary_closing(cleaned, structure=np.ones((3, 3), dtype=bool))
    cleaned = remove_small_objects(cleaned, min_size=min_pixels)
    return cleaned.astype(np.uint8)


def polygonize_mask(
    binary_mask: np.ndarray,
    transform: Any,
    prob_map: np.ndarray | None = None,
    min_area_ha: float = MIN_FLOOD_AREA_HA,
    status_label: str = KARNATAKA_STATUS_LABEL,
) -> gpd.GeoDataFrame:
    """Vectorize binary raster mask to EPSG:4326 GeoDataFrame and compute UTM43N area in hectares."""
    records = []
    for geom_dict, val in shapes(binary_mask.astype(np.uint8), mask=binary_mask > 0, transform=transform):
        if val != 1:
            continue
        records.append({"geometry": shape(geom_dict)})

    if not records:
        return gpd.GeoDataFrame(columns=["geometry", "area_ha", "status_label", "validated"], crs="EPSG:4326")

    gdf = gpd.GeoDataFrame(records, crs="EPSG:4326")
    gdf_utm = gdf.to_crs(TARGET_METRIC_CRS)
    gdf["area_ha"] = (gdf_utm.geometry.area / 10000.0).round(2)
    gdf = gdf[gdf["area_ha"] >= min_area_ha].copy().reset_index(drop=True)
    gdf["validated"] = False
    gdf["status_label"] = status_label
    gdf["confidence"] = 0.85 if prob_map is None else round(float(np.mean(prob_map[binary_mask > 0])), 3)
    return gdf


def fetch_osm_assets(bbox: tuple[float, float, float, float] = AOI_BBOX) -> dict[str, gpd.GeoDataFrame]:
    """Fetch roads, buildings, and critical public assets via osmnx over AOI."""
    minx, miny, maxx, maxy = bbox
    osm_bbox = (maxy, miny, maxx, minx)  # north, south, east, west

    roads = ox.features_from_bbox(bbox=osm_bbox, tags={"highway": ["motorway", "trunk", "primary", "secondary"]})
    infra = ox.features_from_bbox(
        bbox=osm_bbox,
        tags={"amenity": ["hospital", "clinic"], "power": ["substation"], "bridge": ["yes"]},
    )
    buildings = ox.features_from_bbox(bbox=osm_bbox, tags={"building": True})

    return {
        "roads": roads.to_crs("EPSG:4326") if not roads.empty else gpd.GeoDataFrame(geometry=[], crs="EPSG:4326"),
        "infra": infra.to_crs("EPSG:4326") if not infra.empty else gpd.GeoDataFrame(geometry=[], crs="EPSG:4326"),
        "buildings": buildings.to_crs("EPSG:4326") if not buildings.empty else gpd.GeoDataFrame(geometry=[], crs="EPSG:4326"),
    }


def compute_sentinel2_change_polygons(
    b02_pre: np.ndarray,
    b04_pre: np.ndarray,
    b08_pre: np.ndarray,
    b11_pre: np.ndarray,
    scl_pre: np.ndarray,
    b02_post: np.ndarray,
    b04_post: np.ndarray,
    b08_post: np.ndarray,
    b11_post: np.ndarray,
    scl_post: np.ndarray,
    transform: Any,
    rivers_gdf: gpd.GeoDataFrame | None = None,
) -> gpd.GeoDataFrame:
    """Compute SCL-masked NDVI drop and Bare-Soil Index delta polygons with mandatory non-accusatory label."""
    valid_scl = np.isin(scl_pre, [4, 5, 6, 7]) & np.isin(scl_post, [4, 5, 6, 7])
    eps = 1e-6

    ndvi_pre = (b08_pre - b04_pre) / np.maximum(b08_pre + b04_pre, eps)
    ndvi_post = (b08_post - b04_post) / np.maximum(b08_post + b04_post, eps)
    ndvi_delta = ndvi_post - ndvi_pre

    bsi_pre = ((b11_pre + b04_pre) - (b08_pre + b02_pre)) / np.maximum((b11_pre + b04_pre) + (b08_pre + b02_pre), eps)
    bsi_post = ((b11_post + b04_post) - (b08_post + b02_post)) / np.maximum((b11_post + b04_post) + (b08_post + b02_post), eps)
    bsi_delta = bsi_post - bsi_pre

    flagged = valid_scl & (ndvi_delta <= NDVI_DROP_THRESHOLD) & (bsi_delta >= BSI_DELTA_THRESHOLD)
    flagged = remove_small_objects(ndimage.binary_closing(flagged, structure=np.ones((3, 3))), min_size=100)

    gdf = polygonize_mask(
        flagged.astype(np.uint8),
        transform=transform,
        min_area_ha=MIN_CHANGE_AREA_HA,
        status_label=MANDATORY_CHANGE_LABEL,
    )
    if gdf.empty:
        return gdf

    gdf["label"] = MANDATORY_CHANGE_LABEL
    gdf_utm = gdf.to_crs(TARGET_METRIC_CRS)
    if rivers_gdf is not None and not rivers_gdf.empty:
        rivers_utm = rivers_gdf.to_crs(TARGET_METRIC_CRS).unary_union
        distances = gdf_utm.geometry.distance(rivers_utm)
        gdf["river_distance_m"] = distances.round(1)
        gdf["near_river"] = distances <= RIVER_PROXIMITY_M
    else:
        gdf["river_distance_m"] = 999.0
        gdf["near_river"] = False

    return gdf
