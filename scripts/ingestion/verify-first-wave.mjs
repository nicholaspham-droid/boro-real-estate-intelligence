import { inspectArcgis, inspectCarto, inspectSocrata, fieldCoverage } from "./adapters.mjs";

const sources = [
  {
    id: "nyc-pluto",
    adapter: "socrata",
    apiUrl: "https://data.cityofnewyork.us/resource/64uk-42ks.json",
    auditFields: ["bbl", "address", "assesstot", "yearbuilt", "bldgarea", "landuse", "zonedist1", "latitude", "longitude", "version"],
  },
  {
    id: "cook-parcel-universe",
    adapter: "socrata",
    apiUrl: "https://datacatalog.cookcountyil.gov/resource/pabr-t5kh.json",
    auditFields: ["pin", "year", "class", "zip_code", "lat", "lon", "cook_municipality_name", "env_flood_fema_sfha"],
  },
  {
    id: "philadelphia-opa",
    adapter: "carto",
    apiUrl: "https://phl.carto.com/api/v2/sql",
    table: "opa_properties_public",
    auditFields: ["parcel_number", "location", "market_value", "sale_date", "sale_price", "category_code_description", "zoning", "year_built", "total_livable_area"],
  },
  {
    id: "nc-one-map-parcels",
    adapter: "arcgis",
    apiUrl: "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/0",
    auditWhere: "cntyname in ('Wake','New Hanover')",
    auditFields: ["parno", "siteadd", "scity", "cntyname", "cntyfips", "landval", "improvval", "parval", "saledate", "revisedate", "parusedesc"],
  },
  {
    id: "utah-washington-lir",
    adapter: "arcgis",
    apiUrl: "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/Parcels_Washington_LIR/FeatureServer/0",
    auditFields: ["PARCEL_ID", "PARCEL_ADD", "PARCEL_CITY", "CURRENT_ASOF", "TOTAL_MKT_VALUE", "LAND_MKT_VALUE", "PARCEL_ACRES", "PROP_CLASS", "BLDG_SQFT", "BUILT_YR"],
  },
  {
    id: "florida-statewide-parcels",
    adapter: "arcgis",
    apiUrl: "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0",
    auditWhere: "CO_NO in (18,23,52,63)",
    auditFields: ["CO_NO", "PARCEL_ID", "ASMNT_YR", "DOR_UC", "JV", "LND_VAL", "ACT_YR_BLT", "TOT_LVG_AR", "SALE_PRC1", "SALE_YR1", "SALE_MO1", "PHY_ADDR1", "PHY_CITY", "PHY_ZIPCD"],
    sampleSize: 25,
  },
];

const commonCoverage = {
  stableId: ["bbl", "pin", "parcel_number", "parno", "PARCEL_ID"],
  address: ["address", "location", "siteadd", "PARCEL_ADD", "PHY_ADDR1"],
  totalValue: ["assesstot", "market_value", "parval", "TOTAL_MKT_VALUE", "JV"],
  landUse: ["landuse", "class", "category_code_description", "parusedesc", "PROP_CLASS", "DOR_UC"],
  yearBuilt: ["yearbuilt", "year_built", "BUILT_YR", "ACT_YR_BLT"],
  saleEvidence: ["sale_date", "saledate", "SALE_YR1"],
};

const inspectors = { arcgis: inspectArcgis, socrata: inspectSocrata, carto: inspectCarto };
const report = { schemaVersion: "1.0.0", checkedAt: new Date().toISOString(), sources: [] };

for (const source of sources) {
  const started = performance.now();
  try {
    const audit = await inspectors[source.adapter](source);
    report.sources.push({
      id: source.id,
      ok: true,
      adapter: source.adapter,
      recordCount: audit.recordCount,
      sampleSize: audit.rows.length,
      maxRecordCount: audit.maxRecordCount,
      coverage: fieldCoverage(audit.rows, commonCoverage),
      latencyMs: Math.round(performance.now() - started),
    });
  } catch (error) {
    report.sources.push({ id: source.id, ok: false, adapter: source.adapter, error: error.message, latencyMs: Math.round(performance.now() - started) });
  }
}

console.log(JSON.stringify(report, null, 2));
