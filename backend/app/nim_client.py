from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from openai import OpenAI

from .config import (
    CACHE_DIR,
    IMAGES_DIR,
    LLM_MODEL,
    MANDATORY_AI_TAG,
    MANDATORY_CHANGE_LABEL,
    NIM_TEMPERATURE,
    NIM_TIMEOUT_SEC,
    NVIDIA_API_KEY,
    NVIDIA_BASE_URL,
    VLM_MODEL,
)
from .schemas import ResultsContract, TriageResponse, TriageSiteRank


SYSTEM_GUARDRAIL = (
    "You are GeoTerra AI's protective geospatial analyst. Strict rules:\n"
    "1. Protective monitoring, early warning, evidence, and resilience ONLY. "
    "Never mention weapons, targeting, or tracking individuals or vehicles.\n"
    "2. NEVER invent, estimate, or alter any numbers. Use ONLY the exact numbers provided in the JSON context.\n"
    "3. For land-change sites, ALWAYS state 'Potential suspicious activity: requires official verification' and NEVER say 'illegal mining'.\n"
    "4. Note that Karnataka flood outputs are unvalidated model predictions requiring local verification.\n"
)


def _format_inr_lakhs_crores(amount_inr: float) -> str:
    if amount_inr >= 1e7:
        return f"₹{amount_inr / 1e7:.2f} Cr"
    if amount_inr >= 1e5:
        return f"₹{amount_inr / 1e5:.2f} Lakhs"
    return f"₹{amount_inr:,.0f}"


def _sha256_key(model: str, prompt: str, image_hash: str = "") -> str:
    payload = f"{model}||{prompt}||{image_hash}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _hash_image(image_path: Path | None) -> str:
    if image_path is None or not image_path.exists():
        return "no-image"
    return hashlib.sha256(image_path.read_bytes()).hexdigest()


def _read_cache(cache_key: str) -> dict[str, Any] | None:
    path = CACHE_DIR / f"{cache_key}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_cache(cache_key: str, data: dict[str, Any]) -> None:
    path = CACHE_DIR / f"{cache_key}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _get_client() -> OpenAI | None:
    if not NVIDIA_API_KEY:
        return None
    return OpenAI(
        base_url=NVIDIA_BASE_URL,
        api_key=NVIDIA_API_KEY,
        timeout=NIM_TIMEOUT_SEC,
    )


def _call_nim_text(
    prompt: str,
    model: str = LLM_MODEL,
    demo_mode: bool = False,
    fallback_fn=None,
) -> tuple[str, str]:
    cache_key = _sha256_key(model, prompt, "no-image")
    cached = _read_cache(cache_key)
    if demo_mode and cached is not None:
        return cached["text"], "cached"

    client = None if demo_mode else _get_client()
    if client is not None:
        try:
            resp = client.chat.completions.create(
                model=model,
                temperature=NIM_TEMPERATURE,
                max_tokens=450,
                messages=[
                    {"role": "system", "content": SYSTEM_GUARDRAIL},
                    {"role": "user", "content": prompt},
                ],
            )
            text = (resp.choices[0].message.content or "").strip()
            if text:
                _write_cache(cache_key, {"model": model, "text": text})
                return text, "live"
        except Exception:
            pass

    if cached is not None:
        return cached["text"], "cached"

    text = fallback_fn() if fallback_fn is not None else "No grounded data available."
    _write_cache(cache_key, {"model": "deterministic-template", "text": text})
    return text, "cached"


def generate_flood_alert(results: ResultsContract, zone_id: str | None = None, demo_mode: bool = False) -> dict[str, Any]:
    settlements = results.flood.prioritized_settlements
    target = next((s for s in settlements if s.id == zone_id), settlements[0] if settlements else None)
    zone_desc = (
        f"{target.name} ({target.taluk}): {target.flooded_ha:.1f} ha inundated, "
        f"{target.buildings_at_risk} buildings at risk, {target.roads_km:.1f} km roads affected, priority {target.priority}."
        if target
        else "All monitored Bengaluru wards."
    )
    loss_str = _format_inr_lakhs_crores(results.total_loss_inr)
    context = {
        "region": results.region,
        "window": results.flood.acquisition_window,
        "status": results.flood.status_label,
        "flooded_area_ha": results.flood.flooded_area_ha,
        "cropland_affected_ha": results.flood.cropland_affected_ha,
        "roads_affected_km": results.flood.roads_affected_km,
        "buildings_affected_count": results.flood.buildings_affected_count,
        "estimated_crop_loss": loss_str,
        "focus_zone": zone_desc,
    }
    prompt = (
        "Draft a concise 3-sentence protective disaster early-warning alert for Karnataka State Disaster Management Authority "
        "based strictly on these verified figures (do not invent any numbers):\n"
        f"{json.dumps(context, indent=2)}"
    )

    def _fallback() -> str:
        return (
            f"Protective Early Warning ({results.flood.status_label}): Sentinel-1 SAR analysis for {results.region} "
            f"({results.flood.acquisition_window}) indicates {results.flood.flooded_area_ha:,.1f} ha of inundation, "
            f"affecting {results.flood.cropland_affected_ha:,.1f} ha of cropland (estimated exposure {loss_str}), "
            f"{results.flood.roads_affected_km:.1f} km of roads, and {results.flood.buildings_affected_count} buildings. "
            f"Priority focus: {zone_desc} Field verification teams should inspect exposed substations, bridges, and "
            f"hospital access corridors prior to issuing local advisories."
        )

    text, source = _call_nim_text(prompt, model=LLM_MODEL, demo_mode=demo_mode, fallback_fn=_fallback)
    return {
        "alert_text": text,
        "tag": MANDATORY_AI_TAG,
        "source": source,
        "validated": results.flood.validated,
        "status_label": results.flood.status_label,
        "focus_zone_id": target.id if target else None,
    }


def describe_change_site(
    results: ResultsContract,
    site_id: str,
    image_name: str | None = "optical_change_after.jpg",
    demo_mode: bool = False,
) -> dict[str, Any]:
    site = next((s for s in results.change.sites if s.id == site_id), None)
    if site is None:
        site = results.change.sites[0]

    image_path = IMAGES_DIR / (image_name or "optical_change_after.jpg")
    image_hash = _hash_image(image_path)
    prompt = (
        "Inspect this Sentinel-2 land-change site and summarize the surface disturbance objectively for official verification. "
        "Use ONLY these measured metrics and NEVER say 'illegal mining'; use 'Potential suspicious activity: requires official verification':\n"
        f"{json.dumps(site.model_dump(), indent=2)}"
    )
    cache_key = _sha256_key(VLM_MODEL, prompt, image_hash)
    cached = _read_cache(cache_key)

    def _fallback_desc() -> str:
        river_note = (
            f"located {site.river_distance_m:.0f} m from a mapped river channel"
            if site.near_river
            else f"located {site.river_distance_m:.0f} m from the nearest mapped river channel"
        )
        return (
            f"{site.name} ({site.taluk}, {site.lat:.3f}°N, {site.lon:.3f}°E) exhibits {site.area_ha:.1f} ha of "
            f"vegetation loss (NDVI delta {site.ndvi_drop:.2f}) accompanied by exposed bare soil "
            f"(BSI delta +{site.bare_soil_index_delta:.2f}) over prior {site.land_cover_prior}, {river_note}. "
            f"Model confidence is {int(site.confidence * 100)}%. Classification: {MANDATORY_CHANGE_LABEL}."
        )

    if demo_mode and cached is not None:
        return {
            "site_id": site.id,
            "description": cached["text"],
            "tag": MANDATORY_AI_TAG,
            "mandatory_label": MANDATORY_CHANGE_LABEL,
            "source": "cached",
        }

    client = None if demo_mode else _get_client()
    if client is not None and image_path.exists():
        try:
            b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
            mime = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
            resp = client.chat.completions.create(
                model=VLM_MODEL,
                temperature=NIM_TEMPERATURE,
                max_tokens=350,
                messages=[
                    {"role": "system", "content": SYSTEM_GUARDRAIL},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                        ],
                    },
                ],
            )
            text = (resp.choices[0].message.content or "").strip()
            if text:
                _write_cache(cache_key, {"model": VLM_MODEL, "text": text})
                return {
                    "site_id": site.id,
                    "description": text,
                    "tag": MANDATORY_AI_TAG,
                    "mandatory_label": MANDATORY_CHANGE_LABEL,
                    "source": "live",
                }
        except Exception:
            pass

    if cached is not None:
        return {
            "site_id": site.id,
            "description": cached["text"],
            "tag": MANDATORY_AI_TAG,
            "mandatory_label": MANDATORY_CHANGE_LABEL,
            "source": "cached",
        }

    text = _fallback_desc()
    _write_cache(cache_key, {"model": "deterministic-template", "text": text})
    return {
        "site_id": site.id,
        "description": text,
        "tag": MANDATORY_AI_TAG,
        "mandatory_label": MANDATORY_CHANGE_LABEL,
        "source": "cached",
    }


def _extract_json_block(raw: str) -> dict[str, Any] | None:
    match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def triage_flagged_sites(results: ResultsContract, demo_mode: bool = False) -> TriageResponse:
    sites_payload = [s.model_dump() for s in results.change.sites]
    prompt = (
        "Rank the following flagged land-change sites for protective HAPS/drone verification dispatch. "
        "Return STRICT JSON matching {\"ranked_sites\": [{\"rank\": 1, \"site_id\": \"...\", \"name\": \"...\", "
        "\"priority\": \"High|Medium|Low\", \"rationale\": \"...\", \"recommended_verification\": \"...\"}]}. "
        "Do NOT invent numbers and NEVER use the phrase 'illegal mining'.\n"
        f"{json.dumps(sites_payload, indent=2)}"
    )
    cache_key = _sha256_key(LLM_MODEL, prompt, "triage")
    cached = _read_cache(cache_key)

    def _fallback_triage() -> list[TriageSiteRank]:
        ordered = sorted(
            results.change.sites,
            key=lambda s: (1 if s.near_river else 0, s.confidence, s.area_ha),
            reverse=True,
        )
        ranked: list[TriageSiteRank] = []
        for idx, s in enumerate(ordered, start=1):
            prio = "High" if (s.near_river and s.confidence >= 0.8) else ("Medium" if s.confidence >= 0.74 else "Low")
            river_txt = f"within {s.river_distance_m:.0f} m of river buffer" if s.near_river else f"{s.river_distance_m:.0f} m from nearest river"
            ranked.append(
                TriageSiteRank(
                    rank=idx,
                    site_id=s.id,
                    name=s.name,
                    priority=prio,
                    rationale=(
                        f"{s.area_ha:.1f} ha disturbance ({int(s.confidence * 100)}% confidence, NDVI {s.ndvi_drop:.2f}), "
                        f"{river_txt}. {MANDATORY_CHANGE_LABEL}."
                    ),
                    recommended_verification="Simulated HAPS optical confirmation followed by district survey boundary check.",
                )
            )
        return ranked

    if demo_mode and cached is not None:
        return TriageResponse(
            simulation=True,
            tag=MANDATORY_AI_TAG,
            source="cached",
            ranked_sites=[TriageSiteRank(**item) for item in cached["ranked_sites"]],
        )

    client = None if demo_mode else _get_client()
    if client is not None:
        for attempt in range(2):
            try:
                retry_note = "" if attempt == 0 else "\nPrevious output was not valid JSON. Return ONLY valid JSON."
                resp = client.chat.completions.create(
                    model=LLM_MODEL,
                    temperature=NIM_TEMPERATURE,
                    max_tokens=700,
                    messages=[
                        {"role": "system", "content": SYSTEM_GUARDRAIL},
                        {"role": "user", "content": prompt + retry_note},
                    ],
                )
                parsed = _extract_json_block(resp.choices[0].message.content or "")
                if parsed and isinstance(parsed.get("ranked_sites"), list):
                    validated = [TriageSiteRank(**item) for item in parsed["ranked_sites"]]
                    _write_cache(cache_key, {"ranked_sites": [v.model_dump() for v in validated]})
                    return TriageResponse(
                        simulation=True,
                        tag=MANDATORY_AI_TAG,
                        source="live",
                        ranked_sites=validated,
                    )
            except Exception:
                continue

    if cached is not None:
        return TriageResponse(
            simulation=True,
            tag=MANDATORY_AI_TAG,
            source="cached",
            ranked_sites=[TriageSiteRank(**item) for item in cached["ranked_sites"]],
        )

    ranked = _fallback_triage()
    _write_cache(cache_key, {"ranked_sites": [v.model_dump() for v in ranked]})
    return TriageResponse(
        simulation=True,
        tag=MANDATORY_AI_TAG,
        source="cached",
        ranked_sites=ranked,
    )


def ask_grounded_question(results: ResultsContract, question: str, demo_mode: bool = False) -> dict[str, Any]:
    grounded_context = {
        "region": results.region,
        "sample": results.sample,
        "model": results.model.model_dump(),
        "flood": results.flood.model_dump(),
        "change": results.change.model_dump(),
        "economics": {**results.economics.model_dump(), "total_loss_inr": results.total_loss_inr},
        "onboard_sim": results.onboard_sim.model_dump(),
    }
    prompt = (
        "Answer the user's question using ONLY the JSON telemetry below. "
        "If the answer is not in the JSON, explicitly state that it is not present in the dataset. "
        "NEVER invent numbers.\n\n"
        f"Question: {question}\n\nData:\n{json.dumps(grounded_context, indent=2)}"
    )

    def _fallback_answer() -> str:
        q = question.lower()
        if "loss" in q or "cropland" in q or "econom" in q or "inr" in q or "rupee" in q:
            return (
                f"Estimated cropland flood exposure is {_format_inr_lakhs_crores(results.total_loss_inr)} "
                f"({results.flood.cropland_affected_ha:.1f} ha affected × ₹{results.economics.loss_per_ha_inr:,.0f}/ha assumption). "
                f"Assessment turnaround is {results.economics.assessment_time_geoterra_hours} hours compared to a "
                f"{results.economics.assessment_time_manual_days}-day manual baseline assumption."
            )
        if "flood" in q or "settlement" in q or "infrastructure" in q or "road" in q:
            top = results.flood.prioritized_settlements[0]
            return (
                f"In {results.region}, {results.flood.flooded_area_ha:,.1f} ha are flagged as inundated "
                f"({results.flood.status_label}), affecting {results.flood.roads_affected_km:.1f} km of roads, "
                f"{results.flood.buildings_affected_count} buildings, and {results.flood.critical_infrastructure_count} "
                f"critical infrastructure assets. Highest-priority zone: {top.name} ({top.flooded_ha:.1f} ha)."
            )
        if "change" in q or "mining" in q or "river" in q or "site" in q:
            top_c = results.change.sites[0]
            return (
                f"{results.change.flagged_sites_count} sites totaling {results.change.total_flagged_ha:.1f} ha are flagged "
                f"({results.change.river_proximity_sites_count} near rivers), led by {top_c.name} ({top_c.area_ha:.1f} ha, "
                f"NDVI {top_c.ndvi_drop:.2f}). Label: {MANDATORY_CHANGE_LABEL}."
            )
        if "model" in q or "iou" in q or "f1" in q or "bolivia" in q or "accuracy" in q:
            return (
                f"On Sen1Floods11 test split, U-Net (ResNet-34) achieves IoU {results.model.test_iou:.3f} and F1 "
                f"{results.model.test_f1:.3f} (vs baseline IoU {results.model.baseline_test_iou:.3f}); on held-out Bolivia, "
                f"IoU is {results.model.bolivia_iou:.3f} and F1 is {results.model.bolivia_f1:.3f}. Karnataka has no ground-truth "
                f"labels and is reported strictly as '{results.model.karnataka_status_label}'."
            )
        return (
            f"GeoTerra AI covers {results.region}: {results.flood.flooded_area_ha:,.1f} ha flooded ({results.flood.status_label}), "
            f"{results.change.total_flagged_ha:.1f} ha land-change ({MANDATORY_CHANGE_LABEL}), and "
            f"{_format_inr_lakhs_crores(results.total_loss_inr)} estimated crop exposure."
        )

    text, source = _call_nim_text(prompt, model=LLM_MODEL, demo_mode=demo_mode, fallback_fn=_fallback_answer)
    return {
        "answer": text,
        "tag": MANDATORY_AI_TAG,
        "source": source,
    }
