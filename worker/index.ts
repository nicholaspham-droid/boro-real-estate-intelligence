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
  DB: D1Database;
  GOOGLE_MAPS_API_KEY?: string;
  ATTOM_API_KEY?: string;
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

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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

    if (url.pathname === "/api/integrations/attom/property") {
      if (!env.ATTOM_API_KEY) {
        return Response.json({ error: "ATTOM is not configured", setup: "Add ATTOM_API_KEY as a Sites secret." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      }
      const address1 = url.searchParams.get("address1")?.trim();
      const address2 = url.searchParams.get("address2")?.trim();
      if (!address1 || !address2) return Response.json({ error: "address1 and address2 are required" }, { status: 400 });
      const attomUrl = new URL("https://api.gateway.attomdata.com/propertyapi/v1.0.0/attomavm/detail");
      attomUrl.searchParams.set("address1", address1);
      attomUrl.searchParams.set("address2", address2);
      const upstream = await fetch(attomUrl, { headers: { Accept: "application/json", APIKey: env.ATTOM_API_KEY } });
      const payload = await upstream.json() as { property?: AttomProperty[]; status?: { msg?: string } };
      if (!upstream.ok || !payload.property?.length) {
        return Response.json({ error: payload.status?.msg || "ATTOM property not found", upstreamStatus: upstream.status }, { status: upstream.status === 404 ? 404 : 502 });
      }
      const property = payload.property[0];
      return Response.json({
        provider: "ATTOM",
        retrievedAt: new Date().toISOString(),
        property: {
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
        },
        use: "Independent vendor cross-check. Borocast does not substitute ATTOM's AVM for its public-record anchors or average correlated estimates blindly.",
      }, { headers: { "Cache-Control": "private, no-store" } });
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
