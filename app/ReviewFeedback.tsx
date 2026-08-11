"use client";

import { useState } from "react";

type RatingName = "usefulness" | "trust" | "clarity";

const RATING_FIELDS: Array<{ name: RatingName; label: string; low: string; high: string }> = [
  { name: "usefulness", label: "Useful for screening", low: "Not useful", high: "Very useful" },
  { name: "trust", label: "Trust in the evidence", low: "Low confidence", high: "High confidence" },
  { name: "clarity", label: "Clarity of the workflow", low: "Confusing", high: "Very clear" },
];

const INITIAL_RATINGS: Record<RatingName, number> = { usefulness: 0, trust: 0, clarity: 0 };

const FAILURE_MODES = [
  ["data_trust", "Data trust"],
  ["data_coverage", "Missing data"],
  ["model_scoring", "Score / model"],
  ["ux_navigation", "Navigation"],
  ["map_visualization", "Map / charts"],
  ["property_workflow", "Property workflow"],
  ["performance_error", "Bug / performance"],
  ["value_proposition", "Unclear value"],
] as const;

export function ReviewFeedback() {
  const [ratings, setRatings] = useState(INITIAL_RATINGS);
  const [failureModes, setFailureModes] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (Object.values(ratings).some((value) => value === 0)) {
      setStatus("error");
      setMessage("Please add all three ratings before sending.");
      return;
    }
    setStatus("sending");
    setMessage("");
    const values = new FormData(form);
    const payload = {
      reviewerName: values.get("reviewerName"),
      reviewerEmail: values.get("reviewerEmail"),
      ...ratings,
      featureArea: values.get("featureArea"),
      failureModes,
      reviewerIntent: values.get("reviewerIntent"),
      mostValuable: values.get("mostValuable"),
      confusing: values.get("confusing"),
      nextFeature: values.get("nextFeature"),
      notes: values.get("notes"),
      sourcePath: window.location.pathname,
    };
    try {
      const response = await fetch("/api/review/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Feedback could not be saved.");
      form.reset();
      setRatings(INITIAL_RATINGS);
      setFailureModes([]);
      setStatus("sent");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Feedback could not be saved.");
    }
  }

  if (status === "sent") {
    return (
      <section className="review-section" id="feedback">
        <div className="review-thanks">
          <span>FEEDBACK RECEIVED</span>
          <h2>Thank you—this will shape the next build.</h2>
          <p>Your response is stored privately and will be reviewed alongside the other MVP notes.</p>
          <button type="button" onClick={() => setStatus("idle")}>Send another response</button>
        </div>
      </section>
    );
  }

  return (
    <section className="review-section" id="feedback">
      <div className="review-intro">
        <p className="eyebrow">PRIVATE MVP REVIEW · 2–3 MINUTES</p>
        <h1>Help pressure-test<br />the investment workflow.</h1>
        <p>Explore the product first, then tell us what feels genuinely useful, what you do not trust yet, and what would make you come back. There is no marketing signup.</p>
        <div><b>Useful feedback is specific.</b><span>Which screen, score, comparison or explanation changed—or failed to change—your thinking?</span></div>
      </div>
      <form className="review-form" onSubmit={submit}>
        <div className="review-identity">
          <label><span>Name <i>optional</i></span><input name="reviewerName" autoComplete="name" maxLength={120} /></label>
          <label><span>Email <i>optional</i></span><input name="reviewerEmail" type="email" autoComplete="email" maxLength={160} /></label>
        </div>
        <fieldset className="review-ratings">
          <legend>Quick scorecard</legend>
          {RATING_FIELDS.map((field) => (
            <div key={field.name}>
              <label>{field.label}</label>
              <small>{field.low}</small>
              <div role="group" aria-label={`${field.label}, 1 to 5`}>
                {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-pressed={ratings[field.name] === value} onClick={() => setRatings((current) => ({ ...current, [field.name]: value }))}>{value}</button>)}
              </div>
              <small>{field.high}</small>
            </div>
          ))}
        </fieldset>
        <div className="review-classify">
          <label><span>Where were you when this feedback formed?</span><select name="featureArea" defaultValue="overall"><option value="overall">Across the product</option><option value="overview">Overview</option><option value="market_explorer">Market Explorer</option><option value="tract_drilldown">Tract drill-down pilot</option><option value="top_areas">Top Areas</option><option value="deal_studio">Deal Studio</option><option value="properties">Properties</option><option value="data_coverage">Data Coverage</option></select></label>
          <fieldset><legend>Where did the experience break down? <i>Choose any that apply</i></legend><div>{FAILURE_MODES.map(([id, label]) => <button key={id} type="button" aria-pressed={failureModes.includes(id)} onClick={() => setFailureModes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}>{label}</button>)}</div></fieldset>
          <fieldset className="review-intent"><legend>Would you use a stronger version?</legend><div><label><input type="radio" name="reviewerIntent" value="yes" /> Yes</label><label><input type="radio" name="reviewerIntent" value="maybe" defaultChecked /> Maybe</label><label><input type="radio" name="reviewerIntent" value="no" /> No</label></div></fieldset>
        </div>
        <div className="review-prompts">
          <label><span>What was most valuable?</span><textarea name="mostValuable" required maxLength={1500} placeholder="A screen, comparison, score, or insight…" /></label>
          <label><span>What felt confusing or untrustworthy?</span><textarea name="confusing" required maxLength={1500} placeholder="A data gap, claim, interaction, or missing explanation…" /></label>
          <label><span>What would make you use it again?</span><textarea name="nextFeature" required maxLength={1500} placeholder="A workflow, dataset, market, export, or decision tool…" /></label>
          <label><span>Anything else? <i>optional</i></span><textarea name="notes" maxLength={2500} placeholder="Open notes…" /></label>
        </div>
        <div className="review-submit">
          <p>Your response is visible only to the BORO team.</p>
          {status === "error" && <b role="alert">{message}</b>}
          <button type="submit" disabled={status === "sending"}>{status === "sending" ? "Saving…" : "Send private feedback →"}</button>
        </div>
      </form>
    </section>
  );
}
