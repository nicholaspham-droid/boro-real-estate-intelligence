import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);
const OUTPUT = new URL("../../data/property-valuations.json", import.meta.url);
const membership = JSON.parse(await readFile(new URL("../../data/acs-cluster-membership.json", import.meta.url), "utf8"));
const acs = JSON.parse(await readFile(new URL("../../data/acs-market-aggregations.json", import.meta.url), "utf8"));
const pricing = JSON.parse(await readFile(new URL("../../data/fhfa-cluster-pricing-history.json", import.meta.url), "utf8"));

const TODAY = new Date("2026-08-07T00:00:00Z");
const round = (value, digits = 0) => {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
};
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function centroid(rings) {
  const points = rings?.flat() ?? [];
  if (!points.length) return { lat: null, lng: null };
  return {
    lng: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    lat: points.reduce((sum, point) => sum + point[1], 0) / points.length,
  };
}

async function fetchJson(url, options, attempt = 1) {
  const response = await fetch(url, { ...options, headers: { "User-Agent": "Borocast public property evidence pipeline" } });
  if (response.ok) return response.json();
  if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 650));
    return fetchJson(url, options, attempt + 1);
  }
  throw new Error(`${response.status} ${response.statusText}: ${url}`);
}

async function socrata(id, params) {
  const url = new URL(`https://datacatalog.cookcountyil.gov/resource/${id}.json`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetchJson(url);
}

function inClause(field, values) {
  return `${field} in (${values.map((value) => `'${String(value).replaceAll("'", "''")}'`).join(",")})`;
}

function latestByPin(rows) {
  const out = new Map();
  for (const row of rows.sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0))) {
    if (!out.has(row.pin)) out.set(row.pin, row);
  }
  return out;
}

async function fetchCookCounty() {
  const west = membership.markets.find((market) => market.id === "chicago").clusters.find((cluster) => cluster.id === "chicago-west");
  const tracts = west.tracts.map((tract) => tract.geoid).filter((geoid) => geoid.startsWith("17031"));
  const universe = [];
  for (let index = 0; index < Math.min(tracts.length, 180); index += 20) {
    universe.push(...await socrata("pabr-t5kh", {
      "$select": "pin,class,zip_code,lon,lat,census_tract_geoid",
      "$where": `year=2026 AND class like '2%' AND ${inClause("census_tract_geoid", tracts.slice(index, index + 20))}`,
      "$limit": "400",
    }));
  }
  const pins = [...new Set(universe.map((row) => row.pin))];
  const sales = [];
  for (let index = 0; index < pins.length; index += 120) {
    sales.push(...await socrata("wvhk-k5uv", {
      "$select": "pin,year,sale_date,sale_price,deed_type",
      "$where": `${inClause("pin", pins.slice(index, index + 120))} AND year >= 2023 AND sale_price between 75000 and 3000000 AND is_multisale=false AND sale_filter_same_sale_within_365=false AND sale_filter_less_than_10k=false AND sale_filter_deed_type=false`,
      "$order": "sale_date DESC",
      "$limit": "5000",
    }));
  }
  const recentSales = [...latestByPin(sales).values()].slice(0, 90);
  const selectedPins = recentSales.map((row) => row.pin);
  const characteristics = [];
  const assessed = [];
  const addresses = [];
  for (let index = 0; index < selectedPins.length; index += 120) {
    const where = inClause("pin", selectedPins.slice(index, index + 120));
    const [chars, values, props] = await Promise.all([
      socrata("x54s-btds", { "$select": "pin,year,char_yrblt,char_bldg_sf,char_land_sf,char_beds,char_rooms,char_fbath,char_hbath,char_type_resd,char_use", "$where": where, "$order": "year DESC", "$limit": "5000" }),
      socrata("uzyt-m557", { "$select": "pin,year,board_tot,certified_tot,mailed_tot", "$where": where, "$order": "year DESC", "$limit": "5000" }),
      socrata("3723-97qp", { "$select": "pin,year,prop_address_full,prop_address_city_name,prop_address_state,prop_address_zipcode_1", "$where": where, "$order": "year DESC", "$limit": "5000" }),
    ]);
    characteristics.push(...chars);
    assessed.push(...values);
    addresses.push(...props);
  }
  const byUniverse = new Map(universe.map((row) => [row.pin, row]));
  const byCharacteristics = latestByPin(characteristics);
  const byAssessed = latestByPin(assessed);
  const byAddress = latestByPin(addresses);
  return recentSales.map((sale) => {
    const geo = byUniverse.get(sale.pin) ?? {};
    const detail = byCharacteristics.get(sale.pin) ?? {};
    const value = byAssessed.get(sale.pin) ?? {};
    const address = byAddress.get(sale.pin) ?? {};
    return {
      id: `cook-${sale.pin}`,
      marketId: "chicago",
      clusterId: "chicago-west",
      sourceId: "cook-county",
      sourceLabel: "Cook County Assessor",
      sourceUrl: "https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Sales/wvhk-k5uv",
      parcelId: sale.pin,
      address: address.prop_address_full || `Parcel ${sale.pin}`,
      locality: [address.prop_address_city_name, address.prop_address_state || "IL", address.prop_address_zipcode_1 || geo.zip_code].filter(Boolean).join(", "),
      zip: address.prop_address_zipcode_1 || geo.zip_code || null,
      lat: finite(geo.lat), lng: finite(geo.lon),
      propertyType: detail.char_use || detail.char_type_resd || `Class ${geo.class}`,
      yearBuilt: finite(detail.char_yrblt), sqft: finite(detail.char_bldg_sf), lotSqft: finite(detail.char_land_sf),
      beds: finite(detail.char_beds), baths: (finite(detail.char_fbath) ?? 0) + (finite(detail.char_hbath) ?? 0) * 0.5,
      saleDate: sale.sale_date.slice(0, 10), salePrice: finite(sale.sale_price),
      assessedValue: (finite(value.board_tot) ?? finite(value.certified_tot) ?? finite(value.mailed_tot)) * 10,
      qualification: `County sale filters passed · ${sale.deed_type || "recorded deed"} · residential assessment converted from Cook County's 10% level`,
    };
  }).filter((row) => row.sqft && row.assessedValue && row.lat && row.lng);
}

async function fetchPhiladelphia() {
  const sql = `select parcel_number,location,market_value,sale_date,sale_price,category_code_description,census_tract,number_of_bedrooms,number_of_bathrooms,total_livable_area,year_built,zip_code,st_x(the_geom) as lon,st_y(the_geom) as lat from opa_properties_public where sale_date >= '2023-01-01' and sale_date <= '2026-08-07' and sale_price between 75000 and 3000000 and market_value > 30000 and total_livable_area between 500 and 8000 and category_code_description in ('SINGLE FAMILY','ROW B/GARAGE','ROW CONV/APT','2 STY ROW','3 STY ROW','CONDO') and st_x(the_geom) < -75.20 order by sale_date desc limit 700`;
  const url = new URL("https://phl.carto.com/api/v2/sql");
  url.searchParams.set("q", sql);
  const payload = await fetchJson(url);
  return payload.rows.map((row) => ({
    id: `phl-${row.parcel_number}`,
    marketId: "philadelphia", clusterId: "philadelphia-west", sourceId: "philadelphia-opa", sourceLabel: "Philadelphia OPA",
    sourceUrl: "https://opendataphilly.org/datasets/opa-property-assessments/",
    parcelId: row.parcel_number, address: row.location, locality: `Philadelphia, PA ${row.zip_code || ""}`.trim(), zip: row.zip_code || null,
    lat: finite(row.lat), lng: finite(row.lon), propertyType: row.category_code_description || "Residential",
    yearBuilt: finite(row.year_built), sqft: finite(row.total_livable_area), lotSqft: null,
    beds: finite(row.number_of_bedrooms), baths: finite(row.number_of_bathrooms),
    saleDate: row.sale_date.slice(0, 10), salePrice: finite(row.sale_price), assessedValue: finite(row.market_value),
    qualification: "Residential OPA record · price, area and value sanity filters passed",
  })).filter((row) => {
    const latDelta = row.lat - 39.97;
    const lngDelta = (row.lng + 75.17) * Math.cos(39.97 * Math.PI / 180);
    return lngDelta < 0 && Math.abs(lngDelta) > Math.abs(latDelta) && row.salePrice / row.assessedValue > 0.35 && row.salePrice / row.assessedValue < 2.75;
  });
}

async function fetchWakeCounty() {
  const url = new URL("https://maps.wake.gov/arcgis/rest/services/Property/Parcels/MapServer/0/query");
  const params = {
    f: "json", where: "TOTSALPRICE BETWEEN 75000 AND 3000000 AND SALE_DATE IS NOT NULL AND HEATEDAREA BETWEEN 500 AND 8000 AND TOTAL_VALUE_ASSD > 30000 AND YEAR_BUILT > 1800",
    outFields: "REID,SITE_ADDRESS,CITY_DECODE,ZIPNUM,TOTSALPRICE,SALE_DATE,TOTAL_VALUE_ASSD,HEATEDAREA,YEAR_BUILT,TYPE_USE_DECODE",
    returnGeometry: "true", inSR: "4326", outSR: "4326", orderByFields: "SALE_DATE DESC", resultRecordCount: "1800",
    geometry: "-79.121,35.52,-78.70,36.08", geometryType: "esriGeometryEnvelope", spatialRel: "esriSpatialRelIntersects",
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const payload = await fetchJson(url);
  if (payload.error) throw new Error(`Wake County: ${payload.error.message}`);
  return payload.features.map((feature) => {
    const row = feature.attributes;
    const point = centroid(feature.geometry?.rings);
    return {
      id: `wake-${row.REID}`,
      marketId: "raleigh", clusterId: "raleigh-west", sourceId: "wake-county", sourceLabel: "Wake County GIS",
      sourceUrl: "https://data.wake.gov/datasets/Wake::parcels/about",
      parcelId: row.REID, address: row.SITE_ADDRESS, locality: `${row.CITY_DECODE || "Wake County"}, NC ${row.ZIPNUM || ""}`.trim(), zip: row.ZIPNUM || null,
      ...point, propertyType: row.TYPE_USE_DECODE || "Residential", yearBuilt: finite(row.YEAR_BUILT), sqft: finite(row.HEATEDAREA), lotSqft: null,
      beds: null, baths: null, saleDate: new Date(row.SALE_DATE).toISOString().slice(0, 10), salePrice: finite(row.TOTSALPRICE), assessedValue: finite(row.TOTAL_VALUE_ASSD),
      qualification: "Wake parcel record · price, area, use and value sanity filters passed",
    };
  }).filter((row) => {
    const latDelta = row.lat - 35.79;
    const lngDelta = (row.lng + 78.64) * Math.cos(35.79 * Math.PI / 180);
    const ratio = row.salePrice / row.assessedValue;
    return row.saleDate <= "2026-08-07" && lngDelta < -0.035 && Math.abs(lngDelta) > Math.abs(latDelta) && ratio > 0.35 && ratio < 2.75;
  });
}

function clusterMeta(clusterId) {
  const market = acs.markets.find((item) => item.clusters.some((cluster) => cluster.id === clusterId));
  const cluster = market.clusters.find((item) => item.id === clusterId);
  const price = pricing.markets.find((item) => item.id === market.id).clusters.find((item) => item.id === clusterId);
  const score = Math.round((cluster.factors.demographic + cluster.factors.economic + cluster.factors.education + cluster.factors.housing + price.momentumScore) / 5);
  return { market, cluster, price, score };
}

function hpiAdjustedSale(record, price) {
  const year = Math.min(price.latestYear, Number(record.saleDate.slice(0, 4)));
  const atSale = price.history.find((item) => item.year === year)?.index ?? price.latestIndex;
  return record.salePrice * price.latestIndex / atSale;
}

function modelMarket(records, clusterId) {
  const meta = clusterMeta(clusterId);
  const usable = records.filter((row) => row.salePrice && row.assessedValue && row.sqft && row.sqft > 0);
  const calibration = clamp(median(usable.map((row) => row.salePrice / row.assessedValue)) ?? 1, 0.65, 1.75);
  const marketPpsf = median(usable.map((row) => row.salePrice / row.sqft));
  return usable.map((record) => {
    const similar = usable.filter((candidate) => candidate.id !== record.id && candidate.sqft / record.sqft >= 0.72 && candidate.sqft / record.sqft <= 1.38 && (!record.zip || candidate.zip === record.zip));
    const broader = similar.length >= 3 ? similar : usable.filter((candidate) => candidate.id !== record.id && candidate.sqft / record.sqft >= 0.65 && candidate.sqft / record.sqft <= 1.55);
    const compPpsf = median(broader.map((candidate) => candidate.salePrice / candidate.sqft)) ?? marketPpsf;
    const saleAnchor = hpiAdjustedSale(record, meta.price);
    const assessmentAnchor = record.assessedValue * calibration;
    const compAnchor = record.sqft * compPpsf;
    const estimate = saleAnchor * 0.45 + assessmentAnchor * 0.25 + compAnchor * 0.30;
    const anchors = [saleAnchor, assessmentAnchor, compAnchor];
    const spread = Math.max(...anchors) - Math.min(...anchors);
    const ageMonths = Math.max(0, (TODAY - new Date(record.saleDate)) / (1000 * 60 * 60 * 24 * 30.44));
    const recency = clamp(16 - ageMonths / 3, 2, 16);
    const completeness = [record.sqft, record.yearBuilt, record.assessedValue, record.lat, record.lng, record.zip].filter(Boolean).length / 6;
    const agreement = clamp(12 - spread / estimate * 24, 0, 12);
    const confidence = clamp(Math.round(46 + recency + Math.min(10, broader.length * 1.5) + completeness * 8 + agreement + meta.price.pricingCompetency * 0.05), 45, 95);
    const margin = clamp(0.07 + spread / estimate * 0.4 + (100 - confidence) / 500, 0.09, 0.28);
    const valuationGapPct = (estimate / record.assessedValue - 1) * 100;
    const gapSignal = clamp(50 + valuationGapPct * 1.25, 0, 100);
    const liquidity = clamp(100 - ageMonths * 1.4, 20, 100);
    const watchScore = Math.round(meta.score * 0.45 + confidence * 0.25 + gapSignal * 0.20 + liquidity * 0.10);
    return {
      ...record,
      clusterName: `${meta.market.label} · ${meta.cluster.name}`,
      model: {
        value: round(estimate, -3), low: round(estimate * (1 - margin), -3), high: round(estimate * (1 + margin), -3), confidence,
        watchScore, valuationGapPct: round(valuationGapPct, 1), compCount: broader.length,
        anchors: { hpiAdjustedSale: round(saleAnchor, -3), assessmentCalibrated: round(assessmentAnchor, -3), comparablePpsf: round(compAnchor, -3) },
        calibrationRatio: round(calibration, 3), comparablePpsf: round(compPpsf, 0), clusterEdgeScore: meta.score,
      },
      listing: null,
      vendorEstimates: [],
    };
  }).sort((a, b) => b.model.watchScore - a.model.watchScore).slice(0, 18);
}

const raw = await Promise.all([fetchCookCounty(), fetchPhiladelphia(), fetchWakeCounty()]);
const properties = [
  ...modelMarket(raw[0], "chicago-west"),
  ...modelMarket(raw[1], "philadelphia-west"),
  ...modelMarket(raw[2], "raleigh-west"),
];

const output = {
  generatedAt: new Date().toISOString(),
  asOf: "2026-08-07",
  methodology: {
    label: "Public-record valuation watch model v1",
    value: "45% FHFA-adjusted recorded sale + 25% locally calibrated public assessment + 30% size-matched recorded-sale comps",
    range: "Anchor disagreement, evidence completeness and model confidence determine the displayed range",
    watchScore: "45% cluster edge + 25% valuation confidence + 20% assessment gap signal + 10% sale recency",
    boundary: "The assessment gap is not acquisition edge. A true price edge requires an asking price or licensed live listing joined to the record.",
  },
  markets: [
    { id: "chicago", clusterId: "chicago-west", label: "Chicago · West Corridor", status: "live", propertyCount: properties.filter((row) => row.marketId === "chicago").length, competency: 91 },
    { id: "philadelphia", clusterId: "philadelphia-west", label: "Philadelphia · West Corridor", status: "live", propertyCount: properties.filter((row) => row.marketId === "philadelphia").length, competency: 90 },
    { id: "raleigh", clusterId: "raleigh-west", label: "Raleigh · West Corridor", status: "live", propertyCount: properties.filter((row) => row.marketId === "raleigh").length, competency: 82 },
    { id: "northwest-arkansas", clusterId: "northwest-arkansas-north", label: "Northwest Arkansas · North Arc", status: "gap", propertyCount: 0, competency: 38, gap: "Parcel geometry is available, but a verified reusable county sale-price feed is not yet connected." },
  ],
  providers: [
    { id: "public-records", name: "County / city public records", layer: "Property fact", status: "connected", scope: "Recorded sale, assessment, parcel and building facts", independence: "Primary evidence", url: "/api/valuation/properties" },
    { id: "zillow-research", name: "Zillow Research", layer: "Market cross-check", status: "ready", scope: "ZHVI, inventory, sales and market heat by region/ZIP; not a property Zestimate feed", independence: "Aggregate benchmark", url: "https://www.zillow.com/research/data/" },
    { id: "realtor-research", name: "Realtor.com Research", layer: "Market cross-check", status: "ready", scope: "Inventory and listing-market metrics by metro, county and ZIP", independence: "Aggregate benchmark", url: "https://www.realtor.com/research/data/" },
    { id: "rentcast", name: "RentCast", layer: "Property AVM + listings", status: "api-key", scope: "Value/rent estimates, ranges, comps and active listings", independence: "Commercial cross-check", url: "https://www.rentcast.io/api" },
    { id: "attom", name: "ATTOM", layer: "Property AVM + deeds", status: "api-key", scope: "Property, sale history, AVM, assessment and comparable APIs", independence: "Commercial cross-check", url: "https://api.developer.attomdata.com/docs" },
    { id: "housecanary", name: "HouseCanary", layer: "Secondary AVM", status: "license", scope: "Property value and forecast APIs", independence: "Enterprise AVM", url: "https://www.housecanary.com/resources/developer-tools" },
    { id: "ice", name: "ICE / Cotality", layer: "Secondary AVM", status: "license", scope: "Enterprise automated valuation and property intelligence", independence: "Enterprise AVM", url: "https://mortgagetech.ice.com/products/automated-valuation-models" },
    { id: "bridge", name: "Bridge / local MLS", layer: "Live listing truth", status: "mls-approval", scope: "MLS-approved listing data; optional Zillow public records and Zestimates", independence: "Listing system of record", url: "https://www.bridgeinteractive.com/developers/bridge-api/" },
  ],
  properties,
};

await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n");
process.stdout.write(`Wrote ${properties.length} qualified property records to ${OUTPUT.pathname.replace(ROOT.pathname, "")}\n`);
for (const market of output.markets) process.stdout.write(`${market.label}: ${market.propertyCount} records · ${market.competency}% competency\n`);
