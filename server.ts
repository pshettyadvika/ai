import "dotenv/config";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import PDFDocument from "pdfkit";
import { createServer as createViteServer } from "vite";

const PORT = 3000;
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "backend", "data");
const GEO_DIR = path.join(DATA_DIR, "geo");
const CACHE_DIR = path.join(ROOT_DIR, "backend", "cache");
const ASSETS_IMAGES_DIR = path.join(ROOT_DIR, "src", "assets", "images");
const DATA_IMAGES_DIR = path.join(DATA_DIR, "images");

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(DATA_IMAGES_DIR, { recursive: true });

const NVIDIA_API_KEY = (process.env.NVIDIA_API_KEY || "").trim();
const LLM_MODEL = process.env.NVIDIA_LLM_MODEL || "meta/llama-3.1-70b-instruct";
const VLM_MODEL = process.env.NVIDIA_VLM_MODEL || "microsoft/phi-3.5-vision-instruct";

const ASSUMPTIONS = {
  loss_per_ha_inr: 45000,
  assessment_time_manual_days: 14,
  assessment_time_geoterra_hours: 2.5,
  raw_scene_size_mb: 940.0,
  insight_packet_size_kb: 1.65,
  downlink_rate_mbps: 12.0,
  haps_altitude_km: 20.0,
  drone_endurance_min: 45,
};

const MANDATORY_AI_TAG = "AI-assisted, requires official verification";
const MANDATORY_CHANGE_LABEL = "Potential suspicious activity: requires official verification";
const KARNATAKA_UNVALIDATED_LABEL = "Model prediction (unvalidated)";
const RESPONSIBLE_USE_NOTICE =
  "Responsible Use: GeoTerra AI is strictly designed for protective environmental monitoring, disaster early warning, evidence preservation, and infrastructure resilience. It operates strictly at the area, polygon, and public-asset level and does not perform targeting, surveillance, or tracking of individuals or vehicles.";

const IMAGE_ALIAS_MAP: Record<string, string> = {
  "sar_before.png": "sar_flood_before_1795636217965.jpg",
  "sar_before.jpg": "sar_flood_before_1795636217965.jpg",
  "sar_after.png": "sar_flood_after_1795636218632.jpg",
  "sar_after.jpg": "sar_flood_after_1795636218632.jpg",
  "change_before.png": "optical_change_before_1795636219682.jpg",
  "change_before.jpg": "optical_change_before_1795636219682.jpg",
  "change_after.png": "optical_change_after_1795636220006.jpg",
  "change_after.jpg": "optical_change_after_1795636220006.jpg",
};

function readJsonFile<T = unknown>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing data file: ${path.basename(filePath)}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function formatInr(amount: number): string {
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)} Lakhs`;
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function resolveImageFile(name: string): string | null {
  const safeName = path.basename(name);
  const directData = path.join(DATA_IMAGES_DIR, safeName);
  if (fs.existsSync(directData)) return directData;
  const alias = IMAGE_ALIAS_MAP[safeName] || safeName;
  const assetPath = path.join(ASSETS_IMAGES_DIR, alias);
  if (fs.existsSync(assetPath)) return assetPath;
  return null;
}

function sha256Key(model: string, prompt: string, imageHash = "no-image"): string {
  return crypto.createHash("sha256").update(`${model}||${prompt}||${imageHash}`).digest("hex");
}

function readDiskCache(key: string): Record<string, unknown> | null {
  const target = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeDiskCache(key: string, payload: Record<string, unknown>): void {
  const target = path.join(CACHE_DIR, `${key}.json`);
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), "utf-8");
}

function getNimClient(): OpenAI | null {
  if (!NVIDIA_API_KEY) return null;
  return new OpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: NVIDIA_API_KEY,
    timeout: 8000,
  });
}

const SYSTEM_GUARDRAIL = [
  "You are GeoTerra AI's protective geospatial analyst. Strict rules:",
  "1. Protective monitoring, early warning, evidence, and resilience ONLY. Never mention weapons, targeting, or tracking individuals or vehicles.",
  "2. NEVER invent, estimate, or alter any numbers. Use ONLY exact figures from the provided JSON.",
  "3. For land-change sites, ALWAYS state 'Potential suspicious activity: requires official verification' and NEVER say 'illegal mining'.",
  "4. Note that Karnataka flood outputs are unvalidated model predictions requiring local verification.",
].join("\n");

async function callNimText(
  prompt: string,
  model: string,
  demoMode: boolean,
  fallbackFn: () => string
): Promise<{ text: string; source: "live" | "cached" }> {
  const key = sha256Key(model, prompt, "no-image");
  const cached = readDiskCache(key);
  if (demoMode && cached && typeof cached.text === "string") {
    return { text: cached.text, source: "cached" };
  }

  const client = demoMode ? null : getNimClient();
  if (client) {
    try {
      const resp = await client.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: 450,
        messages: [
          { role: "system", content: SYSTEM_GUARDRAIL },
          { role: "user", content: prompt },
        ],
      });
      const text = (resp.choices[0]?.message?.content || "").trim();
      if (text) {
        writeDiskCache(key, { model, text });
        return { text, source: "live" };
      }
    } catch {
      // Fallback to cache or deterministic grounded template
    }
  }

  if (cached && typeof cached.text === "string") {
    return { text: cached.text, source: "cached" };
  }

  const text = fallbackFn();
  writeDiskCache(key, { model: "deterministic-template", text });
  return { text, source: "cached" };
}

interface ResultsData {
  sample: boolean;
  generated_at: string;
  region: string;
  aoi_bbox: number[];
  model: Record<string, unknown>;
  flood: {
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
    prioritized_settlements: Array<{
      id: string;
      name: string;
      taluk: string;
      flooded_ha: number;
      buildings_at_risk: number;
      roads_km: number;
      priority: string;
      lat: number;
      lon: number;
    }>;
    critical_infrastructure: Array<{
      id: string;
      name: string;
      type: string;
      distance_to_flood_m: number;
      status: string;
      lat: number;
      lon: number;
    }>;
  };
  change: {
    baseline_window: string;
    current_window: string;
    total_flagged_ha: number;
    flagged_sites_count: number;
    river_proximity_sites_count: number;
    mandatory_label: string;
    sites: Array<{
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
    }>;
  };
  economics: {
    loss_per_ha_inr: number;
    assessment_time_manual_days: number;
    assessment_time_geoterra_hours: number;
    total_loss_inr: number;
    time_saved_hours: number;
    open_data_cost_inr: number;
    note: string;
  };
  onboard_sim: {
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
  };
}

function loadResults(): ResultsData {
  const data = readJsonFile<ResultsData>(path.join(DATA_DIR, "results.json"));
  const totalLoss = Math.round(data.flood.cropland_affected_ha * data.economics.loss_per_ha_inr);
  data.economics.total_loss_inr = totalLoss;
  data.economics.time_saved_hours = Number(
    (data.economics.assessment_time_manual_days * 24 - data.economics.assessment_time_geoterra_hours).toFixed(2)
  );
  return data;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/status", (_req, res) => {
    try {
      const results = loadResults();
      res.json({
        status: "ok",
        sample: results.sample,
        ai_mode: NVIDIA_API_KEY ? "live" : "cached",
        llm_model: LLM_MODEL,
        vlm_model: VLM_MODEL,
        assumptions: ASSUMPTIONS,
        responsible_use: RESPONSIBLE_USE_NOTICE,
      });
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : "Failed to load status" });
    }
  });

  app.get("/api/results", (_req, res) => {
    try {
      res.json(loadResults());
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : "Failed to load results.json" });
    }
  });

  app.get("/api/geo/:layer", (req, res) => {
    const allowed = new Set(["flood_extent", "assets", "change", "aoi", "permanent_water"]);
    const { layer } = req.params;
    if (!allowed.has(layer)) {
      res.status(400).json({ detail: `Invalid layer '${layer}'.` });
      return;
    }
    try {
      res.json(readJsonFile(path.join(GEO_DIR, `${layer}.geojson`)));
    } catch (err) {
      res.status(404).json({ detail: err instanceof Error ? err.message : "GeoJSON not found" });
    }
  });

  app.get("/api/images/:name", (req, res) => {
    const target = resolveImageFile(req.params.name);
    if (!target) {
      res.status(404).json({ detail: "Image not found" });
      return;
    }
    res.sendFile(target);
  });

  app.get("/api/scenes", (_req, res) => {
    try {
      res.json(readJsonFile(path.join(DATA_DIR, "scenes.json")));
    } catch (err) {
      res.status(404).json({ detail: err instanceof Error ? err.message : "scenes.json not found" });
    }
  });

  app.get("/api/model", (_req, res) => {
    try {
      res.json({
        model_card: readJsonFile(path.join(DATA_DIR, "model_card.json")),
        training_log: readJsonFile(path.join(DATA_DIR, "training_log.json")),
      });
    } catch (err) {
      res.status(404).json({ detail: err instanceof Error ? err.message : "Model files not found" });
    }
  });

  app.post("/api/ai/alert", async (req, res) => {
    try {
      const results = loadResults();
      const zoneId = typeof req.body?.zone_id === "string" ? req.body.zone_id : undefined;
      const demoMode = Boolean(req.body?.demo_mode);
      const settlements = results.flood.prioritized_settlements;
      const target = settlements.find((s) => s.id === zoneId) || settlements[0];
      const lossStr = formatInr(results.economics.total_loss_inr);
      const zoneDesc = target
        ? `${target.name} (${target.taluk}): ${target.flooded_ha.toFixed(1)} ha inundated, ${target.buildings_at_risk} buildings at risk, ${target.roads_km.toFixed(1)} km roads affected, priority ${target.priority}.`
        : "All monitored Bengaluru wards.";

      const prompt = `Draft a concise 3-sentence protective disaster early-warning alert for KSDMA using ONLY these exact figures:\n${JSON.stringify(
        {
          region: results.region,
          window: results.flood.acquisition_window,
          status: results.flood.status_label,
          flooded_area_ha: results.flood.flooded_area_ha,
          cropland_affected_ha: results.flood.cropland_affected_ha,
          roads_affected_km: results.flood.roads_affected_km,
          buildings_affected_count: results.flood.buildings_affected_count,
          estimated_crop_loss: lossStr,
          focus_zone: zoneDesc,
        },
        null,
        2
      )}`;

      const { text, source } = await callNimText(prompt, LLM_MODEL, demoMode, () => {
        return `Protective Early Warning (${results.flood.status_label}): Sentinel-1 SAR analysis for ${results.region} (${results.flood.acquisition_window}) indicates ${results.flood.flooded_area_ha.toLocaleString("en-IN", { maximumFractionDigits: 1 })} ha of inundation, affecting ${results.flood.cropland_affected_ha.toLocaleString("en-IN", { maximumFractionDigits: 1 })} ha of cropland (estimated exposure ${lossStr}), ${results.flood.roads_affected_km.toFixed(1)} km of roads, and ${results.flood.buildings_affected_count} buildings. Priority focus: ${zoneDesc} Field verification teams should inspect exposed substations, bridges, and hospital access corridors prior to issuing local advisories.`;
      });

      res.json({
        alert_text: text,
        tag: MANDATORY_AI_TAG,
        source,
        validated: results.flood.validated,
        status_label: results.flood.status_label,
        focus_zone_id: target?.id || null,
      });
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : "Failed to generate alert" });
    }
  });

  app.post("/api/ai/describe-site", async (req, res) => {
    try {
      const results = loadResults();
      const siteId = typeof req.body?.site_id === "string" ? req.body.site_id : "CHG-01";
      const imageName = typeof req.body?.image_name === "string" ? req.body.image_name : "change_after.jpg";
      const demoMode = Boolean(req.body?.demo_mode);
      const site = results.change.sites.find((s) => s.id === siteId) || results.change.sites[0];
      const imgPath = resolveImageFile(imageName);
      const imgHash = imgPath ? crypto.createHash("sha256").update(fs.readFileSync(imgPath)).digest("hex") : "no-image";

      const prompt = `Inspect this Sentinel-2 land-change site and summarize the surface disturbance objectively for official verification. Use ONLY these measured metrics and NEVER say 'illegal mining'; use '${MANDATORY_CHANGE_LABEL}':\n${JSON.stringify(site, null, 2)}`;
      const cacheKey = sha256Key(VLM_MODEL, prompt, imgHash);
      const cached = readDiskCache(cacheKey);

      const fallbackText = () =>
        `${site.name} (${site.taluk}, ${site.lat.toFixed(3)}°N, ${site.lon.toFixed(3)}°E) exhibits ${site.area_ha.toFixed(1)} ha of vegetation loss (NDVI delta ${site.ndvi_drop.toFixed(2)}) accompanied by exposed bare soil (BSI delta +${site.bare_soil_index_delta.toFixed(2)}) over prior ${site.land_cover_prior}, located ${site.river_distance_m.toFixed(0)} m from the nearest mapped river channel. Model confidence is ${Math.round(site.confidence * 100)}%. Classification: ${MANDATORY_CHANGE_LABEL}.`;

      if (demoMode && cached && typeof cached.text === "string") {
        res.json({
          site_id: site.id,
          description: cached.text,
          tag: MANDATORY_AI_TAG,
          mandatory_label: MANDATORY_CHANGE_LABEL,
          source: "cached",
        });
        return;
      }

      const client = demoMode ? null : getNimClient();
      if (client && imgPath) {
        try {
          const b64 = fs.readFileSync(imgPath).toString("base64");
          const mime = imgPath.endsWith(".png") ? "image/png" : "image/jpeg";
          const resp = await client.chat.completions.create({
            model: VLM_MODEL,
            temperature: 0.2,
            max_tokens: 350,
            messages: [
              { role: "system", content: SYSTEM_GUARDRAIL },
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
                ],
              },
            ],
          });
          const text = (resp.choices[0]?.message?.content || "").trim();
          if (text) {
            writeDiskCache(cacheKey, { model: VLM_MODEL, text });
            res.json({
              site_id: site.id,
              description: text,
              tag: MANDATORY_AI_TAG,
              mandatory_label: MANDATORY_CHANGE_LABEL,
              source: "live",
            });
            return;
          }
        } catch {
          // Fall through to cache / template
        }
      }

      if (cached && typeof cached.text === "string") {
        res.json({
          site_id: site.id,
          description: cached.text,
          tag: MANDATORY_AI_TAG,
          mandatory_label: MANDATORY_CHANGE_LABEL,
          source: "cached",
        });
        return;
      }

      const text = fallbackText();
      writeDiskCache(cacheKey, { model: "deterministic-template", text });
      res.json({
        site_id: site.id,
        description: text,
        tag: MANDATORY_AI_TAG,
        mandatory_label: MANDATORY_CHANGE_LABEL,
        source: "cached",
      });
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : "Failed to describe site" });
    }
  });

  app.post("/api/ai/triage", async (req, res) => {
    try {
      const results = loadResults();
      const demoMode = Boolean(req.body?.demo_mode);
      const prompt = `Rank these flagged land-change sites for protective HAPS/drone verification dispatch. Return STRICT JSON {"ranked_sites": [{"rank": 1, "site_id": "...", "name": "...", "priority": "High|Medium|Low", "rationale": "...", "recommended_verification": "..."}]}. Do NOT invent numbers and NEVER say 'illegal mining'.\n${JSON.stringify(results.change.sites, null, 2)}`;
      const cacheKey = sha256Key(LLM_MODEL, prompt, "triage");
      const cached = readDiskCache(cacheKey);

      const fallbackRanked = [...results.change.sites]
        .sort((a, b) => {
          const riverDiff = Number(b.near_river) - Number(a.near_river);
          if (riverDiff !== 0) return riverDiff;
          return b.confidence - a.confidence;
        })
        .map((s, idx) => ({
          rank: idx + 1,
          site_id: s.id,
          name: s.name,
          priority: s.near_river && s.confidence >= 0.8 ? "High" : s.confidence >= 0.74 ? "Medium" : "Low",
          rationale: `${s.area_ha.toFixed(1)} ha disturbance (${Math.round(s.confidence * 100)}% confidence, NDVI ${s.ndvi_drop.toFixed(2)}), ${s.river_distance_m.toFixed(0)} m from mapped river channel. ${MANDATORY_CHANGE_LABEL}.`,
          recommended_verification: "Simulated HAPS optical confirmation followed by district survey boundary check.",
        }));

      if (demoMode && cached && Array.isArray(cached.ranked_sites)) {
        res.json({
          simulation: true,
          tag: MANDATORY_AI_TAG,
          source: "cached",
          ranked_sites: cached.ranked_sites,
        });
        return;
      }

      const client = demoMode ? null : getNimClient();
      if (client) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const resp = await client.chat.completions.create({
              model: LLM_MODEL,
              temperature: 0.2,
              max_tokens: 700,
              messages: [
                { role: "system", content: SYSTEM_GUARDRAIL },
                {
                  role: "user",
                  content: attempt === 0 ? prompt : `${prompt}\nReturn ONLY valid JSON.`,
                },
              ],
            });
            const raw = resp.choices[0]?.message?.content || "";
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]) as { ranked_sites?: unknown[] };
              if (Array.isArray(parsed.ranked_sites) && parsed.ranked_sites.length > 0) {
                writeDiskCache(cacheKey, { ranked_sites: parsed.ranked_sites });
                res.json({
                  simulation: true,
                  tag: MANDATORY_AI_TAG,
                  source: "live",
                  ranked_sites: parsed.ranked_sites,
                });
                return;
              }
            }
          } catch {
            // Retry once, then fall back
          }
        }
      }

      if (cached && Array.isArray(cached.ranked_sites)) {
        res.json({
          simulation: true,
          tag: MANDATORY_AI_TAG,
          source: "cached",
          ranked_sites: cached.ranked_sites,
        });
        return;
      }

      writeDiskCache(cacheKey, { ranked_sites: fallbackRanked });
      res.json({
        simulation: true,
        tag: MANDATORY_AI_TAG,
        source: "cached",
        ranked_sites: fallbackRanked,
      });
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : "Failed to triage sites" });
    }
  });

  app.post("/api/ai/ask", async (req, res) => {
    try {
      const results = loadResults();
      const question = String(req.body?.question || "").trim();
      const demoMode = Boolean(req.body?.demo_mode);
      if (question.length < 2) {
        res.status(400).json({ detail: "Question must be at least 2 characters." });
        return;
      }

      const prompt = `Answer the user's question using ONLY the JSON telemetry below. If the answer is not present, state that clearly. NEVER invent numbers.\n\nQuestion: ${question}\n\nData:\n${JSON.stringify(results, null, 2)}`;

      const { text, source } = await callNimText(prompt, LLM_MODEL, demoMode, () => {
        const q = question.toLowerCase();
        if (q.includes("loss") || q.includes("cropland") || q.includes("econom") || q.includes("inr") || q.includes("rupee")) {
          return `Estimated cropland flood exposure is ${formatInr(results.economics.total_loss_inr)} (${results.flood.cropland_affected_ha.toFixed(1)} ha affected × ₹${results.economics.loss_per_ha_inr.toLocaleString("en-IN")}/ha assumption). GeoTerra turnaround is ${results.economics.assessment_time_geoterra_hours} hours vs a ${results.economics.assessment_time_manual_days}-day manual baseline assumption.`;
        }
        if (q.includes("flood") || q.includes("settlement") || q.includes("infrastructure") || q.includes("road")) {
          const top = results.flood.prioritized_settlements[0];
          return `In ${results.region}, ${results.flood.flooded_area_ha.toLocaleString("en-IN", { maximumFractionDigits: 1 })} ha are flagged as inundated (${results.flood.status_label}), affecting ${results.flood.roads_affected_km.toFixed(1)} km of roads, ${results.flood.buildings_affected_count} buildings, and ${results.flood.critical_infrastructure_count} critical infrastructure assets. Highest-priority zone: ${top.name} (${top.flooded_ha.toFixed(1)} ha).`;
        }
        if (q.includes("change") || q.includes("mining") || q.includes("river") || q.includes("site")) {
          const topC = results.change.sites[0];
          return `${results.change.flagged_sites_count} sites totaling ${results.change.total_flagged_ha.toFixed(1)} ha are flagged (${results.change.river_proximity_sites_count} near rivers), led by ${topC.name} (${topC.area_ha.toFixed(1)} ha, NDVI ${topC.ndvi_drop.toFixed(2)}). Classification: ${MANDATORY_CHANGE_LABEL}.`;
        }
        if (q.includes("model") || q.includes("iou") || q.includes("f1") || q.includes("bolivia") || q.includes("accuracy")) {
          return `On Sen1Floods11 test split, U-Net (ResNet-34) achieves IoU ${Number(results.model.test_iou).toFixed(3)} and F1 ${Number(results.model.test_f1).toFixed(3)} (vs baseline IoU ${Number(results.model.baseline_test_iou).toFixed(3)}); on held-out Bolivia, IoU is ${Number(results.model.bolivia_iou).toFixed(3)} and F1 is ${Number(results.model.bolivia_f1).toFixed(3)}. Karnataka has no ground-truth labels and is strictly reported as '${KARNATAKA_UNVALIDATED_LABEL}'.`;
        }
        return `GeoTerra AI telemetry for ${results.region}: ${results.flood.flooded_area_ha.toLocaleString("en-IN", { maximumFractionDigits: 1 })} ha flooded (${results.flood.status_label}), ${results.change.total_flagged_ha.toFixed(1)} ha flagged land change (${MANDATORY_CHANGE_LABEL}), and ${formatInr(results.economics.total_loss_inr)} estimated crop exposure.`;
      });

      res.json({
        answer: text,
        tag: MANDATORY_AI_TAG,
        source,
      });
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : "Failed to answer question" });
    }
  });

  app.post("/api/report/pdf", async (req, res) => {
    try {
      const results = loadResults();
      const demoMode = Boolean(req.body?.demo_mode);
      const lossStr = formatInr(results.economics.total_loss_inr);
      const alertSummary = `Protective Early Warning (${results.flood.status_label}): Sentinel-1 SAR analysis for ${results.region} (${results.flood.acquisition_window}) flags ${results.flood.flooded_area_ha.toLocaleString("en-IN", { maximumFractionDigits: 1 })} ha inundated, affecting ${results.flood.cropland_affected_ha.toFixed(1)} ha of cropland (${lossStr} assumed exposure), ${results.flood.roads_affected_km.toFixed(1)} km of roads, and ${results.flood.buildings_affected_count} buildings. ${results.change.flagged_sites_count} land-change sites (${results.change.total_flagged_ha.toFixed(1)} ha) carry the classification '${MANDATORY_CHANGE_LABEL}'.`;

      const doc = new PDFDocument({ size: "A4", margin: 42 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="geoterra_evidence_report.pdf"');
        res.send(pdfBuffer);
      });

      doc.fontSize(17).fillColor("#0F172A").text("GeoTerra AI — Protective Satellite Evidence & Resilience Report");
      doc.moveDown(0.3);
      doc
        .fontSize(9.5)
        .fillColor("#475569")
        .text(
          `Region: ${results.region} | Generated: ${new Date().toISOString()} | Status: ${
            results.sample ? "SAMPLE DATA (Demonstrative)" : "OPERATIONAL STAC RUN"
          }`
        );

      doc.moveDown(0.7);
      doc.rect(42, doc.y, 511, 44).fill("#FEF3C7");
      doc
        .fillColor("#92400E")
        .fontSize(8.5)
        .text(
          `Validation Notice: Karnataka flood outputs carry NO ground-truth labels and are strictly labeled '${KARNATAKA_UNVALIDATED_LABEL}'. Ground-truth validation applies only to Sen1Floods11 test (IoU ${Number(results.model.test_iou).toFixed(3)}, F1 ${Number(results.model.test_f1).toFixed(3)}) and Bolivia holdout (IoU ${Number(results.model.bolivia_iou).toFixed(3)}, F1 ${Number(results.model.bolivia_f1).toFixed(3)}).`,
          48,
          doc.y - 36,
          { width: 498 }
        );
      doc.moveDown(1.4);

      doc.fontSize(12).fillColor("#0E7490").text("1. Data Sources, Dates & Flood Impact Summary");
      doc.moveDown(0.3);
      doc.fontSize(9.5).fillColor("#0F172A");
      const floodLines = [
        `• Flood Window: ${results.flood.acquisition_window} (Sentinel-1 RTC Descending)`,
        `• Flooded Area (JRC Permanent Water Masked): ${results.flood.flooded_area_ha.toFixed(1)} ha [${KARNATAKA_UNVALIDATED_LABEL}]`,
        `• Affected Cropland (ESA WorldCover): ${results.flood.cropland_affected_ha.toFixed(1)} ha`,
        `• Affected Roads / Buildings (OSM): ${results.flood.roads_affected_km.toFixed(1)} km / ${results.flood.buildings_affected_count} buildings`,
        `• Critical Infrastructure Exposed: ${results.flood.critical_infrastructure_count} assets`,
        `• Estimated Crop Exposure (Assumption ₹${results.economics.loss_per_ha_inr.toLocaleString("en-IN")}/ha): ${lossStr}`,
      ];
      floodLines.forEach((line) => doc.text(line));

      doc.moveDown(0.7);
      doc.fontSize(12).fillColor("#0E7490").text("2. Land-Change Verification Queue");
      doc.fontSize(9).fillColor("#92400E").text(`Mandatory label: ${MANDATORY_CHANGE_LABEL}`);
      doc.moveDown(0.25);
      doc.fontSize(9).fillColor("#0F172A");
      results.change.sites.forEach((s) => {
        doc.text(
          `• ${s.id} | ${s.name} (${s.taluk}) | ${s.area_ha.toFixed(1)} ha | NDVI ${s.ndvi_drop.toFixed(2)} | River ${s.river_distance_m.toFixed(0)} m | Coords: ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`
        );
      });

      const sarBefore = resolveImageFile("sar_before.jpg");
      const sarAfter = resolveImageFile("sar_after.jpg");
      if (sarBefore && sarAfter) {
        doc.moveDown(0.7);
        doc.fontSize(12).fillColor("#0E7490").text("3. Sentinel-1 SAR Before / After Reference");
        doc.moveDown(0.3);
        const imgY = doc.y;
        doc.image(sarBefore, 42, imgY, { width: 245, height: 155 });
        doc.image(sarAfter, 305, imgY, { width: 245, height: 155 });
        doc.y = imgY + 165;
      }

      doc.moveDown(0.6);
      doc
        .fontSize(12)
        .fillColor("#0E7490")
        .text(`4. AI-Assisted Summary (${MANDATORY_AI_TAG} | ${demoMode ? "cached" : NVIDIA_API_KEY ? "live/cached" : "cached"})`);
      doc.moveDown(0.25);
      doc.fontSize(9.5).fillColor("#0F172A").text(alertSummary);

      doc.moveDown(0.8);
      doc.fontSize(8.5).fillColor("#334155").text(RESPONSIBLE_USE_NOTICE);

      doc.end();
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : "PDF generation failed" });
    }
  });

  const TILES_CACHE_DIR = path.join(CACHE_DIR, "tiles");
  fs.mkdirSync(TILES_CACHE_DIR, { recursive: true });

  app.get("/api/tiles/:style/:z/:x/:y", async (req, res) => {
    const { style, z, x, y } = req.params;
    if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
      res.status(400).send("Invalid tile coordinates");
      return;
    }

    const upstreamMap: Record<string, { url: string; ext: string; mime: string }> = {
      "dark-base": {
        url: `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
        ext: "jpg",
        mime: "image/jpeg",
      },
      "dark-ref": {
        url: `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/${z}/${y}/${x}`,
        ext: "png",
        mime: "image/png",
      },
      osm: {
        url: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
        ext: "png",
        mime: "image/png",
      },
      satellite: {
        url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
        ext: "jpg",
        mime: "image/jpeg",
      },
      terrain: {
        url: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
        ext: "png",
        mime: "image/png",
      },
    };

    const target = upstreamMap[style];
    if (!target) {
      res.status(404).send("Unknown tile style");
      return;
    }

    const tileDir = path.join(TILES_CACHE_DIR, style, z, x);
    const tileFile = path.join(tileDir, `${y}.${target.ext}`);

    if (fs.existsSync(tileFile)) {
      res.setHeader("Content-Type", target.mime);
      res.setHeader("Cache-Control", "public, max-age=604800");
      res.sendFile(tileFile);
      return;
    }

    try {
      const upstreamRes = await fetch(target.url, {
        headers: { "User-Agent": "GeoTerraAI/1.0 (+https://geoterra.local)" },
      });
      if (!upstreamRes.ok) {
        res.status(upstreamRes.status).send("Upstream tile unavailable");
        return;
      }
      const arrBuf = await upstreamRes.arrayBuffer();
      const buf = Buffer.from(arrBuf);
      fs.mkdirSync(tileDir, { recursive: true });
      fs.writeFileSync(tileFile, buf);
      res.setHeader("Content-Type", target.mime);
      res.setHeader("Cache-Control", "public, max-age=604800");
      res.send(buf);
    } catch {
      res.status(502).send("Tile fetch error");
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(ROOT_DIR, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(ROOT_DIR, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`GeoTerra AI server running at http://localhost:${PORT}`);
  });
}

startServer();
