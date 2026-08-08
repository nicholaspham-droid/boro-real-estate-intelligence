"use client";

import { useEffect, useState } from "react";

type Listing = {
  status: string;
  price: number | null;
  listedDate: string | null;
  lastSeenDate: string | null;
  daysOnMarket: number | null;
  mlsName: string | null;
  mlsNumber: string | null;
};

type RentCastResult = {
  retrievedAt: string;
  address: string;
  activeSale: Listing | null;
  activeRental: Listing | null;
  rentEstimate: { rent: number | null; low: number | null; high: number | null; compCount: number };
  boundary: string;
};

function money(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function RentCastEvidence({ address, locality }: { address: string; locality: string }) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RentCastResult | null>(null);

  useEffect(() => {
    fetch("/api/integrations/rentcast/status")
      .then((response) => response.json())
      .then((payload) => setConnected(Boolean(payload.connected)))
      .catch(() => setConnected(false));
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const params = new URLSearchParams({ address: `${address}, ${locality}` });
      const response = await fetch(`/api/integrations/rentcast/property?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "RentCast lookup failed");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "RentCast lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return <div className="rentcast-evidence">
    <div className="rentcast-head"><div><p className="eyebrow">RENTCAST · LISTING + RENT CHANNEL</p><h4>Check the actual market-facing evidence.</h4><p>Active asking price, rental status and rent comps stay separate from ATTOM and the public-record model.</p></div><button onClick={load} disabled={!connected || loading}>{loading ? "Checking three feeds…" : connected ? "Load listing + rent evidence" : "RentCast key required"}</button></div>
    {error && <p className="rentcast-error">{error}</p>}
    {result && <><div className="rentcast-grid"><div className={result.activeSale ? "active" : "empty"}><span>For-sale listing</span><b>{result.activeSale ? money(result.activeSale.price) : "Not active"}</b><small>{result.activeSale ? `${result.activeSale.daysOnMarket ?? "—"} DOM · ${result.activeSale.mlsName ?? "source not named"}` : "No exact-address active sale record returned"}</small></div><div className={result.activeRental ? "active" : "empty"}><span>For-rent listing</span><b>{result.activeRental ? `${money(result.activeRental.price)}/mo` : "Not active"}</b><small>{result.activeRental ? `${result.activeRental.daysOnMarket ?? "—"} DOM · last seen ${result.activeRental.lastSeenDate?.slice(0, 10) ?? "—"}` : "No exact-address active rental record returned"}</small></div><div><span>Long-term rent estimate</span><b>{result.rentEstimate.rent ? `${money(result.rentEstimate.rent)}/mo` : "—"}</b><small>{money(result.rentEstimate.low)}–{money(result.rentEstimate.high)} · {result.rentEstimate.compCount} rental comps</small></div></div><p className="rentcast-boundary"><b>Use boundary.</b> {result.boundary}</p></>}
  </div>;
}
