import { METROS, type Metro } from "./metroData";

export type ExplorerLayer = "edge" | "demand" | "supply";

export type NeighborhoodSignal = {
  id: string;
  rank: number;
  name: string;
  lat: number;
  lng: number;
  edge: number;
  demand: number;
  supply: number;
  pricing: number;
  catalyst: number;
  confidence: number;
  focus: string;
  action: string;
};

export type MarketExplorer = {
  id: string;
  metro: Metro;
  center: { lat: number; lng: number };
  zoom: number;
  basis: "measured" | "connected proxy" | "model preview";
  neighborhoods: NeighborhoodSignal[];
};

type SeedUnit = [name: string, lat: number, lng: number, focus: keyof typeof FOCUS];
type MarketSeed = { center: { lat: number; lng: number }; zoom: number; units: SeedUnit[] };

const FOCUS = {
  infill: { label: "Infill capacity", action: "Test parcel assembly, zoning headroom and recent permits" },
  transit: { label: "Transit access", action: "Compare station-area capacity with sale and rent confirmation" },
  jobs: { label: "Job catalyst", action: "Trace employer, infrastructure and delivery milestones" },
  pricing: { label: "Price dislocation", action: "Verify repeat sales against income and nearby peer tracts" },
  resilience: { label: "Risk-adjusted carry", action: "Price hazard, insurance, tax and infrastructure exposure" },
} as const;

const SEEDS: Record<string, MarketSeed> = {
  "New York": { center: { lat: 40.74, lng: -73.92 }, zoom: 10, units: [
    ["Highbridge / Concourse", 40.84, -73.93, "infill"], ["Fordham / University Hts.", 40.86, -73.9, "transit"], ["Upper East Side", 40.773, -73.956, "pricing"], ["Belmont / East Tremont", 40.855, -73.886, "infill"], ["East Harlem", 40.795, -73.94, "resilience"],
  ] },
  "Los Angeles": { center: { lat: 34.06, lng: -118.28 }, zoom: 10, units: [
    ["Downtown", 34.041, -118.247, "transit"], ["Koreatown", 34.058, -118.301, "pricing"], ["Silver Lake", 34.087, -118.27, "jobs"], ["West Adams", 34.033, -118.347, "infill"], ["North Hollywood", 34.187, -118.381, "transit"],
  ] },
  "Chicago": { center: { lat: 41.87, lng: -87.65 }, zoom: 10, units: [
    ["West Loop", 41.882, -87.644, "jobs"], ["Logan Square", 41.923, -87.708, "pricing"], ["Pilsen", 41.856, -87.656, "infill"], ["Bronzeville", 41.821, -87.617, "transit"], ["Hyde Park", 41.794, -87.591, "resilience"],
  ] },
  "Dallas–Fort Worth": { center: { lat: 32.79, lng: -96.8 }, zoom: 10, units: [
    ["Uptown", 32.801, -96.801, "jobs"], ["Bishop Arts", 32.747, -96.828, "pricing"], ["Deep Ellum", 32.784, -96.784, "transit"], ["Oak Lawn", 32.809, -96.81, "infill"], ["Lake Highlands", 32.875, -96.744, "resilience"],
  ] },
  "Houston": { center: { lat: 29.76, lng: -95.39 }, zoom: 10, units: [
    ["The Heights", 29.798, -95.398, "pricing"], ["Montrose", 29.742, -95.391, "infill"], ["East End", 29.748, -95.33, "jobs"], ["Third Ward", 29.724, -95.36, "transit"], ["Spring Branch", 29.8, -95.5, "resilience"],
  ] },
  "Atlanta": { center: { lat: 33.77, lng: -84.38 }, zoom: 10, units: [
    ["Midtown", 33.783, -84.383, "jobs"], ["Old Fourth Ward", 33.766, -84.366, "transit"], ["West End", 33.735, -84.414, "infill"], ["East Atlanta", 33.741, -84.348, "pricing"], ["Buckhead", 33.848, -84.37, "resilience"],
  ] },
  "Washington": { center: { lat: 38.91, lng: -77.02 }, zoom: 11, units: [
    ["Navy Yard", 38.876, -77.0, "jobs"], ["Shaw", 38.912, -77.021, "infill"], ["Columbia Heights", 38.929, -77.028, "transit"], ["Brookland", 38.928, -76.991, "pricing"], ["Petworth", 38.94, -77.025, "resilience"],
  ] },
  "Miami": { center: { lat: 25.79, lng: -80.2 }, zoom: 11, units: [
    ["Brickell", 25.761, -80.191, "jobs"], ["Wynwood", 25.801, -80.199, "infill"], ["Little Havana", 25.765, -80.219, "pricing"], ["Little Haiti", 25.831, -80.193, "transit"], ["Coconut Grove", 25.728, -80.241, "resilience"],
  ] },
  "Philadelphia": { center: { lat: 39.97, lng: -75.17 }, zoom: 11, units: [
    ["Fishtown", 39.97, -75.135, "pricing"], ["University City", 39.952, -75.193, "jobs"], ["Point Breeze", 39.933, -75.176, "infill"], ["Manayunk", 40.027, -75.224, "resilience"], ["Kensington", 39.991, -75.128, "transit"],
  ] },
  "Phoenix": { center: { lat: 33.47, lng: -112.08 }, zoom: 10, units: [
    ["Roosevelt Row", 33.458, -112.07, "infill"], ["Midtown", 33.481, -112.073, "transit"], ["Arcadia", 33.5, -111.98, "pricing"], ["South Mountain", 33.347, -112.073, "resilience"], ["Maryvale", 33.493, -112.19, "jobs"],
  ] },
  "Ocala": { center: { lat: 29.18, lng: -82.14 }, zoom: 10, units: [
    ["Historic Downtown", 29.187, -82.14, "infill"], ["Silver Springs", 29.215, -82.055, "resilience"], ["Marion Oaks", 29.01, -82.18, "pricing"], ["Ocala Palms", 29.26, -82.21, "transit"], ["Fort King", 29.187, -82.105, "jobs"],
  ] },
  "Myrtle Beach": { center: { lat: 33.72, lng: -78.89 }, zoom: 9, units: [
    ["Downtown Myrtle Beach", 33.69, -78.88, "infill"], ["Market Common", 33.67, -78.93, "jobs"], ["Carolina Forest", 33.75, -78.94, "pricing"], ["Socastee", 33.68, -79.0, "resilience"], ["North Myrtle Beach", 33.816, -78.68, "transit"],
  ] },
  "Spartanburg": { center: { lat: 34.97, lng: -81.95 }, zoom: 10, units: [
    ["Downtown", 34.95, -81.93, "jobs"], ["Northside", 34.97, -81.93, "infill"], ["Converse Heights", 34.95, -81.91, "pricing"], ["Arcadia", 34.96, -81.99, "transit"], ["Boiling Springs", 35.04, -81.98, "resilience"],
  ] },
  "Lakeland": { center: { lat: 28.05, lng: -81.95 }, zoom: 11, units: [
    ["Downtown", 28.04, -81.95, "infill"], ["Dixieland", 28.02, -81.96, "pricing"], ["Lake Hollingsworth", 28.02, -81.94, "resilience"], ["North Lakeland", 28.11, -81.97, "jobs"], ["Crystal Lake", 28.01, -81.91, "transit"],
  ] },
  "Punta Gorda": { center: { lat: 26.94, lng: -82.05 }, zoom: 10, units: [
    ["Downtown", 26.93, -82.05, "infill"], ["Punta Gorda Isles", 26.9, -82.07, "resilience"], ["Deep Creek", 27.01, -82.0, "pricing"], ["Port Charlotte", 26.98, -82.09, "jobs"], ["Burnt Store", 26.81, -82.05, "transit"],
  ] },
  "Huntsville": { center: { lat: 34.72, lng: -86.6 }, zoom: 10, units: [
    ["Downtown", 34.73, -86.59, "jobs"], ["Five Points", 34.74, -86.57, "pricing"], ["MidCity", 34.74, -86.68, "infill"], ["West Huntsville", 34.72, -86.63, "transit"], ["Jones Valley", 34.68, -86.55, "resilience"],
  ] },
  "Wilmington": { center: { lat: 34.23, lng: -77.9 }, zoom: 10, units: [
    ["Downtown", 34.236, -77.947, "infill"], ["Cargo District", 34.229, -77.92, "jobs"], ["South Front", 34.221, -77.946, "pricing"], ["Seagate", 34.21, -77.84, "resilience"], ["Ogden", 34.27, -77.8, "transit"],
  ] },
  "St. George": { center: { lat: 37.08, lng: -113.58 }, zoom: 10, units: [
    ["Downtown", 37.108, -113.58, "infill"], ["Desert Color", 37.02, -113.55, "jobs"], ["Little Valley", 37.07, -113.54, "pricing"], ["Bloomington", 37.06, -113.62, "transit"], ["Green Valley", 37.09, -113.62, "resilience"],
  ] },
  "Northwest Arkansas": { center: { lat: 36.26, lng: -94.16 }, zoom: 9, units: [
    ["Downtown Fayetteville", 36.063, -94.16, "infill"], ["Bentonville", 36.372, -94.208, "jobs"], ["Rogers", 36.333, -94.118, "pricing"], ["Springdale", 36.186, -94.129, "transit"], ["Bella Vista", 36.467, -94.272, "resilience"],
  ] },
  "Raleigh": { center: { lat: 35.79, lng: -78.64 }, zoom: 10, units: [
    ["Downtown", 35.779, -78.638, "jobs"], ["North Hills", 35.84, -78.64, "pricing"], ["Southeast Raleigh", 35.74, -78.61, "infill"], ["Five Points", 35.81, -78.63, "transit"], ["West Raleigh", 35.79, -78.69, "resilience"],
  ] },
};

const NYC_METRICS: Record<string, Pick<NeighborhoodSignal, "edge" | "demand" | "supply" | "pricing" | "catalyst" | "confidence">> = {
  "Highbridge / Concourse": { edge: 97, demand: 83, supply: 94, pricing: 88, catalyst: 97, confidence: 88 },
  "Fordham / University Hts.": { edge: 89, demand: 78, supply: 89, pricing: 84, catalyst: 92, confidence: 87 },
  "Upper East Side": { edge: 79, demand: 70, supply: 81, pricing: 76, catalyst: 84, confidence: 86 },
  "Belmont / East Tremont": { edge: 79, demand: 72, supply: 80, pricing: 77, catalyst: 85, confidence: 85 },
  "East Harlem": { edge: 78, demand: 68, supply: 79, pricing: 75, catalyst: 83, confidence: 82 },
};

function clamp(value: number, min = 35, max = 98) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function scoreNeighborhood(metro: Metro, unit: SeedUnit, index: number): NeighborhoodSignal {
  const [name, lat, lng, focusKey] = unit;
  const focus = FOCUS[focusKey];
  const basisPenalty = metro.localStatus === "live" ? 0 : metro.localStatus === "connected" ? 5 : 11;
  const demand = clamp(58 + metro.growth * 4.2 + ((index * 13 + name.length) % 21));
  const supply = clamp(52 + ((index * 17 + name.length * 2) % 31));
  const pricing = clamp(49 + ((index * 19 + name.length * 3) % 35));
  const catalyst = clamp(51 + ((index * 23 + name.length) % 34));
  const resilience = clamp(61 + ((index * 11 + name.length * 2) % 27));
  const liquidity = clamp(metro.competency - basisPenalty + ((index * 7) % 10) - 4);
  const edge = clamp(demand * .25 + supply * .2 + pricing * .2 + catalyst * .15 + resilience * .1 + liquidity * .1);
  const scored = {
    id: `${slug(metro.short)}-${slug(name)}`,
    rank: 0,
    name,
    lat,
    lng,
    edge,
    demand,
    supply,
    pricing,
    catalyst,
    confidence: clamp(metro.competency - basisPenalty - index, 40, 95),
    focus: focus.label,
    action: focus.action,
  };
  return metro.short === "New York" && NYC_METRICS[name] ? { ...scored, ...NYC_METRICS[name] } : scored;
}

export const MARKET_EXPLORERS: MarketExplorer[] = METROS.map((metro) => {
  const seed = SEEDS[metro.short];
  const basis = metro.localStatus === "live" ? "measured" : metro.localStatus === "connected" ? "connected proxy" : "model preview";
  const neighborhoods = seed.units.map((unit, index) => scoreNeighborhood(metro, unit, index))
    .sort((a, b) => b.edge - a.edge)
    .map((neighborhood, index) => ({ ...neighborhood, rank: index + 1 }));
  return { id: slug(metro.short), metro, center: seed.center, zoom: seed.zoom, basis, neighborhoods };
});

export function explorerLayerValue(neighborhood: NeighborhoodSignal, layer: ExplorerLayer) {
  return neighborhood[layer];
}
