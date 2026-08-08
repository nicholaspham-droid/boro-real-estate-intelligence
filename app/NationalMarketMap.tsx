"use client";

import { useEffect, useRef, useState } from "react";
import { BOROCAST_MAP_STYLES, getGoogleMaps, type GoogleCircle, type GoogleInfoWindow, type GoogleMapInstance, type GoogleMapsNamespace, type GoogleMarker } from "./googleMapsLoader";
import { explorerLayerValue, type ExplorerLayer, type MarketExplorer, type NeighborhoodSignal } from "./marketNeighborhoods";

type Props = {
  market: MarketExplorer;
  neighborhoods: NeighborhoodSignal[];
  layer: ExplorerLayer;
  selectedId: string;
  onSelect: (id: string) => void;
};

function heatColor(value: number) {
  const hue = 158 - value * .82;
  const light = 18 + value * .48;
  return `hsl(${hue} 78% ${light}%)`;
}

export function NationalMarketMap({ market, neighborhoods, layer, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const mapsRef = useRef<GoogleMapsNamespace | null>(null);
  const infoRef = useRef<GoogleInfoWindow | null>(null);
  const overlaysRef = useRef<Array<GoogleCircle | GoogleMarker>>([]);
  const onSelectRef = useRef(onSelect);
  const initialMarketRef = useRef(market);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

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

    for (const neighborhood of neighborhoods) {
      const value = explorerLayerValue(neighborhood, layer);
      const selected = neighborhood.id === selectedId;
      const circle = new maps.Circle({
        map,
        center: { lat: neighborhood.lat, lng: neighborhood.lng },
        radius: radius * (selected ? 1.18 : 1),
        fillColor: heatColor(value),
        fillOpacity: selected ? .78 : .52,
        strokeColor: selected ? "#ffffff" : "#06142e",
        strokeOpacity: 1,
        strokeWeight: selected ? 3 : 1.2,
        zIndex: selected ? 5 : 2,
      });
      const marker = new maps.Marker({
        map,
        position: { lat: neighborhood.lat, lng: neighborhood.lng },
        title: neighborhood.name,
        label: { text: String(neighborhood.rank), color: "#06142e", fontSize: "11px", fontWeight: "900" },
        zIndex: selected ? 10 : 6,
      });
      const select = () => onSelectRef.current(neighborhood.id);
      const show = () => {
        infoRef.current?.setContent(`<div class="map-tooltip"><b>${neighborhood.name}</b><span>${value}/100 ${layer} · ${neighborhood.tractCount} tracts · ${neighborhood.confidence}% integrated competency</span></div>`);
        infoRef.current?.open({ map, anchor: marker });
      };
      circle.addListener("click", select);
      marker.addListener("click", select);
      circle.addListener("mouseover", show);
      marker.addListener("mouseover", show);
      circle.addListener("mouseout", () => infoRef.current?.close());
      marker.addListener("mouseout", () => infoRef.current?.close());
      overlaysRef.current.push(circle, marker);
    }

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [layer, market, neighborhoods, ready, selectedId]);

  return (
    <div className="national-map-wrap">
      <div ref={containerRef} className="national-google-map" aria-label={`Interactive Google map of ${market.metro.short} census-tract clusters`} />
      {!ready && !error && <div className="map-loading"><i /> Loading {market.metro.short} on Google Maps…</div>}
      {error && <div className="map-error"><strong>Map unavailable</strong><span>{error}</span></div>}
      {ready && <div className="map-live-badge"><i /> Google Maps · {market.tractCount.toLocaleString()} ACS tracts</div>}
    </div>
  );
}
