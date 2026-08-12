"use client";

import { useState } from "react";
import { ReviewFeedback } from "../ReviewFeedback";

const CAPABILITIES = [
  { id: "discover", number: "01", label: "Explore", title: "Find the neighborhoods worth a closer look.", text: "Compare demand, affordability, education, housing and price-momentum signals at a useful local level—then see which evidence actually moved the result.", proof: "Measured tract evidence · local price history · confidence shown", output: "A ranked shortlist with a reason to investigate—not a generic heat map." },
  { id: "evaluate", number: "02", label: "Screen", title: "Challenge a specific property thesis.", text: "Put a listing beside recorded facts, local price-per-square-foot context and independent valuation evidence so disagreement becomes visible before diligence spend.", proof: "Listing facts · public record · valuation cross-check", output: "An advance, watch or stop memo with the missing evidence named." },
  { id: "underwrite", number: "03", label: "Test", title: "See whether the deal survives reality.", text: "Build a property-specific rent range from square footage, bedrooms, bathrooms and matched comparables, then test financing, expenses, DSCR and downside cases.", proof: "P25 / median / P75 rent · explicit assumptions", output: "A bounded underwriting case—not one blanket cluster rent." },
] as const;

const FEATURED_MARKETS = [
  {
    id: "new-york", city: "New York", kicker: "Neighborhood intelligence", status: "CONNECTED", tone: "connected",
    headline: "Use granular public records to find local divergence inside a mature market.",
    summary: "PLUTO, ACS and FHFA context support a tract-cluster screen across every borough and the wider nine-county signal layer.",
    metrics: [["Source competency", "88%"], ["Local property records", "858,602"], ["Primary lens", "Tract clusters"]],
    insight: "Economic depth and local price momentum create a shortlist; property joins outside New York City remain an explicit verification condition.",
    action: "Compare the strongest clusters, then validate a specific address before underwriting.",
  },
  {
    id: "raleigh", city: "Raleigh", kicker: "Property decision loop", status: "MODEL PASS", tone: "pass",
    headline: "Move from a live candidate to a property-specific evidence memo.",
    summary: "The public-record valuation model clears its current release gate and can be strengthened with an opt-in live listing and matched rent check.",
    metrics: [["Out-of-time tests", "1,175"], ["Median error", "10.7%"], ["Integrated competency", "79%"]],
    insight: "The model is directionally useful for screening, while current listing truth, rent, tax, insurance and condition still control the final decision.",
    action: "Select a source-traceable listing and run the bounded P25 / median / P75 rent case.",
  },
  {
    id: "chicago", city: "Chicago", kicker: "Transparent uncertainty", status: "MODEL WATCH", tone: "watch",
    headline: "Show a promising result without overstating a thin validation sample.",
    summary: "Cook County facts and qualified comparable logic produce encouraging accuracy, but the model remains watch-only until the test cohort grows.",
    metrics: [["Out-of-time tests", "13"], ["Median error", "10.7%"], ["Integrated competency", "80%"]],
    insight: "Observed error is low, but sample depth—not the headline metric—is the binding constraint. BORO keeps that limitation in the decision.",
    action: "Continue evidence collection and use outputs as a diligence aid, not an underwriting anchor.",
  },
] as const;

export function ShowcaseHome() {
  const [activeCapability, setActiveCapability] = useState<(typeof CAPABILITIES)[number]["id"]>("discover");
  const [activeMarket, setActiveMarket] = useState<(typeof FEATURED_MARKETS)[number]["id"]>("new-york");
  const active = CAPABILITIES.find((item) => item.id === activeCapability) ?? CAPABILITIES[0];
  const market = FEATURED_MARKETS.find((item) => item.id === activeMarket) ?? FEATURED_MARKETS[0];

  return <main className="showcase" id="top">
    <header className="showcase-nav"><a href="#top" className="showcase-brand">BORO</a><span>INVITED PRODUCT PREVIEW</span><nav><a href="#capabilities">What it does</a><a href="#markets">Market cases</a><a href="#feedback">Feedback</a></nav><button type="button" onClick={async () => { await fetch("/api/review/logout", { method: "POST" }); window.location.href = "/"; }}>End review session</button></header>
    <section className="showcase-hero">
      <div><p className="eyebrow">WHARTON 2026 + FRIENDS · PRIVATE MVP REVIEW</p><h1>Real estate decisions,<br />made <em>legible.</em></h1><p>BORO helps investors move from market signal to a defensible next action. This guided review highlights the strongest current capabilities without exposing unfinished models, licensed data feeds or internal tooling.</p><div className="showcase-actions"><a href="#capabilities">See what BORO does</a><a href="#feedback">Share feedback</a></div></div>
      <aside><span>GUIDED REVIEW SNAPSHOT</span><strong>03</strong><b>representative market cases, chosen for a clear product story</b><dl><div><dt>Useful workflows</dt><dd>03</dd></div><div><dt>Measured tracts</dt><dd>17,959</dd></div><div><dt>Live calls exposed</dt><dd>00</dd></div><div><dt>Decision language</dt><dd>Clear</dd></div></dl><small>The broader research system stays behind the owner gate while each business case is validated.</small></aside>
    </section>
    <section className="showcase-thesis"><b>The product thesis</b><p>Most property tools give users more numbers. BORO organizes evidence around the decision: where to look, what to challenge, what must be verified, and why a candidate should advance—or stop.</p><span>SCREENING ≠ APPRAISAL</span></section>

    <section className="showcase-capabilities" id="capabilities">
      <header><div><p className="eyebrow">THE PRODUCT IN THREE MOVES</p><h2>Less dashboard.<br />More decision.</h2></div><p>This preview focuses on the moments where BORO should earn its place: narrowing a market, challenging a property and testing whether a deal holds up. Everything else stays out of the way.</p></header>
      <div className="showcase-capability-grid"><nav aria-label="BORO capability previews">{CAPABILITIES.map((item) => <button key={item.id} className={item.id === active.id ? "active" : ""} onClick={() => setActiveCapability(item.id)}><span>{item.number}</span><b>{item.label}</b><small>Guided sample</small></button>)}</nav><article><span>Reviewer capability</span><h3>{active.title}</h3><p>{active.text}</p><div><b>Evidence in the output</b><strong>{active.proof}</strong></div><ul><li>{active.output}</li><li>Visible sources, uncertainty and verification conditions</li><li>One recommended next action instead of another dashboard</li></ul><button type="button" disabled>Guided sample · reviewer mode</button></article></div>
    </section>

    <section className="showcase-evidence" id="markets">
      <div className="showcase-section-title"><div><p className="eyebrow">THREE MARKET CASES</p><h2>Different markets.<br />Different proof.</h2></div><p>These are deliberate examples, not a leaderboard. Each demonstrates a distinct capability and shows what the evidence can—and cannot—support today.</p></div>
      <div className="showcase-market-tabs" role="tablist" aria-label="Featured market cases">{FEATURED_MARKETS.map((item) => <button type="button" role="tab" aria-selected={item.id === market.id} key={item.id} className={item.id === market.id ? "active" : ""} onClick={() => setActiveMarket(item.id)}><span>{item.kicker}</span><b>{item.city}</b><small className={item.tone}>{item.status}</small></button>)}</div>
      <article className="showcase-market-case" aria-live="polite"><header><div><span>{market.kicker}</span><h3>{market.headline}</h3><p>{market.summary}</p></div><strong className={market.tone}>{market.status}</strong></header><dl>{market.metrics.map(([metricLabel, value]) => <div key={metricLabel}><dt>{metricLabel}</dt><dd>{value}</dd></div>)}</dl><div className="showcase-market-reading"><div><b>What BORO sees</b><p>{market.insight}</p></div><div><b>Useful next action</b><p>{market.action}</p></div></div></article>
      <div className="showcase-decision"><div><span>SAMPLE PROPERTY MEMO</span><h3>Advance to diligence—with conditions.</h3><p>The local signal and property context agree, but the recommendation stops short of underwriting until the listing and property-specific economics are verified.</p></div><ol><li><b>01</b><span>Confirm source-traceable active listing facts</span></li><li><b>02</b><span>Load bedroom-, bath- and square-footage-matched rent evidence</span></li><li><b>03</b><span>Run downside DSCR and cash flow before diligence spend</span></li></ol></div>
    </section>

    <section className="showcase-security"><div><p className="eyebrow">FOCUSED REVIEW MODE</p><h2>The value is visible.<br />The noise is not.</h2></div><p>Reviewers see these guided examples and the feedback channel. Live vendor calls, raw data, unfinished models, profile tools, reports and operating controls remain behind a separate server-enforced owner gate.</p></section>
    <ReviewFeedback />
    <footer><a href="#top">BORO</a><p>Private product research · evidence-first real estate intelligence</p><a className="showcase-owner-link" href="/review-repository">Owner access</a><span>Not investment, appraisal, legal or lending advice</span></footer>
  </main>;
}
