"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RoadmapNotebook } from "./RoadmapNotebook";

type Entry = {
  id: number;
  createdAt: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  usefulness: number;
  trust: number;
  clarity: number;
  mostValuable: string;
  confusing: string;
  nextFeature: string;
  notes: string | null;
  featureArea: string;
  failureModes: string[];
  reviewerIntent: string;
  triageStatus: string;
  impactLane: string;
};

type Repository = {
  entries: Entry[];
  summary: { total: number; averageUsefulness: number; averageTrust: number; averageClarity: number; modelReviewCount: number; wouldUseCount: number };
  buckets: Array<{ id: string; label: string; count: number; lane: string }>;
};

const BUCKET_LABELS: Record<string, string> = {
  data_trust: "Data trust", data_coverage: "Missing data", model_scoring: "Score / model", ux_navigation: "Navigation",
  map_visualization: "Map / charts", property_workflow: "Property workflow", performance_error: "Bug / performance", value_proposition: "Unclear value",
};
const STATUS_OPTIONS = ["new", "reviewing", "actioned", "closed"];
const LANE_OPTIONS = ["untriaged", "model_review", "data_pipeline", "product_ux", "engineering", "product_strategy"];

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function FeedbackRepository({ ownerEmail }: { ownerEmail: string }) {
  const [repository, setRepository] = useState<Repository | null>(null);
  const [access, setAccess] = useState<"loading" | "locked" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [bucket, setBucket] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [featureFilter, setFeatureFilter] = useState("all");

  async function load() {
    setAccess("loading");
    try {
      const response = await fetch("/api/review/repository", { headers: { Accept: "application/json" } });
      if (response.status === 401) { setAccess("locked"); return; }
      const result = await response.json() as Repository & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Repository unavailable.");
      setRepository(result);
      setAccess("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Repository unavailable.");
      setAccess("error");
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/review/repository", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) { setAccess("locked"); return; }
        const result = await response.json() as Repository & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Repository unavailable.");
        if (active) { setRepository(result); setAccess("ready"); }
      })
      .catch((error: unknown) => { if (active) { setMessage(error instanceof Error ? error.message : "Repository unavailable."); setAccess("error"); } });
    return () => { active = false; };
  }, []);

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    const response = await fetch("/api/review/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: form.get("password") }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setMessage(result.error ?? "Access denied."); return; }
    window.location.href = "/";
  }

  async function updateEntry(entry: Entry, field: "triageStatus" | "impactLane", value: string) {
    const response = await fetch(`/api/review/repository/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
    if (!response.ok) { setMessage("The triage update could not be saved."); return; }
    setRepository((current) => current ? { ...current, entries: current.entries.map((item) => item.id === entry.id ? { ...item, [field]: value } : item) } : current);
  }

  const features = useMemo(() => Array.from(new Set(repository?.entries.map((entry) => entry.featureArea) ?? [])).sort(), [repository]);
  const visible = useMemo(() => (repository?.entries ?? []).filter((entry) => (bucket === "all" || entry.failureModes.includes(bucket)) && (statusFilter === "all" || entry.triageStatus === statusFilter) && (featureFilter === "all" || entry.featureArea === featureFilter)), [repository, bucket, statusFilter, featureFilter]);

  if (access === "loading") return <main className="repository-lock"><span>BORO · OWNER REPOSITORY</span><h1>Loading feedback…</h1></main>;
  if (access === "locked") return <main className="repository-lock"><span>BORO · OWNER WORKSPACE</span><h1>Identity verified. Complete step two.</h1><p>Signed in as {ownerEmail}. Enter the owner password to unlock live connectors, model workbenches, reports, profiles and feedback triage for this browser session.</p><form onSubmit={unlock}><label htmlFor="owner-password">Owner password · step 2 of 2</label><input id="owner-password" name="password" type="password" autoComplete="current-password" required /><button>Unlock owner workspace →</button><b role="alert">{message}</b></form><Link href="/showcase">← Back to reviewer preview</Link></main>;
  if (access === "error" || !repository) return <main className="repository-lock"><h1>Repository unavailable.</h1><p>{message}</p><button onClick={() => void load()}>Try again</button></main>;

  return <main className="feedback-repository">
    <header><div><Link href="/">BORO</Link><span>Owner workspace</span><nav><a href="#roadmap">Roadmap notes</a></nav></div><button onClick={() => void load()}>Refresh feedback</button></header>
    <section className="repository-hero"><div><p>FEEDBACK REPOSITORY · FAILURE-MODE TRIAGE</p><h1>Turn comments into<br />testable decisions.</h1></div><aside><b>Model change rule</b><p>Qualitative feedback creates a review candidate—not a score change. Reproduce the issue, audit the affected data, define a measurable hypothesis, and backtest before changing weights or rankings.</p></aside></section>
    <RoadmapNotebook />
    <section className="repository-metrics"><article><span>Total responses</span><b>{repository.summary.total}</b></article><article><span>Usefulness</span><b>{repository.summary.averageUsefulness.toFixed(1)}<i>/5</i></b></article><article><span>Evidence trust</span><b>{repository.summary.averageTrust.toFixed(1)}<i>/5</i></b></article><article><span>Workflow clarity</span><b>{repository.summary.averageClarity.toFixed(1)}<i>/5</i></b></article><article className="attention"><span>Model-review candidates</span><b>{repository.summary.modelReviewCount}</b></article><article><span>Would use stronger version</span><b>{repository.summary.wouldUseCount}</b></article></section>
    <section className="failure-buckets"><div className="repository-title"><div><p>FAILURE-MODE BUCKETS</p><h2>Where confidence breaks.</h2></div><span>Click a bucket to filter the review queue.</span></div><div><button className={bucket === "all" ? "active" : ""} onClick={() => setBucket("all")}><b>{repository.summary.total}</b><span>All feedback</span><small>Full repository</small></button>{repository.buckets.map((item) => <button key={item.id} className={bucket === item.id ? "active" : ""} onClick={() => setBucket(item.id)}><b>{item.count}</b><span>{item.label}</span><small>{label(item.lane)}</small></button>)}</div></section>
    <section className="review-queue"><div className="repository-title"><div><p>REVIEW QUEUE</p><h2>{visible.length} matching response{visible.length === 1 ? "" : "s"}</h2></div><div className="repository-filters"><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Feature<select value={featureFilter} onChange={(event) => setFeatureFilter(event.target.value)}><option value="all">All features</option>{features.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label></div></div>
      <div className="repository-list">{visible.map((entry) => <article key={entry.id}>
        <div className="repository-entry-head"><div><span>#{entry.id} · {new Date(entry.createdAt).toLocaleDateString()}</span><h3>{entry.reviewerName || "Anonymous reviewer"}</h3><small>{entry.reviewerEmail || "No email"} · {label(entry.featureArea)} · Intent: {label(entry.reviewerIntent)}</small></div><div className="entry-ratings"><span><b>{entry.usefulness}</b>Useful</span><span><b>{entry.trust}</b>Trust</span><span><b>{entry.clarity}</b>Clear</span></div></div>
        <div className="entry-buckets">{entry.failureModes.length ? entry.failureModes.map((item) => <span key={item}>{BUCKET_LABELS[item] ?? label(item)}</span>) : <span className="positive">No failure mode selected</span>}</div>
        <div className="entry-copy"><div><b>Most valuable</b><p>{entry.mostValuable}</p></div><div><b>Confusing / untrusted</b><p>{entry.confusing}</p></div><div><b>Would bring them back</b><p>{entry.nextFeature}</p></div>{entry.notes && <div><b>Additional notes</b><p>{entry.notes}</p></div>}</div>
        <div className="entry-triage"><label>Status<select value={entry.triageStatus} onChange={(event) => void updateEntry(entry, "triageStatus", event.target.value)}>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Impact lane<select value={entry.impactLane} onChange={(event) => void updateEntry(entry, "impactLane", event.target.value)}>{LANE_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label></div>
      </article>)}{visible.length === 0 && <div className="repository-empty">No responses match these filters yet.</div>}</div>
    </section>
  </main>;
}
