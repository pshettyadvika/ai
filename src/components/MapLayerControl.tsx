import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Box } from "lucide-react";
import type { GeoFeatureCollection } from "../types/api";

setWorkerUrl(maplibreWorkerUrl);

export interface LayerToggleState {
  floodExtent: boolean;
  permanentWater: boolean;
  roads: boolean;
  buildings: boolean;
  infrastructure: boolean;
  changePolygons: boolean;
  aoi: boolean;
}

export interface SimRoutePoint {
  label: string;
  lat: number;
  lon: number;
  role: string;
  altitudeLabel?: string;
  altitudeBaseM?: number;
  altitudeTopM?: number;
}

interface MapLayerControlProps {
  floodGeo?: GeoFeatureCollection | null;
  permanentWaterGeo?: GeoFeatureCollection | null;
  assetsGeo?: GeoFeatureCollection | null;
  changeGeo?: GeoFeatureCollection | null;
  aoiGeo?: GeoFeatureCollection | null;
  initialLayers?: Partial<LayerToggleState>;
  defaultView?: "2d" | "3d";
  showLayerToggles?: boolean;
  heightClass?: string;
  flyToTarget?: { lat: number; lon: number; zoom?: number; label?: string } | null;
  simRoute?: SimRoutePoint[];
  simProgressIndex?: number;
  onSelectFeature?: (props: Record<string, unknown>) => void;
}

function simplifyRing(ring: number[][]): number[][] {
  if (ring.length <= 8) return ring;
  const step = Math.max(1, Math.floor(ring.length / 40));
  const simplified = ring.filter((_, idx) => idx === 0 || idx === ring.length - 1 || idx % step === 0);
  if (simplified.length < 4) return ring;
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    simplified.push(first);
  }
  return simplified;
}

function simplifyGeoJson(fc: GeoFeatureCollection): GeoFeatureCollection {
  if (fc.features.length < 30) return fc;
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      if (f.geometry.type === "Polygon" && Array.isArray(f.geometry.coordinates)) {
        const rings = f.geometry.coordinates as number[][][];
        return {
          ...f,
          geometry: {
            ...f.geometry,
            coordinates: rings.map((r) => simplifyRing(r)),
          },
        };
      }
      return f;
    }),
  };
}

function clusterPointFeatures(
  features: GeoFeatureCollection["features"],
  gridSizeDeg = 0.03
): GeoFeatureCollection["features"] {
  if (features.length <= 200) return features;
  const buckets = new Map<string, { latSum: number; lonSum: number; count: number; sampleProps: Record<string, unknown> }>();
  for (const f of features) {
    if (f.geometry.type !== "Point" || !Array.isArray(f.geometry.coordinates)) continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const key = `${Math.floor(lat / gridSizeDeg)}:${Math.floor(lon / gridSizeDeg)}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.latSum += lat;
      existing.lonSum += lon;
      existing.count += 1;
    } else {
      buckets.set(key, { latSum: lat, lonSum: lon, count: 1, sampleProps: f.properties });
    }
  }
  return Array.from(buckets.values()).map((b) => ({
    type: "Feature",
    properties: b.count > 1 ? { ...b.sampleProps, clustered_count: b.count, name: `${b.count} clustered features` } : b.sampleProps,
    geometry: {
      type: "Point",
      coordinates: [b.lonSum / b.count, b.latSum / b.count],
    },
  }));
}

function makeCirclePolygon(lon: number, lat: number, radiusDeg: number): number[][][] {
  const pts: number[][] = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    pts.push([lon + Math.cos(angle) * radiusDeg, lat + Math.sin(angle) * radiusDeg]);
  }
  return [pts];
}

type SourceData = Parameters<GeoJSONSource["setData"]>[0];
const EMPTY_FC = { type: "FeatureCollection", features: [] } as unknown as SourceData;

export const MapLayerControl: React.FC<MapLayerControlProps> = ({
  floodGeo,
  permanentWaterGeo,
  assetsGeo,
  changeGeo,
  aoiGeo,
  initialLayers,
  defaultView = "2d",
  showLayerToggles = true,
  heightClass = "h-[500px]",
  flyToTarget,
  simRoute,
  simProgressIndex = -1,
  onSelectFeature,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapLoadedRef = useRef(false);
  const simMarkersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelectFeature);
  onSelectRef.current = onSelectFeature;

  const [baseMap, setBaseMap] = useState<"dark" | "osm" | "satellite">("dark");
  const [is3D, setIs3D] = useState(defaultView === "3d");
  const [layers, setLayers] = useState<LayerToggleState>({
    floodExtent: initialLayers?.floodExtent ?? true,
    permanentWater: initialLayers?.permanentWater ?? true,
    roads: initialLayers?.roads ?? true,
    buildings: initialLayers?.buildings ?? true,
    infrastructure: initialLayers?.infrastructure ?? true,
    changePolygons: initialLayers?.changePolygons ?? false,
    aoi: initialLayers?.aoi ?? true,
  });

  const simplifiedFlood = useMemo(() => (floodGeo ? simplifyGeoJson(floodGeo) : null), [floodGeo]);
  const simplifiedChange = useMemo(() => (changeGeo ? simplifyGeoJson(changeGeo) : null), [changeGeo]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const start3D = defaultView === "3d";
    const map = new MapLibreMap({
      container: containerRef.current,
      center: [77.5946, 12.9716],
      zoom: start3D ? 10.1 : 9.9,
      pitch: start3D ? 58 : 0,
      bearing: start3D ? -22 : 0,
      maxPitch: 75,
      style: {
        version: 8,
        sources: {
          "dark-base": {
            type: "raster",
            tiles: ["/api/tiles/dark-base/{z}/{x}/{y}"],
            tileSize: 256,
            maxzoom: 16,
            attribution: "Tiles &copy; Esri World Dark Gray",
          },
          "dark-ref": {
            type: "raster",
            tiles: ["/api/tiles/dark-ref/{z}/{x}/{y}"],
            tileSize: 256,
            maxzoom: 16,
          },
          osm: {
            type: "raster",
            tiles: ["/api/tiles/osm/{z}/{x}/{y}"],
            tileSize: 256,
            maxzoom: 18,
            attribution: "&copy; OpenStreetMap contributors",
          },
          satellite: {
            type: "raster",
            tiles: ["/api/tiles/satellite/{z}/{x}/{y}"],
            tileSize: 256,
            maxzoom: 18,
            attribution: "Tiles &copy; Esri World Imagery",
          },
          "terrain-dem": {
            type: "raster-dem",
            tiles: ["/api/tiles/terrain/{z}/{x}/{y}"],
            tileSize: 256,
            maxzoom: 14,
            encoding: "terrarium",
          },
          aoi: { type: "geojson", data: EMPTY_FC },
          "permanent-water": { type: "geojson", data: EMPTY_FC },
          "flood-extent": { type: "geojson", data: EMPTY_FC },
          roads: { type: "geojson", data: EMPTY_FC },
          buildings: { type: "geojson", data: EMPTY_FC },
          infrastructure: { type: "geojson", data: EMPTY_FC },
          "change-polygons": { type: "geojson", data: EMPTY_FC },
          "sim-route-base": { type: "geojson", data: EMPTY_FC },
          "sim-route-active": { type: "geojson", data: EMPTY_FC },
          "sim-nodes": { type: "geojson", data: EMPTY_FC },
          "sim-altitude-beams": { type: "geojson", data: EMPTY_FC },
          "sim-altitude-platforms": { type: "geojson", data: EMPTY_FC },
        },
        layers: [
          { id: "base-dark", type: "raster", source: "dark-base", layout: { visibility: "visible" } },
          { id: "base-dark-ref", type: "raster", source: "dark-ref", layout: { visibility: "visible" }, paint: { "raster-opacity": 0.9 } },
          { id: "base-osm", type: "raster", source: "osm", layout: { visibility: "none" } },
          { id: "base-satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
          {
            id: "aoi-line",
            type: "line",
            source: "aoi",
            paint: { "line-color": "#64748B", "line-width": 1.6, "line-dasharray": [4, 3] },
          },
          {
            id: "perm-water-2d",
            type: "fill",
            source: "permanent-water",
            paint: { "fill-color": "#1E40AF", "fill-opacity": 0.55 },
          },
          {
            id: "perm-water-3d",
            type: "fill-extrusion",
            source: "permanent-water",
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": "#1D4ED8",
              "fill-extrusion-height": 60,
              "fill-extrusion-base": 0,
              "fill-extrusion-opacity": 0.65,
            },
          },
          {
            id: "flood-2d",
            type: "fill",
            source: "flood-extent",
            paint: { "fill-color": "#06B6D4", "fill-opacity": 0.36 },
          },
          {
            id: "flood-3d",
            type: "fill-extrusion",
            source: "flood-extent",
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": "#06B6D4",
              "fill-extrusion-height": ["+", 120, ["*", ["coalesce", ["get", "area_ha"], 150], 0.7]],
              "fill-extrusion-base": 0,
              "fill-extrusion-opacity": 0.58,
            },
          },
          {
            id: "flood-outline",
            type: "line",
            source: "flood-extent",
            paint: { "line-color": "#22D3EE", "line-width": 2 },
          },
          {
            id: "roads-line",
            type: "line",
            source: "roads",
            paint: { "line-color": "#F59E0B", "line-width": 3.2, "line-opacity": 0.92 },
          },
          {
            id: "buildings-2d",
            type: "fill",
            source: "buildings",
            paint: { "fill-color": "#E11D48", "fill-opacity": 0.35 },
          },
          {
            id: "buildings-3d",
            type: "fill-extrusion",
            source: "buildings",
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": "#E11D48",
              "fill-extrusion-height": ["+", 100, ["*", ["coalesce", ["get", "count"], 50], 1.8]],
              "fill-extrusion-base": 0,
              "fill-extrusion-opacity": 0.72,
            },
          },
          {
            id: "change-2d",
            type: "fill",
            source: "change-polygons",
            paint: {
              "fill-color": [
                "case",
                [">=", ["coalesce", ["get", "confidence"], 0.7], 0.85],
                "#EF4444",
                [">=", ["coalesce", ["get", "confidence"], 0.7], 0.75],
                "#F59E0B",
                "#EAB308",
              ],
              "fill-opacity": 0.4,
            },
          },
          {
            id: "change-3d",
            type: "fill-extrusion",
            source: "change-polygons",
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": [
                "case",
                [">=", ["coalesce", ["get", "confidence"], 0.7], 0.85],
                "#EF4444",
                [">=", ["coalesce", ["get", "confidence"], 0.7], 0.75],
                "#F59E0B",
                "#EAB308",
              ],
              "fill-extrusion-height": ["+", 240, ["*", ["coalesce", ["get", "area_ha"], 20], 7]],
              "fill-extrusion-base": 0,
              "fill-extrusion-opacity": 0.75,
            },
          },
          {
            id: "change-outline",
            type: "line",
            source: "change-polygons",
            paint: { "line-color": "#FCD34D", "line-width": 2 },
          },
          {
            id: "infra-points",
            type: "circle",
            source: "infrastructure",
            paint: {
              "circle-radius": ["case", ["has", "clustered_count"], 10, 7],
              "circle-color": [
                "match",
                ["get", "infra_type"],
                "hospital",
                "#EF4444",
                "substation",
                "#FACC15",
                "#38BDF8",
              ],
              "circle-stroke-color": "#07090E",
              "circle-stroke-width": 2,
            },
          },
          {
            id: "sim-route-base-line",
            type: "line",
            source: "sim-route-base",
            paint: { "line-color": "#475569", "line-width": 2, "line-dasharray": [4, 4] },
          },
          {
            id: "sim-route-active-line",
            type: "line",
            source: "sim-route-active",
            paint: { "line-color": "#22D3EE", "line-width": 4 },
          },
          {
            id: "sim-altitude-beams-3d",
            type: "fill-extrusion",
            source: "sim-altitude-beams",
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": ["case", ["==", ["get", "reached"], true], "#22D3EE", "#475569"],
              "fill-extrusion-base": 0,
              "fill-extrusion-height": ["coalesce", ["get", "beam_top"], 1000],
              "fill-extrusion-opacity": 0.28,
            },
          },
          {
            id: "sim-altitude-platforms-3d",
            type: "fill-extrusion",
            source: "sim-altitude-platforms",
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": [
                "case",
                ["==", ["get", "reached"], true],
                ["coalesce", ["get", "color"], "#22D3EE"],
                "#475569",
              ],
              "fill-extrusion-base": ["coalesce", ["get", "alt_base"], 0],
              "fill-extrusion-height": ["coalesce", ["get", "alt_top"], 500],
              "fill-extrusion-opacity": 0.88,
            },
          },
          {
            id: "sim-nodes-points",
            type: "circle",
            source: "sim-nodes",
            paint: {
              "circle-radius": ["case", ["==", ["get", "reached"], true], 9, 6],
              "circle-color": ["case", ["==", ["get", "reached"], true], "#22D3EE", "#64748B"],
              "circle-stroke-color": "#07090E",
              "circle-stroke-width": 2,
            },
          },
        ],
      },
    });

    map.addControl(new NavigationControl({ visualizePitch: true }), "top-left");

    const bindInteractiveLayer = (
      layerId: string,
      htmlBuilder: (p: Record<string, unknown>) => string
    ) => {
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", layerId, (e: MapLayerMouseEvent) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const props = (feat.properties || {}) as Record<string, unknown>;
        new Popup({ maxWidth: "260px" })
          .setLngLat(e.lngLat)
          .setHTML(htmlBuilder(props))
          .addTo(map);
        onSelectRef.current?.(props);
      });
    };

    map.on("load", () => {
      mapLoadedRef.current = true;
      if (start3D && map.getSource("terrain-dem")) {
        map.setTerrain({ source: "terrain-dem", exaggeration: 2.2 });
      }

      const floodHtml = (p: Record<string, unknown>) =>
        `<div class="text-xs space-y-1">
          <div class="font-semibold text-cyan-300">${String(p.zone || "Flood Polygon")}</div>
          <div>Area: <b>${String(p.area_ha ?? "-")} ha</b></div>
          <div class="text-amber-300">${String(p.status_label || "Model prediction (unvalidated)")}</div>
        </div>`;
      bindInteractiveLayer("flood-2d", floodHtml);
      bindInteractiveLayer("flood-3d", floodHtml);

      const permHtml = (p: Record<string, unknown>) =>
        `<div class="text-xs font-medium text-blue-300">${String(p.name || "JRC Permanent Water")}</div>`;
      bindInteractiveLayer("perm-water-2d", permHtml);
      bindInteractiveLayer("perm-water-3d", permHtml);

      bindInteractiveLayer("roads-line", (p) => {
        return `<div class="text-xs"><b>${String(p.name || "Road")}</b><br/>Length: ${String(p.length_km ?? "-")} km</div>`;
      });

      const bldgHtml = (p: Record<string, unknown>) =>
        `<div class="text-xs"><b>${String(p.name || "Building Cluster")}</b></div>`;
      bindInteractiveLayer("buildings-2d", bldgHtml);
      bindInteractiveLayer("buildings-3d", bldgHtml);

      bindInteractiveLayer("infra-points", (p) => {
        return `<div class="text-xs space-y-1">
          <div class="font-semibold text-white">${String(p.name || "Asset")}</div>
          <div>Type: ${String(p.infra_type || "asset")} · Status: ${String(p.status || "-")}</div>
          <div>Flood distance: ${String(p.distance_m ?? "-")} m</div>
        </div>`;
      });

      const chgHtml = (p: Record<string, unknown>) =>
        `<div class="text-xs space-y-1">
          <div class="font-semibold text-amber-300">${String(p.name || "Site")}</div>
          <div>Area: ${String(p.area_ha ?? "-")} ha · Confidence: ${Math.round(Number(p.confidence ?? 0) * 100)}%</div>
          <div class="text-rose-300">${String(p.label || "Potential suspicious activity: requires official verification")}</div>
        </div>`;
      bindInteractiveLayer("change-2d", chgHtml);
      bindInteractiveLayer("change-3d", chgHtml);

      bindInteractiveLayer("sim-nodes-points", (p) => {
        return `<div class="text-xs"><b>${String(p.label || "Node")}</b><br/>${String(p.role || "")} (SIMULATION)</div>`;
      });
    });

    mapRef.current = map;

    return () => {
      simMarkersRef.current.forEach((m) => m.remove());
      simMarkersRef.current = [];
      mapLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [defaultView]);

  // Switch between flat 2D top-down and 3D terrain view
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyMode = () => {
      if (is3D && map.getSource("terrain-dem")) {
        map.setTerrain({ source: "terrain-dem", exaggeration: 2.2 });
      } else {
        map.setTerrain(null);
      }

      const setVis = (id: string, visible: boolean) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      };
      setVis("flood-2d", layers.floodExtent && !is3D);
      setVis("flood-3d", layers.floodExtent && is3D);
      setVis("perm-water-2d", layers.permanentWater && !is3D);
      setVis("perm-water-3d", layers.permanentWater && is3D);
      setVis("buildings-2d", layers.buildings && !is3D);
      setVis("buildings-3d", layers.buildings && is3D);
      setVis("change-2d", layers.changePolygons && !is3D);
      setVis("change-3d", layers.changePolygons && is3D);
      setVis("sim-altitude-beams-3d", Boolean(simRoute && simRoute.length > 0) && is3D);
      setVis("sim-altitude-platforms-3d", Boolean(simRoute && simRoute.length > 0) && is3D);
    };

    if (mapLoadedRef.current) {
      applyMode();
    } else {
      map.once("load", applyMode);
    }

    map.easeTo({
      pitch: is3D ? 58 : 0,
      bearing: is3D ? -22 : 0,
      duration: 650,
    });
  }, [is3D, layers, simRoute]);

  // Switch real basemap tile visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("base-dark")) return;
      map.setLayoutProperty("base-dark", "visibility", baseMap === "dark" ? "visible" : "none");
      map.setLayoutProperty("base-dark-ref", "visibility", baseMap === "dark" ? "visible" : "none");
      map.setLayoutProperty("base-osm", "visibility", baseMap === "osm" ? "visible" : "none");
      map.setLayoutProperty("base-satellite", "visibility", baseMap === "satellite" ? "visible" : "none");
    };
    if (mapLoadedRef.current) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [baseMap]);

  // Update GeoJSON sources, layer visibility, and 3D altitude labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncSources = () => {
      const setSrc = (id: string, data: SourceData) => {
        const src = map.getSource(id) as GeoJSONSource | undefined;
        if (src) src.setData(data);
      };
      const setVis = (layerIds: string[], visible: boolean) => {
        const vis = visible ? "visible" : "none";
        for (const id of layerIds) {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
        }
      };

      setSrc("aoi", (aoiGeo as unknown as SourceData) || EMPTY_FC);
      setVis(["aoi-line"], layers.aoi);

      setSrc("flood-extent", (simplifiedFlood as unknown as SourceData) || EMPTY_FC);
      setVis(["flood-2d"], layers.floodExtent && !is3D);
      setVis(["flood-3d"], layers.floodExtent && is3D);
      setVis(["flood-outline"], layers.floodExtent);

      setSrc("permanent-water", (permanentWaterGeo as unknown as SourceData) || EMPTY_FC);
      setVis(["perm-water-2d"], layers.permanentWater && !is3D);
      setVis(["perm-water-3d"], layers.permanentWater && is3D);

      if (assetsGeo) {
        const roadFeatures = assetsGeo.features.filter((f) => f.properties?.category === "road");
        const bldgFeatures = assetsGeo.features.filter((f) => f.properties?.category === "building_cluster");
        const infraFeatures = clusterPointFeatures(
          assetsGeo.features.filter((f) => f.properties?.category === "infrastructure")
        );
        setSrc("roads", { type: "FeatureCollection", features: roadFeatures } as unknown as SourceData);
        setSrc("buildings", { type: "FeatureCollection", features: bldgFeatures } as unknown as SourceData);
        setSrc("infrastructure", { type: "FeatureCollection", features: infraFeatures } as unknown as SourceData);
      } else {
        setSrc("roads", EMPTY_FC);
        setSrc("buildings", EMPTY_FC);
        setSrc("infrastructure", EMPTY_FC);
      }
      setVis(["roads-line"], layers.roads);
      setVis(["buildings-2d"], layers.buildings && !is3D);
      setVis(["buildings-3d"], layers.buildings && is3D);
      setVis(["infra-points"], layers.infrastructure);

      setSrc("change-polygons", (simplifiedChange as unknown as SourceData) || EMPTY_FC);
      setVis(["change-2d"], layers.changePolygons && !is3D);
      setVis(["change-3d"], layers.changePolygons && is3D);
      setVis(["change-outline"], layers.changePolygons);

      simMarkersRef.current.forEach((m) => m.remove());
      simMarkersRef.current = [];

      if (simRoute && simRoute.length > 1) {
        const allCoords = simRoute.map((p) => [p.lon, p.lat]);
        setSrc("sim-route-base", {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: allCoords } }],
        } as unknown as SourceData);

        const activeCoords =
          simProgressIndex >= 0 ? allCoords.slice(0, Math.min(simProgressIndex + 1, allCoords.length)) : [];
        setSrc("sim-route-active", {
          type: "FeatureCollection",
          features:
            activeCoords.length > 1
              ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: activeCoords } }]
              : [],
        } as unknown as SourceData);

        setSrc("sim-nodes", {
          type: "FeatureCollection",
          features: simRoute.map((pt, idx) => ({
            type: "Feature",
            properties: { label: pt.label, role: pt.role, reached: simProgressIndex >= idx },
            geometry: { type: "Point", coordinates: [pt.lon, pt.lat] },
          })),
        } as unknown as SourceData);

        const palette = ["#38BDF8", "#22D3EE", "#F59E0B", "#10B981"];
        setSrc("sim-altitude-beams", {
          type: "FeatureCollection",
          features: simRoute.map((pt, idx) => ({
            type: "Feature",
            properties: {
              beam_top: pt.altitudeBaseM ?? 1000,
              reached: simProgressIndex >= idx,
            },
            geometry: { type: "Polygon", coordinates: makeCirclePolygon(pt.lon, pt.lat, 0.004) },
          })),
        } as unknown as SourceData);

        setSrc("sim-altitude-platforms", {
          type: "FeatureCollection",
          features: simRoute.map((pt, idx) => ({
            type: "Feature",
            properties: {
              alt_base: pt.altitudeBaseM ?? 0,
              alt_top: pt.altitudeTopM ?? 400,
              color: palette[idx % palette.length],
              reached: simProgressIndex >= idx,
            },
            geometry: { type: "Polygon", coordinates: makeCirclePolygon(pt.lon, pt.lat, 0.013) },
          })),
        } as unknown as SourceData);

        simRoute.forEach((pt, idx) => {
          const el = document.createElement("div");
          const active = simProgressIndex >= idx;
          el.className = `px-2 py-0.5 rounded text-[10px] font-mono border pointer-events-none whitespace-nowrap ${
            active
              ? "bg-slate-950/95 text-cyan-200 border-cyan-400 shadow"
              : "bg-slate-900/85 text-slate-300 border-slate-700"
          }`;
          el.textContent = pt.altitudeLabel ? `${pt.label} · ${pt.altitudeLabel}` : pt.label;
          const marker = new Marker({ element: el, anchor: "bottom", offset: [0, -10] })
            .setLngLat([pt.lon, pt.lat])
            .addTo(map);
          simMarkersRef.current.push(marker);
        });
      } else {
        setSrc("sim-route-base", EMPTY_FC);
        setSrc("sim-route-active", EMPTY_FC);
        setSrc("sim-nodes", EMPTY_FC);
        setSrc("sim-altitude-beams", EMPTY_FC);
        setSrc("sim-altitude-platforms", EMPTY_FC);
      }
    };

    if (mapLoadedRef.current) {
      syncSources();
    } else {
      map.once("load", syncSources);
    }
  }, [layers, is3D, simplifiedFlood, permanentWaterGeo, assetsGeo, simplifiedChange, aoiGeo, simRoute, simProgressIndex]);

  // Smooth flyTo animation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToTarget) return;
    map.flyTo({
      center: [flyToTarget.lon, flyToTarget.lat],
      zoom: flyToTarget.zoom ?? 13.2,
      pitch: is3D ? 58 : 0,
      bearing: is3D ? -22 : 0,
      duration: 1000,
      essential: true,
    });
  }, [flyToTarget, is3D]);

  // Follow simulation handoff waypoints smoothly in 3D
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !simRoute || simProgressIndex < 0 || simProgressIndex >= simRoute.length) return;
    const target = simRoute[simProgressIndex];
    map.flyTo({
      center: [target.lon, target.lat],
      zoom: 11.2,
      pitch: is3D ? 62 : 0,
      bearing: is3D ? (simProgressIndex * 26 - 22) % 360 : 0,
      duration: 850,
      essential: true,
    });
  }, [simProgressIndex, simRoute, is3D]);

  const toggle = (key: keyof LayerToggleState) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="rounded-lg bg-[#0F1420] border border-slate-800 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-[#07090E] rounded border border-slate-800">
            {(
              [
                ["dark", "Dark Map"],
                ["osm", "OSM Streets"],
                ["satellite", "Satellite"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBaseMap(mode)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  baseMap === mode ? "bg-slate-800 text-cyan-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIs3D(!is3D)}
            aria-pressed={is3D}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap ${
              is3D
                ? "bg-cyan-500/20 text-cyan-200 border-cyan-500/50"
                : "bg-[#07090E] text-slate-200 border-slate-700 hover:border-slate-500"
            }`}
          >
            <Box className="w-3.5 h-3.5" aria-hidden="true" />
            2D / 3D View: {is3D ? "3D" : "2D"}
          </button>
        </div>

        {showLayerToggles && (
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["floodExtent", "Flood Extent", "text-cyan-300"],
                ["permanentWater", "Permanent Water", "text-blue-300"],
                ["roads", "Roads", "text-amber-300"],
                ["buildings", "Buildings", "text-rose-300"],
                ["infrastructure", "Critical Infra", "text-yellow-300"],
                ["changePolygons", "Land Change", "text-orange-300"],
                ["aoi", "AOI", "text-slate-300"],
              ] as const
            ).map(([key, label, colorCls]) => (
              <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={() => toggle(key)}
                  className="accent-cyan-400 rounded"
                />
                <span className={layers[key] ? colorCls : "text-slate-500"}>{label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div ref={containerRef} className={`w-full ${heightClass}`} aria-label="Interactive geospatial map" />
    </div>
  );
};
