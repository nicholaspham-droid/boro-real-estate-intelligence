"use client";

import { useEffect, useState } from "react";

type AttomModule = {
  id: string;
  label: string;
  endpoint: string;
  status: "available" | "no_result" | "not_entitled" | "error";
  countedCalls: number;
  message: string | null;
};

type AttomResult = {
  depth: "core" | "underwriting";
  providerCalls: number;
  attemptedRequests: number;
  cacheHit: boolean;
  property: {
    address: string;
    type: string | null;
    yearBuilt: number | null;
    livingSize: number | null;
    assessment: { market: number | null; total: number | null; taxAmount: number | null; taxYear: number | null };
    sale: { date: string | null; amount: number | null; pricePerSqft: number | null; armsLength: string | null };
    avm: { value: number | null; low: number | null; high: number | null; confidence: number | null; asOf: string | null; perSqft: number | null; monthlyChangePct: number | null };
    homeEquity: { ltvPct: number | null; estimatedAvailable: number | null };
    mortgage: { first: { amount: number | null; rate: number | null; date: string | null; dueDate: string | null } | null };
    salesHistory: Array<{ date: string | null; amount: number | null }>;
    permits: Array<{ date: string | null; type: string | null; status: string | null; jobValue: number | null }>;
    schools: Array<{ name: string | null; rating: number | null; distanceMiles: number | null }>;
    modules: AttomModule[];
  };
};

function money(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function numeric(value: number | null, suffix = "") {
  return value === null ? "—" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

export function AttomConnector() {
  const [connected, setConnected] = useState(false);
  const [checked, setChecked] = useState(false);
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [loadingMode, setLoadingMode] = useState<"core" | "underwriting" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AttomResult | null>(null);

  useEffect(() => {
    fetch("/api/integrations/attom/status")
      .then((response) => response.json())
      .then((payload) => setConnected(Boolean((payload as { connected?: boolean }).connected)))
      .catch(() => setConnected(false))
      .finally(() => setChecked(true));
  }, []);

  async function lookup(depth: "core" | "underwriting") {
    setLoadingMode(depth);
    setError("");
    setResult(null);
    try {
      const params = new URLSearchParams({ address1, address2, depth });
      if (depth === "underwriting") params.set("confirm", "full");
      const response = await fetch(`/api/integrations/attom/property?${params}`);
      const payload = await response.json() as AttomResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "ATTOM lookup failed");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ATTOM lookup failed");
    } finally {
      setLoadingMode(null);
    }
  }

  const canLookup = connected && Boolean(address1) && Boolean(address2) && !loadingMode;

  return <div className="attom-console">
    <div className="attom-intro"><div><span className={`attom-light ${connected ? "connected" : ""}`} />{checked ? connected ? "ATTOM CONNECTED" : "ADAPTER READY · KEY REQUIRED" : "CHECKING CONNECTION"}</div><h3>Build an independent property evidence file.</h3><p>The core check returns valuation, facts, assessment, tax, recorded sale, price per square foot and freshness. Full diligence can additionally request mortgage summary, 10-year sales history, permits, home equity and school context.</p><a href="https://api.developer.attomdata.com/docs" target="_blank" rel="noreferrer">Review the ATTOM endpoint contract →</a></div>
    <div className="attom-form"><label><span>Street address</span><input value={address1} onChange={(event) => setAddress1(event.target.value)} placeholder="123 Main St" /></label><label><span>City, state, ZIP</span><input value={address2} onChange={(event) => setAddress2(event.target.value)} placeholder="Raleigh, NC 27601" /></label><button onClick={() => lookup("core")} disabled={!canLookup}>{loadingMode === "core" ? "Checking core file…" : connected ? "Core cross-check · max 1 counted call" : "Add ATTOM key to activate"}</button><button className="attom-deep-button" onClick={() => lookup("underwriting")} disabled={!canLookup}>{loadingMode === "underwriting" ? "Building full file…" : "Full property file · max 6 counted calls"}</button><small>Successful responses are cached for 30 days. ATTOM documents that only HTTP 200 responses count toward monthly allowance. Full diligence is explicit and never runs from the scheduled market audit.</small></div>
    {error && <p className="attom-error">{error}</p>}
    {result && <><div className="attom-result"><div><span>ATTOM address</span><b>{result.property.address}</b><small>{result.property.type || "Property"} · {result.property.livingSize?.toLocaleString() || "—"} sf · built {result.property.yearBuilt || "—"}</small></div><div><span>AVM + recency</span><b>{money(result.property.avm.value)}</b><small>{money(result.property.avm.low)}–{money(result.property.avm.high)} · {money(result.property.avm.perSqft)}/sf · {numeric(result.property.avm.monthlyChangePct, "%")} MoM · confidence {result.property.avm.confidence ?? "—"}</small></div><div><span>Recorded evidence</span><b>{money(result.property.assessment.taxAmount)} tax</b><small>{result.property.assessment.taxYear || "—"} · assessment {money(result.property.assessment.market ?? result.property.assessment.total)} · sale {money(result.property.sale.amount)} at {money(result.property.sale.pricePerSqft)}/sf</small></div>{result.depth === "underwriting" && <><div><span>Debt + equity</span><b>{money(result.property.homeEquity.estimatedAvailable)}</b><small>Estimated available equity · LTV {numeric(result.property.homeEquity.ltvPct, "%")} · first mortgage {money(result.property.mortgage.first?.amount ?? null)}</small></div><div><span>History + permits</span><b>{result.property.salesHistory.length} sales · {result.property.permits.length} permits</b><small>Privacy-reduced records; document numbers and party names are not retained.</small></div><div><span>School context</span><b>{result.property.schools.length} matched schools</b><small>Descriptive proximity and rating context; verify attendance eligibility directly.</small></div></>}</div><div className="attom-module-strip"><span>{result.cacheHit ? "Cached file" : `${result.providerCalls} counted calls / ${result.attemptedRequests} attempted`}</span>{result.property.modules.map((module) => <div key={module.id} className={module.status}><b>{module.label}</b><small>{module.status.replace("_", " ")}{module.message && module.status !== "available" ? ` · ${module.message}` : ""}</small></div>)}</div></>}
  </div>;
}
