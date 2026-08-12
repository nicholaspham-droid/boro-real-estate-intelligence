"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TargetType = "area" | "property";
type Snapshot = {
  label?: string;
  score?: number;
  competency?: number;
  confidence?: number;
  marketLabel?: string;
  recommendation?: string;
  price?: number;
  pricePerSqft?: number;
  observedAt?: string;
  sample?: boolean;
};

type Favorite = {
  id: string;
  targetType: TargetType;
  targetId: string;
  targetName: string;
  marketId: string | null;
  snapshot: Snapshot;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProfilePayload = {
  profile: { displayName: string; email: string; createdAt: string };
  favorites: Favorite[];
  counts: { all: number; areas: number; properties: number };
  auth: { provider: "google" | "chatgpt" };
};

type GoogleCredentialResponse = { credential?: string };
type GoogleIdentityApi = {
  initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }): void;
  renderButton(element: HTMLElement, options: Record<string, string | number>): void;
};

type GoogleWindow = Window & typeof globalThis & { google?: { accounts?: { id?: GoogleIdentityApi } } };

type SampleFavorite = {
  targetType: TargetType;
  targetId: string;
  targetName: string;
  marketId: string;
  snapshot: Snapshot;
};

const STARTER_SAVES: SampleFavorite[] = [
  {
    targetType: "area",
    targetId: "raleigh-west-corridor",
    targetName: "Raleigh · West Corridor",
    marketId: "raleigh",
    snapshot: { label: "Area research", score: 76, competency: 91, marketLabel: "Raleigh, NC", recommendation: "Validate current rent and listing depth", sample: true },
  },
  {
    targetType: "area",
    targetId: "new-york-central-core",
    targetName: "New York · Central Core",
    marketId: "new-york",
    snapshot: { label: "Area research", score: 71, competency: 88, marketLabel: "New York, NY", recommendation: "Compare tract-level price evidence", sample: true },
  },
  {
    targetType: "property",
    targetId: "cook-08214030100000",
    targetName: "6 Forest Ln, Barrington, IL",
    marketId: "chicago",
    snapshot: { label: "Property screen", confidence: 74, marketLabel: "Chicago, IL", recommendation: "Cross-check asking price and recorded sale", sample: true },
  },
];

function initials(value: string) {
  const parts = value.trim().split(/\s+|@/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "B";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function numberLabel(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "—";
}

function GoogleSignIn({ onAuthenticated }: { onAuthenticated: () => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function prepare() {
      try {
        const response = await fetch("/api/auth/config", { headers: { Accept: "application/json" } });
        const config = await response.json() as { googleClientId?: string; configured?: boolean };
        if (!active) return;
        if (!config.configured || !config.googleClientId) { setState("unavailable"); return; }
        const render = () => {
          const googleIdentity = (window as GoogleWindow).google?.accounts?.id;
          if (!active || !buttonRef.current || !googleIdentity) return;
          googleIdentity.initialize({
            client_id: config.googleClientId!, auto_select: false, cancel_on_tap_outside: true,
            callback: async ({ credential }: GoogleCredentialResponse) => {
              if (!credential) return;
              setMessage("Verifying your Google account…");
              const authResponse = await fetch("/api/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }) });
              const payload = await authResponse.json() as { error?: string };
              if (!authResponse.ok) { setMessage(payload.error || "Google sign-in could not be completed."); setState("error"); return; }
              onAuthenticated();
            },
          });
          buttonRef.current.replaceChildren();
          googleIdentity.renderButton(buttonRef.current, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: 320, logo_alignment: "left" });
          setState("ready");
        };
        if ((window as GoogleWindow).google?.accounts?.id) { render(); return; }
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true;
        script.onload = render;
        script.onerror = () => { if (active) { setState("error"); setMessage("Google sign-in could not load. Try again or use ChatGPT sign-in."); } };
        document.head.appendChild(script);
      } catch { if (active) { setState("error"); setMessage("The sign-in service is temporarily unavailable."); } }
    }
    void prepare();
    return () => { active = false; };
  }, [onAuthenticated]);

  return <div className="google-auth-control"><div ref={buttonRef} aria-label="Continue with Google" />{state === "loading" && <span>Preparing secure sign-in…</span>}{state === "unavailable" && <span>Google sign-in needs its web client ID before it can be enabled.</span>}{message && <span className={state === "error" ? "error" : ""}>{message}</span>}</div>;
}

export function ProfileWorkspace({ signOutPath, initialIdentity }: { signOutPath: string; initialIdentity?: { displayName: string; email: string } | null }) {
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [filter, setFilter] = useState<"all" | TargetType>("all");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const loadProfile = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    setNeedsSignIn(false);
    try {
      const response = await fetch("/api/profile", { headers: { Accept: "application/json" } });
      const payload = await response.json() as ProfilePayload & { error?: string };
      if (response.status === 401) {
        setNeedsSignIn(true);
        setStatus("ready");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Your research profile is unavailable.");
      setData(payload);
      setDraftNotes(Object.fromEntries(payload.favorites.map((favorite) => [favorite.id, favorite.notes ?? ""])));
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your research profile is unavailable.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/profile", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json() as ProfilePayload & { error?: string };
        if (response.status === 401) {
          if (active) { setNeedsSignIn(true); setStatus("ready"); }
          return;
        }
        if (!response.ok) throw new Error(payload.error || "Your research profile is unavailable.");
        if (!active) return;
        setData(payload);
        setNeedsSignIn(false);
        setDraftNotes(Object.fromEntries(payload.favorites.map((favorite) => [favorite.id, favorite.notes ?? ""])));
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Your research profile is unavailable.");
        setStatus("error");
      });
    return () => { active = false; };
  }, []);

  const visibleFavorites = useMemo(() => (data?.favorites ?? []).filter((favorite) => filter === "all" || favorite.targetType === filter), [data, filter]);
  const savedKeys = useMemo(() => new Set((data?.favorites ?? []).map((favorite) => `${favorite.targetType}:${favorite.targetId}`)), [data]);

  async function addFavorite(sample: SampleFavorite) {
    setBusyId(sample.targetId);
    setMessage("");
    try {
      const response = await fetch("/api/profile/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sample),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "This item could not be saved.");
      await loadProfile();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This item could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(favorite: Favorite) {
    setBusyId(favorite.id);
    setMessage("");
    try {
      const response = await fetch(`/api/profile/favorites/${encodeURIComponent(favorite.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: draftNotes[favorite.id] ?? "" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Your note could not be saved.");
      setData((current) => current ? { ...current, favorites: current.favorites.map((item) => item.id === favorite.id ? { ...item, notes: draftNotes[favorite.id] ?? "", updatedAt: new Date().toISOString() } : item) } : current);
      setMessage("Research note saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your note could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeFavorite(favorite: Favorite) {
    setBusyId(favorite.id);
    setMessage("");
    try {
      const response = await fetch(`/api/profile/favorites/${encodeURIComponent(favorite.id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "This favorite could not be removed.");
      setData((current) => current ? {
        ...current,
        favorites: current.favorites.filter((item) => item.id !== favorite.id),
        counts: {
          all: current.counts.all - 1,
          areas: current.counts.areas - (favorite.targetType === "area" ? 1 : 0),
          properties: current.counts.properties - (favorite.targetType === "property" ? 1 : 0),
        },
      } : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This favorite could not be removed.");
    } finally {
      setBusyId(null);
    }
  }

  async function signOut() {
    if (data?.auth.provider === "chatgpt") { window.location.assign(signOutPath); return; }
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  if (needsSignIn) return <main className="profile-workspace profile-auth-page">
    <header className="profile-topbar"><Link href="/" className="profile-brand">BORO<span>●</span></Link><Link href="/" className="profile-back">← Back to BORO</Link></header>
    <section className="profile-auth-shell">
      <div className="profile-auth-copy"><p className="profile-kicker">YOUR RESEARCH, ACROSS DEVICES</p><h1>Pick up where<br />you left off.</h1><p>Sign in to keep saved areas, properties and private diligence notes attached to your account. BORO never uses an email address as the ownership key.</p><div><span>01</span>Save a market or property screen</div><div><span>02</span>Carry evidence snapshots into diligence</div><div><span>03</span>Return from any browser</div></div>
      <aside className="profile-auth-card"><span>SECURE ACCOUNT ACCESS</span><h2>Continue to your profile</h2><p>Google credentials are verified by BORO’s server before a private session is created.</p><GoogleSignIn onAuthenticated={() => void loadProfile()} /><i>or</i><a href="/signin-with-chatgpt?return_to=%2Fprofile">Continue with ChatGPT</a><small>Each provider uses a separate stable account identifier. Profiles are never merged by matching email alone.</small></aside>
    </section>
  </main>;

  const profile = data?.profile ?? { displayName: initialIdentity?.displayName ?? "Your research profile", email: initialIdentity?.email ?? "", createdAt: new Date().toISOString() };

  return <main className="profile-workspace">
    <header className="profile-topbar">
      <Link href="/" className="profile-brand">BORO<span>●</span></Link>
      <Link href="/" className="profile-back">← Back to BORO</Link>
      <nav aria-label="Profile navigation"><Link href="/#workspace">Market explorer</Link><Link href="/#valuation">Properties</Link><b>Research profile</b></nav>
      <button onClick={() => void signOut()} className="profile-signout">Sign out</button>
    </header>

    <section className="profile-hero">
      <div className="profile-identity">
        <div className="profile-avatar" aria-hidden="true">{initials(profile.displayName)}</div>
        <div><p>PERSONAL RESEARCH WORKSPACE</p><h1>{profile.displayName}</h1><span>{profile.email}</span></div>
      </div>
      <div className="profile-principle"><span>DECISION HYGIENE</span><p>A favorite is a research lead, not a recommendation. Re-check price, rent, condition and evidence freshness before underwriting.</p></div>
    </section>

    <section className="profile-dashboard">
      <aside className="profile-rail">
        <p className="profile-kicker">YOUR PROFILE</p>
        <h2>One place for the evidence you want to revisit.</h2>
        <dl><div><dt>Saved research</dt><dd>{data?.counts.all ?? 0}</dd></div><div><dt>Areas</dt><dd>{data?.counts.areas ?? 0}</dd></div><div><dt>Properties</dt><dd>{data?.counts.properties ?? 0}</dd></div></dl>
        <small>Profile active since {dateLabel(profile.createdAt)}. Saves are private to this signed-in {data?.auth.provider === "google" ? "Google" : "ChatGPT"} identity and persist across devices.</small>
      </aside>

      <div className="profile-content">
        <div className="profile-content-head"><div><p className="profile-kicker">LIKES + FAVORITES</p><h2>Saved research</h2></div><div className="profile-tabs" role="tablist" aria-label="Filter saved research">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>{data?.counts.all ?? 0}</span></button>
          <button className={filter === "area" ? "active" : ""} onClick={() => setFilter("area")}>Areas <span>{data?.counts.areas ?? 0}</span></button>
          <button className={filter === "property" ? "active" : ""} onClick={() => setFilter("property")}>Properties <span>{data?.counts.properties ?? 0}</span></button>
        </div></div>

        {message && <div className="profile-message" role="status">{message}</div>}
        {status === "loading" && <div className="profile-loading"><i /><span>Loading your saved evidence…</span></div>}
        {status === "error" && <div className="profile-empty"><b>Research profile unavailable</b><p>{message}</p><button onClick={() => void loadProfile()}>Try again</button></div>}
        {status === "ready" && visibleFavorites.length === 0 && <div className="profile-empty"><b>No {filter === "all" ? "favorites" : `${filter}s`} saved yet.</b><p>Use the starter shelf below to test the workflow. Each save captures the evidence visible at that moment and can carry your own diligence note.</p></div>}

        {status === "ready" && visibleFavorites.length > 0 && <div className="favorite-grid">{visibleFavorites.map((favorite) => <article className="favorite-card" key={favorite.id}>
          <div className="favorite-card-head"><span className={`favorite-type ${favorite.targetType}`}>{favorite.targetType === "area" ? "AREA" : "PROPERTY"}</span><button aria-label={`Remove ${favorite.targetName} from favorites`} disabled={busyId === favorite.id} onClick={() => void removeFavorite(favorite)}>♥</button></div>
          <small>{favorite.snapshot.marketLabel ?? favorite.marketId ?? "Market research"} · saved {dateLabel(favorite.createdAt)}</small>
          <h3>{favorite.targetName}</h3>
          <p className="favorite-next">{favorite.snapshot.recommendation ?? "Re-open the evidence and define the next diligence step."}</p>
          <div className="favorite-evidence">
            {typeof favorite.snapshot.score === "number" && <span><b>{numberLabel(favorite.snapshot.score)}</b>Signal</span>}
            {typeof favorite.snapshot.competency === "number" && <span><b>{numberLabel(favorite.snapshot.competency)}%</b>Competency</span>}
            {typeof favorite.snapshot.confidence === "number" && <span><b>{numberLabel(favorite.snapshot.confidence)}%</b>Confidence</span>}
            {typeof favorite.snapshot.price === "number" && <span><b>${favorite.snapshot.price.toLocaleString("en-US")}</b>Observed price</span>}
          </div>
          <label>Private diligence note<textarea maxLength={2000} value={draftNotes[favorite.id] ?? ""} onChange={(event) => setDraftNotes((current) => ({ ...current, [favorite.id]: event.target.value }))} placeholder="What must be true before this advances?" /></label>
          <div className="favorite-actions"><Link href={favorite.targetType === "area" ? `/#workspace` : `/#valuation`}>Re-open analysis →</Link><button disabled={busyId === favorite.id || (draftNotes[favorite.id] ?? "") === (favorite.notes ?? "")} onClick={() => void saveNote(favorite)}>{busyId === favorite.id ? "Saving…" : "Save note"}</button></div>
        </article>)}</div>}

        <section className="starter-shelf"><div><p className="profile-kicker">SAMPLE COLLECTION</p><h2>Try the save workflow.</h2><span>These are clearly marked starter records. Saving one creates a private D1 record that can later be refreshed from the live analysis surface.</span></div><div>{STARTER_SAVES.map((sample) => {
          const saved = savedKeys.has(`${sample.targetType}:${sample.targetId}`);
          return <article key={`${sample.targetType}:${sample.targetId}`}><span>{sample.targetType}</span><h3>{sample.targetName}</h3><p>{sample.snapshot.recommendation}</p><button disabled={saved || busyId === sample.targetId} onClick={() => void addFavorite(sample)}>{saved ? "Saved ✓" : busyId === sample.targetId ? "Saving…" : "♡ Save sample"}</button></article>;
        })}</div></section>
      </div>
    </section>
  </main>;
}
