"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOROCAST_MAP_STYLES, getGoogleMaps, type GoogleCircle, type GoogleDataFeature, type GoogleInfoWindow, type GoogleMapInstance, type GoogleMapsNamespace, type GoogleMarker } from "./googleMapsLoader";
import { type ExplorerLayer, type MarketExplorer, type NeighborhoodSignal } from "./marketNeighborhoods";
import type { ScoredTract } from "./tractPilot";
import propertyValuations from "../data/property-valuations.json";

type Props = {
  market: MarketExplorer;
  neighborhoods: NeighborhoodSignal[];
  layer: ExplorerLayer;
  selectedId: string;
  onSelect: (id: string) => void;
  onPropertySelect?: (id: string) => void;
  geographyMode?: "clusters" | "tracts";
  tracts?: ScoredTract[];
  tractGeoJson?: unknown;
  tractScopeLabel?: string;
  focus?: { center: { lat: number; lng: number }; zoom: number };
};

const LAYER_PALETTES: Record<ExplorerLayer, { low: number; high: number; label: string }> = {
  composite: { low: 190, high: 76, label: "Composite edge" },
  demographic: { low: 310, high: 350, label: "Demographic context" },
  economic: { low: 18, high: 58, label: "Economic strength" },
  education: { low: 228, high: 172, label: "Education context" },
  housing: { low: 278, high: 196, label: "Housing capacity" },
  pricing: { low: 35, high: 350, label: "Price momentum" },
};

function heatColor(layer: ExplorerLayer, intensity: number) {
  const palette = LAYER_PALETTES[layer];
  const hue = palette.low + (palette.high - palette.low) * intensity;
  const light = 30 + intensity * 30;
  return `hsl(${hue} 88% ${light}%)`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function NationalMarketMap({ market, neighborhoods, layer, selectedId, onSelect, onPropertySelect, geographyMode = "clusters", tracts = [], tractGeoJson, tractScopeLabel = "selected scope", focus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const mapsRef = useRef<GoogleMapsNamespace | null>(null);
  const infoRef = useRef<GoogleInfoWindow | null>(null);
  const overlaysRef = useRef<Array<GoogleCircle | GoogleMarker>>([]);
  const dataFeaturesRef = useRef<GoogleDataFeature[]>([]);
  const onSelectRef = useRef(onSelect);
  const onPropertySelectRef = useRef(onPropertySelect);
  const tractLookupRef = useRef(new Map<string, ScoredTract>());
  const layerRef = useRef(layer);
  const initialMarketRef = useRef(market);
  const lastScopeRef = useRef("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"heat" | "clusters" | "properties">("heat");

  const scopeSignature = useMemo(() => `${market.id}:${tractScopeLabel}:${tracts.length}:${tracts[0]?.id ?? ""}:${tracts.at(-1)?.id ?? ""}`, [market.id, tractScopeLabel, tracts]);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onPropertySelectRef.current = onPropertySelect; }, [onPropertySelect]);
  useEffect(() => { tractLookupRef.current = new Map(tracts.map((tract) => [tract.id, tract])); }, [tracts]);
  useEffect(() => { layerRef.current = layer; }, [layer]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const maps = await getGoogleMaps();
        if (cancelled || !containerRef.current) return;
        const initialMarket = initialMarketRef.current;
        const map = new maps.Map(containerRef.current, {
          center: initialMarket.center,
          zoom: initialMarket.zoom,
          minZoom: 7,
          maxZoom: 17,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          gestureHandling: "greedy",
          styles: BOROCAST_MAP_STYLES,
        });
        mapsRef.current = maps;
        mapRef.current = map;
        infoRef.current = new maps.InfoWindow({ disableAutoPan: true });
        map.data.addListener("click", (event) => {
          const geoid = String(event.feature.getProperty("geoid") ?? "");
          if (tractLookupRef.current.has(geoid)) onSelectRef.current(geoid);
        });
        map.data.addListener("mouseover", (event) => {
          const geoid = String(event.feature.getProperty("geoid") ?? "");
          const tract = tractLookupRef.current.get(geoid);
          if (!tract) return;
          const activeLayer = layerRef.current;
          infoRef.current?.setContent(`<div class="map-tooltip tract"><b>Tract ${escapeHtml(tract.geoid)}</b><strong>${tract[activeLayer]}/100 ${LAYER_PALETTES[activeLayer].label}</strong><span>${tract.population.toLocaleString()} residents · ${tract.confidence}% evidence competency · ${tract.marketPercentile}th market percentile</span><small>Click for the next diligence action</small></div>`);
          infoRef.current?.setPosition(event.latLng);
          infoRef.current?.open({ map });
        });
        map.data.addListener("mouseout", () => infoRef.current?.close());
        setReady(true);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The market map could not be loaded.");
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    dataFeaturesRef.current.forEach((feature) => map.data.remove(feature));
    dataFeaturesRef.current = [];
    if (geographyMode === "tracts" && tractGeoJson) {
      map.data.setStyle(() => ({ visible: false }));
      dataFeaturesRef.current = map.data.addGeoJson(tractGeoJson);
    }
    return () => {
      dataFeaturesRef.current.forEach((feature) => map.data.remove(feature));
      dataFeaturesRef.current = [];
    };
  }, [geographyMode, ready, tractGeoJson]);

  useEffect(() => {
    if (!ready || !mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    infoRef.current?.close();

    if (geographyMode === "tracts") {
      const values = tracts.map((item) => item[layer]);
      const minimum = values.length ? Math.min(...values) : 0;
      const maximum = values.length ? Math.max(...values) : 100;
      const spread = Math.max(8, maximum - minimum);
      const lookup = new Map(tracts.map((tract) => [tract.id, tract]));
      map.data.setStyle((feature) => {
        const geoid = String(feature.getProperty("geoid") ?? "");
        const tract = lookup.get(geoid);
        if (!tract) return { visible: false };
        const intensity = Math.max(0, Math.min(1, (tract[layer] - minimum) / spread));
        const selected = tract.id === selectedId;
        return {
          visible: true,
          fillColor: heatColor(layer, intensity),
          fillOpacity: selected ? .92 : .34 + intensity * .45,
          strokeColor: selected ? "#ffffff" : "#183454",
          strokeOpacity: selected ? 1 : .72,
          strokeWeight: selected ? 3 : .7,
          zIndex: selected ? 8 : 2,
        };
      });
      if (tracts.length && lastScopeRef.current !== scopeSignature) {
        const lats = tracts.map((tract) => tract.lat);
        const lngs = tracts.map((tract) => tract.lng);
        map.fitBounds({ north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs) }, 38);
        lastScopeRef.current = scopeSignature;
      }
      return;
    }

    lastScopeRef.current = "";
    map.setCenter(focus?.center ?? market.center);
    map.setZoom(focus?.zoom ?? market.zoom);
    const radius = market.zoom <= 9 ? 6200 : market.zoom === 10 ? 2300 : 1250;
    const values = neighborhoods.map((item) => item[layer]);
    if (!values.length) return;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const spread = Math.max(8, maximum - minimum);

    for (const neighborhood of neighborhoods) {
      const value = neighborhood[layer];
      const intensity = Math.max(0, Math.min(1, (value - minimum) / spread));
      const selected = neighborhood.id === selectedId;
      if (view === "heat") {
        const halo = new maps.Circle({ map, center: { lat: neighborhood.lat, lng: neighborhood.lng }, radius: radius * (1.62 + intensity * .48), fillColor: heatColor(layer, intensity), fillOpacity: .1 + intensity * .16, strokeOpacity: 0, zIndex: 1 });
        overlaysRef.current.push(halo);
      }
      const circle = new maps.Circle({ map, center: { lat: neighborhood.lat, lng: neighborhood.lng }, radius: radius * (selected ? 1.26 : 1) * (view === "heat" ? 1.18 : 1), fillColor: heatColor(layer, intensity), fillOpacity: view === "properties" ? .16 : selected ? .88 : .42 + intensity * .36, strokeColor: selected ? "#ffffff" : heatColor(layer, Math.min(1, intensity + .18)), strokeOpacity: view === "properties" ? .34 : .95, strokeWeight: selected ? 4 : view === "clusters" ? 2 : 1, zIndex: selected ? 5 : 2 });
      const select = () => onSelectRef.current(neighborhood.id);
      const show = () => {
        infoRef.current?.setContent(`<div class="map-tooltip"><b>${escapeHtml(neighborhood.name)}</b><strong>${value}/100 ${LAYER_PALETTES[layer].label}</strong><span>${neighborhood.tractCount} tracts · ${neighborhood.population.toLocaleString()} residents · ${neighborhood.confidence}% evidence competency</span><small>Click to inspect this cluster</small></div>`);
        infoRef.current?.setPosition({ lat: neighborhood.lat, lng: neighborhood.lng });
        infoRef.current?.open({ map });
      };
      circle.addListener("click", select);
      circle.addListener("mouseover", show);
      circle.addListener("mouseout", () => infoRef.current?.close());
      overlaysRef.current.push(circle);
      if (view === "clusters") {
        const marker = new maps.Marker({ map, position: { lat: neighborhood.lat, lng: neighborhood.lng }, title: neighborhood.name, label: { text: String(neighborhood.rank), color: "#06142e", fontSize: "11px", fontWeight: "900" }, zIndex: selected ? 10 : 6 });
        marker.addListener("click", select);
        marker.addListener("mouseover", show);
        marker.addListener("mouseout", () => infoRef.current?.close());
        overlaysRef.current.push(marker);
      }
    }

    if (view === "properties") {
      const properties = propertyValuations.properties.filter((property) => property.marketId === market.id);
      for (const property of properties) {
        const marker = new maps.Marker({ map, position: { lat: property.lat, lng: property.lng }, title: property.address, label: { text: String(property.model.watchScore), color: "#06142e", fontSize: "9px", fontWeight: "900" }, zIndex: 12 });
        const show = () => {
          infoRef.current?.setContent(`<div class="map-tooltip property"><b>${escapeHtml(property.address)}</b><strong>$${property.model.value.toLocaleString()} model center</strong><span>$${property.model.low.toLocaleString()}–$${property.model.high.toLocaleString()} · ${property.model.confidence}% evidence quality</span><small>Watch ${property.model.watchScore}/100 · click for valuation detail</small></div>`);
          infoRef.current?.open({ map, anchor: marker });
        };
        marker.addListener("click", () => onPropertySelectRef.current?.(property.id));
        marker.addListener("mouseover", show);
        marker.addListener("mouseout", () => infoRef.current?.close());
        overlaysRef.current.push(marker);
      }
    }

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [focus, geographyMode, layer, market, neighborhoods, ready, scopeSignature, selectedId, tracts, view]);

  return (
    <div className="national-map-wrap">
      <div ref={containerRef} className="national-google-map" aria-label={`Interactive Google map of ${market.metro.short} ${geographyMode === "tracts" ? "census tracts" : "census-tract clusters"}`} />
      {!ready && !error && <div className="map-loading"><i /> Loading {market.metro.short} on Google Maps…</div>}
      {error && <div className="map-error"><strong>Map unavailable</strong><span>{error}</span></div>}
      {ready && <div className="map-live-badge"><i /> Google Maps · {geographyMode === "tracts" ? `${tracts.length.toLocaleString()} visible tracts · ${tractScopeLabel}` : `${market.tractCount.toLocaleString()} ACS tracts`}</div>}
      {geographyMode === "tracts" ? <div className="map-mode-switch tract-heat-mode" aria-label="Map display mode"><button className="active" disabled={!ready}>Heat choropleth</button></div> : <div className="map-mode-switch" aria-label="Map display mode"><button disabled={!ready} className={view === "heat" ? "active" : ""} onClick={() => setView("heat")}>Heat</button><button disabled={!ready} className={view === "clusters" ? "active" : ""} onClick={() => setView("clusters")}>Clusters</button><button disabled={!ready} className={view === "properties" ? "active" : ""} onClick={() => setView("properties")}>Properties</button></div>}
      {ready && (geographyMode === "tracts" || view !== "properties") && <div className="heat-legend"><span>Lower</span>{[0, .25, .5, .75, 1].map((intensity) => <i key={intensity} style={{ background: heatColor(layer, intensity) }} />)}<span>Higher</span><b>{LAYER_PALETTES[layer].label} · relative within view</b></div>}
      {ready && geographyMode === "clusters" && view === "properties" && <div className="property-map-note">{propertyValuations.properties.some((property) => property.marketId === market.id) ? "Markers show watch score · click for valuation detail" : "Property records not connected in this market yet"}</div>}
    </div>
  );
}
