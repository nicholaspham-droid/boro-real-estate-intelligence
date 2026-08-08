"use client";

import { useMemo, useState } from "react";
import { NationalMarketMap } from "./NationalMarketMap";
import {
  ACS_AGGREGATION_META,
  BALANCED_WEIGHTS,
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

  const baseMarket = MARKET_EXPLORERS.find((item) => item.id === selectedMarketId) ?? MARKET_EXPLORERS[0];
  const scoredClusters = useMemo(() => baseMarket.neighborhoods
    .map((cluster) => ({ ...cluster, composite: weightedComposite(cluster, weights) }))
    .sort((a, b) => b.composite - a.composite)
    .map((cluster, index) => ({ ...cluster, rank: index + 1 })), [baseMarket, weights]);
  const market = useMemo(() => ({ ...baseMarket, neighborhoods: scoredClusters }), [baseMarket, scoredClusters]);
  const selectedCluster = scoredClusters.find((item) => item.id === selectedClusterId) ?? scoredClusters[0];
  const visibleClusters = scoredClusters.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const integratedCompetency = Math.round(market.acsCompetency * .55 + market.metro.competency * .25 + market.pricingHistory.pricingCompetency * .2);
  const totalTracts = MARKET_EXPLORERS.reduce((sum, item) => sum + item.tractCount, 0);
  const recentPriceHistory = market.pricingHistory.history.slice(-20);
  const priceFloor = Math.min(...recentPriceHistory.map((item) => item.index));
  const priceCeiling = Math.max(...recentPriceHistory.map((item) => item.index));

  const marketRanking = useMemo(() => MARKET_EXPLORERS
    .filter((item) => cohort === "all" || item.metro.cohort === cohort)
    .filter((item) => Math.round(item.acsCompetency * .55 + item.metro.competency * .25 + item.pricingHistory.pricingCompetency * .2) >= minimumCompetency)
    .map((item) => ({ ...item, score: scoreMarket(item, weights), integrated: Math.round(item.acsCompetency * .55 + item.metro.competency * .25 + item.pricingHistory.pricingCompetency * .2) }))
    .sort((a, b) => b.score - a.score), [cohort, minimumCompetency, weights]);

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
        <nav aria-label="Primary navigation"><a href="#workspace">Workspace</a><a href="#compare">Compare</a><a href="#quality">Data quality</a><a href="#sources">Sources</a></nav>
        <a className="data-status" href="#quality"><i /> {MARKET_EXPLORERS.length} markets live</a>
      </header>

      <section className="product-hero">
        <div className="hero-copy">
          <p className="eyebrow">NATIONAL PUBLIC-DATA MARKET WORKBENCH</p>
          <h1>Find the edge<br />inside the <em>evidence.</em></h1>
          <p className="lede">Compare demographic, economic, educational, housing and historical price momentum across U.S. markets, then move into reproducible local tract clusters. The score is an evidence-ranking tool—not a property appraisal or forecast.</p>
          <div className="hero-actions"><a href="#workspace">Open market workspace</a><a href="#quality">Audit the data</a></div>
        </div>
        <div className="hero-proof">
          <p>PUBLIC DATA FOUNDATION</p>
          <strong>{totalTracts.toLocaleString()}</strong><span>ACS tracts aggregated</span>
          <div><b>{MARKET_EXPLORERS.length}</b><span>markets</span><b>{ACS_AGGREGATION_META.clusterCount}</b><span>local clusters</span><b>{PRICING_HISTORY_META.latestPeriod}</b><span>FHFA pricing</span></div>
          <small>Current attributes from ACS detailed tables. Historical pricing from FHFA HPI. Local parcel systems remain scored separately.</small>
        </div>
      </section>

      <section className="market-command" id="workspace">
        <div className="command-title">
          <div><p className="eyebrow">SELECTED MARKET</p><h2>{market.metro.short}<br /><em>evidence workspace.</em></h2><p>{market.metro.name}</p></div>
          <div className="quality-stack">
            <article><span>ACS competency</span><strong>{market.acsCompetency}%</strong><small>{market.tractCount.toLocaleString()} tracts · {market.countyCount} primary counties</small></article>
            <article><span>Parcel competency</span><strong>{market.metro.competency}%</strong><small>{market.metro.localStatus} · ±{market.metro.evidenceBand} operational points</small></article>
            <article><span>Pricing competency</span><strong>{market.pricingHistory.pricingCompetency}%</strong><small>FHFA {market.pricingHistory.latestPeriod} · {market.pricingHistory.components.length} metro series</small></article>
            <article className="integrated"><span>Integrated</span><strong>{integratedCompetency}% <i>{competencyGrade(integratedCompetency)}</i></strong><small>55% ACS · 25% parcels · 20% pricing</small></article>
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
            <div className="map-stage"><NationalMarketMap market={market} neighborhoods={visibleClusters} layer={layer} selectedId={selectedCluster.id} onSelect={setSelectedClusterId} /></div>
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

        <section className="pricing-history-panel" aria-label={`${market.metro.short} historical home price trend`}>
          <div className="pricing-history-copy"><p className="eyebrow">FHFA HOUSE PRICE MOMENTUM · {market.pricingHistory.latestPeriod}</p><h3>{market.pricingHistory.yoy >= 0 ? "+" : ""}{market.pricingHistory.yoy.toFixed(2)}% <span>year over year</span></h3><p>All-Transactions HPI, not seasonally adjusted. Divided metros use an equal-weight composite of the listed FHFA divisions.</p><a href={PRICING_HISTORY_META.source} target="_blank" rel="noreferrer">Open FHFA source series →</a></div>
          <div className="pricing-history-metrics"><div><span>Momentum score</span><b>{market.pricingHistory.momentumScore}</b></div><div><span>3-year CAGR</span><b>{market.pricingHistory.threeYearCagr >= 0 ? "+" : ""}{market.pricingHistory.threeYearCagr.toFixed(2)}%</b></div><div><span>5-year growth</span><b>{market.pricingHistory.fiveYearGrowth >= 0 ? "+" : ""}{market.pricingHistory.fiveYearGrowth.toFixed(2)}%</b></div><div><span>YoY acceleration</span><b className={market.pricingHistory.acceleration < 0 ? "negative" : ""}>{market.pricingHistory.acceleration >= 0 ? "+" : ""}{market.pricingHistory.acceleration.toFixed(2)} pts</b></div></div>
          <div className="price-bars" role="img" aria-label={`Quarterly FHFA HPI history from ${recentPriceHistory[0]?.period} through ${market.pricingHistory.latestPeriod}`}>{recentPriceHistory.map((item) => <i key={item.period} style={{ height: `${18 + ((item.index - priceFloor) / Math.max(1, priceCeiling - priceFloor)) * 82}%` }} title={`${item.period}: ${item.index.toFixed(2)}`}><span>{item.quarter === 1 ? String(item.year).slice(-2) : ""}</span></i>)}</div>
          <small className="pricing-scope">Metro pricing context is applied equally to each local tract cluster. It improves market momentum ranking but does not claim neighborhood-level price appreciation.</small>
        </section>

        <div className="cluster-table"><table><thead><tr><th>Rank</th><th>Local tract cluster</th><th>Composite</th><th>Demographic</th><th>Economic</th><th>Education</th><th>Housing</th><th>Pricing</th><th>Data competency</th></tr></thead><tbody>{visibleClusters.map((item) => <tr key={item.id} className={item.id === selectedCluster.id ? "active" : ""} onClick={() => setSelectedClusterId(item.id)}><td>{String(item.rank).padStart(2, "0")}</td><td><strong>{item.name}</strong><small>{item.tractCount} tracts · {compact(item.population)} people</small></td><td><b>{item.composite}</b></td><td>{item.demographic}</td><td>{item.economic}</td><td>{item.education}</td><td>{item.housing}</td><td>{item.pricing}</td><td><span>{item.confidence}%</span></td></tr>)}</tbody></table>{!visibleClusters.length && <p className="empty">No local cluster matches that search.</p>}</div>
      </section>

      <section className="compare-section" id="compare">
        <div className="section-title"><div><p className="eyebrow">CROSS-MARKET COMPARISON</p><h2>Same lens.<br />Twenty markets.</h2></div><p>Each market score is the average of its local tract-cluster scores under your current factor mix. This makes the ranking comparable while keeping parcel confidence visible instead of blending missing evidence into the signal.</p></div>
        <div className="compare-controls"><div>{(["all", "largest", "fastest"] as const).map((item) => <button key={item} className={cohort === item ? "selected" : ""} onClick={() => setCohort(item)}>{item === "all" ? "All 20" : item === "largest" ? "10 largest" : "10 growth markets"}</button>)}</div><label><span>Minimum competency</span><select value={minimumCompetency} onChange={(event) => setMinimumCompetency(Number(event.target.value))}><option value="0">Show all</option><option value="75">75%+</option><option value="80">80%+</option><option value="85">85%+</option></select></label></div>
        <div className="market-card-grid">{marketRanking.map((item, index) => <button key={item.id} className={item.id === market.id ? "active" : ""} onClick={() => chooseMarket(item.id)}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.metro.short}</b><small>{item.metro.cohort === "largest" ? "Large metro" : "Growth market"} · population {item.metro.growth >= 0 ? "+" : ""}{item.metro.growth.toFixed(2)}% YoY</small></div><strong>{item.score}</strong><div className="market-card-quality"><b>{item.integrated}%</b><small>competency</small></div><i className={item.pricingHistory.yoy < 0 ? "negative" : ""}>HPI {item.pricingHistory.yoy >= 0 ? "+" : ""}{item.pricingHistory.yoy.toFixed(2)}%</i></button>)}</div>
      </section>

      <section className="quality-section" id="quality">
        <div className="section-title"><div><p className="eyebrow">DATA COMPETENCY, NOT FALSE PRECISION</p><h2>What is measured.<br />What is still missing.</h2></div><p>The national layer now combines observed ACS conditions with measured FHFA price history. It does not pretend either source can replace property records.</p></div>
        <div className="quality-grid">
          <article className="quality-now"><span>Measured now</span><h3>Tracts + price history</h3><ul><li><b>17,959</b> ACS tracts across primary-market counties</li><li><b>97</b> reproducible local clusters positioned with official TIGER geometry</li><li><b>20</b> quarterly FHFA market histories with true same-quarter YoY growth</li><li>ACS, FHFA and parcel competency remain separately visible</li></ul></article>
          <article className="quality-gap"><span>Principal gap</span><h3>No national PLUTO equivalent</h3><p>Assessment parcels, deeds, zoning, permits and building attributes live in separate city, county and state systems. IDs, licensing, field meanings and update cycles vary. A high ACS score therefore describes market conditions—not a parcel’s likely future value.</p><div><b>Next integrations</b><small>Parcel geometry → assessment history → qualified sales → zoning capacity → permits and catalysts</small></div></article>
          <article className="quality-access"><span>Access path</span><h3>API key gap mitigated</h3><p>The official Census Data API now requires a key. Until one is added, this build uses Census Reporter’s open-source mirror of the 2020–2024 ACS and joins it to the Census Bureau’s official TIGERweb service.</p><a href="https://api.census.gov/data/key_signup.html" target="_blank" rel="noreferrer">Add a Census API key →</a><a href="https://censusreporter.org/about/" target="_blank" rel="noreferrer">Audit the mirror →</a></article>
        </div>
        <div className="method-ribbon"><span><b>Composite scope</b> Weighted percentile of five selectable factors</span><span><b>Pricing momentum</b> 50% YoY, 25% 3Y CAGR, 15% 5Y growth, 10% acceleration</span><span><b>Reliability</b> ACS margins of error plus FHFA standard error and division coverage</span><span><b>Not included yet</b> Neighborhood appreciation history, parcel liquidity or causal inference</span></div>
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
