"use client";

import { useEffect, useState } from "react";

type AuditRecord = {
  id: string;
  marketId: string;
  address: string;
  status: "matched" | "failed";
  error?: string;
  borocastValue: number;
  attomValue?: number | null;
  deltaPct?: number | null;
  rangeOverlap?: boolean;
  attomConfidence?: number | null;
  attomPerSqft?: number | null;
  attomMonthlyChangePct?: number | null;
  taxAmount?: number | null;
  latestSaleAmount?: number | null;
  latestSaleDate?: string | null;
  cacheHit?: boolean;
  secondarySignal?: { vendorWeightPct: number; integratedConfidence: number; agreementScore: number; blendedValue: number; interpretation: string } | null;
};

type AuditResult = {
  retrievedAt: string;
  requested: number;
  matched: number;
  failed: number;
  providerCalls: number;
  attemptedRequests: number;
  cacheHits: number;
  cacheTtlDays: number;
  markets: Array<{ marketId: string; sampleSize: number; matched: number; coveragePct: number; publicCompetency: number; integratedCompetency: number; medianDeltaPct: number | null; rangeOverlapPct: number }>;
  records: AuditRecord[];
  methodology: string;
  boundary: string;
};

function money(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function AttomMarketAudit() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);

  useEffect(() => {
    fetch("/api/integrations/attom/status")
      .then((response) => response.json())
      .then((payload) => setConnected(Boolean((payload as { connected?: boolean }).connected)))
      .catch(() => setConnected(false));
  }, []);

  async function runAudit() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/attom/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketIds: ["chicago", "philadelphia", "raleigh"], perMarket: 2 }),
      });
      const payload = await response.json() as AuditResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "ATTOM market audit failed");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ATTOM market audit failed");
    } finally {
      setLoading(false);
    }
  }

  const byMarket = result ? ["chicago", "philadelphia", "raleigh"].map((marketId) => ({
    marketId,
    label: marketId === "raleigh" ? "Raleigh" : marketId[0].toUpperCase() + marketId.slice(1),
    rows: result.records.filter((record) => record.marketId === marketId),
  })) : [];

  return <div className="attom-audit">
    <div className="attom-audit-head"><div><p className="eyebrow">ATTOM ENRICHMENT · SIX CACHED CONTROL ADDRESSES</p><h3>Add vendor evidence without letting it dominate.</h3><p>One AVM Detail call supplies normalized facts, tax and assessment, recorded sale, price per square foot, monthly AVM movement and valuation uncertainty. Two controls per market are cached for 30 days; deeper mortgage, history, permit, equity and school calls remain opt-in.</p></div><button onClick={runAudit} disabled={!connected || loading}>{loading ? "Checking cache…" : result ? "Check enrichment again" : connected ? "Enrich three markets" : "ATTOM key required"}</button></div>
    {error && <p className="attom-error">{error}</p>}
    {result && <><div className="attom-audit-summary"><div><span>Matched</span><b>{result.matched}/{result.requested}</b></div><div><span>Counted calls</span><b>{result.providerCalls}</b></div><div><span>Cache hits</span><b>{result.cacheHits}</b></div><div><span>Range agreement</span><b>{result.matched ? Math.round(result.records.filter((record) => record.rangeOverlap).length / result.matched * 100) : 0}%</b></div><small>Retrieved {new Date(result.retrievedAt).toLocaleString()} · {result.attemptedRequests} requests attempted · successful responses are reused for {result.cacheTtlDays} days.</small></div><div className="attom-audit-markets">{byMarket.map((market) => { const summary = result.markets.find((item) => item.marketId === market.marketId); return <article key={market.marketId}><span>{market.label} · {summary?.integratedCompetency ?? "—"}% integrated competency</span>{market.rows.map((record) => <div key={record.id} className={record.status}><b>{record.address}</b><strong>{record.status === "matched" ? money(record.attomValue) : "No match"}</strong><small>{record.status === "matched" ? `${record.deltaPct && record.deltaPct > 0 ? "+" : ""}${record.deltaPct ?? "—"}% vs. BORO · ${record.rangeOverlap ? "ranges overlap" : "ranges disagree"} · ${money(record.attomPerSqft ?? null)}/sf · ${record.attomMonthlyChangePct ?? "—"}% MoM · tax ${money(record.taxAmount ?? null)} · ${record.secondarySignal?.vendorWeightPct ?? 0}% vendor weight${record.cacheHit ? " · cached" : ""}` : record.error}</small></div>)}</article>; })}</div><p className="attom-error"><b>Model boundary.</b> {result.boundary}</p></>}
  </div>;
}
