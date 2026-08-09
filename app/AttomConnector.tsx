"use client";

import { useEffect, useState } from "react";

type AttomResult = {
  property: {
    address: string;
    type: string | null;
    yearBuilt: number | null;
    livingSize: number | null;
    assessment: { market: number | null };
    sale: { date: string | null; amount: number | null };
    avm: { value: number | null; low: number | null; high: number | null; confidence: number | null; asOf: string | null };
  };
};

function money(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function AttomConnector() {
  const [connected, setConnected] = useState(false);
  const [checked, setChecked] = useState(false);
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AttomResult | null>(null);

  useEffect(() => {
    fetch("/api/integrations/attom/status")
      .then((response) => response.json())
      .then((payload) => setConnected(Boolean(payload.connected)))
      .catch(() => setConnected(false))
      .finally(() => setChecked(true));
  }, []);

  async function lookup() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const params = new URLSearchParams({ address1, address2 });
      const response = await fetch(`/api/integrations/attom/property?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ATTOM lookup failed");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ATTOM lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return <div className="attom-console">
    <div className="attom-intro"><div><span className={`attom-light ${connected ? "connected" : ""}`} />{checked ? connected ? "ATTOM CONNECTED" : "ADAPTER READY · KEY REQUIRED" : "CHECKING CONNECTION"}</div><h3>Bring an independent AVM into the evidence stack.</h3><p>The server-side adapter requests ATTOM property facts, assessment, recorded sale and AVM range. Owner, mortgage and mailing fields are excluded. The API key never reaches the browser.</p><a href="https://api.developer.attomdata.com/" target="_blank" rel="noreferrer">Create or open an ATTOM developer account →</a></div>
    <div className="attom-form"><label><span>Street address</span><input value={address1} onChange={(event) => setAddress1(event.target.value)} placeholder="123 Main St" /></label><label><span>City, state, ZIP</span><input value={address2} onChange={(event) => setAddress2(event.target.value)} placeholder="Raleigh, NC 27601" /></label><button onClick={lookup} disabled={!connected || !address1 || !address2 || loading}>{loading ? "Checking…" : connected ? "Cross-check property" : "Add ATTOM key to activate"}</button><small>One lookup uses the ATTOM AVM Detail endpoint. Results remain a separate vendor signal and are not silently averaged into BORO.</small></div>
    {error && <p className="attom-error">{error}</p>}
    {result && <div className="attom-result"><div><span>ATTOM address</span><b>{result.property.address}</b><small>{result.property.type || "Property"} · {result.property.livingSize?.toLocaleString() || "—"} sf · built {result.property.yearBuilt || "—"}</small></div><div><span>AVM</span><b>{money(result.property.avm.value)}</b><small>{money(result.property.avm.low)}–{money(result.property.avm.high)} · confidence {result.property.avm.confidence ?? "—"}</small></div><div><span>Public facts</span><b>{money(result.property.assessment.market)}</b><small>Market assessment · last sale {money(result.property.sale.amount)} on {result.property.sale.date || "—"}</small></div></div>}
  </div>;
}
