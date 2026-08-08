"use client";

import { useEffect, useRef, useState } from "react";
import propertyValuations from "../data/property-valuations.json";
import { BOROCAST_MAP_STYLES, getGoogleMaps, type GoogleInfoWindow, type GoogleMapInstance, type GoogleMapsNamespace, type GoogleMarker } from "./googleMapsLoader";

type PropertyRecord = (typeof propertyValuations.properties)[number];
type Heat = "hot" | "watch" | "cool";

type Props = {
  marketLabel: string;
  properties: PropertyRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const PIN_URLS: Record<Heat, string> = {
  hot: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
  watch: "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
  cool: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
};

export function propertyHeat(property: PropertyRecord): Heat {
  if (property.model.watchScore >= 80 && property.model.confidence >= 75) return "hot";
  if (property.model.watchScore >= 75 && property.model.confidence >= 65) return "watch";
  return "cool";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function PropertyOpportunityMap({ marketLabel, properties, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const mapsRef = useRef<GoogleMapsNamespace | null>(null);
  const infoRef = useRef<GoogleInfoWindow | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const onSelectRef = useRef(onSelect);
  const initialPropertiesRef = useRef(properties);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const maps = await getGoogleMaps();
        if (cancelled || !containerRef.current) return;
        const first = initialPropertiesRef.current[0];
        const map = new maps.Map(containerRef.current, {
          center: first ? { lat: first.lat, lng: first.lng } : { lat: 39.5, lng: -98.35 },
          zoom: 11,
          minZoom: 7,
          maxZoom: 18,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          gestureHandling: "greedy",
          styles: BOROCAST_MAP_STYLES,
        });
        mapsRef.current = maps;
        mapRef.current = map;
        infoRef.current = new maps.InfoWindow({ disableAutoPan: false });
        setReady(true);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The property map could not be loaded.");
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !mapsRef.current || !properties.length) return;
    const map = mapRef.current;
    const maps = mapsRef.current;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    infoRef.current?.close();
    const center = properties.reduce((sum, property) => ({ lat: sum.lat + property.lat, lng: sum.lng + property.lng }), { lat: 0, lng: 0 });
    map.setCenter({ lat: center.lat / properties.length, lng: center.lng / properties.length });
    map.setZoom(11);

    for (const property of properties) {
      const heat = propertyHeat(property);
      const marker = new maps.Marker({
        map,
        position: { lat: property.lat, lng: property.lng },
        title: property.address,
        icon: PIN_URLS[heat],
        label: { text: String(property.model.watchScore), color: "#06142e", fontSize: "9px", fontWeight: "900" },
        opacity: property.id === selectedId ? 1 : .88,
        zIndex: property.id === selectedId ? 20 : heat === "hot" ? 15 : 10,
      });
      const show = () => {
        infoRef.current?.setContent(`<div class="map-tooltip property opportunity"><b>${property.address}</b><strong>${heat.toUpperCase()} · ${property.model.watchScore}/100 evidence priority</strong><span>${money(property.model.low)}–${money(property.model.high)} · ${property.model.confidence}% evidence quality</span><small>Click the pin to open the full public-record detail below</small></div>`);
        infoRef.current?.open({ map, anchor: marker });
      };
      marker.addListener("click", () => { onSelectRef.current(property.id); show(); });
      marker.addListener("mouseover", show);
      marker.addListener("mouseout", () => infoRef.current?.close());
      markersRef.current.push(marker);
    }

    return () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [properties, ready, selectedId]);

  const selected = properties.find((property) => property.id === selectedId) ?? properties[0];
  const counts = properties.reduce((current, property) => ({ ...current, [propertyHeat(property)]: current[propertyHeat(property)] + 1 }), { hot: 0, watch: 0, cool: 0 });

  return <div className="opportunity-map-shell">
    <div className="opportunity-map-head"><div><p className="eyebrow">MAP-FIRST PROPERTY EXPLORER</p><h3>{marketLabel} evidence map</h3><p>Color ranks diligence priority from the public-record watch model. It does not claim a property is a good or bad investment.</p></div><div className="opportunity-legend"><span className="hot">Hot <b>{counts.hot}</b></span><span className="watch">Watch <b>{counts.watch}</b></span><span className="cool">Cool <b>{counts.cool}</b></span></div></div>
    <div className="opportunity-map-stage">
      <div ref={containerRef} className="opportunity-google-map" aria-label={`Interactive Google map of ${marketLabel} property evidence`} />
      {!ready && !error && <div className="map-loading"><i /> Loading property evidence…</div>}
      {error && <div className="map-error"><strong>Map unavailable</strong><span>{error}</span></div>}
      {ready && <div className="map-live-badge"><i /> Google Maps · {properties.length} qualified records</div>}
    </div>
    {selected && <button className={`opportunity-selected ${propertyHeat(selected)}`} onClick={() => onSelect(selected.id)}><span>Selected · {propertyHeat(selected)}</span><b>{selected.address}</b><small>{money(selected.model.low)}–{money(selected.model.high)} · {selected.model.confidence}% evidence quality · open detail below ↓</small></button>}
  </div>;
}
