import assert from "node:assert/strict";
import test from "node:test";
import valuations from "../data/property-valuations.json" with { type: "json" };

test("property valuation snapshot is internally consistent", () => {
  assert.equal(valuations.properties.length, 54);
  assert.deepEqual([...new Set(valuations.properties.map((record) => record.marketId))].sort(), ["chicago", "philadelphia", "raleigh"]);
  for (const record of valuations.properties) {
    const anchors = record.model.anchors;
    const weights = record.model.weights;
    const expected = anchors.hpiAdjustedSale * weights.hpiAdjustedSale + anchors.assessmentCalibrated * weights.assessmentCalibrated + anchors.comparablePpsf * weights.comparableSales;
    assert.ok(Math.abs(expected - record.model.value) <= 1500, `${record.id} model center matches documented weights`);
    assert.equal(record.model.diagnostics.modelVersion, "2.0");
    assert.ok(record.model.comparableQuality.nearestMiles <= record.model.comparableQuality.medianMiles);
    assert.ok(record.model.comparableQuality.sameTypePct >= 0 && record.model.comparableQuality.sameTypePct <= 100);
    assert.ok(record.salePrice > 0);
    assert.ok(record.assessedValue > 0);
    assert.ok(record.sqft > 0);
    assert.ok(record.saleDate <= valuations.asOf);
    assert.equal(record.vendorEstimates.length, 0);
  }
});

test("market competency separates source coverage from observed model performance", () => {
  const live = valuations.markets.filter((market) => market.status === "live");
  for (const market of live) {
    assert.ok(market.diagnostics.sampleSize > 0);
    assert.equal(market.modelCompetency, market.diagnostics.modelCompetency);
    assert.ok(market.diagnostics.p80AbsoluteErrorPct >= market.diagnostics.medianAbsoluteErrorPct);
    assert.ok(market.competency <= Math.max(market.sourceCompetency, market.modelCompetency));
  }
  const philadelphia = live.find((market) => market.id === "philadelphia");
  const raleigh = live.find((market) => market.id === "raleigh");
  assert.ok(philadelphia.modelCompetency < philadelphia.sourceCompetency);
  assert.ok(philadelphia.diagnostics.p80AbsoluteErrorPct > 50);
  assert.ok(raleigh.diagnostics.medianAbsoluteErrorPct < 10);
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
