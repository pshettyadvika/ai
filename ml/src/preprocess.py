from __future__ import annotations

from pathlib import Path
from typing import Tuple

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject

from ml.config import DB_MAX, DB_MIN, OUTPUTS_DIR
from ml.src.dataset import read_s1_chip


def linear_power_to_db(linear_arr: np.ndarray) -> np.ndarray:
    """Convert Sentinel-1 RTC linear power backscatter to dB and clip to [DB_MIN, DB_MAX]."""
    arr = np.where(np.isfinite(linear_arr) & (linear_arr > 0), linear_arr, 1e-6)
    db = 10.0 * np.log10(np.maximum(arr, 1e-6))
    return np.clip(db.astype(np.float32), DB_MIN, DB_MAX)


def read_and_align_s1_rtc_pair(
    vv_href: str,
    vh_href: str,
    target_bbox: tuple[float, float, float, float],
    target_res_deg: float = 0.0001,
) -> Tuple[np.ndarray, dict]:
    """Read signed Planetary Computer S1-RTC VV & VH rasters, convert to dB, and align to EPSG:4326 grid."""
    minx, miny, maxx, maxy = target_bbox
    width = max(int(round((maxx - minx) / target_res_deg)), 1)
    height = max(int(round((maxy - miny) / target_res_deg)), 1)
    dst_transform = rasterio.transform.from_bounds(minx, miny, maxx, maxy, width, height)
    dst_crs = "EPSG:4326"

    stacked = np.full((2, height, width), DB_MIN, dtype=np.float32)
    for idx, href in enumerate([vv_href, vh_href]):
        with rasterio.open(href) as src:
            dst_band = np.zeros((height, width), dtype=np.float32)
            reproject(
                source=rasterio.band(src, 1),
                destination=dst_band,
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=dst_transform,
                dst_crs=dst_crs,
                resampling=Resampling.bilinear,
            )
            stacked[idx] = linear_power_to_db(dst_band)

    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": 2,
        "dtype": "float32",
        "crs": dst_crs,
        "transform": dst_transform,
    }
    return stacked, profile


def plot_db_histogram_comparison(
    sen1floods_paths: list[Path],
    rtc_db_stack: np.ndarray,
    out_path: Path = OUTPUTS_DIR / "s1_db_histogram_check.png",
) -> Path:
    """Verify domain alignment between Sen1Floods11 training dB and Karnataka S1-RTC dB."""
    sf_vv, sf_vh = [], []
    for p in sen1floods_paths[:20]:
        arr = read_s1_chip(p)
        sf_vv.append(arr[0].ravel()[::16])
        sf_vh.append(arr[1].ravel()[::16])

    sf_vv_cat = np.concatenate(sf_vv)
    sf_vh_cat = np.concatenate(sf_vh)
    rtc_vv = rtc_db_stack[0].ravel()[::16]
    rtc_vh = rtc_db_stack[1].ravel()[::16]

    fig, axes = plt.subplots(1, 2, figsize=(11, 4), dpi=130)
    axes[0].hist(sf_vv_cat, bins=60, range=(DB_MIN, DB_MAX), density=True, alpha=0.6, label="Sen1Floods11 VV")
    axes[0].hist(rtc_vv, bins=60, range=(DB_MIN, DB_MAX), density=True, alpha=0.6, label="Karnataka S1-RTC VV")
    axes[0].set_title("VV Backscatter (dB)")
    axes[0].legend()

    axes[1].hist(sf_vh_cat, bins=60, range=(DB_MIN, DB_MAX), density=True, alpha=0.6, label="Sen1Floods11 VH")
    axes[1].hist(rtc_vh, bins=60, range=(DB_MIN, DB_MAX), density=True, alpha=0.6, label="Karnataka S1-RTC VH")
    axes[1].set_title("VH Backscatter (dB)")
    axes[1].legend()

    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path)
    plt.close(fig)
    return out_path
