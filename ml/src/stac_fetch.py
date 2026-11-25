from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

import planetary_computer
import pystac_client

from ml.config import (
    AOI_BBOX,
    BACKEND_DATA_DIR,
    CHANGE_BASELINE_RANGE,
    CHANGE_CURRENT_RANGE,
    FLOOD_DATE_RANGE,
    STAC_API_URL,
)


def open_stac_catalog() -> pystac_client.Client:
    return pystac_client.Client.open(
        STAC_API_URL,
        modifier=planetary_computer.sign_inplace,
    )


def search_sentinel1_rtc(
    bbox: tuple[float, float, float, float] = AOI_BBOX,
    date_range: str = FLOOD_DATE_RANGE,
    limit: int = 20,
) -> dict[str, Any]:
    client = open_stac_catalog()
    search = client.search(
        collections=["sentinel-1-rtc"],
        bbox=bbox,
        datetime=date_range,
        limit=limit,
    )
    items = list(search.items())
    if not items:
        return {"items": [], "grouped_by_orbit": {}, "warning": f"No sentinel-1-rtc items found for {date_range}."}

    grouped: dict[str, list[Any]] = defaultdict(list)
    for item in items:
        orbit_dir = item.properties.get("sat:orbit_state", "unknown")
        rel_orbit = item.properties.get("sat:relative_orbit", "0")
        grouped[f"{orbit_dir}_rel{rel_orbit}"].append(item)

    return {"items": items, "grouped_by_orbit": dict(grouped), "warning": None}


def search_sentinel2_l2a(
    bbox: tuple[float, float, float, float] = AOI_BBOX,
    date_range: str = CHANGE_CURRENT_RANGE,
    max_cloud_pct: float = 20.0,
    limit: int = 12,
) -> list[Any]:
    client = open_stac_catalog()
    search = client.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=date_range,
        query={"eo:cloud_cover": {"lt": max_cloud_pct}},
        limit=limit,
    )
    return list(search.items())


def search_static_layers(bbox: tuple[float, float, float, float] = AOI_BBOX) -> dict[str, list[Any]]:
    client = open_stac_catalog()
    jrc_items = list(client.search(collections=["jrc-gsw"], bbox=bbox, limit=4).items())
    wc_items = list(client.search(collections=["esa-worldcover"], bbox=bbox, limit=4).items())
    return {"jrc-gsw": jrc_items, "esa-worldcover": wc_items}


def export_scenes_metadata() -> dict[str, Any]:
    s1 = search_sentinel1_rtc()
    s2_curr = search_sentinel2_l2a(date_range=CHANGE_CURRENT_RANGE)
    s2_base = search_sentinel2_l2a(date_range=CHANGE_BASELINE_RANGE)
    statics = search_static_layers()

    scenes_list: list[dict[str, Any]] = []
    for item in s1["items"]:
        scenes_list.append(
            {
                "id": item.id,
                "collection": "sentinel-1-rtc",
                "datetime": item.datetime.isoformat() if item.datetime else "",
                "orbit_state": item.properties.get("sat:orbit_state", "unknown"),
                "relative_orbit": item.properties.get("sat:relative_orbit", 0),
                "polarization": "VV, VH",
                "cloud_cover_pct": None,
                "role": "SAR flood inference",
            }
        )
    for item in s2_curr[:3] + s2_base[:3]:
        scenes_list.append(
            {
                "id": item.id,
                "collection": "sentinel-2-l2a",
                "datetime": item.datetime.isoformat() if item.datetime else "",
                "orbit_state": item.properties.get("sat:orbit_state", "descending"),
                "relative_orbit": item.properties.get("sat:relative_orbit", 0),
                "polarization": "Optical 10m (SCL masked)",
                "cloud_cover_pct": item.properties.get("eo:cloud_cover"),
                "role": "Land-change NDVI/BSI composite",
            }
        )
    for col_name, items in statics.items():
        for item in items[:2]:
            scenes_list.append(
                {
                    "id": item.id,
                    "collection": col_name,
                    "datetime": item.datetime.isoformat() if item.datetime else "",
                    "orbit_state": "static",
                    "relative_orbit": 0,
                    "polarization": "Auxiliary raster",
                    "cloud_cover_pct": None,
                    "role": "Permanent water / land cover mask",
                }
            )

    payload = {
        "sample": False,
        "stac_endpoint": STAC_API_URL,
        "aoi": f"Bengaluru & Peri-Urban Basin {list(AOI_BBOX)}",
        "scenes": scenes_list,
    }
    (BACKEND_DATA_DIR / "scenes.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload
