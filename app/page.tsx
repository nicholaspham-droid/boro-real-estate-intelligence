"use client";

import { useMemo, useState } from "react";

type Area = {
  rank: number;
  name: string;
  borough: string;
  score: number;
  growth: number;
  confidence: "High" | "Medium" | "Low";
  price: string;
  drivers: string[];
  risk: number;
  cells: number[];
};

const AREAS: Area[] = [
  { rank: 1, name: "Ridgewood", borough: "Queens", score: 88, growth: 24.6, confidence: "High", price: "$1.02M", drivers: ["Transit", "Supply"], risk: 24, cells: [72, 84, 91, 68, 82, 76, 87, 63] },
  { rank: 2, name: "Crown Heights", borough: "Brooklyn", score: 84, growth: 22.1, confidence: "High", price: "$1.18M", drivers: ["Demand", "Rent growth"], risk: 31, cells: [67, 82, 76, 88, 71, 81, 65, 74] },
  { rank: 3, name: "Mott Haven", borough: "Bronx", score: 82, growth: 21.4, confidence: "Medium", price: "$685K", drivers: ["Pipeline", "Transit"], risk: 39, cells: [61, 78, 83, 69, 72, 85, 58, 77] },
  { rank: 4, name: "Sunset Park", borough: "Brooklyn", score: 79, growth: 19.8, confidence: "High", price: "$1.10M", drivers: ["Jobs", "Scarcity"], risk: 28, cells: [74, 71, 80, 62, 77, 68, 83, 59] },
  { rank: 5, name: "Astoria", borough: "Queens", score: 77, growth: 18.5, confidence: "High", price: "$1.24M", drivers: ["Liquidity", "Transit"], risk: 26, cells: [66, 75, 70, 79, 63, 73, 81, 60] },
  { rank: 6, name: "Washington Heights", borough: "Manhattan", score: 74, growth: 17.2, confidence: "Medium", price: "$720K", drivers: ["Value gap", "Demand"], risk: 34, cells: [58, 72, 77, 61, 69, 75, 55, 70] },
  { rank: 7, name: "Jamaica", borough: "Queens", score: 72, growth: 16.8, confidence: "Medium", price: "$735K", drivers: ["Transit", "Zoning"], risk: 43, cells: [55, 69, 74, 64, 71, 66, 76, 52] },
  { rank: 8, name: "Flatbush", borough: "Brooklyn", score: 69, growth: 15.1, confidence: "High", price: "$985K", drivers: ["Rent growth", "Liquidity"], risk: 32, cells: [62, 67, 70, 58, 65, 73, 54, 68] },
  { rank: 9, name: "East Harlem", borough: "Manhattan", score: 67, growth: 14.2, confidence: "Medium", price: "$795K", drivers: ["Value gap", "Pipeline"], risk: 46, cells: [49, 65, 71, 56, 63, 68, 51, 59] },
  { rank: 10, name: "St. George", borough: "Staten Island", score: 64, growth: 13.5, confidence: "Low", price: "$610K", drivers: ["Value gap", "Supply"], risk: 41, cells: [48, 61, 67, 52, 58, 64, 44, 60] },
  { rank: 11, name: "Bedford Park", borough: "Bronx", score: 61, growth: 12.7, confidence: "Medium", price: "$540K", drivers: ["Affordability", "Transit"], risk: 45, cells: [43, 58, 64, 49, 55, 61, 47, 57] },
  { rank: 12, name: "Elmhurst", borough: "Queens", score: 58, growth: 11.9, confidence: "Medium", price: "$690K", drivers: ["Demand", "Affordability"], risk: 38, cells: [46, 55, 60, 51, 57, 62, 48, 53] },
];

const BOROUGHS = ["All boroughs", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

export default function Home() {
  const [borough, setBorough] = useState("All boroughs");
  const [horizon, setHorizon] = useState(5);
  const [layer, setLayer] = useState<"score" | "growth" | "risk">("score");
  const [selected, setSelected] = useState(AREAS[0]);
  const [query, setQuery] = useState("");
  const [showGaps, setShowGaps] = useState(false);

  const areas = useMemo(() => {
    return AREAS.filter((a) => borough === "All boroughs" || a.borough === borough)
      .filter((a) => `${a.name} ${a.borough}`.toLowerCase().includes(query.toLowerCase()));
  }, [borough, query]);

  const adjustedGrowth = (growth: number) => growth * (horizon / 5);
  const intensity = (a: Area) => layer === "score" ? a.score : layer === "growth" ? Math.min(96, adjustedGrowth(a.growth) * 3.2) : 100 - a.risk;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Borocast home"><span>BORO</span>CAST</a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#outlook">Outlook</a>
          <a href="#rankings">Rankings</a>
          <a href="#methodology">Methodology</a>
        </nav>
        <button className="data-status" onClick={() => setShowGaps(true)}><i /> Data coverage: 76%</button>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">NYC PROPERTY INTELLIGENCE · MODEL 0.9</p>
          <h1>Where value<br />moves <em>next.</em></h1>
          <p className="lede">A forward-looking score for New York neighborhoods, built from sales momentum, assessed values, transit access, development pressure, and climate exposure.</p>
        </div>
        <div className="headline-stat">
          <span>Top signal</span>
          <strong>Ridgewood</strong>
          <div><b>88</b><small>/100</small></div>
          <p>Projected {horizon}-year value change <b>+{adjustedGrowth(24.6).toFixed(1)}%</b></p>
        </div>
      </section>

      <section className="controls" id="outlook" aria-label="Map controls">
        <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search neighborhood" aria-label="Search neighborhood" /></label>
        <label><span>Borough</span><select value={borough} onChange={(e) => setBorough(e.target.value)}>{BOROUGHS.map((b) => <option key={b}>{b}</option>)}</select></label>
        <div className="segmented" aria-label="Forecast horizon">
          <span>Horizon</span>{[3, 5, 10].map((n) => <button key={n} className={horizon === n ? "selected" : ""} onClick={() => setHorizon(n)}>{n}Y</button>)}
        </div>
        <div className="segmented layer" aria-label="Map layer">
          <span>Layer</span>{(["score", "growth", "risk"] as const).map((v) => <button key={v} className={layer === v ? "selected" : ""} onClick={() => setLayer(v)}>{v === "score" ? "Outlook" : v === "growth" ? "Growth" : "Resilience"}</button>)}
        </div>
      </section>

      <section className="map-shell">
        <div className="map-head">
          <div><p className="eyebrow">NEIGHBORHOOD SIGNAL MAP</p><h2>{layer === "score" ? "Composite outlook score" : layer === "growth" ? `Projected ${horizon}-year growth` : "Climate resilience"}</h2></div>
          <div className="legend"><span>Lower</span>{[28,42,56,70,84,96].map(n => <i key={n} style={{ background: `hsl(${160 - n * .85} 78% ${20 + n * .48}%)` }} />)}<span>Higher</span></div>
        </div>
        <div className="map-area">
          <div className="water-label hudson">HUDSON</div><div className="water-label east">EAST RIVER</div>
          <div className="borough-label manhattan">MANHATTAN</div><div className="borough-label bronx">BRONX</div><div className="borough-label queens">QUEENS</div><div className="borough-label brooklyn">BROOKLYN</div>
          <div className="parcel-grid" role="img" aria-label="Stylized neighborhood heat map of New York City">
            {areas.flatMap((a) => a.cells.map((cell, idx) => {
              const value = (intensity(a) * .72) + (cell * .28);
              return <button key={`${a.name}-${idx}`} title={`${a.name}: ${Math.round(intensity(a))}`} className={selected.name === a.name ? "parcel active-parcel" : "parcel"} style={{ background: `hsl(${158 - value * .82} 78% ${18 + value * .48}%)`, transform: `rotate(${((a.rank + idx) % 3 - 1) * 1.5}deg)` }} onClick={() => setSelected(a)} aria-label={`Select ${a.name}`} />;
            }))}
          </div>
          <article className="map-card">
            <button aria-label="Close detail" onClick={() => setSelected(AREAS[0])}>×</button>
            <p>#{selected.rank} FORECAST RANK</p><h3>{selected.name}</h3><span>{selected.borough}</span>
            <div className="score-row"><strong>{selected.score}</strong><small>/100<br />OUTLOOK</small><b>+{adjustedGrowth(selected.growth).toFixed(1)}%</b></div>
            <div className="meter"><i style={{ width: `${selected.score}%` }} /></div>
            <dl><div><dt>Median recorded sale</dt><dd>{selected.price}</dd></div><div><dt>Model confidence</dt><dd className={`conf ${selected.confidence.toLowerCase()}`}>● {selected.confidence}</dd></div></dl>
            <div className="tags">{selected.drivers.map(d => <span key={d}>{d}</span>)}</div>
          </article>
        </div>
      </section>

      <section className="rankings" id="rankings">
        <div className="section-title"><div><p className="eyebrow">BOROCAST INDEX</p><h2>Highest upside,<br />risk-adjusted.</h2></div><p>Ranked by projected appreciation, market depth, development catalysts and downside exposure. Select a row to locate it on the map.</p></div>
        <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Neighborhood</th><th>Outlook</th><th>{horizon}Y projection</th><th>Confidence</th><th>Primary signals</th></tr></thead><tbody>
          {areas.map(a => <tr key={a.name} onClick={() => setSelected(a)} className={selected.name === a.name ? "row-active" : ""}><td><b>{String(a.rank).padStart(2,"0")}</b></td><td><strong>{a.name}</strong><small>{a.borough}</small></td><td><div className="table-score"><b>{a.score}</b><i><span style={{ width: `${a.score}%` }} /></i></div></td><td className="positive">+{adjustedGrowth(a.growth).toFixed(1)}%</td><td><span className={`conf ${a.confidence.toLowerCase()}`}>● {a.confidence}</span></td><td>{a.drivers.map(d => <span className="tag" key={d}>{d}</span>)}</td></tr>)}
        </tbody></table>{areas.length === 0 && <p className="empty">No neighborhoods match this view.</p>}</div>
      </section>

      <section className="method" id="methodology">
        <div><p className="eyebrow">HOW TO READ THIS</p><h2>A signal, not<br />an appraisal.</h2></div>
        <div className="method-grid">
          <article><b>01</b><h3>Market momentum</h3><p>Recorded sale-price and turnover trends, normalized within property type.</p><span>35% weight</span></article>
          <article><b>02</b><h3>Place catalysts</h3><p>Transit access, permitted construction, zoning capacity and job proximity.</p><span>30% weight</span></article>
          <article><b>03</b><h3>Value & resilience</h3><p>Entry-price gap, liquidity, flood exposure and model data completeness.</p><span>35% weight</span></article>
        </div>
        <div className="source-note"><p><strong>Public-source foundation</strong> · NYC DOF Rolling Sales and assessment rolls · DCP PLUTO / MapPLUTO · NYC Open Data transit, permits and flood layers</p><button onClick={() => setShowGaps(true)}>Review data gaps →</button></div>
      </section>

      <footer><a className="brand" href="#top"><span>BORO</span>CAST</a><p>Research prototype · Scores are directional and not investment advice.</p><span>Snapshot: FY2026 / CY2025 source releases</span></footer>

      {showGaps && <div className="modal-backdrop" onClick={() => setShowGaps(false)}><section className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="gaps-title"><button className="modal-close" onClick={() => setShowGaps(false)}>×</button><p className="eyebrow">MODEL TRANSPARENCY</p><h2 id="gaps-title">Known data gaps</h2><p className="modal-intro">These gaps reduce precision. The model applies a confidence penalty instead of pretending the inputs are complete.</p><ul>
        <li><b>Non-market transfers</b><span>Rolling Sales includes $0 and related-party transfers. They must be filtered before training.</span></li>
        <li><b>Condition & renovations</b><span>Public lot records do not reliably capture interior condition, recent renovations or concessions.</span></li>
        <li><b>Condo/co-op joins</b><span>Unit sales and lot-level building attributes do not always align cleanly.</span></li>
        <li><b>Private rental data</b><span>Asking rents, effective rents and vacancies are incomplete without licensed market feeds.</span></li>
        <li><b>Timing mismatch</b><span>Assessments, PLUTO, permits, flood maps and sales refresh on different schedules.</span></li>
        <li><b>Future shocks</b><span>Interest rates, insurance repricing, tax changes and project cancellations are scenarios—not observable facts.</span></li>
      </ul><div className="modal-callout"><b>Current release</b><span>Neighborhood-level directional ranking</span><b>Not yet appropriate for</b><span>Parcel valuation, underwriting or automated purchase decisions</span></div></section></div>}
    </main>
  );
}
