import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);
const CONFIG_PATH = new URL("../../data/market-geographies.json", import.meta.url);
const OUTPUT_PATH = new URL("../../data/acs-market-aggregations.json", import.meta.url);
const MEMBERSHIP_PATH = new URL("../../data/acs-cluster-membership.json", import.meta.url);
const TABLES = ["B01003", "B01002", "B15003", "B23025", "B19013", "B17001", "B25002", "B25077", "B25064"];

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const now = new Date().toISOString();

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > -666666000 ? number : null;
}

function sum(values) {
  return values.reduce((total, value) => total + (finite(value) ?? 0), 0);
}

function rss(values) {
  return Math.sqrt(values.reduce((total, value) => total + Math.pow(finite(value) ?? 0, 2), 0));
}

function weightedMedian(items, field, weightField = "population") {
  const values = items
    .map((item) => ({ value: finite(item[field]), weight: Math.max(1, finite(item[weightField]) ?? 1) }))
    .filter((item) => item.value !== null)
    .sort((a, b) => a.value - b.value);
  const total = sum(values.map((item) => item.weight));
  let cursor = 0;
  for (const item of values) {
    cursor += item.weight;
    if (cursor >= total / 2) return item.value;
  }
  return null;
}

function weightedMean(items, field, weightField = "population") {
  const values = items
    .map((item) => ({ value: finite(item[field]), weight: Math.max(1, finite(item[weightField]) ?? 1) }))
    .filter((item) => item.value !== null);
  const total = sum(values.map((item) => item.weight));
  return total ? values.reduce((acc, item) => acc + item.value * item.weight, 0) / total : null;
}

function extentCenter(geometry) {
  const points = geometry?.rings?.flat() ?? [];
  if (!points.length) return null;
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
}

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, { headers: { "User-Agent": "Borocast data pipeline (public ACS aggregation)" } });
  if (response.ok) return response.json();
  if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    return fetchJson(url, attempt + 1);
  }
  throw new Error(`${response.status} ${response.statusText}: ${url}`);
}

async function fetchCounty(marketId, state, county) {
  const parent = `05000US${state}${county}`;
  const dataUrl = `https://api.censusreporter.org/1.0/data/show/${config.release}?table_ids=${TABLES.join(",")}&geo_ids=140%7C${parent}`;
  const where = encodeURIComponent(`STATE='${state}' AND COUNTY='${county}'`);
  const geometryUrl = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/7/query?where=${where}&outFields=GEOID,BASENAME,STATE,COUNTY&returnGeometry=true&outSR=4326&f=json&geometryPrecision=4&maxAllowableOffset=0.002`;
  const [dataResponse, geometryResponse] = await Promise.all([fetchJson(dataUrl), fetchJson(geometryUrl)]);
  if (geometryResponse.error) throw new Error(`TIGERweb ${marketId} ${state}${county}: ${geometryResponse.error.message}`);
  const geometry = new Map((geometryResponse.features ?? []).map((feature) => [feature.attributes.GEOID, extentCenter(feature.geometry)]));
  const tracts = [];

  for (const [fullGeoid, tables] of Object.entries(dataResponse.data ?? {})) {
    const geoid = fullGeoid.replace(/^14000US/, "");
    const point = geometry.get(geoid);
    if (!point) continue;
    const estimates = Object.fromEntries(Object.entries(tables).map(([table, values]) => [table, values.estimate]));
    const errors = Object.fromEntries(Object.entries(tables).map(([table, values]) => [table, values.error]));
    const population = finite(estimates.B01003?.B01003001);
    if (!population || population < 100) continue;
    const adult25 = finite(estimates.B15003?.B15003001);
    const bachelors = sum([estimates.B15003?.B15003022, estimates.B15003?.B15003023, estimates.B15003?.B15003024, estimates.B15003?.B15003025]);
    const laborForce = finite(estimates.B23025?.B23025003);
    const unemployed = finite(estimates.B23025?.B23025005);
    const povertyUniverse = finite(estimates.B17001?.B17001001);
    const povertyCount = finite(estimates.B17001?.B17001002);
    const housingUnits = finite(estimates.B25002?.B25002001);
    const vacantUnits = finite(estimates.B25002?.B25002003);
    const relativeErrors = [
      [errors.B01003?.B01003001, population],
      [errors.B19013?.B19013001, estimates.B19013?.B19013001],
      [rss([errors.B15003?.B15003022, errors.B15003?.B15003023, errors.B15003?.B15003024, errors.B15003?.B15003025]), bachelors],
      [errors.B25077?.B25077001, estimates.B25077?.B25077001],
      [errors.B25064?.B25064001, estimates.B25064?.B25064001],
    ].map(([error, estimate]) => estimate ? Math.min(1, Math.abs((finite(error) ?? 0) / finite(estimate))) : 1);
    tracts.push({
      geoid,
      name: dataResponse.geography?.[fullGeoid]?.name ?? `Census tract ${geoid.slice(-6)}`,
      ...point,
      population,
      medianAge: finite(estimates.B01002?.B01002001),
      bachelorsPct: adult25 ? bachelors / adult25 * 100 : null,
      unemploymentPct: laborForce ? unemployed / laborForce * 100 : null,
      medianIncome: finite(estimates.B19013?.B19013001),
      povertyPct: povertyUniverse ? povertyCount / povertyUniverse * 100 : null,
      vacancyPct: housingUnits ? vacantUnits / housingUnits * 100 : null,
      medianHomeValue: finite(estimates.B25077?.B25077001),
      medianRent: finite(estimates.B25064?.B25064001),
      reliability: Math.max(0, 100 - relativeErrors.reduce((a, b) => a + b, 0) / relativeErrors.length * 100),
    });
  }
  return tracts;
}

function sector(tract, center, centralRadius) {
  const latDistance = tract.lat - center.lat;
  const lngDistance = (tract.lng - center.lng) * Math.cos(center.lat * Math.PI / 180);
  const distance = Math.hypot(latDistance, lngDistance);
  if (distance <= centralRadius) return "central";
  if (Math.abs(latDistance) >= Math.abs(lngDistance)) return latDistance >= 0 ? "north" : "south";
  return lngDistance >= 0 ? "east" : "west";
}

function aggregateCluster(id, name, tracts) {
  const population = sum(tracts.map((tract) => tract.population));
  const validFields = ["medianAge", "bachelorsPct", "unemploymentPct", "medianIncome", "povertyPct", "vacancyPct", "medianHomeValue", "medianRent"];
  const completeness = validFields.reduce((total, field) => total + tracts.filter((tract) => finite(tract[field]) !== null).length / Math.max(1, tracts.length), 0) / validFields.length * 100;
  const reliability = weightedMean(tracts, "reliability") ?? 0;
  return {
    id,
    name,
    tractCount: tracts.length,
    population,
    lat: weightedMean(tracts, "lat") ?? 0,
    lng: weightedMean(tracts, "lng") ?? 0,
    medianAge: weightedMedian(tracts, "medianAge"),
    bachelorsPct: weightedMean(tracts, "bachelorsPct"),
    unemploymentPct: weightedMean(tracts, "unemploymentPct"),
    medianIncome: weightedMedian(tracts, "medianIncome"),
    povertyPct: weightedMean(tracts, "povertyPct"),
    vacancyPct: weightedMean(tracts, "vacancyPct"),
    medianHomeValue: weightedMedian(tracts, "medianHomeValue"),
    medianRent: weightedMedian(tracts, "medianRent"),
    coverage: Math.round(completeness),
    reliability: Math.round(reliability),
    sampleGeoids: tracts.slice(0, 4).map((tract) => tract.geoid),
  };
}

function percentile(values, value, invert = false) {
  const finiteValues = values.filter((item) => finite(item) !== null).sort((a, b) => a - b);
  if (!finiteValues.length || finite(value) === null) return 50;
  const rank = finiteValues.filter((item) => item <= value).length / finiteValues.length * 100;
  return Math.round(invert ? 100 - rank : rank);
}

const markets = [];
const memberships = [];
for (const market of config.markets) {
  process.stdout.write(`Aggregating ${market.label} (${market.counties.length} counties)\n`);
  const batches = [];
  for (let index = 0; index < market.counties.length; index += 4) {
    const chunk = market.counties.slice(index, index + 4);
    batches.push(...await Promise.all(chunk.map(([state, county]) => fetchCounty(market.id, state, county))));
  }
  const tracts = batches.flat();
  const distances = tracts.map((tract) => Math.hypot(tract.lat - market.center[0], (tract.lng - market.center[1]) * Math.cos(market.center[0] * Math.PI / 180))).sort((a, b) => a - b);
  const centralRadius = distances[Math.floor(distances.length * 0.28)] ?? 0.08;
  const sectors = [
    ["central", "Central Core"], ["north", "North Arc"], ["east", "East Corridor"], ["south", "South Arc"], ["west", "West Corridor"],
  ];
  const clusters = sectors.map(([key, name]) => aggregateCluster(`${market.id}-${key}`, name, tracts.filter((tract) => sector(tract, { lat: market.center[0], lng: market.center[1] }, centralRadius) === key))).filter((cluster) => cluster.tractCount);
  memberships.push({
    id: market.id,
    clusters: sectors.map(([key, name]) => ({
      id: `${market.id}-${key}`,
      name,
      tracts: tracts
        .filter((tract) => sector(tract, { lat: market.center[0], lng: market.center[1] }, centralRadius) === key)
        .map((tract) => ({ geoid: tract.geoid, population: tract.population })),
    })).filter((cluster) => cluster.tracts.length),
  });
  markets.push({ id: market.id, label: market.label, center: { lat: market.center[0], lng: market.center[1] }, zoom: market.zoom, countyCount: market.counties.length, tractCount: tracts.length, clusters });
}

const allClusters = markets.flatMap((market) => market.clusters);
const dimensions = {
  age: allClusters.map((cluster) => cluster.medianAge),
  education: allClusters.map((cluster) => cluster.bachelorsPct),
  unemployment: allClusters.map((cluster) => cluster.unemploymentPct),
  income: allClusters.map((cluster) => cluster.medianIncome),
  poverty: allClusters.map((cluster) => cluster.povertyPct),
  vacancy: allClusters.map((cluster) => cluster.vacancyPct),
  affordability: allClusters.map((cluster) => cluster.medianIncome && cluster.medianHomeValue ? cluster.medianIncome / cluster.medianHomeValue : null),
  rentCapacity: allClusters.map((cluster) => cluster.medianIncome && cluster.medianRent ? cluster.medianIncome / (cluster.medianRent * 12) : null),
};

for (const market of markets) {
  for (const cluster of market.clusters) {
    const age = percentile(dimensions.age, cluster.medianAge, true);
    const unemployment = percentile(dimensions.unemployment, cluster.unemploymentPct, true);
    const poverty = percentile(dimensions.poverty, cluster.povertyPct, true);
    const income = percentile(dimensions.income, cluster.medianIncome);
    const affordability = cluster.medianIncome && cluster.medianHomeValue ? cluster.medianIncome / cluster.medianHomeValue : null;
    const rentCapacity = cluster.medianIncome && cluster.medianRent ? cluster.medianIncome / (cluster.medianRent * 12) : null;
    cluster.factors = {
      demographic: age,
      economic: Math.round(income * 0.4 + unemployment * 0.3 + poverty * 0.3),
      education: percentile(dimensions.education, cluster.bachelorsPct),
      housing: Math.round(percentile(dimensions.affordability, affordability) * 0.55 + percentile(dimensions.rentCapacity, rentCapacity) * 0.3 + percentile(dimensions.vacancy, cluster.vacancyPct, true) * 0.15),
    };
    cluster.acsCompetency = Math.round(cluster.coverage * 0.65 + cluster.reliability * 0.35);
  }
  market.acsCompetency = Math.round(weightedMean(market.clusters, "acsCompetency") ?? 0);
  market.coverage = Math.round(weightedMean(market.clusters, "coverage") ?? 0);
  market.reliability = Math.round(weightedMean(market.clusters, "reliability") ?? 0);
}

await writeFile(OUTPUT_PATH, JSON.stringify({
  generatedAt: now,
  vintage: config.vintage,
  release: config.release,
  methodology: {
    geography: "Primary-county census tracts grouped into five reproducible directional market clusters",
    attributes: "2020-2024 ACS 5-year detailed tables mirrored by Census Reporter",
    geometry: "U.S. Census Bureau TIGERweb ACS 2024 Census Tracts",
    scoreScope: "Cross-sectional factor percentile, not a property-value forecast",
  },
  tables: TABLES,
  marketCount: markets.length,
  clusterCount: allClusters.length,
  markets,
}, null, 2) + "\n");

await writeFile(MEMBERSHIP_PATH, JSON.stringify({
  generatedAt: now,
  vintage: config.vintage,
  release: config.release,
  methodology: "Exact census-tract membership used by the published directional cluster aggregation",
  markets: memberships,
}, null, 2) + "\n");

process.stdout.write(`Wrote ${markets.length} markets and ${allClusters.length} clusters to ${OUTPUT_PATH.pathname.replace(ROOT.pathname, "")}\n`);
