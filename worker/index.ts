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
