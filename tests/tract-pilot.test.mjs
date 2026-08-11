import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = ["new-york", "raleigh"];

test("tract pilot exposes bounded official evidence without private fields", async () => {
  for (const marketId of files) {
    const payload = JSON.parse(await readFile(new URL(`../public/data/tract-pilot/${marketId}.json`, import.meta.url), "utf8"));
    const geometry = JSON.parse(await readFile(new URL(`../public/data/tract-pilot/geometry/${marketId}.geojson`, import.meta.url), "utf8"));
    assert.equal(payload.marketId, marketId);
    assert.equal(payload.tractCount, payload.tracts.length);
    assert.ok(payload.tractCount > 300);
    assert.match(payload.underlyingSource, /Census Bureau/);
    assert.match(payload.geometrySource, /tigerweb\.geo\.census\.gov/);
    assert.equal(geometry.type, "FeatureCollection");
    assert.equal(geometry.features.length, payload.tractCount);
    assert.equal(geometry.features.every((feature) => feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon"), true);
    for (const tract of payload.tracts) {
      assert.match(tract.geoid, /^\d{11}$/);
      assert.equal(tract.clusterId.startsWith(`${marketId}-`), true);
      for (const key of ["demographic", "economic", "education", "housing", "pricing", "coverage", "acsCompetency", "reliability"]) {
        assert.ok(tract[key] >= 0 && tract[key] <= 100, `${marketId} ${tract.geoid} ${key} stays within 0–100`);
      }
    }
    const serialized = JSON.stringify(payload).toLowerCase();
    assert.equal(serialized.includes('"owner'), false);
    assert.equal(serialized.includes("mailingaddress"), false);
  }
});

test("New York pilot covers every borough and the wider nine-county market", async () => {
  const payload = JSON.parse(await readFile(new URL("../public/data/tract-pilot/new-york.json", import.meta.url), "utf8"));
  const expected = { "36005": 347, "36047": 777, "36061": 302, "36081": 683, "36085": 119 };
  const counts = Object.fromEntries(Object.keys(expected).map((county) => [county, payload.tracts.filter((tract) => tract.geoid.startsWith(county)).length]));
  assert.deepEqual(counts, expected);
  assert.equal(payload.tracts.filter((tract) => tract.geoid.startsWith("34")).length, 714);
});
