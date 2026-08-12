import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("priority-roadmap-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const ctx = { waitUntil() {}, passThroughOnException() {} };
const ownerIdentity = { "oai-authenticated-user-email": "owner@example.com" };

async function ownerCookie(worker, env) {
  const response = await worker.fetch(new Request("http://localhost/api/review/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ownerIdentity },
    body: JSON.stringify({ password: "owner-password" }),
  }), env, ctx);
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

function createPriorityDb() {
  const state = {
    rows: [],
    statements: [],
    feedback: [
      { failure_modes: JSON.stringify(["property_workflow"]) },
      { failure_modes: JSON.stringify(["model_scoring", "property_workflow"]) },
    ],
  };

  function statement(sql, values = []) {
    return {
      bind(...boundValues) { return statement(sql, boundValues); },
      async all() {
        if (/FROM priority_roadmap_items/.test(sql)) {
          const owner = values[0];
          const id = /AND id = \?/.test(sql) ? values[1] : null;
          return { results: state.rows.filter((row) => row.owner_key === owner && (!id || row.id === id)) };
        }
        if (/FROM review_feedback/.test(sql)) return { results: state.feedback };
        throw new Error(`Unexpected all SQL: ${sql}`);
      },
      async first() {
        if (/FROM priority_roadmap_items/.test(sql)) {
          const owner = values[0];
          const id = values[1];
          return state.rows.find((row) => row.owner_key === owner && row.id === id) ?? null;
        }
        throw new Error(`Unexpected first SQL: ${sql}`);
      },
      async run() {
        state.statements.push({ sql, values });
        if (/INSERT OR IGNORE INTO priority_roadmap_items/.test(sql)) {
          const [id, owner_key, seed_key, title, business_case, description, next_action, stage, estimated_tokens, impact, urgency, evidence, delivery_risk, feedback_bucket, created_at, updated_at] = values;
          if (!state.rows.some((row) => row.owner_key === owner_key && row.seed_key === seed_key)) state.rows.push({ id, owner_key, seed_key, title, business_case, description, next_action, stage, estimated_tokens, impact, urgency, evidence, delivery_risk, feedback_bucket, created_at, updated_at });
        } else if (/INSERT INTO priority_roadmap_items/.test(sql)) {
          const [id, owner_key, title, business_case, description, next_action, stage, estimated_tokens, impact, urgency, evidence, delivery_risk, feedback_bucket, created_at, updated_at] = values;
          state.rows.push({ id, owner_key, seed_key: null, title, business_case, description, next_action, stage, estimated_tokens, impact, urgency, evidence, delivery_risk, feedback_bucket, created_at, updated_at });
        } else if (/UPDATE priority_roadmap_items/.test(sql)) {
          const [title, business_case, description, next_action, stage, estimated_tokens, impact, urgency, evidence, delivery_risk, feedback_bucket, updated_at, id, owner_key] = values;
          const row = state.rows.find((candidate) => candidate.id === id && candidate.owner_key === owner_key);
          if (row) Object.assign(row, { title, business_case, description, next_action, stage, estimated_tokens, impact, urgency, evidence, delivery_risk, feedback_bucket, updated_at });
        } else if (/DELETE FROM priority_roadmap_items/.test(sql)) {
          const [id, owner_key] = values;
          state.rows = state.rows.filter((row) => row.id !== id || row.owner_key !== owner_key);
        } else throw new Error(`Unexpected run SQL: ${sql}`);
        return { success: true, meta: { changes: 1 } };
      },
    };
  }

  return {
    state,
    db: {
      prepare(sql) { return statement(sql); },
      async batch(statements) { return Promise.all(statements.map((item) => item.run())); },
    },
  };
}

test("priority roadmap migration creates an owner-scoped scored backlog", async () => {
  const migration = await readFile(new URL("../drizzle/0005_powerful_karen_page.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `priority_roadmap_items`/);
  assert.match(migration, /`estimated_tokens` integer NOT NULL/);
  assert.match(migration, /`delivery_risk` integer NOT NULL/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_priority_roadmap_owner_seed`/);
  assert.match(migration, /CREATE INDEX `idx_priority_roadmap_owner_stage_updated`/);
});

test("priority roadmap is owner-only, seeds the current portfolio, and ranks with review pressure", async () => {
  const worker = await loadWorker();
  const { db } = createPriorityDb();
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: db, REVIEW_PASSWORD: "review-password", FEEDBACK_ADMIN_PASSWORD: "owner-password", FEEDBACK_ADMIN_EMAIL: "owner@example.com" };

  const reviewLogin = await worker.fetch(new Request("http://localhost/api/review/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "review-password" }) }), env, ctx);
  const reviewerCookie = reviewLogin.headers.get("set-cookie").split(";")[0];
  const reviewerOnly = await worker.fetch(new Request("http://localhost/api/review/priority-roadmap", { headers: { Cookie: reviewerCookie, ...ownerIdentity } }), env, ctx);
  assert.equal(reviewerOnly.status, 401);

  const cookie = await ownerCookie(worker, env);
  const response = await worker.fetch(new Request("http://localhost/api/review/priority-roadmap", { headers: { Cookie: cookie, ...ownerIdentity } }), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json();
  assert.equal(payload.items.length, 8);
  assert.ok(payload.items.every((item, index, items) => index === 0 || items[index - 1].queueScore >= item.queueScore));
  assert.equal(payload.summary.unfinishedTokens, 128000);
  assert.equal(payload.summary.activeTokens, 42000);
  assert.equal(payload.summary.reviewSignals, 3);
  assert.equal(payload.summary.lowLiftWins.length, 1);
  assert.equal(payload.items.find((item) => item.seedKey === "property-evidence-truth").feedbackSignals, 2);
  assert.match(payload.formula.queueScore, /72% strategic value/);
  assert.match(payload.formula.tokenEstimate, /not a usage commitment/i);
});

test("custom roadmap writes derive ownership server-side and remain editable by stage", async () => {
  const worker = await loadWorker();
  const { db, state } = createPriorityDb();
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: db, FEEDBACK_ADMIN_PASSWORD: "owner-password", FEEDBACK_ADMIN_EMAIL: "owner@example.com" };
  const cookie = await ownerCookie(worker, env);
  const headers = { "Content-Type": "application/json", Origin: "http://localhost", Cookie: cookie, ...ownerIdentity };

  const created = await worker.fetch(new Request("http://localhost/api/review/priority-roadmap", {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Reconcile listing identity", businessCase: "Property trust", description: "Measure address-match failures before underwriting.", estimatedTokens: 6500, impact: 5, urgency: 4, evidence: 5, deliveryRisk: 2, feedbackBucket: "data_trust", ownerKey: "attacker@example.com" }),
  }), env, ctx);
  assert.equal(created.status, 201);
  const custom = state.rows.find((row) => row.seed_key === null);
  assert.equal(custom.owner_key, "owner@example.com");
  assert.equal(custom.estimated_tokens, 6500);

  const moved = await worker.fetch(new Request(`http://localhost/api/review/priority-roadmap/${custom.id}`, { method: "PATCH", headers, body: JSON.stringify({ stage: "active" }) }), env, ctx);
  assert.equal(moved.status, 200);
  assert.equal(state.rows.find((row) => row.id === custom.id).stage, "active");
  assert.ok(state.statements.some(({ sql, values }) => /WHERE id = \? AND owner_key = \?/.test(sql) && values.at(-1) === "owner@example.com"));
});

test("owner dashboard presents the scored roadmap as a separate four-stage Kanban", async () => {
  const component = await readFile(new URL("../app/review-repository/PriorityRoadmapKanban.tsx", import.meta.url), "utf8");
  const repository = await readFile(new URL("../app/review-repository/FeedbackRepository.tsx", import.meta.url), "utf8");
  assert.match(component, /What earns the/);
  assert.match(component, /Queue/);
  assert.match(component, /Active/);
  assert.match(component, /Validation/);
  assert.match(component, /Done/);
  assert.match(component, /P50 token estimate/);
  assert.match(component, /Reviewer pressure/);
  assert.match(repository, /<PriorityRoadmapKanban \/>/);
  assert.match(repository, /href="#priority-roadmap"/);
});
