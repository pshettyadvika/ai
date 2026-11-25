import type {
  AlertResponse,
  AskResponse,
  DescribeSiteResponse,
  GeoFeatureCollection,
  ModelResponse,
  ResultsContract,
  ScenesResponse,
  StatusResponse,
  TriageResponse,
} from "../types/api";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const errBody = (await res.json()) as { detail?: string };
      if (errBody.detail) msg = errBody.detail;
    } catch {
      // Ignore JSON parse failure
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  getStatus: () => fetchJson<StatusResponse>("/api/status"),
  getResults: () => fetchJson<ResultsContract>("/api/results"),
  getGeoLayer: (layer: "flood_extent" | "assets" | "change" | "aoi" | "permanent_water") =>
    fetchJson<GeoFeatureCollection>(`/api/geo/${layer}`),
  getScenes: () => fetchJson<ScenesResponse>("/api/scenes"),
  getModel: () => fetchJson<ModelResponse>("/api/model"),
  postAlert: (zoneId?: string, demoMode = false) =>
    fetchJson<AlertResponse>("/api/ai/alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone_id: zoneId, demo_mode: demoMode }),
    }),
  postDescribeSite: (siteId: string, imageName = "change_after.jpg", demoMode = false) =>
    fetchJson<DescribeSiteResponse>("/api/ai/describe-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, image_name: imageName, demo_mode: demoMode }),
    }),
  postTriage: (demoMode = false) =>
    fetchJson<TriageResponse>("/api/ai/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo_mode: demoMode }),
    }),
  postAsk: (question: string, demoMode = false) =>
    fetchJson<AskResponse>("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, demo_mode: demoMode }),
    }),
  downloadReportPdf: async (demoMode = false): Promise<void> => {
    const res = await fetch("/api/report/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ include_ai_summary: true, demo_mode: demoMode }),
    });
    if (!res.ok) {
      throw new Error(`Failed to generate PDF (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "geoterra_evidence_report.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export function formatInrIndian(amountInr: number): string {
  if (!Number.isFinite(amountInr)) return "₹0";
  if (amountInr >= 1e7) {
    return `₹${(amountInr / 1e7).toFixed(2)} Cr`;
  }
  if (amountInr >= 1e5) {
    return `₹${(amountInr / 1e5).toFixed(2)} Lakhs`;
  }
  return `₹${Math.round(amountInr).toLocaleString("en-IN")}`;
}

export function formatInrExact(amountInr: number): string {
  return `₹${Math.round(amountInr).toLocaleString("en-IN")}`;
}

export function formatHa(value: number): string {
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} ha`;
}
