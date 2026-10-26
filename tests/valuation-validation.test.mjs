import assert from "node:assert/strict";
import test from "node:test";
import { productionValidationFor, confidenceForEvidence, heuristicMargin } from "../scripts/ingestion/valuation-validation.mjs";

test("a passing reference estimator cannot validate the production blend", () => {
  const validation = productionValidationFor({ decisionUse: "pass", sampleSize: 5000, p80AbsoluteErrorPct: 1 });
  assert.equal(validation.referenceDecisionUse, "pass");
  assert.equal(validation.decisionUse, "watch");
  assert.equal(validation.productionValidation, "not-validated");
  assert.equal(validation.validationScope, "reference-estimator");
  assert.equal(validation.rangeMethod, "heuristic");
});

test("reference error changes cannot improve production confidence or narrow ranges", () => {
  const good = productionValidationFor({ decisionUse: "pass", p80AbsoluteErrorPct: 1 });
  const bad = productionValidationFor({ decisionUse: "watch", p80AbsoluteErrorPct: 40 });
  const evidence = { recency: 100, completeness: 1, compQuality: 100, agreement: 100 };
  assert.equal(confidenceForEvidence(evidence, good), 50);
  assert.equal(confidenceForEvidence(evidence, good), confidenceForEvidence(evidence, bad));
  assert.equal(heuristicMargin({ spread: 0, estimate: 400000, confidence: 50 }, good), .30);
  assert.equal(heuristicMargin({ spread: 0, estimate: 400000, confidence: 50 }, bad), .30);
});

test("compromised reference evidence remains a conservative release restriction", () => {
  const validation = productionValidationFor({ decisionUse: "compromised" });
  assert.equal(validation.decisionUse, "compromised");
  assert.equal(confidenceForEvidence({ recency: 100, completeness: 1, compQuality: 100, agreement: 100 }, validation), 35);
  assert.equal(heuristicMargin({ spread: 0, estimate: 400000, confidence: 35 }, validation), .60);
});
