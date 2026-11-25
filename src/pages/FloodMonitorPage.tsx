import React, { useEffect, useState } from "react";
import { AlertCircle, MapPin, Sparkles } from "lucide-react";
import { api, formatHa } from "../api/client";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { MapLayerControl } from "../components/MapLayerControl";
import { AiVerificationTag, ErrorState, PageSkeleton } from "../components/StateViews";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { AlertResponse, GeoFeatureCollection } from "../types/api";

export const FloodMonitorPage: React.FC = () => {
  const { results, loading, error, demoMode, setLastAiSource, refresh } = useGeoTerra();
  const [floodGeo, setFloodGeo] = useState<GeoFeatureCollection | null>(null);
  const [permGeo, setPermGeo] = useState<GeoFeatureCollection | null>(null);
  const [assetsGeo, setAssetsGeo] = useState<GeoFeatureCollection | null>(null);
  const [aoiGeo, setAoiGeo] = useState<GeoFeatureCollection | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lon: number; zoom?: number; label?: string } | null>(null);
  const [alertResult, setAlertResult] = useState<AlertResponse | null>(null);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.getGeoLayer("flood_extent"),
      api.getGeoLayer("permanent_water"),
      api.getGeoLayer("assets"),
      api.getGeoLayer("aoi"),
    ])
      .then(([fl, pw, as, aoi]) => {
        setFloodGeo(fl);
        setPermGeo(pw);
        setAssetsGeo(as);
        setAoiGeo(aoi);
      })
      .catch(() => {
        // Layer fetch error handled via empty state on map
      });
  }, []);

  const handleGenerateAlert = async (zoneId?: string) => {
    setAlertLoading(true);
    setAlertError(null);
    try {
      const resp = await api.postAlert(zoneId, demoMode);
      setAlertResult(resp);
      setLastAiSource(resp.source);
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : "Alert generation failed");
    } finally {
      setAlertLoading(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error || !results) return <ErrorState message={error || "Telemetry unavailable"} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Flood Monitor</h1>
            {!results.flood.validated && (
              <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                {results.flood.status_label}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Sentinel-1 RTC flood segmentation ({results.flood.acquisition_window}) · JRC permanent lakes masked
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleGenerateAlert()}
          disabled={alertLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-sm font-semibold transition-colors whitespace-nowrap"
        >
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          {alertLoading ? "Generating AI alert..." : "Generate AI alert"}
        </button>
      </div>

      {alertError && (
        <div className="rounded-lg bg-rose-950/40 border border-rose-800 p-4 text-sm text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{alertError}</span>
        </div>
      )}

      {alertResult && (
        <div className="rounded-lg bg-[#0F1420] border border-cyan-800/70 p-5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Protective Early-Warning Briefing</h2>
            <AiVerificationTag source={alertResult.source} />
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">{alertResult.alert_text}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-6">
          <MapLayerControl
            floodGeo={floodGeo}
            permanentWaterGeo={permGeo}
            assetsGeo={assetsGeo}
            aoiGeo={aoiGeo}
            defaultView="2d"
            flyToTarget={flyToTarget}
            heightClass="h-[480px]"
          />

          <BeforeAfterSlider
            beforeSrc="/api/images/sar_before.png"
            afterSrc="/api/images/sar_after.png"
            beforeLabel="SAR Pre-Flood Reference"
            afterLabel="SAR Monsoon Peak"
            beforeAlt="Sentinel-1 SAR backscatter grayscale view of Bengaluru lake basin before monsoon flooding"
            afterAlt="Sentinel-1 SAR backscatter grayscale view showing expanded dark specular floodwater across low-lying corridors"
            caption="Dark specular radar zones show smooth open water surfaces relative to bright urban double-bounce infrastructure."
          />
        </div>

        <aside className="xl:col-span-4 space-y-5">
          <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">Exposure Summary</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded bg-[#07090E] border border-slate-800/80">
                <div className="text-xs text-slate-400">Flooded Area</div>
                <div className="text-lg font-mono font-bold text-cyan-300 tabular-nums mt-0.5">
                  {formatHa(results.flood.flooded_area_ha)}
                </div>
              </div>
              <div className="p-3 rounded bg-[#07090E] border border-slate-800/80">
                <div className="text-xs text-slate-400">Lakes Masked</div>
                <div className="text-lg font-mono font-bold text-blue-300 tabular-nums mt-0.5">
                  {formatHa(results.flood.permanent_water_masked_ha)}
                </div>
              </div>
              <div className="p-3 rounded bg-[#07090E] border border-slate-800/80">
                <div className="text-xs text-slate-400">Roads Affected</div>
                <div className="text-lg font-mono font-bold text-amber-300 tabular-nums mt-0.5">
                  {results.flood.roads_affected_km.toFixed(1)} km
                </div>
              </div>
              <div className="p-3 rounded bg-[#07090E] border border-slate-800/80">
                <div className="text-xs text-slate-400">Buildings Exposed</div>
                <div className="text-lg font-mono font-bold text-rose-300 tabular-nums mt-0.5">
                  {results.flood.buildings_affected_count}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-3">
            <h2 className="text-base font-semibold text-white">Prioritized Settlements</h2>
            <div className="divide-y divide-slate-800/80">
              {results.flood.prioritized_settlements.map((s) => (
                <div key={s.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      onClick={() => setFlyToTarget({ lat: s.lat, lon: s.lon, zoom: 13, label: s.name })}
                      className="text-sm font-medium text-cyan-300 hover:text-cyan-200 text-left inline-flex items-center gap-1"
                    >
                      <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{s.name}</span>
                    </button>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                      {s.taluk} · {s.flooded_ha.toFixed(1)} ha · {s.buildings_at_risk} bldgs
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateAlert(s.id)}
                    className="px-2.5 py-1 rounded text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 whitespace-nowrap shrink-0"
                  >
                    {s.priority}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-white">Critical Infrastructure</h2>
              <span className="text-xs text-slate-400">Click to locate</span>
            </div>
            <div className="space-y-2">
              {results.flood.critical_infrastructure.map((inf) => (
                <button
                  key={inf.id}
                  type="button"
                  onClick={() => setFlyToTarget({ lat: inf.lat, lon: inf.lon, zoom: 14, label: inf.name })}
                  className="w-full text-left p-3 rounded bg-[#07090E] hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-100">{inf.name}</div>
                    <div className="text-xs text-slate-400 capitalize">
                      {inf.type} · {inf.distance_to_flood_m} m from flood edge
                    </div>
                  </div>
                  <span className="text-xs font-mono text-amber-300 whitespace-nowrap shrink-0">{inf.status}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
