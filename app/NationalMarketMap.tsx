"use client";

import { useEffect, useRef, useState } from "react";
import { BOROCAST_MAP_STYLES, getGoogleMaps, type GoogleCircle, type GoogleInfoWindow, type GoogleMapInstance, type GoogleMapsNamespace, type GoogleMarker } from "./googleMapsLoader";
import { explorerLayerValue, type ExplorerLayer, type MarketExplorer, type NeighborhoodSignal } from "./marketNeighborhoods";
import propertyValuations from "../data/property-valuations.json";

type Props = {
  market: MarketExplorer;
  neighborhoods: NeighborhoodSignal[];
  layer: ExplorerLayer;
  selectedId: string;
  onSelect: (id: string) => void;
  onPropertySelect?: (id: string) => void;
};

const LAYER_PALETTES: Record<ExplorerLayer, { low: number; high: number; label: string }> = {
  composite: { low: 190, high: 76, label: "Composite edge" },
  demographic: { low: 310, high: 350, label: "Demographic depth" },
  economic: { low: 18, high: 58, label: "Economic strength" },
  education: { low: 228, high: 172, label: "Education attainment" },
  housing: { low: 278, high: 196, label: "Housing capacity" },
  pricing: { low: 35, high: 350, label: "Price momentum" },
};

function heatColor(layer: ExplorerLayer, intensity: number) {
  const palette = LAYER_PALETTES[layer];
  const hue = palette.low + (palette.high - palette.low) * intensity;
  const light = 30 + intensity * 30;
  return `hsl(${hue} 88% ${light}%)`;
}

export function NationalMarketMap({ market, neighborhoods, layer, selectedId, onSelect, onPropertySelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const mapsRef = useRef<GoogleMapsNamespace | null>(null);
  const infoRef = useRef<GoogleInfoWindow | null>(null);
  const overlaysRef = useRef<Array<GoogleCircle | GoogleMarker>>([]);
  const onSelectRef = useRef(onSelect);
  const onPropertySelectRef = useRef(onPropertySelect);
  const initialMarketRef = useRef(market);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"heat" | "clusters" | "properties">("heat");

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onPropertySelectRef.current = onPropertySelect; }, [onPropertySelect]);

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
        setReady(true);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The market map could not be loaded.");
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !mapsRef.current) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    infoRef.current?.close();
    map.setCenter(market.center);
    map.setZoom(market.zoom);
    const radius = market.zoom <= 9 ? 6200 : market.zoom === 10 ? 2300 : 1250;
    const values = neighborhoods.map((item) => explorerLayerValue(item, layer));
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const spread = Math.max(8, maximum - minimum);

    for (const neighborhood of neighborhoods) {
      const value = explorerLayerValue(neighborhood, layer);
      const intensity = Math.max(0, Math.min(1, (value - minimum) / spread));
      const selected = neighborhood.id === selectedId;
      if (view === "heat") {
        const halo = new maps.Circle({
          map,
          center: { lat: neighborhood.lat, lng: neighborhood.lng },
          radius: radius * (1.62 + intensity * .48),
          fillColor: heatColor(layer, intensity),
          fillOpacity: .1 + intensity * .16,
          strokeOpacity: 0,
          zIndex: 1,
        });
        overlaysRef.current.push(halo);
      }
      const circle = new maps.Circle({
        map,
        center: { lat: neighborhood.lat, lng: neighborhood.lng },
        radius: radius * (selected ? 1.26 : 1) * (view === "heat" ? 1.18 : 1),
        fillColor: heatColor(layer, intensity),
        fillOpacity: view === "properties" ? .16 : selected ? .88 : .42 + intensity * .36,
        strokeColor: selected ? "#ffffff" : heatColor(layer, Math.min(1, intensity + .18)),
        strokeOpacity: view === "properties" ? .34 : .95,
        strokeWeight: selected ? 4 : view === "clusters" ? 2 : 1,
        zIndex: selected ? 5 : 2,
      });
      const select = () => onSelectRef.current(neighborhood.id);
      const show = () => {
        infoRef.current?.setContent(`<div class="map-tooltip"><b>${neighborhood.name}</b><strong>${value}/100 ${LAYER_PALETTES[layer].label}</strong><span>${neighborhood.tractCount} tracts · ${neighborhood.population.toLocaleString()} residents · ${neighborhood.confidence}% evidence competency</span><small>Click to inspect this cluster</small></div>`);
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
        const marker = new maps.Marker({
          map,
          position: { lat: property.lat, lng: property.lng },
          title: property.address,
          label: { text: String(property.model.watchScore), color: "#06142e", fontSize: "9px", fontWeight: "900" },
          zIndex: 12,
        });
        const show = () => {
          infoRef.current?.setContent(`<div class="map-tooltip property"><b>${property.address}</b><strong>$${property.model.value.toLocaleString()} model center</strong><span>$${property.model.low.toLocaleString()}–$${property.model.high.toLocaleString()} · ${property.model.confidence}% evidence quality</span><small>Watch ${property.model.watchScore}/100 · click for valuation detail</small></div>`);
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
  }, [layer, market, neighborhoods, ready, selectedId, view]);

  return (
    <div className="national-map-wrap">
      <div ref={containerRef} className="national-google-map" aria-label={`Interactive Google map of ${market.metro.short} census-tract clusters`} />
      {!ready && !error && <div className="map-loading"><i /> Loading {market.metro.short} on Google Maps…</div>}
      {error && <div className="map-error"><strong>Map unavailable</strong><span>{error}</span></div>}
      {ready && <div className="map-live-badge"><i /> Google Maps · {market.tractCount.toLocaleString()} ACS tracts</div>}
      <div className="map-mode-switch" aria-label="Map display mode"><button disabled={!ready} className={view === "heat" ? "active" : ""} onClick={() => setView("heat")}>Heat</button><button disabled={!ready} className={view === "clusters" ? "active" : ""} onClick={() => setView("clusters")}>Clusters</button><button disabled={!ready} className={view === "properties" ? "active" : ""} onClick={() => setView("properties")}>Properties</button></div>
      {ready && view !== "properties" && <div className="heat-legend"><span>Lower</span>{[0, .25, .5, .75, 1].map((intensity) => <i key={intensity} style={{ background: heatColor(layer, intensity) }} />)}<span>Higher</span><b>{LAYER_PALETTES[layer].label}</b></div>}
      {ready && view === "properties" && <div className="property-map-note">{propertyValuations.properties.some((property) => property.marketId === market.id) ? "Markers show watch score · click for valuation detail" : "Property records not connected in this market yet"}</div>}
    </div>
  );
}
