import type { ExplorerLayer, FactorWeights } from "./marketNeighborhoods";

export const TRACT_PILOT_MARKETS = new Set(["new-york", "raleigh"]);

export type TractEvidence = {
  geoid: string;
  name: string;
  lat: number;
  lng: number;
  population: number;
  medianAge: number | null;
  bachelorsPct: number | null;
  unemploymentPct: number | null;
  medianIncome: number | null;
  povertyPct: number | null;
  vacancyPct: number | null;
  renterOccupiedUnits: number | null;
  medianHomeValue: number | null;
  medianRent: number | null;
  reliability: number;
  clusterId: string;
  clusterName: string;
  demographic: number;
  economic: number;
  education: number;
  housing: number;
  pricing: number;
  coverage: number;
  acsCompetency: number;
  pricingCompetency: number;
  priceScope: string;
};

export type TractPilotPayload = {
  generatedAt: string;
  marketId: string;
  label: string;
  vintage: string;
  source: string;
  underlyingSource: string;
  geometrySource: string;
  methodology: string;
  tractCount: number;
  tracts: TractEvidence[];
};

export type ScoredTract = TractEvidence & {
  id: string;
  rank: number;
  composite: number;
  confidence: number;
  marketPercentile: number;
};

export function tractComposite(tract: TractEvidence, weights: FactorWeights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  const raw = (tract.demographic * weights.demographic + tract.economic * weights.economic + tract.education * weights.education + tract.housing * weights.housing + tract.pricing * weights.pricing) / total;
  const directShare = 1 - weights.pricing / total;
  const confidence = Math.round(tract.acsCompetency * directShare + tract.pricingCompetency * weights.pricing / total);
  return { composite: Math.round(50 + (raw - 50) * confidence / 100), confidence };
}

export function tractLayerValue(tract: ScoredTract, layer: ExplorerLayer) {
  return tract[layer];
}
