from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATA_DIR = Path(os.getenv("GEOTERRA_DATA_DIR", str(BASE_DIR / "data")))
CACHE_DIR = Path(os.getenv("GEOTERRA_CACHE_DIR", str(BASE_DIR / "cache")))
GEO_DIR = DATA_DIR / "geo"
IMAGES_DIR = DATA_DIR / "images"

CACHE_DIR.mkdir(parents=True, exist_ok=True)
GEO_DIR.mkdir(parents=True, exist_ok=True)
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "").strip()
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
LLM_MODEL = os.getenv("NVIDIA_LLM_MODEL", "meta/llama-3.1-70b-instruct")
VLM_MODEL = os.getenv("NVIDIA_VLM_MODEL", "microsoft/phi-3.5-vision-instruct")
NIM_TIMEOUT_SEC = 8.0
NIM_TEMPERATURE = 0.2

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "GEOTERRA_CORS_ORIGINS", "http://localhost:3000,http://localhost:5173"
    ).split(",")
    if origin.strip()
]

MANDATORY_AI_TAG = "AI-assisted, requires official verification"
MANDATORY_CHANGE_LABEL = "Potential suspicious activity: requires official verification"
KARNATAKA_UNVALIDATED_LABEL = "Model prediction (unvalidated)"
RESPONSIBLE_USE_NOTICE = (
    "Responsible Use: GeoTerra AI is strictly designed for protective environmental "
    "monitoring, disaster early warning, evidence preservation, and infrastructure "
    "resilience. It operates strictly at the area, polygon, and public-asset level "
    "and does not perform targeting, surveillance, or tracking of individuals or vehicles."
)


@dataclass(frozen=True)
class EconomicAndOrbitalAssumptions:
    """Centralized economic and orbital engineering assumptions (labeled 'Assumption' in UI)."""

    loss_per_ha_inr: float = 45000.0
    assessment_time_manual_days: float = 14.0
    assessment_time_geoterra_hours: float = 2.5
    raw_scene_size_mb: float = 940.0
    insight_packet_size_kb: float = 1.65
    downlink_rate_mbps: float = 12.0
    haps_altitude_km: float = 20.0
    drone_endurance_min: int = 45


ASSUMPTIONS = EconomicAndOrbitalAssumptions()
