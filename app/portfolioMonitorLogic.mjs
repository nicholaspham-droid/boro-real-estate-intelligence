export function normalizedAddress(value) {
  return String(value ?? "").toUpperCase().replace(/\b(STREET|ST)\b/g, "ST").replace(/\b(AVENUE|AVE)\b/g, "AVE").replace(/\b(ROAD|RD)\b/g, "RD").replace(/[^A-Z0-9]+/g, " ").trim();
}

export function listingVerificationDecision(listing, verification) {
  const checks = [
    { id: "feed", label: "Connected candidate", pass: Boolean(listing?.id && listing?.status === "Active"), detail: listing?.status === "Active" ? "Active in the regional listing response" : "Regional response does not report Active" },
    { id: "address", label: "Exact-address recheck", pass: Boolean(verification?.activeSale), detail: verification?.activeSale ? "Active sale returned for the exact address" : "No exact-address active sale returned" },
    { id: "source", label: "Traceable source", pass: Boolean(verification?.activeSale?.mlsName || verification?.activeSale?.mlsNumber || listing?.mlsName || listing?.mlsNumber), detail: verification?.activeSale?.mlsName || verification?.activeSale?.mlsNumber || listing?.mlsName || listing?.mlsNumber || "No MLS/source identifier" },
    { id: "facts", label: "Core property facts", pass: Boolean(listing?.price && listing?.squareFootage && listing?.propertyType), detail: listing?.price && listing?.squareFootage ? "Price, living area and property type present" : "Required listing fields are incomplete" },
    { id: "crosscheck", label: "Independent property match", pass: Boolean(verification?.attom?.value), detail: verification?.attom?.value ? "ATTOM facts and AVM matched" : "ATTOM match unavailable; keep at watch" },
    { id: "rent", label: "Property rent evidence", pass: Boolean(verification?.rent?.median), detail: verification?.rent?.median ? `${verification.rent.compCount ?? 0} rental comps in provider estimate` : "No property-specific rent estimate" },
  ];
  const requiredPass = checks.filter((check) => ["feed", "address", "source", "facts"].includes(check.id)).every((check) => check.pass);
  const confidence = checks.filter((check) => check.pass).length / checks.length;
  return { addable: requiredPass, status: requiredPass && confidence >= .83 ? "verified" : requiredPass ? "watch" : "blocked", confidence: Math.round(confidence * 100), checks };
}

export function nearestRegionalCluster(listing, clusters) {
  if (!listing || !Array.isArray(clusters) || !clusters.length) return null;
  return [...clusters].sort((a, b) => ((a.lat - listing.lat) ** 2 + (a.lng - listing.lng) ** 2) - ((b.lat - listing.lat) ** 2 + (b.lng - listing.lng) ** 2))[0] ?? null;
}
