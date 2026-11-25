from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field, computed_field


class ModelSummary(BaseModel):
    architecture: str
    training_dataset: str
    citation: str
    test_iou: float
    test_f1: float
    bolivia_iou: float
    bolivia_f1: float
    baseline_test_iou: float
    baseline_test_f1: float
    baseline_bolivia_iou: float
    baseline_bolivia_f1: float
    karnataka_validated: bool = False
    karnataka_status_label: str = "Model prediction (unvalidated)"


class SettlementRisk(BaseModel):
    id: str
    name: str
    taluk: str
    flooded_ha: float
    buildings_at_risk: int
    roads_km: float
    priority: Literal["High", "Medium", "Watch"]
    lat: float
    lon: float


class CriticalInfrastructure(BaseModel):
    id: str
    name: str
    type: Literal["hospital", "substation", "bridge", "water_plant", "other"]
    distance_to_flood_m: float
    status: str
    lat: float
    lon: float


class FloodSummary(BaseModel):
    validated: bool = False
    status_label: str = "Model prediction (unvalidated)"
    acquisition_window: str
    flooded_area_ha: float
    permanent_water_masked_ha: float
    cropland_affected_ha: float
    built_up_affected_ha: float
    roads_affected_km: float
    buildings_affected_count: int
    critical_infrastructure_count: int
    prioritized_settlements: list[SettlementRisk]
    critical_infrastructure: list[CriticalInfrastructure]


class ChangeSite(BaseModel):
    id: str
    name: str
    taluk: str
    area_ha: float
    ndvi_drop: float
    bare_soil_index_delta: float
    confidence: float
    near_river: bool
    river_distance_m: float
    land_cover_prior: str
    label: str = "Potential suspicious activity: requires official verification"
    lat: float
    lon: float


class ChangeSummary(BaseModel):
    baseline_window: str
    current_window: str
    total_flagged_ha: float
    flagged_sites_count: int
    river_proximity_sites_count: int
    mandatory_label: str = "Potential suspicious activity: requires official verification"
    sites: list[ChangeSite]


class EconomicsSummary(BaseModel):
    loss_per_ha_inr: float
    assessment_time_manual_days: float
    assessment_time_geoterra_hours: float
    open_data_cost_inr: float = 0.0
    note: str = "All economic parameters are configurable planning assumptions."

    @computed_field
    @property
    def time_saved_hours(self) -> float:
        return round((self.assessment_time_manual_days * 24.0) - self.assessment_time_geoterra_hours, 2)


class OnboardSimSummary(BaseModel):
    simulation: bool = True
    raw_scene_size_mb: float
    insight_packet_size_kb: float
    downlink_rate_mbps: float
    haps_altitude_km: float
    drone_endurance_min: int
    sample_packet: dict[str, Any] = Field(default_factory=dict)

    @computed_field
    @property
    def compression_ratio(self) -> float:
        raw_kb = self.raw_scene_size_mb * 1024.0
        return round(raw_kb / max(self.insight_packet_size_kb, 0.01), 1)

    @computed_field
    @property
    def downlink_time_raw_sec(self) -> float:
        raw_mbits = self.raw_scene_size_mb * 8.0
        return round(raw_mbits / max(self.downlink_rate_mbps, 0.01), 2)

    @computed_field
    @property
    def downlink_time_packet_sec(self) -> float:
        pkt_mbits = (self.insight_packet_size_kb / 1024.0) * 8.0
        return round(pkt_mbits / max(self.downlink_rate_mbps, 0.01), 4)


class ResultsContract(BaseModel):
    sample: bool
    generated_at: str
    region: str
    aoi_bbox: list[float]
    model: ModelSummary
    flood: FloodSummary
    change: ChangeSummary
    economics: EconomicsSummary
    onboard_sim: OnboardSimSummary

    @computed_field
    @property
    def total_loss_inr(self) -> float:
        return round(self.flood.cropland_affected_ha * self.economics.loss_per_ha_inr, 2)


class AlertRequest(BaseModel):
    zone_id: str | None = None
    demo_mode: bool = False


class DescribeSiteRequest(BaseModel):
    site_id: str
    image_name: str | None = "optical_change_after.jpg"
    demo_mode: bool = False


class TriageRequest(BaseModel):
    demo_mode: bool = False


class TriageSiteRank(BaseModel):
    rank: int
    site_id: str
    name: str
    priority: Literal["High", "Medium", "Low"]
    rationale: str
    recommended_verification: str


class TriageResponse(BaseModel):
    simulation: bool = True
    tag: str = "AI-assisted, requires official verification"
    source: Literal["live", "cached"]
    ranked_sites: list[TriageSiteRank]


class AskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=500)
    demo_mode: bool = False


class ReportPdfRequest(BaseModel):
    include_ai_summary: bool = True
    demo_mode: bool = False
