/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import sourceRegistry from "../data/source-registry.json";
import marketCompetency from "../data/market-competency.json";
import firstWaveSamples from "../data/snapshots/first-wave-samples.json";
import liveAudit from "../data/snapshots/live-audit-2026-08-07.json";
import acsAggregations from "../data/acs-market-aggregations.json";
import pricingHistory from "../data/fhfa-pricing-history.json";
import clusterPricingHistory from "../data/fhfa-cluster-pricing-history.json";
import propertyValuations from "../data/property-valuations.json";
import modelQualityScorecard from "../data/model-quality-scorecard.json";

interface AttomProperty {
  identifier?: { attomId?: string | number; apn?: string };
  address?: { oneLine?: string };
  location?: { latitude?: string | number; longitude?: string | number; geoIdV4?: Record<string, string> };
  summary?: { proptype?: string; propType?: string; propertyType?: string; yearbuilt?: number; yearBuilt?: number };
  building?: {
    summary?: { yearbuilt?: number; yearBuilt?: number; unitsCount?: number; levels?: number; quality?: string };
    size?: { livingsize?: number; livingSize?: number; universalsize?: number; universalSize?: number };
    rooms?: { beds?: number; bathstotal?: number; bathsTotal?: number };
    construction?: { condition?: string; propertyStructureMajorImprovementsYear?: number };
    parking?: { prkgSpaces?: number; garageType?: string; garagetype?: string };
  };
  assessment?: {
    assessed?: { assdttlvalue?: number; assdTtlValue?: number };
    market?: { mktttlvalue?: number; mktTtlValue?: number };
    tax?: { taxyear?: number; taxYear?: number; taxamt?: number; taxAmt?: number; taxPerSizeUnit?: number };
    mortgage?: {
      FirstConcurrent?: AttomMortgage;
      firstConcurrent?: AttomMortgage;
      SecondConcurrent?: AttomMortgage;
      secondConcurrent?: AttomMortgage;
    };
  };
  sale?: {
    saleTransDate?: string;
    salesearchdate?: string;
    saleSearchDate?: string;
    armsLengthIdent?: string;
    amount?: { saleamt?: number; saleAmt?: number; saledisclosuretype?: number | string; saleDisclosureType?: number | string };
    calculation?: { pricePerSizeUnit?: number };
  };
  saleHistory?: AttomSaleHistory[] | AttomSaleHistory;
  buildingPermits?: AttomPermit[] | AttomPermit;
  avm?: {
    amount?: { value?: number; low?: number; high?: number; scr?: number };
    eventDate?: string;
    calculations?: { perSizeUnit?: number; monthlyChgPct?: number; monthlyChgValue?: number; ratioTaxValue?: number; ratioTaxAmt?: number; rangePctOfValue?: number };
  };
  homeEquity?: { LTV?: number; ltv?: number; estimatedAvailableEquity?: number };
  school?: AttomSchool[] | AttomSchool;
  schools?: AttomSchool[] | AttomSchool | { school?: AttomSchool[] | AttomSchool };
  vintage?: { pubDate?: string; lastModified?: string };
}

type AttomMortgage = {
  amount?: number;
  date?: string;
  interestRate?: number;
  loanTypeCode?: string;
  term?: number;
  dueDate?: string;
  interestRateType?: string;
  equityFlag?: string;
  refiFlag?: string;
};

type AttomSaleHistory = {
  sequence?: number;
  saleSearchDate?: string;
  saleTransDate?: string;
  armsLengthIdent?: string;
  deedInLieuOfIndicator?: string;
  amount?: { saleAmt?: number; saleCode?: string; saleRecDate?: string; saleDisclosureType?: string | number; saleDocType?: string };
};

type AttomPermit = {
  effectiveDate?: string;
  status?: string;
  description?: string;
  type?: string;
  subType?: string;
  projectName?: string;
  jobValue?: number;
  fees?: number;
};

type AttomSchool = {
  schoolName?: string;
  name?: string;
  schoolType?: string;
  gradeSpanLow?: string;
  gradeSpanHigh?: string;
  testRating?: number;
  distance?: number;
  enrollment?: number;
  updatedate?: string;
};

type RentCastListing = {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  yearBuilt?: number;
  status?: string;
  price?: number;
  listingType?: string;
  listedDate?: string;
  lastSeenDate?: string;
  daysOnMarket?: number;
  mlsName?: string;
  mlsNumber?: string;
};

type RentCastRentEstimate = {
  rent?: number;
  rentRangeLow?: number;
  rentRangeHigh?: number;
  subjectProperty?: {
    propertyType?: string;
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
  };
  comparables?: Array<{
    price?: number;
    squareFootage?: number;
    distance?: number;
    daysOld?: number;
    correlation?: number;
    lastSeenDate?: string;
    propertyType?: string;
  }>;
};

function normalizeRentCastListing(listing: RentCastListing | undefined) {
  if (!listing) return null;
  return {
    status: listing.status ?? "Unknown",
    price: listing.price ?? null,
    listedDate: listing.listedDate ?? null,
    lastSeenDate: listing.lastSeenDate ?? null,
    daysOnMarket: listing.daysOnMarket ?? null,
    mlsName: listing.mlsName ?? null,
    mlsNumber: listing.mlsNumber ?? null,
  };
}

async function rentCastRequest<T extends object>(apiKey: string, path: string, address: string, parameters: Record<string, string | number | boolean | null | undefined> = {}) {
  const endpoint = new URL(`https://api.rentcast.io/v1/${path}`);
  endpoint.searchParams.set("address", address);
  if (path.startsWith("listings/")) {
    endpoint.searchParams.set("status", "Active");
    endpoint.searchParams.set("limit", "1");
  } else {
    endpoint.searchParams.set("compCount", "5");
  }
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== null && value !== undefined && value !== "") endpoint.searchParams.set(key, String(value));
  }
  const response = await fetch(endpoint, { headers: { Accept: "application/json", "X-Api-Key": apiKey } });
  const payload = await response.json() as T | { message?: string };
  if (!response.ok) throw new Error("message" in payload && payload.message ? payload.message : `RentCast request failed (${response.status})`);
  return payload as T;
}

function rentCastPropertyType(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("condo")) return "Condo";
  if (normalized.includes("town") || normalized.includes("row")) return "Townhouse";
  if (normalized.includes("manufactured") || normalized.includes("mobile")) return "Manufactured";
  if (normalized.includes("multi") || normalized.includes("apartment") || /\b[234]\s*family\b/.test(normalized)) return "Multi-Family";
  return "Single Family";
}

function roundedMonthlyRent(value: number) {
  return Math.round(value / 25) * 25;
}

function bounded(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function medianNumber(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantileNumber(values: number[], percentile: number) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function daysSince(value?: string) {
  if (!value) return 365;
  return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 86_400_000));
}

const LISTING_MARKETS = {
  raleigh: { id: "raleigh", city: "Raleigh", state: "NC", label: "Raleigh, NC", center: { lat: 35.7796, lng: -78.6382 } },
  chicago: { id: "chicago", city: "Chicago", state: "IL", label: "Chicago, IL", center: { lat: 41.8781, lng: -87.6298 } },
  philadelphia: { id: "philadelphia", city: "Philadelphia", state: "PA", label: "Philadelphia, PA", center: { lat: 39.9526, lng: -75.1652 } },
} as const;

type ListingMarketId = keyof typeof LISTING_MARKETS;

async function fetchMarketListingPilot(apiKey: string, marketId: ListingMarketId) {
  const marketConfig = LISTING_MARKETS[marketId];
  const modelMarket = propertyValuations.markets.find((market) => market.id === marketId);
  const marketCompetencyScore = modelMarket && "competency" in modelMarket ? modelMarket.competency : 50;
  const endpoint = new URL("https://api.rentcast.io/v1/listings/sale");
  endpoint.searchParams.set("city", marketConfig.city);
  endpoint.searchParams.set("state", marketConfig.state);
  endpoint.searchParams.set("status", "Active");
  endpoint.searchParams.set("propertyType", "Single Family|Condo|Townhouse|Multi-Family");
  endpoint.searchParams.set("price", "75000:3000000");
  endpoint.searchParams.set("limit", "500");
  endpoint.searchParams.set("includeTotalCount", "true");
  const response = await fetch(endpoint, { headers: { Accept: "application/json", "X-Api-Key": apiKey } });
  const responseBody = await response.text();
  let payload: RentCastListing[] | { message?: string };
  try {
    payload = JSON.parse(responseBody) as RentCastListing[] | { message?: string };
  } catch {
    throw new Error(`Listing provider returned an unreadable response (${response.status})`);
  }
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(!Array.isArray(payload) && payload.message ? payload.message : `RentCast request failed (${response.status})`);
  }

  const usable = payload.filter((listing) => listing.id && listing.formattedAddress && listing.price && listing.squareFootage && listing.latitude && listing.longitude);
  const medianPpsf = medianNumber(usable.map((listing) => listing.price! / listing.squareFootage!));
  const typePpsf = new Map<string, number>();
  for (const propertyType of new Set(usable.map((listing) => listing.propertyType ?? "Residential"))) {
    const values = usable.filter((listing) => (listing.propertyType ?? "Residential") === propertyType).map((listing) => listing.price! / listing.squareFootage!);
    if (values.length >= 8) typePpsf.set(propertyType, medianNumber(values));
  }
  const scoredEvidence = usable.map((listing) => {
    const ppsf = listing.price! / listing.squareFootage!;
    const ppsfBaseline = typePpsf.get(listing.propertyType ?? "Residential") ?? medianPpsf;
    const dom = listing.daysOnMarket ?? 0;
    const freshnessDays = daysSince(listing.lastSeenDate);
    const valueSignal = bounded(50 + (ppsfBaseline - ppsf) / Math.max(1, ppsfBaseline) * 120, 20, 92);
    const negotiability = dom >= 21 && dom <= 90 ? 88 : dom <= 180 && dom > 90 ? 64 : dom <= 365 && dom > 180 ? 44 : dom > 365 ? 24 : dom >= 7 ? 64 : 46;
    const freshness = freshnessDays <= 1 ? 100 : freshnessDays <= 3 ? 86 : freshnessDays <= 7 ? 68 : 42;
    const completeness = [listing.bedrooms, listing.bathrooms, listing.squareFootage, listing.yearBuilt, listing.mlsName, listing.mlsNumber].filter((value) => value !== null && value !== undefined && value !== "").length / 6 * 100;
    const components = {
      value: Math.round(valueSignal),
      marketTime: Math.round(negotiability),
      freshness: Math.round(freshness),
      completeness: Math.round(completeness),
      marketContext: marketCompetencyScore,
    };
    const rawSignal = Math.round(components.value * .65 + components.marketTime * .35);
    const reasons = [
      ppsf <= ppsfBaseline ? `${Math.round((1 - ppsf / ppsfBaseline) * 100)}% below ${listing.propertyType ?? "market"} median price/sf` : `${Math.round((ppsf / ppsfBaseline - 1) * 100)}% above ${listing.propertyType ?? "market"} median price/sf`,
      `${dom} days on market`,
      freshnessDays <= 3 ? "recently observed" : `last observed ${freshnessDays} days ago`,
    ];
    return {
      id: listing.id,
      address: listing.formattedAddress,
      addressLine1: listing.addressLine1 ?? listing.formattedAddress,
      city: listing.city ?? marketConfig.city,
      state: listing.state ?? marketConfig.state,
      zipCode: listing.zipCode ?? null,
      county: listing.county ?? null,
      lat: listing.latitude,
      lng: listing.longitude,
      propertyType: listing.propertyType ?? "Single Family",
      bedrooms: listing.bedrooms ?? null,
      bathrooms: listing.bathrooms ?? null,
      squareFootage: listing.squareFootage,
      yearBuilt: listing.yearBuilt ?? null,
      status: listing.status ?? "Active",
      price: listing.price,
      pricePerSqft: Math.round(ppsf),
      listingType: listing.listingType ?? null,
      listedDate: listing.listedDate ?? null,
      lastSeenDate: listing.lastSeenDate ?? null,
      daysOnMarket: listing.daysOnMarket ?? null,
      mlsName: listing.mlsName ?? null,
      mlsNumber: listing.mlsNumber ?? null,
      rawSignal,
      components,
      reasons,
    };
  });

  const evidencePpsfValues = scoredEvidence.map((listing) => listing.pricePerSqft);
  const evidenceCompletenessValues = scoredEvidence.map((listing) => listing.components.completeness);
  const evidenceFreshCount = scoredEvidence.filter((listing) => listing.components.freshness >= 68).length;
  const diagnostics = modelMarket && "diagnostics" in modelMarket ? modelMarket.diagnostics : null;
  const medianCompleteness = Math.round(medianNumber(evidenceCompletenessValues));
  const freshnessCoverage = Math.round(evidenceFreshCount / Math.max(1, scoredEvidence.length) * 100);
  const backtestSample = diagnostics?.sampleSize ?? 0;
  const p80Error = diagnostics?.p80AbsoluteErrorPct ?? 100;
  const modelGate = diagnostics && "decisionUse" in diagnostics ? diagnostics.decisionUse : null;
  const regionalStatus = modelGate === "compromised" ? "compromised"
    : scoredEvidence.length >= 100 && medianCompleteness >= 70 && backtestSample >= 20 && p80Error <= 25 && modelGate !== "watch" ? "pass"
      : scoredEvidence.length >= 30 && backtestSample >= 5 && p80Error <= 35 ? "watch" : "compromised";
  const regionalReliabilityCap = regionalStatus === "pass" ? .95 : regionalStatus === "watch" ? .80 : .55;
  const scored = scoredEvidence.map((listing) => {
    const observedReliability = (listing.components.freshness * .35 + listing.components.completeness * .30 + listing.components.marketContext * .35) / 100;
    const evidenceReliability = Math.min(regionalReliabilityCap, observedReliability);
    const screeningScore = Math.round(50 + (listing.rawSignal - 50) * evidenceReliability);
    return {
      ...listing,
      screeningScore,
      evidenceReliability: Math.round(evidenceReliability * 100),
      reasons: [...listing.reasons, `${Math.round(evidenceReliability * 100)}% reliability after the ${regionalStatus} regional gate`],
    };
  }).sort((a, b) => b.screeningScore - a.screeningScore);

  const baselineScore = Math.round(medianNumber(scored.map((listing) => listing.screeningScore)));
  const componentBaselines = {
    value: Math.round(medianNumber(scored.map((listing) => listing.components.value))),
    marketTime: Math.round(medianNumber(scored.map((listing) => listing.components.marketTime))),
    freshness: Math.round(medianNumber(scored.map((listing) => listing.components.freshness))),
    completeness: Math.round(medianNumber(scored.map((listing) => listing.components.completeness))),
    marketContext: marketCompetencyScore,
  };
  const enriched = scored.map((listing) => {
    const deltaFromBaseline = listing.screeningScore - baselineScore;
    const belowCount = scored.filter((candidate) => candidate.screeningScore < listing.screeningScore).length;
    const percentile = scored.length <= 1 ? 100 : Math.round(belowCount / (scored.length - 1) * 100);
    return {
      ...listing,
      deltaFromBaseline,
      percentile,
      priority: deltaFromBaseline >= 7 && percentile >= 65 ? "high" as const : deltaFromBaseline <= -7 || percentile <= 30 ? "low" as const : "medium" as const,
      scoreBreakdown: [
        { key: "value", label: "Relative price / sf", weight: 65, score: listing.components.value, baseline: componentBaselines.value, weightedPoints: Math.round(listing.components.value * .65 * 10) / 10 },
        { key: "marketTime", label: "Market time", weight: 35, score: listing.components.marketTime, baseline: componentBaselines.marketTime, weightedPoints: Math.round(listing.components.marketTime * .35 * 10) / 10 },
      ],
    };
  });

  const selectedIds = new Set<string>();
  const comparisonSet: typeof enriched = [];
  const add = (listing: (typeof enriched)[number] | undefined) => {
    if (listing?.id && !selectedIds.has(listing.id)) {
      selectedIds.add(listing.id);
      comparisonSet.push(listing);
    }
  };
  enriched.slice(0, 8).forEach(add);
  [...enriched].sort((a, b) => Math.abs(a.deltaFromBaseline) - Math.abs(b.deltaFromBaseline)).slice(0, 16).forEach((listing) => {
    if (comparisonSet.length < 16) add(listing);
  });
  enriched.slice(-16).reverse().forEach((listing) => {
    if (comparisonSet.length < 24) add(listing);
  });
  enriched.forEach((listing) => {
    if (comparisonSet.length < 24) add(listing);
  });
  comparisonSet.sort((a, b) => b.screeningScore - a.screeningScore);

  const ppsfP25 = Math.round(quantileNumber(evidencePpsfValues, .25));
  const ppsfP75 = Math.round(quantileNumber(evidencePpsfValues, .75));

  return {
    listings: comparisonSet,
    candidateCount: Number(response.headers.get("X-Total-Count")) || payload.length,
    scoredCandidateCount: scored.length,
    medianPricePerSqft: Math.round(medianPpsf),
    pricePerSqftBand: { p25: ppsfP25, median: Math.round(medianPpsf), p75: ppsfP75 },
    baselineScore,
    componentBaselines,
    regionDiagnostics: {
      status: regionalStatus,
      listingSample: scored.length,
      listingCompleteness: medianCompleteness,
      listingFreshnessCoverage: freshnessCoverage,
      publicRecordBacktestSample: backtestSample,
      publicRecordMedianErrorPct: diagnostics?.medianAbsoluteErrorPct ?? null,
      publicRecordP80ErrorPct: diagnostics?.p80AbsoluteErrorPct ?? null,
      modelCompetency: modelMarket && "modelCompetency" in modelMarket ? modelMarket.modelCompetency : null,
      interpretation: regionalStatus === "pass" ? "Listing breadth, field completeness and public-record backtesting support regional use with visible uncertainty." : regionalStatus === "watch" ? "The regional model remains usable for screening, but reliability is capped at 80% because sample depth or validation error requires higher diligence." : "Regional evidence does not clear the minimum transferability gate; reliability is capped at 55% and scores must not be compared as if equally calibrated.",
    },
  };
}

type AttomEvidenceDepth = "core" | "underwriting";
type AttomModuleStatus = "available" | "no_result" | "not_entitled" | "error";

type AttomModuleEvidence = {
  id: string;
  label: string;
  endpoint: string;
  status: AttomModuleStatus;
  countedCalls: number;
  message: string | null;
};

const ATTOM_UNDERWRITING_MODULES = [
  { id: "expanded_profile", label: "Assessment, tax + mortgage", endpoint: "property/expandedprofile" },
  { id: "sales_history", label: "10-year recorded sales", endpoint: "saleshistory/expandedhistory" },
  { id: "building_permits", label: "Building permits", endpoint: "property/buildingpermits" },
  { id: "home_equity", label: "Home equity + LTV", endpoint: "valuation/homeequity" },
  { id: "schools", label: "School context", endpoint: "property/detailwithschools" },
] as const;

class AttomApiError extends Error {
  countedCalls: number;
  status: number;
  category: Exclude<AttomModuleStatus, "available">;

  constructor(message: string, status: number, countedCalls: number, category: Exclude<AttomModuleStatus, "available">) {
    super(message);
    this.name = "AttomApiError";
    this.status = status;
    this.countedCalls = countedCalls;
    this.category = category;
  }
}

function finiteAttomNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function attomArray<T>(value: T[] | T | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

async function attomPropertyRequest(apiKey: string, endpoint: string, address1: string, address2: string) {
  const attomUrl = new URL(`https://api.gateway.attomdata.com/propertyapi/v1.0.0/${endpoint}`);
  attomUrl.searchParams.set("address1", address1);
  attomUrl.searchParams.set("address2", address2);
  const upstream = await fetch(attomUrl, { headers: { Accept: "application/json", APIKey: apiKey } });
  const countedCalls = upstream.status === 200 ? 1 : 0;
  let payload: { property?: AttomProperty[]; status?: { code?: number; msg?: string } } = {};
  try { payload = await upstream.json() as typeof payload; } catch { /* bounded ATTOM JSON response was unreadable */ }
  if (upstream.status === 401 || upstream.status === 403) {
    throw new AttomApiError(`ATTOM authorization failed for ${endpoint}. Verify product entitlement.`, upstream.status, countedCalls, "not_entitled");
  }
  if (!upstream.ok) throw new AttomApiError(payload.status?.msg || `ATTOM ${endpoint} request failed (${upstream.status})`, upstream.status, countedCalls, "error");
  if (!payload.property?.length) throw new AttomApiError(payload.status?.msg || "SuccessWithoutResult", upstream.status, countedCalls, "no_result");
  return { property: payload.property[0], countedCalls };
}

function normalizedMortgage(mortgage: AttomMortgage | undefined) {
  if (!mortgage) return null;
  const amount = finiteAttomNumber(mortgage.amount);
  if (amount === null && !mortgage.date && !mortgage.dueDate) return null;
  return {
    amount,
    date: mortgage.date ?? null,
    rate: finiteAttomNumber(mortgage.interestRate),
    rateType: mortgage.interestRateType ?? null,
    loanType: mortgage.loanTypeCode ?? null,
    termMonths: finiteAttomNumber(mortgage.term),
    dueDate: mortgage.dueDate ?? null,
    refinance: mortgage.refiFlag ?? null,
    equityLoan: mortgage.equityFlag ?? null,
  };
}

function normalizedSalesHistory(property: AttomProperty | null) {
  return attomArray(property?.saleHistory).slice(0, 20).map((event) => ({
    sequence: finiteAttomNumber(event.sequence),
    date: event.saleTransDate ?? event.saleSearchDate ?? event.amount?.saleRecDate ?? null,
    amount: finiteAttomNumber(event.amount?.saleAmt),
    amountCode: event.amount?.saleCode ?? null,
    disclosure: event.amount?.saleDisclosureType ?? null,
    documentType: event.amount?.saleDocType ?? null,
    armsLength: event.armsLengthIdent ?? null,
    deedInLieu: event.deedInLieuOfIndicator ?? null,
  }));
}

function normalizedPermits(property: AttomProperty | null) {
  return attomArray(property?.buildingPermits).slice(0, 20).map((permit) => ({
    date: permit.effectiveDate ?? null,
    status: permit.status ?? null,
    type: permit.type ?? null,
    subType: permit.subType ?? null,
    project: permit.projectName ?? null,
    description: permit.description?.slice(0, 500) ?? null,
    jobValue: finiteAttomNumber(permit.jobValue),
    fees: finiteAttomNumber(permit.fees),
  }));
}

function normalizedSchools(property: AttomProperty | null) {
  const nested: AttomSchool[] | AttomSchool | null | undefined = property?.schools && !Array.isArray(property.schools) && "school" in property.schools ? property.schools.school : property?.schools as AttomSchool[] | AttomSchool | null | undefined;
  return [...attomArray(property?.school), ...attomArray(nested)].slice(0, 12).map((school) => ({
    name: school.schoolName ?? school.name ?? null,
    type: school.schoolType ?? null,
    grades: school.gradeSpanLow || school.gradeSpanHigh ? `${school.gradeSpanLow ?? "?"}–${school.gradeSpanHigh ?? "?"}` : null,
    rating: finiteAttomNumber(school.testRating),
    distanceMiles: finiteAttomNumber(school.distance),
    enrollment: finiteAttomNumber(school.enrollment),
    updatedAt: school.updatedate ?? null,
  }));
}

async function fetchAttomProperty(apiKey: string, address1: string, address2: string, depth: AttomEvidenceDepth = "core") {
  const core = await attomPropertyRequest(apiKey, "attomavm/detail", address1, address2);
  const moduleEvidence: AttomModuleEvidence[] = [{ id: "avm_detail", label: "Facts, sale + AVM", endpoint: "attomavm/detail", status: "available", countedCalls: core.countedCalls, message: null }];
  const moduleProperties = new Map<string, AttomProperty>();
  let providerCalls = core.countedCalls;
  let attemptedRequests = 1;

  if (depth === "underwriting") {
    const moduleResults = await Promise.all(ATTOM_UNDERWRITING_MODULES.map(async (module) => {
      try {
        const result = await attomPropertyRequest(apiKey, module.endpoint, address1, address2);
        return { module, property: result.property, evidence: { ...module, status: "available" as const, countedCalls: result.countedCalls, message: null } };
      } catch (error) {
        const failure = error instanceof AttomApiError ? error : new AttomApiError("ATTOM module failed", 500, 0, "error");
        return { module, property: null, evidence: { ...module, status: failure.category, countedCalls: failure.countedCalls, message: failure.message } };
      }
    }));
    attemptedRequests += moduleResults.length;
    for (const result of moduleResults) {
      providerCalls += result.evidence.countedCalls;
      moduleEvidence.push(result.evidence);
      if (result.property) moduleProperties.set(result.module.id, result.property);
    }
  }

  const property = core.property;
  const expanded = moduleProperties.get("expanded_profile") ?? null;
  const history = moduleProperties.get("sales_history") ?? null;
  const permits = moduleProperties.get("building_permits") ?? null;
  const equity = moduleProperties.get("home_equity") ?? null;
  const schools = moduleProperties.get("schools") ?? null;
  const primaryMortgage = expanded?.assessment?.mortgage?.FirstConcurrent ?? expanded?.assessment?.mortgage?.firstConcurrent;
  const secondaryMortgage = expanded?.assessment?.mortgage?.SecondConcurrent ?? expanded?.assessment?.mortgage?.secondConcurrent;
  const normalized = {
    schemaVersion: 2,
    depth,
    attomId: property.identifier?.attomId ?? expanded?.identifier?.attomId ?? null,
    parcelId: property.identifier?.apn ?? expanded?.identifier?.apn ?? null,
    address: property.address?.oneLine ?? expanded?.address?.oneLine ?? `${address1}, ${address2}`,
    location: {
      latitude: property.location?.latitude ?? expanded?.location?.latitude ?? null,
      longitude: property.location?.longitude ?? expanded?.location?.longitude ?? null,
      geoIdV4: property.location?.geoIdV4 ?? expanded?.location?.geoIdV4 ?? null,
    },
    type: property.summary?.proptype ?? property.summary?.propType ?? property.summary?.propertyType ?? expanded?.summary?.propType ?? expanded?.summary?.propertyType ?? null,
    yearBuilt: finiteAttomNumber(property.summary?.yearbuilt, property.summary?.yearBuilt, property.building?.summary?.yearbuilt, property.building?.summary?.yearBuilt, expanded?.summary?.yearBuilt),
    livingSize: finiteAttomNumber(property.building?.size?.livingsize, property.building?.size?.livingSize, property.building?.size?.universalsize, property.building?.size?.universalSize, expanded?.building?.size?.universalSize),
    beds: finiteAttomNumber(property.building?.rooms?.beds, expanded?.building?.rooms?.beds),
    baths: finiteAttomNumber(property.building?.rooms?.bathstotal, property.building?.rooms?.bathsTotal, expanded?.building?.rooms?.bathsTotal),
    physical: {
      units: finiteAttomNumber(expanded?.building?.summary?.unitsCount, property.building?.summary?.unitsCount),
      levels: finiteAttomNumber(expanded?.building?.summary?.levels, property.building?.summary?.levels),
      condition: expanded?.building?.construction?.condition ?? property.building?.construction?.condition ?? null,
      majorImprovementYear: finiteAttomNumber(expanded?.building?.construction?.propertyStructureMajorImprovementsYear),
      parkingSpaces: finiteAttomNumber(expanded?.building?.parking?.prkgSpaces, property.building?.parking?.prkgSpaces),
    },
    assessment: {
      total: finiteAttomNumber(property.assessment?.assessed?.assdttlvalue, property.assessment?.assessed?.assdTtlValue, expanded?.assessment?.assessed?.assdTtlValue),
      market: finiteAttomNumber(property.assessment?.market?.mktttlvalue, property.assessment?.market?.mktTtlValue, expanded?.assessment?.market?.mktTtlValue),
      taxYear: finiteAttomNumber(property.assessment?.tax?.taxyear, property.assessment?.tax?.taxYear, expanded?.assessment?.tax?.taxYear),
      taxAmount: finiteAttomNumber(property.assessment?.tax?.taxamt, property.assessment?.tax?.taxAmt, expanded?.assessment?.tax?.taxAmt),
      taxPerSqft: finiteAttomNumber(property.assessment?.tax?.taxPerSizeUnit, expanded?.assessment?.tax?.taxPerSizeUnit),
    },
    sale: {
      date: property.sale?.saleTransDate ?? property.sale?.salesearchdate ?? property.sale?.saleSearchDate ?? expanded?.sale?.saleTransDate ?? expanded?.sale?.saleSearchDate ?? null,
      amount: finiteAttomNumber(property.sale?.amount?.saleamt, property.sale?.amount?.saleAmt, expanded?.sale?.amount?.saleAmt),
      disclosure: property.sale?.amount?.saledisclosuretype ?? property.sale?.amount?.saleDisclosureType ?? expanded?.sale?.amount?.saleDisclosureType ?? null,
      pricePerSqft: finiteAttomNumber(property.sale?.calculation?.pricePerSizeUnit, expanded?.sale?.calculation?.pricePerSizeUnit),
      armsLength: property.sale?.armsLengthIdent ?? expanded?.sale?.armsLengthIdent ?? null,
    },
    avm: {
      value: finiteAttomNumber(property.avm?.amount?.value),
      low: finiteAttomNumber(property.avm?.amount?.low),
      high: finiteAttomNumber(property.avm?.amount?.high),
      confidence: finiteAttomNumber(property.avm?.amount?.scr),
      asOf: property.avm?.eventDate ?? null,
      perSqft: finiteAttomNumber(property.avm?.calculations?.perSizeUnit),
      monthlyChangePct: finiteAttomNumber(property.avm?.calculations?.monthlyChgPct),
      monthlyChangeValue: finiteAttomNumber(property.avm?.calculations?.monthlyChgValue),
      taxToValueRatio: finiteAttomNumber(property.avm?.calculations?.ratioTaxValue),
      rangePctOfValue: finiteAttomNumber(property.avm?.calculations?.rangePctOfValue),
    },
    mortgage: { first: normalizedMortgage(primaryMortgage), second: normalizedMortgage(secondaryMortgage) },
    homeEquity: {
      ltvPct: finiteAttomNumber(equity?.homeEquity?.LTV, equity?.homeEquity?.ltv),
      estimatedAvailable: finiteAttomNumber(equity?.homeEquity?.estimatedAvailableEquity),
    },
    salesHistory: normalizedSalesHistory(history),
    permits: normalizedPermits(permits),
    schools: normalizedSchools(schools),
    modules: moduleEvidence,
    vintage: { published: property.vintage?.pubDate ?? expanded?.vintage?.pubDate ?? null, modified: property.vintage?.lastModified ?? expanded?.vintage?.lastModified ?? null },
  };
  return { property: normalized, providerCalls, attemptedRequests };
}

const ATTOM_SUCCESS_TTL_DAYS = 30;
const ATTOM_FAILURE_TTL_DAYS = 7;
const ATTOM_MARKET_SAMPLE_SIZE = 2;

type AttomNormalizedProperty = Awaited<ReturnType<typeof fetchAttomProperty>>["property"];
type AttomCacheRow = {
  property_key: string;
  property_id: string | null;
  market_id: string;
  normalized_address: string;
  provider_status: "matched" | "failed";
  payload: string | null;
  fetched_at: string;
  expires_at: string;
  error_message: string | null;
  api_call_count: number;
};

function normalizedAddress(address1: string, address2: string) {
  return `${address1} ${address2}`.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function attomPropertyKey(propertyId: string | null, address1: string, address2: string) {
  return propertyId ? `public:${propertyId}` : `address:${normalizedAddress(address1, address2)}`;
}

function datePlusDays(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

function parseAttomPayload(row: AttomCacheRow) {
  if (!row.payload) return null;
  try { return JSON.parse(row.payload) as AttomNormalizedProperty; } catch { return null; }
}

function attomCacheSatisfiesDepth(property: AttomNormalizedProperty | null, depth: AttomEvidenceDepth) {
  if (!property || property.schemaVersion < 2) return false;
  return depth === "core" || property.depth === "underwriting";
}

async function cachedAttomProperty(env: Env, input: { propertyId: string | null; marketId: string; address1: string; address2: string }, force = false, depth: AttomEvidenceDepth = "core") {
  const key = attomPropertyKey(input.propertyId, input.address1, input.address2);
  const cached = await env.DB.prepare("SELECT * FROM attom_enrichment WHERE property_key = ?").bind(key).first<AttomCacheRow>();
  const cachedProperty = cached?.provider_status === "matched" ? parseAttomPayload(cached) : null;
  if (!force && cached && cached.expires_at > new Date().toISOString() && (cached.provider_status === "failed" || attomCacheSatisfiesDepth(cachedProperty, depth))) {
    return { status: cached.provider_status, property: cachedProperty, error: cached.error_message, cacheHit: true, providerCalls: 0, attemptedRequests: 0, fetchedAt: cached.fetched_at };
  }
  if (!env.ATTOM_API_KEY) throw new Error("ATTOM is not configured");
  const fetchedAt = new Date().toISOString();
  try {
    const fetched = await fetchAttomProperty(env.ATTOM_API_KEY, input.address1, input.address2, depth);
    const property = fetched.property;
    await env.DB.prepare(`INSERT INTO attom_enrichment
      (property_key, property_id, market_id, normalized_address, provider_status, attom_id, payload, avm_value, avm_low, avm_high, avm_confidence, provider_modified_at, fetched_at, expires_at, error_message, api_call_count)
      VALUES (?, ?, ?, ?, 'matched', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      ON CONFLICT(property_key) DO UPDATE SET property_id=excluded.property_id, market_id=excluded.market_id,
      normalized_address=excluded.normalized_address, provider_status='matched', attom_id=excluded.attom_id,
      payload=excluded.payload, avm_value=excluded.avm_value, avm_low=excluded.avm_low, avm_high=excluded.avm_high,
      avm_confidence=excluded.avm_confidence, provider_modified_at=excluded.provider_modified_at,
      fetched_at=excluded.fetched_at, expires_at=excluded.expires_at, error_message=NULL,
      api_call_count=attom_enrichment.api_call_count + excluded.api_call_count`)
      .bind(key, input.propertyId, input.marketId, normalizedAddress(input.address1, input.address2), property.attomId == null ? null : String(property.attomId), JSON.stringify(property), property.avm.value, property.avm.low, property.avm.high, property.avm.confidence, property.vintage.modified ?? property.avm.asOf, fetchedAt, datePlusDays(ATTOM_SUCCESS_TTL_DAYS), fetched.providerCalls).run();
    return { status: "matched" as const, property, error: null, cacheHit: false, providerCalls: fetched.providerCalls, attemptedRequests: fetched.attemptedRequests, fetchedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ATTOM lookup failed";
    const countedCalls = error instanceof AttomApiError ? error.countedCalls : 0;
    await env.DB.prepare(`INSERT INTO attom_enrichment
      (property_key, property_id, market_id, normalized_address, provider_status, payload, fetched_at, expires_at, error_message, api_call_count)
      VALUES (?, ?, ?, ?, 'failed', NULL, ?, ?, ?, ?)
      ON CONFLICT(property_key) DO UPDATE SET provider_status='failed', payload=NULL, fetched_at=excluded.fetched_at,
      expires_at=excluded.expires_at, error_message=excluded.error_message,
      api_call_count=attom_enrichment.api_call_count + excluded.api_call_count`)
      .bind(key, input.propertyId, input.marketId, normalizedAddress(input.address1, input.address2), fetchedAt, datePlusDays(ATTOM_FAILURE_TTL_DAYS), message, countedCalls).run();
    return { status: "failed" as const, property: null, error: message, cacheHit: false, providerCalls: countedCalls, attemptedRequests: 1, fetchedAt };
  }
}

function attomSecondarySignal(sample: (typeof propertyValuations.properties)[number], property: AttomNormalizedProperty | null) {
  const avm = property?.avm.value;
  if (!avm || avm <= 0) return null;
  const market = propertyValuations.markets.find((candidate) => candidate.id === sample.marketId);
  const publicCompetency = market && "competency" in market ? market.competency : 50;
  const providerConfidence = bounded(Number(property?.avm.confidence ?? 50));
  const deltaPct = (avm - sample.model.value) / sample.model.value * 100;
  const agreementScore = bounded(100 - Math.abs(deltaPct) * 2.5);
  const factCompleteness = [property?.livingSize, property?.yearBuilt, property?.assessment.total, property?.sale.amount, avm].filter((value) => value != null).length / 5 * 100;
  const sparseBoost = bounded((75 - publicCompetency) / 100, 0, .05);
  const vendorWeight = Math.min(.15, .05 + sparseBoost + providerConfidence / 100 * .05 + factCompleteness / 100 * .02);
  const blendedValue = sample.model.value * (1 - vendorWeight) + avm * vendorWeight;
  const coverageGain = Math.round(Math.min(8, factCompleteness / 25 + providerConfidence / 40));
  const disagreementPenalty = Math.round(Math.max(0, Math.abs(deltaPct) - 15) / 4);
  const integratedConfidence = bounded(sample.model.confidence + coverageGain - disagreementPenalty, 35, 95);
  const reliability = .60 + integratedConfidence / 100 * .40;
  const reliabilityAdjustedWatchScore = Math.round(50 + (sample.model.watchScore - 50) * reliability);
  return {
    vendorWeightPct: Math.round(vendorWeight * 1000) / 10,
    publicWeightPct: Math.round((1 - vendorWeight) * 1000) / 10,
    attomAvm: avm,
    blendedValue: Math.round(blendedValue / 1000) * 1000,
    deltaPct: Math.round(deltaPct * 10) / 10,
    agreementScore: Math.round(agreementScore),
    factCompleteness: Math.round(factCompleteness),
    coverageGain,
    disagreementPenalty,
    integratedConfidence: Math.round(integratedConfidence),
    reliabilityAdjustedWatchScore,
    interpretation: Math.abs(deltaPct) <= 15 ? "ATTOM independently supports the public-record range." : "ATTOM disagreement widens diligence; it does not create investment edge.",
  };
}

function attomSampleProperties(marketIds: string[], perMarket = ATTOM_MARKET_SAMPLE_SIZE) {
  return marketIds.flatMap((marketId) => {
    const records = propertyValuations.properties.filter((property) => property.marketId === marketId).sort((a, b) => a.model.confidence - b.model.confidence || b.model.watchScore - a.model.watchScore);
    if (records.length <= perMarket) return records;
    const selected = [records[0]];
    while (selected.length < perMarket) selected.push(records[Math.floor((records.length - 1) * selected.length / Math.max(1, perMarket - 1))]);
    return [...new Map(selected.map((record) => [record.id, record])).values()];
  });
}

type AttomAuditRecord = {
  id: string;
  marketId: string;
  address: string;
  status: "matched" | "failed";
  error: string | null;
  cacheHit: boolean;
  providerCalls: number;
  attemptedRequests: number;
  fetchedAt: string;
  borocastValue: number;
  borocastRange: { low: number; high: number };
  attomValue: number | null;
  attomRange: { low: number | null; high: number | null };
  attomConfidence: number | null;
  attomPerSqft: number | null;
  attomMonthlyChangePct: number | null;
  taxAmount: number | null;
  latestSaleAmount: number | null;
  latestSaleDate: string | null;
  deltaPct: number | null;
  rangeOverlap: boolean;
  secondarySignal: ReturnType<typeof attomSecondarySignal>;
};

async function runAttomEnrichment(env: Env, marketIds: string[], perMarket = ATTOM_MARKET_SAMPLE_SIZE, force = false) {
  const samples = attomSampleProperties(marketIds, perMarket);
  const records: AttomAuditRecord[] = [];
  for (const sample of samples) {
    const lookup = await cachedAttomProperty(env, { propertyId: sample.id, marketId: sample.marketId, address1: sample.address, address2: sample.locality }, force);
    const signal = lookup.status === "matched" ? attomSecondarySignal(sample, lookup.property) : null;
    records.push({
      id: sample.id, marketId: sample.marketId, address: sample.address, status: lookup.status,
      error: lookup.error, cacheHit: lookup.cacheHit, providerCalls: lookup.providerCalls, attemptedRequests: lookup.attemptedRequests, fetchedAt: lookup.fetchedAt,
      borocastValue: sample.model.value, borocastRange: { low: sample.model.low, high: sample.model.high },
      attomValue: lookup.property?.avm.value ?? null, attomRange: { low: lookup.property?.avm.low ?? null, high: lookup.property?.avm.high ?? null },
      attomConfidence: lookup.property?.avm.confidence ?? null,
      attomPerSqft: lookup.property?.avm.perSqft ?? null,
      attomMonthlyChangePct: lookup.property?.avm.monthlyChangePct ?? null,
      taxAmount: lookup.property?.assessment.taxAmount ?? null,
      latestSaleAmount: lookup.property?.sale.amount ?? null,
      latestSaleDate: lookup.property?.sale.date ?? null,
      deltaPct: signal?.deltaPct ?? null,
      rangeOverlap: Boolean(lookup.property?.avm.low != null && lookup.property?.avm.high != null && lookup.property.avm.low <= sample.model.high && lookup.property.avm.high >= sample.model.low),
      secondarySignal: signal,
    });
  }
  const matched = records.filter((record) => record.status === "matched");
  const marketSummaries = marketIds.map((marketId) => {
    const marketRecords = records.filter((record) => record.marketId === marketId);
    const marketMatched = marketRecords.filter((record) => record.status === "matched");
    const publicMarket = propertyValuations.markets.find((market) => market.id === marketId);
    const publicCompetency = publicMarket && "competency" in publicMarket ? publicMarket.competency : 50;
    const coverage = marketRecords.length ? marketMatched.length / marketRecords.length * 100 : 0;
    const meanGain = marketMatched.length ? marketMatched.reduce((sum, record) => sum + (record.secondarySignal?.coverageGain ?? 0) - (record.secondarySignal?.disagreementPenalty ?? 0), 0) / marketMatched.length : 0;
    return { marketId, sampleSize: marketRecords.length, matched: marketMatched.length, coveragePct: Math.round(coverage), publicCompetency, integratedCompetency: Math.round(bounded(publicCompetency + meanGain * coverage / 100, 0, 95)), medianDeltaPct: marketMatched.length ? Math.round(medianNumber(marketMatched.map((record) => record.deltaPct ?? 0)) * 10) / 10 : null, rangeOverlapPct: marketMatched.length ? Math.round(marketMatched.filter((record) => record.rangeOverlap).length / marketMatched.length * 100) : 0 };
  });
  return {
    provider: "ATTOM", retrievedAt: new Date().toISOString(), requested: records.length, matched: matched.length,
    failed: records.length - matched.length, providerCalls: records.reduce((sum, record) => sum + record.providerCalls, 0),
    attemptedRequests: records.reduce((sum, record) => sum + record.attemptedRequests, 0),
    cacheHits: records.filter((record) => record.cacheHit).length, cacheTtlDays: ATTOM_SUCCESS_TTL_DAYS,
    records, markets: marketSummaries,
    methodology: "One ATTOM AVM Detail request supplies normalized facts, assessment/tax, recorded sale, AVM range, price per square foot, monthly change and freshness for each control property. Successful matches are reused for 30 days; failures are retried after seven days. ATTOM receives at most a 15% secondary weight and only changes evidence reliability—not neighborhood attractiveness.",
    boundary: "Vendor agreement can increase evidence competency; disagreement reduces confidence. ATTOM never overrides public-record anchors or turns model agreement into investment edge.",
  };
}

type SafetyBucket = { total: number; violent: number; property: number; other: number };

function emptySafetyBucket(): SafetyBucket {
  return { total: 0, violent: 0, property: 0, other: 0 };
}

function addSafetyCount(bucket: SafetyBucket, category: "violent" | "property" | "other", count: number) {
  bucket.total += count;
  bucket[category] += count;
}

function dayStamp(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function chicagoCategory(type: string): "violent" | "property" | "other" {
  if (["HOMICIDE", "CRIMINAL SEXUAL ASSAULT", "ROBBERY", "ASSAULT", "BATTERY"].includes(type)) return "violent";
  if (["BURGLARY", "THEFT", "MOTOR VEHICLE THEFT", "ARSON", "CRIMINAL DAMAGE", "DECEPTIVE PRACTICE"].includes(type)) return "property";
  return "other";
}

async function chicagoSafety(lat: number, lng: number, from: string, to: string) {
  const endpoint = new URL("https://data.cityofchicago.org/resource/ijzp-q8t2.json");
  endpoint.searchParams.set("$select", "primary_type,count(*) as count");
  endpoint.searchParams.set("$group", "primary_type");
  endpoint.searchParams.set("$where", `date >= '${from}T00:00:00' AND date < '${to}T00:00:00' AND within_circle(location,${lat},${lng},804.672)`);
  endpoint.searchParams.set("$limit", "100");
  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Chicago public-safety feed unavailable");
  const rows = await response.json() as Array<{ primary_type: string; count: string }>;
  const bucket = emptySafetyBucket();
  for (const row of rows) addSafetyCount(bucket, chicagoCategory(row.primary_type), Number(row.count));
  return bucket;
}

async function philadelphiaSafety(lat: number, lng: number, from: string, to: string) {
  const query = `select ucr_general,count(*)::int as count from incidents_part1_part2 where dispatch_date >= '${from}' and dispatch_date < '${to}' and ST_DWithin(the_geom::geography,ST_SetSRID(ST_Point(${lng},${lat}),4326)::geography,804.672) group by ucr_general`;
  const endpoint = new URL("https://phl.carto.com/api/v2/sql");
  endpoint.searchParams.set("q", query);
  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Philadelphia public-safety feed unavailable");
  const payload = await response.json() as { rows: Array<{ ucr_general: string | null; count: number }> };
  const bucket = emptySafetyBucket();
  for (const row of payload.rows) {
    const prefix = Number(String(row.ucr_general ?? "").slice(0, 1));
    addSafetyCount(bucket, prefix >= 1 && prefix <= 4 ? "violent" : prefix >= 5 && prefix <= 7 ? "property" : "other", Number(row.count));
  }
  return bucket;
}

async function raleighSafety(lat: number, lng: number, from: string, to: string) {
  const endpoint = new URL("https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Police_Incidents/FeatureServer/0/query");
  endpoint.searchParams.set("f", "json");
  endpoint.searchParams.set("geometry", `${lng},${lat}`);
  endpoint.searchParams.set("geometryType", "esriGeometryPoint");
  endpoint.searchParams.set("inSR", "4326");
  endpoint.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  endpoint.searchParams.set("distance", "804.672");
  endpoint.searchParams.set("units", "esriSRUnit_Meter");
  endpoint.searchParams.set("where", `reported_date >= DATE '${from}' AND reported_date < DATE '${to}'`);
  endpoint.searchParams.set("outStatistics", JSON.stringify([{ statisticType: "count", onStatisticField: "case_number", outStatisticFieldName: "count" }]));
  endpoint.searchParams.set("groupByFieldsForStatistics", "crime_type");
  endpoint.searchParams.set("returnGeometry", "false");
  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Raleigh public-safety feed unavailable");
  const payload = await response.json() as { features?: Array<{ attributes: { crime_type?: string; count?: number } }>; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || "Raleigh public-safety query failed");
  const bucket = emptySafetyBucket();
  for (const feature of payload.features ?? []) {
    const type = feature.attributes.crime_type;
    const category = type === "CRIMES AGAINST PERSONS" ? "violent" : type === "CRIMES AGAINST PROPERTY" ? "property" : "other";
    addSafetyCount(bucket, category, Number(feature.attributes.count ?? 0));
  }
  return bucket;
}

async function carySafety(lat: number, lng: number, from: string, to: string) {
  const endpoint = new URL("https://services2.arcgis.com/l4TwMwwoiuEVRPw9/ArcGIS/rest/services/PoliceIncidents/FeatureServer/0/query");
  endpoint.searchParams.set("f", "json");
  endpoint.searchParams.set("geometry", `${lng},${lat}`);
  endpoint.searchParams.set("geometryType", "esriGeometryPoint");
  endpoint.searchParams.set("inSR", "4326");
  endpoint.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  endpoint.searchParams.set("distance", "804.672");
  endpoint.searchParams.set("units", "esriSRUnit_Meter");
  endpoint.searchParams.set("where", `Date_From >= DATE '${from}' AND Date_From < DATE '${to}'`);
  endpoint.searchParams.set("outStatistics", JSON.stringify([{ statisticType: "count", onStatisticField: "Incident_Number", outStatisticFieldName: "count" }]));
  endpoint.searchParams.set("groupByFieldsForStatistics", "ViolentProperty");
  endpoint.searchParams.set("returnGeometry", "false");
  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Cary public-safety feed unavailable");
  const payload = await response.json() as { features?: Array<{ attributes: { ViolentProperty?: string; count?: number } }>; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || "Cary public-safety query failed");
  const bucket = emptySafetyBucket();
  for (const feature of payload.features ?? []) {
    const type = feature.attributes.ViolentProperty?.toLowerCase();
    addSafetyCount(bucket, type === "violent" ? "violent" : type === "property" ? "property" : "other", Number(feature.attributes.count ?? 0));
  }
  return bucket;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

type CloudflareImageFormat = "image/avif" | "image/webp" | "image/jpeg" | "image/png" | "image/gif" | "rgb" | "rgba";

function cloudflareImageFormat(format: string): CloudflareImageFormat {
  return ["image/avif", "image/webp", "image/jpeg", "image/png", "image/gif", "rgb", "rgba"].includes(format)
    ? format as CloudflareImageFormat
    : "image/webp";
}

const REVIEW_COOKIE = "borocast_review";
const FEEDBACK_ADMIN_COOKIE = "borocast_feedback_admin";

const FEEDBACK_BUCKETS = [
  { id: "data_trust", label: "Data trust", lane: "model_review" },
  { id: "data_coverage", label: "Missing data", lane: "data_pipeline" },
  { id: "model_scoring", label: "Score / model", lane: "model_review" },
  { id: "ux_navigation", label: "Navigation", lane: "product_ux" },
  { id: "map_visualization", label: "Map / charts", lane: "product_ux" },
  { id: "property_workflow", label: "Property workflow", lane: "product_ux" },
  { id: "performance_error", label: "Bug / performance", lane: "engineering" },
  { id: "value_proposition", label: "Unclear value", lane: "product_strategy" },
] as const;
const FEEDBACK_BUCKET_IDS = new Set<string>(FEEDBACK_BUCKETS.map((item) => item.id));
const FEEDBACK_STATUSES = new Set(["new", "reviewing", "actioned", "closed"]);
const FEEDBACK_LANES = new Set(["untriaged", "model_review", "data_pipeline", "product_ux", "engineering", "product_strategy"]);

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function reviewCookieValue(request: Request) {
  return cookieValue(request, REVIEW_COOKIE);
}

async function authToken(scope: string, password: string) {
  const bytes = new TextEncoder().encode(`borocast-${scope}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function reviewToken(password: string) { return authToken("private-review-v1", password); }
function feedbackAdminToken(password: string) { return authToken("feedback-admin-v1", password); }

async function ownerWorkspaceAuthorized(request: Request, env: Env) {
  if (!env.FEEDBACK_ADMIN_PASSWORD) return false;
  const expected = await feedbackAdminToken(env.FEEDBACK_ADMIN_PASSWORD);
  return safeEqual(cookieValue(request, FEEDBACK_ADMIN_COOKIE), expected);
}

function reviewerSurface(pathname: string) {
  return pathname === "/showcase" || pathname.startsWith("/showcase/")
    || pathname === "/api/review/feedback" || pathname === "/api/review/logout"
    || pathname.startsWith("/_next/") || pathname === "/favicon.svg";
}

function gatedResponseHeaders(extra: Record<string, string> = {}) {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...extra,
  };
}

function safeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return mismatch === 0;
}

function reviewLoginHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private review · BORO</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071a38;color:#fff;font-family:Arial,sans-serif}main{width:min(92vw,470px);padding:48px;border:1px solid #304762;background:#0b2244;box-shadow:0 30px 90px #020b1b}i{display:block;width:12px;height:12px;margin-bottom:35px;border-radius:50%;background:#d9ff55;box-shadow:0 0 0 8px rgba(217,255,85,.08)}span{color:#70dfcc;font-size:10px;font-weight:900;letter-spacing:.13em}h1{margin:15px 0 16px;font-size:42px;line-height:.95;letter-spacing:-.055em}p{margin:0 0 28px;color:#a7b6c9;font-size:13px;line-height:1.65}label{display:block;color:#8fa0b6;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}input{width:100%;height:50px;margin:9px 0 12px;padding:0 14px;border:1px solid #405674;background:#071a38;color:white;font:inherit;outline:0}input:focus{border-color:#d9ff55}button{width:100%;height:50px;border:0;background:#d9ff55;color:#071a38;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}button:disabled{opacity:.6}b{display:block;min-height:16px;margin-top:14px;color:#ff958d;font-size:10px}@media(max-width:520px){main{padding:35px 26px}h1{font-size:36px}}
  </style></head><body><main><i></i><span>BORO · INVITED REVIEW</span><h1>Private B-school<br>MVP preview</h1><p>Enter the shared review password to see a curated snapshot of BORO’s capabilities and leave structured feedback. Live data connectors and experimental workspaces remain owner-gated.</p><form><label for="password">Review password</label><input id="password" name="password" type="password" autocomplete="current-password" autofocus required><button>Enter private preview →</button><b role="alert"></b></form></main><script>
  const form=document.querySelector('form'),button=document.querySelector('button'),error=document.querySelector('b');form.addEventListener('submit',async(event)=>{event.preventDefault();button.disabled=true;error.textContent='';try{const response=await fetch('/api/review/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:form.password.value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not sign in.');location.reload()}catch(reason){error.textContent=reason.message||'Could not sign in.';button.disabled=false}});
  </script></body></html>`;
}

function limitedText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function rating(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

function feedbackModes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => limitedText(item, 40)).filter((item) => FEEDBACK_BUCKET_IDS.has(item)))].slice(0, FEEDBACK_BUCKETS.length);
}

function suggestedImpactLane(modes: string[]) {
  for (const lane of ["model_review", "data_pipeline", "engineering", "product_ux", "product_strategy"]) {
    if (modes.some((mode) => FEEDBACK_BUCKETS.find((bucket) => bucket.id === mode)?.lane === lane)) return lane;
  }
  return "untriaged";
}

function parseStoredModes(value: unknown) {
  try { return feedbackModes(JSON.parse(typeof value === "string" ? value : "[]")); } catch { return []; }
}

function feedbackAdminEmailAuthorized(request: Request, env: Env) {
  const expected = env.FEEDBACK_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const supplied = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
  return Boolean(expected && supplied && safeEqual(supplied, expected));
}

type ProfileIdentity = {
  userId: string;
  email: string;
  displayName: string;
  provider: "google" | "chatgpt";
};

type GoogleIdClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
};

const PROFILE_SESSION_COOKIE = "boro_profile_session";
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const textEncoder = new TextEncoder();

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlEncode(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}

async function profileSessionToken(claims: GoogleIdClaims, env: Env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(textEncoder.encode(JSON.stringify({ sub: claims.sub, email: claims.email, name: claims.name || claims.email, provider: "google", iat: now, exp: now + 60 * 60 * 24 * 30 })));
  return `${payload}.${base64UrlEncode(await hmac(payload, env.AUTH_SESSION_SECRET))}`;
}

async function googleSessionIdentity(request: Request, env: Env): Promise<ProfileIdentity | null> {
  if (!env.AUTH_SESSION_SECRET) return null;
  const token = cookieValue(request, PROFILE_SESSION_COOKIE);
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = base64UrlEncode(await hmac(payload, env.AUTH_SESSION_SECRET));
  if (!safeEqual(signature, expected)) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as { sub?: string; email?: string; name?: string; provider?: string; exp?: number };
    if (!session.sub || !session.email || session.provider !== "google" || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return { userId: `google:${session.sub}`.slice(0, 240), email: session.email.slice(0, 320), displayName: (session.name || session.email).slice(0, 240), provider: "google" };
  } catch { return null; }
}

async function verifyGoogleCredential(credential: string, env: Env): Promise<GoogleIdClaims | null> {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) return null;
  const [encodedHeader, encodedPayload, encodedSignature, extra] = credential.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) return null;
  let header: { alg?: string; kid?: string }; let claims: GoogleIdClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader))) as typeof header;
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as GoogleIdClaims;
  } catch { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || !header.kid || claims.aud !== env.GOOGLE_OAUTH_CLIENT_ID || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) || claims.exp <= now || claims.iat > now + 300 || !claims.sub || !claims.email || claims.email_verified !== true) return null;
  const certsResponse = await fetch(GOOGLE_CERTS_URL, { headers: { Accept: "application/json" }, cf: { cacheTtl: 21600, cacheEverything: true } });
  if (!certsResponse.ok) return null;
  const jwks = await certsResponse.json() as { keys?: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }> };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.alg === "RS256" && key.use === "sig");
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlDecode(encodedSignature), textEncoder.encode(`${encodedHeader}.${encodedPayload}`));
  return verified ? claims : null;
}

type FavoriteRow = {
  id: string;
  target_type: string;
  target_id: string;
  target_name: string;
  market_id: string | null;
  snapshot_json: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const FAVORITE_TARGET_TYPES = new Set(["area", "property"]);
const FAVORITE_SNAPSHOT_KEYS = new Set([
  "label", "score", "competency", "confidence", "marketLabel", "recommendation",
  "price", "pricePerSqft", "observedAt", "sample", "sourceVersion",
]);

function chatGPTProfileIdentity(request: Request): ProfileIdentity | null {
  const userId = request.headers.get("oai-authenticated-user-id")?.trim() ?? "";
  const email = request.headers.get("oai-authenticated-user-email")?.trim() ?? "";
  if (!userId || !email) return null;

  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  let fullName = "";
  if (encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { fullName = decodeURIComponent(encodedName).trim(); } catch { fullName = ""; }
  }
  return {
    userId: userId.slice(0, 240),
    email: email.slice(0, 320),
    displayName: (fullName || email).slice(0, 240),
    provider: "chatgpt",
  };
}

async function profileIdentity(request: Request, env: Env): Promise<ProfileIdentity | null> {
  return chatGPTProfileIdentity(request) ?? await googleSessionIdentity(request, env);
}

function profileWriteAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

function favoriteSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!FAVORITE_SNAPSHOT_KEYS.has(key)) continue;
    if (typeof item === "string") clean[key] = item.trim().slice(0, 500);
    else if (typeof item === "number" && Number.isFinite(item)) clean[key] = item;
    else if (typeof item === "boolean") clean[key] = item;
  }
  return clean;
}

function parseFavoriteSnapshot(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return favoriteSnapshot(parsed);
  } catch {
    return {};
  }
}

function favoriteFromRow(row: FavoriteRow) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    marketId: row.market_id,
    snapshot: parseFavoriteSnapshot(row.snapshot_json),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureUserProfile(db: D1Database, identity: ProfileIdentity) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO user_profiles (user_id, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`)
    .bind(identity.userId, identity.email, identity.displayName, now, now).run();
}

async function profileApi(request: Request, env: Env, url: URL) {
  const identity = await profileIdentity(request, env);
  if (!identity) return Response.json({ error: "Google or ChatGPT sign-in required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if (!env.DB) return Response.json({ error: "Profile storage is not configured." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  if (!["GET", "HEAD"].includes(request.method) && !profileWriteAllowed(request)) {
    return Response.json({ error: "Cross-origin profile writes are not allowed." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }

  await ensureUserProfile(env.DB, identity);
  const responseHeaders = { "Cache-Control": "private, no-store", "Vary": "oai-authenticated-user-id" };

  if (url.pathname === "/api/profile" && request.method === "GET") {
    const profile = await env.DB.prepare("SELECT display_name, email, created_at FROM user_profiles WHERE user_id = ?")
      .bind(identity.userId).first<{ display_name: string; email: string; created_at: string }>();
    const result = await env.DB.prepare(`SELECT id, target_type, target_id, target_name, market_id, snapshot_json, notes, created_at, updated_at
      FROM user_favorites WHERE user_id = ? ORDER BY updated_at DESC LIMIT 250`)
      .bind(identity.userId).all<FavoriteRow>();
    const favorites = (result.results ?? []).map(favoriteFromRow);
    return Response.json({
      profile: {
        displayName: profile?.display_name ?? identity.displayName,
        email: profile?.email ?? identity.email,
        createdAt: profile?.created_at ?? new Date().toISOString(),
      },
      favorites,
      counts: {
        all: favorites.length,
        areas: favorites.filter((favorite) => favorite.targetType === "area").length,
        properties: favorites.filter((favorite) => favorite.targetType === "property").length,
      },
      auth: { provider: identity.provider },
    }, { headers: responseHeaders });
  }

  if (url.pathname === "/api/profile/favorites" && request.method === "POST") {
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid favorite payload." }, { status: 400, headers: responseHeaders }); }
    const targetType = limitedText(body.targetType, 20);
    const targetId = limitedText(body.targetId, 180);
    const targetName = limitedText(body.targetName, 240);
    const marketId = limitedText(body.marketId, 80) || null;
    const notes = limitedText(body.notes, 2000) || null;
    if (!FAVORITE_TARGET_TYPES.has(targetType)) return Response.json({ error: "Favorite type must be area or property." }, { status: 400, headers: responseHeaders });
    if (!targetId || !targetName) return Response.json({ error: "A typed target ID and display name are required." }, { status: 400, headers: responseHeaders });
    const snapshotJson = JSON.stringify(favoriteSnapshot(body.snapshot));
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO user_favorites
      (id, user_id, target_type, target_id, target_name, market_id, snapshot_json, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET
        target_name = excluded.target_name, market_id = excluded.market_id, snapshot_json = excluded.snapshot_json,
        notes = COALESCE(excluded.notes, user_favorites.notes), updated_at = excluded.updated_at`)
      .bind(id, identity.userId, targetType, targetId, targetName, marketId, snapshotJson, notes, now, now).run();
    const saved = await env.DB.prepare(`SELECT id, target_type, target_id, target_name, market_id, snapshot_json, notes, created_at, updated_at
      FROM user_favorites WHERE user_id = ? AND target_type = ? AND target_id = ?`)
      .bind(identity.userId, targetType, targetId).first<FavoriteRow>();
    return Response.json({ favorite: saved ? favoriteFromRow(saved) : null }, { status: 201, headers: responseHeaders });
  }

  const favoritePrefix = "/api/profile/favorites/";
  if (url.pathname.startsWith(favoritePrefix)) {
    const favoriteId = decodeURIComponent(url.pathname.slice(favoritePrefix.length));
    if (!/^[0-9a-f-]{36}$/i.test(favoriteId)) return Response.json({ error: "Unknown favorite." }, { status: 404, headers: responseHeaders });

    if (request.method === "PATCH") {
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid favorite update." }, { status: 400, headers: responseHeaders }); }
      if (body.notes === undefined) return Response.json({ error: "No supported change supplied." }, { status: 400, headers: responseHeaders });
      const notes = limitedText(body.notes, 2000) || null;
      const result = await env.DB.prepare("UPDATE user_favorites SET notes = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .bind(notes, new Date().toISOString(), favoriteId, identity.userId).run();
      if (!result.meta.changes) return Response.json({ error: "Favorite not found." }, { status: 404, headers: responseHeaders });
      return Response.json({ ok: true }, { headers: responseHeaders });
    }

    if (request.method === "DELETE") {
      const result = await env.DB.prepare("DELETE FROM user_favorites WHERE id = ? AND user_id = ?")
        .bind(favoriteId, identity.userId).run();
      if (!result.meta.changes) return Response.json({ error: "Favorite not found." }, { status: 404, headers: responseHeaders });
      return Response.json({ ok: true }, { headers: responseHeaders });
    }
  }

  return Response.json({ error: "Unknown profile operation." }, { status: 405, headers: responseHeaders });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/review/login") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      if (!env.REVIEW_PASSWORD) return Response.json({ error: "Private review access is not configured." }, { status: 503 });
      let body: { password?: unknown } = {};
      try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Enter the shared review password." }, { status: 400 }); }
      const supplied = limitedText(body.password, 256);
      if (!safeEqual(supplied, env.REVIEW_PASSWORD)) return Response.json({ error: "That password does not match. Check the shared invite and try again." }, { status: 401, headers: { "Cache-Control": "no-store" } });
      const token = await reviewToken(env.REVIEW_PASSWORD);
      return Response.json({ ok: true, access: "reviewer", returnTo: "/showcase" }, { headers: gatedResponseHeaders({ "Set-Cookie": `${REVIEW_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax` }) });
    }

    if (url.pathname === "/api/review/logout") {
      const headers = new Headers(gatedResponseHeaders());
      headers.append("Set-Cookie", `${REVIEW_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
      headers.append("Set-Cookie", `${FEEDBACK_ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
      if (request.method === "POST" && (request.headers.get("Accept") ?? "").includes("text/html")) return Response.redirect(new URL("/", request.url), 303);
      return Response.json({ ok: true }, { headers });
    }

    if (url.pathname === "/api/review/admin/login") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      if (!env.FEEDBACK_ADMIN_PASSWORD || !env.FEEDBACK_ADMIN_EMAIL) return Response.json({ error: "Owner repository access is not configured." }, { status: 503 });
      if (!feedbackAdminEmailAuthorized(request, env)) return Response.json({ error: "Sign in with the approved ChatGPT owner account first." }, { status: 403, headers: { "Cache-Control": "no-store" } });
      let body: { password?: unknown } = {};
      try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Enter the owner password." }, { status: 400 }); }
      if (!safeEqual(limitedText(body.password, 256), env.FEEDBACK_ADMIN_PASSWORD)) return Response.json({ error: "That owner password does not match." }, { status: 401, headers: { "Cache-Control": "no-store" } });
      const token = await feedbackAdminToken(env.FEEDBACK_ADMIN_PASSWORD);
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `${FEEDBACK_ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax` } });
    }

    if (url.pathname === "/api/auth/config") {
      if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
      return Response.json({ configured: Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.AUTH_SESSION_SECRET), googleClientId: env.GOOGLE_OAUTH_CLIENT_ID || null }, { headers: { "Cache-Control": "public, max-age=300" } });
    }

    if (url.pathname === "/api/auth/google") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      if (!profileWriteAllowed(request)) return Response.json({ error: "Cross-origin sign-in is not allowed." }, { status: 403 });
      if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.AUTH_SESSION_SECRET) return Response.json({ error: "Google sign-in is not configured." }, { status: 503 });
      let body: { credential?: unknown } = {};
      try { body = await request.json() as typeof body; } catch { return Response.json({ error: "A Google credential is required." }, { status: 400 }); }
      const credential = limitedText(body.credential, 10000);
      const claims = credential ? await verifyGoogleCredential(credential, env) : null;
      if (!claims) return Response.json({ error: "Google could not verify this account." }, { status: 401, headers: { "Cache-Control": "no-store" } });
      const token = await profileSessionToken(claims, env);
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `${PROFILE_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` } });
    }

    if (url.pathname === "/api/auth/logout") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      if (!profileWriteAllowed(request)) return Response.json({ error: "Cross-origin sign-out is not allowed." }, { status: 403 });
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `${PROFILE_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
    }

    const isFeedbackRepository = url.pathname === "/review-repository" || url.pathname.startsWith("/review-repository/") || url.pathname === "/api/review/admin/login" || url.pathname === "/api/review/repository" || url.pathname.startsWith("/api/review/repository/");
    const isPlatformAuthPath = url.pathname === "/signin-with-chatgpt" || url.pathname === "/signout-with-chatgpt" || url.pathname === "/callback" || url.pathname.startsWith("/api/auth/");
    if (env.REVIEW_PASSWORD && !isFeedbackRepository && !isPlatformAuthPath && !url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/favicon") && url.pathname !== "/robots.txt") {
      const expected = await reviewToken(env.REVIEW_PASSWORD);
      const authenticated = safeEqual(reviewCookieValue(request), expected);
      if (!authenticated) {
        if (url.pathname.startsWith("/api/")) return Response.json({ error: "Private review authentication required." }, { status: 401, headers: gatedResponseHeaders() });
        return new Response(reviewLoginHtml(), { status: 200, headers: gatedResponseHeaders({ "Content-Type": "text/html; charset=utf-8" }) });
      }

      const ownerAuthorized = await ownerWorkspaceAuthorized(request, env);
      if (!ownerAuthorized && !reviewerSurface(url.pathname)) {
        if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/data/")) {
          return Response.json({ error: "Owner workspace authorization required.", access: "reviewer", available: "/showcase" }, { status: 403, headers: gatedResponseHeaders() });
        }
        return Response.redirect(new URL("/showcase", request.url), 302);
      }
    }

    if (url.pathname === "/api/profile" || url.pathname === "/api/profile/favorites" || url.pathname.startsWith("/api/profile/favorites/")) {
      try {
        return await profileApi(request, env, url);
      } catch (error) {
        console.error(JSON.stringify({ event: "profile_api_error", path: url.pathname, message: error instanceof Error ? error.message : String(error) }));
        return Response.json({ error: "Profile storage is temporarily unavailable." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
      }
    }

    if (url.pathname === "/api/review/repository" || url.pathname.startsWith("/api/review/repository/")) {
      if (!env.FEEDBACK_ADMIN_PASSWORD || !env.FEEDBACK_ADMIN_EMAIL) return Response.json({ error: "Owner repository access is not configured." }, { status: 503 });
      if (!feedbackAdminEmailAuthorized(request, env)) return Response.json({ error: "Approved ChatGPT owner authentication required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
      const expectedAdmin = await feedbackAdminToken(env.FEEDBACK_ADMIN_PASSWORD);
      if (!safeEqual(cookieValue(request, FEEDBACK_ADMIN_COOKIE), expectedAdmin)) return Response.json({ error: "Owner repository authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
      if (!env.DB) return Response.json({ error: "Feedback storage is not configured." }, { status: 503 });

      if (url.pathname === "/api/review/repository" && request.method === "GET") {
        const result = await env.DB.prepare(`SELECT id, created_at, reviewer_name, reviewer_email, usefulness, trust, clarity,
          most_valuable, confusing, next_feature, notes, feature_area, failure_modes, reviewer_intent, triage_status, impact_lane
          FROM review_feedback ORDER BY created_at DESC LIMIT 500`).all() as { results?: Array<Record<string, unknown>> };
        const entries = (result.results ?? []).map((row) => ({
          id: Number(row.id), createdAt: String(row.created_at), reviewerName: row.reviewer_name ? String(row.reviewer_name) : null,
          reviewerEmail: row.reviewer_email ? String(row.reviewer_email) : null, usefulness: Number(row.usefulness), trust: Number(row.trust), clarity: Number(row.clarity),
          mostValuable: String(row.most_valuable), confusing: String(row.confusing), nextFeature: String(row.next_feature), notes: row.notes ? String(row.notes) : null,
          featureArea: String(row.feature_area || "overall"), failureModes: parseStoredModes(row.failure_modes), reviewerIntent: String(row.reviewer_intent || "maybe"),
          triageStatus: String(row.triage_status || "new"), impactLane: String(row.impact_lane || "untriaged"),
        }));
        const average = (key: "usefulness" | "trust" | "clarity") => entries.length ? entries.reduce((sum, entry) => sum + entry[key], 0) / entries.length : 0;
        const buckets = FEEDBACK_BUCKETS.map((bucket) => ({ ...bucket, count: entries.filter((entry) => entry.failureModes.includes(bucket.id)).length }));
        return Response.json({
          entries,
          summary: { total: entries.length, averageUsefulness: average("usefulness"), averageTrust: average("trust"), averageClarity: average("clarity"), modelReviewCount: entries.filter((entry) => entry.impactLane === "model_review" || entry.trust <= 2).length, wouldUseCount: entries.filter((entry) => entry.reviewerIntent === "yes").length },
          buckets,
        }, { headers: { "Cache-Control": "private, no-store" } });
      }

      const entryId = Number(url.pathname.slice("/api/review/repository/".length));
      if (request.method !== "PATCH" || !Number.isInteger(entryId) || entryId < 1) return Response.json({ error: "Unknown repository operation." }, { status: 405 });
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid triage update." }, { status: 400 }); }
      const triageStatus = body.triageStatus === undefined ? null : limitedText(body.triageStatus, 30);
      const impactLane = body.impactLane === undefined ? null : limitedText(body.impactLane, 40);
      if (triageStatus !== null && !FEEDBACK_STATUSES.has(triageStatus)) return Response.json({ error: "Unknown triage status." }, { status: 400 });
      if (impactLane !== null && !FEEDBACK_LANES.has(impactLane)) return Response.json({ error: "Unknown impact lane." }, { status: 400 });
      if (triageStatus === null && impactLane === null) return Response.json({ error: "No triage change supplied." }, { status: 400 });
      if (triageStatus !== null) await env.DB.prepare("UPDATE review_feedback SET triage_status = ? WHERE id = ?").bind(triageStatus, entryId).run();
      if (impactLane !== null) await env.DB.prepare("UPDATE review_feedback SET impact_lane = ? WHERE id = ?").bind(impactLane, entryId).run();
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/api/review/feedback") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      if (!env.DB) return Response.json({ error: "Feedback storage is not configured." }, { status: 503 });
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid feedback payload." }, { status: 400 }); }
      const usefulness = rating(body.usefulness);
      const trust = rating(body.trust);
      const clarity = rating(body.clarity);
      const mostValuable = limitedText(body.mostValuable, 1500);
      const confusing = limitedText(body.confusing, 1500);
      const nextFeature = limitedText(body.nextFeature, 1500);
      const featureArea = limitedText(body.featureArea, 60) || "overall";
      const failureModes = feedbackModes(body.failureModes);
      const reviewerIntent = ["yes", "maybe", "no"].includes(limitedText(body.reviewerIntent, 10)) ? limitedText(body.reviewerIntent, 10) : "maybe";
      const impactLane = suggestedImpactLane(failureModes);
      if (usefulness === null || trust === null || clarity === null) return Response.json({ error: "All three ratings must be between 1 and 5." }, { status: 400 });
      if (!mostValuable || !confusing || !nextFeature) return Response.json({ error: "Please answer the three product questions." }, { status: 400 });
      await env.DB.prepare(`INSERT INTO review_feedback
        (created_at, reviewer_name, reviewer_email, usefulness, trust, clarity, most_valuable, confusing, next_feature, notes, source_path, feature_area, failure_modes, reviewer_intent, triage_status, impact_lane)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          new Date().toISOString(),
          limitedText(body.reviewerName, 120) || null,
          limitedText(body.reviewerEmail, 160) || null,
          usefulness,
          trust,
          clarity,
          mostValuable,
          confusing,
          nextFeature,
          limitedText(body.notes, 2500) || null,
          limitedText(body.sourcePath, 240) || null,
          featureArea,
          JSON.stringify(failureModes),
          reviewerIntent,
          "new",
          impactLane,
        ).run();
      return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    const snapshotHeaders = {
      "Cache-Control": "public, max-age=300, s-maxage=900",
      "Access-Control-Allow-Origin": "*",
    };

    if (url.pathname === "/api/property-data/health") {
      return Response.json({
        status: "operational",
        verifiedAt: sourceRegistry.verifiedAt,
        sourceCount: sourceRegistry.sources.length,
        connectedMarketCount: marketCompetency.markets.length,
        representedRecords: sourceRegistry.sources.reduce((total, source) => total + source.recordCount, 0),
        adapters: [...new Set(sourceRegistry.sources.map((source) => source.adapter))],
        acs: {
          release: acsAggregations.release,
          marketCount: acsAggregations.marketCount,
          clusterCount: acsAggregations.clusterCount,
          tractCount: acsAggregations.markets.reduce((total, market) => total + market.tractCount, 0),
        },
        pricing: {
          source: "FHFA All-Transactions HPI",
          latestPeriod: pricingHistory.latestPeriod,
          marketCount: pricingHistory.marketCount,
          localSource: "FHFA Annual Census Tract HPI",
          latestLocalYear: clusterPricingHistory.latestYear,
          localClusterCount: clusterPricingHistory.clusterCount,
          matchedTractCount: clusterPricingHistory.matchedTractCount,
        },
      }, { headers: snapshotHeaders });
    }

    if (url.pathname === "/api/model-quality") {
      return Response.json(modelQualityScorecard, { headers: snapshotHeaders });
    }

    if (url.pathname === "/api/property-data/sources") {
      return Response.json(sourceRegistry, { headers: snapshotHeaders });
    }

    if (url.pathname === "/api/property-data/audit") {
      return Response.json(liveAudit, { headers: snapshotHeaders });
    }

    if (url.pathname.startsWith("/api/property-data/sources/")) {
      const sourceId = decodeURIComponent(url.pathname.slice("/api/property-data/sources/".length));
      const source = sourceRegistry.sources.find((candidate) => candidate.id === sourceId);
      return source
        ? Response.json({ verifiedAt: sourceRegistry.verifiedAt, source }, { headers: snapshotHeaders })
        : Response.json({ error: "Unknown source" }, { status: 404, headers: snapshotHeaders });
    }

    if (url.pathname === "/api/property-data/markets") {
      return Response.json(marketCompetency, { headers: snapshotHeaders });
    }

    if (url.pathname.startsWith("/api/property-data/markets/")) {
      const marketId = decodeURIComponent(url.pathname.slice("/api/property-data/markets/".length));
      const market = marketCompetency.markets.find((candidate) => candidate.id === marketId);
      if (!market) return Response.json({ error: "Unknown market" }, { status: 404, headers: snapshotHeaders });
      const sources = sourceRegistry.sources.filter((source) => market.sourceIds.includes(source.id));
      return Response.json({ verifiedAt: marketCompetency.verifiedAt, market, sources }, { headers: snapshotHeaders });
    }

    if (url.pathname === "/api/property-data/samples") {
      return Response.json(firstWaveSamples, { headers: snapshotHeaders });
    }

    if (url.pathname === "/api/market-intelligence/acs") {
      return Response.json(acsAggregations, { headers: snapshotHeaders });
    }

    if (url.pathname.startsWith("/api/market-intelligence/acs/")) {
      const marketId = decodeURIComponent(url.pathname.slice("/api/market-intelligence/acs/".length));
      const market = acsAggregations.markets.find((candidate) => candidate.id === marketId);
      return market
        ? Response.json({ generatedAt: acsAggregations.generatedAt, vintage: acsAggregations.vintage, methodology: acsAggregations.methodology, market }, { headers: snapshotHeaders })
        : Response.json({ error: "Unknown market" }, { status: 404, headers: snapshotHeaders });
    }

    if (url.pathname === "/api/market-intelligence/pricing") {
      return Response.json(pricingHistory, { headers: snapshotHeaders });
    }

    if (url.pathname.startsWith("/api/market-intelligence/pricing/")) {
      const marketId = decodeURIComponent(url.pathname.slice("/api/market-intelligence/pricing/".length));
      const market = pricingHistory.markets.find((candidate) => candidate.id === marketId);
      return market
        ? Response.json({ retrievedAt: pricingHistory.retrievedAt, source: pricingHistory.source, methodology: pricingHistory.methodology, market }, { headers: snapshotHeaders })
        : Response.json({ error: "Unknown market" }, { status: 404, headers: snapshotHeaders });
    }

    if (url.pathname === "/api/market-intelligence/pricing-clusters") {
      return Response.json(clusterPricingHistory, { headers: snapshotHeaders });
    }

    if (url.pathname.startsWith("/api/market-intelligence/pricing-clusters/")) {
      const marketId = decodeURIComponent(url.pathname.slice("/api/market-intelligence/pricing-clusters/".length));
      const market = clusterPricingHistory.markets.find((candidate) => candidate.id === marketId);
      return market
        ? Response.json({ retrievedAt: clusterPricingHistory.retrievedAt, source: clusterPricingHistory.source, methodology: clusterPricingHistory.methodology, market }, { headers: snapshotHeaders })
        : Response.json({ error: "Unknown market" }, { status: 404, headers: snapshotHeaders });
    }

    if (url.pathname === "/api/valuation/readiness") {
      return Response.json({
        generatedAt: propertyValuations.generatedAt,
        asOf: propertyValuations.asOf,
        methodology: propertyValuations.methodology,
        markets: propertyValuations.markets,
        providers: propertyValuations.providers,
      }, { headers: snapshotHeaders });
    }

    if (url.pathname === "/api/valuation/properties") {
      const marketId = url.searchParams.get("market");
      const records = marketId ? propertyValuations.properties.filter((property) => property.marketId === marketId) : propertyValuations.properties;
      const cacheStatement = env.DB?.prepare(`SELECT * FROM attom_enrichment WHERE property_id IS NOT NULL${marketId ? " AND market_id = ?" : ""}`);
      const cached = cacheStatement ? await (marketId ? cacheStatement.bind(marketId) : cacheStatement).all<AttomCacheRow>() : { results: [] as AttomCacheRow[] };
      const byProperty = new Map((cached.results ?? []).map((row) => [row.property_id, row]));
      const enrichedRecords = records.map((property) => {
        const row = byProperty.get(property.id);
        const attom = row?.provider_status === "matched" ? parseAttomPayload(row) : null;
        return { ...property, attomEnrichment: attom ? { provider: "ATTOM", fetchedAt: row!.fetched_at, expiresAt: row!.expires_at, property: attom, secondarySignal: attomSecondarySignal(property, attom) } : null };
      });
      return Response.json({ generatedAt: propertyValuations.generatedAt, asOf: propertyValuations.asOf, count: enrichedRecords.length, records: enrichedRecords }, { headers: snapshotHeaders });
    }

    if (url.pathname.startsWith("/api/valuation/properties/")) {
      const propertyId = decodeURIComponent(url.pathname.slice("/api/valuation/properties/".length));
      const property = propertyValuations.properties.find((candidate) => candidate.id === propertyId);
      const row = property && env.DB ? await env.DB.prepare("SELECT * FROM attom_enrichment WHERE property_id = ?").bind(propertyId).first<AttomCacheRow>() : null;
      const attom = row?.provider_status === "matched" ? parseAttomPayload(row) : null;
      return property
        ? Response.json({ generatedAt: propertyValuations.generatedAt, asOf: propertyValuations.asOf, methodology: propertyValuations.methodology, property: { ...property, attomEnrichment: attom ? { provider: "ATTOM", fetchedAt: row!.fetched_at, expiresAt: row!.expires_at, property: attom, secondarySignal: attomSecondarySignal(property, attom) } : null } }, { headers: snapshotHeaders })
        : Response.json({ error: "Unknown property" }, { status: 404, headers: snapshotHeaders });
    }

    if (url.pathname === "/api/integrations/attom/status") {
      return Response.json({
        provider: "ATTOM",
        connected: Boolean(env.ATTOM_API_KEY),
        endpoint: "/api/integrations/attom/property?address1=...&address2=city,state,zip&depth=core|underwriting",
        capabilities: ["property facts", "assessment and tax", "recorded sale", "AVM range and confidence", "price per square foot", "monthly AVM change", "mortgage summary", "10-year sales history", "building permits", "home equity and LTV", "school context"],
        requestProfiles: {
          core: { maximumRequests: 1, endpoint: "attomavm/detail", use: "Routine property validation and market controls" },
          underwriting: { maximumRequests: 6, endpoints: ["attomavm/detail", ...ATTOM_UNDERWRITING_MODULES.map((module) => module.endpoint)], use: "Explicit, on-demand property diligence; every module reports available, no result, not entitled or error" },
        },
        allowanceRule: "ATTOM documents that only HTTP 200 responses count toward monthly allowances and overages. BORO reports counted calls separately from attempted requests.",
        cache: { persistent: true, successTtlDays: ATTOM_SUCCESS_TTL_DAYS, failureTtlDays: ATTOM_FAILURE_TTL_DAYS, scheduledSamplePerMarket: ATTOM_MARKET_SAMPLE_SIZE },
        privacy: "The API key stays server-side. Responses are reduced to decision fields. Owner, buyer/seller, mailing, lender identity/contact, document-number and loan-number fields are discarded before storage.",
        areaModules: [
          { endpoint: "transaction/salestrend", use: "Area sale-price and count trends", activation: "Add after a stable GeoIDV4-to-cluster crosswalk" },
          { endpoint: "v4/neighborhood/community", use: "Commercial demographic, hazard and neighborhood cross-check", activation: "Keep separate from Census/FHFA fundamentals until vintage and methodology are validated" },
        ],
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (url.pathname === "/api/integrations/rentcast/status") {
      return Response.json({
        provider: "RentCast",
        connected: Boolean(env.RENTCAST_API_KEY),
        endpoint: "/api/integrations/rentcast/property?address=...",
        underwritingEndpoint: "/api/integrations/rentcast/rent-range?address=...&squareFootage=...",
        pilotEndpoint: "/api/listings/{raleigh|chicago|philadelphia}",
        capabilities: ["active sale listing", "active rental listing", "property-specific rent estimate", "rental comp rent/sf distribution", "one-call 500-record regional listing screen", "cross-region model diagnostics"],
        privacy: "The API key stays server-side. Owner and listing-contact fields are not returned.",
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (url.pathname.startsWith("/api/listings/") || url.pathname === "/api/integrations/rentcast/pilot") {
      if (!env.RENTCAST_API_KEY) return Response.json({ error: "RentCast is not configured" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      const market = (url.pathname.startsWith("/api/listings/") ? url.pathname.slice("/api/listings/".length) : url.searchParams.get("market")?.trim().toLowerCase() ?? "raleigh") as ListingMarketId;
      if (!(market in LISTING_MARKETS)) return Response.json({ error: "Supported listing markets are Raleigh, Chicago and Philadelphia." }, { status: 400 });
      try {
        const marketConfig = LISTING_MARKETS[market];
        const marketModel = propertyValuations.markets.find((item) => item.id === market);
        const pilot = await fetchMarketListingPilot(env.RENTCAST_API_KEY, market);
        return Response.json({
          provider: "RentCast",
          market: { id: market, label: marketConfig.label, center: marketConfig.center, modelCompetency: marketModel && "modelCompetency" in marketModel ? marketModel.modelCompetency : null, integratedCompetency: marketModel?.competency ?? null },
          retrievedAt: new Date().toISOString(),
          requestCost: 1,
          ...pilot,
          methodology: "Twenty-four mapped listings span the leading, baseline and higher-diligence portions of up to 500 active listings returned in one regional request. The raw signal is 65% property-type-normalized asking price/sf and 35% market time. Listing freshness, field completeness and regional model competency only shrink that signal toward neutral; they never earn opportunity points.",
          boundary: "This is a live-listing screen, not a valuation or recommendation. Verify status, source rights, condition, taxes, insurance, title, concessions and full deal inputs before underwriting.",
        }, { headers: { "Cache-Control": "private, max-age=21600" } });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "RentCast regional listing lookup failed" }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
      }
    }

    if (url.pathname === "/api/integrations/rentcast/rent-range") {
      if (!env.RENTCAST_API_KEY) return Response.json({ error: "RentCast is not configured" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      const address = url.searchParams.get("address")?.trim() ?? "";
      const rawType = url.searchParams.get("propertyType")?.trim() ?? "Single Family";
      const propertyType = rentCastPropertyType(rawType);
      const squareFootage = Number(url.searchParams.get("squareFootage"));
      const bedroomsParam = url.searchParams.get("bedrooms");
      const bathroomsParam = url.searchParams.get("bathrooms");
      const bedrooms = bedroomsParam === null || bedroomsParam.trim() === "" ? Number.NaN : Number(bedroomsParam);
      const bathrooms = bathroomsParam === null || bathroomsParam.trim() === "" ? Number.NaN : Number(bathroomsParam);
      if (!address) return Response.json({ error: "address is required" }, { status: 400 });
      if (!Number.isFinite(squareFootage) || squareFootage < 150 || squareFootage > 20_000) {
        return Response.json({ error: "A credible subject-property living area between 150 and 20,000 square feet is required." }, { status: 400 });
      }
      if (propertyType === "Multi-Family" && url.searchParams.get("unitConfirmed") !== "true") {
        return Response.json({ error: "Multi-family rent estimates require confirmed single-unit bedrooms, bathrooms and square footage." }, { status: 422 });
      }
      try {
        const estimate = await rentCastRequest<RentCastRentEstimate>(env.RENTCAST_API_KEY, "avm/rent/long-term", address, {
          propertyType,
          bedrooms: Number.isFinite(bedrooms) && bedrooms >= 0 ? bedrooms : undefined,
          bathrooms: Number.isFinite(bathrooms) && bathrooms > 0 ? bathrooms : undefined,
          squareFootage,
          maxRadius: 5,
          daysOld: 270,
          compCount: 20,
          lookupSubjectAttributes: true,
        });
        const comparableRows = (estimate.comparables ?? []).filter((comp) => Number(comp.price) > 0 && Number(comp.squareFootage) >= 150);
        const rentPerSqftValues = comparableRows.map((comp) => Number(comp.price) / Number(comp.squareFootage));
        const comparableRange = comparableRows.length >= 5 ? {
          p25: roundedMonthlyRent(quantileNumber(rentPerSqftValues, .25) * squareFootage),
          median: roundedMonthlyRent(quantileNumber(rentPerSqftValues, .5) * squareFootage),
          p75: roundedMonthlyRent(quantileNumber(rentPerSqftValues, .75) * squareFootage),
          rentPerSqft: {
            p25: Math.round(quantileNumber(rentPerSqftValues, .25) * 100) / 100,
            median: Math.round(quantileNumber(rentPerSqftValues, .5) * 100) / 100,
            p75: Math.round(quantileNumber(rentPerSqftValues, .75) * 100) / 100,
          },
        } : null;
        const daysOldValues = comparableRows.map((comp) => Number(comp.daysOld)).filter(Number.isFinite);
        const distanceValues = comparableRows.map((comp) => Number(comp.distance)).filter(Number.isFinite);
        const medianDaysOld = daysOldValues.length ? Math.round(medianNumber(daysOldValues)) : null;
        const medianDistance = distanceValues.length ? Math.round(medianNumber(distanceValues) * 10) / 10 : null;
        const evidenceGrade = comparableRows.length >= 12 && (medianDaysOld ?? 999) <= 180 ? "strong"
          : comparableRows.length >= 5 && (medianDaysOld ?? 999) <= 270 ? "moderate" : "weak";
        return Response.json({
          provider: "RentCast",
          retrievedAt: new Date().toISOString(),
          requestCost: 1,
          subject: {
            address,
            propertyType,
            bedrooms: Number.isFinite(bedrooms) && bedrooms >= 0 ? bedrooms : null,
            bathrooms: Number.isFinite(bathrooms) && bathrooms > 0 ? bathrooms : null,
            squareFootage,
            providerSquareFootage: estimate.subjectProperty?.squareFootage ?? null,
          },
          comparableRange,
          providerEstimate: { median: estimate.rent ?? null, low85: estimate.rentRangeLow ?? null, high85: estimate.rentRangeHigh ?? null },
          evidence: { compCount: comparableRows.length, medianDaysOld, medianDistance, grade: evidenceGrade },
          methodology: "P25, median and P75 are calculated from the returned comparable listings' monthly rent per square foot, then multiplied by the selected subject property's living area. RentCast's proprietary estimate and 85% range remain visible as a separate cross-check.",
          boundary: comparableRange ? "This is a property-specific comparable-rent screen, not a lease quote. Verify unit condition, utilities, concessions, lease terms and current availability." : "Fewer than five comparables had both rent and living area. The property-specific percentile range is unavailable and underwriting must remain incomplete.",
        }, { headers: { "Cache-Control": "private, max-age=900" } });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "RentCast property rent range failed" }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
      }
    }

    if (url.pathname === "/api/integrations/rentcast/property") {
      if (!env.RENTCAST_API_KEY) return Response.json({ error: "RentCast is not configured" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      const address = url.searchParams.get("address")?.trim();
      if (!address) return Response.json({ error: "address is required" }, { status: 400 });
      try {
        const [saleListings, rentalListings, rentEstimate] = await Promise.all([
          rentCastRequest<RentCastListing[]>(env.RENTCAST_API_KEY, "listings/sale", address),
          rentCastRequest<RentCastListing[]>(env.RENTCAST_API_KEY, "listings/rental/long-term", address),
          rentCastRequest<RentCastRentEstimate>(env.RENTCAST_API_KEY, "avm/rent/long-term", address),
        ]);
        return Response.json({
          provider: "RentCast",
          retrievedAt: new Date().toISOString(),
          address,
          activeSale: normalizeRentCastListing(saleListings[0]),
          activeRental: normalizeRentCastListing(rentalListings[0]),
          rentEstimate: { rent: rentEstimate.rent ?? null, low: rentEstimate.rentRangeLow ?? null, high: rentEstimate.rentRangeHigh ?? null, compCount: rentEstimate.comparables?.length ?? 0 },
          boundary: "A listing is market-facing evidence, not proof of value or achievable rent. Verify source rights, status, concessions, lease terms and physical condition before underwriting.",
        }, { headers: { "Cache-Control": "private, max-age=900" } });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "RentCast lookup failed" }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
      }
    }

    if (url.pathname === "/api/integrations/attom/property") {
      if (!env.ATTOM_API_KEY) {
        return Response.json({ error: "ATTOM is not configured", setup: "Add ATTOM_API_KEY as an encrypted hosting secret." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      }
      const address1 = url.searchParams.get("address1")?.trim();
      const address2 = url.searchParams.get("address2")?.trim();
      if (!address1 || !address2) return Response.json({ error: "address1 and address2 are required" }, { status: 400 });
      try {
        const propertyId = url.searchParams.get("propertyId")?.trim() || null;
        const marketId = url.searchParams.get("market")?.trim() || "ad-hoc";
        const depth: AttomEvidenceDepth = url.searchParams.get("depth") === "underwriting" ? "underwriting" : "core";
        if (depth === "underwriting" && url.searchParams.get("confirm") !== "full") return Response.json({ error: "Full property files can attempt up to six ATTOM requests. Resubmit with confirm=full." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
        const lookup = await cachedAttomProperty(env, { propertyId, marketId, address1, address2 }, false, depth);
        if (lookup.status === "failed") {
          const status = lookup.error?.includes("authorization failed") ? 403 : 404;
          return Response.json({ error: lookup.error, cacheHit: lookup.cacheHit, providerCalls: lookup.providerCalls, attemptedRequests: lookup.attemptedRequests }, { status, headers: { "Cache-Control": "private, no-store" } });
        }
        const publicProperty = propertyId ? propertyValuations.properties.find((candidate) => candidate.id === propertyId) : null;
        return Response.json({ provider: "ATTOM", depth, retrievedAt: lookup.fetchedAt, cacheHit: lookup.cacheHit, providerCalls: lookup.providerCalls, attemptedRequests: lookup.attemptedRequests, property: lookup.property, secondarySignal: publicProperty ? attomSecondarySignal(publicProperty, lookup.property) : null, use: depth === "underwriting" ? "Full diligence evidence remains descriptive and does not automatically change the score. Verify every mortgage, permit, tax, school and sale-history field at its source." : "Independent vendor cross-check with a capped 15% secondary weight. Agreement changes reliability; it does not manufacture investment edge." }, { headers: { "Cache-Control": "private, no-store" } });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "ATTOM property not found" }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
      }
    }

    if (url.pathname === "/api/integrations/attom/audit" && (request.method === "POST" || request.method === "GET")) {
      if (!env.ATTOM_API_KEY) return Response.json({ error: "ATTOM is not configured" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      const allowedMarkets = new Set(propertyValuations.markets.filter((market) => market.status === "live").map((market) => market.id));
      let body: { marketIds?: string[]; perMarket?: number; forceRefresh?: boolean } = {};
      if (request.method === "POST") try { body = await request.json() as typeof body; } catch { body = {}; }
      const marketIds = (body.marketIds ?? Array.from(allowedMarkets)).filter((marketId) => allowedMarkets.has(marketId));
      const perMarket = Math.max(1, Math.min(3, Math.round(body.perMarket ?? 2)));
      const result = await runAttomEnrichment(env, marketIds, perMarket, Boolean(body.forceRefresh));
      return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (url.pathname === "/api/public-safety/local") {
      const marketId = url.searchParams.get("market");
      const locality = url.searchParams.get("locality") ?? "";
      const latRaw = url.searchParams.get("lat");
      const lngRaw = url.searchParams.get("lng");
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!marketId || !latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ error: "market, lat and lng are required" }, { status: 400 });
      const marketAdapters = {
        chicago: { label: "Chicago Police Department", url: "https://data.cityofchicago.org/Public-Safety/Crimes-2001-to-Present/ijzp-q8t2", competency: 86, load: chicagoSafety },
        philadelphia: { label: "Philadelphia Police Department", url: "https://opendataphilly.org/datasets/crime-incidents/", competency: 84, load: philadelphiaSafety },
        raleigh: { label: "Raleigh Police Department", url: "https://www.arcgis.com/home/item.html?id=24c0b37fa9bb4e16ba8bcaa7e806c615", competency: 80, load: raleighSafety },
      } as const;
      const adapter = marketId === "philadelphia" ? marketAdapters.philadelphia
        : marketId === "chicago" && /CHICAGO/i.test(locality) ? marketAdapters.chicago
          : marketId === "raleigh" && /CARY/i.test(locality) ? { label: "Cary Police Department", url: "https://www.arcgis.com/home/item.html?id=44e030466cc7494280813c4b3816b329", competency: 82, load: carySafety }
            : marketId === "raleigh" && /RALEIGH/i.test(locality) ? marketAdapters.raleigh
              : null;
      if (!adapter) return Response.json({ error: `No verified local incident feed covers ${locality || "this property"} yet. Metro-level crime would be a misleading substitute.` }, { status: 404 });
      const currentFrom = dayStamp(365);
      const currentTo = dayStamp(0);
      const priorFrom = dayStamp(730);
      try {
        const [current, prior] = await Promise.all([adapter.load(lat, lng, currentFrom, currentTo), adapter.load(lat, lng, priorFrom, currentFrom)]);
        const trendPct = prior.total ? Math.round((current.total - prior.total) / prior.total * 1000) / 10 : null;
        return Response.json({
          marketId,
          radiusMiles: 0.5,
          source: adapter.label,
          sourceUrl: adapter.url,
          sourceCompetency: adapter.competency,
          current: { from: currentFrom, to: currentTo, ...current },
          prior: { from: priorFrom, to: currentFrom, ...prior },
          trendPct,
          definition: "Reported incidents within a half-mile straight-line radius. Violent and property groupings normalize local categories for screening only.",
          boundary: "This is incident density, not a population-adjusted crime rate or a prediction of personal safety. Reporting behavior, agency boundaries, classification changes and geocoding affect comparisons.",
        }, { headers: { "Cache-Control": "public, max-age=900, s-maxage=3600" } });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Public-safety feed unavailable" }, { status: 502 });
      }
    }

    if (url.pathname === "/api/maps-config") {
      if (!env.GOOGLE_MAPS_API_KEY) {
        return Response.json({ error: "Map configuration unavailable" }, { status: 503 });
      }
      return Response.json(
        { apiKey: env.GOOGLE_MAPS_API_KEY },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format: cloudflareImageFormat(format), quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const applicationResponse = await handler.fetch(request, env, ctx);
    if (!env.REVIEW_PASSWORD) return applicationResponse;
    const headers = new Headers(applicationResponse.headers);
    for (const [key, value] of Object.entries(gatedResponseHeaders())) headers.set(key, value);
    return new Response(applicationResponse.body, { status: applicationResponse.status, statusText: applicationResponse.statusText, headers });
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const marketIds = propertyValuations.markets.filter((market) => market.status === "live").map((market) => market.id);
    ctx.waitUntil(runAttomEnrichment(env, marketIds, ATTOM_MARKET_SAMPLE_SIZE, false).then((result) => {
      console.log(JSON.stringify({ event: "attom_enrichment", providerCalls: result.providerCalls, cacheHits: result.cacheHits, matched: result.matched, failed: result.failed }));
    }));
  },
};

export default worker;
