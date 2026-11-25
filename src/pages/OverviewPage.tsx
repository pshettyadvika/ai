import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Compass, Download, Layers, PanelRightClose, PanelRightOpen, ShieldAlert } from "lucide-react";
import { api, formatHa, formatInrIndian } from "../api/client";
import { MapLayerControl } from "../components/MapLayerControl";
import { AssumptionTag, ErrorState, PageSkeleton } from "../components/StateViews";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { GeoFeatureCollection, VerificationStatus } from "../types/api";

export const OverviewPage: React.FC = () => {
  const { results, loading, error, demoMode, verificationStatuses, setSiteVerificationStatus, refresh } = useGeoTerra();
  const [floodGeo, setFloodGeo] = useState<GeoFeatureCollection | null>(null);
  const [changeGeo, setChangeGeo] = useState<GeoFeatureCollection | null>(null);
  const [aoiGeo, setAoiGeo] = useState<GeoFeatureCollection | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  useEffect(() => {
    Promise.all([api.getGeoLayer("flood_extent"), api.getGeoLayer("change"), api.getGeoLayer("aoi")])
      .then(([fl, ch, aoi]) => {
        setFloodGeo(fl);
        setChangeGeo(ch);
        setAoiGeo(aoi);
      })
      .catch(() => {});
  }, []);

  const handleQuickPdf = async () => {
    setPdfDownloading(true);
    try {
      await api.downloadReportPdf(demoMode);
    } finally {
      setPdfDownloading(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error || !results) return <ErrorState message={error || "Telemetry unavailable"} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-cyan-300">
            {results.region} · AOI {results.aoi_bbox.join(", ")}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
            Satellites see it. AI measures it. Authorities act on it.
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/flood"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Flood Monitor
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <Link
            to="/simulation"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs sm:text-sm font-medium border border-slate-700 transition-colors whitespace-nowrap"
          >
            3D Sat-HAPS-Drone Sim
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-expanded={sidebarOpen}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#0F1420] hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700 transition-colors whitespace-nowrap"
          >
            {sidebarOpen ? (
              <>
                <PanelRightClose className="w-4 h-4 text-cyan-300" aria-hidden="true" />
                Hide Alerts Panel
              </>
            ) : (
              <>
                <PanelRightOpen className="w-4 h-4 text-cyan-300" aria-hidden="true" />
                Show Alerts Panel
              </>
            )}
          </button>
        </div>
      </div>

      {/* Top Row: Live 2D Mission Control KPIs */}
      <section aria-label="Key telemetry indicators" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 font-medium">Flooded Area (JRC Masked)</span>
            <span className="text-[11px] font-mono text-amber-300">{results.flood.status_label}</span>
          </div>
          <div className="text-2xl font-mono font-bold text-white tabular-nums">
            {formatHa(results.flood.flooded_area_ha)}
          </div>
          <p className="text-xs text-slate-400">Window: {results.flood.acquisition_window}</p>
        </div>

        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 font-medium">Cropland Affected</span>
            <span className="text-[11px] font-mono text-slate-400">ESA WorldCover</span>
          </div>
          <div className="text-2xl font-mono font-bold text-cyan-300 tabular-nums">
            {formatHa(results.flood.cropland_affected_ha)}
          </div>
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            {results.flood.roads_affected_km.toFixed(1)} km roads · {results.flood.buildings_affected_count} buildings
          </p>
        </div>

        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 font-medium">Estimated Crop Exposure</span>
            <AssumptionTag />
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-300 tabular-nums">
            {formatInrIndian(results.economics.total_loss_inr)}
          </div>
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            {results.flood.cropland_affected_ha.toFixed(1)} ha × ₹{results.economics.loss_per_ha_inr.toLocaleString("en-IN")}/ha
          </p>
        </div>

        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 font-medium">Flagged Land-Change Area</span>
            <span className="text-[11px] font-mono text-amber-300">{results.change.flagged_sites_count} sites</span>
          </div>
          <div className="text-2xl font-mono font-bold text-amber-300 tabular-nums">
            {formatHa(results.change.total_flagged_ha)}
          </div>
          <p className="text-xs text-slate-400">Potential suspicious activity: requires official verification</p>
        </div>
      </section>

      {/* Center Map (2D Default + 2D/3D Toggle) + Collapsible Track C Right Sidebar */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className={sidebarOpen ? "lg:col-span-8" : "lg:col-span-12"}>
          <MapLayerControl
            floodGeo={floodGeo}
            changeGeo={changeGeo}
            aoiGeo={aoiGeo}
            defaultView="2d"
            initialLayers={{
              floodExtent: true,
              changePolygons: true,
              permanentWater: false,
              roads: false,
              buildings: false,
              infrastructure: false,
              aoi: true,
            }}
            showLayerToggles={false}
            heightClass="h-[460px]"
          />
        </div>

        {sidebarOpen && (
          <aside
            aria-label="Track C alerts, routing, and evidence reports"
            className="lg:col-span-4 rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Track C · Alerts &amp; Evidence</h2>
                <p className="text-xs text-slate-400">Scannable triage queue &amp; one-click PDF</p>
              </div>
              <button
                type="button"
                onClick={handleQuickPdf}
                disabled={pdfDownloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-semibold whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                {pdfDownloading ? "Building..." : "Evidence PDF"}
              </button>
            </div>

            <div className="space-y-2.5 max-h-[305px] overflow-y-auto pr-1">
              {results.flood.prioritized_settlements.slice(0, 3).map((s) => {
                const status = verificationStatuses[s.id] || "New";
                return (
                  <div key={s.id} className="p-3 rounded bg-[#07090E] border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link to="/flood" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">
                        {s.name}
                      </Link>
                      <span className="text-[11px] font-mono text-amber-300">{s.priority}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {s.flooded_ha.toFixed(1)} ha · {s.roads_km.toFixed(1)} km roads · {s.buildings_at_risk} bldgs
                    </div>
                    <div className="flex items-center gap-1 pt-1">
                      {(["New", "Under verification", "Verified"] as VerificationStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSiteVerificationStatus(s.id, st)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            status === st
                              ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
                              : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {results.change.sites.slice(0, 2).map((c) => (
                <div key={c.id} className="p-3 rounded bg-[#07090E] border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Link to="/land-change" className="text-xs font-semibold text-amber-300 hover:text-amber-200">
                      {c.name}
                    </Link>
                    <span className="text-[11px] font-mono text-slate-300">{c.area_ha.toFixed(1)} ha</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{c.label}</div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <Link to="/reports" className="text-cyan-300 hover:text-cyan-200 font-medium inline-flex items-center gap-1">
                Open full Alerts &amp; Q&amp;A <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
              <span className="font-mono text-slate-500">{results.flood.critical_infrastructure_count} assets</span>
            </div>
          </aside>
        )}
      </section>

      {/* Track Overview Cards */}
      <section aria-label="Operational workflow" className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-cyan-300 text-sm font-semibold">
            <Compass className="w-4 h-4" aria-hidden="true" />
            <span>01. Detect (Track A · 2D Accuracy)</span>
          </div>
          <h2 className="text-base font-semibold text-white">All-Weather SAR &amp; Optical Screening</h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Flat top-down 2D maps and before/after swipe sliders preserve boundary precision when inspecting Sentinel-1 flood polygons and Sentinel-2 bare-soil changes.
          </p>
          <Link to="/model" className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200">
            Inspect model validation <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-cyan-300 text-sm font-semibold">
            <Layers className="w-4 h-4" aria-hidden="true" />
            <span>02. Relay (Track B · 3D Altitude)</span>
          </div>
          <h2 className="text-base font-semibold text-white">Sat → HAPS → Drone Terrain Handoff</h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Switch into 3D Terrain View to visualize orbital LEO tasking beams descending to stratospheric HAPS (~20 km) and low-altitude drones over Karnataka elevation.
          </p>
          <Link to="/simulation" className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200">
            Launch 3D simulation <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-cyan-300 text-sm font-semibold">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            <span>03. Act (Track C · 2D Operations)</span>
          </div>
          <h2 className="text-base font-semibold text-white">Grounded Alerts &amp; Evidence Reports</h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Scannable flat tables, interactive INR economic formulas, grounded Q&amp;A, and one-click PDF evidence packets built for rapid authority decisions.
          </p>
          <Link to="/impact" className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200">
            Explore economic calculator <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
};
