// Reference-estimator errors do not measure the deployed three-anchor blend.
// Keep them for diagnosis, but do not promote a release or calibrate intervals.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function productionValidationFor(reference) {
  const referenceDecisionUse = reference.referenceDecisionUse ?? reference.decisionUse;
  return {
    ...reference,
    referenceDecisionUse,
    validationScope: "reference-estimator",
    productionValidation: "not-validated",
    rangeMethod: "heuristic",
    decisionUse: referenceDecisionUse === "compromised" ? "compromised" : "watch",
    modelCompetency: referenceDecisionUse === "compromised" ? 35 : 50,
  };
}

export function confidenceForEvidence({ recency, completeness, compQuality, agreement }, validation) {
  const evidence = recency * .25 + completeness * 100 * .25 + compQuality * .30 + agreement * .20;
  const cap = validation.decisionUse === "compromised" ? 35 : 50;
  return clamp(Math.round(evidence), 25, cap);
}

export function heuristicMargin({ spread, estimate, confidence }, validation) {
  const floor = validation.decisionUse === "compromised" ? .60 : .30;
  return clamp(Math.max(floor, spread / estimate * .28, (100 - confidence) / 300), .08, .60);
}
