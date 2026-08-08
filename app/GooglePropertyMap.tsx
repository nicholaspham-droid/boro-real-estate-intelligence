"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOROCAST_MAP_STYLES, getGoogleMaps, type GoogleDataLayer } from "./googleMapsLoader";

type MapArea = {
  cd: number;
  name: string;
  score: number;
  farGap: number;
  resilience: number;
};

type Layer = "score" | "capacity" | "resilience";

type Props = {
  areas: MapArea[];
  layer: Layer;
  selectedCd: number;
  onSelect: (cd: number) => void;
};

function layerValue(area: MapArea, layer: Layer) {
  if (layer === "capacity") return Math.min(100, area.farGap * 52);
  if (layer === "resilience") return area.resilience;
  return area.score;
}

function heatColor(value: number) {
  const hue = 158 - value * 0.82;
  const light = 18 + value * 0.48;
  return `hsl(${hue} 78% ${light}%)`;
}

export function GooglePropertyMap({ areas, layer, selectedCd, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<GoogleDataLayer | null>(null);
  const onSelectRef = useRef(onSelect);
  const areasRef = useRef(areas);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const byCd = useMemo(() => new Map(areas.map((area) => [area.cd, area])), [areas]);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { areasRef.current = areas; }, [areas]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const maps = await getGoogleMaps();
        if (cancelled || !containerRef.current) return;

        const map = new maps.Map(containerRef.current, {
          center: { lat: 40.7128, lng: -73.963 },
          zoom: 10.6,
          minZoom: 9,
          maxZoom: 17,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          gestureHandling: "greedy",
          styles: BOROCAST_MAP_STYLES,
        });

        const geoResponse = await fetch("/community-districts.geojson");
        if (!geoResponse.ok) throw new Error("NYC district geometry could not be loaded.");
        const geojson = await geoResponse.json();
        map.data.addGeoJson(geojson);

        const info = new maps.InfoWindow({ disableAutoPan: true });
        map.data.addListener("click", (event) => {
          const cd = Number(event.feature.getProperty("boro_cd"));
          if (areasRef.current.some((area) => area.cd === cd)) onSelectRef.current(cd);
        });
        map.data.addListener("mouseover", (event) => {
          const cd = Number(event.feature.getProperty("boro_cd"));
          const area = areasRef.current.find((item) => item.cd === cd);
          if (!area) return;
          info.setContent(`<div class="map-tooltip"><b>${area.name}</b><span>${area.score}/100 potential</span></div>`);
          info.setPosition(event.latLng);
          info.open({ map });
        });
        map.data.addListener("mouseout", () => info.close());

        dataRef.current = map.data;
        setReady(true);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The map could not be loaded.");
      }
    }

    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !dataRef.current) return;
    dataRef.current.setStyle((feature) => {
      const cd = Number(feature.getProperty("boro_cd"));
      const area = byCd.get(cd);
      const selected = cd === selectedCd;
      return {
        fillColor: area ? heatColor(layerValue(area, layer)) : "#223a57",
        fillOpacity: area ? (selected ? 0.88 : 0.66) : 0.16,
        strokeColor: selected ? "#ffffff" : area ? "#0a1830" : "#455871",
        strokeOpacity: area ? 1 : 0.52,
        strokeWeight: selected ? 3 : area ? 1.2 : 0.6,
        clickable: Boolean(area),
        zIndex: selected ? 4 : area ? 2 : 1,
      };
    });
  }, [byCd, layer, ready, selectedCd]);

  return (
    <div className="google-map-wrap">
      <div ref={containerRef} className="google-map" aria-label="Interactive Google map of NYC community-district value-potential signals" />
      {!ready && !error && <div className="map-loading"><i /> Loading Google Maps and official NYC boundaries…</div>}
      {error && <div className="map-error"><strong>Map unavailable</strong><span>{error}</span></div>}
      {ready && <div className="map-live-badge"><i /> Google Maps · NYC Open Data</div>}
    </div>
  );
}
