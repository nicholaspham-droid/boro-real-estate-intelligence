"use client";

import { useEffect, useMemo, useState } from "react";
import { NationalMarketMap } from "./NationalMarketMap";
import { PriceHistoryChart, type PriceChartPoint } from "./PriceHistoryChart";
import { DecisionStudio } from "./DecisionStudio";
import { AttomConnector } from "./AttomConnector";
import { SafetyEvidence } from "./SafetyEvidence";
import { FeatureAvailability } from "./AvailabilityPanel";
import { VALUATION_MARKET_IDS, type ProductFeatureId } from "./featureAvailability";
import { PropertyOpportunityMap } from "./PropertyOpportunityMap";
import { AttomMarketAudit } from "./AttomMarketAudit";
import { RentCastEvidence } from "./RentCastEvidence";
import { MarketListingPilot } from "./RaleighListingPilot";
import { RaleighDecisionLoop } from "./RaleighDecisionLoop";
import { ReviewFeedback } from "./ReviewFeedback";
import { PortfolioLab } from "./PortfolioLab";
import {
  ACS_AGGREGATION_META,
  BALANCED_WEIGHTS,
  LOCAL_PRICING_META,
  MARKET_EXPLORERS,
  PRICING_HISTORY_META,
  WEIGHT_PRESETS,
  explorerLayerValue,
  weightedComposite,
  type ExplorerLayer,
  type FactorWeights,
  type MarketExplorer,
} from "./marketNeighborhoods";
import sourceRegistry from "../data/source-registry.json";
import propertyValuations from "../data/property-valuations.json";
import { TRACT_PILOT_MARKETS, tractComposite, type ScoredTract, type TractPilotPayload } from "./tractPilot";

const FACTORS: Array<{ key: keyof FactorWeights; label: string; description: string }> = [
  { key: "demographic", label: "Demographic", description: "Age profile and local population depth" },
  { key: "economic", label: "Economic", description: "Income, unemployment and poverty" },
  { key: "education", label: "Education", description: "Bachelor’s degree attainment" },
  { key: "housing", label: "Housing", description: "Income-to-value, rent capacity and vacancy" },
  { key: "pricing", label: "Price momentum", description: "FHFA YoY, acceleration and multi-year growth" },
];

type ProductView = "overview" | "explore" | "areas" | "underwrite" | "properties" | "portfolio" | "coverage" | "feedback";

const PRODUCT_TABS: Array<{ id: ProductView; label: string; purpose: string; boundary: string; hash: string }> = [
  { id: "overview", label: "Overview", purpose: "Understand the evidence workflow and where each decision belongs.", boundary: "Orientation only—no market or property conclusion is made here.", hash: "#overview" },
  { id: "explore", label: "Market Explorer", purpose: "Compare neighborhood fundamentals, price history and tract-cluster momentum.", boundary: "Use for screening; move a candidate into property diligence before acting.", hash: "#workspace" },
  { id: "areas", label: "Top Areas", purpose: "Inspect the ten highest-ranked local clusters under the active factor lens.", boundary: "Rank is relative and changes with weights; it is not a return forecast.", hash: "#leaders" },
  { id: "underwrite", label: "Deal Studio", purpose: "Test an actual price, rent, expenses, financing and investment hurdles.", boundary: "Outputs are scenario math and require verified deal inputs.", hash: "#decision-studio" },
  { id: "properties", label: "Properties", purpose: "Map qualified records, inspect model ranges and run independent vendor checks.", boundary: "Color bands are relative evidence priority—not a buy, hold or sell verdict.", hash: "#valuation" },
  { id: "portfolio", label: "Portfolio Lab", purpose: "Build a hypothetical portfolio, measure concentration and pressure-test shared assumptions.", boundary: "Model mode only—do not enter private account or ownership information behind the shared review password.", hash: "#portfolio" },
  { id: "coverage", label: "Data Coverage", purpose: "See feature availability, expansion waves, source quality and known gaps.", boundary: "A market appears only where the selected feature has current usable data.", hash: "#availability" },
  { id: "feedback", label: "Give Feedback", purpose: "Share a short, private review of the MVP after exploring the workflow.", boundary: "Comments are product research, not an investment recommendation or mailing-list signup.", hash: "#feedback" },
];

function viewFromHash(hash: string): ProductView {
  if (["#workspace"].includes(hash)) return "explore";
  if (hash === "#leaders") return "areas";
  if (hash === "#decision-studio") return "underwrite";
  if (hash === "#valuation") return "properties";
  if (hash === "#portfolio") return "portfolio";
  if (["#availability", "#compare", "#quality", "#sources"].includes(hash)) return "coverage";
  if (hash === "#feedback") return "feedback";
  return "overview";
}

function currency(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function percent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function signed(value: number | null | undefined, suffix = "%") {
  return value === null || value === undefined ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function competencyGrade(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  return "D";
}

function scoreMarket(market: MarketExplorer, weights: FactorWeights) {
  const average = market.neighborhoods.reduce((sum, item) => sum + weightedComposite(item, weights), 0) / market.neighborhoods.length;
  return Math.round(average);
}

function ModelDecisionGate({ market }: { market: (typeof propertyValuations.markets)[number] }) {
  if (!("decisionUse" in market) || !("diagnostics" in market) || !market.diagnostics) return null;
  const state = market.decisionUse;
  const title = state === "pass" ? "Validated for screening" : state === "watch" ? "Use with elevated diligence" : "Regional model compromised";
  const detail = state === "pass" ? "Rolling-origin error, bias and sample depth clear the current screening gate."
    : state === "watch" ? "Error is acceptable for screening, but the historical test sample is too small for equal-confidence cross-market comparison."
      : "Observed regional error is too high for property-level decisions. Values remain visible for diagnosis and should not drive ranking or underwriting.";
  return <div className={`regional-stress ${state}`}><div><span>MODEL DECISION GATE</span><b>{title}</b><p>{detail}</p></div><dl><div><dt>Median error</dt><dd>{market.diagnostics.medianAbsoluteErrorPct}%</dd></div><div><dt>P80 error</dt><dd>{market.diagnostics.p80AbsoluteErrorPct}%</dd></div><div><dt>Median bias</dt><dd>{market.diagnostics.biasPct}%</dd></div><div><dt>PRD</dt><dd>{market.diagnostics.priceRelatedDifferential}</dd></div></dl></div>;
}

function areaReportHref(marketId: string, clusterId: string, weights: FactorWeights) {
  const params = new URLSearchParams({ type: "area", market: marketId, cluster: clusterId });
  for (const factor of FACTORS) params.set(factor.key, String(weights[factor.key]));
  return `/report?${params.toString()}`;
}

const NYC_BOROUGH_COUNTIES = new Set(["36005", "36047", "36061", "36081", "36085"]);

function tractAction(tract: ScoredTract, layer: ExplorerLayer) {
  if (tract.confidence < 65 || tract.coverage < 80) return { code: "REPAIR EVIDENCE", title: "Close the data gap first", detail: "The local signal is too fragile to advance. Verify rent, recent sales and parcel facts before comparing opportunities.", steps: ["Source recent arm’s-length sales", "Validate rent by unit type and recency", "Resolve missing parcel or pricing fields"] };
  if (layer === "pricing" || tract.pricingCompetency < 65) return { code: "VERIFY PRICING", title: "Build a tract-level price anchor", detail: "Pricing still comes from the cluster benchmark. The useful next move is to establish a local price-per-square-foot and sale-recency distribution.", steps: ["Match five or more recent local sales", "Segment price per square foot by property type", "Compare listing ask with recorded-sale range"] };
  if (tract.housing >= 65 && tract.economic >= 60) return { code: "PROPERTY SCREEN", title: "Advance to property-level diligence", detail: "Housing capacity and economic evidence clear the research screen. The tract is a candidate for deal testing—not a purchase recommendation.", steps: ["Join active listings and recent sales", "Validate rent and operating expenses", "Run financing and downside cases in Deal Studio"] };
  if (tract.housing >= 65) return { code: "RENT CHECK", title: "Validate the income thesis", detail: "Housing capacity is the clearest operational signal. Confirm whether unit-level rents support it before placing the tract on a shortlist.", steps: ["Collect rent comps by beds and building type", "Measure concession and vacancy pressure", "Stress-test rent at the 25th percentile"] };
  if (tract.economic >= 65 && tract.housing < 50) return { code: "TENSION TEST", title: "Stress-test affordability", detail: "Economic strength is not translating cleanly into housing capacity. Compare prices, taxes and realistic rent before treating demand as edge.", steps: ["Compare value-to-income with adjacent tracts", "Verify taxes, insurance and common charges", "Model a lower-rent downside case"] };
  return { code: "PEER COMPARE", title: "Compare nearby alternatives", detail: "No operational factor is strong enough to advance alone. Use this tract as a benchmark and inspect higher-ranked adjacent tracts.", steps: ["Compare the next three ranked tracts", "Identify the factor driving score differences", "Advance only after property evidence agrees"] };
}

export default function Home() {
  const [activeView, setActiveView] = useState<ProductView>("overview");
  const [selectedMarketId, setSelectedMarketId] = useState(MARKET_EXPLORERS[0].id);
  const [selectedClusterId, setSelectedClusterId] = useState(MARKET_EXPLORERS[0].neighborhoods[0].id);
  const [layer, setLayer] = useState<ExplorerLayer>("composite");
  const [weights, setWeights] = useState<FactorWeights>(BALANCED_WEIGHTS);
  const [preset, setPreset] = useState("balanced");
  const [query, setQuery] = useState("");
  const [cohort, setCohort] = useState<"all" | "largest" | "fastest">("all");
  const [minimumCompetency, setMinimumCompetency] = useState(0);
  const [priceScope, setPriceScope] = useState<"cluster" | "metro">("cluster");
  const [historyRange, setHistoryRange] = useState<5 | 10 | "full">(10);
  const [selectedLeaderKey, setSelectedLeaderKey] = useState<string | null>(null);
  const [valuationMarket, setValuationMarket] = useState("raleigh");
  const [valuationSort, setValuationSort] = useState<"watch" | "confidence" | "gap" | "value">("watch");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [sourceMarketId, setSourceMarketId] = useState(sourceRegistry.sources[0].marketIds[0]);
  const [explorerLevel, setExplorerLevel] = useState<"clusters" | "tracts">("clusters");
  const [tractPayloads, setTractPayloads] = useState<Record<string, TractPilotPayload>>({});
  const [tractGeometries, setTractGeometries] = useState<Record<string, unknown>>({});
  const [tractStatus, setTractStatus] = useState<"idle" | "loading" | "error">("idle");
  const [tractMessage, setTractMessage] = useState("");
  const [selectedTractId, setSelectedTractId] = useState<string | null>(null);
  const [showAllTracts, setShowAllTracts] = useState(false);
  const [tractScope, setTractScope] = useState<"cluster" | "city" | "market">("cluster");

  const baseMarket = MARKET_EXPLORERS.find((item) => item.id === selectedMarketId) ?? MARKET_EXPLORERS[0];
  const scoredClusters = useMemo(() => baseMarket.neighborhoods
    .map((cluster) => ({ ...cluster, composite: weightedComposite(cluster, weights) }))
    .sort((a, b) => b.composite - a.composite)
    .map((cluster, index) => ({ ...cluster, rank: index + 1 })), [baseMarket, weights]);
  const market = useMemo(() => ({ ...baseMarket, neighborhoods: scoredClusters }), [baseMarket, scoredClusters]);
  const selectedCluster = scoredClusters.find((item) => item.id === selectedClusterId) ?? scoredClusters[0];
  const visibleClusters = scoredClusters.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const activeTractPayload = tractPayloads[market.id];
  const marketScoredTracts = useMemo(() => {
    if (!activeTractPayload) return [];
    const preliminary = activeTractPayload.tracts.map((tract) => ({ ...tract, id: tract.geoid, ...tractComposite(tract, weights) }));
    const sorted = [...preliminary].sort((a, b) => b.composite - a.composite || b.confidence - a.confidence);
    const marketRanks = new Map(sorted.map((tract, index) => [tract.id, index + 1]));
    return preliminary.map((tract) => ({ ...tract, rank: 0, marketPercentile: Math.round(100 - ((marketRanks.get(tract.id)! - 1) / Math.max(1, sorted.length - 1)) * 100) }));
  }, [activeTractPayload, weights]);
  const scoredTracts = useMemo<ScoredTract[]>(() => marketScoredTracts
    .filter((tract) => tractScope === "market" || (tractScope === "city" && market.id === "new-york" ? NYC_BOROUGH_COUNTIES.has(tract.geoid.slice(0, 5)) : tract.clusterId === selectedCluster.id))
    .sort((a, b) => b.composite - a.composite || b.confidence - a.confidence)
    .map((tract, index) => ({ ...tract, rank: index + 1 })), [market.id, marketScoredTracts, selectedCluster.id, tractScope]);
  const filteredTracts = scoredTracts.filter((tract) => `${tract.name} ${tract.geoid}`.toLowerCase().includes(query.toLowerCase()));
  const selectedTract = scoredTracts.find((tract) => tract.id === selectedTractId) ?? scoredTracts[0] ?? null;
  const visibleTracts = showAllTracts ? filteredTracts : filteredTracts.slice(0, 10);
  const tractScopeLabel = tractScope === "cluster" ? selectedCluster.name : tractScope === "city" ? "NYC five boroughs" : market.id === "new-york" ? "Nine-county market" : "Three-county market";
  const selectedTractAction = selectedTract ? tractAction(selectedTract, layer) : null;
  const integratedCompetency = Math.round(market.acsCompetency * .5 + market.metro.competency * .25 + market.localPricingCompetency * .25);
  const totalTracts = MARKET_EXPLORERS.reduce((sum, item) => sum + item.tractCount, 0);
  const activePricingCluster = explorerLevel === "tracts" && selectedTract ? scoredClusters.find((cluster) => cluster.id === selectedTract.clusterId) ?? selectedCluster : selectedCluster;
  const hasLocalPricing = Boolean(activePricingCluster.localPricing);
  const showingLocalPricing = priceScope === "cluster" && hasLocalPricing;
  const displayedPricing = showingLocalPricing ? activePricingCluster.localPricing! : market.pricingHistory;
  const latestChartYear = showingLocalPricing ? activePricingCluster.localPricing!.latestYear : market.pricingHistory.history.at(-1)!.year;
  const chartPoints = useMemo<PriceChartPoint[]>(() => {
    if (showingLocalPricing) {
      return activePricingCluster.localPricing!.history
        .filter((item) => historyRange === "full" || item.year >= latestChartYear - historyRange)
        .map((item) => ({ key: String(item.year), label: String(item.year), index: item.index }));
    }
    return market.pricingHistory.history
      .filter((item) => historyRange === "full" || item.year >= latestChartYear - historyRange)
      .map((item) => ({ key: item.period, label: item.quarter === 1 ? String(item.year) : item.period, index: item.index }));
  }, [showingLocalPricing, activePricingCluster.localPricing, historyRange, latestChartYear, market.pricingHistory]);

  const marketRanking = useMemo(() => MARKET_EXPLORERS
    .filter((item) => cohort === "all" || item.metro.cohort === cohort)
    .filter((item) => Math.round(item.acsCompetency * .5 + item.metro.competency * .25 + item.localPricingCompetency * .25) >= minimumCompetency)
    .map((item) => ({ ...item, score: scoreMarket(item, weights), integrated: Math.round(item.acsCompetency * .5 + item.metro.competency * .25 + item.localPricingCompetency * .25) }))
    .sort((a, b) => b.score - a.score), [cohort, minimumCompetency, weights]);
  const localLeaders = useMemo(() => MARKET_EXPLORERS
    .flatMap((leaderMarket) => leaderMarket.neighborhoods.map((cluster) => ({
      key: `${leaderMarket.id}:${cluster.id}`,
      market: leaderMarket,
      cluster,
      score: weightedComposite(cluster, weights),
    })))
    .sort((a, b) => b.score - a.score || b.cluster.confidence - a.cluster.confidence)
    .slice(0, 10), [weights]);
  const selectedLeader = localLeaders.find((item) => item.key === selectedLeaderKey) ?? localLeaders[0];
  const leaderFactors = FACTORS
    .map((factor) => ({ ...factor, value: selectedLeader.cluster[factor.key] }))
    .sort((a, b) => b.value - a.value);
  const leaderPricing = selectedLeader.cluster.localPricing;
  const leaderLatest = leaderPricing?.history.at(-1);
  const valuationMarketMeta = propertyValuations.markets.find((item) => item.id === valuationMarket) ?? propertyValuations.markets[0];
  const valuationRows = useMemo(() => propertyValuations.properties
    .filter((item) => item.marketId === valuationMarket)
    .sort((a, b) => valuationSort === "confidence" ? b.model.confidence - a.model.confidence
      : valuationSort === "gap" ? b.model.valuationGapPct - a.model.valuationGapPct
        : valuationSort === "value" ? b.model.value - a.model.value
          : b.model.watchScore - a.model.watchScore), [valuationMarket, valuationSort]);
  const selectedProperty = valuationRows.find((item) => item.id === selectedPropertyId) ?? valuationRows[0] ?? null;
  const liveValuationMarkets = propertyValuations.markets.filter((item) => VALUATION_MARKET_IDS.includes(item.id));
  const connectedSourceMarketIds = Array.from(new Set(sourceRegistry.sources.flatMap((item) => item.marketIds)));
  const visibleSources = sourceRegistry.sources.filter((item) => item.marketIds.includes(sourceMarketId));
  const activeTab = PRODUCT_TABS.find((item) => item.id === activeView) ?? PRODUCT_TABS[0];

  useEffect(() => {
    const syncHash = () => { setActiveView(viewFromHash(window.location.hash)); window.scrollTo({ top: 0 }); };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  function selectView(view: ProductView, hash = PRODUCT_TABS.find((item) => item.id === view)?.hash ?? "#overview") {
    setActiveView(view);
    window.history.replaceState(null, "", hash);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseMarket(id: string) {
    const next = MARKET_EXPLORERS.find((item) => item.id === id) ?? MARKET_EXPLORERS[0];
    setSelectedMarketId(next.id);
    setSelectedClusterId(next.neighborhoods[0].id);
    setQuery("");
    setExplorerLevel("clusters");
    setSelectedTractId(null);
    setShowAllTracts(false);
    setTractScope("cluster");
  }

  async function exploreTracts() {
    if (!TRACT_PILOT_MARKETS.has(market.id)) return;
    setQuery("");
    setShowAllTracts(false);
    setTractScope("cluster");
    setExplorerLevel("tracts");
    setTractMessage("");
    if (tractPayloads[market.id] && tractGeometries[market.id]) return;
    setTractStatus("loading");
    try {
      const [dataResponse, geometryResponse] = await Promise.all([fetch(`/data/tract-pilot/${market.id}.json`), fetch(`/data/tract-pilot/geometry/${market.id}.geojson`)]);
      if (!dataResponse.ok || !geometryResponse.ok) throw new Error("The tract pilot data could not be loaded.");
      const [payload, geometry] = await Promise.all([dataResponse.json() as Promise<TractPilotPayload>, geometryResponse.json()]);
      setTractPayloads((current) => ({ ...current, [market.id]: payload }));
      setTractGeometries((current) => ({ ...current, [market.id]: geometry }));
      setTractStatus("idle");
    } catch (reason) {
      setTractStatus("error");
      setTractMessage(reason instanceof Error ? reason.message : "The tract pilot data could not be loaded.");
    }
  }

  function returnToClusters() {
    setExplorerLevel("clusters");
    setSelectedTractId(null);
    setQuery("");
    setShowAllTracts(false);
    setTractScope("cluster");
  }

  function selectTract(id: string) {
    const tract = scoredTracts.find((item) => item.id === id);
    setSelectedTractId(id);
    if (tract && tract.clusterId !== selectedCluster.id) setSelectedClusterId(tract.clusterId);
  }

  function applyPreset(id: string) {
    const next = WEIGHT_PRESETS.find((item) => item.id === id) ?? WEIGHT_PRESETS[0];
    setPreset(next.id);
    setWeights(next.weights);
  }

  function setWeight(key: keyof FactorWeights, value: number) {
    setPreset("custom");
    setWeights((current) => ({ ...current, [key]: value }));
  }

  function openAvailableMarket(marketId: string, featureId: ProductFeatureId) {
    if (featureId === "valuation" || featureId === "safety") {
      setValuationMarket(marketId);
      setSelectedPropertyId(null);
      selectView("properties", "#valuation");
      return;
    }
    if (featureId === "parcels") {
      setSourceMarketId(marketId);
      selectView("coverage", "#sources");
      return;
    }
    chooseMarket(marketId);
    selectView("explore", "#workspace");
  }

  return (
    <main id="top">
      <header className="topbar product-topbar">
        <a className="brand" href="#overview" aria-label="BORO home" onClick={() => setActiveView("overview")}><span>BORO</span></a>
        <span className="product-label">Real Estate Intelligence</span>
        <label className="global-market-picker"><span>Market</span><select value={market.id} onChange={(event) => chooseMarket(event.target.value)}>{MARKET_EXPLORERS.map((item) => <option key={item.id} value={item.id}>{item.metro.short}</option>)}</select></label>
        <nav className="product-tabs" aria-label="Product features">{PRODUCT_TABS.map((tab) => <button key={tab.id} aria-pressed={activeView === tab.id} className={activeView === tab.id ? "active" : ""} onClick={() => selectView(tab.id)}>{tab.label}</button>)}</nav>
        <a className="profile-entry" href="/profile" aria-label="Open saved research profile"><span aria-hidden="true">♡</span> Saved</a>
      </header>

      <div className="workspace-guide"><div><span>Active product feature</span><b>{activeTab.label}</b></div><p><strong>Use it to:</strong> {activeTab.purpose}</p><p><strong>Decision boundary:</strong> {activeTab.boundary}</p></div>

      <div className={`product-view ${activeView === "overview" ? "active" : ""}`} aria-hidden={activeView !== "overview"}>
      <section className="product-hero">
        <div className="hero-copy">
          <p className="eyebrow">NATIONAL PUBLIC-DATA MARKET WORKBENCH</p>
          <h1>Find the edge<br />inside the <em>evidence.</em></h1>
          <p className="lede">Compare demographic, economic, educational, housing and historical price momentum across U.S. markets, then move into reproducible local tract clusters. The score is an evidence-ranking tool—not a property appraisal or forecast.</p>
          <div className="hero-actions"><a href="#workspace">Open market workspace</a><a href="#decision-studio">Underwrite a deal</a></div>
        </div>
        <div className="hero-proof">
          <p>PUBLIC DATA FOUNDATION</p>
          <strong>{totalTracts.toLocaleString()}</strong><span>ACS tracts aggregated</span>
          <div><b>{MARKET_EXPLORERS.length}</b><span>markets</span><b>{ACS_AGGREGATION_META.clusterCount}</b><span>local clusters</span><b>{PRICING_HISTORY_META.latestPeriod}</b><span>FHFA pricing</span></div>
          <small>Current attributes from ACS detailed tables. Historical pricing now separates annual tract-cluster HPI from the quarterly metro benchmark.</small>
        </div>
      </section>

      <section className="product-overview" id="overview">
        <div className="section-title"><div><p className="eyebrow">PRODUCT OVERVIEW · FROM SIGNAL TO MEMO</p><h2>One workflow.<br />Five explicit decisions.</h2></div><p>BORO is an evidence-first screening and underwriting workbench. It helps an investor narrow markets, inspect local fundamentals, challenge a property value, model an actual deal and document why it should advance—or stop.</p></div>
        <div className="product-journey">
          <article><span>01</span><b>Configure</b><p>Choose a growth, income, balanced or value-add lens. The active weights and hurdles stay visible.</p><a href="#workspace">Set the market lens →</a></article>
          <article><span>02</span><b>Rank</b><p>Compare 97 tract clusters on demographic, economic, education, housing and measured price momentum.</p><a href="#leaders">Review local leaders →</a></article>
          <article><span>03</span><b>Audit</b><p>Carry source coverage, model validation, local safety context and uncertainty with every signal. Weak evidence lowers competency.</p><a href="#quality">Inspect controls →</a></article>
          <article><span>04</span><b>Cross-check</b><p>Compare qualified sales, assessments, matched comps and an independent vendor AVM without hiding disagreement.</p><a href="#valuation">Open valuation lab →</a></article>
          <article><span>05</span><b>Decide</b><p>Enter the actual price and operations. Advance only when evidence, price, yield, debt and cash gates agree.</p><a href="#decision-studio">Build a decision memo →</a></article>
        </div>
        <div className="evidence-ladder"><div><p className="eyebrow">EVIDENCE LADDER</p><h3>Each layer answers a different question.</h3></div><ol><li><b>National fundamentals</b><span>Which metros deserve attention?</span></li><li><b>Local history</b><span>Which tract clusters show measured momentum?</span></li><li><b>Property context</b><span>What traded, and what local incidents were reported?</span></li><li><b>Independent AVM</b><span>Does a separate model corroborate the range?</span></li><li><b>Live deal facts</b><span>Does the actual price, rent and cost structure work?</span></li></ol></div>
        <div className="product-boundaries"><b>Decision boundaries</b><span>A cluster score is not a property forecast.</span><span>An assessment gap is not acquisition edge.</span><span>Evidence quality is not a probability of profit.</span><span>A scenario is not investment or appraisal advice.</span></div>
      </section>
      </div>

      <div className={`product-view ${activeView === "explore" ? "active" : ""}`} aria-hidden={activeView !== "explore"}>
      <section className="market-command" id="workspace">
        <div className="command-title">
          <div><p className="eyebrow">SELECTED MARKET</p><h2>{market.metro.short}<br /><em>evidence workspace.</em></h2><p>{market.metro.name}</p></div>
          <div className="quality-stack">
            <article><span>ACS competency</span><strong>{market.acsCompetency}%</strong><small>{market.tractCount.toLocaleString()} tracts · {market.countyCount} primary counties</small></article>
            <article><span>Parcel competency</span><strong>{market.metro.competency}%</strong><small>{market.metro.localStatus} · ±{market.metro.evidenceBand} operational points</small></article>
            <article><span>Local pricing competency</span><strong>{market.localPricingCompetency}%</strong><small>FHFA tract HPI through {LOCAL_PRICING_META.latestYear} · coverage varies by cluster</small></article>
            <article className="integrated"><span>Integrated</span><strong>{integratedCompetency}% <i>{competencyGrade(integratedCompetency)}</i></strong><small>50% ACS · 25% parcels · 25% local pricing</small></article>
          </div>
        </div>

        <div className="preset-strip" aria-label="Analysis presets">
          <span>Lens</span>{WEIGHT_PRESETS.map((item) => <button key={item.id} className={preset === item.id ? "selected" : ""} onClick={() => applyPreset(item.id)}><b>{item.label}</b><small>{item.detail}</small></button>)}
        </div>

        <div className="workspace-grid">
          <aside className="factor-panel">
            <div><p className="eyebrow">COMPOSITE MIX</p><h3>Weight what matters.</h3><p>Adjust the evidence lens. The raw factor result is reliability-adjusted toward 50 when local data competency is weak, then reranks local clusters and markets.</p></div>
            {FACTORS.map((factor) => <label key={factor.key}><span><b>{factor.label}</b><i>{weights[factor.key]}%</i></span><small>{factor.description}</small><input type="range" min="0" max="70" value={weights[factor.key]} onChange={(event) => setWeight(factor.key, Number(event.target.value))} /></label>)}
            <div className="weight-total"><span>Normalized automatically</span><b>{Object.values(weights).reduce((sum, value) => sum + value, 0)} raw pts</b></div>
          </aside>

          <div className="map-workspace">
            <div className="map-breadcrumb" aria-label="Explorer geography">
              <button onClick={returnToClusters}>{market.metro.short}</button><i>/</i><button onClick={returnToClusters}>{selectedCluster.name}</button>
              {explorerLevel === "tracts" && <><i>/</i><strong>{selectedTract ? `Tract ${selectedTract.geoid}` : "Census tracts"}</strong><span>PILOT</span></>}
            </div>
            {explorerLevel === "tracts" && <div className="tract-scope-switch"><span>Geography</span><button className={tractScope === "cluster" ? "active" : ""} onClick={() => { setTractScope("cluster"); setQuery(""); setShowAllTracts(false); }}>{selectedCluster.name}</button>{market.id === "new-york" && <button className={tractScope === "city" ? "active" : ""} onClick={() => { setTractScope("city"); setQuery(""); setShowAllTracts(false); }}>NYC · 5 boroughs</button>}<button className={tractScope === "market" ? "active" : ""} onClick={() => { setTractScope("market"); setQuery(""); setShowAllTracts(false); }}>Full market</button><small>{market.id === "new-york" ? "Coverage: Manhattan 302 · Brooklyn 777 · Queens 683 · Bronx 347 · Staten Island 119" : "Coverage: Wake, Johnston and Durham county tracts"}</small></div>}
            <div className="map-toolbar">
              <label><span>Search {explorerLevel === "tracts" ? "tract" : "cluster"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={explorerLevel === "tracts" ? "GEOID or tract name…" : "Central, north, east…"} /></label>
              <div><span>Map layer</span>{(["composite", "demographic", "economic", "education", "housing", "pricing"] as ExplorerLayer[]).map((item) => <button key={item} className={layer === item ? "selected" : ""} onClick={() => setLayer(item)}>{item}</button>)}</div>
            </div>
            <div className="map-stage">
              <NationalMarketMap market={market} neighborhoods={visibleClusters} tracts={filteredTracts} tractGeoJson={tractGeometries[market.id]} tractScopeLabel={tractScopeLabel} geographyMode={explorerLevel} focus={explorerLevel === "tracts" ? { center: { lat: selectedCluster.lat, lng: selectedCluster.lng }, zoom: market.id === "new-york" ? 10 : 11 } : undefined} layer={layer} selectedId={explorerLevel === "tracts" ? selectedTract?.id ?? "" : selectedCluster.id} onSelect={explorerLevel === "tracts" ? selectTract : setSelectedClusterId} onPropertySelect={(id) => { const property = propertyValuations.properties.find((item) => item.id === id); if (property) setValuationMarket(property.marketId); setSelectedPropertyId(id); window.location.hash = "valuation"; }} />
              {explorerLevel === "tracts" && tractStatus === "loading" && <div className="tract-loading"><i /> Loading official tract evidence…</div>}
              {explorerLevel === "tracts" && tractStatus === "error" && <div className="tract-loading error"><b>Tract data unavailable</b><span>{tractMessage}</span><button onClick={() => void exploreTracts()}>Try again</button></div>}
            </div>
          </div>

          {explorerLevel === "clusters" ? <article className="cluster-card">
            <div className="cluster-rank"><span>#{selectedCluster.rank} {layer} rank</span><b>{explorerLayerValue(selectedCluster, layer)}</b><small>/100</small></div>
            <h3>{selectedCluster.name}</h3>
            <p>{selectedCluster.tractCount} census tracts · {compact(selectedCluster.population)} residents</p>
            <div className="cluster-confidence"><span>Integrated competency</span><b>{selectedCluster.confidence}%</b><i><span style={{ width: `${selectedCluster.confidence}%` }} /></i></div>
            <div className="factor-bars">{FACTORS.map((factor) => <div key={factor.key}><span>{factor.label}</span><i><b style={{ width: `${selectedCluster[factor.key]}%` }} /></i><strong>{selectedCluster[factor.key]}</strong></div>)}</div>
            <dl>
              <div><dt>Median household income</dt><dd>{currency(selectedCluster.medianIncome)}</dd></div>
              <div><dt>Bachelor’s degree+</dt><dd>{percent(selectedCluster.bachelorsPct)}</dd></div>
              <div><dt>Unemployment</dt><dd>{percent(selectedCluster.unemploymentPct)}</dd></div>
              <div><dt>Median home value</dt><dd>{currency(selectedCluster.medianHomeValue)}</dd></div>
              <div><dt>Median gross rent</dt><dd>{currency(selectedCluster.medianRent)}</dd></div>
              <div><dt>ACS reliability</dt><dd>{selectedCluster.reliability}%</dd></div>
            </dl>
            <div className="cluster-read"><b>How to use this</b><p>Treat this as a screening signal. Move the top cluster into parcel, sales, zoning and permit diligence before making an investment conclusion.</p></div>
            {TRACT_PILOT_MARKETS.has(market.id) && <button className="tract-explore-button" onClick={() => void exploreTracts()}><span>TRACT PILOT</span><b>Explore {selectedCluster.tractCount} individual tracts</b><small>One level deeper · same factor lens →</small></button>}
            <a className="print-report-link" href={areaReportHref(market.id, selectedCluster.id, weights)} target="_blank" rel="noreferrer">Print 2-page area report →</a>
          </article> : selectedTract ? <article className="cluster-card tract-card">
            <button className="tract-back" onClick={returnToClusters}>← Back to cluster</button>
            <div className="cluster-rank"><span>#{selectedTract.rank} within {tractScopeLabel}</span><b>{selectedTract[layer]}</b><small>/100</small></div>
            <h3>Tract {selectedTract.geoid}</h3>
            <p>{selectedTract.name} · {compact(selectedTract.population)} residents</p>
            <div className="tract-baselines"><span><b>{selectedTract.composite}</b>Composite</span><span><b>{selectedTract.marketPercentile}<i>th</i></b>Market percentile</span></div>
            <div className="cluster-confidence"><span>Tract data competency</span><b>{selectedTract.confidence}%</b><i><span style={{ width: `${selectedTract.confidence}%` }} /></i></div>
            <div className="factor-bars">{FACTORS.map((factor) => <div key={factor.key}><span>{factor.label}</span><i><b style={{ width: `${selectedTract[factor.key]}%` }} /></i><strong>{selectedTract[factor.key]}</strong></div>)}</div>
            <dl>
              <div><dt>Median household income</dt><dd>{currency(selectedTract.medianIncome)}</dd></div>
              <div><dt>Bachelor’s degree+</dt><dd>{percent(selectedTract.bachelorsPct)}</dd></div>
              <div><dt>Unemployment</dt><dd>{percent(selectedTract.unemploymentPct)}</dd></div>
              <div><dt>Median home value</dt><dd>{currency(selectedTract.medianHomeValue)}</dd></div>
              <div><dt>Median gross rent</dt><dd>{currency(selectedTract.medianRent)}</dd></div>
              <div><dt>ACS reliability</dt><dd>{selectedTract.reliability}%</dd></div>
            </dl>
            <div className="cluster-read tract-gap"><b>Evidence boundary</b><p>ACS factors are tract-specific. Pricing is the {activePricingCluster.name} FHFA benchmark, so it does not distinguish tracts yet and its competency is carried into the score.</p></div>
            {selectedTractAction && <div className="tract-action-card"><span>{selectedTractAction.code}</span><h4>{selectedTractAction.title}</h4><p>{selectedTractAction.detail}</p><ol>{selectedTractAction.steps.map((step) => <li key={step}>{step}</li>)}</ol><small>Research action only. Demographic and education layers are context—not inputs for tenant targeting, protected-class decisions or steering.</small><div><button onClick={() => { const next = scoredTracts[selectedTract.rank % scoredTracts.length]; if (next) selectTract(next.id); }}>Compare next-ranked tract</button><button onClick={() => VALUATION_MARKET_IDS.includes(market.id) ? selectView("properties", "#valuation") : selectView("coverage", "#availability")}>{VALUATION_MARKET_IDS.includes(market.id) ? "Open property evidence" : "Review missing sources"}</button></div></div>}
          </article> : <article className="cluster-card tract-card empty"><h3>Loading tracts…</h3><p>The cluster view remains available while evidence loads.</p></article>}
        </div>

        {explorerLevel === "tracts" && <div className="tract-price-boundary"><b>Pricing scope stays at cluster level</b><span>The tract selection changes ACS fundamentals on the map and card. Historical HPI below remains the {activePricingCluster.name} benchmark until a qualified tract series is available.</span></div>}
        <section className="pricing-history-panel" aria-label={`${showingLocalPricing ? activePricingCluster.name : market.metro.short} historical home price trend`}>
          <div className="pricing-history-copy"><p className="eyebrow">{showingLocalPricing ? "FHFA TRACT-CLUSTER HPI" : "FHFA METRO BENCHMARK"} · {showingLocalPricing ? activePricingCluster.localPricing!.latestYear : market.pricingHistory.latestPeriod}</p><h3>{signed(displayedPricing.yoy)} <span>year over year</span></h3><p>{showingLocalPricing ? `${activePricingCluster.name} aggregates observed tract-level annual changes. Latest population coverage is ${activePricingCluster.localPricing!.history.at(-1)!.coveragePct}%.` : "Quarterly All-Transactions HPI, not seasonally adjusted. Divided metros use an equal-weight composite."}</p><a href={showingLocalPricing ? LOCAL_PRICING_META.source : PRICING_HISTORY_META.source} target="_blank" rel="noreferrer">Open FHFA source series →</a></div>
          <div className="pricing-history-main">
            <div className="price-chart-controls"><div><span>Geography</span><button className={priceScope === "cluster" ? "selected" : ""} onClick={() => setPriceScope("cluster")} disabled={!hasLocalPricing}>Local cluster</button><button className={priceScope === "metro" || !hasLocalPricing ? "selected" : ""} onClick={() => setPriceScope("metro")}>Metro benchmark</button></div><div><span>History</span>{([5, 10, "full"] as const).map((range) => <button key={range} className={historyRange === range ? "selected" : ""} onClick={() => setHistoryRange(range)}>{range === "full" ? "Full" : `${range}Y`}</button>)}</div></div>
            <PriceHistoryChart points={chartPoints} seriesLabel={showingLocalPricing ? `${activePricingCluster.name} annual tract-cluster HPI` : `${market.metro.short} quarterly metro HPI`} />
          </div>
          <div className="pricing-history-metrics"><div><span>Momentum score</span><b>{displayedPricing.momentumScore}</b></div><div><span>3-year CAGR</span><b>{signed(displayedPricing.threeYearCagr)}</b></div><div><span>5-year growth</span><b>{signed(displayedPricing.fiveYearGrowth)}</b></div><div><span>YoY acceleration</span><b className={(displayedPricing.acceleration ?? 0) < 0 ? "negative" : ""}>{signed(displayedPricing.acceleration, " pts")}</b></div></div>
          <small className="pricing-scope">{showingLocalPricing ? `This chart follows the selected tract’s parent cluster. FHFA tract HPI is developmental; ${activePricingCluster.localPricing!.history.at(-1)!.observedTracts} of ${activePricingCluster.localPricing!.totalTractCount} tracts support the latest annual change, so the ${activePricingCluster.localPricing!.pricingCompetency}% pricing competency should travel with the signal.` : `This is the entire metropolitan benchmark. Switch to Local cluster to see the selected map cluster; ${hasLocalPricing ? "a local series is available here." : "FHFA does not have enough repeat-transaction observations for this cluster."}`}</small>
        </section>

        {explorerLevel === "clusters" ? <div className="cluster-table"><table><thead><tr><th>Rank</th><th>Local tract cluster</th><th>Composite</th><th>Demographic</th><th>Economic</th><th>Education</th><th>Housing</th><th>Pricing</th><th>Data competency</th></tr></thead><tbody>{visibleClusters.map((item) => <tr key={item.id} className={item.id === selectedCluster.id ? "active" : ""} onClick={() => setSelectedClusterId(item.id)}><td>{String(item.rank).padStart(2, "0")}</td><td><strong>{item.name}</strong><small>{item.tractCount} tracts · {compact(item.population)} people</small></td><td><b>{item.composite}</b></td><td>{item.demographic}</td><td>{item.economic}</td><td>{item.education}</td><td>{item.housing}</td><td>{item.pricing}</td><td><span>{item.confidence}%</span></td></tr>)}</tbody></table>{!visibleClusters.length && <p className="empty">No local cluster matches that search.</p>}</div> : <>
          <div className="tract-table-head"><div><p className="eyebrow">TRACTS IN {tractScopeLabel.toUpperCase()}</p><h3>{filteredTracts.length} local observations</h3></div><p>Rank is relative to the selected geography. Market percentile compares the same weighted score across all pilot tracts in {market.metro.short}.</p></div>
          <div className="cluster-table tract-table"><table><thead><tr><th>Scope rank</th><th>Census tract</th><th>Composite</th><th>Research next</th><th>Market pct.</th><th>Income</th><th>Home value</th><th>Rent</th><th>ACS reliability</th><th>Data competency</th></tr></thead><tbody>{visibleTracts.map((item) => <tr key={item.id} className={item.id === selectedTract?.id ? "active" : ""} onClick={() => selectTract(item.id)}><td>{String(item.rank).padStart(2, "0")}</td><td><strong>Tract {item.geoid}</strong><small>{compact(item.population)} people · {item.name}</small></td><td><b>{item.composite}</b></td><td><em className="tract-action-chip">{tractAction(item, layer).code}</em></td><td>{item.marketPercentile}th</td><td>{currency(item.medianIncome)}</td><td>{currency(item.medianHomeValue)}</td><td>{currency(item.medianRent)}</td><td>{item.reliability}%</td><td><span>{item.confidence}%</span></td></tr>)}</tbody></table>{!filteredTracts.length && tractStatus !== "loading" && <p className="empty">No tract matches that search.</p>}</div>
          {filteredTracts.length > 10 && <button className="tract-view-all" onClick={() => setShowAllTracts((current) => !current)}>{showAllTracts ? "Show top 10 only" : `View all ${filteredTracts.length} tracts`} →</button>}
          <details className="pilot-review-guide">
            <summary><span>PILOT REVIEW GUIDE</span><b>Questions for your test</b><small>6 prompts · open when ready</small></summary>
            <div><ol><li>Does the polygon heat map make spatial patterns easier to understand than the former point view?</li><li>Is the cluster, five-borough and full-market scope switch clear enough?</li><li>Do scope rank and market percentile answer meaningfully different questions for you?</li><li>Does “Research next” turn the tract signal into a useful diligence step?</li><li>Does the pricing benchmark label prevent you from mistaking cluster evidence for tract evidence?</li><li>Which next capability would add more value: property overlays, tract comparison, or a saved research queue?</li></ol><button onClick={() => selectView("feedback", "#feedback")}>Give tract-pilot feedback →</button></div>
          </details>
        </>}
      </section>
      </div>

      <div className={`product-view ${activeView === "areas" ? "active" : ""}`} aria-hidden={activeView !== "areas"}>
      <section className="leaders-section" id="leaders">
        <div className="section-title"><div><p className="eyebrow">LOCAL SIGNAL LEADERBOARD</p><h2>Ten areas.<br />One auditable ranking.</h2></div><p>These are the highest-scoring tract clusters under your current factor weights. The rank updates with the active lens; competency and FHFA coverage remain visible so a strong signal is never mistaken for certainty.</p></div>
        <div className="leaders-layout">
          <ol className="leader-list" aria-label="Top ten local areas">
            {localLeaders.map((item, index) => <li key={item.key}><button className={selectedLeader.key === item.key ? "active" : ""} onClick={() => setSelectedLeaderKey(item.key)}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.cluster.name}</b><small>{item.market.metro.short}</small></div><strong>{item.score}</strong><i><b>{item.cluster.confidence}%</b><small>competency</small></i></button></li>)}
          </ol>
          <article className="leader-detail">
            <div className="leader-detail-head"><div><p className="eyebrow">#{localLeaders.findIndex((item) => item.key === selectedLeader.key) + 1} · DETAILED BREAKDOWN</p><h3>{selectedLeader.cluster.name}</h3><span>{selectedLeader.market.metro.short} · {selectedLeader.cluster.tractCount} tracts · {compact(selectedLeader.cluster.population)} residents</span></div><div><strong>{selectedLeader.score}</strong><small>edge score</small></div></div>
            <div className="leader-number-grid"><div><span>Local HPI YoY</span><b className={(leaderPricing?.yoy ?? 0) < 0 ? "negative" : ""}>{signed(leaderPricing?.yoy)}</b><small>{leaderPricing ? `FHFA ${leaderPricing.latestYear}` : "Metro proxy"}</small></div><div><span>Five-year HPI</span><b>{signed(leaderPricing?.fiveYearGrowth)}</b><small>{leaderPricing ? `${leaderPricing.pricingCompetency}% pricing competency` : "No tract series"}</small></div><div><span>Household income</span><b>{currency(selectedLeader.cluster.medianIncome)}</b><small>{percent(selectedLeader.cluster.unemploymentPct)} unemployment</small></div><div><span>Home value</span><b>{currency(selectedLeader.cluster.medianHomeValue)}</b><small>{currency(selectedLeader.cluster.medianRent)} median rent</small></div></div>
            <div className="leader-why"><div><p className="eyebrow">WHY IT STANDS OUT</p><ul><li><b>{leaderFactors[0].label} leads the profile at {leaderFactors[0].value}/100.</b> {leaderFactors[0].description}.</li><li><b>{leaderFactors[1].label} adds a {leaderFactors[1].value}/100 supporting signal.</b> {leaderFactors[1].description}.</li><li><b>Local price momentum is {selectedLeader.cluster.pricing}/100.</b> {leaderPricing ? `${signed(leaderPricing.yoy)} YoY and ${signed(leaderPricing.fiveYearGrowth)} over five years.` : "FHFA tract history is not sufficient, so the metro benchmark is used."}</li></ul></div><div className="leader-confidence"><span>Evidence check</span><strong>{selectedLeader.cluster.confidence}%</strong><i><span style={{ width: `${selectedLeader.cluster.confidence}%` }} /></i><p>{leaderPricing && leaderLatest ? `${leaderLatest.observedTracts} of ${leaderPricing.totalTractCount} tracts support the latest price change, covering ${leaderLatest.coveragePct}% of cluster population.` : "No qualified local FHFA tract series. Treat the price factor as market context only."}</p></div></div>
            <div className="leader-factor-row">{FACTORS.map((factor) => <div key={factor.key}><span>{factor.label}</span><i><b style={{ width: `${selectedLeader.cluster[factor.key]}%` }} /></i><strong>{selectedLeader.cluster[factor.key]}</strong></div>)}</div>
            <div className="leader-actions"><a href="#workspace" onClick={() => { chooseMarket(selectedLeader.market.id); setSelectedClusterId(selectedLeader.cluster.id); }}>Open this area in the market workspace →</a><a className="print-report-link" href={areaReportHref(selectedLeader.market.id, selectedLeader.cluster.id, weights)} target="_blank" rel="noreferrer">Print 2-page area report →</a></div>
          </article>
        </div>
        <p className="leaders-note">Ranking basis: weighted factor composite under the active lens, shrunk toward 50 in proportion to local data competency. This is a screening leaderboard, not a forecast of future returns.</p>
      </section>
      </div>

      <div className={`product-view ${activeView === "underwrite" ? "active" : ""}`} aria-hidden={activeView !== "underwrite"}>
      <DecisionStudio />
      </div>

      <div className={`product-view ${activeView === "properties" ? "active" : ""}`} aria-hidden={activeView !== "properties"}>
      <section className="valuation-section" id="valuation">
        <div className="section-title"><div><p className="eyebrow">PROPERTY VALUATION LAB · MODEL V3.1</p><h2>Cross-check the property.<br />Keep the uncertainty.</h2></div><p>Qualified recorded sales, effective-dated assessments, building facts and FHFA tract-cluster history resolve to individual properties in three high-intent corridors. Version 3.1 adds leakage-safe Philadelphia assessment cohorts and more local subtype/ZIP comparable pools while keeping the region fail-closed because out-of-time error remains too high.</p></div>
        <MarketListingPilot />
        <RaleighDecisionLoop />
        <div className="valuation-channel-heading"><div><p className="eyebrow">SEPARATE CHANNEL · RECORDED PUBLIC DATA</p><h3>Historical model library</h3></div><p>These controls change the public-record table below. The live-listing screen above now covers Raleigh, Chicago and Philadelphia; the historical library preserves each region’s recorded evidence and out-of-time error separately.</p></div>
        <div className="valuation-readiness">
          {liveValuationMarkets.map((item) => <button key={item.id} className={valuationMarket === item.id ? "active" : ""} onClick={() => { setValuationMarket(item.id); setSelectedPropertyId(null); }}><span>PUBLIC RECORD MODEL · {"decisionUse" in item ? item.decisionUse : "gap"}</span><b>{item.label}</b><i>{item.competency}% integrated competency</i><small>{"sourceCompetency" in item ? `${item.sourceCompetency}% source · ${item.modelCompetency}% model · ${item.diagnostics?.sampleSize ?? 0} leakage-controlled tests` : ""}</small></button>)}
        </div>
        <ModelDecisionGate market={valuationMarketMeta} />
        {valuationRows.length > 0 && valuationMarket !== "raleigh" && <PropertyOpportunityMap marketLabel={valuationMarketMeta.label} properties={valuationRows} selectedId={selectedProperty?.id ?? null} onSelect={setSelectedPropertyId} />}
        {valuationRows.length ? <div className="valuation-workbench">
          <div className="valuation-list">
            <div className="valuation-toolbar"><div><span>Sort property watchlist</span>{([['watch','Watch score'],['confidence','Confidence'],['gap','Assessment gap'],['value','Model value']] as const).map(([id, label]) => <button key={id} className={valuationSort === id ? "selected" : ""} onClick={() => setValuationSort(id)}>{label}</button>)}</div><p>{valuationMarketMeta.label} · {valuationRows.length} records</p></div>
            <div className="valuation-table"><table><thead><tr><th>Property</th><th>Recorded sale</th><th>Model range</th><th>Assessment gap</th><th>Confidence</th><th>Watch</th></tr></thead><tbody>{valuationRows.map((item) => <tr key={item.id} className={selectedProperty?.id === item.id ? "active" : ""} onClick={() => setSelectedPropertyId(item.id)}><td><b>{item.address}</b><small>{item.locality} · {item.propertyType}</small></td><td>{currency(item.salePrice)}<small>{item.saleDate}</small></td><td><b>{currency(item.model.value)}</b><small>{currency(item.model.low)}–{currency(item.model.high)}</small></td><td className={item.model.valuationGapPct < 0 ? "negative" : "positive"}>{signed(item.model.valuationGapPct)}</td><td><span className="confidence-pill">{item.model.confidence}%</span></td><td><strong>{item.model.watchScore}</strong></td></tr>)}</tbody></table></div>
          </div>
          {selectedProperty && <article className="valuation-detail">
            <div className="valuation-detail-head"><div><p className="eyebrow">SELECTED PUBLIC RECORD</p><h3>{selectedProperty.address}</h3><span>{selectedProperty.locality} · {selectedProperty.propertyType}</span></div><div><strong>{selectedProperty.model.watchScore}</strong><small>watch score</small></div></div>
            <div className="valuation-range"><span>Public-record model range</span><b>{currency(selectedProperty.model.low)} <i>to</i> {currency(selectedProperty.model.high)}</b><small>Center {currency(selectedProperty.model.value)} · {selectedProperty.model.confidence}% evidence quality · range includes {selectedProperty.model.diagnostics.marketP80AbsoluteErrorPct}% P80 backtest error</small></div>
            <div className="valuation-anchor-grid"><div><span>HPI-adjusted sale</span><b>{currency(selectedProperty.model.anchors.hpiAdjustedSale)}</b><small>{Math.round(selectedProperty.model.weights.hpiAdjustedSale * 100)}% weight · recorded {selectedProperty.saleDate}</small></div><div><span>Calibrated assessment</span><b>{currency(selectedProperty.model.anchors.assessmentCalibrated)}</b><small>{Math.round(selectedProperty.model.weights.assessmentCalibrated * 100)}% weight · {selectedProperty.model.calibrationRatio}× calibration</small></div><div><span>Matched comparable sales</span><b>{currency(selectedProperty.model.anchors.comparablePpsf)}</b><small>{selectedProperty.model.compCount} comps · median {selectedProperty.model.comparableQuality.medianMiles} mi · {selectedProperty.model.comparableQuality.sameTypePct}% same type</small></div></div>
            <dl><div><dt>Recorded sale</dt><dd>{currency(selectedProperty.salePrice)}</dd></div><div><dt>Public assessment</dt><dd>{currency(selectedProperty.assessedValue)}</dd></div><div><dt>Living area</dt><dd>{selectedProperty.sqft?.toLocaleString()} sf</dd></div><div><dt>Year built</dt><dd>{selectedProperty.yearBuilt || "—"}</dd></div><div><dt>Beds / baths</dt><dd>{selectedProperty.beds ?? "—"} / {selectedProperty.baths ?? "—"}</dd></div><div><dt>Cluster edge</dt><dd>{selectedProperty.model.clusterEdgeScore}/100</dd></div></dl>
            <div className="valuation-boundary"><b>What the gap means</b><p>{signed(selectedProperty.model.valuationGapPct)} compares the model center with the jurisdiction’s public assessment. It can flag records for review, but it is not a discount to an asking price. A true acquisition-edge percentage remains locked until a licensed live listing is joined.</p></div>
            <div className="backtest-strip"><div><span>Historical tests</span><b>{selectedProperty.model.diagnostics.marketBacktestSample}</b></div><div><span>Median error</span><b>{selectedProperty.model.diagnostics.marketMedianAbsoluteErrorPct}%</b></div><div><span>P80 error</span><b>{selectedProperty.model.diagnostics.marketP80AbsoluteErrorPct}%</b></div><small>Leakage-controlled rolling origin: every test uses earlier comparable sales and excludes the subject’s current assessment.</small></div>
            <SafetyEvidence key={selectedProperty.id} marketId={selectedProperty.marketId} lat={selectedProperty.lat} lng={selectedProperty.lng} address={selectedProperty.address} locality={selectedProperty.locality} />
            <RentCastEvidence key={`rentcast-${selectedProperty.id}`} address={selectedProperty.address} locality={selectedProperty.locality} />
            <p className="valuation-provenance"><b>{selectedProperty.sourceLabel}:</b> {selectedProperty.qualification}</p>
            <div className="valuation-links"><a className="print-report-link" href={`/report?type=property&id=${encodeURIComponent(selectedProperty.id)}`} target="_blank" rel="noreferrer">Print 2-page property report →</a><a href={selectedProperty.sourceUrl} target="_blank" rel="noreferrer">Open official source →</a><a href={`https://www.google.com/maps/search/?api=1&query=${selectedProperty.lat},${selectedProperty.lng}`} target="_blank" rel="noreferrer">Open in Google Maps →</a><a href={`/api/valuation/properties/${selectedProperty.id}`} target="_blank" rel="noreferrer">Open model JSON →</a></div>
          </article>}
        </div> : <article className="valuation-gap-card"><p className="eyebrow">PRINCIPAL GAP</p><h3>{valuationMarketMeta.label}</h3><p>{valuationMarketMeta.gap}</p><b>The market remains in the neighborhood leaderboard, but property sorting is intentionally disabled until a reusable sale-price source or licensed vendor connection is verified.</b></article>}
        <div className="provider-heading"><div><p className="eyebrow">INDEPENDENT CROSS-REFERENCE STACK</p><h3>Agreement matters more than another opaque average.</h3></div><p>Public records establish the factual base. Aggregate market series check direction. Paid AVMs and MLS listings remain separate evidence channels so correlated estimates do not masquerade as independent confirmation.</p></div>
        <div className="provider-grid">{propertyValuations.providers.map((provider) => <a key={provider.id} href={provider.url} target="_blank" rel="noreferrer"><span className={`provider-status ${provider.status}`}>{provider.status.replace("-", " ")}</span><b>{provider.name}</b><small>{provider.layer}</small><p>{provider.scope}</p><i>{provider.independence}</i></a>)}</div>
        <AttomConnector />
        <AttomMarketAudit />
        <div className="valuation-method"><span><b>Model center</b>{propertyValuations.methodology.value}</span><span><b>Validation</b>{propertyValuations.methodology.validation}</span><span><b>Uncertainty</b>{propertyValuations.methodology.range}</span><span><b>Sorting</b>{propertyValuations.methodology.watchScore}</span><span><b>Hard boundary</b>{propertyValuations.methodology.boundary}</span></div>
      </section>
      </div>

      <div className={`product-view ${activeView === "portfolio" ? "active" : ""}`} aria-hidden={activeView !== "portfolio"}>
      <PortfolioLab />
      </div>

      <div className={`product-view ${activeView === "coverage" ? "active" : ""}`} aria-hidden={activeView !== "coverage"}>
      <FeatureAvailability onOpenMarket={openAvailableMarket} />
      <section className="compare-section" id="compare">
        <div className="section-title"><div><p className="eyebrow">CROSS-MARKET COMPARISON</p><h2>Same lens.<br />Twenty markets.</h2></div><p>Each market score averages local tract-cluster factors after reliability shrinkage. The same lens is applied everywhere, while weak evidence pulls scores toward neutral instead of creating false precision.</p></div>
        <div className="compare-controls"><div>{(["all", "largest", "fastest"] as const).map((item) => <button key={item} className={cohort === item ? "selected" : ""} onClick={() => setCohort(item)}>{item === "all" ? "All 20" : item === "largest" ? "10 largest" : "10 growth markets"}</button>)}</div><label><span>Minimum competency</span><select value={minimumCompetency} onChange={(event) => setMinimumCompetency(Number(event.target.value))}><option value="0">Show all</option><option value="75">75%+</option><option value="80">80%+</option><option value="85">85%+</option></select></label></div>
        <div className="market-card-grid">{marketRanking.map((item, index) => <button key={item.id} className={item.id === market.id ? "active" : ""} onClick={() => chooseMarket(item.id)}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.metro.short}</b><small>{item.metro.cohort === "largest" ? "Large metro" : "Growth market"} · population {item.metro.growth >= 0 ? "+" : ""}{item.metro.growth.toFixed(2)}% YoY</small></div><strong>{item.score}</strong><div className="market-card-quality"><b>{item.integrated}%</b><small>competency</small></div><i className={item.pricingHistory.yoy < 0 ? "negative" : ""}>HPI {item.pricingHistory.yoy >= 0 ? "+" : ""}{item.pricingHistory.yoy.toFixed(2)}%</i></button>)}</div>
      </section>

      <section className="quality-section" id="quality">
        <div className="section-title"><div><p className="eyebrow">DATA COMPETENCY, NOT FALSE PRECISION</p><h2>What is measured.<br />What is still missing.</h2></div><p>The national layer now combines observed ACS conditions with measured FHFA price history. It does not pretend either source can replace property records.</p></div>
        <div className="quality-grid">
          <article className="quality-now"><span>Measured now</span><h3>Tracts + property evidence</h3><ul><li><b>{LOCAL_PRICING_META.targetTractCount.toLocaleString()}</b> ACS tracts across primary-market counties</li><li><b>{LOCAL_PRICING_META.clusterCount}</b> local clusters with annual FHFA tract history</li><li><b>{propertyValuations.properties.length}</b> qualified property records in three high-intent corridors</li><li>Three independent public-record anchors per property model</li><li>Live half-mile safety lookups for Philadelphia and Cary records; other jurisdictions remain explicit gaps</li></ul></article>
          <article className="quality-gap"><span>Principal gap</span><h3>No national PLUTO equivalent</h3><p>Assessment parcels, deeds, zoning, permits and building attributes live in separate city, county and state systems. IDs, licensing, field meanings and update cycles vary. A high ACS score therefore describes market conditions—not a parcel’s likely future value.</p><div><b>Next integrations</b><small>Parcel geometry → assessment history → qualified sales → zoning capacity → permits and catalysts</small></div></article>
          <article className="quality-access"><span>Access path</span><h3>API key gap mitigated</h3><p>The official Census Data API now requires a key. Until one is added, this build uses Census Reporter’s open-source mirror of the 2020–2024 ACS and joins it to the Census Bureau’s official TIGERweb service.</p><a href="https://api.census.gov/data/key_signup.html" target="_blank" rel="noreferrer">Add a Census API key →</a><a href="https://censusreporter.org/about/" target="_blank" rel="noreferrer">Audit the mirror →</a></article>
        </div>
        <div className="method-ribbon"><span><b>Composite scope</b> Weighted percentile of five nationally comparable factors</span><span><b>Public safety scope</b> Local reported-incident density; separate until cross-market geography and denominator checks pass</span><span><b>Valuation competency</b> Source quality plus observed out-of-time model performance</span><span><b>Still excluded</b> Unlicensed listings, owner data, offer advice and causal inference</span></div>
        <div className="standard-controls">
          <div><p className="eyebrow">MODEL GOVERNANCE CHECK</p><h3>Best-practice aligned screening model—not a covered AVM or appraisal.</h3><p>These controls improve defensibility without overstating the product’s scope. A licensed appraisal, lender-approved valuation and property diligence remain separate.</p></div>
          <ul><li className="live"><b>Qualified official sales</b><span>Live</span><small>Jurisdiction rules and transfer filters are documented.</small></li><li className="live"><b>Geographic + physical comp scoring</b><span>Live · v2</span><small>Distance, type, size, age and recency are explicit.</small></li><li className="live"><b>Time adjustment</b><span>Live</span><small>Observed FHFA history supports sale-date adjustment.</small></li><li className="live"><b>Out-of-time validation</b><span>Live · v2</span><small>No later sale can leak into an earlier historical test.</small></li><li className="live"><b>Empirical uncertainty</b><span>Live · v2</span><small>Ranges reflect market P80 error and anchor disagreement.</small></li><li className="ready"><b>Local incident context</b><span>Partial</span><small>Official half-mile lookups where the property is inside a connected police jurisdiction.</small></li><li className="live"><b>ATTOM vendor validation</b><span>Live · cached</span><small>Core AVM evidence and opt-in underwriting modules remain separate, privacy-reduced signals.</small></li><li className="gap"><b>Active listing truth + national monitoring</b><span>Pending</span><small>Needs licensed listings, broader samples, drift alerts and review.</small></li></ul>
        </div>
        <div className="decision-rules"><b>Operating guidelines</b><span>Do not advance a low-competency record.</span><span>Do not call assessment gap “edge.”</span><span>Require actual price and full basis.</span><span>Pass at least 4 of 5 deal gates with no failure.</span><span>Verify title, condition, leases, insurance, taxes and zoning.</span></div>
      </section>

      <section className="sources" id="sources">
        <div className="section-title"><div><p className="eyebrow">LOCAL PROPERTY DATA PIPELINE</p><h2>Government sources<br />ready for deeper joins.</h2></div><p>The local registry remains the route from market conditions to property-level evidence. These verified endpoints are next in line for tract and parcel aggregation.</p></div>
        <div className="registry-summary"><div><strong>{sourceRegistry.sources.length}</strong><span>verified endpoints</span></div><div><strong>{sourceRegistry.sources.reduce((sum, item) => sum + item.recordCount, 0).toLocaleString()}</strong><span>represented records</span></div><div><strong>{new Set(sourceRegistry.sources.flatMap((item) => item.marketIds)).size}</strong><span>markets with a local connection</span></div><a href="/api/property-data/sources" target="_blank">Open machine-readable registry →</a></div>
        <div className="source-market-filter"><label><span>Available parcel market</span><select value={sourceMarketId} onChange={(event) => setSourceMarketId(event.target.value)}>{connectedSourceMarketIds.map((id) => <option key={id} value={id}>{MARKET_EXPLORERS.find((item) => item.id === id)?.metro.short ?? id}</option>)}</select></label><p>Only markets backed by a verified source appear here. {visibleSources.length} current source{visibleSources.length === 1 ? "" : "s"} support this market.</p></div>
        <div className="source-grid">{visibleSources.map((source) => <a key={source.id} href={source.sourcePage} target="_blank" rel="noreferrer"><b>{source.status} · {source.adapter}</b><h3>{source.name}</h3><p>{source.publisher}. {source.limits[0]}</p><span>{(source.marketRecordCounts[sourceMarketId as keyof typeof source.marketRecordCounts] ?? source.recordCount).toLocaleString()} market records · {source.cadence}</span></a>)}</div>
      </section>
      </div>

      <div className={`product-view ${activeView === "feedback" ? "active" : ""}`} aria-hidden={activeView !== "feedback"}>
        <ReviewFeedback />
      </div>

      <footer><a className="brand" href="#top"><span>BORO</span></a><p>Public-data real estate intelligence · ACS 2020–2024 · FHFA through {PRICING_HISTORY_META.latestPeriod}</p><span>Screening signal · not investment advice</span></footer>
    </main>
  );
}
