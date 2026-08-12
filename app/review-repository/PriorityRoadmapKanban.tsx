"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Stage = "queue" | "active" | "validation" | "done";

type PriorityRoadmapItem = {
  id: string;
  seedKey: string | null;
  title: string;
  businessCase: string;
  description: string;
  nextAction: string | null;
  stage: Stage;
  estimatedTokens: number;
  tokenLow: number;
  tokenHigh: number;
  impact: number;
  urgency: number;
  evidence: number;
  deliveryRisk: number;
  feedbackBucket: string | null;
  feedbackSignals: number;
  valueScore: number;
  tokenEfficiency: number;
  reviewPressure: number;
  queueScore: number;
  updatedAt: string;
};

type RoadmapPayload = {
  items: PriorityRoadmapItem[];
  summary: {
    unfinishedTokens: number;
    activeTokens: number;
    lowLiftWins: string[];
    reviewSignals: number;
  };
  formula: {
    queueScore: string;
    strategicValue: string;
    tokenEstimate: string;
  };
};

const STAGES: Array<{ id: Stage; number: string; label: string; description: string }> = [
  { id: "queue", number: "01", label: "Queue", description: "Ranked and ready to pull" },
  { id: "active", number: "02", label: "Active", description: "Current build allocation" },
  { id: "validation", number: "03", label: "Validation", description: "Prove before release" },
  { id: "done", number: "04", label: "Done", description: "Shipped or closed" },
];

const BUCKET_LABELS: Record<string, string> = {
  data_trust: "Data trust",
  data_coverage: "Missing data",
  model_scoring: "Score / model",
  ux_navigation: "Navigation",
  map_visualization: "Map / charts",
  property_workflow: "Property workflow",
  performance_error: "Bug / performance",
  value_proposition: "Unclear value",
};

function formatTokens(value: number) {
  if (value < 1000) return `${value}`;
  const thousands = value / 1000;
  return `${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
}

function ratingLabel(value: number) {
  return ["", "Very low", "Low", "Medium", "High", "Very high"][value] ?? String(value);
}

function RatingSelect({ name, label, value }: { name: string; label: string; value: number }) {
  return <label>{label}<select name={name} defaultValue={value}>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} · {ratingLabel(rating)}</option>)}</select></label>;
}

export function PriorityRoadmapKanban() {
  const [payload, setPayload] = useState<RoadmapPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const result = await response.json() as RoadmapPayload & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "The priority roadmap could not be updated.");
    setPayload(result);
    setStatus("ready");
  }

  useEffect(() => {
    let active = true;
    fetch("/api/review/priority-roadmap", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const result = await response.json() as RoadmapPayload & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "The priority roadmap is unavailable.");
        if (active) { setPayload(result); setStatus("ready"); }
      })
      .catch((error: unknown) => {
        if (active) { setMessage(error instanceof Error ? error.message : "The priority roadmap is unavailable."); setStatus("error"); }
      });
    return () => { active = false; };
  }, []);

  const byStage = useMemo(() => {
    const groups = new Map<Stage, PriorityRoadmapItem[]>(STAGES.map((stage) => [stage.id, []]));
    for (const item of payload?.items ?? []) groups.get(item.stage)?.push(item);
    return groups;
  }, [payload]);

  async function patchItem(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setMessage("");
    try {
      await request(`/api/review/priority-roadmap/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The priority roadmap could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function tuneItem(item: PriorityRoadmapItem, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await patchItem(item.id, {
      estimatedTokens: Number(form.get("estimatedTokens")),
      impact: Number(form.get("impact")),
      urgency: Number(form.get("urgency")),
      evidence: Number(form.get("evidence")),
      deliveryRisk: Number(form.get("deliveryRisk")),
      feedbackBucket: form.get("feedbackBucket"),
      nextAction: form.get("nextAction"),
    });
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusyId("new");
    setMessage("");
    try {
      await request("/api/review/priority-roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"), businessCase: form.get("businessCase"), description: form.get("description"), nextAction: form.get("nextAction"),
          stage: form.get("stage"), estimatedTokens: Number(form.get("estimatedTokens")), impact: Number(form.get("impact")), urgency: Number(form.get("urgency")),
          evidence: Number(form.get("evidence")), deliveryRisk: Number(form.get("deliveryRisk")), feedbackBucket: form.get("feedbackBucket"),
        }),
      });
      formElement.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The workstream could not be added.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(item: PriorityRoadmapItem) {
    if (item.seedKey || !window.confirm(`Remove “${item.title}” from the roadmap?`)) return;
    setBusyId(item.id);
    setMessage("");
    try {
      await request(`/api/review/priority-roadmap/${item.id}`, { method: "DELETE" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The workstream could not be removed.");
    } finally {
      setBusyId(null);
    }
  }

  return <section id="priority-roadmap" className="priority-roadmap">
    <div className="priority-roadmap-heading">
      <div><p>PRIORITY + TOKEN ROADMAP</p><h2>What earns the<br />next token?</h2></div>
      <aside><b>Decision rule</b><p>High-value evidence work rises. Expensive, uncertain work falls. Open reviewer failure modes add pressure, but never override model validation.</p></aside>
    </div>

    {status === "loading" && <div className="priority-roadmap-state">Building the ranked owner roadmap…</div>}
    {status === "error" && <div className="priority-roadmap-state error"><b>Roadmap unavailable</b><span>{message}</span></div>}

    {payload && <>
      <div className="priority-roadmap-metrics">
        <article><span>Unfinished P50</span><b>{formatTokens(payload.summary.unfinishedTokens)}</b><small>estimated tokens</small></article>
        <article><span>In flight</span><b>{formatTokens(payload.summary.activeTokens)}</b><small>active + validation</small></article>
        <article><span>Low-lift wins</span><b>{payload.summary.lowLiftWins.length}</b><small>≤15k tokens</small></article>
        <article><span>Review pressure</span><b>{payload.summary.reviewSignals}</b><small>open failure signals</small></article>
      </div>

      <div className="priority-roadmap-formula">
        <div><span>72%</span><b>Strategic value</b><small>Impact, urgency, evidence and inverse delivery risk</small></div>
        <div><span>18%</span><b>Token efficiency</b><small>Rewards useful scope that can ship with less effort</small></div>
        <div><span>+10</span><b>Reviewer pressure</b><small>Open failure-mode feedback can add up to ten points</small></div>
        <p>{payload.formula.tokenEstimate}. Scores rank the backlog; they do not authorize model changes.</p>
      </div>

      {message && <p className="priority-roadmap-message" role="alert">{message}</p>}

      <div className="priority-kanban" aria-label="Priority roadmap Kanban board">
        {STAGES.map((stage) => {
          const items = byStage.get(stage.id) ?? [];
          return <section key={stage.id} className={`priority-lane lane-${stage.id}`}>
            <header><div><span>{stage.number}</span><b>{stage.label}</b><small>{stage.description}</small></div><i>{items.length}</i></header>
            <div className="priority-lane-stack">
              {items.map((item) => {
                const lowLift = payload.summary.lowLiftWins.includes(item.id);
                return <article key={item.id} className={`priority-card${lowLift ? " low-lift" : ""}`}>
                  <header><span>{item.businessCase}</span><strong aria-label={`Priority score ${item.queueScore} out of 100`}>{item.queueScore}<small>/100</small></strong></header>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div className="priority-token-band"><b>~{formatTokens(item.estimatedTokens)}</b><span>P50 token estimate</span><small>{formatTokens(item.tokenLow)}–{formatTokens(item.tokenHigh)} planning range</small></div>
                  <div className="priority-factor-grid">
                    <span><b>{item.impact}/5</b>Impact</span><span><b>{item.urgency}/5</b>Urgency</span><span><b>{item.evidence}/5</b>Evidence</span><span><b>{item.deliveryRisk}/5</b>Risk</span>
                  </div>
                  {(item.feedbackBucket || lowLift) && <div className="priority-signals">{lowLift && <span>Low-lift win</span>}{item.feedbackBucket && <span>{BUCKET_LABELS[item.feedbackBucket] ?? item.feedbackBucket} · {item.feedbackSignals} signal{item.feedbackSignals === 1 ? "" : "s"}</span>}</div>}
                  {item.nextAction && <div className="priority-next"><b>Next proof point</b><p>{item.nextAction}</p></div>}
                  <label className="priority-stage-control">Move stage<select value={item.stage} disabled={busyId === item.id} onChange={(event) => void patchItem(item.id, { stage: event.target.value })}>{STAGES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                  <details className="priority-card-tune"><summary>Tune estimate + factors</summary><form onSubmit={(event) => void tuneItem(item, event)}>
                    <label>Token estimate<input name="estimatedTokens" type="number" min="500" max="200000" step="500" defaultValue={item.estimatedTokens} required /></label>
                    <div><RatingSelect name="impact" label="Impact" value={item.impact} /><RatingSelect name="urgency" label="Urgency" value={item.urgency} /><RatingSelect name="evidence" label="Evidence" value={item.evidence} /><RatingSelect name="deliveryRisk" label="Delivery risk" value={item.deliveryRisk} /></div>
                    <label>Reviewer failure mode<select name="feedbackBucket" defaultValue={item.feedbackBucket ?? ""}><option value="">No linked bucket</option>{Object.entries(BUCKET_LABELS).map(([id, bucketLabel]) => <option key={id} value={id}>{bucketLabel}</option>)}</select></label>
                    <label>Next proof point<textarea name="nextAction" defaultValue={item.nextAction ?? ""} /></label>
                    <footer><button disabled={busyId === item.id}>Save scoring inputs</button>{!item.seedKey && <button type="button" className="priority-remove" disabled={busyId === item.id} onClick={() => void removeItem(item)}>Remove</button>}</footer>
                  </form></details>
                </article>;
              })}
              {!items.length && <p className="priority-lane-empty">No workstreams in this stage.</p>}
            </div>
          </section>;
        })}
      </div>

      <details className="priority-roadmap-add"><summary>+ Add a scored workstream</summary><form onSubmit={(event) => void createItem(event)}>
        <div><label>Workstream title<input name="title" maxLength={180} required /></label><label>Business case<input name="businessCase" maxLength={100} defaultValue="Product strategy" required /></label></div>
        <label>Decision-oriented description<textarea name="description" maxLength={2500} required /></label>
        <label>Next proof point<textarea name="nextAction" maxLength={1200} /></label>
        <div className="priority-add-classification"><label>Stage<select name="stage" defaultValue="queue">{STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label><label>Token estimate<input name="estimatedTokens" type="number" min="500" max="200000" step="500" defaultValue="8000" required /></label><label>Feedback bucket<select name="feedbackBucket" defaultValue=""><option value="">No linked bucket</option>{Object.entries(BUCKET_LABELS).map(([id, bucketLabel]) => <option key={id} value={id}>{bucketLabel}</option>)}</select></label></div>
        <div className="priority-add-ratings"><RatingSelect name="impact" label="Impact" value={3} /><RatingSelect name="urgency" label="Urgency" value={3} /><RatingSelect name="evidence" label="Evidence" value={3} /><RatingSelect name="deliveryRisk" label="Delivery risk" value={3} /></div>
        <button disabled={busyId === "new"}>{busyId === "new" ? "Scoring…" : "Add + score workstream"}</button>
      </form></details>
    </>}
  </section>;
}
