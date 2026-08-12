"use client";

import { useState } from "react";
import propertyValuations from "../data/property-valuations.json";
import { VALUATION_MARKET_IDS } from "./featureAvailability";
import { ACS_AGGREGATION_META, MARKET_EXPLORERS } from "./marketNeighborhoods";

const STRATEGIES = [
  { id: "balanced", label: "Balanced", detail: "Require price, income and evidence to agree", targetCap: 6.5, down: 25, vacancy: 6, maintenance: 8 },
  { id: "growth", label: "Growth", detail: "Accept a lower yield only with strong local evidence", targetCap: 5, down: 25, vacancy: 5, maintenance: 7 },
  { id: "income", label: "Income", detail: "Prioritize coverage, resilient NOI and cash yield", targetCap: 7.5, down: 30, vacancy: 7, maintenance: 10 },
  { id: "value", label: "Value-add", detail: "Demand a larger margin for rehab and execution risk", targetCap: 6.5, down: 30, vacancy: 8, maintenance: 12 },
] as const;

type PropertyRentRange = {
  provider: string;
  retrievedAt: string;
  requestCost: number;
  subject: { address: string; propertyType: string; bedrooms: number | null; bathrooms: number | null; squareFootage: number; providerSquareFootage: number | null };
  comparableRange: null | { p25: number; median: number; p75: number; rentPerSqft: { p25: number; median: number; p75: number } };
  providerEstimate: { median: number | null; low85: number | null; high85: number | null };
  evidence: { compCount: number; medianDaysOld: number | null; medianDistance: number | null; grade: "strong" | "moderate" | "weak" };
  methodology: string;
  boundary: string;
};

function money(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function payment(principal: number, annualRate: number, years: number) {
  const periods = years * 12;
  const rate = annualRate / 1200;
  if (!principal || !periods) return 0;
  if (!rate) return principal / periods;
  return principal * rate * (1 + rate) ** periods / ((1 + rate) ** periods - 1);
}

export function DecisionStudio({ marketId, onMarketChange }: { marketId: string; onMarketChange: (marketId: string) => void }) {
  const liveMarkets = propertyValuations.markets.filter((item) => VALUATION_MARKET_IDS.includes(item.id));
  const marketProperties = propertyValuations.properties.filter((item) => item.marketId === marketId);
  const [propertyId, setPropertyId] = useState(marketProperties[0].id);
  const selected = propertyValuations.properties.find((item) => item.id === propertyId) ?? marketProperties[0];
  const market = propertyValuations.markets.find((item) => item.id === selected.marketId) ?? liveMarkets[0];
  const rentMarket = MARKET_EXPLORERS.find((item) => item.id === selected.marketId) ?? MARKET_EXPLORERS[0];
  const [rentClusterId, setRentClusterId] = useState(selected.clusterId);
  const rentCluster = rentMarket.neighborhoods.find((item) => item.id === rentClusterId) ?? rentMarket.neighborhoods.find((item) => item.id === selected.clusterId) ?? rentMarket.neighborhoods[0];
  const [strategyId, setStrategyId] = useState<(typeof STRATEGIES)[number]["id"]>("balanced");
  const strategy = STRATEGIES.find((item) => item.id === strategyId) ?? STRATEGIES[0];
  const [askPrice, setAskPrice] = useState(selected.model.value);
  const [livingArea, setLivingArea] = useState(selected.sqft ?? 0);
  const [bedrooms, setBedrooms] = useState<number | null>(selected.beds ?? null);
  const [bathrooms, setBathrooms] = useState<number | null>(selected.baths ?? null);
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [rentBasis, setRentBasis] = useState<"property_p25" | "property_median" | "property_p75" | "custom">("custom");
  const [propertyRent, setPropertyRent] = useState<PropertyRentRange | null>(null);
  const [rentLoading, setRentLoading] = useState(false);
  const [rentError, setRentError] = useState("");
  const [unitInputsConfirmed, setUnitInputsConfirmed] = useState(false);
  const [rehab, setRehab] = useState(0);
  const [closingPct, setClosingPct] = useState(2);
  const [taxes, setTaxes] = useState(0);
  const [insurance, setInsurance] = useState(0);
  const [hoaMonthly, setHoaMonthly] = useState(0);
  const [downPct, setDownPct] = useState<number>(strategy.down);
  const [interestRate, setInterestRate] = useState(6.75);
  const [termYears, setTermYears] = useState(30);
  const [vacancyPct, setVacancyPct] = useState<number>(strategy.vacancy);
  const [maintenancePct, setMaintenancePct] = useState<number>(strategy.maintenance);
  const [targetCap, setTargetCap] = useState<number>(strategy.targetCap);

  function chooseMarket(id: string) {
    onMarketChange(id);
  }

  function chooseProperty(id: string) {
    const property = propertyValuations.properties.find((item) => item.id === id)!;
    setPropertyId(id);
    setAskPrice(property.model.value);
    setLivingArea(property.sqft ?? 0);
    setBedrooms(property.beds ?? null);
    setBathrooms(property.baths ?? null);
    setRentClusterId(property.clusterId);
    setMonthlyRent(0);
    setRentBasis("custom");
    setPropertyRent(null);
    setRentError("");
    setUnitInputsConfirmed(false);
    setRehab(0);
    setTaxes(0);
    setInsurance(0);
    setHoaMonthly(0);
  }

  function chooseRentCluster(id: string) {
    const cluster = rentMarket.neighborhoods.find((item) => item.id === id) ?? rentMarket.neighborhoods[0];
    setRentClusterId(cluster.id);
  }

  function invalidatePropertyRent() {
    setPropertyRent(null);
    setMonthlyRent(0);
    setRentBasis("custom");
    setRentError("");
  }

  function applyPropertyRent(point: "p25" | "median" | "p75") {
    const range = propertyRent?.comparableRange;
    if (!range) return;
    setMonthlyRent(range[point]);
    setRentBasis(`property_${point}`);
  }

  async function loadPropertyRentRange() {
    if (!livingArea || livingArea < 150) {
      setRentError("Enter a credible subject-property living area before loading rental comps.");
      return;
    }
    const multiFamily = /multi|apartment|\b[234]\s*family\b/i.test(selected.propertyType);
    if (multiFamily && !unitInputsConfirmed) {
      setRentError("Confirm that bedrooms, bathrooms and living area describe one unit, not the whole building.");
      return;
    }
    setRentLoading(true);
    setRentError("");
    setPropertyRent(null);
    try {
      const params = new URLSearchParams({
        address: `${selected.address}, ${selected.locality}`,
        propertyType: selected.propertyType,
        squareFootage: String(livingArea),
      });
      if (bedrooms !== null) params.set("bedrooms", String(bedrooms));
      if (bathrooms !== null) params.set("bathrooms", String(bathrooms));
      if (multiFamily && unitInputsConfirmed) params.set("unitConfirmed", "true");
      const response = await fetch(`/api/integrations/rentcast/rent-range?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json() as PropertyRentRange & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Property rental comps are unavailable.");
      setPropertyRent(payload);
      if (payload.comparableRange) {
        setMonthlyRent(payload.comparableRange.median);
        setRentBasis("property_median");
      }
    } catch (error) {
      setRentError(error instanceof Error ? error.message : "Property rental comps are unavailable.");
    } finally {
      setRentLoading(false);
    }
  }

  function chooseStrategy(id: (typeof STRATEGIES)[number]["id"]) {
    const next = STRATEGIES.find((item) => item.id === id)!;
    setStrategyId(id);
    setTargetCap(next.targetCap);
    setDownPct(next.down);
    setVacancyPct(next.vacancy);
    setMaintenancePct(next.maintenance);
  }

  const closing = askPrice * closingPct / 100;
  const totalBasis = askPrice + rehab + closing;
  const annualRent = monthlyRent * 12;
  const effectiveRent = annualRent * (1 - vacancyPct / 100);
  const operatingExpenses = taxes + insurance + hoaMonthly * 12 + annualRent * maintenancePct / 100;
  const noi = effectiveRent - operatingExpenses;
  const loan = askPrice * (1 - downPct / 100);
  const annualDebt = payment(loan, interestRate, termYears) * 12;
  const cashInvested = askPrice * downPct / 100 + rehab + closing;
  const capRate = totalBasis > 0 && monthlyRent > 0 ? noi / totalBasis * 100 : null;
  const dscr = annualDebt > 0 && monthlyRent > 0 ? noi / annualDebt : null;
  const cashOnCash = cashInvested > 0 && monthlyRent > 0 ? (noi - annualDebt) / cashInvested * 100 : null;
  const monthlyCashFlow = monthlyRent > 0 ? (noi - annualDebt) / 12 : null;
  const priceEdge = totalBasis > 0 ? (selected.model.value - totalBasis) / totalBasis * 100 : null;
  const maxTotalBasis = noi > 0 ? noi / (targetCap / 100) : null;
  const maxOffer = maxTotalBasis ? Math.max(0, (maxTotalBasis - rehab) / (1 + closingPct / 100)) : null;
  const askPpsf = livingArea > 0 ? askPrice / livingArea : null;
  const totalBasisPpsf = livingArea > 0 ? totalBasis / livingArea : null;
  const metrics = { closing, totalBasis, annualRent, operatingExpenses, noi, annualDebt, cashInvested, capRate, dscr, cashOnCash, monthlyCashFlow, priceEdge, maxOffer, askPpsf, totalBasisPpsf };

  const requiredComplete = monthlyRent > 0 && taxes > 0 && insurance > 0 && askPrice > 0;
  const gates = [
    { label: "Evidence", status: selected.model.confidence >= 75 && market.competency >= 65 ? "pass" : selected.model.confidence >= 60 ? "watch" : "fail", value: `${selected.model.confidence}% property · ${market.competency}% market`, guide: "Advance at 75%+ property evidence and 65%+ market competency." },
    { label: "Price", status: (metrics.priceEdge ?? -100) >= 5 ? "pass" : (metrics.priceEdge ?? -100) >= -5 ? "watch" : "fail", value: pct(metrics.priceEdge), guide: "Require at least 5% model-to-basis margin before diligence costs." },
    { label: "Yield", status: !requiredComplete ? "missing" : (metrics.capRate ?? 0) >= targetCap ? "pass" : (metrics.capRate ?? 0) >= targetCap - 1 ? "watch" : "fail", value: pct(metrics.capRate), guide: `Target ${targetCap.toFixed(1)}% unlevered cap rate under this strategy.` },
    { label: "Debt", status: !requiredComplete ? "missing" : (metrics.dscr ?? 0) >= 1.25 ? "pass" : (metrics.dscr ?? 0) >= 1.05 ? "watch" : "fail", value: metrics.dscr === null ? "—" : `${metrics.dscr.toFixed(2)}×`, guide: "1.25× DSCR leaves a basic operating cushion; below 1.05× is a stop." },
    { label: "Cash", status: !requiredComplete ? "missing" : (metrics.monthlyCashFlow ?? -1) > 0 && (metrics.cashOnCash ?? -1) >= 5 ? "pass" : (metrics.monthlyCashFlow ?? -1) >= 0 ? "watch" : "fail", value: pct(metrics.cashOnCash), guide: "Positive monthly cash flow and 5%+ cash-on-cash are the default hurdle." },
  ];
  const failCount = gates.filter((gate) => gate.status === "fail").length;
  const passCount = gates.filter((gate) => gate.status === "pass").length;
  const decision = !requiredComplete ? { label: "Incomplete", tone: "missing", text: "Enter rent, taxes and insurance before treating income or debt metrics as decision evidence." }
    : failCount ? { label: "Reprice or pass", tone: "fail", text: `${failCount} hard gate${failCount === 1 ? "" : "s"} fail. A high neighborhood score does not override weak property economics.` }
      : passCount >= 4 ? { label: "Advance to diligence", tone: "pass", text: "At least four gates pass with no hard failure. Verify condition, title, insurance, leases and concessions before action." }
        : { label: "Watch", tone: "watch", text: "The deal clears no hard stop, but the margin is not yet strong enough. Improve the price or validate missing evidence." };
  const isMultiFamily = /multi|apartment|\b[234]\s*family\b/i.test(selected.propertyType);
  const rentBasisLabel = rentBasis === "custom" ? "verified custom"
    : rentBasis === "property_median" ? "property median"
      : rentBasis === "property_p25" ? "property P25" : "property P75";

  return <section className="decision-section" id="decision-studio">
    <div className="section-title"><div><p className="eyebrow">DECISION STUDIO · EDITABLE UNDERWRITING</p><h2>Turn an area signal<br />into a deal decision.</h2></div><p>Choose a strategy and qualified public record, then replace the asking price and operating assumptions with verified deal facts. Monthly rent is no longer copied from a cluster: load property-specific rental comps using the selected address, living area, property type, bedrooms and bathrooms.</p></div>
    <div className="strategy-row">{STRATEGIES.map((item) => <button key={item.id} className={strategyId === item.id ? "active" : ""} onClick={() => chooseStrategy(item.id)}><span>{item.label}</span><small>{item.detail}</small><b>{item.targetCap}% target cap</b></button>)}</div>
    <div className="decision-picker"><label><span>Market evidence set</span><select value={marketId} onChange={(event) => chooseMarket(event.target.value)}>{liveMarkets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label><span>Property record</span><select value={selected.id} onChange={(event) => chooseProperty(event.target.value)}>{marketProperties.map((item) => <option key={item.id} value={item.id}>{item.address} · {money(item.model.value)}</option>)}</select></label><div><span>Public-record model</span><b>{money(selected.model.low)}–{money(selected.model.high)}</b><small>{selected.model.confidence}% evidence quality · v{selected.model.diagnostics.modelVersion}</small></div></div>
    <div className="decision-grid">
      <div className="underwrite-inputs">
        <div className="input-group acquisition-group"><p className="eyebrow">01 · ACQUISITION</p><div className="price-evidence-strip"><div><span>Recorded sale / sf</span><b>{money(selected.model.pricePerSqft.recordedSale)}</b><small>{selected.saleDate} · {selected.model.recency.saleAgeMonths.toFixed(1)} months old</small></div><div><span>Comparable / sf</span><b>{money(selected.model.pricePerSqft.comparableMedian)}</b><small>{money(selected.model.pricePerSqft.comparableP25)}–{money(selected.model.pricePerSqft.comparableP75)} · {selected.model.compCount} comps</small></div><div><span>Model center / sf</span><b>{money(selected.model.pricePerSqft.modelCenter)}</b><small>{selected.model.confidence}% evidence · {selected.model.recency.band} sale</small></div><div><span>Comparable recency</span><b>{selected.model.comparableQuality.medianAgeMonths.toFixed(1)} mo</b><small>{selected.model.comparableQuality.oldestSaleDate}–{selected.model.comparableQuality.newestSaleDate}</small></div></div><p className="price-evidence-boundary">Comparable price per square foot is HPI-adjusted and similarity-weighted. Recency affects anchor weight and evidence quality; it is not treated as automatic appreciation.</p><label><span>Asking price</span><input type="number" min="0" step="5000" value={askPrice || ""} onChange={(event) => setAskPrice(Number(event.target.value))} /></label><label><span>Living area</span><input type="number" min="0" step="50" value={livingArea || ""} onChange={(event) => { setLivingArea(Number(event.target.value)); invalidatePropertyRent(); }} /><i>sf</i></label><label><span>Bedrooms</span><input type="number" min="0" max="20" step="1" value={bedrooms ?? ""} onChange={(event) => { setBedrooms(event.target.value === "" ? null : Number(event.target.value)); invalidatePropertyRent(); }} /></label><label><span>Bathrooms</span><input type="number" min="0.5" max="20" step="0.5" value={bathrooms ?? ""} onChange={(event) => { setBathrooms(event.target.value === "" ? null : Number(event.target.value)); invalidatePropertyRent(); }} /></label><label><span>Rehab budget</span><input type="number" min="0" step="1000" value={rehab || ""} placeholder="0" onChange={(event) => setRehab(Number(event.target.value))} /></label><label><span>Closing costs</span><input type="number" min="0" max="15" step="0.5" value={closingPct} onChange={(event) => setClosingPct(Number(event.target.value))} /><i>%</i></label></div>
        <div className="input-group operations-group">
          <p className="eyebrow">02 · OPERATIONS</p>
          <div className="subject-rent-evidence">
            <div className="subject-rent-head">
              <div><span>PROPERTY-SPECIFIC RENT RANGE</span><b>{selected.address}</b><small>{selected.locality} · {selected.propertyType} · {livingArea ? `${livingArea.toLocaleString()} sf` : "living area required"} · {bedrooms ?? "—"} bd / {bathrooms ?? "—"} ba</small></div>
              <button type="button" onClick={() => void loadPropertyRentRange()} disabled={rentLoading || !livingArea || (isMultiFamily && !unitInputsConfirmed)}>{rentLoading ? "Loading comps…" : "Load rental comps · 1 call"}</button>
            </div>
            {isMultiFamily && <label className="unit-confirmation"><input type="checkbox" checked={unitInputsConfirmed} onChange={(event) => { setUnitInputsConfirmed(event.target.checked); invalidatePropertyRent(); }} /><span>Bedrooms, bathrooms and square footage describe one rentable unit—not the whole building.</span></label>}
            {rentError && <p className="subject-rent-error" role="alert">{rentError}</p>}
            {propertyRent?.comparableRange ? <>
              <div className="rent-band subject-rent-band"><i><span style={{ left: "25%", width: "50%" }} /></i><div>
                <button type="button" className={rentBasis === "property_p25" ? "active" : ""} onClick={() => applyPropertyRent("p25")}><span>Property P25</span><b>{money(propertyRent.comparableRange.p25)}</b><small>${propertyRent.comparableRange.rentPerSqft.p25.toFixed(2)}/sf</small></button>
                <button type="button" className={rentBasis === "property_median" ? "active" : ""} onClick={() => applyPropertyRent("median")}><span>Property median</span><b>{money(propertyRent.comparableRange.median)}</b><small>${propertyRent.comparableRange.rentPerSqft.median.toFixed(2)}/sf</small></button>
                <button type="button" className={rentBasis === "property_p75" ? "active" : ""} onClick={() => applyPropertyRent("p75")}><span>Property P75</span><b>{money(propertyRent.comparableRange.p75)}</b><small>${propertyRent.comparableRange.rentPerSqft.p75.toFixed(2)}/sf</small></button>
              </div></div>
              <div className={`subject-rent-quality ${propertyRent.evidence.grade}`}><b>{propertyRent.evidence.grade} evidence</b><span>{propertyRent.evidence.compCount} comps · {propertyRent.evidence.medianDaysOld ?? "—"} median days old · {propertyRent.evidence.medianDistance ?? "—"} mi median distance</span><small>RentCast AVM cross-check: {money(propertyRent.providerEstimate.low85)}–{money(propertyRent.providerEstimate.high85)} (85% provider range).</small></div>
            </> : propertyRent ? <p className="subject-rent-error">{propertyRent.boundary}</p> : <p className="subject-rent-boundary">No cluster value is inserted into the underwriting model. Load comps to calculate subject monthly rent from comparable rent/sf, or enter a separately verified lease figure below.</p>}
          </div>
          <div className="cluster-rent-evidence context-only">
            <div className="cluster-rent-head"><div><span>ACS CLUSTER CONTEXT · NOT USED IN CALCULATION</span><b>{rentCluster.name}</b><small>{rentCluster.rentObservationCount} observed tracts · {rentCluster.renterOccupiedUnits.toLocaleString()} renter households · {rentCluster.rentCoverage}% coverage</small></div><label><span>Context cluster</span><select value={rentCluster.id} onChange={(event) => chooseRentCluster(event.target.value)}>{rentMarket.neighborhoods.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.name}</option>)}</select></label></div>
            <div className="rent-band"><i><span style={{ left: "25%", width: "50%" }} /></i><div><div><span>Cluster P25</span><b>{money(rentCluster.rentP25)}</b></div><div><span>Cluster median</span><b>{money(rentCluster.medianRent)}</b></div><div><span>Cluster P75</span><b>{money(rentCluster.rentP75)}</b></div></div></div>
            <p><b>{ACS_AGGREGATION_META.vintage} ACS 5-year context only.</b> This is a renter-household-weighted distribution of tract median gross rents, not individual leases and not a substitute for the selected property’s size- and attribute-matched comps.</p>
          </div>
          <label className={!monthlyRent ? "required" : ""}><span>Monthly rent</span><input type="number" min="0" step="25" value={monthlyRent || ""} placeholder="Load comps or enter verified rent" onChange={(event) => { setMonthlyRent(Number(event.target.value)); setRentBasis("custom"); }} /><i className="rent-input-basis">{rentBasisLabel}</i></label>
          <label className={!taxes ? "required" : ""}><span>Annual property tax</span><input type="number" min="0" step="100" value={taxes || ""} placeholder="Required" onChange={(event) => setTaxes(Number(event.target.value))} /></label>
          <label className={!insurance ? "required" : ""}><span>Annual insurance</span><input type="number" min="0" step="100" value={insurance || ""} placeholder="Required" onChange={(event) => setInsurance(Number(event.target.value))} /></label>
          <label><span>Monthly HOA</span><input type="number" min="0" step="25" value={hoaMonthly || ""} placeholder="0" onChange={(event) => setHoaMonthly(Number(event.target.value))} /></label>
          <label><span>Vacancy</span><input type="number" min="0" max="40" step="0.5" value={vacancyPct} onChange={(event) => setVacancyPct(Number(event.target.value))} /><i>%</i></label>
          <label><span>Maintenance reserve</span><input type="number" min="0" max="40" step="0.5" value={maintenancePct} onChange={(event) => setMaintenancePct(Number(event.target.value))} /><i>% rent</i></label>
        </div>
        <div className="input-group"><p className="eyebrow">03 · FINANCING</p><label><span>Down payment</span><input type="number" min="0" max="100" step="1" value={downPct} onChange={(event) => setDownPct(Number(event.target.value))} /><i>%</i></label><label><span>Interest rate</span><input type="number" min="0" max="30" step="0.05" value={interestRate} onChange={(event) => setInterestRate(Number(event.target.value))} /><i>%</i></label><label><span>Amortization</span><input type="number" min="1" max="40" step="1" value={termYears} onChange={(event) => setTermYears(Number(event.target.value))} /><i>years</i></label><label><span>Target cap rate</span><input type="number" min="0.1" max="30" step="0.1" value={targetCap} onChange={(event) => setTargetCap(Number(event.target.value))} /><i>%</i></label></div>
      </div>
      <div className="underwrite-output">
        <div className={`decision-call ${decision.tone}`}><span>Current decision</span><h3>{decision.label}</h3><p>{decision.text}</p></div>
        <div className="metric-grid"><div><span>Total basis</span><b>{money(metrics.totalBasis)}</b><small>Price + rehab + closing</small></div><div><span>Asking price / sf</span><b>{money(metrics.askPpsf)}</b><small>Ask ÷ editable living area</small></div><div><span>All-in basis / sf</span><b>{money(metrics.totalBasisPpsf)}</b><small>Total basis ÷ living area</small></div><div><span>Price edge</span><b className={(metrics.priceEdge ?? -1) < 0 ? "negative" : ""}>{pct(metrics.priceEdge)}</b><small>Model center vs. total basis</small></div><div><span>NOI</span><b>{requiredComplete ? money(metrics.noi) : "—"}</b><small>Before debt service</small></div><div><span>Cap rate</span><b>{requiredComplete ? pct(metrics.capRate) : "—"}</b><small>NOI ÷ total basis</small></div><div><span>DSCR</span><b>{requiredComplete && metrics.dscr !== null ? `${metrics.dscr.toFixed(2)}×` : "—"}</b><small>NOI ÷ annual debt</small></div><div><span>Cash-on-cash</span><b>{requiredComplete ? pct(metrics.cashOnCash) : "—"}</b><small>After debt ÷ cash invested</small></div><div><span>Monthly cash flow</span><b>{requiredComplete ? money(metrics.monthlyCashFlow) : "—"}</b><small>After modeled debt service</small></div><div><span>Max offer at target</span><b>{requiredComplete ? money(metrics.maxOffer) : "—"}</b><small>Solves for {targetCap.toFixed(1)}% cap</small></div></div>
        <div className="gate-list">{gates.map((gate) => <div key={gate.label} className={gate.status}><span>{gate.label}</span><b>{gate.value}</b><i>{gate.status}</i><small>{gate.guide}</small></div>)}</div>
        <div className="decision-guidance"><b>Decision rule</b><p>Advance only when at least four gates pass and none fail. “Watch” means negotiate or verify—not buy. “Reprice or pass” is a stop until the failing fact changes. This screen is scenario analysis, not investment, tax, lending or appraisal advice.</p></div>
      </div>
    </div>
  </section>;
}
