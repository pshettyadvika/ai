from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from .config import (
    ASSUMPTIONS,
    CORS_ORIGINS,
    DATA_DIR,
    GEO_DIR,
    IMAGES_DIR,
    LLM_MODEL,
    NVIDIA_API_KEY,
    RESPONSIBLE_USE_NOTICE,
    VLM_MODEL,
)
from .nim_client import (
    ask_grounded_question,
    describe_change_site,
    generate_flood_alert,
    triage_flagged_sites,
)
from .report import build_evidence_pdf
from .schemas import (
    AlertRequest,
    AskRequest,
    DescribeSiteRequest,
    ReportPdfRequest,
    ResultsContract,
    TriageRequest,
)

app = FastAPI(title="GeoTerra AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Required data file missing: {path.name}. Run scripts/generate_sample_data.py first.",
        )
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Malformed JSON in {path.name}: {exc}") from exc


def _load_results() -> ResultsContract:
    raw = _load_json(DATA_DIR / "results.json")
    try:
        return ResultsContract(**raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"results.json schema validation failed: {exc}") from exc


@app.get("/api/status")
def get_status() -> dict[str, Any]:
    results = _load_results()
    return {
        "status": "ok",
        "sample": results.sample,
        "ai_mode": "live" if bool(NVIDIA_API_KEY) else "cached",
        "llm_model": LLM_MODEL,
        "vlm_model": VLM_MODEL,
        "assumptions": {
            "loss_per_ha_inr": ASSUMPTIONS.loss_per_ha_inr,
            "assessment_time_manual_days": ASSUMPTIONS.assessment_time_manual_days,
            "assessment_time_geoterra_hours": ASSUMPTIONS.assessment_time_geoterra_hours,
            "raw_scene_size_mb": ASSUMPTIONS.raw_scene_size_mb,
            "insight_packet_size_kb": ASSUMPTIONS.insight_packet_size_kb,
            "downlink_rate_mbps": ASSUMPTIONS.downlink_rate_mbps,
            "haps_altitude_km": ASSUMPTIONS.haps_altitude_km,
            "drone_endurance_min": ASSUMPTIONS.drone_endurance_min,
        },
        "responsible_use": RESPONSIBLE_USE_NOTICE,
    }


@app.get("/api/results")
def get_results() -> dict[str, Any]:
    return _load_results().model_dump()


@app.get("/api/geo/{layer}")
def get_geo_layer(layer: str) -> dict[str, Any]:
    allowed = {"flood_extent", "assets", "change", "aoi", "permanent_water"}
    if layer not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid layer '{layer}'. Allowed: {sorted(allowed)}")
    return _load_json(GEO_DIR / f"{layer}.geojson")


@app.get("/api/images/{name}")
def get_image(name: str) -> FileResponse:
    safe_name = Path(name).name
    target = IMAGES_DIR / safe_name
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Image '{safe_name}' not found.")
    return FileResponse(target)


@app.get("/api/scenes")
def get_scenes() -> dict[str, Any]:
    return _load_json(DATA_DIR / "scenes.json")


@app.get("/api/model")
def get_model_info() -> dict[str, Any]:
    return {
        "model_card": _load_json(DATA_DIR / "model_card.json"),
        "training_log": _load_json(DATA_DIR / "training_log.json"),
    }


@app.post("/api/ai/alert")
def post_ai_alert(payload: AlertRequest) -> dict[str, Any]:
    results = _load_results()
    return generate_flood_alert(results, zone_id=payload.zone_id, demo_mode=payload.demo_mode)


@app.post("/api/ai/describe-site")
def post_ai_describe_site(payload: DescribeSiteRequest) -> dict[str, Any]:
    results = _load_results()
    return describe_change_site(
        results, site_id=payload.site_id, image_name=payload.image_name, demo_mode=payload.demo_mode
    )


@app.post("/api/ai/triage")
def post_ai_triage(payload: TriageRequest) -> dict[str, Any]:
    results = _load_results()
    return triage_flagged_sites(results, demo_mode=payload.demo_mode).model_dump()


@app.post("/api/ai/ask")
def post_ai_ask(payload: AskRequest) -> dict[str, Any]:
    results = _load_results()
    return ask_grounded_question(results, question=payload.question, demo_mode=payload.demo_mode)


@app.post("/api/report/pdf")
def post_report_pdf(payload: ReportPdfRequest) -> Response:
    results = _load_results()
    alert = generate_flood_alert(results, demo_mode=payload.demo_mode)
    pdf_bytes = build_evidence_pdf(results, ai_summary=alert["alert_text"], ai_source=alert["source"])
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="geoterra_evidence_report.pdf"'},
    )
