from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
from PIL import Image

from ml.config import (
    AOI_BBOX,
    BACKEND_DATA_DIR,
    BACKEND_GEO_DIR,
    BACKEND_IMAGES_DIR,
    ECON,
    FLOOD_DATE_RANGE,
    CHANGE_BASELINE_RANGE,
    CHANGE_CURRENT_RANGE,
    KARNATAKA_STATUS_LABEL,
    MANDATORY_CHANGE_LABEL,
)


def save_gray_preview_png(arr_db: np.ndarray, out_path: Path, vmin: float = -25.0, vmax: float = 0.0) -> Path:
    norm = np.clip((arr_db - vmin) / max(vmax - vmin, 1e-6), 0.0, 1.0)
    img = Image.fromarray((norm * 255).astype(np.uint8), mode="L")
    img.thumbnail((1024, 1024))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    return out_path


def export_pipeline_outputs(
    flood_gdf: gpd.GeoDataFrame,
    permanent_water_gdf: gpd.GeoDataFrame,
    assets_gdf: gpd.GeoDataFrame,
    change_gdf: gpd.GeoDataFrame,
    model_card: dict[str, Any],
    cropland_affected_ha: float,
    built_up_affected_ha: float,
    roads_affected_km: float,
    buildings_affected_count: int,
    critical_infrastructure: list[dict[str, Any]],
    prioritized_settlements: list[dict[str, Any]],
    permanent_water_masked_ha: float,
) -> Path:
    """Write real pipeline GeoJSONs and results.json ('sample': false) into backend/data/."""
    flood_gdf.to_file(BACKEND_GEO_DIR / "flood_extent.geojson", driver="GeoJSON")
    permanent_water_gdf.to_file(BACKEND_GEO_DIR / "permanent_water.geojson", driver="GeoJSON")
    assets_gdf.to_file(BACKEND_GEO_DIR / "assets.geojson", driver="GeoJSON")
    change_gdf.to_file(BACKEND_GEO_DIR / "change.geojson", driver="GeoJSON")

    flooded_area_ha = round(float(flood_gdf["area_ha"].sum()), 2) if not flood_gdf.empty else 0.0
    total_flagged_ha = round(float(change_gdf["area_ha"].sum()), 2) if not change_gdf.empty else 0.0

    change_sites = []
    for idx, row in change_gdf.iterrows():
        centroid = row.geometry.centroid
        change_sites.append(
            {
                "id": f"CHG-{idx + 1:02d}",
                "name": row.get("name", f"Flagged Parcel {idx + 1}"),
                "taluk": row.get("taluk", "Bengaluru Basin"),
                "area_ha": round(float(row["area_ha"]), 2),
                "ndvi_drop": round(float(row.get("ndvi_drop", -0.32)), 2),
                "bare_soil_index_delta": round(float(row.get("bare_soil_index_delta", 0.22)), 2),
                "confidence": round(float(row.get("confidence", 0.78)), 2),
                "near_river": bool(row.get("near_river", False)),
                "river_distance_m": round(float(row.get("river_distance_m", 500.0)), 1),
                "land_cover_prior": row.get("land_cover_prior", "Shrubland / Agriculture"),
                "label": MANDATORY_CHANGE_LABEL,
                "lat": round(float(centroid.y), 5),
                "lon": round(float(centroid.x), 5),
            }
        )

    test_metrics = model_card["metrics"]["test"]
    bol_metrics = model_card["metrics"]["bolivia_holdout"]
    total_loss_inr = round(cropland_affected_ha * ECON.loss_per_ha_inr, 2)

    results_payload = {
        "sample": False,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "region": "Bengaluru & Peri-Urban Karnataka Basin",
        "aoi_bbox": list(AOI_BBOX),
        "model": {
            "architecture": model_card["architecture"],
            "training_dataset": model_card["dataset"]["name"],
            "citation": "Bonafilia et al., 2020, CVPR Workshops",
            "test_iou": test_metrics["unet_iou"],
            "test_f1": test_metrics["unet_f1"],
            "bolivia_iou": bol_metrics["unet_iou"],
            "bolivia_f1": bol_metrics["unet_f1"],
            "baseline_test_iou": test_metrics["baseline_iou"],
            "baseline_test_f1": test_metrics["baseline_f1"],
            "baseline_bolivia_iou": bol_metrics["baseline_iou"],
            "baseline_bolivia_f1": bol_metrics["baseline_f1"],
            "karnataka_validated": False,
            "karnataka_status_label": KARNATAKA_STATUS_LABEL,
        },
        "flood": {
            "validated": False,
            "status_label": KARNATAKA_STATUS_LABEL,
            "acquisition_window": FLOOD_DATE_RANGE,
            "flooded_area_ha": flooded_area_ha,
            "permanent_water_masked_ha": round(permanent_water_masked_ha, 2),
            "cropland_affected_ha": round(cropland_affected_ha, 2),
            "built_up_affected_ha": round(built_up_affected_ha, 2),
            "roads_affected_km": round(roads_affected_km, 2),
            "buildings_affected_count": int(buildings_affected_count),
            "critical_infrastructure_count": len(critical_infrastructure),
            "prioritized_settlements": prioritized_settlements,
            "critical_infrastructure": critical_infrastructure,
        },
        "change": {
            "baseline_window": CHANGE_BASELINE_RANGE,
            "current_window": CHANGE_CURRENT_RANGE,
            "total_flagged_ha": total_flagged_ha,
            "flagged_sites_count": len(change_sites),
            "river_proximity_sites_count": sum(1 for s in change_sites if s["near_river"]),
            "mandatory_label": MANDATORY_CHANGE_LABEL,
            "sites": change_sites,
        },
        "economics": {
            "loss_per_ha_inr": ECON.loss_per_ha_inr,
            "assessment_time_manual_days": ECON.assessment_time_manual_days,
            "assessment_time_geoterra_hours": ECON.assessment_time_geoterra_hours,
            "total_loss_inr": total_loss_inr,
            "time_saved_hours": round((ECON.assessment_time_manual_days * 24.0) - ECON.assessment_time_geoterra_hours, 2),
            "open_data_cost_inr": 0,
            "note": "All economic parameters are configurable planning assumptions.",
        },
        "onboard_sim": {
            "simulation": True,
            "raw_scene_size_mb": ECON.raw_scene_size_mb,
            "insight_packet_size_kb": ECON.insight_packet_size_kb,
            "downlink_rate_mbps": ECON.downlink_rate_mbps,
            "haps_altitude_km": ECON.haps_altitude_km,
            "drone_endurance_min": ECON.drone_endurance_min,
            "compression_ratio": round((ECON.raw_scene_size_mb * 1024.0) / ECON.insight_packet_size_kb, 1),
            "downlink_time_raw_sec": round((ECON.raw_scene_size_mb * 8.0) / ECON.downlink_rate_mbps, 2),
            "downlink_time_packet_sec": round(((ECON.insight_packet_size_kb / 1024.0) * 8.0) / ECON.downlink_rate_mbps, 4),
            "sample_packet": {
                "packet_id": "GT-PKT-LIVE-KA01",
                "flood_ha": flooded_area_ha,
                "change_ha": total_flagged_ha,
                "priority_centroids": [[s["lat"], s["lon"]] for s in change_sites[:3]],
            },
        },
    }

    out_file = BACKEND_DATA_DIR / "results.json"
    out_file.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")
    return out_file
