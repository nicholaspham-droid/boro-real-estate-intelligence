const jsonHeaders = { Accept: "application/json" };

async function getJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: jsonHeaders });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  return payload;
}

export function buildArcgisQuery(layerUrl, options = {}) {
  const url = new URL(`${layerUrl.replace(/\/$/, "")}/query`);
  url.searchParams.set("where", options.where ?? "1=1");
  url.searchParams.set("outFields", (options.outFields ?? ["*"]).join(","));
  url.searchParams.set("returnGeometry", String(options.returnGeometry ?? false));
  url.searchParams.set("resultRecordCount", String(options.limit ?? 100));
  url.searchParams.set("f", "json");
  if (options.outSR) url.searchParams.set("outSR", String(options.outSR));
  return url;
}

export async function inspectArcgis(source, fetchImpl = fetch) {
  const layerUrl = source.apiUrl.replace(/\/$/, "");
  const countUrl = new URL(`${layerUrl}/query`);
  countUrl.searchParams.set("where", source.auditWhere ?? "1=1");
  countUrl.searchParams.set("returnCountOnly", "true");
  countUrl.searchParams.set("f", "json");
  const [metadata, count, sample] = await Promise.all([
    getJson(`${layerUrl}?f=json`, fetchImpl),
    getJson(countUrl, fetchImpl),
    getJson(buildArcgisQuery(layerUrl, { outFields: source.auditFields, limit: source.sampleSize ?? 100 }), fetchImpl),
  ]);
  return {
    adapter: "arcgis",
    recordCount: count.count,
    maxRecordCount: metadata.maxRecordCount,
    fields: metadata.fields?.map((field) => field.name) ?? [],
    rows: (sample.features ?? []).map((feature) => ({ ...feature.attributes, _geometry: feature.geometry })),
  };
}

export function buildSocrataQuery(resourceUrl, options = {}) {
  const url = new URL(resourceUrl);
  url.searchParams.set("$limit", String(options.limit ?? 100));
  if (options.select) url.searchParams.set("$select", options.select.join(","));
  if (options.where) url.searchParams.set("$where", options.where);
  if (options.offset) url.searchParams.set("$offset", String(options.offset));
  return url;
}

export async function inspectSocrata(source, fetchImpl = fetch) {
  const countUrl = new URL(source.apiUrl);
  countUrl.searchParams.set("$select", "count(*) as count");
  const [countRows, rows] = await Promise.all([
    getJson(countUrl, fetchImpl),
    getJson(buildSocrataQuery(source.apiUrl, { select: source.auditFields, limit: source.sampleSize ?? 100 }), fetchImpl),
  ]);
  return {
    adapter: "socrata",
    recordCount: Number(countRows[0]?.count ?? 0),
    fields: Object.keys(rows[0] ?? {}),
    rows,
  };
}

export async function inspectCarto(source, fetchImpl = fetch) {
  const countUrl = new URL(source.apiUrl);
  countUrl.searchParams.set("q", `select count(*) as count from ${source.table}`);
  const sampleUrl = new URL(source.apiUrl);
  sampleUrl.searchParams.set("q", `select ${(source.auditFields ?? ["*"]).join(",")} from ${source.table} limit ${source.sampleSize ?? 100}`);
  const [countPayload, samplePayload] = await Promise.all([getJson(countUrl, fetchImpl), getJson(sampleUrl, fetchImpl)]);
  return {
    adapter: "carto",
    recordCount: Number(countPayload.rows?.[0]?.count ?? 0),
    fields: Object.keys(samplePayload.rows?.[0] ?? {}),
    rows: samplePayload.rows ?? [],
  };
}

export function fieldCoverage(rows, fieldMap) {
  const denominator = rows.length || 1;
  return Object.fromEntries(Object.entries(fieldMap).map(([canonical, candidates]) => {
    const present = rows.filter((row) => candidates.some((field) => row[field] !== null && row[field] !== undefined && row[field] !== "")).length;
    return [canonical, Number((present / denominator).toFixed(4))];
  }));
}

export function normalizeRecord(row, mapping, context) {
  const record = { marketId: context.marketId, sourceId: context.sourceId };
  for (const [canonical, sourceField] of Object.entries(mapping)) {
    const value = typeof sourceField === "function" ? sourceField(row) : row[sourceField];
    if (value !== undefined && value !== null && value !== "") record[canonical] = value;
  }
  return record;
}
