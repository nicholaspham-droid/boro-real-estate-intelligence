import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("roadmap-test", `${process.pid}-${Date.now()}-${Math.random()}`);
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

test("roadmap migration creates durable owner-scoped notes and the supporting query index", async () => {
  const migration = await readFile(new URL("../drizzle/0004_overjoyed_meteorite.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `roadmap_notes`/);
  assert.match(migration, /`owner_key` text NOT NULL/);
  assert.match(migration, /CREATE INDEX `idx_roadmap_notes_owner_horizon_updated`/);
});

test("owner roadmap writes derive ownership server-side and reject reviewer-only access", async () => {
  const worker = await loadWorker();
  let inserted = null;
  const db = {
    prepare(sql) {
      if (!/INSERT INTO roadmap_notes/.test(sql)) throw new Error(`Unexpected SQL: ${sql}`);
      return { bind: (...values) => ({ run: async () => { inserted = values; return { success: true, meta: { changes: 1 } }; } }) };
    },
  };
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: db, REVIEW_PASSWORD: "review-password", FEEDBACK_ADMIN_PASSWORD: "owner-password", FEEDBACK_ADMIN_EMAIL: "owner@example.com" };

  const reviewLogin = await worker.fetch(new Request("http://localhost/api/review/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "review-password" }) }), env, ctx);
  const reviewCookie = reviewLogin.headers.get("set-cookie").split(";")[0];
  const reviewerOnly = await worker.fetch(new Request("http://localhost/api/review/roadmap", { method: "POST", headers: { "Content-Type": "application/json", Cookie: reviewCookie, ...ownerIdentity }, body: JSON.stringify({ title: "Hidden note", notes: "Must remain owner-only." }) }), env, ctx);
  assert.equal(reviewerOnly.status, 401);

  const adminCookie = await ownerCookie(worker, env);
  const created = await worker.fetch(new Request("http://localhost/api/review/roadmap", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost", Cookie: adminCookie, ...ownerIdentity },
    body: JSON.stringify({ title: "Validate portfolio monitor", businessCase: "portfolio", notes: "Prove weekly return value.", nextAction: "Interview five reviewers.", priority: "high", status: "researching", horizon: "now", ownerKey: "attacker@example.com" }),
  }), env, ctx);
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.equal(payload.note.ownerKey, "owner@example.com");
  assert.equal(inserted[1], "owner@example.com");
  assert.equal(inserted[2], "Validate portfolio monitor");
  assert.equal(inserted[6], "high");
});

test("roadmap reads and changes always include the authorized owner key", async () => {
  const worker = await loadWorker();
  const statements = [];
  const row = { id: "11111111-1111-4111-8111-111111111111", owner_key: "owner@example.com", title: "Rent evidence", business_case: "underwriting", notes: "Use matched property attributes.", next_action: "Validate comparables.", priority: "high", status: "building", horizon: "now", created_at: "2026-08-12T00:00:00.000Z", updated_at: "2026-08-12T00:00:00.000Z" };
  const db = {
    prepare(sql) {
      statements.push(sql);
      return { bind: (...values) => ({
        all: async () => ({ results: [row] }),
        first: async () => row,
        run: async () => ({ success: true, meta: { changes: 1 }, values }),
      }) };
    },
  };
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: db, FEEDBACK_ADMIN_PASSWORD: "owner-password", FEEDBACK_ADMIN_EMAIL: "owner@example.com" };
  const adminCookie = await ownerCookie(worker, env);
  const headers = { Cookie: adminCookie, ...ownerIdentity };
  const read = await worker.fetch(new Request("http://localhost/api/review/roadmap", { headers }), env, ctx);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).notes[0].title, "Rent evidence");
  const updated = await worker.fetch(new Request(`http://localhost/api/review/roadmap/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ status: "validating" }) }), env, ctx);
  assert.equal(updated.status, 200);
  assert.ok(statements.some((sql) => /WHERE id = \? AND owner_key = \?/.test(sql)));
});
