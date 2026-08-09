"use client";

import { useEffect, useRef, useState } from "react";
import { BOROCAST_MAP_STYLES, getGoogleMaps, type GoogleInfoWindow, type GoogleMapInstance, type GoogleMarker } from "./googleMapsLoader";

type PilotListing = {
  id: string;
  address: string;
  addressLine1: string;
  zipCode: string | null;
  lat: number;
  lng: number;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: number;
  yearBuilt: number | null;
  price: number;
  pricePerSqft: number;
  daysOnMarket: number | null;
  lastSeenDate: string | null;
  mlsName: string | null;
  mlsNumber: string | null;
  screeningScore: number;
  priority: "high" | "medium" | "low";
  reasons: string[];
};

type PilotResult = {
  retrievedAt: string;
  requestCost: number;
  candidateCount: number;
  medianPricePerSqft: number;
  listings: PilotListing[];
  methodology: string;
  boundary: string;
};

const PINS = {
  high: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
  medium: "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
  low: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

export function RaleighListingPilot() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PilotResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const infoRef = useRef<GoogleInfoWindow | null>(null);

  useEffect(() => {
    fetch("/api/integrations/rentcast/status")
      .then((response) => response.json())
      .then((payload) => setConnected(Boolean(payload.connected)))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    if (!result?.listings.length || !mapElement.current) return;
    let cancelled = false;
    async function renderMap() {
      try {
        const maps = await getGoogleMaps();
        if (cancelled || !mapElement.current || !result) return;
        markersRef.current.forEach((marker) => marker.setMap(null));
        const center = result.listings.reduce((sum, listing) => ({ lat: sum.lat + listing.lat, lng: sum.lng + listing.lng }), { lat: 0, lng: 0 });
        const map = mapRef.current ?? new maps.Map(mapElement.current, {
          center: { lat: center.lat / result.listings.length, lng: center.lng / result.listings.length },
          zoom: 11,
          minZoom: 8,
          maxZoom: 18,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          gestureHandling: "greedy",
          styles: BOROCAST_MAP_STYLES,
        });
        map.setCenter({ lat: center.lat / result.listings.length, lng: center.lng / result.listings.length });
        map.setZoom(11);
        mapRef.current = map;
        infoRef.current = infoRef.current ?? new maps.InfoWindow({ disableAutoPan: false });
        markersRef.current = result.listings.map((listing) => {
          const marker = new maps.Marker({
            map,
            position: { lat: listing.lat, lng: listing.lng },
            title: listing.address,
            icon: PINS[listing.priority],
            label: { text: String(listing.screeningScore), color: "#06142e", fontSize: "9px", fontWeight: "900" },
          });
          marker.addListener("click", () => {
            setSelectedId(listing.id);
            infoRef.current?.setContent(`<div class="map-tooltip property opportunity"><b>${escapeHtml(listing.addressLine1)}</b><strong>${listing.screeningScore}/100 LIVE-LISTING SCREEN</strong><span>${money(listing.price)} · ${money(listing.pricePerSqft)}/sf · ${listing.daysOnMarket ?? "—"} DOM</span><small>Listing evidence only—not a valuation</small></div>`);
            infoRef.current?.open({ map, anchor: marker });
          });
          return marker;
        });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The listing map could not be loaded.");
      }
    }
    void renderMap();
    return () => { cancelled = true; };
  }, [result]);

  async function loadPilot() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/rentcast/pilot?market=raleigh");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Raleigh listing pilot failed");
      setResult(payload);
      setSelectedId(payload.listings[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Raleigh listing pilot failed");
    } finally {
      setLoading(false);
    }
  }

  const selected = result?.listings.find((listing) => listing.id === selectedId) ?? result?.listings[0];

  return <section className="listing-pilot" aria-labelledby="listing-pilot-title">
    <div className="listing-pilot-head">
      <div><p className="eyebrow">FREE-TIER MVP · RALEIGH LIVE LISTINGS</p><h3 id="listing-pilot-title">Five listings. One API request. Clear next checks.</h3><p>Raleigh is the pilot because its public-record valuation model currently has the strongest observed performance: 81% model competency and 82% integrated competency.</p></div>
      <div className="listing-budget"><span>Monthly allowance</span><b>50 calls</b><small>This screen uses one call and caches the result for six hours.</small><button onClick={loadPilot} disabled={!connected || loading}>{loading ? "Loading candidates…" : result ? "Refresh Raleigh pilot · 1 call" : connected ? "Load 5 live listings · 1 call" : "RentCast key required"}</button></div>
    </div>
    {error && <p className="listing-pilot-error">{error}</p>}
    {!result && <div className="listing-pilot-empty"><b>What this test validates</b><span>Active-listing availability</span><span>ZIP-level spread</span><span>Freshness and days on market</span><span>Price/sf screening</span><span>Source completeness</span></div>}
    {result && <>
      <div className="listing-pilot-meta"><span><b>{result.candidateCount.toLocaleString()}</b> matching Raleigh candidates reported</span><span><b>{money(result.medianPricePerSqft)}</b> pilot median price/sf</span><span><b>{new Date(result.retrievedAt).toLocaleString()}</b> retrieved</span></div>
      <div className="listing-pilot-layout">
        <div className="listing-pilot-map" ref={mapElement} aria-label="Map of five active Raleigh listing candidates" />
        <div className="listing-pilot-list">{result.listings.map((listing, index) => <button key={listing.id} className={`${listing.priority} ${listing.id === selected?.id ? "active" : ""}`} onClick={() => setSelectedId(listing.id)}><i>{String(index + 1).padStart(2, "0")}</i><div><b>{listing.addressLine1}</b><small>Raleigh {listing.zipCode ?? ""} · {listing.bedrooms ?? "—"} bd / {listing.bathrooms ?? "—"} ba · {listing.squareFootage.toLocaleString()} sf</small></div><strong>{listing.screeningScore}</strong><span>{money(listing.price)} · {listing.daysOnMarket ?? "—"} DOM</span></button>)}</div>
      </div>
      {selected && <article className={`listing-pilot-detail ${selected.priority}`}><div><span>Selected live-listing screen</span><h4>{selected.addressLine1}</h4><p>{selected.address}</p></div><strong>{selected.screeningScore}<small>/100</small></strong><dl><div><dt>Asking price</dt><dd>{money(selected.price)}</dd></div><div><dt>Price / sf</dt><dd>{money(selected.pricePerSqft)}</dd></div><div><dt>Days on market</dt><dd>{selected.daysOnMarket ?? "—"}</dd></div><div><dt>Listing source</dt><dd>{selected.mlsName ?? "Not named"}{selected.mlsNumber ? ` · ${selected.mlsNumber}` : ""}</dd></div></dl><ul>{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address)}`} target="_blank" rel="noreferrer">Open location in Google Maps →</a></article>}
      <p className="listing-pilot-boundary"><b>How to use this.</b> {result.methodology} {result.boundary}</p>
    </>}
  </section>;
}
