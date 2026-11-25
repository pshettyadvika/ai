import React, { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatInrExact, formatInrIndian } from "../api/client";
import { AssumptionTag, ErrorState, PageSkeleton } from "../components/StateViews";
import { useGeoTerra } from "../context/GeoTerraContext";

const INSTITUTIONAL_BUYERS = [
  {
    agency: "Karnataka State Disaster Management Authority (KSDMA)",
    workflow: "Monsoon ward inundation triage & critical substation/bridge protection",
    value: "Cuts post-pass assessment from 14 days (assumption) to ~2.5 hours",
  },
  {
    agency: "PMFBY Crop Insurers & Agriculture Department",
    workflow: "ESA WorldCover cropland intersection & hectare exposure verification",
    value: "Objective polygon evidence accelerates farmer claim settlement",
  },
  {
    agency: "Department of Mines & Geology / Revenue Survey",
    workflow: "Sentinel-2 NDVI drop + bare-soil screening ('Potential suspicious activity')",
    value: "Prioritizes district field inspections without manual wall-to-wall scanning",
  },
  {
    agency: "Karnataka State Pollution Control Board & Forest Dept",
    workflow: "Riparian buffer encroachment & peri-urban lake catchment monitoring",
    value: "Early warning within 85–250 m of river corridors using free open EO data",
  },
];

export const ImpactValuePage: React.FC = () => {
  const { results, loading, error, refresh } = useGeoTerra();
  const [lossPerHa, setLossPerHa] = useState<number | null>(null);

  if (loading) return <PageSkeleton />;
  if (error || !results) return <ErrorState message={error || "Telemetry unavailable"} onRetry={refresh} />;

  const activeLossPerHa = lossPerHa ?? results.economics.loss_per_ha_inr;
  const computedTotalLoss = results.flood.cropland_affected_ha * activeLossPerHa;
  const manualHours = results.economics.assessment_time_manual_days * 24;
  const geoterraHours = results.economics.assessment_time_geoterra_hours;

  const timeChartData = [
    { method: "Manual Field Survey (Assumption)", hours: manualHours },
    { method: "GeoTerra AI Pipeline (Assumption)", hours: geoterraHours },
  ];

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-800 pb-4 space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Orbit to Economy — Impact & Value</h1>
          <AssumptionTag label="Assumptions Explicitly Labeled" />
        </div>
        <p className="text-sm text-slate-400">
          Transparent economic exposure model and response-time compression using zero-cost Copernicus & OpenStreetMap data.
        </p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-lg bg-[#0F1420] border border-slate-800 p-6 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Interactive Crop Exposure Formula</h2>
            <AssumptionTag />
          </div>

          <div className="p-4 rounded bg-[#07090E] border border-slate-800 font-mono text-sm flex flex-wrap items-center gap-2 tabular-nums">
            <span className="text-cyan-300">{results.flood.cropland_affected_ha.toFixed(1)} ha</span>
            <span className="text-slate-500">×</span>
            <span className="text-amber-300">{formatInrExact(activeLossPerHa)}/ha</span>
            <span className="text-slate-500">=</span>
            <span className="text-emerald-300 font-bold text-base">
              {formatInrIndian(computedTotalLoss)} ({formatInrExact(computedTotalLoss)})
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="loss-slider" className="text-slate-300 font-medium">
                What-If Adjustment: Assumed Crop Loss per Hectare (₹/ha)
              </label>
              <button
                type="button"
                onClick={() => setLossPerHa(null)}
                className="text-cyan-300 hover:text-cyan-200 font-mono"
              >
                Reset to config default ({formatInrExact(results.economics.loss_per_ha_inr)})
              </button>
            </div>
            <input
              id="loss-slider"
              type="range"
              min={15000}
              max={120000}
              step={2500}
              value={activeLossPerHa}
              onChange={(e) => setLossPerHa(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-500">
              <span>₹15,000/ha</span>
              <span>₹45,000/ha (default)</span>
              <span>₹1,20,000/ha</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3 rounded bg-[#07090E] border border-slate-800">
              <div className="text-xs text-slate-400">Open EO Data Cost</div>
              <div className="text-lg font-mono font-bold text-emerald-300 mt-0.5 tabular-nums">₹0</div>
              <div className="text-[11px] text-slate-500">Sentinel-1/2 + JRC + OSM</div>
            </div>
            <div className="p-3 rounded bg-[#07090E] border border-slate-800">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-slate-400">Time Saved</span>
                <AssumptionTag />
              </div>
              <div className="text-lg font-mono font-bold text-cyan-300 mt-0.5 tabular-nums">
                {results.economics.time_saved_hours.toFixed(1)} hrs
              </div>
              <div className="text-[11px] text-slate-500">
                {results.economics.assessment_time_manual_days}d manual vs {geoterraHours}h GeoTerra
              </div>
            </div>
            <div className="p-3 rounded bg-[#07090E] border border-slate-800">
              <div className="text-xs text-slate-400">Critical Assets Mapped</div>
              <div className="text-lg font-mono font-bold text-white mt-0.5 tabular-nums">
                {results.flood.critical_infrastructure_count}
              </div>
              <div className="text-[11px] text-slate-500">Hospitals, substations, bridges</div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-lg bg-[#0F1420] border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Assessment Time Comparison (Hours)</h2>
            <AssumptionTag />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis type="number" stroke="#94A3B8" fontSize={12} />
                <YAxis type="category" dataKey="method" stroke="#94A3B8" fontSize={11} width={145} />
                <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F1F5F9" }} />
                <Bar dataKey="hours" name="Hours to Situation Report" fill="#06B6D4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-400">{results.economics.note}</p>
        </div>
      </section>

      <section className="rounded-lg bg-[#0F1420] border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">Institutional Customers & Public Sector Use Cases</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#07090E] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-medium">Institutional Stakeholder</th>
                <th className="py-3 px-4 font-medium">Operational Workflow</th>
                <th className="py-3 px-4 font-medium">Decision Advantage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {INSTITUTIONAL_BUYERS.map((row) => (
                <tr key={row.agency} className="hover:bg-slate-800/30">
                  <td className="py-3.5 px-4 font-medium text-slate-100">{row.agency}</td>
                  <td className="py-3.5 px-4 text-slate-300">{row.workflow}</td>
                  <td className="py-3.5 px-4 text-cyan-300">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
