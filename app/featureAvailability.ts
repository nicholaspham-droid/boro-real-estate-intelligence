import sourceRegistry from "../data/source-registry.json";
import propertyValuations from "../data/property-valuations.json";
import { MARKET_EXPLORERS } from "./marketNeighborhoods";

export type ProductFeatureId = "screening" | "local-pricing" | "parcels" | "valuation" | "safety" | "listings";

export type ProductFeatureCoverage = {
  id: ProductFeatureId;
  label: string;
  shortLabel: string;
  description: string;
  marketIds: string[];
  href: string;
  freshness: string;
  boundary: string;
};

const allMarketIds = MARKET_EXPLORERS.map((market) => market.id);
const localPricingMarketIds = MARKET_EXPLORERS
  .filter((market) => market.neighborhoods.some((cluster) => cluster.localPricing !== null))
  .map((market) => market.id);
const parcelMarketIds = Array.from(new Set(sourceRegistry.sources.flatMap((source) => source.marketIds)));
const valuationMarketIds = propertyValuations.markets
  .filter((market) => market.status === "live" && market.propertyCount > 0)
  .map((market) => market.id);

export const PRODUCT_FEATURES: ProductFeatureCoverage[] = [
  {
    id: "screening",
    label: "Neighborhood screening",
    shortLabel: "Screening",
    description: "ACS demographic, economic, education and housing factors aggregated to local tract clusters.",
    marketIds: allMarketIds,
    href: "#workspace",
    freshness: "ACS 2020–2024",
    boundary: "A market-condition screen, not parcel or listing evidence.",
  },
  {
    id: "local-pricing",
    label: "Historical price momentum",
    shortLabel: "Pricing",
    description: "FHFA annual tract-cluster history with a quarterly metro benchmark.",
    marketIds: localPricingMarketIds,
    href: "#workspace",
    freshness: "FHFA through 2025 / 2026 Q1",
    boundary: "Some clusters fall back to metro context when a tract series is insufficient.",
  },
  {
    id: "parcels",
    label: "Verified parcel evidence",
    shortLabel: "Parcels",
    description: "A verified local-government source with stable parcel identifiers and auditable fields.",
    marketIds: parcelMarketIds,
    href: "#sources",
    freshness: "Publisher cadence varies",
    boundary: "Coverage may represent a core county rather than the complete metro.",
  },
  {
    id: "valuation",
    label: "Validated property valuation",
    shortLabel: "Valuation",
    description: "Qualified public-record properties with three model anchors and out-of-time validation.",
    marketIds: valuationMarketIds,
    href: "#valuation",
    freshness: propertyValuations.asOf,
    boundary: "Public-record ranges are not active listing prices or appraisals.",
  },
  {
    id: "safety",
    label: "Current local safety lookup",
    shortLabel: "Safety",
    description: "Official trailing-12-month incident lookups for current property records inside supported police jurisdictions.",
    marketIds: ["philadelphia", "raleigh"],
    href: "#valuation",
    freshness: "Live agency lookup",
    boundary: "Incident density is local context, not a cross-market crime-rate score.",
  },
  {
    id: "listings",
    label: "Active listing screen",
    shortLabel: "Listings",
    description: "Active asking price, status, days on market and source identifiers from the connected RentCast feed.",
    marketIds: ["raleigh", "chicago", "philadelphia"],
    href: "#valuation",
    freshness: "Live lookup · six-hour cache",
    boundary: "Raleigh, Chicago and Philadelphia are enabled with one cached regional request each. Listing evidence is not a valuation or investment recommendation.",
  },
];

export const VERIFIED_PARCEL_MARKET_IDS = parcelMarketIds;
export const VALUATION_MARKET_IDS = valuationMarketIds;

export function marketLabel(marketId: string) {
  return MARKET_EXPLORERS.find((market) => market.id === marketId)?.metro.short ?? marketId;
}
