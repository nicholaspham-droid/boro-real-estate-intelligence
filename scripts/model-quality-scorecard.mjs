import { readFile, writeFile } from "node:fs/promises";

const valuations = JSON.parse(await readFile(new URL("../data/property-valuations.json", import.meta.url), "utf8"));
const acs = JSON.parse(await readFile(new URL("../data/acs-market-aggregations.json", import.meta.url), "utf8"));
const fhfa = JSON.parse(await readFile(new URL("../data/fhfa-cluster-pricing-history.json", import.meta.url), "utf8"));

const liveMarkets = valuations.markets.filter((market) => market.status === "live");
const output = {
  generatedAt: new Date().toISOString(),
  modelVersion: valuations.methodology.label,
  valuationAsOf: valuations.asOf,
  decisionGate: {
    pass: "At least 30 rolling-origin tests, median absolute percentage error <=15%, P80 error <=30%, and absolute median bias <=10%",
    watch: "At least 12 tests, median error <=25%, P80 error <=45%, and absolute median bias <=15%",
    compromised: "Any weaker result; property outputs remain diagnostic and must not drive underwriting",
  },
  markets: liveMarkets.map((market) => ({
    id: market.id,
    label: market.label,
    decisionUse: market.decisionUse,
    sourceCompetency: market.sourceCompetency,
    modelCompetency: market.modelCompetency,
    integratedCompetency: market.competency,
    tests: market.diagnostics.sampleSize,
    medianAbsoluteErrorPct: market.diagnostics.medianAbsoluteErrorPct,
    p80AbsoluteErrorPct: market.diagnostics.p80AbsoluteErrorPct,
    biasPct: market.diagnostics.biasPct,
    priceRelatedDifferential: market.diagnostics.priceRelatedDifferential,
    coefficientOfDispersion: market.diagnostics.coefficientOfDispersion,
  })),
  dataChannels: [
    { id: "public-records", mode: "snapshot", freshness: valuations.asOf, use: "Recorded sales, assessments, parcels and physical facts" },
    { id: "acs", mode: "versioned-snapshot", freshness: acs.vintage, use: `${acs.tractCount ?? acs.markets.reduce((sum, market) => sum + market.tractCount, 0)} tract observations and uncertainty metadata` },
    { id: "fhfa-tract", mode: "versioned-snapshot", freshness: String(fhfa.latestYear), use: "Historical tract-cluster price momentum and coverage" },
    { id: "rentcast", mode: "live-on-demand", freshness: "request time; six-hour market cache", use: "Active listings, asking price/sf and rent evidence" },
    { id: "attom", mode: "live-on-demand", freshness: "provider vintage; 30-day property cache", use: "Independent AVM, assessment/tax, sales history, permits, equity and school context" },
  ],
  enforcedControls: [
    "Assessments enter historical tests only when their source effective date precedes the sale, and calibration uses earlier eligible sales",
    "Only earlier comparable sales enter each rolling-origin valuation test",
    "Evidence quality shrinks scores toward neutral and never earns investment points",
    "ATTOM is capped at 15% secondary weight and disagreement reduces confidence",
    "Compromised regions remain visible for diagnosis but are gated from equal-confidence use",
  ],
};

await writeFile(new URL("../data/model-quality-scorecard.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`Wrote model-quality-scorecard.json for ${liveMarkets.length} live valuation markets\n`);
