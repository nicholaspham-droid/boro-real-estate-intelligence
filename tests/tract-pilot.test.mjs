import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = ["new-york", "raleigh"];

test("tract pilot exposes bounded official evidence without private fields", async () => {
  for (const marketId of files) {
    const payload = JSON.parse(await readFile(new URL(`../public/data/tract-pilot/${marketId}.json`, import.meta.url), "utf8"));
    assert.equal(payload.marketId, marketId);
    assert.equal(payload.tractCount, payload.tracts.length);
    assert.ok(payload.tractCount > 300);
    assert.match(payload.underlyingSource, /Census Bureau/);
    assert.match(payload.geometrySource, /tigerweb\.geo\.census\.gov/);
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
