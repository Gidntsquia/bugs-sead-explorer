import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";
import { HttpError, bugsAvailable, bugsSampleSites, bugsSiteList, bugsTaxonNames } from "./bugs";
import { seadTableDescriptions } from "./descriptions";

// ---------- polite, cached access to SEAD's public PostgREST endpoint ----------
const cacheDir = join(config.cacheDir, "sead");
mkdirSync(cacheDir, { recursive: true });
const memory = new Map<string, Cached>();
type Cached = { savedAt: number; data: any; count: number | null };

export class SeadUnreachable extends HttpError {
  constructor(detail: string) { super(503, `SEAD can't be reached right now (${detail}). BugsCEP parts of the app still work.`); }
}

let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>(r => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

let lastFailure = 0;
export const seadState = { lastOk: 0, lastError: "" as string, servedFromCacheWhileDown: false };

const keyFile = (key: string) => join(cacheDir, new Bun.CryptoHasher("sha1").update(key).digest("hex") + ".json");

/** GET a PostgREST path. Answers are cached in memory and on disk for SEAD_CACHE_HOURS. */
export async function sead(path: string, opts: { count?: boolean; ttlHours?: number; timeoutMs?: number } = {}): Promise<Cached> {
  const key = (opts.count ? "count:" : "") + path;
  const ttl = (opts.ttlHours ?? config.seadCacheHours) * 3600_000;
  let cached = memory.get(key);
  if (!cached && existsSync(keyFile(key))) {
    try { cached = JSON.parse(readFileSync(keyFile(key), "utf8")); memory.set(key, cached!); } catch { /* ignore broken cache file */ }
  }
  if (cached && Date.now() - cached.savedAt < ttl) return cached;
  // after a failure, don't hammer SEAD: fail fast for 15 s
  if (Date.now() - lastFailure < 15_000) throw new SeadUnreachable(seadState.lastError || "recent failure");
  return slot(async () => {
    try {
      const res = await fetch(`${config.seadUrl}/${path}`, {
        headers: { "User-Agent": "bugs-sead-explorer (personal research tool)", Accept: "application/json", ...(opts.count ? { Prefer: "count=exact" } : {}) },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
      });
      if (!res.ok) {
        const body = await res.text();
        if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
        throw new HttpError(502, `SEAD rejected the query (${res.status}): ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const range = res.headers.get("content-range");
      const count = range && range.includes("/") && range.split("/")[1] !== "*" ? Number(range.split("/")[1]) : null;
      const entry: Cached = { savedAt: Date.now(), data, count };
      memory.set(key, entry);
      try { writeFileSync(keyFile(key), JSON.stringify(entry)); } catch { /* cache is optional */ }
      seadState.lastOk = Date.now();
      return entry;
    } catch (e: any) {
      if (e instanceof HttpError) throw e;
      lastFailure = Date.now();
      seadState.lastError = e?.name === "TimeoutError" ? "timed out" : String(e?.message ?? e);
      throw new SeadUnreachable(seadState.lastError);
    }
  });
}

export async function seadStatus() {
  try {
    await sead("tbl_dataset_masters?select=master_set_id&limit=1", { ttlHours: 30 / 3600, timeoutMs: 8000 });
    return { reachable: true, url: config.seadUrl };
  } catch (e: any) {
    return { reachable: false, url: config.seadUrl, message: e.message };
  }
}

const count = async (table: string, filter = "") => (await sead(`${table}?select=*&limit=0${filter ? "&" + filter : ""}`, { count: true })).count ?? 0;

// ---------- lookups ----------
async function methods() {
  const r = await sead("tbl_methods?select=method_id,method_name,description,method_group_id,tbl_method_groups(group_name,description)");
  return new Map<number, any>(r.data.map((m: any) => [m.method_id, m]));
}
async function masters() {
  const r = await sead("tbl_dataset_masters?select=master_set_id,master_name,master_notes,url");
  return new Map<number, any>(r.data.map((m: any) => [m.master_set_id, m]));
}

// ---------- sites and matching with BugsCEP ----------
async function seadSiteRows() {
  return (await sead("tbl_sites?select=site_id,site_name,latitude_dd,longitude_dd,national_site_identifier&order=site_id")).data as any[];
}

/** SEAD samples that carry an original BugsCEP sample code (alt ref type 12 = "Bugs sample code"). */
async function bugsSampleCodesInSead() {
  return (await sead("tbl_sample_alt_refs?alt_ref_type_id=eq.12&select=alt_ref,tbl_physical_samples(tbl_sample_groups(site_id))")).data as any[];
}

const km = (a: number, b: number, c: number, d: number) => {
  const r = Math.PI / 180, x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export type SiteMatch = { seadId: number; bugsCode: string; how: "sample-code" | "name+place" | "place-only"; reliability: "high" | "medium" | "low"; distanceKm: number | null };

let matchCache: { at: number; matches: SiteMatch[] } | null = null;
/**
 * Links SEAD sites to BugsCEP sites, strongest evidence first:
 * 1. sample-code: a SEAD sample stores the BugsCEP sample code (exact, reliable)
 * 2. name+place: same site name (ignoring case/accents) and within 2 km (likely)
 * 3. place-only: different name but within 0.2 km (possible; check by hand)
 */
export async function siteMatches(): Promise<SiteMatch[]> {
  if (matchCache && Date.now() - matchCache.at < 3600_000) return matchCache.matches;
  if (!bugsAvailable()) return [];
  const [sites, codes] = await Promise.all([seadSiteRows(), bugsSampleCodesInSead()]);
  const sampleSite = bugsSampleSites();
  const bugsSites = bugsSiteList();
  const bugsByCode = new Map(bugsSites.map((s: any) => [s.code, s]));
  const seadById = new Map(sites.map(s => [s.site_id, s]));
  const out: SiteMatch[] = [];
  const seen = new Set<string>();
  const add = (m: SiteMatch) => { const k = m.seadId + "|" + m.bugsCode; if (!seen.has(k)) { seen.add(k); out.push(m); } };
  for (const r of codes) {
    const seadId = r.tbl_physical_samples?.tbl_sample_groups?.site_id;
    const bugsCode = sampleSite.get(r.alt_ref);
    if (seadId == null || !bugsCode) continue;
    const a = seadById.get(seadId), b: any = bugsByCode.get(bugsCode);
    const d = a?.latitude_dd != null && b?.lat != null ? km(Number(a.latitude_dd), Number(a.longitude_dd), b.lat, b.lon) : null;
    add({ seadId, bugsCode, how: "sample-code", reliability: "high", distanceKm: d });
  }
  const linkedSead = new Set(out.map(m => m.seadId)), linkedBugs = new Set(out.map(m => m.bugsCode));
  const byName = new Map<string, any[]>();
  for (const b of bugsSites) if (!linkedBugs.has(b.code)) byName.set(norm(b.name), [...(byName.get(norm(b.name)) ?? []), b]);
  const unlinkedBugs = bugsSites.filter((b: any) => !linkedBugs.has(b.code) && b.lat != null && !(b.lat === 0 && b.lon === 0));
  for (const s of sites) {
    if (linkedSead.has(s.site_id) || s.latitude_dd == null) continue;
    const lat = Number(s.latitude_dd), lon = Number(s.longitude_dd);
    for (const b of byName.get(norm(s.site_name)) ?? []) {
      const d = b.lat != null ? km(lat, lon, b.lat, b.lon) : null;
      if (d != null && d <= 2) add({ seadId: s.site_id, bugsCode: b.code, how: "name+place", reliability: "medium", distanceKm: d });
    }
    if (out.some(m => m.seadId === s.site_id)) continue;
    for (const b of unlinkedBugs) {
      const d = km(lat, lon, b.lat, b.lon);
      if (d <= 0.2) add({ seadId: s.site_id, bugsCode: b.code, how: "place-only", reliability: "low", distanceKm: d });
    }
  }
  matchCache = { at: Date.now(), matches: out };
  return out;
}

export async function matchesForBugsSite(code: string) {
  const [matches, sites] = await Promise.all([siteMatches(), seadSiteRows()]);
  const names = new Map(sites.map(s => [s.site_id, s.site_name]));
  return matches.filter(m => m.bugsCode === code).map(m => ({ ...m, seadName: names.get(m.seadId) ?? null }));
}

export async function seadSites() {
  const [sites, matches] = await Promise.all([seadSiteRows(), siteMatches().catch(() => [] as SiteMatch[])]);
  const best = new Map<number, SiteMatch>();
  for (const m of matches) if (!best.has(m.seadId)) best.set(m.seadId, m);
  return sites
    .filter(s => s.latitude_dd != null && s.longitude_dd != null && !(Number(s.latitude_dd) === 0 && Number(s.longitude_dd) === 0))
    .map(s => ({ id: s.site_id, name: s.site_name, lat: Number(s.latitude_dd), lon: Number(s.longitude_dd), bugsLink: best.get(s.site_id)?.reliability ?? null }));
}

const bySite = (id: number) => `tbl_physical_samples.tbl_sample_groups.site_id=eq.${id}`;
const aeBySite = (id: number) => `tbl_analysis_entities.tbl_physical_samples.tbl_sample_groups.site_id=eq.${id}`;
const aeJoin = "tbl_analysis_entities!inner(tbl_physical_samples!inner(tbl_sample_groups!inner(site_id)))";

export async function seadSite(id: number) {
  if (!Number.isInteger(id)) throw new HttpError(400, "bad site id");
  const siteRes = await sead(`tbl_sites?site_id=eq.${id}`);
  const site = siteRes.data[0];
  if (!site) throw new HttpError(404, `No SEAD site ${id}`);
  const [locs, ae, samples, abund, entityAges, relDates, geochron, meth, mast, matches] = await Promise.all([
    sead(`tbl_site_locations?site_id=eq.${id}&select=tbl_locations(location_name,location_type_id,tbl_location_types(location_type))`),
    sead(`tbl_analysis_entities?select=analysis_entity_id,physical_sample_id,tbl_datasets(dataset_id,dataset_name,method_id,master_set_id),tbl_physical_samples!inner(tbl_sample_groups!inner(site_id))&${bySite(id)}&limit=50000`),
    sead(`tbl_physical_samples?select=physical_sample_id,tbl_sample_groups!inner(site_id)&tbl_sample_groups.site_id=eq.${id}&limit=0`, { count: true }).then(r => r.count).catch(() => null),
    sead(`tbl_abundances?select=abundance,taxon_id,${aeJoin}&${aeBySite(id)}&limit=50000`),
    sead(`tbl_analysis_entity_ages?select=age,age_older,age_younger,dating_specifier,${aeJoin}&${aeBySite(id)}&limit=5000`),
    sead(`tbl_relative_dates?select=tbl_relative_ages(relative_age_name,description,c14_age_older,c14_age_younger,cal_age_older,cal_age_younger),${aeJoin}&${aeBySite(id)}&limit=5000`),
    sead(`tbl_geochronology?select=age,error_older,error_younger,lab_number,notes,${aeJoin.replace("tbl_analysis_entities!inner(", "tbl_analysis_entities!inner(tbl_datasets(method_id),")}&${aeBySite(id)}&limit=5000`),
    methods(), masters(), siteMatches().catch(() => [] as SiteMatch[]),
  ]);
  const locations = locs.data.map((l: any) => l.tbl_locations).filter(Boolean);
  // analyses by method
  const byMethod = new Map<number, { datasets: Set<number>; analyses: number; samples: Set<number>; masters: Set<number> }>();
  const sources = new Map<number, number>();
  for (const e of ae.data) {
    const d = e.tbl_datasets; if (!d) continue;
    const m = byMethod.get(d.method_id) ?? { datasets: new Set(), analyses: 0, samples: new Set(), masters: new Set() };
    m.datasets.add(d.dataset_id); m.analyses++; m.samples.add(e.physical_sample_id); m.masters.add(d.master_set_id);
    byMethod.set(d.method_id, m);
    sources.set(d.master_set_id, (sources.get(d.master_set_id) ?? 0) + 1);
  }
  const analysisTypes = [...byMethod].map(([mid, m]) => ({
    method: meth.get(mid)?.method_name ?? `method ${mid}`, description: meth.get(mid)?.description ?? null, group: meth.get(mid)?.tbl_method_groups?.group_name ?? null,
    datasets: m.datasets.size, analyses: m.analyses, samples: m.samples.size, fromBugsCEP: m.masters.has(1),
  })).sort((a, b) => b.analyses - a.analyses);
  // top taxa
  const tax = new Map<number, { total: number; records: number }>();
  for (const a of abund.data) {
    const t = tax.get(a.taxon_id) ?? { total: 0, records: 0 };
    t.total += Number(a.abundance) || 0; t.records++; tax.set(a.taxon_id, t);
  }
  const top = [...tax].sort((a, b) => b[1].total - a[1].total).slice(0, 15);
  let topTaxa: any[] = [];
  if (top.length) {
    const names = await sead(`tbl_taxa_tree_master?taxon_id=in.(${top.map(t => t[0]).join(",")})&select=taxon_id,species,tbl_taxa_tree_genera(genus_name,tbl_taxa_tree_families(family_name))`);
    const nm = new Map<number, any>(names.data.map((n: any) => [n.taxon_id, n]));
    topTaxa = top.map(([tid, t]) => {
      const n = nm.get(tid);
      return { taxonId: tid, name: n ? `${n.tbl_taxa_tree_genera?.genus_name ?? ""} ${n.species ?? ""}`.trim() : `taxon ${tid}`,
        family: n?.tbl_taxa_tree_genera?.tbl_taxa_tree_families?.family_name ?? null, total: t.total, records: t.records };
    });
  }
  // ages, all converted to years before 1950 (BP)
  const ages: any[] = [];
  for (const g of geochron.data) {
    const mname = meth.get(g.tbl_analysis_entities?.tbl_datasets?.method_id)?.method_name ?? "Measured date";
    const e = Number(g.error_older) || 0, age = Number(g.age);
    const c14 = /c14|radiocarbon/i.test(mname);
    ages.push({ kind: c14 ? "radiocarbon" : "radiometric", label: `${age}${e ? ` ± ${e}` : ""} ${c14 ? "radiocarbon years BP" : "years BP"}`, olderBP: age + e, youngerBP: Math.max(0, age - (Number(g.error_younger) || e)), detail: [mname, g.lab_number].filter(Boolean).join(", ") });
  }
  const rel = new Map<string, any>();
  for (const r of relDates.data) {
    const a = r.tbl_relative_ages; if (!a) continue;
    const x = rel.get(a.relative_age_name) ?? { ...a, n: 0 }; x.n++; rel.set(a.relative_age_name, x);
  }
  for (const a of rel.values()) {
    const older = a.cal_age_older ?? a.c14_age_older, younger = a.cal_age_younger ?? a.c14_age_younger;
    ages.push({ kind: "period", label: a.relative_age_name, olderBP: older != null ? Number(older) : null, youngerBP: younger != null ? Number(younger) : null, detail: `${a.n} analysed sample${a.n === 1 ? "" : "s"}${a.description ? " · " + a.description : ""}` });
  }
  const est = entityAges.data.filter((a: any) => a.age_older != null || a.age != null);
  if (est.length) {
    const o = Math.max(...est.map((a: any) => Number(a.age_older ?? a.age)));
    const y = Math.min(...est.map((a: any) => Number(a.age_younger ?? a.age)));
    ages.push({ kind: "estimate", label: `${est.length} sample age estimate${est.length === 1 ? "" : "s"}`, olderBP: o, youngerBP: y, detail: "SEAD's chosen age for each analysed sample" });
  }
  const vals = ages.flatMap(a => [a.olderBP, a.youngerBP]).filter((x): x is number => x != null && !Number.isNaN(x));
  const ageSummary = vals.length ? { oldestBP: Math.max(...vals), youngestBP: Math.min(...vals) } : null;
  const bugsLinks = matches.filter(m => m.seadId === id);
  const bugsSites = new Map(bugsAvailable() ? bugsSiteList().map((s: any) => [s.code, s]) : []);
  return {
    site: { id, name: site.site_name, lat: site.latitude_dd, lon: site.longitude_dd, altitude: site.altitude, identifier: site.national_site_identifier, description: site.site_description },
    country: locations.find((l: any) => l.location_type_id === 1)?.location_name ?? null,
    regions: locations.filter((l: any) => l.location_type_id !== 1).map((l: any) => l.location_name),
    sampleCount: samples, analysisCount: ae.data.length, datasetCount: new Set(ae.data.map((e: any) => e.tbl_datasets?.dataset_id)).size,
    analysisTypes, sources: [...sources].map(([sid, n]) => ({ id: sid, name: mast.get(sid)?.master_name ?? `source ${sid}`, analyses: n })).sort((a, b) => b.analyses - a.analyses),
    topTaxa, taxonCount: tax.size, ages, ageSummary,
    bugsLinks: bugsLinks.map(m => ({ ...m, name: (bugsSites.get(m.bugsCode) as any)?.name ?? null })),
    cachedAt: siteRes.savedAt,
  };
}

// ---------- compare ----------
export async function compare() {
  const [datasets, meth, mast, siteCount, sampleCount, aeCount, abundCount, taxaCount, matches, seadSitesList, seadTaxa] = await Promise.all([
    sead("tbl_datasets?select=method_id,master_set_id"), methods(), masters(),
    count("tbl_sites"), count("tbl_physical_samples"), count("tbl_analysis_entities"), count("tbl_abundances"), count("tbl_taxa_tree_master"),
    siteMatches(), seadSiteRows(),
    sead("tbl_taxa_tree_master?select=species,tbl_taxa_tree_genera(genus_name)"),
  ]);
  const byMaster = new Map<number, number>(), byMethod = new Map<number, { bugs: number; other: number }>();
  for (const d of datasets.data) {
    byMaster.set(d.master_set_id, (byMaster.get(d.master_set_id) ?? 0) + 1);
    const m = byMethod.get(d.method_id) ?? { bugs: 0, other: 0 };
    if (d.master_set_id === 1) m.bugs++; else m.other++;
    byMethod.set(d.method_id, m);
  }
  const bugsNames = bugsAvailable() ? bugsTaxonNames() : new Set<string>();
  let taxaShared = 0;
  const seadNames = new Set<string>();
  for (const t of seadTaxa.data) seadNames.add(`${t.tbl_taxa_tree_genera?.genus_name ?? ""} ${t.species ?? ""}`.trim().toLowerCase());
  for (const n of seadNames) if (bugsNames.has(n)) taxaShared++;
  const matchSummary = (["sample-code", "name+place", "place-only"] as const).map(how => {
    const ms = matches.filter(m => m.how === how);
    return { how, reliability: ms[0]?.reliability ?? ({ "sample-code": "high", "name+place": "medium", "place-only": "low" } as const)[how], seadSites: new Set(ms.map(m => m.seadId)).size, bugsSites: new Set(ms.map(m => m.bugsCode)).size };
  });
  const linkedSead = new Set(matches.map(m => m.seadId)), linkedBugs = new Set(matches.map(m => m.bugsCode));
  return {
    sead: { sites: siteCount, sitesWithCoords: seadSitesList.filter(s => s.latitude_dd != null).length, samples: sampleCount, analysisEntities: aeCount, abundances: abundCount, taxa: taxaCount, datasets: datasets.data.length },
    sources: [...byMaster].map(([id, n]) => ({ id, name: mast.get(id)?.master_name ?? `source ${id}`, notes: mast.get(id)?.master_notes ?? null, datasets: n })).sort((a, b) => b.datasets - a.datasets),
    bugsOriginDatasets: byMaster.get(1) ?? 0,
    methods: [...byMethod].map(([id, m]) => ({ id, name: meth.get(id)?.method_name ?? `method ${id}`, description: meth.get(id)?.description ?? null, group: meth.get(id)?.tbl_method_groups?.group_name ?? null, fromBugs: m.bugs, fromOthers: m.other }))
      .sort((a, b) => b.fromBugs + b.fromOthers - (a.fromBugs + a.fromOthers)),
    matching: { summary: matchSummary, seadSitesLinked: linkedSead.size, bugsSitesLinked: linkedBugs.size, seadOnlySites: siteCount - linkedSead.size },
    taxa: { seadDistinctNames: seadNames.size, bugsNames: bugsNames.size, shared: taxaShared },
    cachedAt: datasets.savedAt,
  };
}

// ---------- raw tables ----------
let openapi: { at: number; defs: Record<string, any> } | null = null;
async function definitions() {
  if (openapi && Date.now() - openapi.at < 3600_000) return openapi.defs;
  const r = await sead("", { ttlHours: 24 * 7 });
  openapi = { at: Date.now(), defs: r.data.definitions ?? {} };
  return openapi.defs;
}
const hidden = /^(geography_columns|geometry_columns|spatial_ref_sys)$/;
export async function seadTables() {
  const defs = await definitions();
  return Object.keys(defs).filter(n => !hidden.test(n)).sort().map(name => ({ name, description: seadTableDescriptions[name] ?? defs[name].description?.split("\n")[0] ?? null }));
}
export async function seadTableCount(name: string) {
  const defs = await definitions();
  if (!defs[name] || hidden.test(name)) throw new HttpError(404, `No SEAD table ${name}`);
  return { name, rows: await count(name) };
}
export async function seadTable(name: string, p: URLSearchParams) {
  const defs = await definitions();
  const def = defs[name];
  if (!def || hidden.test(name)) throw new HttpError(404, `No SEAD table ${name}`);
  const props = def.properties ?? {};
  const cols = Object.entries<any>(props).map(([n, v]) => ({ name: n, type: v.format ?? v.type, description: v.description?.replace(/<[^>]+>/g, "").split("\n")[0] || null }));
  const colNames = new Set(cols.map(c => c.name));
  const qs: string[] = ["select=*"];
  for (const [k, v] of p) {
    if (!k.startsWith("f.") || !v.trim()) continue;
    const col = k.slice(2);
    if (!colNames.has(col)) throw new HttpError(400, `Unknown column ${col}`);
    const t = String(props[col].type);
    const val = v.trim();
    if (t === "integer" || t === "number") {
      if (!/^-?\d+(\.\d+)?$/.test(val)) throw new HttpError(400, `${col} holds numbers; type a number to filter it`);
      qs.push(`${encodeURIComponent(col)}=eq.${val}`);
    } else if (t === "string" && !/geometry|geography|uuid|timestamp|date|range/i.test(props[col].format ?? "")) {
      qs.push(`${encodeURIComponent(col)}=ilike.*${encodeURIComponent(val.replace(/[*,()]/g, " "))}*`);
    } else {
      qs.push(`${encodeURIComponent(col)}=eq.${encodeURIComponent(val)}`);
    }
  }
  const sort = p.get("sort");
  if (sort) { if (!colNames.has(sort)) throw new HttpError(400, `Unknown column ${sort}`); qs.push(`order=${encodeURIComponent(sort)}.${p.get("dir") === "desc" ? "desc" : "asc"}`); }
  const pageSize = Math.min(200, Math.max(1, Number(p.get("pageSize") ?? 50)));
  const page = Math.max(0, Number(p.get("page") ?? 0));
  qs.push(`limit=${pageSize}`, `offset=${page * pageSize}`);
  const r = await sead(`${name}?${qs.join("&")}`, { count: true, ttlHours: 6 });
  return { name, description: seadTableDescriptions[name] ?? def.description?.split("\n")[0] ?? null, total: r.count, page, pageSize, columns: cols, rows: r.data };
}
