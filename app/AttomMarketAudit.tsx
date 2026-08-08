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
};

type AuditResult = {
  retrievedAt: string;
  requested: number;
  matched: number;
  failed: number;
  records: AuditRecord[];
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
      .then((payload) => setConnected(Boolean(payload.connected)))
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
      const payload = await response.json();
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
    <div className="attom-audit-head"><div><p className="eyebrow">ATTOM MARKET AUDIT · SIX CONTROL ADDRESSES</p><h3>Test the vendor against our evidence—not in place of it.</h3><p>Two qualified public records per live market are checked for address match, AVM availability, range overlap and disagreement with the Borocast model.</p></div><button onClick={runAudit} disabled={!connected || loading}>{loading ? "Auditing six properties…" : result ? "Run audit again" : connected ? "Launch ATTOM analysis" : "ATTOM key required"}</button></div>
    {error && <p className="attom-error">{error}</p>}
    {result && <><div className="attom-audit-summary"><div><span>Matched</span><b>{result.matched}/{result.requested}</b></div><div><span>Failed</span><b>{result.failed}</b></div><div><span>Range agreement</span><b>{result.matched ? Math.round(result.records.filter((record) => record.rangeOverlap).length / result.matched * 100) : 0}%</b></div><small>Retrieved {new Date(result.retrievedAt).toLocaleString()} · live vendor responses are session evidence and are not written into the public-record model.</small></div><div className="attom-audit-markets">{byMarket.map((market) => <article key={market.marketId}><span>{market.label}</span>{market.rows.map((record) => <div key={record.id} className={record.status}><b>{record.address}</b><strong>{record.status === "matched" ? money(record.attomValue) : "No match"}</strong><small>{record.status === "matched" ? `${record.deltaPct && record.deltaPct > 0 ? "+" : ""}${record.deltaPct ?? "—"}% vs. Borocast · ${record.rangeOverlap ? "ranges overlap" : "ranges disagree"}` : record.error}</small></div>)}</article>)}</div></>}
  </div>;
}
