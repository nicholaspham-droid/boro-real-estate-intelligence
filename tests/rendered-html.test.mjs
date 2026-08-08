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

test("server-renders the national Borocast workbench and verified registry", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /BORO/);
  assert.match(html, /NATIONAL PUBLIC-DATA MARKET WORKBENCH/);
  assert.match(html, /Find the edge/);
  assert.match(html, /PRODUCT OVERVIEW · FROM SIGNAL TO MEMO/);
  assert.match(html, /One workflow/);
  assert.match(html, /EVIDENCE LADDER/);
  assert.match(html, /NYC PLUTO 26v1/);
  assert.match(html, /CROSS-MARKET COMPARISON/);
  assert.match(html, /Tracts \+ property evidence/);
  assert.match(html, /FHFA TRACT-CLUSTER HPI/);
  assert.match(html, /Local cluster/);
  assert.match(html, /Metro benchmark/);
  assert.match(html, />Heat</);
  assert.match(html, />Clusters</);
  assert.match(html, />Properties</);
  assert.match(html, />5Y</);
  assert.match(html, />10Y</);
  assert.match(html, />Full</);
  assert.match(html, /FHFA HPI index/);
  assert.match(html, /Price momentum/);
  assert.match(html, /LOCAL SIGNAL LEADERBOARD/);
  assert.match(html, /Ten areas/);
  assert.match(html, /North Arc/);
  assert.match(html, /Northwest Arkansas/);
  assert.match(html, /WHY IT STANDS OUT/);
  assert.match(html, /Open this area in the market workspace/);
  assert.match(html, /PROPERTY VALUATION LAB · MODEL V2/);
  assert.match(html, /Cross-check the property/);
  assert.match(html, /Chicago · West Corridor/);
  assert.match(html, /Public-record model range/);
  assert.match(html, /INDEPENDENT CROSS-REFERENCE STACK/);
  assert.match(html, /RentCast/);
  assert.match(html, /ATTOM/);
  assert.match(html, /DECISION STUDIO · EDITABLE UNDERWRITING/);
  assert.match(html, /Advance only when at least four gates pass and none fail/);
  assert.match(html, /MODEL GOVERNANCE CHECK/);
  assert.match(html, /Out-of-time validation/);
  assert.match(html, /Bring an independent AVM into the evidence stack/);
  assert.match(html, /MAP-FIRST PROPERTY EXPLORER/);
  assert.match(html, /ATTOM MARKET AUDIT · SIX CONTROL ADDRESSES/);
  assert.match(html, /RENTCAST · LISTING \+ RENT CHANNEL/);
  assert.match(html, /Market Explorer/);
  assert.match(html, /Deal Studio/);
  assert.match(html, /FEATURE AVAILABILITY · NO EMPTY MARKETS/);
  assert.match(html, /Pick the evidence/);
  assert.match(html, /Prove listing \+ vendor joins/);
  assert.match(html, /Available parcel market/);
  assert.match(html, /LOCAL PUBLIC-SAFETY EVIDENCE/);
  assert.match(html, /Load local safety context/);
  assert.match(html, /true acquisition-edge percentage remains locked/i);
  assert.match(html, /No national PLUTO equivalent/);
});

test("public-safety API validates geography before contacting a local agency feed", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/public-safety/local?market=chicago"), env, ctx);
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error, /lat and lng/i);
});

test("ATTOM adapter reports readiness and keeps the property route closed without a secret", async () => {
  const worker = await loadWorker();
  const status = await worker.fetch(new Request("http://localhost/api/integrations/attom/status"), env, ctx);
  assert.equal(status.status, 200);
  const payload = await status.json();
  assert.equal(payload.connected, false);
  assert.match(payload.privacy, /server-side/i);

  const lookup = await worker.fetch(new Request("http://localhost/api/integrations/attom/property?address1=123%20Main%20St&address2=Raleigh%2C%20NC"), env, ctx);
  assert.equal(lookup.status, 503);
  const lookupPayload = await lookup.json();
  assert.match(lookupPayload.error, /not configured/i);

  const audit = await worker.fetch(new Request("http://localhost/api/integrations/attom/audit", { method: "POST" }), env, ctx);
  assert.equal(audit.status, 503);
});

test("RentCast adapter stays server-side and closes property evidence without a secret", async () => {
  const worker = await loadWorker();
  const status = await worker.fetch(new Request("http://localhost/api/integrations/rentcast/status"), env, ctx);
  assert.equal(status.status, 200);
  const payload = await status.json();
  assert.equal(payload.connected, false);
  assert.match(payload.privacy, /server-side/i);

  const lookup = await worker.fetch(new Request("http://localhost/api/integrations/rentcast/property?address=123%20Main%20St"), env, ctx);
  assert.equal(lookup.status, 503);
});

test("property-data APIs expose health and market evidence", async () => {
  const worker = await loadWorker();
  const health = await worker.fetch(new Request("http://localhost/api/property-data/health"), env, ctx);
  assert.equal(health.status, 200);
  const healthPayload = await health.json();
  assert.equal(healthPayload.sourceCount, 6);
  assert.equal(healthPayload.connectedMarketCount, 10);
  assert.deepEqual(healthPayload.adapters.sort(), ["arcgis", "carto", "socrata"]);
  assert.equal(healthPayload.acs.marketCount, 20);
  assert.equal(healthPayload.acs.clusterCount, 97);
  assert.equal(healthPayload.acs.tractCount, 17959);
  assert.equal(healthPayload.pricing.latestPeriod, "2026Q1");
  assert.equal(healthPayload.pricing.marketCount, 20);
  assert.equal(healthPayload.pricing.latestLocalYear, 2025);
  assert.equal(healthPayload.pricing.localClusterCount, 94);

  const market = await worker.fetch(new Request("http://localhost/api/property-data/markets/miami"), env, ctx);
  assert.equal(market.status, 200);
  const marketPayload = await market.json();
  assert.equal(marketPayload.market.competency, 79);
  assert.equal(marketPayload.sources[0].id, "florida-statewide-parcels");

  const missing = await worker.fetch(new Request("http://localhost/api/property-data/markets/not-a-market"), env, ctx);
  assert.equal(missing.status, 404);
});

test("pricing API exposes FHFA history and calculated YoY momentum", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/market-intelligence/pricing/miami"), env, ctx);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.market.latestPeriod, "2026Q1");
  assert.equal(payload.market.yoy, 3.78);
  assert.equal(payload.market.momentumScore, 80);
  assert.ok(payload.market.history.length > 100);
  assert.equal(payload.market.components.length, 3);
});

test("cluster pricing API exposes distinct local FHFA histories and competency", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/market-intelligence/pricing-clusters/new-york"), env, ctx);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.market.clusters.length, 5);
  const central = payload.market.clusters.find((cluster) => cluster.id === "new-york-central");
  const west = payload.market.clusters.find((cluster) => cluster.id === "new-york-west");
  assert.equal(central.latestYear, 2025);
  assert.equal(west.latestYear, 2025);
  assert.notEqual(central.momentumScore, west.momentumScore);
  assert.notEqual(central.yoy, west.yoy);
  assert.ok(central.pricingCompetency < west.pricingCompetency);
  assert.ok(west.history.length > 10);
});

test("market-intelligence API exposes measured ACS cluster evidence", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/market-intelligence/acs/new-york"), env, ctx);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.vintage, "2024");
  assert.equal(payload.market.tractCount, 2942);
  assert.equal(payload.market.clusters.length, 5);
  assert.equal(payload.market.clusters[0].coverage, 100);
  assert.ok(payload.market.clusters[0].sampleGeoids.length > 0);
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

test("valuation API exposes qualified property models without owner data", async () => {
  const worker = await loadWorker();
  const readiness = await worker.fetch(new Request("http://localhost/api/valuation/readiness"), env, ctx);
  assert.equal(readiness.status, 200);
  const readinessPayload = await readiness.json();
  assert.equal(readinessPayload.markets.filter((market) => market.status === "live").length, 3);
  assert.equal(readinessPayload.markets.find((market) => market.id === "northwest-arkansas").status, "gap");
  assert.ok(readinessPayload.providers.some((provider) => provider.id === "zillow-research"));
  assert.ok(readinessPayload.providers.some((provider) => provider.id === "attom"));

  const response = await worker.fetch(new Request("http://localhost/api/valuation/properties?market=chicago"), env, ctx);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.count, 18);
  for (const record of payload.records) {
    assert.equal(record.marketId, "chicago");
    assert.ok(record.model.low < record.model.value);
    assert.ok(record.model.high > record.model.value);
    assert.ok(record.model.confidence >= 45 && record.model.confidence <= 95);
    assert.ok(record.model.compCount >= 1);
    assert.equal(record.listing, null);
    assert.equal("owner" in record, false);
    assert.equal("mailingAddress" in record, false);
  }

  const detail = await worker.fetch(new Request(`http://localhost/api/valuation/properties/${payload.records[0].id}`), env, ctx);
  assert.equal(detail.status, 200);
  const detailPayload = await detail.json();
  assert.equal(detailPayload.property.id, payload.records[0].id);
  assert.match(detailPayload.methodology.boundary, /asking price or licensed live listing/i);
});
