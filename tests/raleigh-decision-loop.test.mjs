import assert from "node:assert/strict";
import test from "node:test";
import { buildDecisionMemo, buildPublicRecordRange, listingTruth, selectComparableControls } from "../app/raleighDecisionLogic.mjs";

const now = new Date("2026-08-11T12:00:00Z");
const listing = {
  id: "listing-1", status: "Active", mlsName: "Triangle MLS", mlsNumber: "T-1", lastSeenDate: "2026-08-10",
  price: 390000, squareFootage: 1800, propertyType: "Single Family", lat: 35.78, lng: -78.64,
};
const controls = [
  { id: "a", marketId: "raleigh", propertyType: "SINGLFAM", lat: 35.79, lng: -78.64, sqft: 1800, model: { value: 420000, low: 360000, high: 480000 } },
  { id: "b", marketId: "raleigh", propertyType: "SINGLFAM", lat: 35.80, lng: -78.63, sqft: 1700, model: { value: 408000, low: 350000, high: 470000 } },
  { id: "c", marketId: "raleigh", propertyType: "SINGLFAM", lat: 35.77, lng: -78.65, sqft: 1900, model: { value: 437000, low: 365000, high: 500000 } },
];

test("the loop fails closed without connected listing truth", () => {
  const memo = buildDecisionMemo({ listing: null, sourceMode: "none", publicRange: null, cluster: null, rentEvidence: null, attomEvidence: null, now });
  assert.equal(memo.decision, "stop");
  assert.match(memo.rationale, /connected Raleigh feed/i);
});

test("active listing truth requires traceability and seven-day freshness", () => {
  assert.equal(listingTruth(listing, "connected", now).verified, true);
  assert.equal(listingTruth({ ...listing, mlsName: null, mlsNumber: null }, "connected", now).verified, false);
  assert.equal(listingTruth({ ...listing, lastSeenDate: "2026-07-01" }, "connected", now).verified, false);
});

test("public range uses nearby same-type controls", () => {
  const selected = selectComparableControls(listing, controls, 3);
  const range = buildPublicRecordRange(listing, selected);
  assert.equal(selected.length, 3);
  assert.equal(range.controlCount, 3);
  assert.equal(range.quality, "strong");
  assert.ok(range.low < range.center && range.center < range.high);
});

test("cluster-only rent can never produce an advance state", () => {
  const publicRange = buildPublicRecordRange(listing, selectComparableControls(listing, controls, 3));
  const memo = buildDecisionMemo({ listing, sourceMode: "connected", publicRange, cluster: { rentP25: 1400, medianRent: 1650, rentP75: 1900 }, rentEvidence: null, attomEvidence: { status: "available", deltaPct: 5 }, now });
  assert.equal(memo.decision, "watch");
  assert.equal(memo.gates.find((gate) => gate.id === "rent").status, "watch");
});

test("complete corroborating evidence advances only to underwriting", () => {
  const publicRange = buildPublicRecordRange(listing, selectComparableControls(listing, controls, 3));
  const memo = buildDecisionMemo({ listing, sourceMode: "connected", publicRange, cluster: null, rentEvidence: { source: "rentcast_property", median: 2300, low: 2100, high: 2500, compCount: 5 }, attomEvidence: { status: "available", deltaPct: 4 }, now });
  assert.equal(memo.decision, "advance");
  assert.match(memo.headline, /underwriting/i);
  assert.match(memo.rationale, /not a purchase recommendation/i);
});

test("material vendor disagreement stops the current thesis", () => {
  const publicRange = buildPublicRecordRange(listing, selectComparableControls(listing, controls, 3));
  const memo = buildDecisionMemo({ listing, sourceMode: "connected", publicRange, cluster: null, rentEvidence: { source: "rentcast_property", median: 2300, compCount: 5 }, attomEvidence: { status: "available", deltaPct: 31 }, now });
  assert.equal(memo.decision, "stop");
  assert.equal(memo.gates.find((gate) => gate.id === "vendor").status, "fail");
});
