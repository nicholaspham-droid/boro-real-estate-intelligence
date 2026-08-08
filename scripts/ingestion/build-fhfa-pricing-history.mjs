import { readFile, writeFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../../data/fhfa-market-mappings.json", import.meta.url);
const OUTPUT_PATH = new URL("../../data/fhfa-pricing-history.json", import.meta.url);
const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));

function round(value, places = 2) {
  const power = 10 ** places;
  return Math.round(value * power) / power;
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function change(current, prior) {
  return current && prior ? (current / prior - 1) * 100 : null;
}

function percentile(values, value) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length || !Number.isFinite(value)) return 50;
  return Math.round(finite.filter((item) => item <= value).length / finite.length * 100);
}

async function fetchText(url, attempt = 1) {
  const response = await fetch(url, { headers: { "User-Agent": "Borocast public market-intelligence pipeline" } });
  if (response.ok) return response.text();
  if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    return fetchText(url, attempt + 1);
  }
  throw new Error(`${response.status} ${response.statusText}: ${url}`);
}

const csv = await fetchText(config.source);
const codeRows = new Map();
for (const line of csv.split(/\r?\n/)) {
  const match = line.match(/^"([^"]+)",(\d+),(\d+),(\d+),([^,]+),(.+)$/);
  if (!match) continue;
  const [, name, codeText, yearText, quarterText, indexText, errorText] = match;
  const index = Number(indexText);
  if (!Number.isFinite(index)) continue;
  const code = Number(codeText);
  const row = {
    name,
    code,
    year: Number(yearText),
    quarter: Number(quarterText),
    period: `${yearText}Q${quarterText}`,
    index,
    standardError: Number(errorText.replace(/[()\s]/g, "")),
  };
  if (!codeRows.has(code)) codeRows.set(code, []);
  codeRows.get(code).push(row);
}

const markets = config.markets.map((market) => {
  for (const component of market.components) {
    if (!codeRows.has(component.code)) throw new Error(`Missing FHFA series ${component.code} for ${market.label}`);
  }
  const periods = new Map();
  for (const component of market.components) {
    for (const row of codeRows.get(component.code)) {
      const key = row.year * 4 + row.quarter;
      if (!periods.has(key)) periods.set(key, []);
      periods.get(key).push(row);
    }
  }
  const fullSeries = [...periods.entries()].sort(([a], [b]) => a - b).map(([, rows]) => ({
    period: rows[0].period,
    year: rows[0].year,
    quarter: rows[0].quarter,
    index: round(mean(rows.map((row) => row.index))),
    standardError: round(mean(rows.map((row) => row.standardError))),
    componentCoverage: round(rows.length / market.components.length * 100, 0),
  }));
  const latest = fullSeries.at(-1);
  const byPeriod = new Map(fullSeries.map((row) => [row.period, row]));
  const oneYear = byPeriod.get(`${latest.year - 1}Q${latest.quarter}`);
  const threeYear = byPeriod.get(`${latest.year - 3}Q${latest.quarter}`);
  const fiveYear = byPeriod.get(`${latest.year - 5}Q${latest.quarter}`);
  const priorYearCurrent = byPeriod.get(`${latest.year - 1}Q${latest.quarter}`);
  const priorYearBase = byPeriod.get(`${latest.year - 2}Q${latest.quarter}`);
  const yoy = change(latest.index, oneYear?.index);
  const priorYoy = change(priorYearCurrent?.index, priorYearBase?.index);
  const threeYearCagr = threeYear ? (Math.pow(latest.index / threeYear.index, 1 / 3) - 1) * 100 : null;
  const fiveYearGrowth = change(latest.index, fiveYear?.index);
  const standardErrorPct = latest.standardError / latest.index * 100;
  return {
    id: market.id,
    label: market.label,
    components: market.components,
    latestPeriod: latest.period,
    latestIndex: latest.index,
    yoy: round(yoy),
    priorYoy: round(priorYoy),
    acceleration: round(yoy - priorYoy),
    threeYearCagr: round(threeYearCagr),
    fiveYearGrowth: round(fiveYearGrowth),
    componentCoverage: latest.componentCoverage,
    standardErrorPct: round(standardErrorPct),
    pricingCompetency: Math.round(latest.componentCoverage * .7 + Math.max(0, 100 - standardErrorPct * 8) * .3),
    seriesStart: fullSeries[0].period,
    history: fullSeries,
  };
});

const dimensions = {
  yoy: markets.map((market) => market.yoy),
  threeYearCagr: markets.map((market) => market.threeYearCagr),
  fiveYearGrowth: markets.map((market) => market.fiveYearGrowth),
  acceleration: markets.map((market) => market.acceleration),
};

for (const market of markets) {
  market.momentumScore = Math.round(
    percentile(dimensions.yoy, market.yoy) * .5 +
    percentile(dimensions.threeYearCagr, market.threeYearCagr) * .25 +
    percentile(dimensions.fiveYearGrowth, market.fiveYearGrowth) * .15 +
    percentile(dimensions.acceleration, market.acceleration) * .1,
  );
}

await writeFile(OUTPUT_PATH, JSON.stringify({
  retrievedAt: new Date().toISOString(),
  source: config.source,
  sourceLabel: config.index,
  aggregation: config.aggregation,
  methodology: {
    yoy: "Latest quarter divided by the same quarter one year earlier, minus one",
    momentumScore: "50% latest YoY percentile, 25% three-year CAGR percentile, 15% five-year growth percentile, 10% YoY acceleration percentile",
    scope: "Metro-level quarterly benchmark retained alongside the annual tract-cluster series",
  },
  latestPeriod: markets[0].latestPeriod,
  marketCount: markets.length,
  markets,
}, null, 2) + "\n");

process.stdout.write(`Wrote ${markets.length} FHFA market histories through ${markets[0].latestPeriod}\n`);
