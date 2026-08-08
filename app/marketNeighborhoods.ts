import acsAggregations from "../data/acs-market-aggregations.json";
import pricingHistory from "../data/fhfa-pricing-history.json";
import { METROS, type Metro } from "./metroData";

export type ExplorerLayer = "composite" | "demographic" | "economic" | "education" | "housing" | "pricing";
export type FactorWeights = Record<Exclude<ExplorerLayer, "composite">, number>;

export type NeighborhoodSignal = {
  id: string;
  rank: number;
  name: string;
  lat: number;
  lng: number;
  composite: number;
  demographic: number;
  economic: number;
  education: number;
  housing: number;
  pricing: number;
  confidence: number;
  coverage: number;
  reliability: number;
  tractCount: number;
  population: number;
  medianAge: number | null;
  bachelorsPct: number | null;
  unemploymentPct: number | null;
  medianIncome: number | null;
  povertyPct: number | null;
  vacancyPct: number | null;
  medianHomeValue: number | null;
  medianRent: number | null;
  sampleGeoids: string[];
};

export type MarketExplorer = {
  id: string;
  metro: Metro;
  center: { lat: number; lng: number };
  zoom: number;
  basis: "ACS tract aggregation";
  acsCompetency: number;
  acsCoverage: number;
  acsReliability: number;
  countyCount: number;
  tractCount: number;
  pricingHistory: (typeof pricingHistory.markets)[number];
  neighborhoods: NeighborhoodSignal[];
};

export const BALANCED_WEIGHTS: FactorWeights = { demographic: 15, economic: 25, education: 20, housing: 20, pricing: 20 };

export const WEIGHT_PRESETS: Array<{ id: string; label: string; detail: string; weights: FactorWeights }> = [
  { id: "balanced", label: "Balanced", detail: "Broad market readiness", weights: BALANCED_WEIGHTS },
  { id: "talent", label: "Talent", detail: "Education + earning power", weights: { demographic: 10, economic: 25, education: 40, housing: 10, pricing: 15 } },
  { id: "affordability", label: "Affordability", detail: "Income-to-home and rent capacity", weights: { demographic: 10, economic: 15, education: 10, housing: 45, pricing: 20 } },
  { id: "workforce", label: "Workforce", detail: "Demographic depth + employment", weights: { demographic: 30, economic: 30, education: 15, housing: 10, pricing: 15 } },
  { id: "momentum", label: "Momentum", detail: "Recent and durable HPI growth", weights: { demographic: 10, economic: 15, education: 10, housing: 15, pricing: 50 } },
];

export function weightedComposite(signal: Pick<NeighborhoodSignal, "demographic" | "economic" | "education" | "housing" | "pricing">, weights: FactorWeights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return Math.round((signal.demographic * weights.demographic + signal.economic * weights.economic + signal.education * weights.education + signal.housing * weights.housing + signal.pricing * weights.pricing) / total);
}

export const MARKET_EXPLORERS: MarketExplorer[] = acsAggregations.markets.map((aggregate) => {
  const metro = METROS.find((candidate) => candidate.short === aggregate.label) ?? METROS[0];
  const pricing = pricingHistory.markets.find((candidate) => candidate.id === aggregate.id) ?? pricingHistory.markets[0];
  const neighborhoods = aggregate.clusters.map((cluster) => {
    const base = {
      id: cluster.id,
      rank: 0,
      name: cluster.name,
      lat: cluster.lat,
      lng: cluster.lng,
      composite: 0,
      demographic: cluster.factors.demographic,
      economic: cluster.factors.economic,
      education: cluster.factors.education,
      housing: cluster.factors.housing,
      pricing: pricing.momentumScore,
      confidence: Math.round(cluster.acsCompetency * .55 + metro.competency * .25 + pricing.pricingCompetency * .2),
      coverage: cluster.coverage,
      reliability: cluster.reliability,
      tractCount: cluster.tractCount,
      population: cluster.population,
      medianAge: cluster.medianAge,
      bachelorsPct: cluster.bachelorsPct,
      unemploymentPct: cluster.unemploymentPct,
      medianIncome: cluster.medianIncome,
      povertyPct: cluster.povertyPct,
      vacancyPct: cluster.vacancyPct,
      medianHomeValue: cluster.medianHomeValue,
      medianRent: cluster.medianRent,
      sampleGeoids: cluster.sampleGeoids,
    };
    return { ...base, composite: weightedComposite(base, BALANCED_WEIGHTS) };
  }).sort((a, b) => b.composite - a.composite).map((cluster, index) => ({ ...cluster, rank: index + 1 }));

  return {
    id: aggregate.id,
    metro,
    center: aggregate.center,
    zoom: aggregate.zoom,
    basis: "ACS tract aggregation",
    acsCompetency: aggregate.acsCompetency,
    acsCoverage: aggregate.coverage,
    acsReliability: aggregate.reliability,
    countyCount: aggregate.countyCount,
    tractCount: aggregate.tractCount,
    pricingHistory: pricing,
    neighborhoods,
  };
});

export function explorerLayerValue(neighborhood: NeighborhoodSignal, layer: ExplorerLayer) {
  return neighborhood[layer];
}

export const ACS_AGGREGATION_META = {
  generatedAt: acsAggregations.generatedAt,
  vintage: acsAggregations.vintage,
  release: acsAggregations.release,
  clusterCount: acsAggregations.clusterCount,
  methodology: acsAggregations.methodology,
  tables: acsAggregations.tables,
};

export const PRICING_HISTORY_META = {
  retrievedAt: pricingHistory.retrievedAt,
  latestPeriod: pricingHistory.latestPeriod,
  source: pricingHistory.source,
  sourceLabel: pricingHistory.sourceLabel,
  aggregation: pricingHistory.aggregation,
  methodology: pricingHistory.methodology,
};
