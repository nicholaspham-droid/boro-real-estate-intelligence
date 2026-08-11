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

function quantile(values, percentile) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function weightedMedian(items) {
  return weightedQuantile(items, .5);
}

function weightedQuantile(items, percentile) {
  const sorted = items.filter((item) => Number.isFinite(item.value) && item.weight > 0).sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = 0;
  for (const item of sorted) {
    cursor += item.weight;
    if (cursor >= total * percentile) return item.value;
  }
  return sorted.at(-1)?.value ?? null;
}

function milesBetween(a, b) {
  if (![a.lat, a.lng, b.lat, b.lng].every((value) => Number.isFinite(value))) return null;
  const radius = 3958.8;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * Math.PI / 180;
  const deltaLng = (b.lng - a.lng) * Math.PI / 180;
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function typeGroup(label = "") {
  const value = label.toLowerCase();
  if (value.includes("condo")) return "condo";
  if (value.includes("multi") || value.includes("apartment") || value.includes("apt") || value.includes("2 family") || value.includes("3 family")) return "multifamily";
  if (value.includes("single") || value.includes("singlfam") || value.includes("row")) return "single-family";
  return "residential-other";
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

function hpiAdjustedSale(record, price, targetDate = TODAY) {
  const saleYear = Math.min(price.latestYear, Number(record.saleDate.slice(0, 4)));
  const targetYear = Math.min(price.latestYear, targetDate.getUTCFullYear());
  const atSale = price.history.find((item) => item.year === saleYear)?.index ?? price.latestIndex;
  const atTarget = price.history.find((item) => item.year === targetYear)?.index ?? price.latestIndex;
  return record.salePrice * atTarget / atSale;
}

function calibrationFor(records) {
  const ratios = records.map((row) => row.salePrice / row.assessedValue).filter((ratio) => ratio >= 0.35 && ratio <= 2.75);
  return clamp(median(ratios) ?? 1, 0.65, 1.75);
}

function comparableEvidence(subject, candidates, price, targetDate) {
  const targetTime = targetDate.getTime();
  const targetType = typeGroup(subject.propertyType);
  const scored = candidates
    .filter((candidate) => candidate.id !== subject.id && new Date(candidate.saleDate).getTime() <= targetTime)
    .map((candidate) => {
      const distance = milesBetween(subject, candidate);
      const sqftRatio = candidate.sqft / subject.sqft;
      const ageDifference = subject.yearBuilt && candidate.yearBuilt ? Math.abs(subject.yearBuilt - candidate.yearBuilt) : 25;
      const monthsOld = Math.max(0, (targetTime - new Date(candidate.saleDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      const sameType = typeGroup(candidate.propertyType) === targetType;
      const score = (sameType ? 32 : 0)
        + clamp(30 - Math.abs(1 - sqftRatio) * 75, 0, 30)
        + clamp(18 - (distance ?? 15) * 2.5, 0, 18)
        + clamp(12 - ageDifference * 0.3, 0, 12)
        + clamp(8 - monthsOld / 9, 0, 8);
      return { candidate, distance, sqftRatio, monthsOld, sameType, score };
    })
    .filter((item) => item.sqftRatio >= 0.55 && item.sqftRatio <= 1.8 && (item.distance === null || item.distance <= 20))
    .sort((a, b) => b.score - a.score);
  const preferred = scored.filter((item) => item.sameType && item.score >= 42);
  const selected = (preferred.length >= 3 ? preferred : scored).slice(0, 12);
  const ppsfEvidence = selected.map((item) => ({
    value: hpiAdjustedSale(item.candidate, price, targetDate) / item.candidate.sqft,
    weight: Math.max(0.1, item.score / 100),
  }));
  const ppsf = weightedMedian(ppsfEvidence);
  return {
    count: selected.length,
    ppsf,
    ppsfP25: weightedQuantile(ppsfEvidence, .25),
    ppsfP75: weightedQuantile(ppsfEvidence, .75),
    nearestMiles: selected.length ? Math.min(...selected.map((item) => item.distance ?? 20)) : null,
    medianMiles: median(selected.map((item) => item.distance).filter((value) => value !== null)),
    medianAgeMonths: median(selected.map((item) => item.monthsOld)),
    newestSaleDate: selected.map((item) => item.candidate.saleDate).sort().at(-1) ?? null,
    oldestSaleDate: selected.map((item) => item.candidate.saleDate).sort().at(0) ?? null,
    sameTypePct: selected.length ? selected.filter((item) => item.sameType).length / selected.length * 100 : 0,
    ids: selected.map((item) => item.candidate.id),
  };
}

function backtestMarket(usable, price) {
  const tests = [];
  for (const subject of [...usable].sort((a, b) => a.saleDate.localeCompare(b.saleDate))) {
    const targetDate = new Date(`${subject.saleDate}T00:00:00Z`);
    const prior = usable.filter((candidate) => candidate.id !== subject.id && candidate.saleDate < subject.saleDate);
    const comps = comparableEvidence(subject, prior, price, targetDate);
    if (!comps.ppsf || comps.count < 3 || prior.length < 6) continue;
    const calibration = calibrationFor(prior);
    const compValue = subject.sqft * comps.ppsf;
    const assessmentValue = subject.assessedValue * calibration;
    const predicted = compValue * 0.72 + assessmentValue * 0.28;
    const ratio = predicted / subject.salePrice;
    tests.push({ id: subject.id, predicted, actual: subject.salePrice, ratio, absoluteErrorPct: Math.abs(ratio - 1) * 100, compCount: comps.count });
  }
  const ratios = tests.map((item) => item.ratio);
  const medianRatio = median(ratios) ?? 1;
  const cod = medianRatio ? tests.reduce((sum, item) => sum + Math.abs(item.ratio - medianRatio), 0) / Math.max(1, tests.length) / medianRatio * 100 : null;
  return {
    method: "Out-of-time backtest: each sale is estimated only from earlier sales, a locally calibrated assessment, physical similarity and distance",
    sampleSize: tests.length,
    medianAbsoluteErrorPct: round(median(tests.map((item) => item.absoluteErrorPct)) ?? 30, 1),
    p80AbsoluteErrorPct: round(quantile(tests.map((item) => item.absoluteErrorPct), 0.8) ?? 30, 1),
    medianRatio: round(medianRatio, 3),
    biasPct: round((medianRatio - 1) * 100, 1),
    coefficientOfDispersion: round(cod ?? 30, 1),
    within10Pct: round(tests.filter((item) => item.absoluteErrorPct <= 10).length / Math.max(1, tests.length) * 100, 1),
    within20Pct: round(tests.filter((item) => item.absoluteErrorPct <= 20).length / Math.max(1, tests.length) * 100, 1),
  };
}

function modelMarket(records, clusterId) {
  const meta = clusterMeta(clusterId);
  const usable = records.filter((row) => row.salePrice && row.assessedValue && row.sqft && row.sqft > 0);
  const calibration = calibrationFor(usable);
  const diagnostics = backtestMarket(usable, meta.price);
  const modelQuality = clamp(100 - diagnostics.medianAbsoluteErrorPct * 2.2 - Math.abs(diagnostics.biasPct) * 1.2 - Math.max(0, 18 - diagnostics.sampleSize) * 0.5, 35, 92);
  diagnostics.modelCompetency = Math.round(modelQuality);
  const modeled = usable.map((record) => {
    const comps = comparableEvidence(record, usable, meta.price, TODAY);
    if (!comps.ppsf || comps.count < 2) return null;
    const saleAnchor = hpiAdjustedSale(record, meta.price);
    const assessmentAnchor = record.assessedValue * calibration;
    const compAnchor = record.sqft * comps.ppsf;
    const ageMonths = Math.max(0, (TODAY - new Date(record.saleDate)) / (1000 * 60 * 60 * 24 * 30.44));
    const saleWeight = ageMonths <= 24 ? 0.35 : ageMonths <= 60 ? 0.25 : 0.15;
    const assessmentWeight = 0.20;
    const compWeight = 1 - saleWeight - assessmentWeight;
    const estimate = saleAnchor * saleWeight + assessmentAnchor * assessmentWeight + compAnchor * compWeight;
    const anchors = [saleAnchor, assessmentAnchor, compAnchor];
    const spread = Math.max(...anchors) - Math.min(...anchors);
    const recency = clamp(100 - ageMonths * 1.6, 20, 100);
    const recencyBand = ageMonths <= 6 ? "current" : ageMonths <= 18 ? "recent" : ageMonths <= 36 ? "aging" : "stale";
    const completeness = [record.sqft, record.yearBuilt, record.assessedValue, record.lat, record.lng, record.zip].filter(Boolean).length / 6;
    const compQuality = clamp(comps.count / 8 * 50 + comps.sameTypePct * 0.3 + (20 - (comps.medianMiles ?? 20)) * 1.0, 0, 100);
    const agreement = clamp(100 - spread / estimate * 120, 0, 100);
    const confidence = clamp(Math.round(modelQuality * 0.35 + recency * 0.15 + completeness * 100 * 0.15 + compQuality * 0.20 + agreement * 0.10 + meta.price.pricingCompetency * 0.05), 35, 94);
    const empiricalMargin = diagnostics.sampleSize >= 8 ? diagnostics.p80AbsoluteErrorPct / 100 : 0.22;
    const margin = clamp(Math.max(empiricalMargin, spread / estimate * 0.28, (100 - confidence) / 300), 0.08, 0.60);
    const valuationGapPct = (estimate / record.assessedValue - 1) * 100;
    const gapSignal = clamp(50 + valuationGapPct, 0, 100);
    const liquidity = clamp(100 - ageMonths * 1.4, 20, 100);
    const watchScore = Math.round(meta.score * 0.45 + confidence * 0.30 + gapSignal * 0.15 + liquidity * 0.10);
    return {
      ...record,
      clusterName: `${meta.market.label} · ${meta.cluster.name}`,
      model: {
        value: round(estimate, -3), low: round(estimate * (1 - margin), -3), high: round(estimate * (1 + margin), -3), confidence,
        watchScore, valuationGapPct: round(valuationGapPct, 1), compCount: comps.count,
        anchors: { hpiAdjustedSale: round(saleAnchor, -3), assessmentCalibrated: round(assessmentAnchor, -3), comparablePpsf: round(compAnchor, -3) },
        weights: { hpiAdjustedSale: saleWeight, assessmentCalibrated: assessmentWeight, comparableSales: compWeight },
        calibrationRatio: round(calibration, 3), comparablePpsf: round(comps.ppsf, 0), clusterEdgeScore: meta.score,
        pricePerSqft: { recordedSale: round(record.salePrice / record.sqft, 0), hpiAdjustedSale: round(saleAnchor / record.sqft, 0), assessmentCalibrated: round(assessmentAnchor / record.sqft, 0), comparableP25: round(comps.ppsfP25, 0), comparableMedian: round(comps.ppsf, 0), comparableP75: round(comps.ppsfP75, 0), modelCenter: round(estimate / record.sqft, 0) },
        recency: { saleAgeMonths: round(ageMonths, 1), score: round(recency, 0), band: recencyBand },
        comparableQuality: { nearestMiles: round(comps.nearestMiles ?? 0, 1), medianMiles: round(comps.medianMiles ?? 0, 1), medianAgeMonths: round(comps.medianAgeMonths ?? 0, 1), newestSaleDate: comps.newestSaleDate, oldestSaleDate: comps.oldestSaleDate, sameTypePct: round(comps.sameTypePct, 0), recordIds: comps.ids },
        diagnostics: { modelVersion: "2.1", marketBacktestSample: diagnostics.sampleSize, marketMedianAbsoluteErrorPct: diagnostics.medianAbsoluteErrorPct, marketP80AbsoluteErrorPct: diagnostics.p80AbsoluteErrorPct },
      },
      listing: null,
      vendorEstimates: [],
    };
  }).filter(Boolean).sort((a, b) => b.model.watchScore - a.model.watchScore).slice(0, 18);
  return { records: modeled, diagnostics };
}

const raw = await Promise.all([fetchCookCounty(), fetchPhiladelphia(), fetchWakeCounty()]);
const modeledMarkets = [
  modelMarket(raw[0], "chicago-west"),
  modelMarket(raw[1], "philadelphia-west"),
  modelMarket(raw[2], "raleigh-west"),
];
const properties = [
  ...modeledMarkets[0].records,
  ...modeledMarkets[1].records,
  ...modeledMarkets[2].records,
];

const output = {
  generatedAt: new Date().toISOString(),
  asOf: "2026-08-07",
  methodology: {
    label: "Public-record valuation watch model v2.1",
    value: "Recency-weighted prior sale + 20% locally calibrated assessment + 45–65% geographically, physically and price-per-square-foot matched comparable sales",
    range: "The larger of the market's out-of-time 80th-percentile error, anchor disagreement, or evidence-quality penalty",
    watchScore: "45% cluster edge + 30% evidence quality + 15% assessment gap signal + 10% sale recency",
    validation: "Out-of-time backtesting uses only sales recorded before each test transaction; no later comparable is allowed into that test",
    boundary: "The assessment gap is not acquisition edge. A true price edge requires an asking price or licensed live listing joined to the record.",
  },
  markets: [
    { id: "chicago", clusterId: "chicago-west", label: "Chicago · West Corridor", status: "live", propertyCount: properties.filter((row) => row.marketId === "chicago").length, sourceCompetency: 91, modelCompetency: modeledMarkets[0].diagnostics.modelCompetency, competency: Math.round(91 * 0.55 + modeledMarkets[0].diagnostics.modelCompetency * 0.45), diagnostics: modeledMarkets[0].diagnostics },
    { id: "philadelphia", clusterId: "philadelphia-west", label: "Philadelphia · West Corridor", status: "live", propertyCount: properties.filter((row) => row.marketId === "philadelphia").length, sourceCompetency: 90, modelCompetency: modeledMarkets[1].diagnostics.modelCompetency, competency: Math.round(90 * 0.55 + modeledMarkets[1].diagnostics.modelCompetency * 0.45), diagnostics: modeledMarkets[1].diagnostics },
    { id: "raleigh", clusterId: "raleigh-west", label: "Raleigh · West Corridor", status: "live", propertyCount: properties.filter((row) => row.marketId === "raleigh").length, sourceCompetency: 82, modelCompetency: modeledMarkets[2].diagnostics.modelCompetency, competency: Math.round(82 * 0.55 + modeledMarkets[2].diagnostics.modelCompetency * 0.45), diagnostics: modeledMarkets[2].diagnostics },
    { id: "northwest-arkansas", clusterId: "northwest-arkansas-north", label: "Northwest Arkansas · North Arc", status: "gap", propertyCount: 0, competency: 38, gap: "Parcel geometry is available, but a verified reusable county sale-price feed is not yet connected." },
  ],
  providers: [
    { id: "public-records", name: "County / city public records", layer: "Property fact", status: "connected", scope: "Recorded sale, assessment, parcel and building facts", independence: "Primary evidence", url: "/api/valuation/properties" },
    { id: "zillow-research", name: "Zillow Research", layer: "Market cross-check", status: "ready", scope: "ZHVI, inventory, sales and market heat by region/ZIP; not a property Zestimate feed", independence: "Aggregate benchmark", url: "https://www.zillow.com/research/data/" },
    { id: "realtor-research", name: "Realtor.com Research", layer: "Market cross-check", status: "ready", scope: "Inventory and listing-market metrics by metro, county and ZIP", independence: "Aggregate benchmark", url: "https://www.realtor.com/research/data/" },
    { id: "rentcast", name: "RentCast", layer: "Listing + rent evidence", status: "connected", scope: "Server-side active sale/rental listings, rent estimates and comps; empirical market coverage audit pending", independence: "Commercial cross-check", url: "https://www.rentcast.io/api" },
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
