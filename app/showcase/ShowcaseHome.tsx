"use client";

import { useState } from "react";
import { ReviewFeedback } from "../ReviewFeedback";

const CAPABILITIES = [
  { id: "discover", number: "01", label: "Discover", title: "See where the evidence points.", text: "Compare demographic, economic, education, housing and price-momentum signals across 20 metros and 97 local clusters.", proof: "17,959 ACS tracts · FHFA metro + tract history", status: "MVP snapshot" },
  { id: "evaluate", number: "02", label: "Evaluate", title: "Challenge the property thesis.", text: "Join qualified public records, active listing attributes, local price-per-square-foot context and independent valuation evidence.", proof: "54 modeled records · 3 high-intent listing markets", status: "Private beta" },
  { id: "underwrite", number: "03", label: "Underwrite", title: "Turn signals into decision gates.", text: "Model property-specific rent ranges, acquisition basis, expenses, financing, cash flow, DSCR and downside cases without hiding missing inputs.", proof: "P25 / median / P75 rent · five explicit gates", status: "Private beta" },
  { id: "monitor", number: "04", label: "Monitor", title: "Keep the evidence file alive.", text: "Build a model portfolio, surface concentration and failure modes, and cross-verify a candidate before it becomes a monitored position.", proof: "Source → verify → add · reliability-adjusted edge", status: "In development" },
] as const;

const SAMPLE_AREAS = [
  { place: "New York · North Arc", score: 73, signal: "Economic depth + local price momentum", confidence: 88 },
  { place: "Raleigh · Central Core", score: 69, signal: "Talent concentration + income durability", confidence: 82 },
  { place: "Northwest Arkansas · Growth Arc", score: 68, signal: "Population momentum + housing capacity", confidence: 79 },
];

export function ShowcaseHome() {
  const [activeCapability, setActiveCapability] = useState<(typeof CAPABILITIES)[number]["id"]>("discover");
  const active = CAPABILITIES.find((item) => item.id === activeCapability) ?? CAPABILITIES[0];

  return <main className="showcase" id="top">
    <header className="showcase-nav"><a href="#top" className="showcase-brand">BORO</a><span>INVITED PRODUCT PREVIEW</span><nav><a href="#capabilities">Capabilities</a><a href="#evidence">Evidence</a><a href="#feedback">Feedback</a><a href="/review-repository">Owner access</a></nav><button type="button" onClick={async () => { await fetch("/api/review/logout", { method: "POST" }); window.location.href = "/"; }}>End review session</button></header>
    <section className="showcase-hero">
      <div><p className="eyebrow">WHARTON 2026 + FRIENDS · PRIVATE MVP REVIEW</p><h1>Real estate decisions,<br />made <em>legible.</em></h1><p>BORO is an evidence-first intelligence layer that helps investors move from market signal to a defensible next action. This review environment shows what the product can do without exposing unfinished models, licensed data feeds or internal tooling.</p><div className="showcase-actions"><a href="#capabilities">Explore the capability story</a><a href="#feedback">Share feedback</a></div></div>
      <aside><span>PRIVATE REVIEW SNAPSHOT</span><strong>20</strong><b>U.S. markets in the common evidence layer</b><dl><div><dt>Local clusters</dt><dd>97</dd></div><div><dt>ACS tracts</dt><dd>17,959</dd></div><div><dt>Property records</dt><dd>54</dd></div><div><dt>Verified endpoints</dt><dd>6</dd></div></dl><small>No live provider requests can be triggered from this reviewer interface.</small></aside>
    </section>
    <section className="showcase-thesis"><b>The product thesis</b><p>Most property tools give users more numbers. BORO organizes evidence around the decision: where to look, what to challenge, what must be verified, and why a candidate should advance—or stop.</p><span>SCREENING ≠ APPRAISAL</span></section>

    <section className="showcase-capabilities" id="capabilities">
      <header><div><p className="eyebrow">CAPABILITY PREVIEW</p><h2>One system.<br />Four business cases.</h2></div><p>Each stage is being validated independently. Reviewers see representative outcomes and methodology boundaries; interactive production tools remain owner-gated until the use case and data rights are ready.</p></header>
      <div className="showcase-capability-grid"><nav aria-label="BORO capability previews">{CAPABILITIES.map((item) => <button key={item.id} className={item.id === active.id ? "active" : ""} onClick={() => setActiveCapability(item.id)}><span>{item.number}</span><b>{item.label}</b><small>{item.status}</small></button>)}</nav><article><span>{active.status}</span><h3>{active.title}</h3><p>{active.text}</p><div><b>What the reviewer can inspect</b><strong>{active.proof}</strong></div><ul><li>Sample output with real public-data structure</li><li>Visible source and confidence boundaries</li><li>A clear next-action recommendation</li></ul><button type="button" disabled>Full workspace · owner access</button></article></div>
    </section>

    <section className="showcase-evidence" id="evidence">
      <div className="showcase-section-title"><div><p className="eyebrow">REPRESENTATIVE OUTPUT</p><h2>What a useful signal<br />looks like.</h2></div><p>Illustrative rankings use the current BORO evidence pipeline. They demonstrate the form of the insight, not an offer, appraisal, forecast or recommendation.</p></div>
      <div className="showcase-area-list">{SAMPLE_AREAS.map((area, index) => <article key={area.place}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{area.place}</h3><p>{area.signal}</p><small>Evidence confidence {area.confidence}%</small></div><strong>{area.score}<small>/100</small></strong><i style={{ "--score": `${area.score}%` } as React.CSSProperties}><b /></i></article>)}</div>
      <div className="showcase-decision"><div><span>SAMPLE DECISION MEMO</span><h3>Advance to property diligence—with conditions.</h3><p>The local market screen and price context agree, but property-level rent, taxes, insurance and physical condition remain unverified.</p></div><ol><li><b>01</b><span>Verify active listing status and source rights</span></li><li><b>02</b><span>Load bedroom-, bath- and square-footage-matched rent comps</span></li><li><b>03</b><span>Test downside DSCR and cash flow before diligence spend</span></li></ol></div>
    </section>

    <section className="showcase-security"><div><p className="eyebrow">REVIEW ENVIRONMENT</p><h2>Curated by design.<br />Gated by default.</h2></div><div><article><b>Reviewer tier</b><p>Capability snapshots, representative evidence, methodology boundaries and private feedback.</p><span>Current session</span></article><article><b>Owner tier</b><p>Live listing calls, ATTOM and RentCast checks, model workbenches, reports, profiles and experimental portfolio workflows.</p><span>Server-enforced</span></article><article><b>Production tier</b><p>Each feature graduates only after its business case, data rights, validation gates and operating costs are approved.</p><span>Deliberate release</span></article></div></section>
    <ReviewFeedback />
    <footer><a href="#top">BORO</a><p>Private product research · evidence-first real estate intelligence</p><span>Not investment, appraisal, legal or lending advice</span></footer>
  </main>;
}
