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

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  GOOGLE_MAPS_API_KEY?: string;
  ATTOM_API_KEY?: string;
  RENTCAST_API_KEY?: string;
  REVIEW_PASSWORD?: string;
  FEEDBACK_ADMIN_PASSWORD?: string;
  FEEDBACK_ADMIN_EMAIL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface AttomProperty {
  identifier?: { attomId?: string | number; apn?: string };
  address?: { oneLine?: string };
  location?: { latitude?: string | number; longitude?: string | number };
  summary?: { proptype?: string; propertyType?: string; yearbuilt?: number };
  building?: { summary?: { yearbuilt?: number }; size?: { livingsize?: number; universalsize?: number }; rooms?: { beds?: number; bathstotal?: number } };
  assessment?: { assessed?: { assdttlvalue?: number }; market?: { mktttlvalue?: number }; tax?: { taxyear?: number } };
  sale?: { saleTransDate?: string; salesearchdate?: string; amount?: { saleamt?: number; saledisclosuretype?: number | string } };
  avm?: { amount?: { value?: number; low?: number; high?: number; scr?: number }; eventDate?: string; calculations?: { perSizeUnit?: number } };
  vintage?: { pubDate?: string; lastModified?: string };
}

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
  comparables?: unknown[];
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

async function rentCastRequest<T>(apiKey: string, path: string, address: string) {
  const endpoint = new URL(`https://api.rentcast.io/v1/${path}`);
  endpoint.searchParams.set("address", address);
  if (path.startsWith("listings/")) {
    endpoint.searchParams.set("status", "Active");
    endpoint.searchParams.set("limit", "1");
  } else {
    endpoint.searchParams.set("compCount", "5");
  }
  const response = await fetch(endpoint, { headers: { Accept: "application/json", "X-Api-Key": apiKey } });
  const payload = await response.json() as T | { message?: string };
  if (!response.ok) throw new Error("message" in payload && payload.message ? payload.message : `RentCast request failed (${response.status})`);
  return payload as T;
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
  const scored = usable.map((listing) => {
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
    const score = Math.round(components.value * .30 + components.marketTime * .22 + components.freshness * .20 + components.completeness * .13 + components.marketContext * .15);
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
      screeningScore: score,
      components,
      reasons,
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
        { key: "value", label: "Relative price / sf", weight: 30, score: listing.components.value, baseline: componentBaselines.value, weightedPoints: Math.round(listing.components.value * .30 * 10) / 10 },
        { key: "marketTime", label: "Market time", weight: 22, score: listing.components.marketTime, baseline: componentBaselines.marketTime, weightedPoints: Math.round(listing.components.marketTime * .22 * 10) / 10 },
        { key: "freshness", label: "Listing freshness", weight: 20, score: listing.components.freshness, baseline: componentBaselines.freshness, weightedPoints: Math.round(listing.components.freshness * .20 * 10) / 10 },
        { key: "completeness", label: "Field completeness", weight: 13, score: listing.components.completeness, baseline: componentBaselines.completeness, weightedPoints: Math.round(listing.components.completeness * .13 * 10) / 10 },
        { key: "marketContext", label: `${marketConfig.city} data competency`, weight: 15, score: listing.components.marketContext, baseline: componentBaselines.marketContext, weightedPoints: Math.round(listing.components.marketContext * .15 * 10) / 10 },
      ],
    };
  });

  const selectedIds = new Set<string>();
  const comparisonSet: typeof enriched = [];
  const add = (listing: (typeof enriched)[number] | undefined) => {
    if (listing && !selectedIds.has(listing.id)) {
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

  const ppsfValues = scored.map((listing) => listing.pricePerSqft);
  const completenessValues = scored.map((listing) => listing.components.completeness);
  const freshCount = scored.filter((listing) => listing.components.freshness >= 68).length;
  const diagnostics = modelMarket && "diagnostics" in modelMarket ? modelMarket.diagnostics : null;
  const ppsfP25 = Math.round(quantileNumber(ppsfValues, .25));
  const ppsfP75 = Math.round(quantileNumber(ppsfValues, .75));
  const medianCompleteness = Math.round(medianNumber(completenessValues));
  const freshnessCoverage = Math.round(freshCount / Math.max(1, scored.length) * 100);
  const backtestSample = diagnostics?.sampleSize ?? 0;
  const p80Error = diagnostics?.p80AbsoluteErrorPct ?? 100;
  const regionalStatus = scored.length >= 100 && medianCompleteness >= 70 && backtestSample >= 8 && p80Error <= 25 ? "pass" : scored.length >= 30 && backtestSample >= 5 && p80Error <= 35 ? "watch" : "compromised";

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
      interpretation: regionalStatus === "pass" ? "Listing breadth, field completeness and public-record backtesting support regional use with visible uncertainty." : regionalStatus === "watch" ? "The regional model remains usable for screening, but sample depth or validation error requires higher diligence." : "Regional evidence does not clear the minimum transferability gate; do not compare its scores as if equally calibrated.",
    },
  };
}

async function fetchAttomProperty(apiKey: string, address1: string, address2: string) {
  const attomUrl = new URL("https://api.gateway.attomdata.com/propertyapi/v1.0.0/attomavm/detail");
  attomUrl.searchParams.set("address1", address1);
  attomUrl.searchParams.set("address2", address2);
  const upstream = await fetch(attomUrl, { headers: { Accept: "application/json", APIKey: apiKey } });
  const payload = await upstream.json() as { property?: AttomProperty[]; status?: { msg?: string } };
  if (!upstream.ok || !payload.property?.length) throw new Error(payload.status?.msg || `ATTOM property not found (${upstream.status})`);
  const property = payload.property[0];
  return {
    attomId: property.identifier?.attomId ?? null,
    parcelId: property.identifier?.apn ?? null,
    address: property.address?.oneLine ?? `${address1}, ${address2}`,
    location: { latitude: property.location?.latitude ?? null, longitude: property.location?.longitude ?? null },
    type: property.summary?.proptype ?? property.summary?.propertyType ?? null,
    yearBuilt: property.summary?.yearbuilt ?? property.building?.summary?.yearbuilt ?? null,
    livingSize: property.building?.size?.livingsize ?? property.building?.size?.universalsize ?? null,
    beds: property.building?.rooms?.beds ?? null,
    baths: property.building?.rooms?.bathstotal ?? null,
    assessment: { total: property.assessment?.assessed?.assdttlvalue ?? null, market: property.assessment?.market?.mktttlvalue ?? null, taxYear: property.assessment?.tax?.taxyear ?? null },
    sale: { date: property.sale?.saleTransDate ?? property.sale?.salesearchdate ?? null, amount: property.sale?.amount?.saleamt ?? null, disclosure: property.sale?.amount?.saledisclosuretype ?? null },
    avm: { value: property.avm?.amount?.value ?? null, low: property.avm?.amount?.low ?? null, high: property.avm?.amount?.high ?? null, confidence: property.avm?.amount?.scr ?? null, asOf: property.avm?.eventDate ?? null, perSqft: property.avm?.calculations?.perSizeUnit ?? null },
    vintage: { published: property.vintage?.pubDate ?? null, modified: property.vintage?.lastModified ?? null },
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

function safeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return mismatch === 0;
}

function reviewLoginHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private review · BORO</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071a38;color:#fff;font-family:Arial,sans-serif}main{width:min(92vw,470px);padding:48px;border:1px solid #304762;background:#0b2244;box-shadow:0 30px 90px #020b1b}i{display:block;width:12px;height:12px;margin-bottom:35px;border-radius:50%;background:#d9ff55;box-shadow:0 0 0 8px rgba(217,255,85,.08)}span{color:#70dfcc;font-size:10px;font-weight:900;letter-spacing:.13em}h1{margin:15px 0 16px;font-size:42px;line-height:.95;letter-spacing:-.055em}p{margin:0 0 28px;color:#a7b6c9;font-size:13px;line-height:1.65}label{display:block;color:#8fa0b6;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}input{width:100%;height:50px;margin:9px 0 12px;padding:0 14px;border:1px solid #405674;background:#071a38;color:white;font:inherit;outline:0}input:focus{border-color:#d9ff55}button{width:100%;height:50px;border:0;background:#d9ff55;color:#071a38;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}button:disabled{opacity:.6}b{display:block;min-height:16px;margin-top:14px;color:#ff958d;font-size:10px}@media(max-width:520px){main{padding:35px 26px}h1{font-size:36px}}
  </style></head><body><main><i></i><span>BORO · INVITED REVIEW</span><h1>Private B-school<br>MVP review</h1><p>Enter the shared review password to explore the real estate intelligence workbench and leave structured feedback.</p><form><label for="password">Review password</label><input id="password" name="password" type="password" autocomplete="current-password" autofocus required><button>Enter private MVP →</button><b role="alert"></b></form></main><script>
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
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `${REVIEW_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax` } });
    }

    if (url.pathname === "/api/review/logout") {
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `${REVIEW_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
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

    const isFeedbackRepository = url.pathname === "/review-repository" || url.pathname.startsWith("/review-repository/") || url.pathname === "/api/review/admin/login" || url.pathname === "/api/review/repository" || url.pathname.startsWith("/api/review/repository/");
    const isPlatformAuthPath = url.pathname === "/signin-with-chatgpt" || url.pathname === "/signout-with-chatgpt" || url.pathname === "/callback";
    if (env.REVIEW_PASSWORD && !isFeedbackRepository && !isPlatformAuthPath && !url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/favicon") && url.pathname !== "/robots.txt") {
      const expected = await reviewToken(env.REVIEW_PASSWORD);
      const authenticated = safeEqual(reviewCookieValue(request), expected);
      if (!authenticated) {
        if (url.pathname.startsWith("/api/")) return Response.json({ error: "Private review authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
        return new Response(reviewLoginHtml(), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" } });
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
      return Response.json({ generatedAt: propertyValuations.generatedAt, asOf: propertyValuations.asOf, count: records.length, records }, { headers: snapshotHeaders });
    }

    if (url.pathname.startsWith("/api/valuation/properties/")) {
      const propertyId = decodeURIComponent(url.pathname.slice("/api/valuation/properties/".length));
      const property = propertyValuations.properties.find((candidate) => candidate.id === propertyId);
      return property
        ? Response.json({ generatedAt: propertyValuations.generatedAt, asOf: propertyValuations.asOf, methodology: propertyValuations.methodology, property }, { headers: snapshotHeaders })
        : Response.json({ error: "Unknown property" }, { status: 404, headers: snapshotHeaders });
    }

    if (url.pathname === "/api/integrations/attom/status") {
      return Response.json({
        provider: "ATTOM",
        connected: Boolean(env.ATTOM_API_KEY),
        endpoint: "/api/integrations/attom/property?address1=...&address2=city,state,zip",
        capabilities: ["property facts", "assessment", "recorded sale", "AVM range", "AVM confidence"],
        privacy: "The API key stays server-side. Owner, mortgage and mailing fields are not requested or returned.",
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (url.pathname === "/api/integrations/rentcast/status") {
      return Response.json({
        provider: "RentCast",
        connected: Boolean(env.RENTCAST_API_KEY),
        endpoint: "/api/integrations/rentcast/property?address=...",
        pilotEndpoint: "/api/listings/{raleigh|chicago|philadelphia}",
        capabilities: ["active sale listing", "active rental listing", "rent estimate", "rental comps", "one-call 500-record regional listing screen", "cross-region model diagnostics"],
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
          methodology: "Twenty-four mapped listings span the leading, baseline and higher-diligence portions of up to 500 active listings returned in one regional request. Relative price/sf is normalized within property type; the score weights price/sf 30%, market time 22%, freshness 20%, field completeness 13% and regional data competency 15%.",
          boundary: "This is a live-listing screen, not a valuation or recommendation. Verify status, source rights, condition, taxes, insurance, title, concessions and full deal inputs before underwriting.",
        }, { headers: { "Cache-Control": "private, max-age=21600" } });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "RentCast regional listing lookup failed" }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
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
        return Response.json({ error: "ATTOM is not configured", setup: "Add ATTOM_API_KEY as a Sites secret." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      }
      const address1 = url.searchParams.get("address1")?.trim();
      const address2 = url.searchParams.get("address2")?.trim();
      if (!address1 || !address2) return Response.json({ error: "address1 and address2 are required" }, { status: 400 });
      try {
        const property = await fetchAttomProperty(env.ATTOM_API_KEY, address1, address2);
        return Response.json({ provider: "ATTOM", retrievedAt: new Date().toISOString(), property, use: "Independent vendor cross-check. BORO does not substitute ATTOM's AVM for its public-record anchors or average correlated estimates blindly." }, { headers: { "Cache-Control": "private, no-store" } });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "ATTOM property not found" }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
      }
    }

    if (url.pathname === "/api/integrations/attom/audit" && request.method === "POST") {
      if (!env.ATTOM_API_KEY) return Response.json({ error: "ATTOM is not configured" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      const allowedMarkets = new Set(propertyValuations.markets.filter((market) => market.status === "live").map((market) => market.id));
      let body: { marketIds?: string[]; perMarket?: number } = {};
      try { body = await request.json() as typeof body; } catch { body = {}; }
      const marketIds = (body.marketIds ?? Array.from(allowedMarkets)).filter((marketId) => allowedMarkets.has(marketId));
      const perMarket = Math.max(1, Math.min(3, Math.round(body.perMarket ?? 2)));
      const samples = marketIds.flatMap((marketId) => propertyValuations.properties.filter((property) => property.marketId === marketId).slice(0, perMarket));
      const records = await Promise.all(samples.map(async (sample) => {
        try {
          const property = await fetchAttomProperty(env.ATTOM_API_KEY!, sample.address, sample.locality);
          const attomValue = property.avm.value;
          const deltaPct = attomValue ? Math.round((attomValue - sample.model.value) / sample.model.value * 1000) / 10 : null;
          const rangeOverlap = property.avm.low != null && property.avm.high != null
            ? property.avm.low <= sample.model.high && property.avm.high >= sample.model.low
            : false;
          return { id: sample.id, marketId: sample.marketId, address: sample.address, status: "matched" as const, borocastValue: sample.model.value, borocastRange: { low: sample.model.low, high: sample.model.high }, attomValue, attomRange: { low: property.avm.low, high: property.avm.high }, attomConfidence: property.avm.confidence, deltaPct, rangeOverlap };
        } catch (error) {
          return { id: sample.id, marketId: sample.marketId, address: sample.address, status: "failed" as const, borocastValue: sample.model.value, error: error instanceof Error ? error.message : "ATTOM lookup failed" };
        }
      }));
      const matched = records.filter((record) => record.status === "matched").length;
      return Response.json({ provider: "ATTOM", retrievedAt: new Date().toISOString(), marketIds, requested: records.length, matched, failed: records.length - matched, records, boundary: "This audit measures vendor availability and agreement. It does not retrain or average into the BORO public-record model." }, { headers: { "Cache-Control": "private, no-store" } });
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
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
