"use client";

import { useMemo, useState } from "react";
import propertyValuations from "../data/property-valuations.json";
import { MARKET_EXPLORERS } from "./marketNeighborhoods";
import { listingVerificationDecision, nearestRegionalCluster } from "./portfolioMonitorLogic.mjs";

type PortfolioView = "overview" | "builder" | "risk";
type ListingMarketId = "raleigh" | "chicago" | "philadelphia";
type MonitoredProperty = {
  id: string;
  marketId: ListingMarketId;
  clusterId: string;
  address: string;
  locality: string;
  propertyType: string;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  salePrice: number;
  sourceMode: "public-record" | "connected-listing";
  sourceLabel: string;
  reportId: string | null;
  listing: null | { status: string; lastSeenDate: string | null; mlsName: string | null; mlsNumber: string | null; daysOnMarket: number | null };
  model: { value: number; low: number; high: number; confidence: number; watchScore: number; clusterEdgeScore: number };
};

type PilotListing = {
  id: string; address: string; addressLine1: string; city: string; state: string; zipCode: string | null;
  lat: number; lng: number; propertyType: string; bedrooms: number | null; bathrooms: number | null; squareFootage: number;
  status: string; price: number; pricePerSqft: number; lastSeenDate: string | null; daysOnMarket: number | null;
  mlsName: string | null; mlsNumber: string | null; screeningScore: number; evidenceReliability: number;
};
type PilotResult = {
  market: { id: ListingMarketId; label: string };
  retrievedAt: string;
  requestCost: number;
  candidateCount: number;
  scoredCandidateCount: number;
  pricePerSqftBand: { p25: number; median: number; p75: number };
  regionDiagnostics: { status: "pass" | "watch" | "compromised"; listingCompleteness: number; listingFreshnessCoverage: number };
  listings: PilotListing[];
};
type ListingVerification = {
  checkedAt: string;
  activeSale: null | { status: string; price: number | null; lastSeenDate: string | null; daysOnMarket: number | null; mlsName: string | null; mlsNumber: string | null };
  rent: null | { median: number; low: number | null; high: number | null; compCount: number };
  attom: null | { value: number; low: number | null; high: number | null; confidence: number | null; livingSize: number | null; beds: number | null; baths: number | null; taxAmount: number | null; cacheHit: boolean };
  errors: string[];
};
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

const PUBLIC_PROPERTIES: MonitoredProperty[] = propertyValuations.properties.map((property) => ({
  id: property.id,
  marketId: property.marketId as ListingMarketId,
  clusterId: property.clusterId,
  address: property.address,
  locality: property.locality,
  propertyType: property.propertyType,
  sqft: property.sqft,
  beds: property.beds,
  baths: property.baths,
  salePrice: property.salePrice,
  sourceMode: "public-record",
  sourceLabel: property.sourceLabel,
  reportId: property.id,
  listing: null,
  model: {
    value: property.model.value,
    low: property.model.low,
    high: property.model.high,
    confidence: property.model.confidence,
    watchScore: property.model.watchScore,
    clusterEdgeScore: property.model.clusterEdgeScore,
  },
}));

const LISTING_MARKETS: Array<{ id: ListingMarketId; label: string }> = [
  { id: "raleigh", label: "Raleigh" },
  { id: "chicago", label: "Chicago" },
  { id: "philadelphia", label: "Philadelphia" },
];

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

function regionalContext(property: MonitoredProperty) {
  const market = MARKET_EXPLORERS.find((item) => item.id === property.marketId);
  return market?.neighborhoods.find((item) => item.id === property.clusterId) ?? market?.neighborhoods[0] ?? null;
}

function initialAssumption(property: MonitoredProperty, verifiedRent = 0): Assumption {
  const context = regionalContext(property);
  return {
    propertyId: property.id,
    purchasePrice: property.salePrice,
    closingCostPct: 2,
    monthlyRent: verifiedRent,
    vacancyPct: Math.round((context?.vacancyPct ?? 6) * 10) / 10,
    expensePct: 35,
    downPaymentPct: 25,
    interestRate: 7,
    termYears: 30,
  };
}

export function PortfolioLab() {
  const [activeView, setActiveView] = useState<PortfolioView>("overview");
  const [monitoredProperties, setMonitoredProperties] = useState<MonitoredProperty[]>(() => DEFAULT_PROPERTY_IDS.map((id) => PUBLIC_PROPERTIES.find((property) => property.id === id)!));
  const [assumptions, setAssumptions] = useState<Assumption[]>(() => DEFAULT_PROPERTY_IDS.map((id) => initialAssumption(PUBLIC_PROPERTIES.find((property) => property.id === id)!)));
  const [propertyToAdd, setPropertyToAdd] = useState(PUBLIC_PROPERTIES.find((property) => !DEFAULT_PROPERTY_IDS.includes(property.id))?.id ?? PUBLIC_PROPERTIES[0].id);
  const [scenario, setScenario] = useState<Scenario>({ valueShock: -10, rentShock: -5, vacancyShock: 4, expenseShock: 5, rateShock: 1.5 });
  const [listingMarketId, setListingMarketId] = useState<ListingMarketId>("raleigh");
  const [listingResult, setListingResult] = useState<PilotResult | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [listingLoading, setListingLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [listingError, setListingError] = useState("");
  const [listingVerification, setListingVerification] = useState<Record<string, ListingVerification>>({});
  const [candidateSearch, setCandidateSearch] = useState("");

  const items = useMemo(() => assumptions.map((assumption) => {
    const property = monitoredProperties.find((candidate) => candidate.id === assumption.propertyId)!;
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
  }), [assumptions, monitoredProperties]);

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

  const availableProperties = PUBLIC_PROPERTIES.filter((property) => !assumptions.some((assumption) => assumption.propertyId === property.id));
  const selectedListing = listingResult?.listings.find((listing) => listing.id === selectedListingId) ?? listingResult?.listings[0] ?? null;
  const verification = selectedListing ? listingVerification[selectedListing.id] : null;
  const verificationDecision = listingVerificationDecision(selectedListing, verification);
  const filteredListings = (listingResult?.listings ?? []).filter((listing) => `${listing.address} ${listing.propertyType} ${listing.mlsName ?? ""}`.toLowerCase().includes(candidateSearch.toLowerCase()));
  const selectedMarket = MARKET_EXPLORERS.find((market) => market.id === listingMarketId);
  const selectedCluster = selectedListing && selectedMarket ? nearestRegionalCluster(selectedListing, selectedMarket.neighborhoods) : null;

  function updateAssumption(propertyId: string, key: keyof Omit<Assumption, "propertyId">, value: number) {
    setAssumptions((current) => current.map((assumption) => assumption.propertyId === propertyId ? { ...assumption, [key]: value } : assumption));
  }

  function addProperty() {
    if (!availableProperties.some((property) => property.id === propertyToAdd)) return;
    const property = PUBLIC_PROPERTIES.find((candidate) => candidate.id === propertyToAdd)!;
    setMonitoredProperties((current) => current.some((item) => item.id === property.id) ? current : [...current, property]);
    setAssumptions((current) => [...current, initialAssumption(property)]);
    const next = availableProperties.find((property) => property.id !== propertyToAdd);
    if (next) setPropertyToAdd(next.id);
  }

  async function loadLiveCandidates() {
    setListingLoading(true);
    setListingError("");
    setListingResult(null);
    setSelectedListingId(null);
    try {
      const response = await fetch(`/api/listings/${listingMarketId}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json() as PilotResult & { error?: string };
      if (!response.ok || !Array.isArray(payload.listings)) throw new Error(payload.error || "Connected listings are unavailable.");
      setListingResult(payload);
      setSelectedListingId(payload.listings[0]?.id ?? null);
    } catch (error) {
      setListingError(error instanceof Error ? error.message : "Connected listings are unavailable.");
    } finally {
      setListingLoading(false);
    }
  }

  async function verifyListing() {
    if (!selectedListing || listingVerification[selectedListing.id]) return;
    setVerificationLoading(true);
    setListingError("");
    const address2 = `${selectedListing.city}, ${selectedListing.state}${selectedListing.zipCode ? ` ${selectedListing.zipCode}` : ""}`;
    try {
      const [propertyResponse, attomResponse] = await Promise.allSettled([
        fetch(`/api/integrations/rentcast/property?address=${encodeURIComponent(selectedListing.address)}`, { cache: "no-store" }),
        fetch(`/api/integrations/attom/property?address1=${encodeURIComponent(selectedListing.addressLine1)}&address2=${encodeURIComponent(address2)}&market=${selectedListing.state.toLowerCase()}&depth=core`, { cache: "no-store" }),
      ]);
      const errors: string[] = [];
      let activeSale: ListingVerification["activeSale"] = null;
      let rent: ListingVerification["rent"] = null;
      let attom: ListingVerification["attom"] = null;
      if (propertyResponse.status === "fulfilled") {
        const payload = await propertyResponse.value.json() as { activeSale?: ListingVerification["activeSale"]; rentEstimate?: { rent?: number | null; low?: number | null; high?: number | null; compCount?: number }; error?: string };
        if (propertyResponse.value.ok) {
          activeSale = payload.activeSale ?? null;
          if (payload.rentEstimate?.rent) rent = { median: payload.rentEstimate.rent, low: payload.rentEstimate.low ?? null, high: payload.rentEstimate.high ?? null, compCount: payload.rentEstimate.compCount ?? 0 };
        } else errors.push(payload.error || "Exact-address listing recheck failed.");
      } else errors.push("Exact-address listing recheck failed.");
      if (attomResponse.status === "fulfilled") {
        const payload = await attomResponse.value.json() as { cacheHit?: boolean; property?: { avm?: { value?: number | null; low?: number | null; high?: number | null; confidence?: number | null }; livingSize?: number | null; beds?: number | null; baths?: number | null; assessment?: { taxAmount?: number | null } }; error?: string };
        if (attomResponse.value.ok && payload.property?.avm?.value) attom = { value: payload.property.avm.value, low: payload.property.avm.low ?? null, high: payload.property.avm.high ?? null, confidence: payload.property.avm.confidence ?? null, livingSize: payload.property.livingSize ?? null, beds: payload.property.beds ?? null, baths: payload.property.baths ?? null, taxAmount: payload.property.assessment?.taxAmount ?? null, cacheHit: Boolean(payload.cacheHit) };
        else errors.push(payload.error || "Independent property match was unavailable.");
      } else errors.push("Independent property match was unavailable.");
      setListingVerification((current) => ({ ...current, [selectedListing.id]: { checkedAt: new Date().toISOString(), activeSale, rent, attom, errors } }));
    } catch (error) {
      setListingError(error instanceof Error ? error.message : "Property verification could not complete.");
    } finally {
      setVerificationLoading(false);
    }
  }

  function addVerifiedListing() {
    if (!selectedListing || !verification || !verificationDecision.addable || monitoredProperties.some((property) => property.id === `listing-${selectedListing.id}`)) return;
    const listingPrice = verification.activeSale?.price ?? selectedListing.price;
    const vendorValue = verification.attom?.value ?? listingPrice;
    const confidence = Math.min(90, Math.round(selectedListing.evidenceReliability * .65 + verificationDecision.confidence * .35));
    const property: MonitoredProperty = {
      id: `listing-${selectedListing.id}`,
      marketId: listingMarketId,
      clusterId: selectedCluster?.id ?? `${listingMarketId}-unknown`,
      address: selectedListing.addressLine1,
      locality: `${selectedListing.city}, ${selectedListing.state}${selectedListing.zipCode ? ` ${selectedListing.zipCode}` : ""}`,
      propertyType: selectedListing.propertyType,
      sqft: verification.attom?.livingSize ?? selectedListing.squareFootage,
      beds: verification.attom?.beds ?? selectedListing.bedrooms,
      baths: verification.attom?.baths ?? selectedListing.bathrooms,
      salePrice: listingPrice ?? selectedListing.price,
      sourceMode: "connected-listing",
      sourceLabel: verification.activeSale?.mlsName ?? selectedListing.mlsName ?? "RentCast connected listing",
      reportId: null,
      listing: { status: verification.activeSale?.status ?? selectedListing.status, lastSeenDate: verification.activeSale?.lastSeenDate ?? selectedListing.lastSeenDate, mlsName: verification.activeSale?.mlsName ?? selectedListing.mlsName, mlsNumber: verification.activeSale?.mlsNumber ?? selectedListing.mlsNumber, daysOnMarket: verification.activeSale?.daysOnMarket ?? selectedListing.daysOnMarket },
      model: { value: vendorValue, low: verification.attom?.low ?? Math.round(vendorValue * .85), high: verification.attom?.high ?? Math.round(vendorValue * 1.15), confidence, watchScore: selectedListing.screeningScore, clusterEdgeScore: selectedCluster?.composite ?? 50 },
    };
    setMonitoredProperties((current) => [...current, property]);
    setAssumptions((current) => [...current, initialAssumption(property, verification.rent?.median ?? 0)]);
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
      <section className="monitor-intake" aria-labelledby="monitor-intake-title">
        <div className="monitor-intake-head"><div><p className="eyebrow">CONNECTED CANDIDATE INTAKE</p><h3 id="monitor-intake-title">Source → verify → add.</h3><p>Load one regional listing response, select a candidate, and recheck the exact address before it enters the model portfolio. Existing fields populate automatically; regional statistics stay visibly separate from property facts.</p></div><div className="monitor-market-load"><label><span>Market</span><select value={listingMarketId} onChange={(event) => { setListingMarketId(event.target.value as ListingMarketId); setListingResult(null); setSelectedListingId(null); setListingError(""); }}>{LISTING_MARKETS.map((market) => <option key={market.id} value={market.id}>{market.label}</option>)}</select></label><button type="button" onClick={() => void loadLiveCandidates()} disabled={listingLoading}>{listingLoading ? "Loading candidates…" : listingResult ? "Refresh · 1 regional call" : "Load candidates · 1 regional call"}</button></div></div>
        {listingError && <p className="monitor-intake-error" role="alert"><b>Candidate evidence unavailable.</b> {listingError}</p>}
        <div className="monitor-intake-grid">
          <aside className="monitor-candidates">
            <div className="monitor-candidate-tools"><div><b>{listingResult ? `${listingResult.scoredCandidateCount} screened` : "Candidate queue"}</b><small>{listingResult ? `${listingResult.candidateCount.toLocaleString()} reported · ${listingResult.listings.length} comparison records shown` : "Connected active listings only"}</small></div><input aria-label="Search listing candidates" type="search" placeholder="Search address or type" value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} disabled={!listingResult} /></div>
            <div className="monitor-candidate-list">{listingResult ? filteredListings.map((listing) => <button type="button" key={listing.id} className={selectedListing?.id === listing.id ? "active" : ""} onClick={() => setSelectedListingId(listing.id)}><div><b>{listing.addressLine1}</b><small>{listing.propertyType} · {listing.bedrooms ?? "—"} bd / {listing.bathrooms ?? "—"} ba · {listing.squareFootage.toLocaleString()} sf</small></div><strong>{currency(listing.price)}<small>{currency(listing.pricePerSqft)}/sf · {listing.daysOnMarket ?? "—"} DOM</small></strong></button>) : <div className="monitor-candidate-empty"><b>No listing feed loaded</b><span>Choose a market and make one regional request. Public-record samples remain available below.</span></div>}</div>
          </aside>
          <article className="monitor-verify-card">
            <div className="monitor-property-head"><div><span>SELECTED CANDIDATE</span><h4>{selectedListing?.addressLine1 ?? "Choose a connected listing"}</h4><p>{selectedListing ? `${selectedListing.city}, ${selectedListing.state} ${selectedListing.zipCode ?? ""} · ${selectedListing.propertyType}` : "A verification file appears after the regional feed loads."}</p></div><strong>{selectedListing ? currency(selectedListing.price) : "—"}<small>reported asking price</small></strong></div>
            {selectedListing && <>
              <div className="monitor-autofill-grid"><div><span>Living area</span><b>{selectedListing.squareFootage.toLocaleString()} sf</b><small>Listing feed</small></div><div><span>Bed / bath</span><b>{selectedListing.bedrooms ?? "—"} / {selectedListing.bathrooms ?? "—"}</b><small>Listing feed</small></div><div><span>Regional price / sf</span><b>{listingResult ? currency(listingResult.pricePerSqftBand.median) : "—"}</b><small>{listingResult ? `${currency(listingResult.pricePerSqftBand.p25)}–${currency(listingResult.pricePerSqftBand.p75)} listing IQR` : "—"}</small></div><div><span>Regional vacancy</span><b>{selectedCluster?.vacancyPct == null ? "—" : percent(selectedCluster.vacancyPct)}</b><small>{selectedCluster?.name ?? "Nearest ACS cluster"}</small></div><div><span>Regional rent context</span><b>{selectedCluster?.medianRent ? currency(selectedCluster.medianRent) : "—"}</b><small>{selectedCluster?.rentP25 && selectedCluster.rentP75 ? `${currency(selectedCluster.rentP25)}–${currency(selectedCluster.rentP75)} · not property rent` : "Context only"}</small></div><div><span>Listing source</span><b>{selectedListing.mlsName ?? "Unnamed"}</b><small>{selectedListing.mlsNumber ?? "No listing identifier"}</small></div></div>
              {!verification ? <div className="monitor-verify-action"><div><b>Cross-verify before adding</b><p>Rechecks the exact address for an active sale and property rent, then requests one cached-or-live ATTOM core match. This can use up to four provider calls.</p></div><button type="button" onClick={() => void verifyListing()} disabled={verificationLoading}>{verificationLoading ? "Verifying exact address…" : "Verify property"}</button></div> : <>
                <div className={`monitor-verification-status ${verificationDecision.status}`}><div><span>ADD GATE</span><b>{verificationDecision.status === "verified" ? "Verified to monitor" : verificationDecision.status === "watch" ? "Add with watch flags" : "Blocked from Monitor"}</b><small>{verificationDecision.confidence}% of evidence checks passed · checked {new Date(verification.checkedAt).toLocaleString()}</small></div><button type="button" onClick={addVerifiedListing} disabled={!verificationDecision.addable || monitoredProperties.some((property) => property.id === `listing-${selectedListing.id}`)}>{monitoredProperties.some((property) => property.id === `listing-${selectedListing.id}`) ? "Already monitored" : verificationDecision.addable ? "Add populated position" : "Resolve required checks"}</button></div>
                <div className="monitor-checks">{verificationDecision.checks.map((check) => <div key={check.id} className={check.pass ? "pass" : "fail"}><i>{check.pass ? "✓" : "!"}</i><span><b>{check.label}</b><small>{check.detail}</small></span></div>)}</div>
                <div className="monitor-crossfills"><span><b>Verified asking price</b>{verification.activeSale?.price ? currency(verification.activeSale.price) : "Unavailable"}</span><span><b>Property rent estimate</b>{verification.rent?.median ? `${currency(verification.rent.median)}/mo` : "Unavailable"}</span><span><b>ATTOM value</b>{verification.attom?.value ? currency(verification.attom.value) : "Unavailable"}</span><span><b>ATTOM facts</b>{verification.attom ? `${verification.attom.livingSize?.toLocaleString() ?? "—"} sf · ${verification.attom.beds ?? "—"} bd / ${verification.attom.baths ?? "—"} ba` : "Unavailable"}</span></div>
              </>}
            </>}
          </article>
        </div>
        <p className="monitor-intake-boundary"><b>Add boundary.</b> An exact active-listing match and a named source are required. ATTOM and property-rent matches strengthen the evidence file but cannot turn an incomplete listing into an investable deal. Regional rent is context only and is never auto-filled as achievable property rent.</p>
      </section>
      <div className="portfolio-builder-toolbar"><div><p className="eyebrow">ADD FROM QUALIFIED PUBLIC RECORDS</p><h3>{availableProperties.length} available properties</h3></div><label><span>Property</span><select value={propertyToAdd} onChange={(event) => setPropertyToAdd(event.target.value)} disabled={!availableProperties.length}>{availableProperties.map((property) => <option key={property.id} value={property.id}>{property.address} · {property.locality}</option>)}</select></label><button onClick={addProperty} disabled={!availableProperties.length}>Add position</button></div>
      <div className="builder-table"><table><thead><tr><th>Position + evidence</th><th>Acquisition basis</th><th>Monthly rent</th><th>Vacancy</th><th>Operating expense</th><th>Down payment</th><th>Interest rate</th><th>Remove</th></tr></thead><tbody>{items.map((item) => { const context = regionalContext(item.property); return <tr key={item.property.id}><td><b>{item.property.address}</b><small>{item.market.label} · value {currency(item.property.model.value)} · {item.property.model.confidence}% evidence</small><span className={`builder-source ${item.property.sourceMode}`}>{item.property.sourceMode === "connected-listing" ? `Connected · ${item.property.sourceLabel}` : `Public record · ${item.property.sourceLabel}`}</span>{item.property.reportId && <a href={`/report?type=property&id=${encodeURIComponent(item.property.reportId)}`} target="_blank" rel="noreferrer">Open property report →</a>}</td><td><label><span>Price</span><input aria-label={`${item.property.address} acquisition basis`} type="number" min="0" step="1000" value={item.assumption.purchasePrice} onChange={(event) => updateAssumption(item.property.id, "purchasePrice", Number(event.target.value))} /></label><small>{item.property.sourceMode === "connected-listing" ? "Verified active asking price" : "Recorded sale default"}</small></td><td><label><span>Rent</span><input aria-label={`${item.property.address} monthly rent`} type="number" min="0" step="50" value={item.assumption.monthlyRent || ""} placeholder="Required" onChange={(event) => updateAssumption(item.property.id, "monthlyRent", Number(event.target.value))} /></label><small>{item.property.sourceMode === "connected-listing" && item.assumption.monthlyRent ? "Property estimate; replace with rent comps" : `${context?.rentP25 && context?.rentP75 ? `${currency(context.rentP25)}–${currency(context.rentP75)} regional context` : "Property evidence required"}`}</small></td><td><label><span>Vacancy</span><input aria-label={`${item.property.address} vacancy`} type="number" min="0" max="95" step=".5" value={item.assumption.vacancyPct} onChange={(event) => updateAssumption(item.property.id, "vacancyPct", Number(event.target.value))} /></label><small>{context?.vacancyPct == null ? "% of gross rent" : `${percent(context.vacancyPct)} nearest-cluster standard`}</small></td><td><label><span>Expenses</span><input aria-label={`${item.property.address} operating expenses`} type="number" min="0" max="95" step="1" value={item.assumption.expensePct} onChange={(event) => updateAssumption(item.property.id, "expensePct", Number(event.target.value))} /></label><small>35% screening default · verify line items</small></td><td><label><span>Equity</span><input aria-label={`${item.property.address} down payment`} type="number" min="0" max="100" step="1" value={item.assumption.downPaymentPct} onChange={(event) => updateAssumption(item.property.id, "downPaymentPct", Number(event.target.value))} /></label><small>25% portfolio policy default</small></td><td><label><span>Rate</span><input aria-label={`${item.property.address} interest rate`} type="number" min="0" max="30" step=".1" value={item.assumption.interestRate} onChange={(event) => updateAssumption(item.property.id, "interestRate", Number(event.target.value))} /></label><small>7% scenario default · 30 years</small></td><td><button aria-label={`Remove ${item.property.address}`} onClick={() => { setAssumptions((current) => current.filter((assumption) => assumption.propertyId !== item.property.id)); if (item.property.sourceMode === "connected-listing") setMonitoredProperties((current) => current.filter((property) => property.id !== item.property.id)); }} disabled={assumptions.length <= 1}>×</button></td></tr>; })}</tbody></table></div>
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
