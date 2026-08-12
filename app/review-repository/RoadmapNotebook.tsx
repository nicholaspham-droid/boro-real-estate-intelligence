"use client";

import { useEffect, useState } from "react";

type RoadmapNote = {
  id: string;
  title: string;
  businessCase: string;
  notes: string;
  nextAction: string | null;
  priority: "high" | "medium" | "low";
  status: "idea" | "researching" | "building" | "validating" | "ready";
  horizon: "now" | "next" | "later";
  createdAt: string;
  updatedAt: string;
};

const HORIZONS = ["now", "next", "later"] as const;
const STATUSES = ["idea", "researching", "building", "validating", "ready"] as const;
const PRIORITIES = ["high", "medium", "low"] as const;

function displayLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function RoadmapCard({ note, onSaved, onRemoved }: { note: RoadmapNote; onSaved: (note: RoadmapNote) => void; onRemoved: (id: string) => void }) {
  const [draft, setDraft] = useState(note);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);

  async function save() {
    setMessage("Saving…");
    const response = await fetch(`/api/review/roadmap/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const result = await response.json() as { note?: RoadmapNote; error?: string };
    if (!response.ok || !result.note) { setMessage(result.error ?? "Could not save this note."); return; }
    onSaved(result.note);
    setDraft(result.note);
    setEditing(false);
    setMessage("Saved");
  }

  async function remove() {
    if (!window.confirm(`Remove “${note.title}” from the roadmap?`)) return;
    const response = await fetch(`/api/review/roadmap/${note.id}`, { method: "DELETE" });
    if (!response.ok) { setMessage("Could not remove this note."); return; }
    onRemoved(note.id);
  }

  return <article className={`roadmap-card priority-${draft.priority}`}>
    <header><span>{displayLabel(draft.businessCase)}</span><b>{displayLabel(draft.priority)}</b></header>
    {editing ? <div className="roadmap-card-editor">
      <label>Title<input value={draft.title} maxLength={180} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Business case<input value={draft.businessCase} maxLength={80} onChange={(event) => setDraft({ ...draft, businessCase: event.target.value })} /></label>
      <label>Notes<textarea value={draft.notes} maxLength={4000} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      <label>Next action<textarea value={draft.nextAction ?? ""} maxLength={1000} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} /></label>
    </div> : <><h3>{draft.title}</h3><p>{draft.notes}</p>{draft.nextAction && <div className="roadmap-next"><b>Next action</b><span>{draft.nextAction}</span></div>}</>}
    <div className="roadmap-card-controls"><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as RoadmapNote["status"] })}>{STATUSES.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}</select></label><label>Horizon<select value={draft.horizon} onChange={(event) => setDraft({ ...draft, horizon: event.target.value as RoadmapNote["horizon"] })}>{HORIZONS.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as RoadmapNote["priority"] })}>{PRIORITIES.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}</select></label></div>
    <footer><small>{message || `Updated ${new Date(note.updatedAt).toLocaleDateString()}`}</small><div><button type="button" onClick={() => { setDraft(note); setEditing(!editing); }}>{editing ? "Cancel" : "Edit note"}</button><button type="button" onClick={() => void save()}>Save</button><button type="button" className="roadmap-remove" onClick={() => void remove()}>Remove</button></div></footer>
  </article>;
}

export function RoadmapNotebook() {
  const [notes, setNotes] = useState<RoadmapNote[]>([]);
  const [message, setMessage] = useState("Loading roadmap…");

  useEffect(() => {
    let active = true;
    fetch("/api/review/roadmap", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const result = await response.json() as { notes?: RoadmapNote[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Roadmap unavailable.");
        if (active) { setNotes(result.notes ?? []); setMessage(""); }
      })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Roadmap unavailable."); });
    return () => { active = false; };
  }, []);

  async function createNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setMessage("Adding roadmap note…");
    const response = await fetch("/api/review/roadmap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(values)) });
    const result = await response.json() as { note?: RoadmapNote; error?: string };
    if (!response.ok || !result.note) { setMessage(result.error ?? "Could not add this note."); return; }
    setNotes((current) => [result.note!, ...current]);
    form.reset();
    setMessage("Roadmap note added.");
  }

  return <section className="roadmap-notebook" id="roadmap">
    <div className="repository-title"><div><p>PRIVATE PRODUCT ROADMAP</p><h2>Notes that become decisions.</h2></div><span>Owner-only working memory for business cases, build priorities and the next proof required.</span></div>
    <form className="roadmap-compose" onSubmit={createNote}>
      <div><label>Roadmap item<input name="title" required maxLength={180} placeholder="e.g. Validate property monitor retention loop" /></label><label>Business case<input name="businessCase" required maxLength={80} placeholder="e.g. Portfolio monitoring" /></label></div>
      <label>Working notes<textarea name="notes" required maxLength={4000} placeholder="What problem are we solving, for whom, and what evidence would change our mind?" /></label>
      <label>Next proof or action<textarea name="nextAction" maxLength={1000} placeholder="One concrete next step" /></label>
      <div><label>Horizon<select name="horizon" defaultValue="now">{HORIZONS.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}</select></label><label>Priority<select name="priority" defaultValue="high">{PRIORITIES.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}</select></label><label>Status<select name="status" defaultValue="idea">{STATUSES.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}</select></label><button>Add to roadmap →</button></div>
      <p role="status">{message}</p>
    </form>
    <div className="roadmap-lanes">{HORIZONS.map((horizon) => { const laneNotes = notes.filter((note) => note.horizon === horizon); return <section key={horizon}><header><b>{displayLabel(horizon)}</b><span>{laneNotes.length}</span></header><div>{laneNotes.map((note) => <RoadmapCard key={note.id} note={note} onSaved={(saved) => setNotes((current) => current.map((item) => item.id === saved.id ? saved : item))} onRemoved={(id) => setNotes((current) => current.filter((item) => item.id !== id))} />)}{laneNotes.length === 0 && <p className="roadmap-empty">No owner notes in this horizon.</p>}</div></section>; })}</div>
  </section>;
}
