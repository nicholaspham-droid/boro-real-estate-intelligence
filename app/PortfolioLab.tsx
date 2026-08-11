"use client";

import { useMemo, useState } from "react";
import propertyValuations from "../data/property-valuations.json";
import { MARKET_EXPLORERS } from "./marketNeighborhoods";

type PortfolioView = "overview" | "builder" | "risk";
type Assumption = {
  propertyId: string;
  purchasePrice: number;
  closingCostPct: number;
  monthlyRent: number;
  vacancyPct: number;
  expensePct: number;
  downPaymentPct: number;
  interestRate: number;
  termYears: number;
};

type Scenario = {
  valueShock: number;
  rentShock: number;
  vacancyShock: number;
  expenseShock: number;
  rateShock: number;
};

const DEFAULT_PROPERTY_IDS = ["chicago", "philadelphia", "raleigh"]
  .map((marketId) => propertyValuations.properties.find((property) => property.marketId === marketId)?.id)
  .filter((propertyId): propertyId is string => Boolean(propertyId));

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function currency(value: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(Number.isFinite(value) ? value : 0);
}

function percent(value: number, digits = 1) {
  return `${Number.isFinite(value) ? value.toFixed(digits) : "0.0"}%`;
}

function payment(principal: number, annualRate: number, termYears: number) {
  if (principal <= 0) return 0;
  const periods = Math.max(1, termYears * 12);
  const rate = annualRate / 1200;
  if (rate <= 0) return principal / periods;
  return principal * rate * ((1 + rate) ** periods) / (((1 + rate) ** periods) - 1);
}

function marketRentProxy(propertyId: string) {
  const property = propertyValuations.properties.find((item) => item.id === propertyId);
  const market = MARKET_EXPLORERS.find((item) => item.id === property?.marketId);
  const cluster = market?.neighborhoods.find((item) => item.id === property?.clusterId);
  return Math.round(cluster?.medianRent ?? 1800);
}

function initialAssumption(propertyId: string): Assumption {
  const property = propertyValuations.properties.find((item) => item.id === propertyId)!;
  return {
    propertyId,
    purchasePrice: property.salePrice,
    closingCostPct: 2,
    monthlyRent: marketRentProxy(propertyId),
    vacancyPct: 5,
    expensePct: 35,
    downPaymentPct: 25,
    interestRate: 7,
    termYears: 30,
  };
}

export function PortfolioLab() {
  const [activeView, setActiveView] = useState<PortfolioView>("overview");
  const [assumptions, setAssumptions] = useState<Assumption[]>(() => DEFAULT_PROPERTY_IDS.map(initialAssumption));
  const [propertyToAdd, setPropertyToAdd] = useState(propertyValuations.properties[0].id);
  const [scenario, setScenario] = useState<Scenario>({ valueShock: -10, rentShock: -5, vacancyShock: 4, expenseShock: 5, rateShock: 1.5 });

  const items = useMemo(() => assumptions.map((assumption) => {
    const property = propertyValuations.properties.find((candidate) => candidate.id === assumption.propertyId)!;
    const market = propertyValuations.markets.find((candidate) => candidate.id === property.marketId)!;
    const closingCosts = assumption.purchasePrice * assumption.closingCostPct / 100;
    const acquisitionCost = assumption.purchasePrice + closingCosts;
    const debt = assumption.purchasePrice * (1 - assumption.downPaymentPct / 100);
    const investedEquity = assumption.purchasePrice - debt + closingCosts;
    const annualRent = assumption.monthlyRent * 12 * (1 - assumption.vacancyPct / 100);
    const noi = annualRent * (1 - assumption.expensePct / 100);
    const annualDebtService = payment(debt, assumption.interestRate, assumption.termYears) * 12;
    const cashFlow = noi - annualDebtService;
    const dscr = annualDebtService > 0 ? noi / annualDebtService : 99;
    const cashOnCash = investedEquity > 0 ? cashFlow / investedEquity * 100 : 0;
    const capRate = acquisitionCost > 0 ? noi / acquisitionCost * 100 : 0;
    const priceDelta = acquisitionCost > 0 ? (property.model.value - acquisitionCost) / acquisitionCost * 100 : 0;
    const returnScore = clamp(45 + cashOnCash * 4 + (dscr - 1.1) * 22);
    const priceScore = clamp(50 + priceDelta * 2);
    const rawOpportunity = returnScore * .45 + priceScore * .25 + property.model.clusterEdgeScore * .20 + property.model.watchScore * .10;
    const reliability = .60 + property.model.confidence / 100 * .40;
    const itemEdge = Math.round(50 + (rawOpportunity - 50) * reliability);
    return { assumption, property, market, closingCosts, acquisitionCost, debt, investedEquity, annualRent, noi, annualDebtService, cashFlow, dscr, cashOnCash, capRate, priceDelta, returnScore, priceScore, rawOpportunity, reliability, itemEdge };
  }), [assumptions]);

  const totals = useMemo(() => {
    const acquisitionCost = items.reduce((sum, item) => sum + item.acquisitionCost, 0);
    const modeledValue = items.reduce((sum, item) => sum + item.property.model.value, 0);
    const valueLow = items.reduce((sum, item) => sum + item.property.model.low, 0);
    const valueHigh = items.reduce((sum, item) => sum + item.property.model.high, 0);
    const debt = items.reduce((sum, item) => sum + item.debt, 0);
    const equity = modeledValue - debt;
    const noi = items.reduce((sum, item) => sum + item.noi, 0);
    const debtService = items.reduce((sum, item) => sum + item.annualDebtService, 0);
    const cashFlow = noi - debtService;
    const investedEquity = items.reduce((sum, item) => sum + item.investedEquity, 0);
    const competency = acquisitionCost > 0 ? items.reduce((sum, item) => sum + item.property.model.confidence * item.acquisitionCost, 0) / acquisitionCost : 0;
    const clusterEdge = acquisitionCost > 0 ? items.reduce((sum, item) => sum + item.property.model.clusterEdgeScore * item.acquisitionCost, 0) / acquisitionCost : 0;
    const marketExposure = Array.from(new Set(items.map((item) => item.property.marketId))).map((marketId) => {
      const marketItems = items.filter((item) => item.property.marketId === marketId);
      const value = marketItems.reduce((sum, item) => sum + item.acquisitionCost, 0);
      return { marketId, label: marketItems[0].market.label.split(" · ")[0], value, share: acquisitionCost > 0 ? value / acquisitionCost * 100 : 0 };
    }).sort((a, b) => b.value - a.value);
    const largestShare = marketExposure[0]?.share ?? 0;
    const diversificationScore = clamp(100 - largestShare);
    const returnScore = clamp(45 + (investedEquity > 0 ? cashFlow / investedEquity * 100 : 0) * 4 + (debtService > 0 ? noi / debtService - 1.1 : 1) * 22);
    const priceEdgePct = acquisitionCost > 0 ? (modeledValue - acquisitionCost) / acquisitionCost * 100 : 0;
    const acquisitionScore = clamp(50 + priceEdgePct * 2);
    const rawPortfolioEdge = returnScore * .40 + acquisitionScore * .25 + clusterEdge * .20 + diversificationScore * .15;
    const reliability = .60 + competency / 100 * .40;
    const portfolioEdge = Math.round(50 + (rawPortfolioEdge - 50) * reliability);
    return { acquisitionCost, modeledValue, valueLow, valueHigh, debt, equity, noi, debtService, cashFlow, investedEquity, competency, clusterEdge, marketExposure, largestShare, diversificationScore, returnScore, priceEdgePct, acquisitionScore, rawPortfolioEdge, reliability, portfolioEdge, dscr: debtService > 0 ? noi / debtService : 99, cashOnCash: investedEquity > 0 ? cashFlow / investedEquity * 100 : 0, ltv: modeledValue > 0 ? debt / modeledValue * 100 : 0 };
  }, [items]);

  const stressed = useMemo(() => {
    const rows = items.map((item) => {
      const value = item.property.model.value * (1 + scenario.valueShock / 100);
      const annualRent = item.assumption.monthlyRent * 12 * (1 + scenario.rentShock / 100) * (1 - clamp(item.assumption.vacancyPct + scenario.vacancyShock, 0, 95) / 100);
      const noi = annualRent * (1 - clamp(item.assumption.expensePct + scenario.expenseShock, 0, 95) / 100);
      const debtService = payment(item.debt, item.assumption.interestRate + scenario.rateShock, item.assumption.termYears) * 12;
      return { id: item.property.id, value, noi, debtService, cashFlow: noi - debtService, dscr: debtService > 0 ? noi / debtService : 99 };
    });
    const value = rows.reduce((sum, item) => sum + item.value, 0);
    const noi = rows.reduce((sum, item) => sum + item.noi, 0);
    const debtService = rows.reduce((sum, item) => sum + item.debtService, 0);
    const cashFlow = noi - debtService;
    return { rows, value, noi, debtService, cashFlow, equity: value - totals.debt, dscr: debtService > 0 ? noi / debtService : 99, ltv: value > 0 ? totals.debt / value * 100 : 0 };
  }, [items, scenario, totals.debt]);

  const actions = useMemo(() => items.map((item) => {
    const share = totals.marketExposure.find((market) => market.marketId === item.property.marketId)?.share ?? 0;
    if (item.assumption.purchasePrice > item.property.model.high) return { ...item, status: "fail", action: "Reprice or reject", reason: `Modeled basis is above the ${currency(item.property.model.high)} evidence range.` };
    if (item.dscr < 1) return { ...item, status: "fail", action: "Repair cash flow", reason: `Base DSCR is ${item.dscr.toFixed(2)}× and does not cover modeled debt service.` };
    if (item.property.model.confidence < 70) return { ...item, status: "watch", action: "Verify evidence", reason: `Evidence quality is ${item.property.model.confidence}%; obtain stronger comps and property facts.` };
    if (share > 50) return { ...item, status: "watch", action: "Limit concentration", reason: `${item.market.label.split(" · ")[0]} represents ${share.toFixed(0)}% of modeled acquisition cost.` };
    if (item.itemEdge >= 70 && item.dscr >= 1.2) return { ...item, status: "pass", action: "Advance diligence", reason: `${item.itemEdge}/100 item edge and ${item.dscr.toFixed(2)}× modeled DSCR clear the screening gates.` };
    return { ...item, status: "watch", action: "Keep on watchlist", reason: `The ${item.itemEdge}/100 item edge is mixed under current assumptions.` };
  }).sort((a, b) => (a.status === "fail" ? -1 : a.status === "watch" && b.status === "pass" ? -1 : 1)), [items, totals.marketExposure]);

  const availableProperties = propertyValuations.properties.filter((property) => !assumptions.some((assumption) => assumption.propertyId === property.id));

  function updateAssumption(propertyId: string, key: keyof Omit<Assumption, "propertyId">, value: number) {
    setAssumptions((current) => current.map((assumption) => assumption.propertyId === propertyId ? { ...assumption, [key]: value } : assumption));
  }

  function addProperty() {
    if (!availableProperties.some((property) => property.id === propertyToAdd)) return;
    setAssumptions((current) => [...current, initialAssumption(propertyToAdd)]);
    const next = availableProperties.find((property) => property.id !== propertyToAdd);
    if (next) setPropertyToAdd(next.id);
  }

  const gates = [
    { label: "Cash flow", pass: stressed.cashFlow > 0, value: currency(stressed.cashFlow), rule: "Stressed annual cash flow must remain positive" },
    { label: "Debt coverage", pass: stressed.dscr >= 1.2, value: `${stressed.dscr.toFixed(2)}×`, rule: "Stressed DSCR ≥ 1.20×" },
    { label: "Leverage", pass: stressed.ltv <= 75, value: percent(stressed.ltv), rule: "Stressed LTV ≤ 75%" },
    { label: "Evidence", pass: totals.competency >= 70, value: percent(totals.competency, 0), rule: "Weighted competency ≥ 70%" },
    { label: "Concentration", pass: totals.largestShare <= 50, value: percent(totals.largestShare, 0), rule: "No market exceeds 50%" },
  ];

  return <section className="portfolio-lab" id="portfolio">
    <div className="portfolio-heading"><div><p className="eyebrow">PORTFOLIO LAB · V2 MODEL MODE</p><h2>Build the book.<br /><em>Expose the tradeoffs.</em></h2></div><p>Combine qualified property records into a hypothetical portfolio, replace public-data defaults with deal assumptions, and see how return, concentration and evidence quality interact. Nothing entered here is saved.</p></div>
    <div className="portfolio-mode-note"><b>MODEL PORTFOLIO ONLY</b><span>Uses public records and editable assumptions—not live holdings, bank data or private ownership information.</span><i>{items.length} positions · {new Set(items.map((item) => item.property.marketId)).size} markets</i></div>
    <nav className="portfolio-tabs" aria-label="Portfolio Lab views">{([{"id":"overview","label":"Portfolio Overview","detail":"Health, allocation and edge"},{"id":"builder","label":"Portfolio Builder","detail":"Positions and assumptions"},{"id":"risk","label":"Risk & Scenarios","detail":"Stress tests and actions"}] as const).map((view) => <button key={view.id} className={activeView === view.id ? "active" : ""} aria-pressed={activeView === view.id} onClick={() => setActiveView(view.id)}><b>{view.label}</b><small>{view.detail}</small></button>)}</nav>

    {activeView === "overview" && <div className="portfolio-panel">
      <div className="portfolio-kpis"><article className="edge"><span>Reliability-adjusted edge</span><strong>{totals.portfolioEdge}</strong><small>Opportunity is shrunk toward 50 when evidence is weaker</small></article><article><span>Modeled value</span><b>{currency(totals.modeledValue, true)}</b><small>{currency(totals.valueLow, true)}–{currency(totals.valueHigh, true)} aggregate range</small></article><article><span>Annual cash flow</span><b className={totals.cashFlow < 0 ? "negative" : ""}>{currency(totals.cashFlow)}</b><small>{percent(totals.cashOnCash)} cash-on-cash after closing costs</small></article><article><span>Debt coverage</span><b>{totals.dscr.toFixed(2)}×</b><small>{percent(totals.ltv)} modeled LTV</small></article><article><span>Data competency</span><b>{percent(totals.competency, 0)}</b><small>Confidence modifier, not an alpha factor</small></article></div>
      <div className="portfolio-overview-grid">
        <article className="allocation-card"><div className="portfolio-card-head"><div><p className="eyebrow">ALLOCATION</p><h3>Market concentration</h3></div><b>{percent(totals.largestShare, 0)}<small>largest exposure</small></b></div><div className="allocation-bars">{totals.marketExposure.map((market) => <div key={market.marketId}><span><b>{market.label}</b><small>{currency(market.value, true)}</small></span><i><b style={{ width: `${market.share}%` }} /></i><strong>{percent(market.share, 0)}</strong></div>)}</div><p>Based on modeled acquisition cost. A market above 50% fails the default concentration gate.</p></article>
        <article className="edge-card"><div className="portfolio-card-head"><div><p className="eyebrow">PORTFOLIO EDGE MODEL</p><h3>Four drivers + a reliability modifier</h3></div></div><div className="edge-contributions"><div><span>Risk-adjusted return</span><b>40%</b><strong>{Math.round(totals.returnScore)}</strong></div><div><span>Price-to-model basis</span><b>25%</b><strong>{Math.round(totals.acquisitionScore)}</strong></div><div><span>Area fundamentals</span><b>20%</b><strong>{Math.round(totals.clusterEdge)}</strong></div><div><span>Diversification</span><b>15%</b><strong>{Math.round(totals.diversificationScore)}</strong></div><div><span>Evidence reliability</span><b>modifier</b><strong>{Math.round(totals.competency)}</strong></div></div><p>Evidence no longer earns investment points. It shrinks the raw opportunity score toward neutral when confidence is weak. The result is an ordinal screen—not expected return or probability of profit.</p></article>
      </div>
      <div className="portfolio-position-list"><div className="portfolio-card-head"><div><p className="eyebrow">POSITION CONTRIBUTION</p><h3>What each property adds</h3></div><button onClick={() => setActiveView("builder")}>Edit assumptions →</button></div><table><thead><tr><th>Property</th><th>Basis / model</th><th>NOI</th><th>Cash flow</th><th>DSCR</th><th>Item edge</th><th>Action</th></tr></thead><tbody>{actions.map((item) => <tr key={item.property.id}><td><b>{item.property.address}</b><small>{item.property.locality}</small></td><td>{currency(item.assumption.purchasePrice)}<small>{currency(item.property.model.value)} model center</small></td><td>{currency(item.noi)}</td><td className={item.cashFlow < 0 ? "negative" : ""}>{currency(item.cashFlow)}</td><td>{item.dscr.toFixed(2)}×</td><td><strong>{item.itemEdge}</strong></td><td><span className={item.status}>{item.action}</span><small>{item.reason}</small></td></tr>)}</tbody></table></div>
    </div>}

    {activeView === "builder" && <div className="portfolio-panel">
      <div className="portfolio-builder-toolbar"><div><p className="eyebrow">ADD FROM QUALIFIED PUBLIC RECORDS</p><h3>{propertyValuations.properties.length - assumptions.length} available properties</h3></div><label><span>Property</span><select value={propertyToAdd} onChange={(event) => setPropertyToAdd(event.target.value)} disabled={!availableProperties.length}>{availableProperties.map((property) => <option key={property.id} value={property.id}>{property.address} · {property.locality}</option>)}</select></label><button onClick={addProperty} disabled={!availableProperties.length}>Add position</button></div>
      <div className="builder-table"><table><thead><tr><th>Position + evidence</th><th>Acquisition basis</th><th>Monthly rent</th><th>Vacancy</th><th>Operating expense</th><th>Down payment</th><th>Interest rate</th><th>Remove</th></tr></thead><tbody>{items.map((item) => <tr key={item.property.id}><td><b>{item.property.address}</b><small>{item.market.label} · value {currency(item.property.model.value)} · {item.property.model.confidence}% evidence</small><a href={`/report?type=property&id=${encodeURIComponent(item.property.id)}`} target="_blank" rel="noreferrer">Open property report →</a></td><td><label><span>Price</span><input aria-label={`${item.property.address} acquisition basis`} type="number" min="0" step="1000" value={item.assumption.purchasePrice} onChange={(event) => updateAssumption(item.property.id, "purchasePrice", Number(event.target.value))} /></label><small>Default: recorded sale</small></td><td><label><span>Rent</span><input aria-label={`${item.property.address} monthly rent`} type="number" min="0" step="50" value={item.assumption.monthlyRent} onChange={(event) => updateAssumption(item.property.id, "monthlyRent", Number(event.target.value))} /></label><small>Default: ACS cluster median</small></td><td><label><span>Vacancy</span><input aria-label={`${item.property.address} vacancy`} type="number" min="0" max="95" step=".5" value={item.assumption.vacancyPct} onChange={(event) => updateAssumption(item.property.id, "vacancyPct", Number(event.target.value))} /></label><small>% of gross rent</small></td><td><label><span>Expenses</span><input aria-label={`${item.property.address} operating expenses`} type="number" min="0" max="95" step="1" value={item.assumption.expensePct} onChange={(event) => updateAssumption(item.property.id, "expensePct", Number(event.target.value))} /></label><small>% after vacancy</small></td><td><label><span>Equity</span><input aria-label={`${item.property.address} down payment`} type="number" min="0" max="100" step="1" value={item.assumption.downPaymentPct} onChange={(event) => updateAssumption(item.property.id, "downPaymentPct", Number(event.target.value))} /></label><small>% of basis</small></td><td><label><span>Rate</span><input aria-label={`${item.property.address} interest rate`} type="number" min="0" max="30" step=".1" value={item.assumption.interestRate} onChange={(event) => updateAssumption(item.property.id, "interestRate", Number(event.target.value))} /></label><small>30-year amortization</small></td><td><button aria-label={`Remove ${item.property.address}`} onClick={() => setAssumptions((current) => current.filter((assumption) => assumption.propertyId !== item.property.id))} disabled={assumptions.length <= 1}>×</button></td></tr>)}</tbody></table></div>
      <div className="portfolio-data-legend"><b>ACQUISITION-COST ASSUMPTIONS</b>{items.map((item) => <label key={item.property.id}><span>{item.property.address} closing costs</span><input aria-label={`${item.property.address} closing costs`} type="number" min="0" max="20" step=".5" value={item.assumption.closingCostPct} onChange={(event) => updateAssumption(item.property.id, "closingCostPct", Number(event.target.value))} />%</label>)}<p>Closing costs are included in all-in basis, invested cash, cash-on-cash return and price-to-model margin. The 2% default is an editable placeholder—not a market fact.</p></div>
      <div className="portfolio-data-legend"><b>INPUT PROVENANCE</b><span><i className="public" /> Public record: identity, recorded sale, assessment and building facts</span><span><i className="model" /> BORO model: value range, comps, cluster edge and confidence</span><span><i className="assumption" /> Editable assumption: rent, vacancy, expenses, reserves and financing</span><p>Operating expense is a combined screening ratio after vacancy. Replace it with taxes, insurance, management, utilities, repairs and replacement reserves before diligence. Refinance-rate stress is an indicative refinance case; it does not reprice existing fixed-rate debt.</p></div>
    </div>}

    {activeView === "risk" && <div className="portfolio-panel risk-panel">
      <aside className="scenario-controls"><div><p className="eyebrow">SHARED DOWNSIDE CASE</p><h3>Pressure-test every position.</h3><p>These shocks apply consistently across the model portfolio. Property-specific conditions still require separate underwriting.</p></div>{([{"key":"valueShock","label":"Property values","minimum":-30,"maximum":20,"step":1,"suffix":"%"},{"key":"rentShock","label":"Effective rents","minimum":-20,"maximum":20,"step":1,"suffix":"%"},{"key":"vacancyShock","label":"Vacancy increase","minimum":0,"maximum":20,"step":1,"suffix":" pts"},{"key":"expenseShock","label":"Expense ratio increase","minimum":0,"maximum":25,"step":1,"suffix":" pts"},{"key":"rateShock","label":"Refinance rate increase","minimum":0,"maximum":5,"step":.25,"suffix":" pts"}] as const).map((control) => <label key={control.key}><span><b>{control.label}</b><i>{scenario[control.key] >= 0 ? "+" : ""}{scenario[control.key]}{control.suffix}</i></span><input aria-label={control.label} type="range" min={control.minimum} max={control.maximum} step={control.step} value={scenario[control.key]} onChange={(event) => setScenario((current) => ({ ...current, [control.key]: Number(event.target.value) }))} /></label>)}</aside>
      <div className="scenario-output"><div className="scenario-call"><span>DOWNSIDE READOUT</span><h3>{gates.filter((gate) => gate.pass).length >= 4 ? "Portfolio survives with conditions" : "Portfolio fails the default downside case"}</h3><p>{gates.filter((gate) => gate.pass).length} of {gates.length} portfolio gates pass. Treat every failed gate as a required mitigation, not a blended-away weakness.</p></div><div className="scenario-metrics"><article><span>Stressed value</span><b>{currency(stressed.value, true)}</b><small>{currency(stressed.equity, true)} equity</small></article><article><span>Stressed cash flow</span><b className={stressed.cashFlow < 0 ? "negative" : ""}>{currency(stressed.cashFlow)}</b><small>Annual after debt service</small></article><article><span>Stressed DSCR</span><b>{stressed.dscr.toFixed(2)}×</b><small>{percent(stressed.ltv)} stressed LTV</small></article></div><div className="portfolio-gates">{gates.map((gate) => <div key={gate.label} className={gate.pass ? "pass" : "fail"}><span>{gate.label}</span><b>{gate.value}</b><i>{gate.pass ? "Pass" : "Fail"}</i><small>{gate.rule}</small></div>)}</div></div>
      <div className="action-queue"><div className="portfolio-card-head"><div><p className="eyebrow">RANKED ACTION QUEUE</p><h3>Resolve failure modes first.</h3></div><span>{actions.filter((item) => item.status === "fail").length} fail · {actions.filter((item) => item.status === "watch").length} watch · {actions.filter((item) => item.status === "pass").length} advance</span></div>{actions.map((item, index) => <article key={item.property.id} className={item.status}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.action}</b><h4>{item.property.address}</h4><p>{item.reason}</p></div><strong>{item.itemEdge}<small>item edge</small></strong><a href={`/report?type=property&id=${encodeURIComponent(item.property.id)}`} target="_blank" rel="noreferrer">Evidence report →</a></article>)}</div>
    </div>}
  </section>;
}
