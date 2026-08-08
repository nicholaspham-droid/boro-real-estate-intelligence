import assert from "node:assert/strict";
import test from "node:test";
import valuations from "../data/property-valuations.json" with { type: "json" };

test("property valuation snapshot is internally consistent", () => {
  assert.equal(valuations.properties.length, 54);
  assert.deepEqual([...new Set(valuations.properties.map((record) => record.marketId))].sort(), ["chicago", "philadelphia", "raleigh"]);
  for (const record of valuations.properties) {
    const anchors = record.model.anchors;
    const expected = anchors.hpiAdjustedSale * 0.45 + anchors.assessmentCalibrated * 0.25 + anchors.comparablePpsf * 0.30;
    assert.ok(Math.abs(expected - record.model.value) <= 1500, `${record.id} model center matches documented weights`);
    assert.ok(record.salePrice > 0);
    assert.ok(record.assessedValue > 0);
    assert.ok(record.sqft > 0);
    assert.ok(record.saleDate <= valuations.asOf);
    assert.equal(record.vendorEstimates.length, 0);
  }
});

test("Cook County assessments are normalized to market-equivalent residential values", () => {
  const records = valuations.properties.filter((record) => record.marketId === "chicago");
  for (const record of records) {
    assert.ok(record.assessedValue > 100000);
    assert.match(record.qualification, /10% level/);
    assert.ok(Math.abs(record.model.valuationGapPct) < 100);
  }
});

test("property snapshot never hosts owner or mailing fields", () => {
  const serialized = JSON.stringify(valuations.properties).toLowerCase();
  assert.equal(serialized.includes('"owner'), false);
  assert.equal(serialized.includes("mail_address"), false);
  assert.equal(serialized.includes("mailingaddress"), false);
});
