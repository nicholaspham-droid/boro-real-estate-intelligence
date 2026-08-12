import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("profile-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const assets = { fetch: async () => new Response("Not found", { status: 404 }) };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const identityHeaders = {
  "oai-authenticated-user-id": "chatgpt-user-42",
  "oai-authenticated-user-email": "maya@example.com",
  "oai-authenticated-user-full-name": "Maya%20Chen",
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};

function createProfileDb() {
  const state = { statements: [], writes: [] };
  const favorite = {
    id: "11111111-1111-4111-8111-111111111111",
    target_type: "area",
    target_id: "raleigh-west-corridor",
    target_name: "Raleigh · West Corridor",
    market_id: "raleigh",
    snapshot_json: JSON.stringify({ score: 76, competency: 91 }),
    notes: "Validate rent first.",
    created_at: "2026-08-11T00:00:00.000Z",
    updated_at: "2026-08-11T00:00:00.000Z",
  };

  return {
    state,
    db: {
      prepare(sql) {
        state.statements.push(sql);
        const bound = [];
        return {
          bind(...values) {
            bound.push(...values);
            return {
              async run() {
                state.writes.push({ sql, values: [...bound] });
                return { success: true, meta: { changes: 1 } };
              },
              async first() {
                if (/SELECT display_name/.test(sql)) return { display_name: "Maya Chen", email: "maya@example.com", created_at: "2026-08-11T00:00:00.000Z" };
                if (/FROM user_favorites WHERE user_id = \? AND target_type/.test(sql)) return favorite;
                return null;
              },
              async all() {
                if (/FROM user_favorites WHERE user_id = \? ORDER BY/.test(sql)) return { results: [favorite] };
                return { results: [] };
              },
            };
          },
        };
      },
    },
  };
}

test("profile API requires a verified Google or ChatGPT identity", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/profile"), { ASSETS: assets }, ctx);
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Google or ChatGPT sign-in/i);
});

test("profile page stays connected to BORO while account state loads", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/profile", { headers: { accept: "text/html" } }), { ASSETS: assets }, ctx);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Back to BORO/);
  const source = await readFile(new URL("../app/profile/ProfileWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /YOUR RESEARCH, ACROSS DEVICES/);
  assert.match(source, /Continue with ChatGPT/);
  assert.match(source, /Continue with Google/);
});

test("Google auth config fails closed until server credentials are configured", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/auth/config"), { ASSETS: assets }, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { configured: false, googleClientId: null });
});

test("Google profile logout clears only the BORO session cookie", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/auth/logout", { method: "POST", headers: { Origin: "http://localhost" } }), { ASSETS: assets }, ctx);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /boro_profile_session=;/);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
});

test("profile API upserts identity and returns only that user’s saved areas and properties", async () => {
  const worker = await loadWorker();
  const { db, state } = createProfileDb();
  const response = await worker.fetch(new Request("http://localhost/api/profile", { headers: identityHeaders }), { ASSETS: assets, DB: db }, ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json();
  assert.equal(payload.profile.displayName, "Maya Chen");
  assert.equal(payload.auth.provider, "chatgpt");
  assert.equal(payload.counts.all, 1);
  assert.equal(payload.counts.areas, 1);
  assert.equal(payload.favorites[0].targetId, "raleigh-west-corridor");
  assert.ok(state.statements.every((sql) => !/SELECT .*user_favorites(?!.*user_id)/s.test(sql)));
  const favoriteRead = state.writes.find((write) => /INSERT INTO user_profiles/.test(write.sql));
  assert.equal(favoriteRead.values[0], "chatgpt-user-42");
});

test("favorite writes use typed targets, bounded snapshots, and identity-scoped ownership", async () => {
  const worker = await loadWorker();
  const { db, state } = createProfileDb();
  const response = await worker.fetch(new Request("http://localhost/api/profile/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost", ...identityHeaders },
    body: JSON.stringify({
      targetType: "area",
      targetId: "raleigh-west-corridor",
      targetName: "Raleigh · West Corridor",
      marketId: "raleigh",
      snapshot: { score: 76, recommendation: "Validate rent", ignoredPrivatePayload: "must not persist" },
    }),
  }), { ASSETS: assets, DB: db }, ctx);
  assert.equal(response.status, 201);
  const insert = state.writes.find((write) => /INSERT INTO user_favorites/.test(write.sql));
  assert.ok(insert);
  assert.equal(insert.values[1], "chatgpt-user-42");
  assert.equal(insert.values[2], "area");
  assert.deepEqual(JSON.parse(insert.values[6]), { score: 76, recommendation: "Validate rent" });

  const invalidType = await worker.fetch(new Request("http://localhost/api/profile/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...identityHeaders },
    body: JSON.stringify({ targetType: "user", targetId: "other-user", targetName: "Invalid" }),
  }), { ASSETS: assets, DB: db }, ctx);
  assert.equal(invalidType.status, 400);

  const crossOrigin = await worker.fetch(new Request("http://localhost/api/profile/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example", ...identityHeaders },
    body: JSON.stringify({ targetType: "area", targetId: "x", targetName: "X" }),
  }), { ASSETS: assets, DB: db }, ctx);
  assert.equal(crossOrigin.status, 403);
});

test("favorite note updates and removals always include the authenticated owner", async () => {
  const worker = await loadWorker();
  const { db, state } = createProfileDb();
  const id = "11111111-1111-4111-8111-111111111111";
  const patchResponse = await worker.fetch(new Request(`http://localhost/api/profile/favorites/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...identityHeaders },
    body: JSON.stringify({ notes: "Confirm inspection scope." }),
  }), { ASSETS: assets, DB: db }, ctx);
  assert.equal(patchResponse.status, 200);
  const update = state.writes.find((write) => /UPDATE user_favorites/.test(write.sql));
  assert.equal(update.values.at(-1), "chatgpt-user-42");
  assert.match(update.sql, /WHERE id = \? AND user_id = \?/);

  const deleteResponse = await worker.fetch(new Request(`http://localhost/api/profile/favorites/${id}`, {
    method: "DELETE",
    headers: identityHeaders,
  }), { ASSETS: assets, DB: db }, ctx);
  assert.equal(deleteResponse.status, 200);
  const removal = state.writes.find((write) => /DELETE FROM user_favorites/.test(write.sql));
  assert.deepEqual(removal.values, [id, "chatgpt-user-42"]);
});

test("profile migration creates durable owner and favorite records with ownership indexes", async () => {
  const migration = await readFile(new URL("../drizzle/0003_round_lord_hawal.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `user_profiles`/);
  assert.match(migration, /CREATE TABLE `user_favorites`/);
  assert.match(migration, /FOREIGN KEY \(`user_id`\)/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_user_favorites_owner_target`/);
  assert.match(migration, /CREATE INDEX `idx_user_favorites_owner_created`/);
});
