import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};

const ctx = { waitUntil() {}, passThroughOnException() {} };

test("server-renders Borocast and the verified registry", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /BORO/);
  assert.match(html, /Government feeds/);
  assert.match(html, /FIRST-WAVE LIVE ENDPOINTS/);
  assert.match(html, /Florida Statewide Parcels 2025/);
  assert.match(html, /20-MARKET NEIGHBORHOOD EXPLORER/);
  assert.match(html, /local edge map/);
  assert.match(html, /Northwest Arkansas/);
  assert.match(html, /Coverage note:/);
});

test("property-data APIs expose health and market evidence", async () => {
  const worker = await loadWorker();
  const health = await worker.fetch(new Request("http://localhost/api/property-data/health"), env, ctx);
  assert.equal(health.status, 200);
  const healthPayload = await health.json();
  assert.equal(healthPayload.sourceCount, 6);
  assert.equal(healthPayload.connectedMarketCount, 10);
  assert.deepEqual(healthPayload.adapters.sort(), ["arcgis", "carto", "socrata"]);

  const market = await worker.fetch(new Request("http://localhost/api/property-data/markets/miami"), env, ctx);
  assert.equal(market.status, 200);
  const marketPayload = await market.json();
  assert.equal(marketPayload.market.competency, 79);
  assert.equal(marketPayload.sources[0].id, "florida-statewide-parcels");

  const missing = await worker.fetch(new Request("http://localhost/api/property-data/markets/not-a-market"), env, ctx);
  assert.equal(missing.status, 404);
});

test("hosted samples omit owner and mailing fields", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/property-data/samples"), env, ctx);
  const payload = await response.json();
  assert.ok(payload.records.length >= 6);
  for (const record of payload.records) {
    assert.equal("owner" in record, false);
    assert.equal("ownerName" in record, false);
    assert.equal("mailingAddress" in record, false);
  }
});
