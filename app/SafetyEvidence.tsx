"use client";

import { useState } from "react";

type SafetyResult = {
  radiusMiles: number;
  source: string;
  sourceUrl: string;
  sourceCompetency: number;
  trendPct: number | null;
  current: { from: string; to: string; total: number; violent: number; property: number; other: number };
  prior: { total: number };
  definition: string;
  boundary: string;
};

function signed(value: number | null) {
  return value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function SafetyEvidence({ marketId, lat, lng, address, locality }: { marketId: string; lat: number; lng: number; address: string; locality: string }) {
  const [result, setResult] = useState<SafetyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ market: marketId, lat: String(lat), lng: String(lng), locality });
      const response = await fetch(`/api/public-safety/local?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Public-safety lookup failed");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Public-safety lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return <div className="safety-evidence">
    <div className="safety-head"><div><p className="eyebrow">LOCAL PUBLIC-SAFETY EVIDENCE</p><h4>Reported incidents near {address}</h4><p>Use a half-mile, trailing-12-month lens for property diligence. This stays separate from the national composite until comparable local coverage exists across markets.</p></div><button onClick={load} disabled={loading}>{loading ? "Loading official feed…" : result ? "Refresh local evidence" : "Load local safety context"}</button></div>
    {error && <p className="safety-error">{error}</p>}
    {result && <><div className="safety-metrics"><div><span>All reported incidents</span><b>{result.current.total.toLocaleString()}</b><small>{result.current.from}–{result.current.to}</small></div><div><span>Violent grouping</span><b>{result.current.violent.toLocaleString()}</b><small>Person offenses normalized locally</small></div><div><span>Property grouping</span><b>{result.current.property.toLocaleString()}</b><small>Property offenses normalized locally</small></div><div><span>YoY incident trend</span><b className={(result.trendPct ?? 0) > 0 ? "negative" : ""}>{signed(result.trendPct)}</b><small>Prior period {result.prior.total.toLocaleString()}</small></div><div><span>Source competency</span><b>{result.sourceCompetency}%</b><small>Local feed · coordinates · recency</small></div></div><div className="safety-boundary"><p><b>How to read it.</b> {result.definition}</p><p><b>Do not overread it.</b> {result.boundary}</p><a href={result.sourceUrl} target="_blank" rel="noreferrer">Audit {result.source} source →</a></div></>}
  </div>;
}
