import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Eye, MapPin } from "lucide-react";
import { api } from "../api/client";
import { BeforeAfterSlider } from "../components/BeforeAfterSlider";
import { MapLayerControl } from "../components/MapLayerControl";
import { AiVerificationTag, ErrorState, PageSkeleton } from "../components/StateViews";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { ChangeSite, DescribeSiteResponse, GeoFeatureCollection } from "../types/api";

type SortKey = "area_ha" | "confidence" | "river_distance_m";

export const LandChangePage: React.FC = () => {
  const { results, loading, error, demoMode, setLastAiSource, refresh } = useGeoTerra();
  const [changeGeo, setChangeGeo] = useState<GeoFeatureCollection | null>(null);
  const [aoiGeo, setAoiGeo] = useState<GeoFeatureCollection | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("confidence");
  const [sortAsc, setSortAsc] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [selectedSite, setSelectedSite] = useState<ChangeSite | null>(null);
  const [vlmResult, setVlmResult] = useState<DescribeSiteResponse | null>(null);
  const [vlmLoading, setVlmLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.getGeoLayer("change"), api.getGeoLayer("aoi")])
      .then(([ch, aoi]) => {
        setChangeGeo(ch);
        setAoiGeo(aoi);
      })
      .catch(() => {});
  }, []);

  const sortedSites = useMemo(() => {
    if (!results) return [];
    const copy = [...results.change.sites];
    copy.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortAsc ? diff : -diff;
    });
    return copy;
  }, [results, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "river_distance_m");
    }
  };

  const handleDescribeWithAi = async (site: ChangeSite) => {
    setSelectedSite(site);
    setFlyToTarget({ lat: site.lat, lon: site.lon, zoom: 14 });
    setVlmLoading(true);
    try {
      const resp = await api.postDescribeSite(site.id, "change_after.jpg", demoMode);
      setVlmResult(resp);
      setLastAiSource(resp.source);
    } catch {
      setVlmResult({
        site_id: site.id,
        description: `${site.name}: ${site.area_ha} ha surface change observed (NDVI ${site.ndvi_drop}). ${results?.change.mandatory_label}`,
        tag: "AI-assisted, requires official verification",
        mandatory_label: results?.change.mandatory_label || "Potential suspicious activity: requires official verification",
        source: "cached",
      });
    } finally {
      setVlmLoading(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error || !results) return <ErrorState message={error || "Telemetry unavailable"} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4 space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Land Change & Surface Disturbance Monitor</h1>
          <span className="px-2.5 py-1 rounded text-xs font-mono font-medium bg-amber-500/15 text-amber-300 border border-amber-500/40">
            {results.change.mandatory_label}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Sentinel-2 L2A (SCL cloud-masked) NDVI drop & Bare-Soil Index comparison ({results.change.baseline_window} vs {results.change.current_window})
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-6">
          <MapLayerControl
            changeGeo={changeGeo}
            aoiGeo={aoiGeo}
            defaultView="2d"
            flyToTarget={flyToTarget}
            initialLayers={{
              floodExtent: false,
              permanentWater: false,
              roads: false,
              buildings: false,
              infrastructure: false,
              changePolygons: true,
              aoi: true,
            }}
            heightClass="h-[430px]"
          />

          <div className="rounded-lg bg-[#0F1420] border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Flagged Polygons ({sortedSites.length} sites · {results.change.total_flagged_ha.toFixed(1)} ha)</h2>
              <span className="text-xs text-slate-400">Sorted by {sortKey.replace("_", " ")}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#07090E] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">Site & Classification</th>
                    <th className="py-2.5 px-3 font-medium">
                      <button type="button" onClick={() => handleSort("area_ha")} className="inline-flex items-center gap-1 hover:text-white">
                        Area (ha) <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-medium">
                      <button type="button" onClick={() => handleSort("confidence")} className="inline-flex items-center gap-1 hover:text-white">
                        Confidence <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-medium">
                      <button type="button" onClick={() => handleSort("river_distance_m")} className="inline-flex items-center gap-1 hover:text-white">
                        River Dist. <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {sortedSites.map((site) => (
                    <tr key={site.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => setFlyToTarget({ lat: site.lat, lon: site.lon, zoom: 14 })}
                          className="font-medium text-slate-100 hover:text-cyan-300 text-left inline-flex items-center gap-1"
                        >
                          <MapPin className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />
                          <span>{site.name}</span>
                        </button>
                        <div className="text-[11px] text-amber-300/90 mt-0.5">{site.label}</div>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-200">{site.area_ha.toFixed(1)}</td>
                      <td className="py-3 px-3 font-mono tabular-nums text-cyan-300">{Math.round(site.confidence * 100)}%</td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-300">
                        {site.river_distance_m.toFixed(0)} m {site.near_river ? "(Near river)" : ""}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDescribeWithAi(site)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 font-medium whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          Describe with AI
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="xl:col-span-5 space-y-6">
          <BeforeAfterSlider
            beforeSrc="/api/images/change_before.jpg"
            afterSrc="/api/images/change_after.jpg"
            beforeLabel="Baseline (Nov 2025)"
            afterLabel="Current (Nov 2026)"
            beforeAlt="Sentinel-2 true-color optical view of intact green agricultural and scrub land near river bend"
            afterAlt="Sentinel-2 true-color optical view showing cleared bare soil excavation patches beside river"
            caption="Visual check of NDVI vegetation loss and Bare-Soil Index increase. Requires official survey verification."
          />

          <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-white">
                {selectedSite ? `VLM Inspection: ${selectedSite.name}` : "Site Inspection Briefing"}
              </h2>
              {vlmResult && <AiVerificationTag source={vlmResult.source} />}
            </div>

            {vlmLoading ? (
              <p className="text-sm text-slate-400 animate-pulse">Analyzing Sentinel-2 site crop via VLM...</p>
            ) : vlmResult ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-200 leading-relaxed">{vlmResult.description}</p>
                <div className="text-xs font-mono text-amber-300 pt-1">{vlmResult.mandatory_label}</div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Select any site in the table and click <strong className="text-slate-200">Describe with AI</strong> to generate a grounded surface-disturbance summary.
              </p>
            )}
          </div>

          <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-3">
            <h2 className="text-base font-semibold text-white">Field Verification Priority List</h2>
            <p className="text-xs text-slate-400">
              Ordered by river-buffer proximity and spectral confidence for non-accusatory revenue/survey boundary inspection.
            </p>
            <ol className="space-y-2 text-xs">
              {sortedSites.slice(0, 4).map((s, idx) => (
                <li key={s.id} className="p-2.5 rounded bg-[#07090E] border border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-slate-200">
                    <strong className="font-mono text-cyan-300 mr-2">0{idx + 1}.</strong>
                    {s.name} ({s.taluk})
                  </span>
                  <span className="font-mono text-slate-400 shrink-0">
                    {s.lat.toFixed(3)}, {s.lon.toFixed(3)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
