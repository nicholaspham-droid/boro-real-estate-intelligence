import marketCompetency from "../data/market-competency.json";

export type Metro = {
  name: string;
  short: string;
  population: number;
  growth: number;
  cohort: "largest" | "fastest";
  localStatus: "live" | "connected" | "source inventory" | "cataloging";
  competency: number;
  evidenceBand: number;
};

const BASE_METROS: Metro[] = [
  { name: "New York–Newark–Jersey City, NY–NJ", short: "New York", population: 20112448, growth: 0.16, cohort: "largest", localStatus: "live", competency: 88, evidenceBand: 6 },
  { name: "Los Angeles–Long Beach–Anaheim, CA", short: "Los Angeles", population: 12844441, growth: -0.48, cohort: "largest", localStatus: "source inventory", competency: 78, evidenceBand: 10 },
  { name: "Chicago–Naperville–Elgin, IL–IN", short: "Chicago", population: 9434123, growth: 0.24, cohort: "largest", localStatus: "source inventory", competency: 90, evidenceBand: 6 },
  { name: "Dallas–Fort Worth–Arlington, TX", short: "Dallas–Fort Worth", population: 8477157, growth: 1.48, cohort: "largest", localStatus: "source inventory", competency: 72, evidenceBand: 12 },
  { name: "Houston–Pasadena–The Woodlands, TX", short: "Houston", population: 7904627, growth: 1.63, cohort: "largest", localStatus: "source inventory", competency: 70, evidenceBand: 12 },
  { name: "Atlanta–Sandy Springs–Roswell, GA", short: "Atlanta", population: 6482182, growth: 0.96, cohort: "largest", localStatus: "source inventory", competency: 73, evidenceBand: 12 },
  { name: "Washington–Arlington–Alexandria, DC–VA–MD–WV", short: "Washington", population: 6465724, growth: 0.78, cohort: "largest", localStatus: "source inventory", competency: 77, evidenceBand: 10 },
  { name: "Miami–Fort Lauderdale–West Palm Beach, FL", short: "Miami", population: 6391072, growth: -0.14, cohort: "largest", localStatus: "source inventory", competency: 76, evidenceBand: 10 },
  { name: "Philadelphia–Camden–Wilmington, PA–NJ–DE–MD", short: "Philadelphia", population: 6329118, growth: 0.25, cohort: "largest", localStatus: "source inventory", competency: 89, evidenceBand: 6 },
  { name: "Phoenix–Mesa–Chandler, AZ", short: "Phoenix", population: 5228938, growth: 1.14, cohort: "largest", localStatus: "source inventory", competency: 68, evidenceBand: 15 },
  { name: "Ocala, FL", short: "Ocala", population: 442660, growth: 3.43, cohort: "fastest", localStatus: "cataloging", competency: 78, evidenceBand: 10 },
  { name: "Myrtle Beach–Conway–North Myrtle Beach, SC", short: "Myrtle Beach", population: 427551, growth: 3.20, cohort: "fastest", localStatus: "cataloging", competency: 70, evidenceBand: 12 },
  { name: "Spartanburg, SC", short: "Spartanburg", population: 407656, growth: 2.75, cohort: "fastest", localStatus: "cataloging", competency: 66, evidenceBand: 15 },
  { name: "Lakeland–Winter Haven, FL", short: "Lakeland", population: 874790, growth: 2.74, cohort: "fastest", localStatus: "cataloging", competency: 78, evidenceBand: 10 },
  { name: "Punta Gorda, FL", short: "Punta Gorda", population: 217212, growth: 2.72, cohort: "fastest", localStatus: "cataloging", competency: 80, evidenceBand: 10 },
  { name: "Huntsville, AL", short: "Huntsville", population: 556444, growth: 2.64, cohort: "fastest", localStatus: "cataloging", competency: 67, evidenceBand: 15 },
  { name: "Wilmington, NC", short: "Wilmington", population: 492772, growth: 2.58, cohort: "fastest", localStatus: "cataloging", competency: 84, evidenceBand: 8 },
  { name: "St. George, UT", short: "St. George", population: 213670, growth: 2.51, cohort: "fastest", localStatus: "cataloging", competency: 83, evidenceBand: 8 },
  { name: "Fayetteville–Springdale–Rogers, AR", short: "Northwest Arkansas", population: 622177, growth: 2.43, cohort: "fastest", localStatus: "cataloging", competency: 74, evidenceBand: 12 },
  { name: "Raleigh–Cary, NC", short: "Raleigh", population: 1595720, growth: 2.36, cohort: "fastest", localStatus: "cataloging", competency: 86, evidenceBand: 8 },
];

export const METROS: Metro[] = BASE_METROS.map((metro) => {
  const verified = marketCompetency.markets.find((market) => market.label === metro.short);
  return verified ? {
    ...metro,
    localStatus: verified.status as Metro["localStatus"],
    competency: verified.competency,
    evidenceBand: verified.interval,
  } : metro;
});

export const COMPETENCY_FACTORS = [
  { label: "National comparable feeds", weight: 35 },
  { label: "Parcel geometry + stable ID", weight: 15 },
  { label: "Assessment + building attributes", weight: 15 },
  { label: "Verified arms-length sales", weight: 15 },
  { label: "Zoning + land-use capacity", weight: 8 },
  { label: "Permits + development pipeline", weight: 7 },
  { label: "Freshness, terms + join quality", weight: 5 },
];

export const NATIONAL_FEEDS = [
  { label: "Population + households", source: "Census PEP / ACS", role: "Demand", status: "ready" },
  { label: "Employment + wages", source: "BLS QCEW", role: "Demand", status: "ready" },
  { label: "Housing authorizations", source: "Census BPS", role: "Supply", status: "ready" },
  { label: "House-price trend", source: "FHFA HPI", role: "Pricing", status: "ready" },
  { label: "Hazard exposure", source: "FEMA NRI", role: "Resilience", status: "ready" },
  { label: "Parcel + zoning + sales", source: "Local government", role: "Neighborhood", status: "adapter needed" },
];

export const EDGE_COMPONENTS = [
  { key: "demand", label: "Demand acceleration", weight: 25, detail: "Population, households, jobs and wage momentum" },
  { key: "supply", label: "Supply friction", weight: 20, detail: "Permits and deliverable capacity versus household growth" },
  { key: "pricing", label: "Price dislocation", weight: 20, detail: "Price and rent movement versus income and peer fundamentals" },
  { key: "catalyst", label: "Catalyst pipeline", weight: 15, detail: "Rezoning, infrastructure, permits and major job anchors" },
  { key: "resilience", label: "Resilience + carry", weight: 10, detail: "Hazard exposure, taxes, insurance proxies and energy burden" },
  { key: "liquidity", label: "Evidence + liquidity", weight: 10, detail: "Sale depth, recency, join quality and revision risk" },
];
