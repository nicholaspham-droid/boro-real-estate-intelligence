import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";

const MEMBERSHIP_PATH = new URL("../../data/acs-cluster-membership.json", import.meta.url);
const OUTPUT_PATH = new URL("../../data/fhfa-cluster-pricing-history.json", import.meta.url);
const SOURCE = "https://www.fhfa.gov/hpi/download/annual/hpi_at_tract.csv";
const membership = JSON.parse(await readFile(MEMBERSHIP_PATH, "utf8"));

function round(value, places = 2) {
  const power = 10 ** places;
  return Math.round(value * power) / power;
}

function percentile(values, value) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length || !Number.isFinite(value)) return 50;
  return Math.round(finite.filter((item) => item <= value).length / finite.length * 100);
}

function metricChange(history, years) {
  const latest = history.at(-1);
  const prior = history.find((item) => item.year === latest.year - years);
  return prior ? (latest.index / prior.index - 1) * 100 : null;
}

async function openLines() {
  const localPath = process.env.BOROCAST_FHFA_TRACT_CSV;
  if (localPath) return createInterface({ input: createReadStream(localPath), crlfDelay: Infinity });
  const response = await fetch(SOURCE, { headers: { "User-Agent": "Borocast public market-intelligence pipeline" } });
  if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}: ${SOURCE}`);
  return createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity });
}

const targetTracts = new Map();
const clusterMeta = new Map();
let targetTractCount = 0;
for (const market of membership.markets) {
  for (const cluster of market.clusters) {
    const totalPopulation = cluster.tracts.reduce((sum, tract) => sum + tract.population, 0);
    clusterMeta.set(cluster.id, { marketId: market.id, id: cluster.id, name: cluster.name, totalPopulation, totalTractCount: cluster.tracts.length });
    for (const tract of cluster.tracts) {
      targetTractCount += 1;
      if (!targetTracts.has(tract.geoid)) targetTracts.set(tract.geoid, []);
      targetTracts.get(tract.geoid).push({ clusterId: cluster.id, population: tract.population });
    }
  }
}

const tractHistory = new Map();
const lines = await openLines();
let sourceRows = 0;
for await (const line of lines) {
  if (!/^\d{11},/.test(line)) continue;
  sourceRows += 1;
  const [geoid, , yearText, , hpiText] = line.split(",");
  const targets = targetTracts.get(geoid);
  if (!targets) continue;
  const year = Number(yearText);
  const hpi = Number(hpiText);
  if (!Number.isFinite(year) || !Number.isFinite(hpi) || hpi <= 0) continue;
  if (!tractHistory.has(geoid)) tractHistory.set(geoid, new Map());
  tractHistory.get(geoid).set(year, hpi);
}

const clusterAnnualChanges = new Map([...clusterMeta.keys()].map((id) => [id, new Map()]));
for (const [geoid, years] of tractHistory) {
  const targets = targetTracts.get(geoid);
  const orderedYears = [...years.keys()].sort((a, b) => a - b);
  for (const target of targets) {
    for (const year of orderedYears) {
      const current = years.get(year);
      const prior = years.get(year - 1);
      if (!prior) continue;
      const change = (current / prior - 1) * 100;
      if (!Number.isFinite(change) || Math.abs(change) > 75) continue;
      const annual = clusterAnnualChanges.get(target.clusterId);
      if (!annual.has(year)) annual.set(year, []);
      annual.get(year).push({ change, population: target.population, geoid });
    }
  }
}

const clusters = [];
for (const meta of clusterMeta.values()) {
  const annual = clusterAnnualChanges.get(meta.id);
  const annualRows = [...annual.entries()].sort(([a], [b]) => a - b).map(([year, rows]) => {
    const coveredPopulation = rows.reduce((sum, row) => sum + row.population, 0);
    const weightedChange = rows.reduce((sum, row) => sum + row.change * row.population, 0) / coveredPopulation;
    return {
      year,
      yoy: round(weightedChange),
      coveragePct: round(coveredPopulation / meta.totalPopulation * 100, 1),
      tractCoveragePct: round(new Set(rows.map((row) => row.geoid)).size / meta.totalTractCount * 100, 1),
      observedTracts: new Set(rows.map((row) => row.geoid)).size,
    };
  }).filter((row) => row.observedTracts >= 3);

  const latest = annualRows.at(-1);
  if (!latest) continue;
  let index = 100;
  let priorYear = annualRows[0].year - 1;
  const history = [{ year: priorYear, index, yoy: null, coveragePct: null, tractCoveragePct: null, observedTracts: null }];
  for (const row of annualRows) {
    if (row.year !== priorYear + 1) {
      index = 100;
      history.length = 0;
      history.push({ year: row.year - 1, index, yoy: null, coveragePct: null, tractCoveragePct: null, observedTracts: null });
    }
    index *= 1 + row.yoy / 100;
    history.push({ ...row, index: round(index) });
    priorYear = row.year;
  }

  const base = history.find((row) => row.year === 2000)?.index ?? history[0].index;
  for (const row of history) row.index = round(row.index / base * 100);
  const latestHistory = history.at(-1);
  const previous = history.at(-2);
  const threeYearGrowth = metricChange(history, 3);
  const fiveYearGrowth = metricChange(history, 5);
  const tenYearGrowth = metricChange(history, 10);
  const recentYears = new Set(history.filter((row) => row.year > latestHistory.year - 10 && row.yoy !== null).map((row) => row.year));
  clusters.push({
    ...meta,
    latestYear: latestHistory.year,
    latestIndex: latestHistory.index,
    yoy: latestHistory.yoy,
    priorYoy: previous?.yoy ?? null,
    acceleration: previous?.yoy === null || previous?.yoy === undefined ? null : round(latestHistory.yoy - previous.yoy),
    threeYearCagr: threeYearGrowth === null ? null : round((Math.pow(1 + threeYearGrowth / 100, 1 / 3) - 1) * 100),
    fiveYearGrowth: fiveYearGrowth === null ? null : round(fiveYearGrowth),
    tenYearGrowth: tenYearGrowth === null ? null : round(tenYearGrowth),
    pricingCompetency: Math.round(latestHistory.coveragePct * .7 + recentYears.size / 10 * 100 * .3),
    seriesStart: history[0].year,
    history,
  });
}

const dimensions = {
  yoy: clusters.map((cluster) => cluster.yoy),
  threeYearCagr: clusters.map((cluster) => cluster.threeYearCagr),
  fiveYearGrowth: clusters.map((cluster) => cluster.fiveYearGrowth),
  acceleration: clusters.map((cluster) => cluster.acceleration),
};
for (const cluster of clusters) {
  cluster.momentumScore = Math.round(
    percentile(dimensions.yoy, cluster.yoy) * .5 +
    percentile(dimensions.threeYearCagr, cluster.threeYearCagr) * .25 +
    percentile(dimensions.fiveYearGrowth, cluster.fiveYearGrowth) * .15 +
    percentile(dimensions.acceleration, cluster.acceleration) * .1,
  );
}

const markets = membership.markets.map((market) => {
  const marketClusters = clusters.filter((cluster) => cluster.marketId === market.id);
  return {
    id: market.id,
    localPricingCompetency: Math.round(marketClusters.reduce((sum, cluster) => sum + cluster.pricingCompetency, 0) / Math.max(1, marketClusters.length)),
    clusters: marketClusters,
  };
});

await writeFile(OUTPUT_PATH, JSON.stringify({
  retrievedAt: new Date().toISOString(),
  source: SOURCE,
  sourceLabel: "FHFA Annual Census Tract House Price Index (developmental, not seasonally adjusted)",
  vintage: membership.vintage,
  latestYear: Math.max(...clusters.map((cluster) => cluster.latestYear)),
  marketCount: markets.length,
  clusterCount: clusters.length,
  targetTractCount,
  uniqueTargetTractCount: targetTracts.size,
  matchedTractCount: tractHistory.size,
  sourceRows,
  methodology: {
    geography: "Exact census tracts are joined to the same directional clusters used by the ACS map",
    aggregation: "Population-weighted mean of observed tract-level annual HPI changes, chained into a cluster index and rebased to 2000=100 when available",
    momentumScore: "50% latest YoY percentile, 25% three-year CAGR percentile, 15% five-year growth percentile, 10% YoY acceleration percentile",
    competency: "70% latest population coverage plus 30% completeness across the latest ten annual observations",
    limitation: "FHFA tract HPI is developmental and available only where repeat mortgage transactions support an index; coverage is shown for every cluster",
  },
  markets,
}, null, 2) + "\n");

process.stdout.write(`Matched ${tractHistory.size}/${targetTracts.size} unique tracts; wrote ${clusters.length} cluster histories through ${Math.max(...clusters.map((cluster) => cluster.latestYear))}\n`);
