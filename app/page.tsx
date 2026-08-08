"use client";

import { useMemo, useState } from "react";
import { GooglePropertyMap } from "./GooglePropertyMap";
import { COMPETENCY_FACTORS, EDGE_COMPONENTS, METROS, NATIONAL_FEEDS } from "./metroData";
import sourceRegistry from "../data/source-registry.json";

type Area = {
  cd: number;
  rank: number;
  name: string;
  borough: string;
  score: number;
  lots: number;
  farGap: number;
  altered: number;
  transit: number;
  resilience: number;
  drivers: string[];
  cells: number[];
};

const AREAS: Area[] = [
  { cd: 204, rank: 1, name: "Highbridge / Concourse", borough: "Bronx", score: 97, lots: 3323, farGap: 1.76, altered: 6.2, transit: 99.9, resilience: 98.4, drivers: ["Capacity", "Alterations"], cells: [83, 94, 88, 97, 91, 86, 95, 79] },
  { cd: 205, rank: 2, name: "Fordham / University Hts.", borough: "Bronx", score: 89, lots: 3243, farGap: 1.52, altered: 5.0, transit: 99.6, resilience: 99.5, drivers: ["Capacity", "Transit"], cells: [78, 89, 84, 92, 87, 81, 90, 75] },
  { cd: 108, rank: 3, name: "Upper East Side", borough: "Manhattan", score: 79, lots: 5474, farGap: 1.56, altered: 1.9, transit: 99.6, resilience: 97.6, drivers: ["Capacity", "Transit"], cells: [70, 81, 76, 84, 79, 73, 82, 67] },
  { cd: 206, rank: 4, name: "Belmont / East Tremont", borough: "Bronx", score: 79, lots: 4100, farGap: 1.14, altered: 4.2, transit: 99.6, resilience: 99.8, drivers: ["Alterations", "Resilience"], cells: [72, 80, 77, 85, 74, 82, 69, 78] },
  { cd: 111, rank: 5, name: "East Harlem", borough: "Manhattan", score: 78, lots: 3062, farGap: 1.90, altered: 0.8, transit: 99.5, resilience: 71.3, drivers: ["Capacity", "Flood flag"], cells: [68, 79, 75, 83, 71, 80, 65, 76] },
  { cd: 203, rank: 6, name: "Morrisania / Crotona", borough: "Bronx", score: 77, lots: 3655, farGap: 1.24, altered: 3.6, transit: 92.0, resilience: 100, drivers: ["Alterations", "Resilience"], cells: [66, 78, 73, 81, 76, 69, 79, 64] },
  { cd: 106, rank: 7, name: "Murray Hill / Kips Bay", borough: "Manhattan", score: 76, lots: 2789, farGap: 1.45, altered: 1.7, transit: 98.8, resilience: 96.2, drivers: ["Capacity", "Transit"], cells: [67, 76, 72, 80, 74, 78, 63, 75] },
  { cd: 104, rank: 8, name: "Chelsea / Clinton", borough: "Manhattan", score: 75, lots: 3407, farGap: 1.35, altered: 2.2, transit: 99.5, resilience: 89.9, drivers: ["Capacity", "Transit"], cells: [64, 75, 70, 79, 73, 77, 61, 72] },
  { cd: 207, rank: 9, name: "Kingsbridge / Bedford", borough: "Bronx", score: 74, lots: 3588, farGap: 1.00, altered: 3.5, transit: 99.8, resilience: 99.2, drivers: ["Alterations", "Transit"], cells: [65, 74, 71, 78, 68, 76, 62, 73] },
  { cd: 107, rank: 10, name: "Upper West Side", borough: "Manhattan", score: 71, lots: 4419, farGap: 1.30, altered: 0.7, transit: 99.8, resilience: 99.5, drivers: ["Capacity", "Resilience"], cells: [61, 71, 68, 75, 70, 65, 73, 59] },
  { cd: 202, rank: 11, name: "Hunts Point / Longwood", borough: "Bronx", score: 70, lots: 2979, farGap: .90, altered: 2.9, transit: 99.5, resilience: 96.4, drivers: ["Alterations", "Transit"], cells: [60, 70, 66, 74, 69, 63, 72, 57] },
  { cd: 201, rank: 12, name: "Mott Haven / Melrose", borough: "Bronx", score: 69, lots: 3984, farGap: .79, altered: 3.4, transit: 99.8, resilience: 93.5, drivers: ["Alterations", "Transit"], cells: [58, 69, 65, 73, 67, 62, 71, 56] },
  { cd: 302, rank: 13, name: "Downtown / Fort Greene", borough: "Brooklyn", score: 69, lots: 8107, farGap: .45, altered: 5.1, transit: 99.8, resilience: 99.0, drivers: ["Alterations", "Resilience"], cells: [61, 68, 64, 72, 66, 70, 57, 67] },
  { cd: 303, rank: 14, name: "Bedford-Stuyvesant", borough: "Brooklyn", score: 67, lots: 16805, farGap: .60, altered: 3.3, transit: 99.9, resilience: 100, drivers: ["Alterations", "Resilience"], cells: [57, 67, 63, 71, 65, 60, 69, 54] },
  { cd: 316, rank: 15, name: "Brownsville", borough: "Brooklyn", score: 66, lots: 8070, farGap: 1.04, altered: .8, transit: 100, resilience: 100, drivers: ["Capacity", "Resilience"], cells: [56, 66, 62, 70, 64, 59, 68, 53] },
];

const BOROUGHS = ["All boroughs", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

function edgeRead(area: Area) {
  if (area.farGap >= 1.5 && area.altered >= 4) return { type: "Capacity edge", action: "Verify zoning, ownership and recent permits" };
  if (area.farGap >= 1.25 && area.transit >= 99) return { type: "Transit capacity", action: "Test sites near stations for deliverable FAR" };
  if (area.altered >= 3 && area.resilience >= 99) return { type: "Momentum edge", action: "Trace alteration clusters and sales activity" };
  if (area.resilience < 90) return { type: "Capacity / risk split", action: "Price flood and insurance exposure before review" };
  return { type: "Watch signal", action: "Add sales and permit evidence before escalation" };
}

function competencyGrade(score: number) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

export default function Home() {
  const [borough, setBorough] = useState("All boroughs");
  const [layer, setLayer] = useState<"score" | "capacity" | "resilience">("score");
  const [selected, setSelected] = useState(AREAS[0]);
  const [query, setQuery] = useState("");
  const [showGaps, setShowGaps] = useState(false);
  const [metroCohort, setMetroCohort] = useState<"largest" | "fastest">("largest");
  const [edgeComponent, setEdgeComponent] = useState(EDGE_COMPONENTS[0]);

  const areas = useMemo(() => {
    return AREAS.filter((a) => borough === "All boroughs" || a.borough === borough)
      .filter((a) => `${a.name} ${a.borough}`.toLowerCase().includes(query.toLowerCase()));
  }, [borough, query]);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Borocast home"><span>BORO</span>CAST</a>
        <nav aria-label="Primary navigation">
          <a href="#outlook">Outlook</a>
          <a href="#rankings">Rankings</a>
          <a href="#national">U.S. markets</a>
          <a href="#edge">Edge score</a>
          <a href="#sources">Sources</a>
        </nav>
        <button className="data-status" onClick={() => setShowGaps(true)}><i /> PLUTO 26v1 · 858,602 lots</button>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">NYC PUBLIC-RECORD INTELLIGENCE · PLUTO 26V1</p>
          <h1>Where the city<br />can grow <em>next.</em></h1>
          <p className="lede">A value-potential signal built from the official tax-lot record: unused residential floor-area capacity, transit-zone status, recent alterations and mapped flood exposure.</p>
        </div>
        <div className="headline-stat">
          <span>Top signal</span>
          <strong>Bronx CD 4</strong>
          <div><b>97</b><small>/100</small></div>
          <p>Observed lots <b>3,323</b> · average unused residential FAR <b>1.76</b></p>
        </div>
      </section>

      <section className="controls" id="outlook" aria-label="Map controls">
        <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search community district" aria-label="Search community district" /></label>
        <label><span>Borough</span><select value={borough} onChange={(e) => setBorough(e.target.value)}>{BOROUGHS.map((b) => <option key={b}>{b}</option>)}</select></label>
        <div className="segmented"><span>Release</span><button className="selected">26V1</button><button disabled>Quarterly</button></div>
        <div className="segmented layer" aria-label="Map layer">
          <span>Layer</span>{(["score", "capacity", "resilience"] as const).map((v) => <button key={v} className={layer === v ? "selected" : ""} onClick={() => setLayer(v)}>{v === "score" ? "Potential" : v === "capacity" ? "FAR gap" : "Resilience"}</button>)}
        </div>
      </section>

      <section className="map-shell">
        <div className="map-head">
          <div><p className="eyebrow">COMMUNITY-DISTRICT SIGNAL MAP</p><h2>{layer === "score" ? "Public-record potential score" : layer === "capacity" ? "Unused residential FAR" : "Lots without PLUTO flood flag"}</h2></div>
          <div className="legend"><span>Lower</span>{[28,42,56,70,84,96].map(n => <i key={n} style={{ background: `hsl(${160 - n * .85} 78% ${20 + n * .48}%)` }} />)}<span>Higher</span></div>
        </div>
        <div className="map-area">
          <GooglePropertyMap
            areas={areas}
            layer={layer}
            selectedCd={selected.cd}
            onSelect={(cd) => {
              const match = AREAS.find((area) => area.cd === cd);
              if (match) setSelected(match);
            }}
          />
          <article className="map-card">
            <button aria-label="Close detail" onClick={() => setSelected(AREAS[0])}>×</button>
            <p>#{selected.rank} PLUTO SIGNAL RANK</p><h3>{selected.name}</h3><span>{selected.borough} · {edgeRead(selected).type}</span>
            <div className="score-row"><strong>{selected.score}</strong><small>/100<br />POTENTIAL</small><b>{selected.farGap.toFixed(2)} FAR</b></div>
            <div className="meter"><i style={{ width: `${selected.score}%` }} /></div>
            <dl><div><dt>PLUTO lots observed</dt><dd>{selected.lots.toLocaleString()}</dd></div><div><dt>Altered since 2020</dt><dd>{selected.altered.toFixed(1)}%</dd></div><div><dt>Greater transit zone</dt><dd>{selected.transit.toFixed(1)}%</dd></div></dl>
            <div className="tags">{selected.drivers.map(d => <span key={d}>{d}</span>)}</div>
          </article>
        </div>
      </section>

      <section className="rankings" id="rankings">
        <div className="section-title"><div><p className="eyebrow">PLUTO-DERIVED INDEX</p><h2>Potential, translated<br />into a next test.</h2></div><p>Each district now carries an edge pattern and a diligence action. The current rank remains PLUTO-only; national demand, price and supply feeds will graduate it into the full Edge Score.</p></div>
        <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Community district</th><th>Potential</th><th>Avg. FAR gap</th><th>Edge read</th><th>Next evidence test</th></tr></thead><tbody>
          {areas.map(a => <tr key={a.name} onClick={() => setSelected(a)} className={selected.name === a.name ? "row-active" : ""}><td><b>{String(a.rank).padStart(2,"0")}</b></td><td><strong>{a.name}</strong><small>{a.borough} · {a.lots.toLocaleString()} lots</small></td><td><div className="table-score"><b>{a.score}</b><i><span style={{ width: `${a.score}%` }} /></i></div></td><td className="positive">{a.farGap.toFixed(2)}</td><td><span className="edge-pill">{edgeRead(a).type}</span></td><td className="next-test">{edgeRead(a).action}</td></tr>)}
        </tbody></table>{areas.length === 0 && <p className="empty">No neighborhoods match this view.</p>}</div>
      </section>

      <section className="national" id="national">
        <div className="section-title"><div><p className="eyebrow">20-MARKET EXPANSION · CENSUS VINTAGE 2025</p><h2>One national spine.<br />Local depth by adapter.</h2></div><p>The first portfolio combines the 10 largest metros and the 10 fastest-growing metros by 2024–2025 population change. Ten markets now have verified government parcel connections; the remaining scores are source-inventory estimates.</p></div>
        <div className="national-grid">
          <div className="metro-panel">
            <div className="cohort-switch" aria-label="Metro cohort">
              <button className={metroCohort === "largest" ? "selected" : ""} onClick={() => setMetroCohort("largest")}>10 largest</button>
              <button className={metroCohort === "fastest" ? "selected" : ""} onClick={() => setMetroCohort("fastest")}>10 fastest growth</button>
            </div>
            <ol className="metro-list">
              {METROS.filter((metro) => metro.cohort === metroCohort).map((metro, index) => <li key={metro.name}>
                <b>{String(index + 1).padStart(2, "0")}</b><div><strong>{metro.short}</strong><span>{metro.name}</span><small className={`connection-status ${metro.localStatus.replace(" ", "-")}`}>{metro.localStatus}</small></div><div className="metro-stat"><strong>{metro.population.toLocaleString()}</strong><span className={metro.growth < 0 ? "down" : ""}>{metro.growth > 0 ? "+" : ""}{metro.growth.toFixed(2)}% YoY</span></div><div className="competency-score"><strong>{metro.competency}% <i>{competencyGrade(metro.competency)}</i></strong><span><i style={{ width: `${metro.competency}%` }} /></span><small>±{metro.evidenceBand} pts</small></div>
              </li>)}
            </ol>
            <div className="competency-legend"><strong>Data competency</strong><span>A 85+ · B 70–84 · C 55–69 · D hold</span><small>The ± band is an operational confidence range: potential Edge Score movement from missing or weak inputs. It is not a statistical forecast interval for property values.</small></div>
          </div>
          <div className="coverage-panel">
            <p className="eyebrow">ACQUISITION STACK</p><h3>Comparable first.<br />Granular second.</h3>
            <div className="feed-list">{NATIONAL_FEEDS.map(feed => <div key={feed.label}><span className={`feed-status ${feed.status === "ready" ? "ready" : "needed"}`}>{feed.status}</span><div><strong>{feed.label}</strong><small>{feed.source} · {feed.role}</small></div></div>)}</div>
            <details className="competency-method"><summary>How competency is scored</summary>{COMPETENCY_FACTORS.map(factor => <div key={factor.label}><span>{factor.label}</span><b>{factor.weight}%</b></div>)}</details>
            <div className="gap-callout"><b>Known gap</b><p>There is no national PLUTO equivalent. Assessment, parcel geometry, zoning and arms-length sales differ in licensing, geography, identifiers and refresh cadence. Every local adapter will publish its own coverage grade.</p></div>
          </div>
        </div>
      </section>

      <section className="edge" id="edge">
        <div className="section-title"><div><p className="eyebrow">EDGE SCORE V0.2</p><h2>Rank the thesis.<br />Expose the evidence.</h2></div><p>A 0–100 composite should explain why a neighborhood may be mispriced, what could unlock it, and what can invalidate it. Confidence stays separate so sparse local data cannot masquerade as conviction.</p></div>
        <div className="edge-layout">
          <div className="edge-components">
            {EDGE_COMPONENTS.map(component => <button key={component.key} onClick={() => setEdgeComponent(component)} className={edgeComponent.key === component.key ? "active" : ""}><span>{component.weight}%</span><div><strong>{component.label}</strong><small>{component.detail}</small></div></button>)}
          </div>
          <article className="edge-detail">
            <p>SELECTED COMPONENT</p><div className="edge-weight">{edgeComponent.weight}<span>%</span></div><h3>{edgeComponent.label}</h3><p>{edgeComponent.detail}.</p>
            <dl><div><dt>Output</dt><dd>Percentile within comparable metro peers</dd></div><div><dt>Guardrail</dt><dd>Winsorized inputs + vintage alignment</dd></div><div><dt>Required evidence</dt><dd>At least 70% weighted coverage</dd></div></dl>
          </article>
          <article className="action-ladder">
            <p>DECISION LAYER</p><h3>Score × evidence grade</h3>
            <div><b>80–100 · A/B</b><span>Investigate now</span><small>Open parcel, ownership, pipeline and risk diligence</small></div>
            <div><b>65–79 · A–C</b><span>Build watchlist</span><small>Track catalysts and price confirmation</small></div>
            <div><b>Any score · D</b><span>Data hold</span><small>Acquire missing evidence before ranking</small></div>
          </article>
        </div>
        <p className="edge-footnote">The existing NYC potential score remains visible as a land-use signal. It is not silently relabeled as Edge Score until sales, pricing, demand and pipeline components pass their coverage tests.</p>
      </section>

      <section className="method" id="methodology">
        <div><p className="eyebrow">HOW TO READ THIS</p><h2>A signal, not<br />an appraisal.</h2></div>
        <div className="method-grid">
          <article><b>01</b><h3>Development capacity</h3><p>Average positive gap between allowable residential FAR and currently built FAR.</p><span>35% weight</span></article>
          <article><b>02</b><h3>Transit & alteration</h3><p>Share of lots in the Greater Transit Zone and share with YearAlter1 of 2020 or later.</p><span>50% combined</span></article>
          <article><b>03</b><h3>Flood resilience</h3><p>Share of lots without the PLUTO 2015 preliminary flood-map indicator.</p><span>15% weight</span></article>
        </div>
        <div className="source-note"><p><strong>Audited source</strong> · NYC DCP PLUTO dataset 64uk-42ks · Version 26v1 · quarterly · 858,602 tax lots · BBL complete · coordinates 99.8%</p><button onClick={() => setShowGaps(true)}>Review audit →</button></div>
      </section>

      <section className="sources" id="sources">
        <div className="section-title"><div><p className="eyebrow">OFFICIAL DATA DIRECTORY</p><h2>Government feeds<br />we can actually join.</h2></div><p>Sources enter the score only after their endpoint, identifier, count, cadence, fields, pagination and limitations are recorded. Public samples intentionally omit owner names and mailing addresses.</p></div>
        <div className="registry-summary">
          <div><strong>{sourceRegistry.sources.length}</strong><span>verified local sources</span></div>
          <div><strong>10</strong><span>connected target markets</span></div>
          <div><strong>{sourceRegistry.sources.reduce((total, source) => total + source.recordCount, 0).toLocaleString()}</strong><span>represented source records</span></div>
          <a href="/api/property-data/audit">Open live field audit →</a>
        </div>
        <div className="registry-head"><p className="eyebrow">FIRST-WAVE LIVE ENDPOINTS</p><p>ArcGIS, Socrata and CARTO adapters now share one audit contract.</p></div>
        <div className="source-grid first-wave-grid">
          {sourceRegistry.sources.map((source) => <a key={source.id} href={source.sourcePage} target="_blank" rel="noreferrer"><b>{source.status} · {source.adapter}</b><h3>{source.name}</h3><p>{source.publisher}. Covers {source.marketIds.map((marketId) => marketId.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")).join(", ")}.</p><span>{source.recordCount.toLocaleString()} records · {source.asOf} ↗</span></a>)}
        </div>
        <div className="registry-head"><p className="eyebrow">NYC + NATIONAL EVIDENCE STACK</p><p>Candidate feeds remain outside the score until their joins pass the same audit.</p></div>
        <div className="source-grid">
          <a href="https://data.cityofnewyork.us/resource/64uk-42ks.json" target="_blank" rel="noreferrer"><b>Core</b><h3>PLUTO 26v1</h3><p>Tax-lot, building, zoning, assessment and district attributes.</p><span>Quarterly · direct BBL · 858,602 rows ↗</span></a>
          <a href="https://data.cityofnewyork.us/City-Government/NYC-Citywide-Rolling-Calendar-Sales/usep-8jbt" target="_blank" rel="noreferrer"><b>Next</b><h3>Rolling Sales</h3><p>Recorded transfers and prices; $0/non-market transactions require filtering.</p><span>Monthly · borough/block/lot join ↗</span></a>
          <a href="https://data.cityofnewyork.us/Housing-Development/DOB-Permit-Issuance/ipu4-2q9a" target="_blank" rel="noreferrer"><b>Next</b><h3>DOB permits</h3><p>Issued construction permits with BBL and daily refresh.</p><span>Daily · direct BBL ↗</span></a>
          <a href="https://data.cityofnewyork.us/City-Government/Zoning-Application-Portal-ZAP-BBL/2iga-a6mk" target="_blank" rel="noreferrer"><b>Next</b><h3>ZAP applications</h3><p>Lots attached to active and historical land-use applications.</p><span>Monthly · validated BBL ↗</span></a>
          <a href="https://data.cityofnewyork.us/Environment/NYC-Building-Energy-and-Water-Data-Disclosure-/5zyy-y8am" target="_blank" rel="noreferrer"><b>Candidate</b><h3>Energy disclosure</h3><p>Benchmarking for covered buildings, not the full property universe.</p><span>Annual · BBL available ↗</span></a>
          <a href="https://data.ny.gov/Transportation/MTA-Subway-Entrances-and-Exits-2024/i9wp-a4ja" target="_blank" rel="noreferrer"><b>Candidate</b><h3>MTA entrances</h3><p>Official station entrances for walking-distance calculations.</p><span>Static 2024 · spatial join ↗</span></a>
          <a href="https://www.census.gov/programs-surveys/metro-micro/data/tables.html" target="_blank" rel="noreferrer"><b>National core</b><h3>Census metro estimates</h3><p>Official population vintages used to define both 10-market cohorts.</p><span>Annual · CBSA join · Vintage 2025 ↗</span></a>
          <a href="https://www.census.gov/construction/bps/msamonthly.html" target="_blank" rel="noreferrer"><b>National core</b><h3>Building Permits Survey</h3><p>Authorized housing units at CBSA, county and permit-place levels.</p><span>Monthly · CBSA / FIPS join ↗</span></a>
          <a href="https://www.bls.gov/cew/home.htm" target="_blank" rel="noreferrer"><b>National core</b><h3>BLS QCEW</h3><p>Employment, establishments and wages covering more than 95% of U.S. jobs.</p><span>Quarterly · county / MSA join ↗</span></a>
          <a href="https://www.fhfa.gov/house-price-index" target="_blank" rel="noreferrer"><b>National core</b><h3>FHFA HPI</h3><p>Public house-price indexes across metro, county, ZIP and tract geographies.</p><span>Quarterly · geographic series ↗</span></a>
          <a href="https://hazards.fema.gov/nri/data-resources" target="_blank" rel="noreferrer"><b>National core</b><h3>FEMA risk data</h3><p>Expected loss, social vulnerability and resilience measures.</p><span>County / tract · FIPS join ↗</span></a>
        </div>
      </section>

      <footer><a className="brand" href="#top"><span>BORO</span>CAST</a><p>Public-record research prototype · This is not an appraisal or investment advice.</p><span>Snapshot: PLUTO 26v1 · accessed Aug 7, 2026</span></footer>

      {showGaps && <div className="modal-backdrop" role="button" tabIndex={0} aria-label="Close data audit" onClick={(event) => { if (event.target === event.currentTarget) setShowGaps(false); }} onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter" || event.key === " ") setShowGaps(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="gaps-title"><button className="modal-close" onClick={() => setShowGaps(false)}>×</button><p className="eyebrow">PLUTO 26V1 AUDIT</p><h2 id="gaps-title">Coverage is high.<br />Meaning is bounded.</h2><p className="modal-intro">The feed is broad and joinable. The bigger gaps are conceptual: PLUTO describes tax lots and zoning, not transaction intent or future market value.</p><ul>
        <li><b>BBL</b><span>858,602 of 858,602 rows populated — 100% field coverage.</span></li>
        <li><b>Coordinates</b><span>857,103 rows populated — approximately 99.8% coverage.</span></li>
        <li><b>Year built</b><span>818,364 rows have a nonzero value — approximately 95.3%.</span></li>
        <li><b>Building area</b><span>817,099 rows have a nonzero value — approximately 95.2%; vacant lots can legitimately be zero.</span></li>
        <li><b>Lot-map mismatch</b><span>2,341 records are not standard one-to-one PLUTO/tax-map matches; source systems refresh on different cycles.</span></li>
        <li><b>What PLUTO lacks</b><span>Interior condition, rents, concessions, financing, buyer intent, insurance cost and a market-sale price series.</span></li>
      </ul><div className="modal-callout"><b>Current release</b><span>Community-district land-use potential derived from PLUTO only</span><b>Next controlled joins</b><span>Rolling Sales, DOB permits and ZAP—each with its own refresh and quality test</span><b>Not appropriate for</b><span>Parcel valuation, underwriting or automated purchase decisions</span></div></section></div>}
    </main>
  );
}
