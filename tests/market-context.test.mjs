import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("property workflows share one controlled market context", async () => {
  const [page, listings, studio, availability] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RaleighListingPilot.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/DecisionStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/featureAvailability.ts", import.meta.url), "utf8"),
  ]);

  assert.match(availability, /LISTING_MARKET_IDS = \["raleigh", "chicago", "philadelphia"\]/);
  assert.doesNotMatch(availability, /LISTING_MARKET_IDS = \[[^\]]*new-york/);
  assert.match(page, /propertyWorkflowActive \? workflowMarketId : market\.id/);
  assert.match(page, /Current context<\/span><b>\{activeTab\.label\} · \{contextMarketLabel\}/);
  assert.match(page, /<MarketListingPilot key=\{workflowMarketId\} marketId=\{workflowMarketId\} onMarketChange=\{chooseWorkflowMarket\}/);
  assert.match(page, /<DecisionStudio key=\{workflowMarketId\} marketId=\{workflowMarketId\} onMarketChange=\{chooseWorkflowMarket\}/);
  assert.match(listings, /MarketListingPilot\(\{ marketId, onMarketChange \}/);
  assert.doesNotMatch(listings, /const \[marketId, setMarketId\]/);
  assert.match(studio, /DecisionStudio\(\{ marketId, onMarketChange \}/);
  assert.doesNotMatch(studio, /const \[marketId, setMarketId\]/);
});

test("the Raleigh-only decision loop explicitly resolves the shared context to Raleigh", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Raleigh reference loop/);
  assert.match(page, /if \(id === "decision"\) chooseWorkflowMarket\("raleigh"\)/);
});
