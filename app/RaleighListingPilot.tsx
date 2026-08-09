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
  deltaFromBaseline: number;
  percentile: number;
  priority: "high" | "medium" | "low";
  scoreBreakdown: Array<{ key: string; label: string; weight: number; score: number; baseline: number; weightedPoints: number }>;
  reasons: string[];
};

type PilotResult = {
  retrievedAt: string;
  requestCost: number;
  candidateCount: number;
  scoredCandidateCount: number;
  medianPricePerSqft: number;
  baselineScore: number;
  listings: PilotListing[];
  methodology: string;
  boundary: string;
};

const PINS = {
  high: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
  medium: "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
  low: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
};

const BAND_LABELS = { high: "Above baseline", medium: "Near baseline", low: "Higher diligence" };

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
            infoRef.current?.setContent(`<div class="map-tooltip property opportunity"><b>${escapeHtml(listing.addressLine1)}</b><strong>${escapeHtml(BAND_LABELS[listing.priority])} · ${listing.screeningScore}/100</strong><span>${listing.deltaFromBaseline >= 0 ? "+" : ""}${listing.deltaFromBaseline} vs Raleigh baseline · ${listing.percentile}th percentile</span><small>${money(listing.price)} · ${money(listing.pricePerSqft)}/sf · listing evidence only</small></div>`);
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
      <div><p className="eyebrow">FREE-TIER MVP · RALEIGH LIVE LISTINGS</p><h3 id="listing-pilot-title">Twelve listings. Three evidence bands. One API request.</h3><p>Raleigh is the only live-listing market enabled in this MVP. The comparison set intentionally includes leaders, baseline cases and higher-diligence cases so every pin does not look “hot.”</p></div>
      <div className="listing-budget"><span>Monthly allowance</span><b>50 calls</b><small>This screen uses one call, retrieves up to 50 candidates and caches the result for six hours.</small><button onClick={loadPilot} disabled={!connected || loading}>{loading ? "Loading candidates…" : result ? "Refresh 12-property set · 1 call" : connected ? "Load 12 live listings · 1 call" : "RentCast key required"}</button></div>
    </div>
    {error && <p className="listing-pilot-error">{error}</p>}
    {!result && <div className="listing-pilot-empty"><b>What this test validates</b><span>Active-listing availability</span><span>ZIP-level spread</span><span>Freshness and days on market</span><span>Price/sf screening</span><span>Source completeness</span></div>}
    {result && <>
      <div className="listing-pilot-meta"><span><b>{result.candidateCount.toLocaleString()}</b> matching Raleigh listings reported</span><span><b>{result.scoredCandidateCount}</b> candidates scored in this one call</span><span><b>{result.baselineScore}/100</b> candidate-pool median baseline</span><span><b>{money(result.medianPricePerSqft)}</b> sample median price/sf</span></div>
      <div className="listing-band-legend"><span className="high"><i /> Above baseline <b>+7 or more</b></span><span className="medium"><i /> Near baseline <b>within 6 points</b></span><span className="low"><i /> Higher diligence <b>−7 or lower / bottom 30%</b></span><small>Colors rank evidence-screen position, not investment quality.</small></div>
      <div className="listing-pilot-layout">
        <div className="listing-pilot-map" ref={mapElement} aria-label="Map of twelve active Raleigh listing candidates" />
        <div className="listing-pilot-list">{result.listings.map((listing, index) => <button key={listing.id} className={`${listing.priority} ${listing.id === selected?.id ? "active" : ""}`} onClick={() => setSelectedId(listing.id)}><i>{String(index + 1).padStart(2, "0")}</i><div><b>{listing.addressLine1}</b><small>Raleigh {listing.zipCode ?? ""} · {listing.bedrooms ?? "—"} bd / {listing.bathrooms ?? "—"} ba · {listing.squareFootage.toLocaleString()} sf</small></div><strong>{listing.screeningScore}<small>{listing.deltaFromBaseline >= 0 ? "+" : ""}{listing.deltaFromBaseline}</small></strong><span>{BAND_LABELS[listing.priority]} · {money(listing.price)} · {listing.daysOnMarket ?? "—"} DOM</span></button>)}</div>
      </div>
      {selected && <article className={`listing-pilot-detail ${selected.priority}`}>
        <div className="listing-detail-summary"><span>{BAND_LABELS[selected.priority]}</span><h4>{selected.addressLine1}</h4><p>{selected.address}</p><div><strong>{selected.screeningScore}<small>/100</small></strong><b>{selected.deltaFromBaseline >= 0 ? "+" : ""}{selected.deltaFromBaseline} vs baseline</b><i>{selected.percentile}th percentile</i></div></div>
        <dl><div><dt>Asking price</dt><dd>{money(selected.price)}</dd></div><div><dt>Price / sf</dt><dd>{money(selected.pricePerSqft)}</dd></div><div><dt>Days on market</dt><dd>{selected.daysOnMarket ?? "—"}</dd></div><div><dt>Listing source</dt><dd>{selected.mlsName ?? "Not named"}{selected.mlsNumber ? ` · ${selected.mlsNumber}` : ""}</dd></div></dl>
        <div className="listing-score-breakdown"><div className="score-breakdown-head"><b>Score breakdown</b><span>Listing score</span><span>Pool baseline ◆</span><span>Weighted points</span></div>{selected.scoreBreakdown.map((factor) => <div className="score-factor" key={factor.key}><label><b>{factor.label}</b><small>{factor.weight}% weight</small></label><div className="score-factor-track"><i style={{ width: `${factor.score}%` }} /><em style={{ left: `${factor.baseline}%` }} /></div><strong>{factor.score}</strong><span>◆ {factor.baseline}</span><b>{factor.weightedPoints}</b></div>)}</div>
        <div className="listing-detail-foot"><ul>{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address)}`} target="_blank" rel="noreferrer">Open location in Google Maps →</a></div>
      </article>}
      <p className="listing-pilot-boundary"><b>How to use this.</b> {result.methodology} {result.boundary}</p>
    </>}
  </section>;
}
