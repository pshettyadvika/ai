export type AiSource = "live" | "cached";

export type VerificationStatus = "New" | "Under verification" | "Verified";

export interface ModelSummary {
  architecture: string;
  training_dataset: string;
  citation: string;
  test_iou: number;
  test_f1: number;
  bolivia_iou: number;
  bolivia_f1: number;
  baseline_test_iou: number;
  baseline_test_f1: number;
  baseline_bolivia_iou: number;
  baseline_bolivia_f1: number;
  karnataka_validated: boolean;
  karnataka_status_label: string;
}

export interface SettlementRisk {
  id: string;
  name: string;
  taluk: string;
  flooded_ha: number;
  buildings_at_risk: number;
  roads_km: number;
  priority: "High" | "Medium" | "Watch";
  lat: number;
  lon: number;
}

export interface CriticalInfrastructure {
  id: string;
  name: string;
  type: "hospital" | "substation" | "bridge" | "water_plant" | "other";
  distance_to_flood_m: number;
  status: string;
  lat: number;
  lon: number;
}

export interface FloodSummary {
  validated: boolean;
  status_label: string;
  acquisition_window: string;
  flooded_area_ha: number;
  permanent_water_masked_ha: number;
  cropland_affected_ha: number;
  built_up_affected_ha: number;
  roads_affected_km: number;
  buildings_affected_count: number;
  critical_infrastructure_count: number;
  prioritized_settlements: SettlementRisk[];
  critical_infrastructure: CriticalInfrastructure[];
}

export interface ChangeSite {
  id: string;
  name: string;
  taluk: string;
  area_ha: number;
  ndvi_drop: number;
  bare_soil_index_delta: number;
  confidence: number;
  near_river: boolean;
  river_distance_m: number;
  land_cover_prior: string;
  label: string;
  lat: number;
  lon: number;
}

export interface ChangeSummary {
  baseline_window: string;
  current_window: string;
  total_flagged_ha: number;
  flagged_sites_count: number;
  river_proximity_sites_count: number;
  mandatory_label: string;
  sites: ChangeSite[];
}

export interface EconomicsSummary {
  loss_per_ha_inr: number;
  assessment_time_manual_days: number;
  assessment_time_geoterra_hours: number;
  total_loss_inr: number;
  time_saved_hours: number;
  open_data_cost_inr: number;
  note: string;
}

export interface OnboardSimSummary {
  simulation: boolean;
  raw_scene_size_mb: number;
  insight_packet_size_kb: number;
  downlink_rate_mbps: number;
  haps_altitude_km: number;
  drone_endurance_min: number;
  compression_ratio: number;
  downlink_time_raw_sec: number;
  downlink_time_packet_sec: number;
  sample_packet: Record<string, unknown>;
}

export interface ResultsContract {
  sample: boolean;
  generated_at: string;
  region: string;
  aoi_bbox: number[];
  model: ModelSummary;
  flood: FloodSummary;
  change: ChangeSummary;
  economics: EconomicsSummary;
  onboard_sim: OnboardSimSummary;
}

export interface StatusResponse {
  status: string;
  sample: boolean;
  ai_mode: AiSource;
  llm_model: string;
  vlm_model: string;
  assumptions: {
    loss_per_ha_inr: number;
    assessment_time_manual_days: number;
    assessment_time_geoterra_hours: number;
    raw_scene_size_mb: number;
    insight_packet_size_kb: number;
    downlink_rate_mbps: number;
    haps_altitude_km: number;
    drone_endurance_min: number;
  };
  responsible_use: string;
}

export interface SceneItem {
  id: string;
  collection: string;
  datetime: string;
  orbit_state: string;
  relative_orbit: number;
  polarization: string;
  cloud_cover_pct: number | null;
  role: string;
}

export interface ScenesResponse {
  sample: boolean;
  stac_endpoint: string;
  aoi: string;
  scenes: SceneItem[];
}

export interface ConfusionMatrix {
  tn: number;
  fp: number;
  fn: number;
  tp: number;
}

export interface ModelResponse {
  model_card: {
    sample: boolean;
    model_name: string;
    architecture: string;
    input_channels: string[];
    loss_function: string;
    dataset: {
      name: string;
      chips_total: number;
      chip_size: string;
      crs: string;
      citation: string;
      splits: {
        train: number;
        valid: number;
        test: number;
        bolivia_holdout: number;
      };
    };
    baseline: {
      name: string;
      tuned_threshold_vh_db: number;
      tuned_on: string;
    };
    metrics: {
      validation: Record<string, number>;
      test: Record<string, number | ConfusionMatrix> & { confusion_matrix: ConfusionMatrix };
      bolivia_holdout: Record<string, number | ConfusionMatrix> & { confusion_matrix: ConfusionMatrix };
      karnataka_inference: {
        validated: boolean;
        note: string;
      };
    };
    limitations: string[];
  };
  training_log: {
    sample: boolean;
    best_epoch: number;
    best_val_iou: number;
    epochs: Array<{
      epoch: number;
      train_loss: number;
      val_loss: number;
      val_iou: number;
      val_f1: number;
    }>;
  };
}

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }>;
}

export interface AlertResponse {
  alert_text: string;
  tag: string;
  source: AiSource;
  validated: boolean;
  status_label: string;
  focus_zone_id: string | null;
}

export interface DescribeSiteResponse {
  site_id: string;
  description: string;
  tag: string;
  mandatory_label: string;
  source: AiSource;
}

export interface TriageSiteRank {
  rank: number;
  site_id: string;
  name: string;
  priority: "High" | "Medium" | "Low";
  rationale: string;
  recommended_verification: string;
}

export interface TriageResponse {
  simulation: boolean;
  tag: string;
  source: AiSource;
  ranked_sites: TriageSiteRank[];
}

export interface AskResponse {
  answer: string;
  tag: string;
  source: AiSource;
}
