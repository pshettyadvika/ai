from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image as RLImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .config import (
    IMAGES_DIR,
    KARNATAKA_UNVALIDATED_LABEL,
    MANDATORY_AI_TAG,
    MANDATORY_CHANGE_LABEL,
    RESPONSIBLE_USE_NOTICE,
)
from .schemas import ResultsContract


def _format_inr(amount_inr: float) -> str:
    if amount_inr >= 1e7:
        return f"INR {amount_inr / 1e7:.2f} Cr ({amount_inr:,.0f})"
    if amount_inr >= 1e5:
        return f"INR {amount_inr / 1e5:.2f} Lakhs ({amount_inr:,.0f})"
    return f"INR {amount_inr:,.0f}"


def build_evidence_pdf(results: ResultsContract, ai_summary: str, ai_source: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title="GeoTerra AI Evidence Report",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "GTTitle", parent=styles["Heading1"], fontSize=18, textColor=colors.HexColor("#0F172A"), spaceAfter=6
    )
    h2_style = ParagraphStyle(
        "GTH2", parent=styles["Heading2"], fontSize=12, textColor=colors.HexColor("#0E7490"), spaceBefore=12, spaceAfter=4
    )
    body_style = ParagraphStyle("GTBody", parent=styles["BodyText"], fontSize=9.5, leading=13.5)
    notice_style = ParagraphStyle(
        "GTNotice",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#92400E"),
        backColor=colors.HexColor("#FEF3C7"),
        borderPadding=6,
    )

    story = []
    story.append(Paragraph("GeoTerra AI — Protective Satellite Evidence & Resilience Report", title_style))
    story.append(
        Paragraph(
            f"Region: {results.region} | Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} | "
            f"Dataset Status: {'SAMPLE DATA (Demonstrative)' if results.sample else 'OPERATIONAL STAC RUN'}",
            body_style,
        )
    )
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            f"<b>Validation Notice:</b> Karnataka flood predictions carry NO ground-truth labels and are strictly "
            f"reported as <b>{KARNATAKA_UNVALIDATED_LABEL}</b>. Ground-truth validation metrics apply only to "
            f"Sen1Floods11 test (IoU {results.model.test_iou:.3f}, F1 {results.model.test_f1:.3f}) and Bolivia holdout "
            f"(IoU {results.model.bolivia_iou:.3f}, F1 {results.model.bolivia_f1:.3f}).",
            notice_style,
        )
    )

    story.append(Paragraph("1. Data Sources, Dates & Flood Impact Summary", h2_style))
    flood_table = Table(
        [
            ["Metric", "Value", "Classification / Scope"],
            ["Flood Acquisition Window", results.flood.acquisition_window, "Sentinel-1 RTC (Descending)"],
            ["Flooded Area (JRC masked)", f"{results.flood.flooded_area_ha:,.1f} ha", KARNATAKA_UNVALIDATED_LABEL],
            ["Affected Cropland (WorldCover)", f"{results.flood.cropland_affected_ha:,.1f} ha", KARNATAKA_UNVALIDATED_LABEL],
            ["Affected Roads / Buildings", f"{results.flood.roads_affected_km:.1f} km / {results.flood.buildings_affected_count}", "OSM intersection"],
            ["Critical Infrastructure Exposed", f"{results.flood.critical_infrastructure_count} assets", "Hospitals, substations, bridges"],
            ["Estimated Crop Exposure", _format_inr(results.total_loss_inr), f"Assumption: INR {results.economics.loss_per_ha_inr:,.0f}/ha"],
        ],
        colWidths=[5.2 * cm, 5.5 * cm, 6.8 * cm],
    )
    flood_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(flood_table)

    story.append(Paragraph("2. Land-Change Verification Queue", h2_style))
    story.append(Paragraph(f"Mandatory classification: <b>{MANDATORY_CHANGE_LABEL}</b>.", body_style))
    story.append(Spacer(1, 4))
    change_rows = [["ID", "Site & Taluk", "Area (ha)", "NDVI Delta", "River Dist.", "Coordinates (Lat, Lon)"]]
    for s in results.change.sites:
        change_rows.append(
            [s.id, f"{s.name} ({s.taluk})", f"{s.area_ha:.1f}", f"{s.ndvi_drop:.2f}", f"{s.river_distance_m:.0f} m", f"{s.lat:.4f}, {s.lon:.4f}"]
        )
    change_table = Table(change_rows, colWidths=[1.5 * cm, 5.5 * cm, 2.0 * cm, 2.2 * cm, 2.3 * cm, 4.0 * cm])
    change_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8.0),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                ("PADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(change_table)

    img_pairs = [
        ("SAR Flood Before", IMAGES_DIR / "sar_before.png", "SAR Flood After", IMAGES_DIR / "sar_after.png"),
        ("Optical Change Before", IMAGES_DIR / "change_before.png", "Optical Change After", IMAGES_DIR / "change_after.png"),
    ]
    available_rows = []
    for l1, p1, l2, p2 in img_pairs:
        if p1.exists() and p2.exists():
            available_rows.append([Paragraph(f"<b>{l1}</b>", body_style), Paragraph(f"<b>{l2}</b>", body_style)])
            available_rows.append([RLImage(str(p1), width=8.0 * cm, height=5.5 * cm), RLImage(str(p2), width=8.0 * cm, height=5.5 * cm)])
    if available_rows:
        story.append(Paragraph("3. Before / After Satellite Reference Imagery", h2_style))
        img_tbl = Table(available_rows, colWidths=[8.7 * cm, 8.7 * cm])
        story.append(img_tbl)

    story.append(Paragraph(f"4. AI-Assisted Briefing ({MANDATORY_AI_TAG} | source: {ai_source})", h2_style))
    story.append(Paragraph(ai_summary, body_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph(f"<b>{RESPONSIBLE_USE_NOTICE}</b>", notice_style))

    doc.build(story)
    return buf.getvalue()
