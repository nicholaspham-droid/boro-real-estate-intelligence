import assert from "node:assert/strict";
import test from "node:test";
import { listingVerificationDecision, nearestRegionalCluster, normalizedAddress } from "../app/portfolioMonitorLogic.mjs";

const listing = {
  id: "listing-1",
  status: "Active",
  price: 420000,
  squareFootage: 1600,
  propertyType: "Single Family",
  mlsName: "Triangle MLS",
  mlsNumber: "12345",
  lat: 35.78,
  lng: -78.64,
};

test("listing verification fails closed without an exact-address active match", () => {
  const decision = listingVerificationDecision(listing, { activeSale: null, rent: { median: 2400, compCount: 5 }, attom: { value: 430000 } });
  assert.equal(decision.addable, false);
  assert.equal(decision.status, "blocked");
  assert.equal(decision.checks.find((check) => check.id === "address").pass, false);
});

test("listing verification permits an active traceable listing with required facts", () => {
  const decision = listingVerificationDecision(listing, {
    activeSale: { status: "Active", price: 420000, mlsName: "Triangle MLS", mlsNumber: "12345" },
    rent: { median: 2400, compCount: 8 },
    attom: { value: 430000, low: 400000, high: 460000 },
  });
  assert.equal(decision.addable, true);
  assert.equal(decision.status, "verified");
  assert.equal(decision.confidence, 100);
});

test("an independent valuation is required even when listing truth is present", () => {
  const decision = listingVerificationDecision(listing, { activeSale: { status: "Active", price: 420000 }, rent: null, attom: null });
  assert.equal(decision.addable, false);
  assert.equal(decision.status, "blocked");
});

test("nearest regional cluster selects the closest centroid", () => {
  const cluster = nearestRegionalCluster(listing, [{ id: "far", lat: 36.5, lng: -79 }, { id: "near", lat: 35.79, lng: -78.65 }]);
  assert.equal(cluster.id, "near");
});

test("address normalization removes formatting noise", () => {
  assert.equal(normalizedAddress("123 Main Street, Apt 2"), "123 MAIN ST APT 2");
});

test("asking price cannot replace an absent or invalid independent valuation", () => {
  for (const attom of [null, { value: 430000 }, { value: 430000, low: 440000, high: 460000 }, { value: 430000, low: 400000, high: 420000 }, { value: NaN, low: 400000, high: 460000 }]) {
    const decision = listingVerificationDecision(listing, { activeSale: { status: "Active" }, attom });
    assert.equal(decision.addable, false);
    assert.equal(decision.status, "blocked");
  }
});

test("inactive exact-address recheck blocks a previously active candidate", () => {
  const decision = listingVerificationDecision(listing, { activeSale: { status: "Inactive" }, attom: { value: 430000, low: 400000, high: 460000 } });
  assert.equal(decision.addable, false);
});

test("a provider valuation preserves its bounds without synthesizing a percentage band", async () => {
  const { listingValuation } = await import("../app/portfolioMonitorLogic.mjs");
  assert.deepEqual(listingValuation({ attom: { value: 430000, low: 399000, high: 477000 } }), { value: 430000, low: 399000, high: 477000 });
});
