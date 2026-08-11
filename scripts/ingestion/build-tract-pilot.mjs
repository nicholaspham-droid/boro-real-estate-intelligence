import { mkdir, readFile, writeFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../../data/market-geographies.json", import.meta.url);
const CLUSTERS_PATH = new URL("../../data/acs-market-aggregations.json", import.meta.url);
const PRICING_PATH = new URL("../../data/fhfa-cluster-pricing-history.json", import.meta.url);
const OUTPUT_DIR = new URL("../../public/data/tract-pilot/", import.meta.url);
const PILOT_MARKETS = new Set(["new-york", "raleigh"]);

const TABLES = ["B01003", "B01002", "B15003", "B23025", "B19013", "B17001", "B25002", "B25003", "B25077", "B25064"];

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const clusterData = JSON.parse(await readFile(CLUSTERS_PATH, "utf8"));
const pricingData = JSON.parse(await readFile(PRICING_PATH, "utf8"));

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

function extentCenter(geometry) {
  const points = geometry?.rings?.flat() ?? [];
  if (!points.length) return null;
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
}

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, { headers: { "User-Agent": "BORO tract pilot (public Census data)" } });
  if (response.ok) return response.json();
  if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    return fetchJson(url, attempt + 1);
  }
  throw new Error(`${response.status} ${response.statusText}: ${url}`);
}

async function fetchCounty(state, county) {
  const parent = `05000US${state}${county}`;
  const dataUrl = `https://api.censusreporter.org/1.0/data/show/${config.release}?table_ids=${TABLES.join(",")}&geo_ids=140%7C${parent}`;
  const where = encodeURIComponent(`STATE='${state}' AND COUNTY='${county}'`);
  const geometryUrl = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/7/query?where=${where}&outFields=GEOID&returnGeometry=true&outSR=4326&f=json&geometryPrecision=4&maxAllowableOffset=0.002`;
  const [dataResponse, geometryResponse] = await Promise.all([fetchJson(dataUrl), fetchJson(geometryUrl)]);
  if (geometryResponse.error) throw new Error(`TIGERweb ${state}${county}: ${geometryResponse.error.message}`);
  const geometry = new Map((geometryResponse.features ?? []).map((feature) => [feature.attributes.GEOID, extentCenter(feature.geometry)]));
  return Object.entries(dataResponse.data ?? {}).flatMap(([fullGeoid, tables]) => {
    const geoid = fullGeoid.replace(/^14000US/, "");
    const point = geometry.get(geoid);
    const estimates = Object.fromEntries(Object.entries(tables).map(([table, values]) => [table, values.estimate]));
    const errors = Object.fromEntries(Object.entries(tables).map(([table, values]) => [table, values.error]));
    const population = finite(estimates.B01003?.B01003001);
    if (!point || !population || population < 100) return [];
    const adult25 = finite(estimates.B15003?.B15003001);
    const bachelors = sum([estimates.B15003?.B15003022, estimates.B15003?.B15003023, estimates.B15003?.B15003024, estimates.B15003?.B15003025]);
    const laborForce = finite(estimates.B23025?.B23025003);
    const unemployed = finite(estimates.B23025?.B23025005);
    const povertyUniverse = finite(estimates.B17001?.B17001001);
    const povertyCount = finite(estimates.B17001?.B17001002);
    const housingUnits = finite(estimates.B25002?.B25002001);
    const vacantUnits = finite(estimates.B25002?.B25002003);
    const reliabilityPairs = [
      [errors.B01003?.B01003001, population],
      [errors.B19013?.B19013001, estimates.B19013?.B19013001],
      [rss([errors.B15003?.B15003022, errors.B15003?.B15003023, errors.B15003?.B15003024, errors.B15003?.B15003025]), bachelors],
      [errors.B25077?.B25077001, estimates.B25077?.B25077001],
      [errors.B25064?.B25064001, estimates.B25064?.B25064001],
    ];
    const relativeErrors = reliabilityPairs.map(([error, estimate]) => estimate ? Math.min(1, Math.abs((error ?? 0) / estimate)) : 1);
    return [{
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
      renterOccupiedUnits: finite(estimates.B25003?.B25003003),
      medianHomeValue: finite(estimates.B25077?.B25077001),
      medianRent: finite(estimates.B25064?.B25064001),
      reliability: Math.round(Math.max(0, 100 - relativeErrors.reduce((a, b) => a + b, 0) / relativeErrors.length * 100)),
    }];
  });
}

function percentile(values, value, invert = false) {
  const usable = values.filter((item) => finite(item) !== null).sort((a, b) => a - b);
  if (!usable.length || finite(value) === null) return 50;
  const rank = usable.filter((item) => item <= value).length / usable.length * 100;
  return Math.round(invert ? 100 - rank : rank);
}

function clusterFor(tract, market, centralRadius) {
  const latDistance = tract.lat - market.center[0];
  const lngDistance = (tract.lng - market.center[1]) * Math.cos(market.center[0] * Math.PI / 180);
  if (Math.hypot(latDistance, lngDistance) <= centralRadius) return `${market.id}-central`;
  if (Math.abs(latDistance) >= Math.abs(lngDistance)) return `${market.id}-${latDistance >= 0 ? "north" : "south"}`;
  return `${market.id}-${lngDistance >= 0 ? "east" : "west"}`;
}

await mkdir(OUTPUT_DIR, { recursive: true });
for (const market of config.markets.filter((item) => PILOT_MARKETS.has(item.id))) {
  process.stdout.write(`Building tract pilot for ${market.label}\n`);
  const countyRows = [];
  for (let index = 0; index < market.counties.length; index += 4) {
    countyRows.push(...await Promise.all(market.counties.slice(index, index + 4).map(([state, county]) => fetchCounty(state, county))));
  }
  const tracts = countyRows.flat();
  const distances = tracts.map((tract) => Math.hypot(tract.lat - market.center[0], (tract.lng - market.center[1]) * Math.cos(market.center[0] * Math.PI / 180))).sort((a, b) => a - b);
  const centralRadius = distances[Math.floor(distances.length * .28)] ?? .08;
  const dimensions = {
    age: tracts.map((tract) => tract.medianAge),
    education: tracts.map((tract) => tract.bachelorsPct),
    unemployment: tracts.map((tract) => tract.unemploymentPct),
    income: tracts.map((tract) => tract.medianIncome),
    poverty: tracts.map((tract) => tract.povertyPct),
    vacancy: tracts.map((tract) => tract.vacancyPct),
    affordability: tracts.map((tract) => tract.medianIncome && tract.medianHomeValue ? tract.medianIncome / tract.medianHomeValue : null),
    rentCapacity: tracts.map((tract) => tract.medianIncome && tract.medianRent ? tract.medianIncome / (tract.medianRent * 12) : null),
  };
  const aggregateMarket = clusterData.markets.find((item) => item.id === market.id);
  const pricingMarket = pricingData.markets.find((item) => item.id === market.id);
  const records = tracts.map((tract) => {
    const clusterId = clusterFor(tract, market, centralRadius);
    const cluster = aggregateMarket?.clusters.find((item) => item.id === clusterId);
    const clusterPricing = pricingMarket?.clusters.find((item) => item.id === clusterId);
    const fields = [tract.medianAge, tract.bachelorsPct, tract.unemploymentPct, tract.medianIncome, tract.povertyPct, tract.vacancyPct, tract.medianHomeValue, tract.medianRent];
    const coverage = Math.round(fields.filter((value) => finite(value) !== null).length / fields.length * 100);
    const acsCompetency = Math.round(coverage * .65 + tract.reliability * .35);
    const income = percentile(dimensions.income, tract.medianIncome);
    const unemployment = percentile(dimensions.unemployment, tract.unemploymentPct, true);
    const poverty = percentile(dimensions.poverty, tract.povertyPct, true);
    const affordability = tract.medianIncome && tract.medianHomeValue ? tract.medianIncome / tract.medianHomeValue : null;
    const rentCapacity = tract.medianIncome && tract.medianRent ? tract.medianIncome / (tract.medianRent * 12) : null;
    return {
      ...tract,
      clusterId,
      clusterName: cluster?.name ?? clusterId,
      demographic: percentile(dimensions.age, tract.medianAge, true),
      economic: Math.round(income * .4 + unemployment * .3 + poverty * .3),
      education: percentile(dimensions.education, tract.bachelorsPct),
      housing: Math.round(percentile(dimensions.affordability, affordability) * .55 + percentile(dimensions.rentCapacity, rentCapacity) * .3 + percentile(dimensions.vacancy, tract.vacancyPct, true) * .15),
      pricing: clusterPricing?.momentumScore ?? 50,
      coverage,
      acsCompetency,
      pricingCompetency: clusterPricing?.pricingCompetency ?? 0,
      priceScope: clusterPricing ? "cluster benchmark" : "metro context unavailable",
    };
  });
  await writeFile(new URL(`${market.id}.json`, OUTPUT_DIR), JSON.stringify({
    generatedAt: new Date().toISOString(),
    marketId: market.id,
    label: market.label,
    vintage: "2024",
    source: "https://censusreporter.org/",
    underlyingSource: "U.S. Census Bureau 2020–2024 ACS 5-year detailed tables",
    geometrySource: "https://tigerweb.geo.census.gov/",
    methodology: "Pilot tract observations retain official ACS estimates and margins of error. Factor percentiles are market-relative. Pricing remains the selected cluster's FHFA benchmark until a qualified tract series is available.",
    tractCount: records.length,
    tracts: records,
  }, null, 2) + "\n");
  process.stdout.write(`Wrote ${records.length} ${market.label} tract records\n`);
}
