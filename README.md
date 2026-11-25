# GeoTerra AI — Orbit to Economy

> **Satellites see it. AI measures it. Authorities act on it.**

Built for **Aeromania '26 Mach-A-Thon ("Orbit to Economy: AI in Space")**, **GeoTerra AI** converts open Copernicus Sentinel-1 SAR, Sentinel-2 optical, JRC Global Surface Water, ESA WorldCover, and OpenStreetMap data into protective flood-impact telemetry, land-change verification queues, grounded NVIDIA NIM briefings, and multi-section PDF evidence reports for Bengaluru & Peri-Urban Karnataka.

---

## Responsible Use & Governance Commitments

- **Protective Use Only:** Monitoring, disaster early warning, evidence preservation, and infrastructure resilience only. Operates strictly at the area, polygon, and public-asset level—never targeting or tracking individuals or vehicles.
- **Honest Validation:** IoU and F1 metrics are reported exclusively on labeled ground-truth splits (`Sen1Floods11` test and held-out `Bolivia`). Karnataka operational predictions carry **no ground-truth labels** and are labeled **`Model prediction (unvalidated)`**.
- **Mandatory Classification Labels:**
  - Land-change polygons: **`Potential suspicious activity: requires official verification`** (never "illegal mining").
  - LLM/VLM outputs: **`AI-assisted, requires official verification`**.
  - Onboard-AI, HAPS, and drone relays: permanently badged **`SIMULATION`**.
- **Grounded AI & Assumptions:** Economic and orbital parameters live in centralized config files and are marked **`Assumption`** in the UI. LLMs run at temperature `0.2`, are forbidden from inventing numbers, and fall back seamlessly to `sha256` disk cache (`backend/cache/`) and deterministic templates.

---

## Two-Command Quickstart (Sample Data)

### Option A — Integrated Node/Express + React App (Port 3000)

```bash
npm install
npm run dev
```

Open `http://localhost:3000` — the app boots immediately with Bengaluru/Karnataka sample GeoJSONs, `results.json` (`"sample": true`), satellite/SAR before-after imagery, and PDF generation.

### Option B — Python FastAPI Backend (`backend/`)

```bash
python scripts/generate_sample_data.py && python scripts/prewarm_cache.py
uvicorn backend.app.main:app --reload --port 8000
```

Optionally copy `backend/.env.example` to `backend/.env` and add `NVIDIA_API_KEY` for live NVIDIA NIM calls (`AI: live`); without a key, the app runs offline from cache and deterministic templates (`AI: cached`).

---

## Offline ML Pipeline (Google Colab T4 GPU)

### 1. Download Sen1Floods11 v1.1 Hand-Labeled Subset

Run `ml/notebooks/01_get_sen1floods11.ipynb` or execute:

```bash
mkdir -p ml/data/sen1floods11/S1Hand ml/data/sen1floods11/LabelHand
gsutil -m rsync -r gs://sen1floods11/v1.1/data/flood_events/HandLabeled/S1Hand ml/data/sen1floods11/S1Hand
gsutil -m rsync -r gs://sen1floods11/v1.1/data/flood_events/HandLabeled/LabelHand ml/data/sen1floods11/LabelHand
```

### 2. Run Notebooks Sequentially

1. `ml/notebooks/01_get_sen1floods11.ipynb` — Downloads 446 hand-labeled S1 VV/VH chips (`512×512`, `EPSG:4326`) and official `train`/`valid`/`test`/`bolivia` CSV splits.
2. `ml/notebooks/02_baseline_threshold.ipynb` — Tunes a VH backscatter threshold strictly on `valid`, then evaluates `test` and `bolivia`.
3. `ml/notebooks/03_train_unet.ipynb` — Trains `smp.Unet("resnet34", in_channels=2, classes=1)` with Masked BCE+Dice loss (`-1` ignored), `torch.cuda.amp`, and early stopping (<30 min on Colab T4). Writes `ml/checkpoints/best_model.pt`, `training_log.json`, and `model_card.json` (citing *Bonafilia et al., 2020, CVPR Workshops*).
4. `ml/notebooks/04_karnataka_inference.ipynb` — Queries Microsoft Planetary Computer STAC (`sentinel-1-rtc`, `sentinel-2-l2a`, `jrc-gsw`, `esa-worldcover`), converts linear S1 power to dB (`[-30, 5]`), checks domain histograms, runs 256×256 blended sliding-window inference, masks permanent lakes, computes `EPSG:32643` hectares + OSM exposure, and exports real outputs (`"sample": false`) directly into `backend/data/`.

---

## Prewarming AI Cache for Offline Judging

```bash
python scripts/prewarm_cache.py
```

This populates `backend/cache/` with `sha256`-keyed JSON responses for `/api/ai/alert`, `/api/ai/describe-site`, `/api/ai/triage`, and the 3 starter Q&A prompts. Toggle **Demo Mode** in the top navigation bar to pin AI responses to cache during live stage demos.

---

## 5-Minute Hackathon Judge Demo Script

1. **Overview (`/`):** Turn on **Demo Mode** in the top bar. Highlight the yellow `SAMPLE DATA` transparency banner, the 4 KPI cards (1,842.6 ha flooded, 612.4 ha cropland, ₹2.76 Cr assumed crop exposure, 148.4 ha flagged change), and the Bengaluru mini-map.
2. **Flood Monitor (`/flood`):** Toggle JRC permanent water, roads, and critical infrastructure layers; click **Kengeri 220kV Substation** to `flyTo` the exposed asset; drag the Before/After SAR swipe slider; click **Generate AI alert** (note `Model prediction (unvalidated)` and `AI-assisted, requires official verification`).
3. **Impact & Value (`/impact`):** Adjust the `loss_per_ha_inr` What-If slider (labeled `Assumption`) to demonstrate live INR recalculation alongside the 14-day manual vs 2.5-hour GeoTerra turnaround chart.
4. **Model & Data (`/model`):** Show honest ground-truth metrics (Sen1Floods11 Test IoU `0.714`, Bolivia `0.642` vs baseline), training curves, and Planetary Computer STAC scene inventory.
5. **Land Change (`/land-change`):** Sort flagged sites by river distance, inspect the optical before/after slider, and click **Describe with AI** (highlighting `Potential suspicious activity: requires official verification`).
6. **Simulation (`/simulation`):** Note the permanent `SIMULATION` badge; toggle Onboard Insight Packet (`1.65 KB`) vs Raw Downlink (`940 MB`), run the animated `Satellite → HAPS → Drone → Verification` relay, and click **Rank flagged sites with AI**.
7. **Alerts & Reports (`/reports`):** Update a site's local verification status, ask a grounded starter question in the Q&A panel, and click **Generate Evidence Report (PDF)** to download the multi-section dossier with Responsible Use footer.
