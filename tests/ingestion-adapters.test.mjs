import assert from "node:assert/strict";
import test from "node:test";
import { buildArcgisQuery, buildSocrataQuery, fieldCoverage, inspectArcgis, inspectCarto, inspectSocrata, normalizeRecord } from "../scripts/ingestion/adapters.mjs";

function json(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}

test("query builders encode filters and paging", () => {
  const arcgis = buildArcgisQuery("https://example.gov/FeatureServer/0/", { where: "county='Wake'", outFields: ["parcel", "value"], limit: 50 });
  assert.equal(arcgis.searchParams.get("where"), "county='Wake'");
  assert.equal(arcgis.searchParams.get("outFields"), "parcel,value");
  assert.equal(arcgis.searchParams.get("resultRecordCount"), "50");

  const socrata = buildSocrataQuery("https://example.gov/resource/abcd.json", { where: "year=2026", select: ["pin", "value"], limit: 25, offset: 50 });
  assert.equal(socrata.searchParams.get("$where"), "year=2026");
  assert.equal(socrata.searchParams.get("$offset"), "50");
});

test("ArcGIS inspector collects metadata, count and attributes", async () => {
  const fakeFetch = async (request) => {
    const url = new URL(request);
    if (!url.pathname.endsWith("/query")) return json({ maxRecordCount: 2000, fields: [{ name: "PARCEL_ID" }, { name: "JV" }] });
    if (url.searchParams.get("returnCountOnly") === "true") return json({ count: 2 });
    return json({ features: [{ attributes: { PARCEL_ID: "A", JV: 10 } }, { attributes: { PARCEL_ID: "B", JV: null } }] });
  };
  const audit = await inspectArcgis({ apiUrl: "https://example.gov/FeatureServer/0", auditFields: ["PARCEL_ID", "JV"] }, fakeFetch);
  assert.equal(audit.recordCount, 2);
  assert.equal(audit.maxRecordCount, 2000);
  assert.equal(audit.rows[0].PARCEL_ID, "A");
});

test("Socrata and CARTO inspectors normalize counts", async () => {
  const socrataFetch = async (request) => new URL(request).searchParams.get("$select") === "count(*) as count"
    ? json([{ count: "3" }])
    : json([{ pin: "1" }, { pin: "2" }, { pin: "3" }]);
  const socrata = await inspectSocrata({ apiUrl: "https://example.gov/resource/abcd.json", auditFields: ["pin"] }, socrataFetch);
  assert.equal(socrata.recordCount, 3);

  const cartoFetch = async (request) => new URL(request).searchParams.get("q").includes("count(*)")
    ? json({ rows: [{ count: 4 }] })
    : json({ rows: [{ parcel_number: "P1" }] });
  const carto = await inspectCarto({ apiUrl: "https://example.gov/sql", table: "properties", auditFields: ["parcel_number"] }, cartoFetch);
  assert.equal(carto.recordCount, 4);
});

test("coverage and canonical normalization are deterministic", () => {
  const rows = [{ pin: "A", value: 1 }, { pin: "B", value: null }, { pin: "", value: 3 }];
  assert.deepEqual(fieldCoverage(rows, { stableId: ["pin"], totalValue: ["value"] }), { stableId: 0.6667, totalValue: 0.6667 });
  assert.deepEqual(normalizeRecord(rows[0], { parcelId: "pin", totalValue: "value" }, { marketId: "test", sourceId: "fixture" }), {
    marketId: "test", sourceId: "fixture", parcelId: "A", totalValue: 1,
  });
});
