"use client";

import { useMemo, useState } from "react";
import { NationalMarketMap } from "./NationalMarketMap";
import { PriceHistoryChart, type PriceChartPoint } from "./PriceHistoryChart";
import { DecisionStudio } from "./DecisionStudio";
import { AttomConnector } from "./AttomConnector";
import { SafetyEvidence } from "./SafetyEvidence";
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

const FACTORS: Array<{ key: keyof FactorWeights; label: string; description: string }> = [
  { key: "demographic", label: "Demographic", description: "Age profile and local population depth" },
  { key: "economic", label: "Economic", description: "Income, unemployment and poverty" },
  { key: "education", label: "Education", description: "Bachelor’s degree attainment" },
  { key: "housing", label: "Housing", description: "Income-to-value, rent capacity and vacancy" },
  { key: "pricing", label: "Price momentum", description: "FHFA YoY, acceleration and multi-year growth" },
];

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

export default function Home() {
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
  const [valuationMarket, setValuationMarket] = useState("chicago");
  const [valuationSort, setValuationSort] = useState<"watch" | "confidence" | "gap" | "value">("watch");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const baseMarket = MARKET_EXPLORERS.find((item) => item.id === selectedMarketId) ?? MARKET_EXPLORERS[0];
  const scoredClusters = useMemo(() => baseMarket.neighborhoods
    .map((cluster) => ({ ...cluster, composite: weightedComposite(cluster, weights) }))
    .sort((a, b) => b.composite - a.composite)
    .map((cluster, index) => ({ ...cluster, rank: index + 1 })), [baseMarket, weights]);
  const market = useMemo(() => ({ ...baseMarket, neighborhoods: scoredClusters }), [baseMarket, scoredClusters]);
  const selectedCluster = scoredClusters.find((item) => item.id === selectedClusterId) ?? scoredClusters[0];
  const visibleClusters = scoredClusters.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const integratedCompetency = Math.round(market.acsCompetency * .5 + market.metro.competency * .25 + market.localPricingCompetency * .25);
  const totalTracts = MARKET_EXPLORERS.reduce((sum, item) => sum + item.tractCount, 0);
  const hasLocalPricing = Boolean(selectedCluster.localPricing);
  const showingLocalPricing = priceScope === "cluster" && hasLocalPricing;
  const displayedPricing = showingLocalPricing ? selectedCluster.localPricing! : market.pricingHistory;
  const latestChartYear = showingLocalPricing ? selectedCluster.localPricing!.latestYear : market.pricingHistory.history.at(-1)!.year;
  const chartPoints = useMemo<PriceChartPoint[]>(() => {
    if (showingLocalPricing) {
      return selectedCluster.localPricing!.history
        .filter((item) => historyRange === "full" || item.year >= latestChartYear - historyRange)
        .map((item) => ({ key: String(item.year), label: String(item.year), index: item.index }));
    }
    return market.pricingHistory.history
      .filter((item) => historyRange === "full" || item.year >= latestChartYear - historyRange)
      .map((item) => ({ key: item.period, label: item.quarter === 1 ? String(item.year) : item.period, index: item.index }));
  }, [showingLocalPricing, selectedCluster.localPricing, historyRange, latestChartYear, market.pricingHistory]);

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

  function chooseMarket(id: string) {
    const next = MARKET_EXPLORERS.find((item) => item.id === id) ?? MARKET_EXPLORERS[0];
    setSelectedMarketId(next.id);
    setSelectedClusterId(next.neighborhoods[0].id);
    setQuery("");
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

  return (
    <main id="top">
      <header className="topbar product-topbar">
        <a className="brand" href="#top" aria-label="Borocast home"><span>BORO</span>CAST</a>
        <span className="product-label">Market intelligence</span>
        <label className="global-market-picker"><span>Market</span><select value={market.id} onChange={(event) => chooseMarket(event.target.value)}>{MARKET_EXPLORERS.map((item) => <option key={item.id} value={item.id}>{item.metro.short}</option>)}</select></label>
        <nav aria-label="Primary navigation"><a href="#overview">Product</a><a href="#workspace">Markets</a><a href="#leaders">Top areas</a><a href="#decision-studio">Decision studio</a><a href="#valuation">Valuation</a><a href="#quality">Quality</a></nav>
        <a className="data-status" href="#quality"><i /> {MARKET_EXPLORERS.length} markets live</a>
      </header>

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
        <div className="section-title"><div><p className="eyebrow">PRODUCT OVERVIEW · FROM SIGNAL TO MEMO</p><h2>One workflow.<br />Five explicit decisions.</h2></div><p>Borocast is an evidence-first screening and underwriting workbench. It helps an investor narrow markets, inspect local fundamentals, challenge a property value, model an actual deal and document why it should advance—or stop.</p></div>
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
            <div><p className="eyebrow">COMPOSITE MIX</p><h3>Weight what matters.</h3><p>Adjust the evidence lens. Scores rerank both local clusters and the cross-market comparison.</p></div>
            {FACTORS.map((factor) => <label key={factor.key}><span><b>{factor.label}</b><i>{weights[factor.key]}%</i></span><small>{factor.description}</small><input type="range" min="0" max="70" value={weights[factor.key]} onChange={(event) => setWeight(factor.key, Number(event.target.value))} /></label>)}
            <div className="weight-total"><span>Normalized automatically</span><b>{Object.values(weights).reduce((sum, value) => sum + value, 0)} raw pts</b></div>
          </aside>

          <div className="map-workspace">
            <div className="map-toolbar">
              <label><span>Search cluster</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Central, north, east…" /></label>
              <div><span>Map layer</span>{(["composite", "demographic", "economic", "education", "housing", "pricing"] as ExplorerLayer[]).map((item) => <button key={item} className={layer === item ? "selected" : ""} onClick={() => setLayer(item)}>{item}</button>)}</div>
            </div>
            <div className="map-stage"><NationalMarketMap market={market} neighborhoods={visibleClusters} layer={layer} selectedId={selectedCluster.id} onSelect={setSelectedClusterId} onPropertySelect={(id) => { const property = propertyValuations.properties.find((item) => item.id === id); if (property) setValuationMarket(property.marketId); setSelectedPropertyId(id); window.location.hash = "valuation"; }} /></div>
          </div>

          <article className="cluster-card">
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
          </article>
        </div>

        <section className="pricing-history-panel" aria-label={`${showingLocalPricing ? selectedCluster.name : market.metro.short} historical home price trend`}>
          <div className="pricing-history-copy"><p className="eyebrow">{showingLocalPricing ? "FHFA TRACT-CLUSTER HPI" : "FHFA METRO BENCHMARK"} · {showingLocalPricing ? selectedCluster.localPricing!.latestYear : market.pricingHistory.latestPeriod}</p><h3>{signed(displayedPricing.yoy)} <span>year over year</span></h3><p>{showingLocalPricing ? `${selectedCluster.name} aggregates observed tract-level annual changes. Latest population coverage is ${selectedCluster.localPricing!.history.at(-1)!.coveragePct}%.` : "Quarterly All-Transactions HPI, not seasonally adjusted. Divided metros use an equal-weight composite."}</p><a href={showingLocalPricing ? LOCAL_PRICING_META.source : PRICING_HISTORY_META.source} target="_blank" rel="noreferrer">Open FHFA source series →</a></div>
          <div className="pricing-history-main">
            <div className="price-chart-controls"><div><span>Geography</span><button className={priceScope === "cluster" ? "selected" : ""} onClick={() => setPriceScope("cluster")} disabled={!hasLocalPricing}>Local cluster</button><button className={priceScope === "metro" || !hasLocalPricing ? "selected" : ""} onClick={() => setPriceScope("metro")}>Metro benchmark</button></div><div><span>History</span>{([5, 10, "full"] as const).map((range) => <button key={range} className={historyRange === range ? "selected" : ""} onClick={() => setHistoryRange(range)}>{range === "full" ? "Full" : `${range}Y`}</button>)}</div></div>
            <PriceHistoryChart points={chartPoints} seriesLabel={showingLocalPricing ? `${selectedCluster.name} annual tract-cluster HPI` : `${market.metro.short} quarterly metro HPI`} />
          </div>
          <div className="pricing-history-metrics"><div><span>Momentum score</span><b>{displayedPricing.momentumScore}</b></div><div><span>3-year CAGR</span><b>{signed(displayedPricing.threeYearCagr)}</b></div><div><span>5-year growth</span><b>{signed(displayedPricing.fiveYearGrowth)}</b></div><div><span>YoY acceleration</span><b className={(displayedPricing.acceleration ?? 0) < 0 ? "negative" : ""}>{signed(displayedPricing.acceleration, " pts")}</b></div></div>
          <small className="pricing-scope">{showingLocalPricing ? `This chart changes with the selected cluster. FHFA tract HPI is developmental; ${selectedCluster.localPricing!.history.at(-1)!.observedTracts} of ${selectedCluster.localPricing!.totalTractCount} tracts support the latest annual change, so the ${selectedCluster.localPricing!.pricingCompetency}% pricing competency should travel with the signal.` : `This is the entire metropolitan benchmark. Switch to Local cluster to see the selected map cluster; ${hasLocalPricing ? "a local series is available here." : "FHFA does not have enough repeat-transaction observations for this cluster."}`}</small>
        </section>

        <div className="cluster-table"><table><thead><tr><th>Rank</th><th>Local tract cluster</th><th>Composite</th><th>Demographic</th><th>Economic</th><th>Education</th><th>Housing</th><th>Pricing</th><th>Data competency</th></tr></thead><tbody>{visibleClusters.map((item) => <tr key={item.id} className={item.id === selectedCluster.id ? "active" : ""} onClick={() => setSelectedClusterId(item.id)}><td>{String(item.rank).padStart(2, "0")}</td><td><strong>{item.name}</strong><small>{item.tractCount} tracts · {compact(item.population)} people</small></td><td><b>{item.composite}</b></td><td>{item.demographic}</td><td>{item.economic}</td><td>{item.education}</td><td>{item.housing}</td><td>{item.pricing}</td><td><span>{item.confidence}%</span></td></tr>)}</tbody></table>{!visibleClusters.length && <p className="empty">No local cluster matches that search.</p>}</div>
      </section>

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
            <a href="#workspace" onClick={() => { chooseMarket(selectedLeader.market.id); setSelectedClusterId(selectedLeader.cluster.id); }}>Open this area in the market workspace →</a>
          </article>
        </div>
        <p className="leaders-note">Ranking basis: weighted composite under the active lens, with competency used only as a tie-breaker. This is a screening leaderboard, not a forecast of future returns.</p>
      </section>

      <DecisionStudio />

      <section className="valuation-section" id="valuation">
        <div className="section-title"><div><p className="eyebrow">PROPERTY VALUATION LAB · MODEL V2</p><h2>Cross-check the property.<br />Keep the uncertainty.</h2></div><p>Qualified recorded sales, local assessments, building facts and FHFA tract-cluster history now resolve to individual properties in three high-intent corridors. Version 2 prevents future-sale leakage, scores comparables by geography and physical similarity, and derives the range from observed backtest error.</p></div>
        <div className="valuation-readiness">
          {propertyValuations.markets.map((item) => <button key={item.id} className={valuationMarket === item.id ? "active" : ""} onClick={() => { setValuationMarket(item.id); setSelectedPropertyId(null); }}><span>{item.status === "live" ? "LIVE · VALIDATED" : "DATA GAP"}</span><b>{item.label}</b><i>{item.competency}% integrated competency</i><small>{item.status === "live" && "sourceCompetency" in item ? `${item.sourceCompetency}% source · ${item.modelCompetency}% model · ${item.diagnostics.sampleSize} historical tests` : item.gap}</small></button>)}
        </div>
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
            <div className="backtest-strip"><div><span>Historical tests</span><b>{selectedProperty.model.diagnostics.marketBacktestSample}</b></div><div><span>Median error</span><b>{selectedProperty.model.diagnostics.marketMedianAbsoluteErrorPct}%</b></div><div><span>P80 error</span><b>{selectedProperty.model.diagnostics.marketP80AbsoluteErrorPct}%</b></div><small>Out-of-time: each test sale uses only information available before that transaction.</small></div>
            <SafetyEvidence key={selectedProperty.id} marketId={selectedProperty.marketId} lat={selectedProperty.lat} lng={selectedProperty.lng} address={selectedProperty.address} locality={selectedProperty.locality} />
            <p className="valuation-provenance"><b>{selectedProperty.sourceLabel}:</b> {selectedProperty.qualification}</p>
            <div className="valuation-links"><a href={selectedProperty.sourceUrl} target="_blank" rel="noreferrer">Open official source →</a><a href={`https://www.google.com/maps/search/?api=1&query=${selectedProperty.lat},${selectedProperty.lng}`} target="_blank" rel="noreferrer">Open in Google Maps →</a><a href={`/api/valuation/properties/${selectedProperty.id}`} target="_blank" rel="noreferrer">Open model JSON →</a></div>
          </article>}
        </div> : <article className="valuation-gap-card"><p className="eyebrow">PRINCIPAL GAP</p><h3>{valuationMarketMeta.label}</h3><p>{valuationMarketMeta.gap}</p><b>The market remains in the neighborhood leaderboard, but property sorting is intentionally disabled until a reusable sale-price source or licensed vendor connection is verified.</b></article>}
        <div className="provider-heading"><div><p className="eyebrow">INDEPENDENT CROSS-REFERENCE STACK</p><h3>Agreement matters more than another opaque average.</h3></div><p>Public records establish the factual base. Aggregate market series check direction. Paid AVMs and MLS listings remain separate evidence channels so correlated estimates do not masquerade as independent confirmation.</p></div>
        <div className="provider-grid">{propertyValuations.providers.map((provider) => <a key={provider.id} href={provider.url} target="_blank" rel="noreferrer"><span className={`provider-status ${provider.status}`}>{provider.status.replace("-", " ")}</span><b>{provider.name}</b><small>{provider.layer}</small><p>{provider.scope}</p><i>{provider.independence}</i></a>)}</div>
        <AttomConnector />
        <div className="valuation-method"><span><b>Model center</b>{propertyValuations.methodology.value}</span><span><b>Validation</b>{propertyValuations.methodology.validation}</span><span><b>Uncertainty</b>{propertyValuations.methodology.range}</span><span><b>Sorting</b>{propertyValuations.methodology.watchScore}</span><span><b>Hard boundary</b>{propertyValuations.methodology.boundary}</span></div>
      </section>

      <section className="compare-section" id="compare">
        <div className="section-title"><div><p className="eyebrow">CROSS-MARKET COMPARISON</p><h2>Same lens.<br />Twenty markets.</h2></div><p>Each market score is the average of its local tract-cluster scores under your current factor mix. This makes the ranking comparable while keeping parcel confidence visible instead of blending missing evidence into the signal.</p></div>
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
          <ul><li className="live"><b>Qualified official sales</b><span>Live</span><small>Jurisdiction rules and transfer filters are documented.</small></li><li className="live"><b>Geographic + physical comp scoring</b><span>Live · v2</span><small>Distance, type, size, age and recency are explicit.</small></li><li className="live"><b>Time adjustment</b><span>Live</span><small>Observed FHFA history supports sale-date adjustment.</small></li><li className="live"><b>Out-of-time validation</b><span>Live · v2</span><small>No later sale can leak into an earlier historical test.</small></li><li className="live"><b>Empirical uncertainty</b><span>Live · v2</span><small>Ranges reflect market P80 error and anchor disagreement.</small></li><li className="ready"><b>Local incident context</b><span>Partial</span><small>Official half-mile lookups where the property is inside a connected police jurisdiction.</small></li><li className="ready"><b>ATTOM vendor validation</b><span>Adapter ready</span><small>Independent AVM stays visible as a separate signal.</small></li><li className="gap"><b>Active listing truth + national monitoring</b><span>Pending</span><small>Needs licensed listings, broader samples, drift alerts and review.</small></li></ul>
        </div>
        <div className="decision-rules"><b>Operating guidelines</b><span>Do not advance a low-competency record.</span><span>Do not call assessment gap “edge.”</span><span>Require actual price and full basis.</span><span>Pass at least 4 of 5 deal gates with no failure.</span><span>Verify title, condition, leases, insurance, taxes and zoning.</span></div>
      </section>

      <section className="sources" id="sources">
        <div className="section-title"><div><p className="eyebrow">LOCAL PROPERTY DATA PIPELINE</p><h2>Government sources<br />ready for deeper joins.</h2></div><p>The local registry remains the route from market conditions to property-level evidence. These verified endpoints are next in line for tract and parcel aggregation.</p></div>
        <div className="registry-summary"><div><strong>{sourceRegistry.sources.length}</strong><span>verified endpoints</span></div><div><strong>{sourceRegistry.sources.reduce((sum, item) => sum + item.recordCount, 0).toLocaleString()}</strong><span>represented records</span></div><div><strong>{new Set(sourceRegistry.sources.flatMap((item) => item.marketIds)).size}</strong><span>markets with a local connection</span></div><a href="/api/property-data/sources" target="_blank">Open machine-readable registry →</a></div>
        <div className="source-grid">{sourceRegistry.sources.slice(0, 9).map((source) => <a key={source.id} href={source.sourcePage} target="_blank" rel="noreferrer"><b>{source.status} · {source.adapter}</b><h3>{source.name}</h3><p>{source.publisher}. {source.limits[0]}</p><span>{source.recordCount.toLocaleString()} records · {source.cadence}</span></a>)}</div>
      </section>

      <footer><a className="brand" href="#top"><span>BORO</span>CAST</a><p>Public-data market intelligence · ACS 2020–2024 · FHFA through {PRICING_HISTORY_META.latestPeriod}</p><span>Screening signal · not investment advice</span></footer>
    </main>
  );
}
