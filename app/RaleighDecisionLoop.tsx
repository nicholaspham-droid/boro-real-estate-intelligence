"use client";

import { useMemo, useState } from "react";
import valuations from "../data/property-valuations.json";
import acs from "../data/acs-market-aggregations.json";
import styles from "./RaleighDecisionLoop.module.css";
import { buildDecisionMemo, buildPublicRecordRange, nearestCluster, selectComparableControls } from "./raleighDecisionLogic.mjs";

type Listing = {
  id: string; address: string; addressLine1: string; city: string; state: string; zipCode: string | null;
  lat: number; lng: number; propertyType: string; squareFootage: number; price: number; pricePerSqft: number;
  status?: string; bedrooms: number | null; bathrooms: number | null; lastSeenDate: string | null; daysOnMarket: number | null;
  mlsName: string | null; mlsNumber: string | null; screeningScore: number; percentile: number;
};

type ListingResult = { provider: string; retrievedAt: string; requestCost: number; listings: Listing[]; candidateCount: number; scoredCandidateCount: number };
type RentEvidence = { source: "rentcast_property"; median: number; low: number | null; high: number | null; compCount: number; retrievedAt: string };
type AttomEvidence = { status: "available" | "unavailable"; value?: number; low?: number; high?: number; deltaPct?: number; retrievedAt?: string; cacheHit?: boolean };
type Validation = { rent: RentEvidence | null; attom: AttomEvidence; errors: string[] };

function money(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function observedDate(value: string | null) {
  if (!value) return "not reported";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function RaleighDecisionLoop() {
  const [result, setResult] = useState<ListingResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [validationCache, setValidationCache] = useState<Record<string, Validation>>({});
  const selected = result?.listings.find((item) => item.id === selectedId) ?? result?.listings[0] ?? null;
  const raleighProperties = useMemo(() => valuations.properties.filter((property) => property.marketId === "raleigh"), []);
  const raleighMarket = acs.markets.find((market) => market.id === "raleigh")!;
  const controls = useMemo(() => selected ? selectComparableControls(selected, raleighProperties, 5) : [], [selected, raleighProperties]);
  const publicRange = useMemo(() => selected ? buildPublicRecordRange(selected, controls) : null, [selected, controls]);
  const cluster = useMemo(() => selected ? nearestCluster(selected, raleighMarket.clusters) : null, [selected, raleighMarket.clusters]);
  const validation = selected ? validationCache[selected.id] : null;
  const memo = useMemo(() => buildDecisionMemo({
    listing: selected,
    sourceMode: result ? "connected" : "none",
    publicRange,
    cluster,
    rentEvidence: validation?.rent ?? null,
    attomEvidence: validation?.attom ?? null,
  }), [selected, result, publicRange, cluster, validation]);

  async function loadCandidates() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/listings/raleigh", { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json() as ListingResult & { error?: string };
      if (!response.ok || !Array.isArray(payload.listings)) throw new Error(payload.error || "The connected listing feed is unavailable.");
      setResult(payload);
      setSelectedId(payload.listings[0]?.id ?? null);
    } catch (reason) {
      setResult(null);
      setSelectedId(null);
      setError(reason instanceof Error ? reason.message : "The connected listing feed is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  async function validateSelected() {
    if (!selected || validationCache[selected.id]) return;
    setValidating(true);
    setError("");
    const address2 = `${selected.city}, ${selected.state}${selected.zipCode ? ` ${selected.zipCode}` : ""}`;
    const rentUrl = `/api/integrations/rentcast/property?address=${encodeURIComponent(selected.address)}`;
    const attomUrl = `/api/integrations/attom/property?address1=${encodeURIComponent(selected.addressLine1)}&address2=${encodeURIComponent(address2)}&depth=core`;
    try {
      const [rentResponse, attomResponse] = await Promise.allSettled([fetch(rentUrl, { cache: "no-store" }), fetch(attomUrl, { cache: "no-store" })]);
      const errors: string[] = [];
      let rent: RentEvidence | null = null;
      let attom: AttomEvidence = { status: "unavailable" };
      if (rentResponse.status === "fulfilled") {
        const payload = await rentResponse.value.json() as { retrievedAt?: string; rentEstimate?: { rent?: number | null; low?: number | null; high?: number | null; compCount?: number }; error?: string };
        if (rentResponse.value.ok && payload.rentEstimate?.rent) rent = { source: "rentcast_property", median: payload.rentEstimate.rent, low: payload.rentEstimate.low ?? null, high: payload.rentEstimate.high ?? null, compCount: payload.rentEstimate.compCount ?? 0, retrievedAt: payload.retrievedAt ?? new Date().toISOString() };
        else errors.push(payload.error || "Property rent evidence was unavailable.");
      } else errors.push("Property rent evidence was unavailable.");
      if (attomResponse.status === "fulfilled") {
        const payload = await attomResponse.value.json() as { retrievedAt?: string; cacheHit?: boolean; property?: { avm?: { value?: number; low?: number; high?: number } }; secondarySignal?: { deltaPct?: number }; error?: string };
        if (attomResponse.value.ok && payload.property?.avm?.value) attom = { status: "available", value: payload.property.avm.value, low: payload.property.avm.low, high: payload.property.avm.high, deltaPct: publicRange ? (payload.property.avm.value / publicRange.center - 1) * 100 : payload.secondarySignal?.deltaPct, retrievedAt: payload.retrievedAt, cacheHit: payload.cacheHit };
        else errors.push(payload.error || "ATTOM did not return a matched AVM.");
      } else errors.push("ATTOM cross-check was unavailable.");
      setValidationCache((current) => ({ ...current, [selected.id]: { rent, attom, errors } }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Property validation could not complete.");
    } finally {
      setValidating(false);
    }
  }

  return <section className={styles.shell} aria-labelledby="raleigh-loop-title">
    <header className={styles.head}>
      <div><p className={styles.eyebrow}>RALEIGH REFERENCE LOOP · SIGNAL TO DECISION MEMO</p><h3 id="raleigh-loop-title">One candidate. Five evidence gates. One next action.</h3><p>The loop turns a tract signal into a property research decision. It will not produce an “advance” state without a fresh, source-traceable active listing and property-level rent evidence.</p></div>
      <div className={styles.budget}><span>Provider budget</span><b>1 call to screen</b><small>The market request returns up to 500 candidates. Property rent and ATTOM validation remain opt-in and run once per selected address.</small><button type="button" onClick={loadCandidates} disabled={loading}>{loading ? "Loading Raleigh…" : result ? "Refresh Raleigh · 1 call" : "Load Raleigh · 1 call"}</button></div>
    </header>
    {error && <p className={styles.error} role="alert"><b>Evidence unavailable.</b> {error} The decision loop has failed closed.</p>}
    <div className={styles.sourceStrip}>
      <div><span>Listing truth</span><b>{result ? "Connected feed" : "Not loaded"}</b><small>{result ? "Live provider response · up to 6h response cache" : "No conclusion permitted"}</small></div>
      <div><span>Public records</span><b>Wake County model v3</b><small>{valuations.asOf} snapshot · 1,210 backtests</small></div>
      <div><span>Cluster context</span><b>ACS 2020–2024</b><small>{raleighMarket.coverage}% field coverage · contextual rent only</small></div>
      <div><span>Property validation</span><b>{validation ? "Completed once" : "Opt-in"}</b><small>{validation ? `${validation.rent ? "Rent matched" : "Rent missing"} · ${validation.attom.status === "available" ? "ATTOM matched" : "ATTOM missing"}` : "Up to 4 provider calls"}</small></div>
    </div>
    <div className={styles.flow}>
      <aside className={styles.candidates} aria-label="Raleigh listing candidates">
        <div className={styles.candidatesHead}><b>Candidate queue</b><small>{result ? `${result.scoredCandidateCount} screened · ${Math.min(8, result.listings.length)} shown` : "Connected listings only"}</small></div>
        {result ? result.listings.slice(0, 8).map((listing) => <button type="button" className={`${styles.candidate} ${selected?.id === listing.id ? styles.candidateActive : ""}`} key={listing.id} onClick={() => setSelectedId(listing.id)}><b>{listing.addressLine1}</b><strong>{listing.screeningScore}</strong><span>{money(listing.price)} · {money(listing.pricePerSqft)}/sf · {listing.daysOnMarket ?? "—"} DOM · {listing.mlsName ?? "source unnamed"}</span></button>) : <div className={styles.empty}>Load the connected Raleigh feed to create a candidate queue. Public-record examples never masquerade as active listings.</div>}
      </aside>
      <main className={styles.evidence}>
        <span className={styles.crumb}>TRACT SIGNAL → PROPERTY → EVIDENCE FILE</span>
        <div className={styles.propertyHead}><div><h4>{selected?.addressLine1 ?? "No active candidate"}</h4><p>{selected ? `${selected.city}, ${selected.state} ${selected.zipCode ?? ""} · ${selected.propertyType} · ${selected.squareFootage.toLocaleString()} sf` : "The property layer remains locked until listing truth loads."}</p></div><strong>{selected ? money(selected.price) : "—"}<small>live asking price</small></strong></div>
        <div className={styles.stage}>
          <article><span>1 · Listing truth</span><b>{selected?.status ?? "Locked"}</b><small>{selected ? `${selected.mlsName ?? "No source name"}${selected.mlsNumber ? ` · ${selected.mlsNumber}` : ""} · observed ${observedDate(selected.lastSeenDate)}` : "No example address is treated as live."}</small><em>{result ? "CONNECTED" : "UNAVAILABLE"}</em></article>
          <article><span>2 · Public range</span><b>{publicRange ? money(publicRange.center) : "—"}</b><small>{publicRange ? `${money(publicRange.low)}–${money(publicRange.high)} · ${publicRange.controlCount} controls · ${publicRange.medianDistance} mi median distance` : "A range appears only with at least three usable controls."}</small><em>OFFICIAL SNAPSHOT</em></article>
          <article><span>3 · Rent evidence</span><b>{validation?.rent ? money(validation.rent.median) : cluster ? money(cluster.medianRent) : "—"}</b><small>{validation?.rent ? `${money(validation.rent.low)}–${money(validation.rent.high)} · ${validation.rent.compCount} property comps` : cluster ? `${money(cluster.rentP25)}–${money(cluster.rentP75)} · ${cluster.name} context, not achievable rent` : "No rent context."}</small><em>{validation?.rent ? "PROPERTY ESTIMATE" : "CLUSTER CONTEXT"}</em></article>
        </div>
        <div className={styles.controls}><div><b>Public-control quality</b><span>{publicRange?.quality ?? "unavailable"}</span></div><p>{publicRange ? `${publicRange.typeMatchPct}% same property type. Raleigh has a passing market backtest, but this candidate range is still constrained by the local control distance.` : "The system will not extrapolate a property value without comparable controls."}</p></div>
        <button type="button" className={styles.validate} onClick={validateSelected} disabled={!selected || validating || Boolean(validation)}>{validating ? "Validating property…" : validation ? "Property validation cached" : "Add rent + ATTOM evidence"}</button>
        <small className={styles.cost}>Explicit action only · RentCast property endpoint can use 3 calls · ATTOM core uses up to 1 call · results are reused during this session.</small>
      </main>
      <aside className={styles.memo} aria-live="polite">
        <div className={`${styles.decision} ${styles[memo.decision]}`}><span>Current research decision</span><h4>{memo.headline}</h4><p>{memo.rationale}</p></div>
        <div className={styles.gates}>{memo.gates.map((gate: { id: string; label: string; status: string; detail: string }) => <div className={styles.gate} key={gate.id}><i className={styles[gate.status]}>{gate.status}</i><b>{gate.label}</b><small>{gate.detail}</small></div>)}</div>
        <ul className={styles.next}>{memo.nextActions.map((action: string) => <li key={action}>{action}</li>)}</ul>
      </aside>
    </div>
    <p className={styles.boundary}><b>Decision boundary.</b> “Advance” means advance to full underwriting—not buy, bid or recommend. Demographic attributes do not enter this property decision. Taxes, insurance, financing, title, condition, concessions, lease terms and legal review remain outside this screen.</p>
  </section>;
}
