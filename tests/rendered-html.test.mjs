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
  assert.match(html, /PROPERTY VALUATION LAB · MODEL V3/);
  assert.match(html, /Cross-check the property/);
  assert.match(html, /MODEL DECISION GATE/);
  assert.match(html, /Chicago · West Corridor/);
  assert.match(html, /Public-record model range/);
  assert.match(html, /INDEPENDENT CROSS-REFERENCE STACK/);
  assert.match(html, /RentCast/);
  assert.match(html, /ATTOM/);
  assert.match(html, /DECISION STUDIO · EDITABLE UNDERWRITING/);
  assert.match(html, /ACS CLUSTER RENT EVIDENCE/);
  assert.match(html, /25th percentile/);
  assert.match(html, /75th percentile/);
  assert.match(html, /Recorded sale \/ sf/);
  assert.match(html, /Comparable recency/);
  assert.match(html, /Advance only when at least four gates pass and none fail/);
  assert.match(html, /MODEL GOVERNANCE CHECK/);
  assert.match(html, /Out-of-time validation/);
  assert.match(html, /Build an independent property evidence file/);
  assert.match(html, /ATTOM ENRICHMENT · SIX CACHED CONTROL ADDRESSES/);
  assert.match(html, /RENTCAST · LISTING \+ RENT CHANNEL/);
  assert.match(html, /REGIONAL LIVE LISTING SCREEN · SCALE TEST/);
  assert.match(html, /Up to 500 listings\. One market request/);
  assert.match(html, /Chicago/);
  assert.match(html, /Philadelphia/);
  assert.match(html, /Map ready · load listings to add scored pins/);
  assert.match(html, /Historical model library/);
  assert.match(html, /live-listing screen above now covers Raleigh, Chicago and Philadelphia/);
  assert.match(html, /Market Explorer/);
  assert.match(html, /Deal Studio/);
  assert.match(html, /FEATURE AVAILABILITY · NO EMPTY MARKETS/);
  assert.match(html, /Pick the evidence/);
  assert.match(html, /Validate listing \+ ATTOM joins/);
  assert.match(html, /Available parcel market/);
  assert.match(html, /LOCAL PUBLIC-SAFETY EVIDENCE/);
  assert.match(html, /Load local safety context/);
  assert.match(html, /true acquisition-edge percentage remains locked/i);
  assert.match(html, /No national PLUTO equivalent/);
  assert.match(html, /Give Feedback/);
  assert.match(html, /Help pressure-test/);
  assert.match(html, /Print 2-page area report/);
  assert.match(html, /Print 2-page property report/);
  assert.match(html, /Portfolio Lab/);
  assert.match(html, /PORTFOLIO LAB · V2 MODEL MODE/);
  assert.match(html, /Build the book/);
  assert.match(html, /Reliability-adjusted edge/);
  assert.match(html, /Portfolio Builder/);
  assert.match(html, /Risk &amp; Scenarios/);
  assert.match(html, /MODEL PORTFOLIO ONLY/);
  assert.match(html, /Chicago · West Corridor/);
  assert.match(html, /Philadelphia · West Corridor/);
  assert.match(html, /Raleigh · West Corridor/);
});

test("area and property reports render two-page analytical audit trails", async () => {
  const worker = await loadWorker();
  const areaResponse = await worker.fetch(new Request("http://localhost/report?type=area&market=new-york&cluster=new-york-central&demographic=10&economic=25&education=40&housing=10&pricing=15", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(areaResponse.status, 200);
  const areaHtml = await areaResponse.text();
  assert.match(areaHtml, /AREA ANALYTICAL REPORT/);
  assert.match(areaHtml, /Central Core/);
  assert.match(areaHtml, /SCREENING CONCLUSION/);
  assert.match(areaHtml, /How this signal was built/);
  assert.match(areaHtml, /PAGE\s*(?:<!-- -->)?1\s*(?:<!-- -->)? OF 2/);
  assert.match(areaHtml, /PAGE\s*(?:<!-- -->)?2\s*(?:<!-- -->)? OF 2/);
  assert.match(areaHtml, /Print \/ Save PDF/);

  const propertyResponse = await worker.fetch(new Request("http://localhost/report?type=property&id=cook-08214030100000", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(propertyResponse.status, 200);
  const propertyHtml = await propertyResponse.text();
  assert.match(propertyHtml, /PROPERTY ANALYTICAL REPORT/);
  assert.match(propertyHtml, /6 FOREST LN/);
  assert.match(propertyHtml, /Three independently visible anchors/);
  assert.match(propertyHtml, /How this value screen was built/);
  assert.match(propertyHtml, /PAGE\s*(?:<!-- -->)?1\s*(?:<!-- -->)? OF 2/);
  assert.match(propertyHtml, /PAGE\s*(?:<!-- -->)?2\s*(?:<!-- -->)? OF 2/);
});

test("private review gate rejects unknown visitors and issues an HttpOnly review cookie", async () => {
  const worker = await loadWorker();
  const protectedEnv = { ...env, REVIEW_PASSWORD: "test-review-password" };
  const locked = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), protectedEnv, ctx);
  assert.equal(locked.status, 200);
  assert.match(await locked.text(), /Private B-school/);

  const apiLocked = await worker.fetch(new Request("http://localhost/api/property-data/health"), protectedEnv, ctx);
  assert.equal(apiLocked.status, 401);

  const wrong = await worker.fetch(new Request("http://localhost/api/review/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong" }),
  }), protectedEnv, ctx);
  assert.equal(wrong.status, 401);

  const login = await worker.fetch(new Request("http://localhost/api/review/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-review-password" }),
  }), protectedEnv, ctx);
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /borocast_review=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);

  const cookie = setCookie.split(";")[0];
  const unlocked = await worker.fetch(new Request("http://localhost/api/property-data/health", { headers: { Cookie: cookie } }), protectedEnv, ctx);
  assert.equal(unlocked.status, 200);
});

test("authenticated reviewers can save structured feedback to D1", async () => {
  const worker = await loadWorker();
  let inserted = null;
  const db = {
    prepare(sql) {
      assert.match(sql, /INSERT INTO review_feedback/);
      return {
        bind(...values) {
          inserted = values;
          return { run: async () => ({ success: true }) };
        },
      };
    },
  };
  const protectedEnv = { ...env, DB: db, REVIEW_PASSWORD: "test-review-password" };
  const login = await worker.fetch(new Request("http://localhost/api/review/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-review-password" }),
  }), protectedEnv, ctx);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const response = await worker.fetch(new Request("http://localhost/api/review/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      reviewerName: "Maya",
      reviewerEmail: "maya@example.com",
      usefulness: 5,
      trust: 4,
      clarity: 4,
      featureArea: "market_explorer",
      failureModes: ["data_trust", "model_scoring"],
      reviewerIntent: "yes",
      mostValuable: "The local price history comparison.",
      confusing: "The competency score needs one more example.",
      nextFeature: "A saved shortlist.",
      notes: "Strong first pass.",
      sourcePath: "/",
    }),
  }), protectedEnv, ctx);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).ok, true);
  assert.equal(inserted[1], "Maya");
  assert.equal(inserted[3], 5);
  assert.equal(inserted[6], "The local price history comparison.");
  assert.equal(inserted[11], "market_explorer");
  assert.equal(inserted[12], JSON.stringify(["data_trust", "model_scoring"]));
  assert.equal(inserted[15], "model_review");
});

test("owner repository groups feedback by failure mode and protects triage updates", async () => {
  const worker = await loadWorker();
  let updated = null;
  const db = {
    prepare(sql) {
      if (/SELECT id, created_at/.test(sql)) return { all: async () => ({ results: [{
        id: 7, created_at: "2026-08-09T00:00:00.000Z", reviewer_name: "Maya", reviewer_email: "maya@example.com",
        usefulness: 5, trust: 2, clarity: 4, most_valuable: "Local histories", confusing: "Weighting logic",
        next_feature: "Saved lists", notes: null, feature_area: "market_explorer", failure_modes: JSON.stringify(["data_trust", "model_scoring"]),
        reviewer_intent: "yes", triage_status: "new", impact_lane: "model_review",
      }] }) };
      if (/UPDATE review_feedback/.test(sql)) return { bind: (...values) => ({ run: async () => { updated = values; return { success: true }; } }) };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const protectedEnv = { ...env, DB: db, REVIEW_PASSWORD: "test-review-password", FEEDBACK_ADMIN_PASSWORD: "owner-password", FEEDBACK_ADMIN_EMAIL: "owner@example.com" };
  const noIdentity = await worker.fetch(new Request("http://localhost/api/review/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "owner-password" }) }), protectedEnv, ctx);
  assert.equal(noIdentity.status, 403);

  const ownerHeaders = { "oai-authenticated-user-email": "owner@example.com" };
  const locked = await worker.fetch(new Request("http://localhost/api/review/repository", { headers: ownerHeaders }), protectedEnv, ctx);
  assert.equal(locked.status, 401);

  const adminLogin = await worker.fetch(new Request("http://localhost/api/review/admin/login", { method: "POST", headers: { "Content-Type": "application/json", ...ownerHeaders }, body: JSON.stringify({ password: "owner-password" }) }), protectedEnv, ctx);
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];
  const repositoryHeaders = { Cookie: adminCookie, ...ownerHeaders };
  const repository = await worker.fetch(new Request("http://localhost/api/review/repository", { headers: repositoryHeaders }), protectedEnv, ctx);
  assert.equal(repository.status, 200);
  const payload = await repository.json();
  assert.equal(payload.summary.total, 1);
  assert.equal(payload.summary.modelReviewCount, 1);
  assert.equal(payload.summary.wouldUseCount, 1);
  assert.equal(payload.buckets.find((item) => item.id === "model_scoring").count, 1);

  const patchResponse = await worker.fetch(new Request("http://localhost/api/review/repository/7", { method: "PATCH", headers: { "Content-Type": "application/json", ...repositoryHeaders }, body: JSON.stringify({ triageStatus: "reviewing" }) }), protectedEnv, ctx);
  assert.equal(patchResponse.status, 200);
  assert.deepEqual(updated, ["reviewing", 7]);
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
  assert.equal(payload.requestProfiles.core.maximumRequests, 1);
  assert.equal(payload.requestProfiles.underwriting.maximumRequests, 6);
  assert.ok(payload.requestProfiles.underwriting.endpoints.includes("saleshistory/expandedhistory"));
  assert.ok(payload.requestProfiles.underwriting.endpoints.includes("property/buildingpermits"));
  assert.ok(payload.requestProfiles.underwriting.endpoints.includes("valuation/homeequity"));
  assert.match(payload.allowanceRule, /HTTP 200/i);
  assert.match(payload.privacy, /buyer\/seller/i);

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

  const pilot = await worker.fetch(new Request("http://localhost/api/listings/raleigh"), env, ctx);
  assert.equal(pilot.status, 503);
});

test("regional listing routes score up to 500 records from one upstream response per market", async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date().toISOString();
  const mockListings = Array.from({ length: 160 }, (_, index) => ({
    id: `raleigh-${index}`,
    formattedAddress: `${100 + index} Test Ave, Raleigh, NC 276${String(index % 10).padStart(2, "0")}`,
    addressLine1: `${100 + index} Test Ave`,
    city: "Raleigh",
    state: "NC",
    zipCode: `276${String(index % 10).padStart(2, "0")}`,
    latitude: 35.72 + index * .002,
    longitude: -78.72 + index * .002,
    propertyType: "Single Family",
    bedrooms: 3 + index % 3,
    bathrooms: 2 + index % 2,
    squareFootage: 1300 + index * 31,
    yearBuilt: 1980 + index % 40,
    status: "Active",
    price: 250000 + index * 12500,
    daysOnMarket: index * 11,
    lastSeenDate: now,
    mlsName: "Test MLS",
    mlsNumber: `MLS-${index}`,
  }));
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://api.rentcast.io/v1/listings/sale")) {
      const upstreamUrl = new URL(String(input));
      assert.equal(init.headers["X-Api-Key"], "test-key");
      assert.equal(upstreamUrl.searchParams.get("limit"), "500");
      assert.match(upstreamUrl.searchParams.get("propertyType"), /Multi-Family/);
      return new Response(JSON.stringify(mockListings), { status: 200, headers: { "Content-Type": "application/json", "X-Total-Count": "1036" } });
    }
    return originalFetch(input, init);
  };
  try {
    const worker = await loadWorker();
    for (const market of ["raleigh", "chicago", "philadelphia"]) {
      const response = await worker.fetch(new Request(`http://localhost/api/listings/${market}`), { ...env, RENTCAST_API_KEY: "test-key" }, ctx);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.requestCost, 1);
      assert.equal(payload.market.id, market);
      assert.equal(payload.scoredCandidateCount, 160);
      assert.equal(payload.candidateCount, 1036);
      assert.equal(payload.listings.length, 24);
      assert.ok(payload.listings.some((listing) => listing.priority === "low"));
      assert.ok(payload.listings.every((listing) => listing.scoreBreakdown.length === 2));
      assert.ok(payload.listings.every((listing) => listing.evidenceReliability > 0 && listing.evidenceReliability <= 95));
      assert.ok(payload.listings.every((listing) => listing.scoreBreakdown.reduce((sum, factor) => sum + factor.weight, 0) === 100));
      assert.ok(payload.pricePerSqftBand.p25 < payload.pricePerSqftBand.p75);
      assert.equal(payload.regionDiagnostics.listingSample, 160);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("property-data APIs expose health and market evidence", async () => {
  const worker = await loadWorker();
  const health = await worker.fetch(new Request("http://localhost/api/property-data/health"), env, ctx);
  assert.equal(health.status, 200);
  const healthPayload = await health.json();
  assert.equal(healthPayload.sourceCount, 6);
  assert.equal(healthPayload.connectedMarketCount, 10);

  const quality = await worker.fetch(new Request("http://localhost/api/model-quality"), env, ctx);
  assert.equal(quality.status, 200);
  const qualityPayload = await quality.json();
  assert.match(qualityPayload.modelVersion, /v3\.0/);
  assert.equal(qualityPayload.markets.find((market) => market.id === "philadelphia").decisionUse, "compromised");
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
  assert.ok(payload.market.clusters[0].rentP25 < payload.market.clusters[0].medianRent);
  assert.ok(payload.market.clusters[0].medianRent < payload.market.clusters[0].rentP75);
  assert.ok(payload.market.clusters[0].rentObservationCount > 0);
  assert.ok(payload.market.clusters[0].rentCoverage > 90);
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
    assert.ok(record.model.pricePerSqft.comparableP25 < record.model.pricePerSqft.comparableP75);
    assert.ok(record.model.recency.saleAgeMonths >= 0);
    assert.ok(record.model.comparableQuality.medianAgeMonths >= 0);
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
