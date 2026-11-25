from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent
BACKEND_DATA_DIR = REPO_ROOT / "backend" / "data"
BACKEND_GEO_DIR = BACKEND_DATA_DIR / "geo"
BACKEND_IMAGES_DIR = BACKEND_DATA_DIR / "images"

SEN1FLOODS11_DIR = ML_DIR / "data" / "sen1floods11"
SPLITS_DIR = ML_DIR / "data" / "splits"
CHECKPOINTS_DIR = ML_DIR / "checkpoints"
RAW_STAC_DIR = ML_DIR / "data" / "stac"
OUTPUTS_DIR = ML_DIR / "outputs"

for _d in [
    SEN1FLOODS11_DIR,
    SPLITS_DIR,
    CHECKPOINTS_DIR,
    RAW_STAC_DIR,
    OUTPUTS_DIR,
    BACKEND_DATA_DIR,
    BACKEND_GEO_DIR,
    BACKEND_IMAGES_DIR,
]:
    _d.mkdir(parents=True, exist_ok=True)

# Bengaluru & Peri-Urban Karnataka AOI [min_lon, min_lat, max_lon, max_lat]
AOI_BBOX = (77.3, 12.7, 77.9, 13.3)
TARGET_METRIC_CRS = "EPSG:32643"  # UTM Zone 43N for exact hectare/km area calculations

# Configurable acquisition date ranges
FLOOD_DATE_RANGE = "2026-10-01/2026-11-25"
CHANGE_BASELINE_RANGE = "2025-11-01/2025-12-15"
CHANGE_CURRENT_RANGE = "2026-10-01/2026-11-25"

STAC_API_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"

# Sentinel-1 dB clipping range aligned across Sen1Floods11 and Planetary Computer S1-RTC
DB_MIN = -30.0
DB_MAX = 5.0

# Training hyperparameters tuned for <30 min completion on free Colab T4
SEED = 42
CROP_SIZE = 256
BATCH_SIZE = 16
EPOCHS = 18
LEARNING_RATE = 3e-4
WEIGHT_DECAY = 1e-4
EARLY_STOP_PATIENCE = 5
NUM_WORKERS = 2

# Inference & postprocessing
INFER_PATCH_SIZE = 256
INFER_STRIDE = 192
FLOOD_PROB_THRESHOLD = 0.50
MIN_FLOOD_AREA_HA = 0.5
MIN_CHANGE_AREA_HA = 1.0
NDVI_DROP_THRESHOLD = -0.25
BSI_DELTA_THRESHOLD = 0.15
RIVER_PROXIMITY_M = 250.0

SEN1FLOODS11_GITHUB_SPLITS = {
    "train": "https://raw.githubusercontent.com/cloudtostreet/Sen1Floods11/master/splits/flood_handlabeled/flood_train_data.csv",
    "valid": "https://raw.githubusercontent.com/cloudtostreet/Sen1Floods11/master/splits/flood_handlabeled/flood_valid_data.csv",
    "test": "https://raw.githubusercontent.com/cloudtostreet/Sen1Floods11/master/splits/flood_handlabeled/flood_test_data.csv",
    "bolivia": "https://raw.githubusercontent.com/cloudtostreet/Sen1Floods11/master/splits/flood_handlabeled/flood_bolivia_data.csv",
}

MANDATORY_CHANGE_LABEL = "Potential suspicious activity: requires official verification"
KARNATAKA_STATUS_LABEL = "Model prediction (unvalidated)"


@dataclass(frozen=True)
class EconomicParams:
    loss_per_ha_inr: float = 45000.0
    assessment_time_manual_days: float = 14.0
    assessment_time_geoterra_hours: float = 2.5
    raw_scene_size_mb: float = 940.0
    insight_packet_size_kb: float = 1.65
    downlink_rate_mbps: float = 12.0
    haps_altitude_km: float = 20.0
    drone_endurance_min: int = 45


ECON = EconomicParams()
