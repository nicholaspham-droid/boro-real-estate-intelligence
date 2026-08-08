"use client";

import { useMemo, useState } from "react";
import propertyValuations from "../data/property-valuations.json";
import { VALUATION_MARKET_IDS } from "./featureAvailability";

const STRATEGIES = [
  { id: "balanced", label: "Balanced", detail: "Require price, income and evidence to agree", targetCap: 6.5, down: 25, vacancy: 6, maintenance: 8 },
  { id: "growth", label: "Growth", detail: "Accept a lower yield only with strong local evidence", targetCap: 5, down: 25, vacancy: 5, maintenance: 7 },
  { id: "income", label: "Income", detail: "Prioritize coverage, resilient NOI and cash yield", targetCap: 7.5, down: 30, vacancy: 7, maintenance: 10 },
  { id: "value", label: "Value-add", detail: "Demand a larger margin for rehab and execution risk", targetCap: 6.5, down: 30, vacancy: 8, maintenance: 12 },
] as const;

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

export function DecisionStudio() {
  const liveMarkets = propertyValuations.markets.filter((item) => VALUATION_MARKET_IDS.includes(item.id));
  const [marketId, setMarketId] = useState(liveMarkets[0].id);
  const marketProperties = propertyValuations.properties.filter((item) => item.marketId === marketId);
  const [propertyId, setPropertyId] = useState(marketProperties[0].id);
  const selected = propertyValuations.properties.find((item) => item.id === propertyId) ?? marketProperties[0];
  const market = propertyValuations.markets.find((item) => item.id === selected.marketId) ?? liveMarkets[0];
  const [strategyId, setStrategyId] = useState<(typeof STRATEGIES)[number]["id"]>("balanced");
  const strategy = STRATEGIES.find((item) => item.id === strategyId) ?? STRATEGIES[0];
  const [askPrice, setAskPrice] = useState(selected.model.value);
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [rehab, setRehab] = useState(0);
  const [closingPct, setClosingPct] = useState(2);
  const [taxes, setTaxes] = useState(0);
  const [insurance, setInsurance] = useState(0);
  const [hoaMonthly, setHoaMonthly] = useState(0);
  const [downPct, setDownPct] = useState(strategy.down);
  const [interestRate, setInterestRate] = useState(6.75);
  const [termYears, setTermYears] = useState(30);
  const [vacancyPct, setVacancyPct] = useState(strategy.vacancy);
  const [maintenancePct, setMaintenancePct] = useState(strategy.maintenance);
  const [targetCap, setTargetCap] = useState(strategy.targetCap);

  function chooseMarket(id: string) {
    const property = propertyValuations.properties.find((item) => item.marketId === id)!;
    setMarketId(id);
    chooseProperty(property.id);
  }

  function chooseProperty(id: string) {
    const property = propertyValuations.properties.find((item) => item.id === id)!;
    setPropertyId(id);
    setAskPrice(property.model.value);
    setMonthlyRent(0);
    setRehab(0);
    setTaxes(0);
    setInsurance(0);
    setHoaMonthly(0);
  }

  function chooseStrategy(id: (typeof STRATEGIES)[number]["id"]) {
    const next = STRATEGIES.find((item) => item.id === id)!;
    setStrategyId(id);
    setTargetCap(next.targetCap);
    setDownPct(next.down);
    setVacancyPct(next.vacancy);
    setMaintenancePct(next.maintenance);
  }

  const metrics = useMemo(() => {
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
    return { closing, totalBasis, annualRent, operatingExpenses, noi, annualDebt, cashInvested, capRate, dscr, cashOnCash, monthlyCashFlow, priceEdge, maxOffer };
  }, [askPrice, closingPct, rehab, monthlyRent, vacancyPct, taxes, insurance, hoaMonthly, maintenancePct, downPct, interestRate, termYears, selected.model.value, targetCap]);

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

  return <section className="decision-section" id="decision-studio">
    <div className="section-title"><div><p className="eyebrow">DECISION STUDIO · EDITABLE UNDERWRITING</p><h2>Turn an area signal<br />into a deal decision.</h2></div><p>Choose a strategy, select a qualified public record, then enter the actual asking price and operating assumptions. Every output below is derived from those inputs; no rent, tax, insurance or listing value is invented.</p></div>
    <div className="strategy-row">{STRATEGIES.map((item) => <button key={item.id} className={strategyId === item.id ? "active" : ""} onClick={() => chooseStrategy(item.id)}><span>{item.label}</span><small>{item.detail}</small><b>{item.targetCap}% target cap</b></button>)}</div>
    <div className="decision-picker"><label><span>Market evidence set</span><select value={marketId} onChange={(event) => chooseMarket(event.target.value)}>{liveMarkets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label><span>Property record</span><select value={selected.id} onChange={(event) => chooseProperty(event.target.value)}>{marketProperties.map((item) => <option key={item.id} value={item.id}>{item.address} · {money(item.model.value)}</option>)}</select></label><div><span>Public-record model</span><b>{money(selected.model.low)}–{money(selected.model.high)}</b><small>{selected.model.confidence}% evidence quality · v{selected.model.diagnostics.modelVersion}</small></div></div>
    <div className="decision-grid">
      <div className="underwrite-inputs">
        <div className="input-group"><p className="eyebrow">01 · ACQUISITION</p><label><span>Asking price</span><input type="number" min="0" step="5000" value={askPrice || ""} onChange={(event) => setAskPrice(Number(event.target.value))} /></label><label><span>Rehab budget</span><input type="number" min="0" step="1000" value={rehab || ""} placeholder="0" onChange={(event) => setRehab(Number(event.target.value))} /></label><label><span>Closing costs</span><input type="number" min="0" max="15" step="0.5" value={closingPct} onChange={(event) => setClosingPct(Number(event.target.value))} /><i>%</i></label></div>
        <div className="input-group"><p className="eyebrow">02 · OPERATIONS</p><label className={!monthlyRent ? "required" : ""}><span>Monthly rent</span><input type="number" min="0" step="100" value={monthlyRent || ""} placeholder="Required" onChange={(event) => setMonthlyRent(Number(event.target.value))} /></label><label className={!taxes ? "required" : ""}><span>Annual property tax</span><input type="number" min="0" step="100" value={taxes || ""} placeholder="Required" onChange={(event) => setTaxes(Number(event.target.value))} /></label><label className={!insurance ? "required" : ""}><span>Annual insurance</span><input type="number" min="0" step="100" value={insurance || ""} placeholder="Required" onChange={(event) => setInsurance(Number(event.target.value))} /></label><label><span>Monthly HOA</span><input type="number" min="0" step="25" value={hoaMonthly || ""} placeholder="0" onChange={(event) => setHoaMonthly(Number(event.target.value))} /></label><label><span>Vacancy</span><input type="number" min="0" max="40" step="0.5" value={vacancyPct} onChange={(event) => setVacancyPct(Number(event.target.value))} /><i>%</i></label><label><span>Maintenance reserve</span><input type="number" min="0" max="40" step="0.5" value={maintenancePct} onChange={(event) => setMaintenancePct(Number(event.target.value))} /><i>% rent</i></label></div>
        <div className="input-group"><p className="eyebrow">03 · FINANCING</p><label><span>Down payment</span><input type="number" min="0" max="100" step="1" value={downPct} onChange={(event) => setDownPct(Number(event.target.value))} /><i>%</i></label><label><span>Interest rate</span><input type="number" min="0" max="30" step="0.05" value={interestRate} onChange={(event) => setInterestRate(Number(event.target.value))} /><i>%</i></label><label><span>Amortization</span><input type="number" min="1" max="40" step="1" value={termYears} onChange={(event) => setTermYears(Number(event.target.value))} /><i>years</i></label><label><span>Target cap rate</span><input type="number" min="0.1" max="30" step="0.1" value={targetCap} onChange={(event) => setTargetCap(Number(event.target.value))} /><i>%</i></label></div>
      </div>
      <div className="underwrite-output">
        <div className={`decision-call ${decision.tone}`}><span>Current decision</span><h3>{decision.label}</h3><p>{decision.text}</p></div>
        <div className="metric-grid"><div><span>Total basis</span><b>{money(metrics.totalBasis)}</b><small>Price + rehab + closing</small></div><div><span>Price edge</span><b className={(metrics.priceEdge ?? -1) < 0 ? "negative" : ""}>{pct(metrics.priceEdge)}</b><small>Model center vs. total basis</small></div><div><span>NOI</span><b>{requiredComplete ? money(metrics.noi) : "—"}</b><small>Before debt service</small></div><div><span>Cap rate</span><b>{requiredComplete ? pct(metrics.capRate) : "—"}</b><small>NOI ÷ total basis</small></div><div><span>DSCR</span><b>{requiredComplete && metrics.dscr !== null ? `${metrics.dscr.toFixed(2)}×` : "—"}</b><small>NOI ÷ annual debt</small></div><div><span>Cash-on-cash</span><b>{requiredComplete ? pct(metrics.cashOnCash) : "—"}</b><small>After debt ÷ cash invested</small></div><div><span>Monthly cash flow</span><b>{requiredComplete ? money(metrics.monthlyCashFlow) : "—"}</b><small>After modeled debt service</small></div><div><span>Max offer at target</span><b>{requiredComplete ? money(metrics.maxOffer) : "—"}</b><small>Solves for {targetCap.toFixed(1)}% cap</small></div></div>
        <div className="gate-list">{gates.map((gate) => <div key={gate.label} className={gate.status}><span>{gate.label}</span><b>{gate.value}</b><i>{gate.status}</i><small>{gate.guide}</small></div>)}</div>
        <div className="decision-guidance"><b>Decision rule</b><p>Advance only when at least four gates pass and none fail. “Watch” means negotiate or verify—not buy. “Reprice or pass” is a stop until the failing fact changes. This screen is scenario analysis, not investment, tax, lending or appraisal advice.</p></div>
      </div>
    </div>
  </section>;
}
