const EARTH_RADIUS_MILES = 3958.8;

export function daysSince(value, now = new Date()) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

export function distanceMiles(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const deltaLat = radians(b.lat - a.lat);
  const deltaLng = radians(b.lng - a.lng);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function normalizedPropertyType(value) {
  const normalized = String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("single") || normalized === "singlfam") return "single-family";
  if (normalized.includes("town")) return "townhouse";
  if (normalized.includes("condo")) return "condo";
  if (normalized.includes("multi")) return "multifamily";
  return normalized || "residential";
}

export function nearestCluster(listing, clusters) {
  if (!listing || !Number.isFinite(listing.lat) || !Number.isFinite(listing.lng)) return null;
  return clusters
    .map((cluster) => ({ ...cluster, distanceMiles: distanceMiles(listing, cluster) }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)[0] ?? null;
}

export function selectComparableControls(listing, properties, limit = 5) {
  if (!listing || !Number.isFinite(listing.lat) || !Number.isFinite(listing.lng)) return [];
  const targetType = normalizedPropertyType(listing.propertyType);
  return properties
    .filter((property) => property.marketId === "raleigh" && property.sqft > 0)
    .map((property) => ({
      ...property,
      distanceMiles: distanceMiles(listing, property),
      typeMatch: normalizedPropertyType(property.propertyType) === targetType,
    }))
    .sort((a, b) => Number(b.typeMatch) - Number(a.typeMatch) || a.distanceMiles - b.distanceMiles)
    .slice(0, limit);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildPublicRecordRange(listing, controls) {
  if (!listing?.squareFootage || controls.length < 3) return null;
  const sameType = controls.filter((control) => control.typeMatch);
  const usable = sameType.length >= 3 ? sameType : controls;
  const centerPpsf = median(usable.map((control) => control.model.value / control.sqft));
  const lowPpsf = median(usable.map((control) => control.model.low / control.sqft));
  const highPpsf = median(usable.map((control) => control.model.high / control.sqft));
  if (centerPpsf === null || lowPpsf === null || highPpsf === null) return null;
  const medianDistance = median(usable.map((control) => control.distanceMiles)) ?? 99;
  const typeMatchPct = Math.round(sameType.length / controls.length * 100);
  const quality = sameType.length >= 3 && medianDistance <= 5 ? "strong"
    : sameType.length >= 3 && medianDistance <= 10 ? "moderate" : "weak";
  return {
    center: Math.round(centerPpsf * listing.squareFootage / 1000) * 1000,
    low: Math.round(lowPpsf * listing.squareFootage / 1000) * 1000,
    high: Math.round(highPpsf * listing.squareFootage / 1000) * 1000,
    centerPpsf: Math.round(centerPpsf),
    controlCount: usable.length,
    medianDistance: Math.round(medianDistance * 10) / 10,
    typeMatchPct,
    quality,
  };
}

export function listingTruth(listing, sourceMode, now = new Date()) {
  if (!listing || sourceMode !== "connected") {
    return { verified: false, freshnessDays: null, reason: "No connected active-listing response is available." };
  }
  const active = String(listing.status ?? "").toLowerCase() === "active";
  const traceable = Boolean(listing.mlsName || listing.mlsNumber);
  const freshnessDays = daysSince(listing.lastSeenDate, now);
  if (!active) return { verified: false, freshnessDays, reason: "The listing is not marked active by the connected feed." };
  if (!traceable) return { verified: false, freshnessDays, reason: "The listing lacks a traceable MLS name or identifier." };
  if (freshnessDays > 7) return { verified: false, freshnessDays, reason: "The listing was not observed within the last seven days." };
  return { verified: true, freshnessDays, reason: "Active, source-traceable and observed within seven days." };
}

function gate(id, label, status, detail) {
  return { id, label, status, detail };
}

export function buildDecisionMemo({ listing, sourceMode, publicRange, cluster, rentEvidence, attomEvidence, now = new Date() }) {
  const truth = listingTruth(listing, sourceMode, now);
  if (!listing) {
    return {
      decision: "stop",
      headline: "No property conclusion",
      rationale: "Load the connected Raleigh feed before evaluating a candidate.",
      gates: [gate("listing", "Listing truth", "fail", truth.reason)],
      nextActions: ["Load the Raleigh candidate set", "Choose a source-traceable active listing"],
    };
  }

  const listingGate = gate("listing", "Listing truth", truth.verified ? "pass" : "fail", truth.reason);
  let valuationGate = gate("valuation", "Public-record range", "fail", "No sufficiently comparable public-record range is available.");
  if (publicRange) {
    const askToCenter = listing.price / publicRange.center;
    const askToHigh = listing.price / publicRange.high;
    valuationGate = askToCenter <= 1
      ? gate("valuation", "Public-record range", "pass", `Ask is ${Math.round((1 - askToCenter) * 100)}% at or below the model center.`)
      : askToHigh <= 1
        ? gate("valuation", "Public-record range", "watch", "Ask is above the model center but remains inside the uncertainty range.")
        : gate("valuation", "Public-record range", "fail", `Ask is ${Math.round((askToHigh - 1) * 100)}% above the model high bound.`);
  }

  const compGate = !publicRange
    ? gate("controls", "Comparable quality", "fail", "Fewer than three usable public-record controls.")
    : gate("controls", "Comparable quality", publicRange.quality === "strong" ? "pass" : publicRange.quality === "moderate" ? "watch" : "fail", `${publicRange.controlCount} controls · ${publicRange.medianDistance} mi median distance · ${publicRange.typeMatchPct}% same type.`);

  const propertyRent = rentEvidence?.source === "rentcast_property" && rentEvidence.median > 0;
  const grossYield = propertyRent ? rentEvidence.median * 12 / listing.price * 100 : null;
  const rentGate = !propertyRent
    ? gate("rent", "Property rent", "watch", cluster ? `Only ACS cluster context is available (${cluster.rentP25}–${cluster.rentP75}); it is not property rent evidence.` : "No property-level rent evidence is available.")
    : grossYield >= 5.5
      ? gate("rent", "Property rent", "pass", `${grossYield.toFixed(1)}% gross asking-price yield from a property estimate with ${rentEvidence.compCount ?? 0} comps.`)
      : grossYield >= 3.5
        ? gate("rent", "Property rent", "watch", `${grossYield.toFixed(1)}% gross asking-price yield requires expense and financing stress tests.`)
        : gate("rent", "Property rent", "fail", `${grossYield.toFixed(1)}% gross asking-price yield does not clear the screening floor.`);

  const attomGate = !attomEvidence || attomEvidence.status === "unavailable"
    ? gate("vendor", "Independent cross-check", "watch", "ATTOM has not independently cross-checked this address.")
    : Math.abs(attomEvidence.deltaPct ?? 0) <= 15
      ? gate("vendor", "Independent cross-check", "pass", `ATTOM is within ${Math.abs(attomEvidence.deltaPct ?? 0).toFixed(1)}% of the public-record center.`)
      : Math.abs(attomEvidence.deltaPct ?? 0) <= 25
        ? gate("vendor", "Independent cross-check", "watch", `ATTOM differs by ${Math.abs(attomEvidence.deltaPct ?? 0).toFixed(1)}%; widen diligence.`)
        : gate("vendor", "Independent cross-check", "fail", `ATTOM differs by ${Math.abs(attomEvidence.deltaPct ?? 0).toFixed(1)}%; the valuation thesis is not stable.`);

  const gates = [listingGate, valuationGate, compGate, rentGate, attomGate];
  const passCount = gates.filter((item) => item.status === "pass").length;
  const hardStop = listingGate.status === "fail" || valuationGate.status === "fail" || rentGate.status === "fail" || attomGate.status === "fail";
  const decision = hardStop ? "stop" : propertyRent && passCount >= 4 ? "advance" : "watch";
  const headline = decision === "advance" ? "Advance to full underwriting"
    : decision === "watch" ? "Watch · complete missing diligence" : "Stop the current thesis";
  const rationale = decision === "advance"
    ? "The evidence clears the screening gates. This is permission to underwrite, not a purchase recommendation."
    : decision === "watch"
      ? "The candidate remains plausible, but one or more property-level facts are incomplete or only contextual."
      : "A required truth or model gate failed. Do not advance until the conflicting evidence is repaired.";
  const nextActions = gates.filter((item) => item.status !== "pass").map((item) => item.detail).slice(0, 3);
  if (decision === "advance") nextActions.push("Stress taxes, insurance, vacancy, maintenance, financing and physical condition before any offer.");
  return { decision, headline, rationale, gates, nextActions, grossYield };
}
