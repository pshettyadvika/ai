"""Generate complete Bengaluru/Karnataka sample GeoJSONs, metrics JSONs, and before/after PNGs."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "backend" / "data"
GEO_DIR = DATA_DIR / "geo"
IMG_DIR = DATA_DIR / "images"

GEO_DIR.mkdir(parents=True, exist_ok=True)
IMG_DIR.mkdir(parents=True, exist_ok=True)


def _create_sar_pair() -> None:
    for name, flooded in [("sar_before.png", False), ("sar_after.png", True)]:
        img = Image.new("L", (640, 480), color=112)
        draw = ImageDraw.Draw(img)
        for x in range(0, 640, 32):
            draw.line([(x, 0), (x, 480)], fill=140, width=1)
        for y in range(0, 480, 32):
            draw.line([(0, y), (640, y)], fill=140, width=1)
        draw.ellipse([240, 170, 390, 270], fill=28)
        draw.ellipse([440, 190, 530, 260], fill=32)
        if flooded:
            draw.polygon([(200, 150), (430, 160), (550, 210), (520, 310), (260, 320)], fill=18)
            draw.polygon([(90, 260), (210, 270), (220, 360), (110, 355)], fill=22)
        img.save(IMG_DIR / name)


def _create_optical_pair() -> None:
    before = Image.new("RGB", (640, 480), color=(46, 108, 56))
    db = ImageDraw.Draw(before)
    for y in range(20, 460, 45):
        db.rectangle([30, y, 610, y + 32], fill=(58, 126, 66))
    db.line([(0, 380), (220, 330), (420, 260), (640, 180)], fill=(30, 78, 120), width=18)
    before.save(IMG_DIR / "change_before.png")

    after = before.copy()
    da = ImageDraw.Draw(after)
    da.polygon([(190, 130), (370, 145), (390, 275), (210, 285)], fill=(176, 98, 58))
    da.polygon([(235, 165), (335, 175), (345, 240), (245, 245)], fill=(142, 74, 44))
    after.save(IMG_DIR / "change_after.png")


def main() -> None:
    _create_sar_pair()
    _create_optical_pair()
    required = [
        DATA_DIR / "results.json",
        DATA_DIR / "scenes.json",
        DATA_DIR / "model_card.json",
        DATA_DIR / "training_log.json",
        GEO_DIR / "aoi.geojson",
        GEO_DIR / "flood_extent.geojson",
        GEO_DIR / "permanent_water.geojson",
        GEO_DIR / "assets.geojson",
        GEO_DIR / "change.geojson",
    ]
    missing = [str(p.relative_to(ROOT)) for p in required if not p.exists()]
    if missing:
        raise FileNotFoundError(f"Missing core JSON/GeoJSON files: {missing}")
    for p in required:
        json.loads(p.read_text(encoding="utf-8"))
    print(f"Verified {len(required)} sample JSON/GeoJSON files and generated 4 PNGs in {IMG_DIR}.")


if __name__ == "__main__":
    main()
