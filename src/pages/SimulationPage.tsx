import React, { useEffect, useState } from "react";
import { Play, RotateCcw, Sparkles } from "lucide-react";
import { api } from "../api/client";
import { MapLayerControl, type SimRoutePoint } from "../components/MapLayerControl";
import { AiVerificationTag, AssumptionTag, ErrorState, PageSkeleton, SimulationBadge } from "../components/StateViews";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { GeoFeatureCollection, TriageResponse } from "../types/api";

export const SimulationPage: React.FC = () => {
  const { results, loading, error, demoMode, setLastAiSource, refresh } = useGeoTerra();
  const [computeMode, setComputeMode] = useState<"onboard" | "ground">("onboard");
  const [changeGeo, setChangeGeo] = useState<GeoFeatureCollection | null>(null);
  const [aoiGeo, setAoiGeo] = useState<GeoFeatureCollection | null>(null);
  const [simStep, setSimStep] = useState<number>(-1);
  const [simRunning, setSimRunning] = useState(false);
  const [triage, setTriage] = useState<TriageResponse | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.getGeoLayer("change"), api.getGeoLayer("aoi")])
      .then(([ch, aoi]) => {
        setChangeGeo(ch);
        setAoiGeo(aoi);
      })
      .catch(() => {});
  }, []);

  const simRoute: SimRoutePoint[] = results
    ? [
        {
          label: "LEO Satellite",
          lat: 13.28,
          lon: 77.35,
          role: "Orbital SAR/Optical Edge Packet",
          altitudeLabel: "LEO ~550 km",
          altitudeBaseM: 4400,
          altitudeTopM: 5000,
        },
        {
          label: "Stratospheric HAPS",
          lat: 13.06,
          lon: 77.52,
          role: "Persistent Relay & Cueing",
          altitudeLabel: `${results.onboard_sim.haps_altitude_km} km alt`,
          altitudeBaseM: 2500,
          altitudeTopM: 3000,
        },
        {
          label: "Autonomous Drone",
          lat: results.change.sites[0]?.lat ?? 12.805,
          lon: results.change.sites[0]?.lon ?? 77.382,
          role: `High-Res Inspection (${results.onboard_sim.drone_endurance_min} min)`,
          altitudeLabel: "~120 m AGL",
          altitudeBaseM: 900,
          altitudeTopM: 1250,
        },
        {
          label: "Official Verification",
          lat: 12.9716,
          lon: 77.5946,
          role: "District Survey Confirmation",
          altitudeLabel: "Ground (0 m)",
          altitudeBaseM: 0,
          altitudeTopM: 280,
        },
      ]
    : [];

  useEffect(() => {
    if (!simRunning) return;
    if (simStep >= simRoute.length - 1) {
      setSimRunning(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSimStep((prev) => prev + 1);
    }, 950);
    return () => window.clearTimeout(timer);
  }, [simRunning, simStep, simRoute.length]);

  const handleRunSimulation = () => {
    setSimStep(0);
    setSimRunning(true);
  };

  const handleRankSites = async () => {
    setTriageLoading(true);
    try {
      const resp = await api.postTriage(demoMode);
      setTriage(resp);
      setLastAiSource(resp.source);
    } finally {
      setTriageLoading(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error || !results) return <ErrorState message={error || "Telemetry unavailable"} onRetry={refresh} />;

  const sim = results.onboard_sim;

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-800 pb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Onboard AI &amp; HAPS-to-Drone Relay (3D Terrain)</h1>
          <SimulationBadge />
        </div>
        <p className="text-sm text-amber-200/90">
          Disclaimer: All orbital onboard-compute, HAPS (~{sim.haps_altitude_km} km), and autonomous drone dispatch figures on this page are conceptual engineering simulations; no real HAPS or drones are operated.
        </p>
      </div>

      <section className="rounded-lg bg-[#0F1420] border border-slate-800 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">A. Onboard Edge AI vs Ground Downlink Tradeoff</h2>
            <SimulationBadge />
            <AssumptionTag />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#07090E] rounded border border-slate-800">
            <button
              type="button"
              onClick={() => setComputeMode("onboard")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                computeMode === "onboard" ? "bg-cyan-500 text-slate-950 font-semibold" : "text-slate-300 hover:text-white"
              }`}
            >
              Onboard Insight Packet
            </button>
            <button
              type="button"
              onClick={() => setComputeMode("ground")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                computeMode === "ground" ? "bg-amber-500 text-slate-950 font-semibold" : "text-slate-300 hover:text-white"
              }`}
            >
              Raw Ground Downlink
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded bg-[#07090E] border border-slate-800">
            <div className="text-xs text-slate-400">Payload Downlinked</div>
            <div className="text-2xl font-mono font-bold text-white mt-1 tabular-nums">
              {computeMode === "onboard" ? `${sim.insight_packet_size_kb} KB` : `${sim.raw_scene_size_mb} MB`}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {computeMode === "onboard" ? "GeoJSON centroids + summary JSON" : "Full 2-band S1 scene"}
            </div>
          </div>

          <div className="p-4 rounded bg-[#07090E] border border-slate-800">
            <div className="text-xs text-slate-400">Downlink Time @ {sim.downlink_rate_mbps} Mbps</div>
            <div className="text-2xl font-mono font-bold text-cyan-300 mt-1 tabular-nums">
              {computeMode === "onboard" ? `${sim.downlink_time_packet_sec} sec` : `${sim.downlink_time_raw_sec} sec`}
            </div>
            <div className="text-xs text-slate-500 mt-1">Simulated X/S-band link</div>
          </div>

          <div className="p-4 rounded bg-[#07090E] border border-slate-800">
            <div className="text-xs text-slate-400">Bandwidth Compression</div>
            <div className="text-2xl font-mono font-bold text-emerald-300 mt-1 tabular-nums">
              {sim.compression_ratio.toLocaleString("en-IN")}×
            </div>
            <div className="text-xs text-slate-500 mt-1">Raw MB to &lt;2 KB insight packet</div>
          </div>

          <div className="p-4 rounded bg-[#07090E] border border-slate-800">
            <div className="text-xs text-slate-400">HAPS / Drone Specs</div>
            <div className="text-2xl font-mono font-bold text-amber-300 mt-1 tabular-nums">
              {sim.haps_altitude_km} km / {sim.drone_endurance_min} m
            </div>
            <div className="text-xs text-slate-500 mt-1">Stratospheric relay · Drone endurance</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">B. Satellite → HAPS → Drone → Verification Relay</h2>
              <SimulationBadge />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={simRunning}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-semibold"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                {simRunning ? "Simulating..." : "Run simulation"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimRunning(false);
                  setSimStep(-1);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Reset
              </button>
            </div>
          </div>

          <MapLayerControl
            changeGeo={changeGeo}
            aoiGeo={aoiGeo}
            defaultView="3d"
            initialLayers={{
              floodExtent: false,
              permanentWater: false,
              roads: false,
              buildings: false,
              infrastructure: false,
              changePolygons: true,
              aoi: true,
            }}
            showLayerToggles={false}
            simRoute={simRoute}
            simProgressIndex={simStep}
            heightClass="h-[440px]"
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {simRoute.map((node, idx) => (
              <div
                key={node.label}
                className={`p-3 rounded border transition-colors ${
                  simStep >= idx
                    ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-100"
                    : "bg-[#0F1420] border-slate-800 text-slate-400"
                }`}
              >
                <div className="font-mono text-[11px] mb-1">Stage 0{idx + 1}</div>
                <div className="font-medium">{node.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-5 rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">C. AI Triage Queue</h2>
              <SimulationBadge />
            </div>
            <button
              type="button"
              onClick={handleRankSites}
              disabled={triageLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              {triageLoading ? "Ranking..." : "Rank flagged sites with AI"}
            </button>
          </div>

          {triage ? (
            <div className="space-y-3">
              <AiVerificationTag source={triage.source} />
              <div className="space-y-2.5">
                {triage.ranked_sites.map((item) => (
                  <div key={item.site_id} className="p-3 rounded bg-[#07090E] border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">
                        #{item.rank} {item.name}
                      </span>
                      <span className="text-xs font-mono text-amber-300">{item.priority}</span>
                    </div>
                    <p className="text-xs text-slate-300">{item.rationale}</p>
                    <p className="text-[11px] text-cyan-300">{item.recommended_verification}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Click <strong className="text-slate-200">Rank flagged sites with AI</strong> to generate a validated JSON triage order over the 5 Karnataka change sites.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
