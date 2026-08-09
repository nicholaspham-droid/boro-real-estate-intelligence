import { notFound } from "next/navigation";
import Link from "next/link";
import propertyValuations from "../../data/property-valuations.json";
import {
  ACS_AGGREGATION_META,
  BALANCED_WEIGHTS,
  LOCAL_PRICING_META,
  MARKET_EXPLORERS,
  type FactorWeights,
  weightedComposite,
} from "../marketNeighborhoods";
import { PrintReportButton } from "./PrintReportButton";

type ReportParams = Record<string, string | string[] | undefined>;
type Area = (typeof MARKET_EXPLORERS)[number]["neighborhoods"][number];
type Market = (typeof MARKET_EXPLORERS)[number];
type Property = (typeof propertyValuations.properties)[number];

const FACTORS: Array<{ key: keyof FactorWeights; label: string; meaning: string }> = [
  { key: "demographic", label: "Demographic", meaning: "Age profile and population depth" },
  { key: "economic", label: "Economic", meaning: "Income, unemployment and poverty" },
  { key: "education", label: "Education", meaning: "Bachelor’s degree attainment" },
  { key: "housing", label: "Housing", meaning: "Income-to-value, rent capacity and vacancy" },
  { key: "pricing", label: "Price momentum", meaning: "FHFA YoY, acceleration and multi-year growth" },
];

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseWeights(params: ReportParams): FactorWeights {
  const parsed = { ...BALANCED_WEIGHTS };
  for (const factor of FACTORS) {
    const value = Number(one(params[factor.key]));
    if (Number.isFinite(value) && value >= 0 && value <= 100) parsed[factor.key] = value;
  }
  return parsed;
}

function money(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function pct(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function plainPct(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : `${value.toFixed(digits)}%`;
}

function scoreCall(score: number) {
  if (score >= 75) return { label: "Prioritize for diligence", detail: "The signal is strong relative to the current comparison set. Verify parcel, price, zoning and operating facts next." };
  if (score >= 65) return { label: "Advance with conditions", detail: "The evidence clears the screening bar, but the weaker factors and source limits should become explicit diligence questions." };
  if (score >= 55) return { label: "Watch, do not conclude", detail: "The profile is mixed. Preserve it as a comparison candidate until stronger local or property evidence arrives." };
  return { label: "Defer under this lens", detail: "The current evidence mix ranks below stronger alternatives. Revisit only if price or thesis-specific facts change." };
}

function PageFooter({ page, asOf }: { page: number; asOf: string }) {
  return <footer className="report-footer"><span>BORO · EVIDENCE-FIRST REAL ESTATE INTELLIGENCE</span><span>Data as of {asOf}</span><b>PAGE {page} OF 2</b></footer>;
}

function ReportShell({ children, title }: { children: React.ReactNode; title: string }) {
  return <main className="report-shell"><div className="report-actions"><Link href="/">← Back to BORO</Link><span>{title}</span><PrintReportButton /></div>{children}</main>;
}

function AreaReport({ market, area, weights }: { market: Market; area: Area; weights: FactorWeights }) {
  const score = weightedComposite(area, weights);
  const ranking = market.neighborhoods
    .map((item) => ({ id: item.id, score: weightedComposite(item, weights) }))
    .sort((a, b) => b.score - a.score);
  const rank = ranking.findIndex((item) => item.id === area.id) + 1;
  const call = scoreCall(score);
  const pricing = area.localPricing;
  const latest = pricing?.history.at(-1);
  const factorOrder = FACTORS.map((factor) => ({ ...factor, score: area[factor.key], weight: weights[factor.key] })).sort((a, b) => b.score - a.score);
  const weightsTotal = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  const asOf = `${ACS_AGGREGATION_META.vintage} ACS / ${pricing?.latestYear ?? LOCAL_PRICING_META.latestYear} FHFA`;

  return <ReportShell title={`${area.name} area report`}>
    <section className="report-page">
      <header className="report-header"><div><span>AREA ANALYTICAL REPORT</span><b>BORO</b></div><p>Screening memorandum · reproducible factor lens</p></header>
      <div className="report-title"><div><p>{market.metro.short} · {area.tractCount} census tracts</p><h1>{area.name}</h1><span>{area.population.toLocaleString()} residents · ACS coverage {plainPct(area.coverage, 0)}</span></div><div className="report-score"><strong>{score}</strong><span>EDGE SCORE / 100</span></div></div>
      <div className="report-call"><span>SCREENING CONCLUSION</span><h2>{call.label}</h2><p>{call.detail}</p></div>
      <div className="report-metrics">
        <article><span>Local rank</span><b>#{rank} of {market.neighborhoods.length}</b><small>Within {market.metro.short}</small></article>
        <article><span>Evidence competency</span><b>{area.confidence}%</b><small>Integrated source quality</small></article>
        <article><span>FHFA YoY</span><b>{pct(pricing?.yoy)}</b><small>{pricing ? "Local tract aggregate" : "Local series unavailable"}</small></article>
        <article><span>Five-year HPI</span><b>{pct(pricing?.fiveYearGrowth)}</b><small>{pricing?.pricingCompetency ?? 0}% pricing competency</small></article>
      </div>
      <div className="report-grid report-grid-wide">
        <div className="report-panel"><div className="report-panel-head"><span>01 · SCORE BREAKDOWN</span><b>What drives the rank</b></div>
          <div className="report-factor-list">{FACTORS.map((factor) => <div key={factor.key}><span>{factor.label}<small>{weights[factor.key]}% weight</small></span><i><b style={{ width: `${area[factor.key]}%` }} /></i><strong>{area[factor.key]}</strong></div>)}</div>
          <p className="report-formula">Composite = Σ(factor score × active weight) ÷ {weightsTotal}. Weights are normalized automatically; competency is displayed separately and is not used to inflate the score.</p>
        </div>
        <div className="report-panel"><div className="report-panel-head"><span>02 · LOCAL CONDITIONS</span><b>Underlying ACS observations</b></div>
          <dl className="report-data-list"><div><dt>Median household income</dt><dd>{money(area.medianIncome)}</dd></div><div><dt>Bachelor’s degree+</dt><dd>{plainPct(area.bachelorsPct)}</dd></div><div><dt>Unemployment</dt><dd>{plainPct(area.unemploymentPct)}</dd></div><div><dt>Poverty</dt><dd>{plainPct(area.povertyPct)}</dd></div><div><dt>Median home value</dt><dd>{money(area.medianHomeValue)}</dd></div><div><dt>Median gross rent</dt><dd>{money(area.medianRent)}</dd></div><div><dt>Vacancy</dt><dd>{plainPct(area.vacancyPct)}</dd></div><div><dt>Median age</dt><dd>{area.medianAge?.toFixed(1) ?? "—"}</dd></div></dl>
        </div>
      </div>
      <div className="report-insight"><span>INTERPRETATION</span><p><b>{factorOrder[0].label} ({factorOrder[0].score}/100)</b> is the strongest observed factor; <b>{factorOrder.at(-1)!.label.toLowerCase()} ({factorOrder.at(-1)!.score}/100)</b> is the primary counter-signal. The area score ranks evidence under the chosen lens—it does not estimate a future property value or return.</p></div>
      <PageFooter page={1} asOf={asOf} />
    </section>

    <section className="report-page">
      <header className="report-header"><div><span>METHOD + UNDERLYING DATA</span><b>BORO</b></div><p>{area.name} · analytical audit trail</p></header>
      <div className="report-section-title"><span>REPRODUCIBLE PROCESS</span><h2>How this signal was built.</h2><p>The report preserves the geography, source vintage, transformations, score weights and uncertainty needed to reproduce or challenge the result.</p></div>
      <div className="report-process">
        <article><span>01</span><b>Define geography</b><p>Primary-county Census tracts are assigned to five directional clusters using a reproducible spatial rule.</p></article>
        <article><span>02</span><b>Join observations</b><p>ACS conditions are joined to FHFA developmental tract HPI using exact tract identifiers.</p></article>
        <article><span>03</span><b>Normalize</b><p>Each factor is expressed as a cross-sectional 0–100 percentile for comparable screening.</p></article>
        <article><span>04</span><b>Weight + rank</b><p>The active lens produces a weighted composite; competency remains a separate evidence control.</p></article>
        <article><span>05</span><b>Gate the decision</b><p>A candidate advances only after parcel, asking-price, zoning, permit and operating facts are verified.</p></article>
      </div>
      <table className="report-table"><thead><tr><th>Evidence layer</th><th>Underlying data</th><th>Transformation used here</th><th>Coverage / quality</th></tr></thead><tbody>
        <tr><td><b>Current conditions</b><small>Census Reporter mirror of Census ACS</small></td><td>2020–2024 ACS 5-year detailed tables {ACS_AGGREGATION_META.tables.join(", ")}</td><td>Tract observations aggregated into {area.name}; factor percentiles computed across the product comparison set.</td><td>{area.tractCount} tracts · {plainPct(area.coverage, 0)} coverage · {area.reliability}% reliability</td></tr>
        <tr><td><b>Tract geometry</b><small>U.S. Census Bureau</small></td><td>TIGERweb ACS 2024 Census Tracts</td><td>Exact tract identifiers assign records to the directional cluster and support map boundaries.</td><td>{area.sampleGeoids.length} sample GEOIDs retained for audit</td></tr>
        <tr><td><b>Historical pricing</b><small>Federal Housing Finance Agency</small></td><td>Annual Census Tract HPI, developmental and not seasonally adjusted</td><td>Population-weighted observed tract changes are chained into a local index; momentum blends YoY, 3Y, 5Y and acceleration.</td><td>{pricing && latest ? `${latest.observedTracts} / ${pricing.totalTractCount} tracts · ${latest.coveragePct}% latest population coverage` : "No qualified local series; price evidence is limited"}</td></tr>
      </tbody></table>
      <div className="report-grid">
        <div className="report-panel"><div className="report-panel-head"><span>ACTIVE MODEL CONFIGURATION</span><b>Weights + contribution logic</b></div><ul className="report-bullets">{FACTORS.map((factor) => <li key={factor.key}><b>{factor.label}: {weights[factor.key]}%</b><span>{factor.meaning}; observed score {area[factor.key]}/100.</span></li>)}</ul></div>
        <div className="report-panel"><div className="report-panel-head"><span>UNCERTAINTY + LIMITS</span><b>What the score cannot establish</b></div><ul className="report-bullets"><li><b>Competency is {area.confidence}%.</b><span>It describes evidence readiness, not a confidence interval for profit.</span></li><li><b>FHFA coverage varies.</b><span>Repeat-mortgage indexes omit transactions and properties that cannot support a series.</span></li><li><b>ACS is a multi-year estimate.</b><span>Sampling error and aggregation can conceal block- or parcel-level variation.</span></li><li><b>No asking price is present.</b><span>Acquisition edge cannot be calculated from area data alone.</span></li></ul></div>
      </div>
      <div className="report-gates"><span>NEXT DILIGENCE GATES</span><ol><li>Verify parcel identity, assessment and recorded sale history.</li><li>Join a current asking price or licensed listing.</li><li>Review zoning capacity, permits, taxes and insurance.</li><li>Build property-specific rent and expense assumptions.</li><li>Reject the thesis if price, evidence or cash-flow gates fail.</li></ol></div>
      <p className="report-disclaimer">Screening analysis only. Not an appraisal, forecast, offer recommendation, investment advice or claim of causal impact.</p>
      <PageFooter page={2} asOf={asOf} />
    </section>
  </ReportShell>;
}

function PropertyReport({ property }: { property: Property }) {
  const model = property.model;
  const market = propertyValuations.markets.find((item) => item.id === property.marketId);
  const call = scoreCall(model.watchScore);
  const asOf = propertyValuations.generatedAt.slice(0, 10);
  const gapDirection = model.valuationGapPct >= 0 ? "above" : "below";

  return <ReportShell title={`${property.address} property report`}>
    <section className="report-page">
      <header className="report-header"><div><span>PROPERTY ANALYTICAL REPORT</span><b>BORO</b></div><p>Public-record valuation screen · model v2.0</p></header>
      <div className="report-title"><div><p>{property.clusterName} · {property.propertyType}</p><h1>{property.address}</h1><span>{property.locality} · Parcel {property.parcelId}</span></div><div className="report-score"><strong>{model.watchScore}</strong><span>WATCH SCORE / 100</span></div></div>
      <div className="report-call"><span>SCREENING CONCLUSION</span><h2>{call.label}</h2><p>{call.detail} This is a public-record priority score, not a buy recommendation.</p></div>
      <div className="report-metrics">
        <article><span>Model center</span><b>{money(model.value)}</b><small>{money(model.low)}–{money(model.high)}</small></article>
        <article><span>Evidence quality</span><b>{model.confidence}%</b><small>{market?.competency ?? "—"}% market competency</small></article>
        <article><span>Assessment gap</span><b>{pct(model.valuationGapPct)}</b><small>Model center {gapDirection} assessment</small></article>
        <article><span>Backtest P80 error</span><b>{plainPct(model.diagnostics.marketP80AbsoluteErrorPct)}</b><small>{model.diagnostics.marketBacktestSample} out-of-time tests</small></article>
      </div>
      <div className="report-panel report-anchor-panel"><div className="report-panel-head"><span>01 · VALUE CONSTRUCTION</span><b>Three independently visible anchors</b></div><div className="report-anchor-grid">
        <article><span>HPI-adjusted prior sale</span><b>{money(model.anchors.hpiAdjustedSale)}</b><small>{Math.round(model.weights.hpiAdjustedSale * 100)}% weight · recorded {property.saleDate}</small></article>
        <article><span>Locally calibrated assessment</span><b>{money(model.anchors.assessmentCalibrated)}</b><small>{Math.round(model.weights.assessmentCalibrated * 100)}% weight · {model.calibrationRatio}× ratio</small></article>
        <article><span>Matched comparable sales</span><b>{money(model.anchors.comparablePpsf)}</b><small>{Math.round(model.weights.comparableSales * 100)}% weight · {model.compCount} comps</small></article>
      </div><p className="report-formula">Model center = weighted anchor blend. Range = the largest of observed market P80 error, anchor disagreement, or an evidence-quality penalty.</p></div>
      <div className="report-grid">
        <div className="report-panel"><div className="report-panel-head"><span>02 · SUBJECT FACTS</span><b>Recorded property inputs</b></div><dl className="report-data-list"><div><dt>Recorded sale</dt><dd>{money(property.salePrice)}</dd></div><div><dt>Public assessment</dt><dd>{money(property.assessedValue)}</dd></div><div><dt>Living area</dt><dd>{property.sqft?.toLocaleString() ?? "—"} sf</dd></div><div><dt>Lot area</dt><dd>{property.lotSqft?.toLocaleString() ?? "—"} sf</dd></div><div><dt>Year built</dt><dd>{property.yearBuilt ?? "—"}</dd></div><div><dt>Beds / baths</dt><dd>{property.beds ?? "—"} / {property.baths ?? "—"}</dd></div></dl></div>
        <div className="report-panel"><div className="report-panel-head"><span>03 · COMPARABLE QUALITY</span><b>Similarity + geography</b></div><dl className="report-data-list"><div><dt>Comparable count</dt><dd>{model.compCount}</dd></div><div><dt>Nearest comp</dt><dd>{model.comparableQuality.nearestMiles} mi</dd></div><div><dt>Median comp distance</dt><dd>{model.comparableQuality.medianMiles} mi</dd></div><div><dt>Same property type</dt><dd>{plainPct(model.comparableQuality.sameTypePct, 0)}</dd></div><div><dt>Comparable $/sf</dt><dd>{money(model.comparablePpsf)}</dd></div><div><dt>Cluster edge signal</dt><dd>{model.clusterEdgeScore}/100</dd></div></dl></div>
      </div>
      <div className="report-insight warning"><span>HARD BOUNDARY</span><p><b>{pct(model.valuationGapPct)} is not an acquisition discount.</b> It compares the model center with a jurisdictional assessment. A current asking price or licensed active listing must be joined before BORO can calculate a true price edge.</p></div>
      <PageFooter page={1} asOf={asOf} />
    </section>

    <section className="report-page">
      <header className="report-header"><div><span>METHOD + UNDERLYING DATA</span><b>BORO</b></div><p>{property.address} · analytical audit trail</p></header>
      <div className="report-section-title"><span>REPRODUCIBLE PROCESS</span><h2>How this value screen was built.</h2><p>The model keeps recorded facts, derived anchors, validation statistics and missing acquisition inputs separate so disagreement remains visible.</p></div>
      <div className="report-process">
        <article><span>01</span><b>Qualify record</b><p>Apply jurisdiction-specific deed, use, price and assessment filters; exclude owner and mailing fields.</p></article>
        <article><span>02</span><b>Build anchors</b><p>Adjust the prior sale, calibrate the assessment and match earlier comparable sales.</p></article>
        <article><span>03</span><b>Blend value</b><p>Combine the three visible anchors using the recorded model weights.</p></article>
        <article><span>04</span><b>Test historically</b><p>Estimate each test sale using only records available before that transaction.</p></article>
        <article><span>05</span><b>Apply decision gate</b><p>Require current listing, condition, rent, expenses and financing before investment action.</p></article>
      </div>
      <table className="report-table"><thead><tr><th>Evidence layer</th><th>Underlying data</th><th>Use in this analysis</th><th>Observed control</th></tr></thead><tbody>
        <tr><td><b>Official public record</b><small>{property.sourceLabel}</small></td><td>Parcel {property.parcelId}; sale, assessment, use and building attributes</td><td>Subject facts and jurisdiction-specific qualification</td><td>{property.qualification}</td></tr>
        <tr><td><b>Historical pricing</b><small>FHFA tract-cluster HPI</small></td><td>Developmental annual repeat-mortgage index</td><td>Moves the prior recorded sale to the analysis period</td><td>Cluster signal {model.clusterEdgeScore}/100</td></tr>
        <tr><td><b>Qualified comparables</b><small>Earlier public sales only</small></td><td>{model.compCount} geographically and physically matched records</td><td>Comparable $/sf anchor; later transactions are excluded from tests</td><td>{model.comparableQuality.medianMiles} mi median · {plainPct(model.comparableQuality.sameTypePct, 0)} same type</td></tr>
        <tr><td><b>Market validation</b><small>Out-of-time backtest</small></td><td>{model.diagnostics.marketBacktestSample} historical predictions</td><td>Sets an empirical uncertainty floor and measures bias</td><td>{plainPct(model.diagnostics.marketMedianAbsoluteErrorPct)} median error · {plainPct(model.diagnostics.marketP80AbsoluteErrorPct)} P80</td></tr>
      </tbody></table>
      <div className="report-grid">
        <div className="report-panel"><div className="report-panel-head"><span>MODEL GOVERNANCE</span><b>Formula + validation</b></div><ul className="report-bullets"><li><b>Center</b><span>{propertyValuations.methodology.value}.</span></li><li><b>Range</b><span>{propertyValuations.methodology.range}.</span></li><li><b>Watch score</b><span>{propertyValuations.methodology.watchScore}.</span></li><li><b>Validation</b><span>{propertyValuations.methodology.validation}.</span></li></ul></div>
        <div className="report-panel"><div className="report-panel-head"><span>KNOWN LIMITS</span><b>What remains unobserved</b></div><ul className="report-bullets"><li><b>No verified asking price.</b><span>The assessment gap cannot establish purchasable discount.</span></li><li><b>No interior condition.</b><span>Renovation quality and deferred maintenance can materially change value.</span></li><li><b>No complete operating statement.</b><span>Rent, vacancy, taxes, insurance and capital needs require verification.</span></li><li><b>Small backtest sample.</b><span>{model.diagnostics.marketBacktestSample} tests support a directional range, not appraisal-grade certainty.</span></li></ul></div>
      </div>
      <div className="report-gates"><span>DECISION GATES BEFORE ADVANCING</span><ol><li>Join the current asking price or a licensed active listing.</li><li>Confirm identity, title, taxes, zoning and permit history.</li><li>Inspect condition and price the renovation scope.</li><li>Verify achievable rent, vacancy and operating costs.</li><li>Run financing and downside scenarios; reject if a hard gate fails.</li></ol></div>
      <div className="report-source-line"><span>OFFICIAL SOURCE</span><a href={property.sourceUrl}>{property.sourceLabel}</a><span>MODEL VERSION</span><b>{model.diagnostics.modelVersion}</b><span>RECORD ID</span><b>{property.id}</b></div>
      <p className="report-disclaimer">Public-record screening analysis only. Not an appraisal, broker price opinion, forecast, offer recommendation or investment advice.</p>
      <PageFooter page={2} asOf={asOf} />
    </section>
  </ReportShell>;
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<ReportParams> }) {
  const params = await searchParams;
  if (one(params.type) === "property") {
    const property = propertyValuations.properties.find((item) => item.id === one(params.id));
    if (!property) notFound();
    return <PropertyReport property={property} />;
  }

  if (one(params.type) === "area") {
    const market = MARKET_EXPLORERS.find((item) => item.id === one(params.market));
    const area = market?.neighborhoods.find((item) => item.id === one(params.cluster));
    if (!market || !area) notFound();
    return <AreaReport market={market} area={area} weights={parseWeights(params)} />;
  }

  notFound();
}
