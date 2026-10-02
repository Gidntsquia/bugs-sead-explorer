import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";
import { bugsTableDescriptions, bugsColumnDescriptions } from "./descriptions";

// The BugsCEP file is copied into memory once at start-up and indexed there,
// so the file on disk is never written to.
let db: Database | null = null;
export let bugsError: string | null = null;

export function openBugs() {
  if (!existsSync(config.bugsDb)) {
    bugsError = `BugsCEP data file not found at ${config.bugsDb}. Run ./scripts/get-bugs-data.sh or set BUGS_DB in .env.`;
    console.warn(bugsError);
    return;
  }
  const file = new Database(config.bugsDb, { readonly: true });
  const bytes = file.serialize();
  file.close();
  db = Database.deserialize(bytes);
  db.exec(`
    CREATE INDEX IF NOT EXISTS ix_fossil_code ON TFossil(CODE);
    CREATE INDEX IF NOT EXISTS ix_fossil_sample ON TFossil(SampleCODE);
    CREATE INDEX IF NOT EXISTS ix_sample_site ON TSample(SiteCODE);
    CREATE INDEX IF NOT EXISTS ix_eco_code ON TEcoBugs(CODE);
    CREATE INDEX IF NOT EXISTS ix_radio_sample ON TDatesRadio(SampleCODE);
    CREATE INDEX IF NOT EXISTS ix_cal_sample ON TDatesCalendar(SampleCODE);
    CREATE INDEX IF NOT EXISTS ix_period_sample ON TDatesPeriod(SampleCODE);
    CREATE INDEX IF NOT EXISTS ix_bio_code ON TBiology(CODE);
    CREATE INDEX IF NOT EXISTS ix_distrib_code ON TDistrib(CODE);
    CREATE INDEX IF NOT EXISTS ix_index_name ON "INDEX"(GENUS COLLATE NOCASE, SPECIES COLLATE NOCASE);
  `);
  console.log(`BugsCEP loaded from ${config.bugsDb}`);
}

function need(): Database {
  if (!db) throw new HttpError(503, bugsError ?? "BugsCEP data not loaded");
  return db;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const q = <T = any>(sql: string, ...args: any[]): T[] => need().query(sql).all(...args) as T[];
const one = <T = any>(sql: string, ...args: any[]): T | null => (need().query(sql).get(...args) as T) ?? null;

// ---------- ages ----------
// Everything is converted to "years before 1950" (BP), the usual convention; the UI adds ~76 to say "years ago".
const toBP = (v: number | null, era: string | null): number | null => {
  if (v == null || era == null) return null;
  const e = era.trim().toUpperCase();
  if (e === "AD") return 1950 - v;
  if (e === "BC") return 1949 + v;
  if (e === "BP") return v;
  return null;
};

type AgeItem = { kind: "radiocarbon" | "radiometric" | "calendar" | "period"; label: string; olderBP: number | null; youngerBP: number | null; sample: string; sampleCode?: string; detail?: string };

function agesForSamples(sampleCodes: string[]): AgeItem[] {
  if (!sampleCodes.length) return [];
  const out: AgeItem[] = [];
  // chunk to stay under SQLite's variable limit
  for (let i = 0; i < sampleCodes.length; i += 500) {
    const chunk = sampleCodes.slice(i, i + 500);
    const ph = chunk.map(() => "?").join(",");
    for (const r of q(`SELECT r.SampleCODE, r.Date, r.AgeErrorOrPlusError AS err, r.DatingMethod, r.LabNr, m.Method, sa.RefNrContext AS ctx
                       FROM TDatesRadio r LEFT JOIN TDatesMethods m ON m.Abbrev=r.DatingMethod JOIN TSample sa ON sa.SampleCODE=r.SampleCODE
                       WHERE r.SampleCODE IN (${ph})`, ...chunk)) {
      if (r.Date == null) continue;
      const isC14 = String(r.DatingMethod ?? "").startsWith("C14");
      const err = Number(r.err) || 0;
      out.push({ kind: isC14 ? "radiocarbon" : "radiometric", label: `${r.Date}${err ? ` ± ${err}` : ""} ${isC14 ? "radiocarbon years BP" : "years BP"}`,
        olderBP: r.Date + err, youngerBP: Math.max(0, r.Date - err), sample: r.ctx ?? r.SampleCODE, sampleCode: r.SampleCODE, detail: [r.Method ?? r.DatingMethod, r.LabNr].filter(Boolean).join(", ") });
    }
    // calendar dates come as From/To pairs per sample; group them
    const cal = q(`SELECT c.SampleCODE, c.Uncertainty, c.Date, c.BCADBP, sa.RefNrContext AS ctx FROM TDatesCalendar c JOIN TSample sa ON sa.SampleCODE=c.SampleCODE WHERE c.SampleCODE IN (${ph})`, ...chunk);
    const bySample = new Map<string, any[]>();
    for (const c of cal) bySample.set(c.SampleCODE, [...(bySample.get(c.SampleCODE) ?? []), c]);
    for (const [s, rows] of bySample) {
      const bps = rows.map(r => toBP(r.Date, r.BCADBP)).filter((x): x is number => x != null);
      if (!bps.length) continue;
      const fmt = (r: any) => `${(r.Uncertainty ?? "").trim()} ${r.Date} ${r.BCADBP}`.trim();
      out.push({ kind: "calendar", label: rows.map(fmt).join(" – "), olderBP: Math.max(...bps), youngerBP: Math.min(...bps), sample: rows[0].ctx ?? s, sampleCode: s });
    }
    for (const p of q(`SELECT d.SampleCODE, p.PeriodName, p.Begin, p.BeginBCAD, p.End, p.EndBCAD, p.PeriodType, sa.RefNrContext AS ctx
                       FROM TDatesPeriod d JOIN TPeriods p ON p.PeriodCODE=d.PeriodCODE JOIN TSample sa ON sa.SampleCODE=d.SampleCODE
                       WHERE d.SampleCODE IN (${ph}) AND d.PeriodCODE != '?'`, ...chunk)) {
      const a = toBP(p.Begin, p.BeginBCAD), b = toBP(p.End, p.EndBCAD);
      out.push({ kind: "period", label: p.PeriodName, olderBP: a != null && b != null ? Math.max(a, b) : a ?? b, youngerBP: a != null && b != null ? Math.min(a, b) : a ?? b,
        sample: p.ctx ?? p.SampleCODE, sampleCode: p.SampleCODE, detail: p.PeriodType ? `${p.PeriodType} period` : undefined });
    }
  }
  return out;
}

function summariseAges(items: AgeItem[]) {
  const older = items.map(i => i.olderBP).filter((x): x is number => x != null);
  const younger = items.map(i => i.youngerBP).filter((x): x is number => x != null);
  if (!older.length && !younger.length) return null;
  return { oldestBP: Math.max(...older, ...younger), youngestBP: Math.min(...younger, ...older) };
}

// ---------- summary & sites ----------
export function bugsSummary() {
  const c = (t: string) => (one<{ n: number }>(`SELECT COUNT(*) n FROM "${t}"`)!).n;
  return {
    sites: c("TSite"),
    sitesWithCoords: one<{ n: number }>("SELECT COUNT(*) n FROM TSite WHERE LatDD IS NOT NULL AND LongDD IS NOT NULL AND NOT (LatDD=0 AND LongDD=0)")!.n,
    samples: c("TSample"), fossilRecords: c("TFossil"), taxa: c("INDEX"),
    taxaFound: one<{ n: number }>("SELECT COUNT(DISTINCT CODE) n FROM TFossil")!.n,
    taxaWithMCR: c("TMCRSummaryData"), habitatGroups: c("TEcoDefBugs"),
    datedSamples: one<{ n: number }>("SELECT COUNT(*) n FROM (SELECT SampleCODE FROM TDatesRadio UNION SELECT SampleCODE FROM TDatesCalendar UNION SELECT SampleCODE FROM TDatesPeriod)")!.n,
    countries: q("SELECT Country AS name, COUNT(*) AS sites FROM TSite GROUP BY Country ORDER BY sites DESC"),
    families: q(`SELECT i.FAMILY AS name, COUNT(*) AS records FROM TFossil f JOIN "INDEX" i ON i.CODE=f.CODE GROUP BY i.FAMILY ORDER BY records DESC LIMIT 12`),
  };
}

let sitesCache: any[] | null = null;
export function bugsSites() {
  if (sitesCache) return sitesCache;
  sitesCache = q(`SELECT s.SiteCODE AS code, s.SiteName AS name, s.Country AS country, s.Region AS region, s.LatDD AS lat, s.LongDD AS lon,
                    (SELECT COUNT(*) FROM TSample sa WHERE sa.SiteCODE=s.SiteCODE) AS samples
                  FROM TSite s WHERE s.LatDD IS NOT NULL AND s.LongDD IS NOT NULL AND NOT (s.LatDD=0 AND s.LongDD=0)`);
  return sitesCache;
}

export function bugsSiteList() {
  return q("SELECT SiteCODE AS code, SiteName AS name, Country AS country, LatDD AS lat, LongDD AS lon FROM TSite");
}

export function bugsSite(code: string) {
  const site = one(`SELECT SiteCODE AS code, SiteName AS name, Region AS region, Country AS country, NGR AS gridRef, LatDD AS lat, LongDD AS lon,
                     Alt AS altitude, IDBy AS identifiedBy, Interp AS interpretation, Specimens AS specimens FROM TSite WHERE SiteCODE=?`, code);
  if (!site) throw new HttpError(404, `No BugsCEP site ${code}`);
  const samples = q<{ SampleCODE: string }>("SELECT SampleCODE FROM TSample WHERE SiteCODE=?", code).map(r => r.SampleCODE);
  const taxa = q(`SELECT i.CODE AS code, i.FAMILY AS family, i.GENUS AS genus, i.SPECIES AS species, COUNT(DISTINCT f.SampleCODE) AS samples, SUM(f.Abundance) AS individuals
                  FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE JOIN "INDEX" i ON i.CODE=f.CODE
                  WHERE sa.SiteCODE=? GROUP BY i.CODE ORDER BY individuals DESC, samples DESC`, code);
  const totals = one(`SELECT COUNT(*) AS records, SUM(f.Abundance) AS individuals FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE WHERE sa.SiteCODE=?`, code);
  // habitat make-up: how many of the taxa found here belong to each habitat group
  const habitats = q(`SELECT d.BugsEcoCODE AS code, d.EcoLabel AS label, d.Definition AS definition, COUNT(DISTINCT e.CODE) AS taxa
                      FROM TEcoBugs e JOIN TEcoDefBugs d ON d.BugsEcoCODE=e.BugsEcoCODE
                      WHERE e.CODE IN (SELECT DISTINCT f.CODE FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE WHERE sa.SiteCODE=?)
                      GROUP BY d.BugsEcoCODE ORDER BY taxa DESC`, code);
  const ages = agesForSamples(samples);
  const proxies = one("SELECT * FROM TSiteOtherProxies WHERE SiteCODE=?", code);
  const refs = q("SELECT r.Ref AS ref, b.AUTHOR AS author, b.TITLE AS title FROM TSiteRef r LEFT JOIN TBiblio b ON b.REFERENCE=r.Ref WHERE r.SiteCODE=?", code);
  return {
    site, sampleCount: samples.length, taxonCount: taxa.length, records: totals?.records ?? 0, individuals: totals?.individuals ?? 0,
    topTaxa: taxa.slice(0, 15), families: familyCounts(taxa), habitats, ages, ageSummary: summariseAges(ages),
    otherEvidence: proxies ? Object.entries(proxies).filter(([k, v]) => k.startsWith("Has") && Number(v) === 1).map(([k]) => k.slice(3).replace(/([A-Z])/g, " $1").trim()) : [],
    references: refs,
  };
}

function familyCounts(taxa: any[]) {
  const m = new Map<string, number>();
  for (const t of taxa) m.set(t.family, (m.get(t.family) ?? 0) + t.individuals);
  return [...m].map(([name, individuals]) => ({ name, individuals })).sort((a, b) => b.individuals - a.individuals).slice(0, 10);
}

// ---------- taxa ----------
export function searchTaxa(term: string) {
  const t = term.trim().replace(/\s+/g, " ");
  if (t.length < 2) return [];
  const [g, s] = t.split(" ");
  const rows = s !== undefined
    ? q(`SELECT CODE AS code, FAMILY AS family, GENUS AS genus, SPECIES AS species, (SELECT COUNT(*) FROM TFossil f WHERE f.CODE=i.CODE) AS records
         FROM "INDEX" i WHERE GENUS LIKE ? AND SPECIES LIKE ? ORDER BY (GENUS LIKE ?) DESC, records DESC LIMIT 20`, `${g}%`, `${s}%`, g)
    : q(`SELECT CODE AS code, FAMILY AS family, GENUS AS genus, SPECIES AS species, (SELECT COUNT(*) FROM TFossil f WHERE f.CODE=i.CODE) AS records
         FROM "INDEX" i WHERE GENUS LIKE ? OR SPECIES LIKE ? OR FAMILY LIKE ? ORDER BY (GENUS LIKE ?) DESC, records DESC LIMIT 20`, `${t}%`, `${t}%`, `${t}%`, `${t}%`);
  return rows;
}

export function taxon(code: string) {
  const t = one(`SELECT CODE AS code, FAMILY AS family, GENUS AS genus, SPECIES AS species, AUTHORITY AS authority FROM "INDEX" WHERE CODE=?`, code);
  if (!t) throw new HttpError(404, `No taxon ${code}`);
  const sites = q(`SELECT s.SiteCODE AS code, s.SiteName AS name, s.Country AS country, s.LatDD AS lat, s.LongDD AS lon,
                     COUNT(DISTINCT f.SampleCODE) AS samples, SUM(f.Abundance) AS individuals
                   FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE JOIN TSite s ON s.SiteCODE=sa.SiteCODE
                   WHERE f.CODE=? GROUP BY s.SiteCODE ORDER BY individuals DESC`, code);
  const sampleCodes = q<{ SampleCODE: string }>("SELECT DISTINCT SampleCODE FROM TFossil WHERE CODE=?", code).map(r => r.SampleCODE);
  const ages = agesForSamples(sampleCodes);
  const habitats = q(`SELECT d.BugsEcoCODE AS code, d.EcoLabel AS label, d.Definition AS definition, d.Notes AS notes
                      FROM TEcoBugs e JOIN TEcoDefBugs d ON d.BugsEcoCODE=e.BugsEcoCODE WHERE e.CODE=? ORDER BY d.SortOrder`, code);
  const mcr = one("SELECT TMaxLo, TMaxHi, TMinLo, TMinHi, TRangeLo, TRangeHi FROM TMCRSummaryData WHERE CODE=?", code);
  const biology = q("SELECT Ref AS ref, Data AS text FROM TBiology WHERE CODE=? LIMIT 6", code);
  const distribution = q("SELECT Ref AS ref, Data AS text FROM TDistrib WHERE CODE=? LIMIT 6", code);
  const synonyms = q("SELECT SynGenus || ' ' || SynSpecies AS name FROM TSynonym WHERE CODE=? LIMIT 10", code).map((r: any) => r.name);
  return {
    taxon: t, siteCount: sites.length, sampleCount: sampleCodes.length, sites, ages, ageSummary: summariseAges(ages),
    datedSampleCount: new Set(ages.map(a => a.sampleCode)).size,
    habitats, mcr, biology, distribution, synonyms, lengths: q("SELECT AttribMeasure AS measure, Value AS value, AttribUnits AS units FROM TAttributes WHERE CODE=? AND AttribType='Length'", code)
  };
}

// ---------- raw tables ----------
let tableList: { name: string; rows: number; description: string | null }[] | null = null;
export function bugsTables() {
  if (tableList) return tableList;
  const names = q<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name COLLATE NOCASE").map(r => r.name);
  tableList = names.map(name => ({ name, rows: one<{ n: number }>(`SELECT COUNT(*) n FROM "${name}"`)!.n, description: bugsTableDescriptions[name] ?? null }));
  return tableList;
}

export function bugsTable(name: string, p: URLSearchParams) {
  const tbl = bugsTables().find(t => t.name === name);
  if (!tbl) throw new HttpError(404, `No BugsCEP table ${name}`);
  const cols = q<{ name: string; type: string }>(`SELECT name, type FROM pragma_table_info(?)`, name);
  const colNames = new Set(cols.map(c => c.name));
  const where: string[] = [], args: any[] = [];
  for (const [k, v] of p) {
    if (!k.startsWith("f.") || !v.trim()) continue;
    const col = k.slice(2);
    if (!colNames.has(col)) throw new HttpError(400, `Unknown column ${col}`);
    where.push(`CAST("${col}" AS TEXT) LIKE ?`); args.push(`%${v.trim()}%`);
  }
  const sort = p.get("sort");
  if (sort && !colNames.has(sort)) throw new HttpError(400, `Unknown column ${sort}`);
  const dir = p.get("dir") === "desc" ? "DESC" : "ASC";
  const pageSize = Math.min(200, Math.max(1, Number(p.get("pageSize") ?? 50)));
  const page = Math.max(0, Number(p.get("page") ?? 0));
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = one<{ n: number }>(`SELECT COUNT(*) n FROM "${name}" ${w}`, ...args)!.n;
  const rows = q(`SELECT * FROM "${name}" ${w} ${sort ? `ORDER BY "${sort}" ${dir}` : ""} LIMIT ? OFFSET ?`, ...args, pageSize, page * pageSize);
  const colDesc = bugsColumnDescriptions[name] ?? {};
  return { name, description: tbl.description, total, page, pageSize, columns: cols.map(c => ({ name: c.name, type: c.type, description: colDesc[c.name] ?? null })), rows };
}

export function bugsSampleSites(): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of q<{ SampleCODE: string; SiteCODE: string }>("SELECT SampleCODE, SiteCODE FROM TSample")) m.set(r.SampleCODE, r.SiteCODE);
  return m;
}

export function bugsTaxonNames(): Set<string> {
  return new Set(q<{ n: string }>(`SELECT lower(GENUS || ' ' || SPECIES) AS n FROM "INDEX"`).map(r => r.n));
}

export function bugsTaxonByName(genus: string, species: string) {
  return one(`SELECT CODE AS code FROM "INDEX" WHERE GENUS=? COLLATE NOCASE AND SPECIES=? COLLATE NOCASE`, genus, species);
}

export function bugsAvailable() { return db != null; }

// ---------- analysis: filters ----------
export function bugsFilters() {
  const countries = q("SELECT Country AS code, Country AS label, COUNT(*) AS sites FROM TSite WHERE Country IS NOT NULL AND Country != '' GROUP BY Country ORDER BY sites DESC");
  const periods = q(`SELECT p.PeriodCODE AS code, p.PeriodName AS label, p.Begin AS begin, p.End AS end, COUNT(*) AS samples
                     FROM TDatesPeriod d JOIN TPeriods p ON p.PeriodCODE=d.PeriodCODE WHERE d.PeriodCODE != '?'
                     GROUP BY p.PeriodCODE ORDER BY samples DESC`);
  const habitats = q("SELECT BugsEcoCODE AS code, EcoLabel AS label FROM TEcoDefBugs ORDER BY EcoLabel");
  return { countries, periods, habitats };
}

// ---------- analysis: filter & chart ----------
type AnalyzeParams = { country?: string; period?: string; habitat?: string; taxon?: string };
function analyzeWhere(p: AnalyzeParams) {
  const where: string[] = [], args: any[] = [];
  if (p.country) { where.push("s.Country = ?"); args.push(p.country); }
  if (p.taxon) { where.push("f.CODE = ?"); args.push(p.taxon); }
  if (p.habitat) { where.push("f.CODE IN (SELECT CODE FROM TEcoBugs WHERE BugsEcoCODE = ?)"); args.push(p.habitat); }
  if (p.period) { where.push("sa.SampleCODE IN (SELECT SampleCODE FROM TDatesPeriod WHERE PeriodCODE = ?)"); args.push(p.period); }
  return { where, args };
}

export function bugsAnalyze(p: AnalyzeParams) {
  const { where, args } = analyzeWhere(p);
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const base = `FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE JOIN TSite s ON s.SiteCODE=sa.SiteCODE ${w}`;
  const coordWhere = [...where, "s.LatDD IS NOT NULL", "s.LongDD IS NOT NULL", "NOT (s.LatDD=0 AND s.LongDD=0)"];
  // with no filters, use every BugsCEP site with coordinates (not just ones with fossil records) so "clear filters" restores the full map
  const sites = where.length
    ? q(`SELECT DISTINCT s.SiteCODE AS code, s.SiteName AS name, s.Country AS country, s.LatDD AS lat, s.LongDD AS lon
         FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE JOIN TSite s ON s.SiteCODE=sa.SiteCODE
         WHERE ${coordWhere.join(" AND ")}`, ...args)
    : q(`SELECT SiteCODE AS code, SiteName AS name, Country AS country, LatDD AS lat, LongDD AS lon FROM TSite
         WHERE LatDD IS NOT NULL AND LongDD IS NOT NULL AND NOT (LatDD=0 AND LongDD=0)`);
  const totals = one(`SELECT COUNT(*) AS records, SUM(f.Abundance) AS individuals, COUNT(DISTINCT f.CODE) AS taxa, COUNT(DISTINCT sa.SampleCODE) AS samples ${base}`, ...args);
  const byFamily = q(`SELECT i.FAMILY AS name, SUM(f.Abundance) AS individuals ${base.replace("FROM TFossil f", 'FROM TFossil f JOIN "INDEX" i ON i.CODE=f.CODE')} GROUP BY i.FAMILY ORDER BY individuals DESC LIMIT 12`, ...args);
  const byPeriod = q(`SELECT p.PeriodName AS name, p.Begin AS begin, COUNT(DISTINCT sa.SampleCODE) AS samples
                      ${base.replace("FROM TFossil f", "FROM TFossil f JOIN TDatesPeriod dp ON dp.SampleCODE=sa.SampleCODE JOIN TPeriods p ON p.PeriodCODE=dp.PeriodCODE")}
                      ${w ? "AND" : "WHERE"} dp.PeriodCODE != '?' GROUP BY p.PeriodCODE ORDER BY p.Begin DESC LIMIT 20`, ...args);
  const byHabitat = q(`SELECT d.EcoLabel AS name, SUM(f.Abundance) AS individuals
                      ${base.replace("FROM TFossil f", "FROM TFossil f JOIN TEcoBugs e ON e.CODE=f.CODE JOIN TEcoDefBugs d ON d.BugsEcoCODE=e.BugsEcoCODE")}
                      GROUP BY d.BugsEcoCODE ORDER BY individuals DESC LIMIT 12`, ...args);
  return {
    filters: p, siteCount: sites.length, sites,
    records: totals?.records ?? 0, individuals: totals?.individuals ?? 0, taxa: totals?.taxa ?? 0, sampleCount: totals?.samples ?? 0,
    byFamily, byPeriod, byHabitat,
  };
}

// ---------- analysis: change over time ----------
function sampleAgeMidpoints(sampleCodes: string[]): Map<string, number> {
  const items = agesForSamples(sampleCodes).filter(i => i.sampleCode);
  const bySample = new Map<string, AgeItem[]>();
  for (const it of items) bySample.set(it.sampleCode!, [...(bySample.get(it.sampleCode!) ?? []), it]);
  const rank: Record<AgeItem["kind"], number> = { calendar: 0, radiocarbon: 1, radiometric: 1, period: 2 };
  const out = new Map<string, number>();
  for (const [sc, its] of bySample) {
    const bestRank = Math.min(...its.map(i => rank[i.kind]));
    const use = its.filter(i => rank[i.kind] === bestRank);
    const olders = use.map(i => i.olderBP).filter((x): x is number => x != null);
    const youngers = use.map(i => i.youngerBP).filter((x): x is number => x != null);
    if (!olders.length && !youngers.length) continue;
    const o = Math.max(...olders, ...youngers), y = Math.min(...youngers, ...olders);
    out.set(sc, (o + y) / 2);
  }
  return out;
}

export function bugsTimeSeries(kind: "taxon" | "habitat" | "country", code: string, binYears = 500) {
  if (!code) throw new HttpError(400, "code is required");
  let rows: { SampleCODE: string; n: number }[];
  if (kind === "taxon") rows = q("SELECT SampleCODE, SUM(Abundance) AS n FROM TFossil WHERE CODE=? GROUP BY SampleCODE", code);
  else if (kind === "habitat") rows = q(`SELECT sa.SampleCODE, SUM(f.Abundance) AS n FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE
                                          WHERE f.CODE IN (SELECT CODE FROM TEcoBugs WHERE BugsEcoCODE=?) GROUP BY sa.SampleCODE`, code);
  else if (kind === "country") rows = q(`SELECT sa.SampleCODE, SUM(f.Abundance) AS n FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE
                                          JOIN TSite s ON s.SiteCODE=sa.SiteCODE WHERE s.Country=? GROUP BY sa.SampleCODE`, code);
  else throw new HttpError(400, `Unknown kind ${kind}`);
  const totalSamples = rows.length;
  const mids = sampleAgeMidpoints(rows.map(r => r.SampleCODE));
  const undatedSamples = totalSamples - mids.size;
  const dated = rows.filter(r => mids.has(r.SampleCODE)).map(r => ({ bp: mids.get(r.SampleCODE)!, n: r.n, sampleCode: r.SampleCODE }));
  if (!dated.length) return { kind, code, binYears, bins: [], undatedSamples, totalSamples };
  const minBP = Math.min(...dated.map(d => d.bp)), maxBP = Math.max(...dated.map(d => d.bp));
  const start = Math.floor(minBP / binYears) * binYears, end = Math.ceil(maxBP / binYears) * binYears;
  const bins: { fromBP: number; toBP: number; individuals: number; samples: number }[] = [];
  for (let b = start; b < end; b += binYears) bins.push({ fromBP: b + binYears, toBP: b, individuals: 0, samples: 0 });
  for (const d of dated) {
    const idx = Math.min(bins.length - 1, Math.floor((d.bp - start) / binYears));
    if (idx < 0) continue;
    bins[idx].individuals += d.n; bins[idx].samples += 1;
  }
  const nonEmpty = bins.filter(b => b.samples > 0);
  nonEmpty.reverse(); // oldest first
  return { kind, code, binYears, bins: nonEmpty, undatedSamples, totalSamples };
}

// ---------- analysis: habitat mix ----------
export function bugsHabitatMix(siteCodes: string[]) {
  if (!siteCodes.length) throw new HttpError(400, "at least one site code is required");
  return siteCodes.map(code => {
    const site = one("SELECT SiteCODE AS code, SiteName AS name FROM TSite WHERE SiteCODE=?", code);
    if (!site) throw new HttpError(404, `No BugsCEP site ${code}`);
    const total = one<{ n: number }>(`SELECT SUM(f.Abundance) AS n FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE WHERE sa.SiteCODE=?`, code)?.n ?? 0;
    const uncoded = one<{ n: number }>(`SELECT SUM(f.Abundance) AS n FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE
                                        WHERE sa.SiteCODE=? AND f.CODE NOT IN (SELECT DISTINCT CODE FROM TEcoBugs)`, code)?.n ?? 0;
    const habitats = q(`SELECT d.BugsEcoCODE AS code, d.EcoLabel AS label, SUM(f.Abundance) AS individuals
                        FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE JOIN TEcoBugs e ON e.CODE=f.CODE JOIN TEcoDefBugs d ON d.BugsEcoCODE=e.BugsEcoCODE
                        WHERE sa.SiteCODE=? GROUP BY d.BugsEcoCODE ORDER BY individuals DESC`, code)
      .map((h: any) => ({ ...h, share: total ? h.individuals / total : 0 }));
    const sampleRows = q<{ SampleCODE: string }>("SELECT SampleCODE FROM TSample WHERE SiteCODE=? ORDER BY SampleCODE", code);
    const samples = sampleRows.map(({ SampleCODE: sc }) => {
      const sTotal = one<{ n: number }>(`SELECT SUM(Abundance) AS n FROM TFossil WHERE SampleCODE=?`, sc)?.n ?? 0;
      if (!sTotal) return { sampleCode: sc, total: 0, uncoded: 0, habitats: [] };
      const sUncoded = one<{ n: number }>(`SELECT SUM(Abundance) AS n FROM TFossil WHERE SampleCODE=? AND CODE NOT IN (SELECT DISTINCT CODE FROM TEcoBugs)`, sc)?.n ?? 0;
      const sHabitats = q(`SELECT d.EcoLabel AS label, SUM(f.Abundance) AS individuals FROM TFossil f JOIN TEcoBugs e ON e.CODE=f.CODE JOIN TEcoDefBugs d ON d.BugsEcoCODE=e.BugsEcoCODE
                           WHERE f.SampleCODE=? GROUP BY d.BugsEcoCODE ORDER BY individuals DESC`, sc)
        .map((h: any) => ({ ...h, share: h.individuals / sTotal }));
      return { sampleCode: sc, total: sTotal, uncoded: sUncoded, habitats: sHabitats };
    });
    return { site, total, uncoded, uncodedShare: total ? uncoded / total : 0, habitats, samples };
  });
}

// ---------- 3D view ----------
export function bugsPoints3D() {
  const rows = q(`SELECT sa.SampleCODE AS sampleCode, sa.SiteCODE AS siteCode, s.SiteName AS siteName, s.LatDD AS lat, s.LongDD AS lon, sa.ZorDepthTop AS depth,
                    (SELECT SUM(Abundance) FROM TFossil f WHERE f.SampleCODE=sa.SampleCODE) AS individuals
                   FROM TSample sa JOIN TSite s ON s.SiteCODE=sa.SiteCODE
                   WHERE s.LatDD IS NOT NULL AND s.LongDD IS NOT NULL AND NOT (s.LatDD=0 AND s.LongDD=0)`)
    .filter((r: any) => r.individuals > 0);
  const mids = sampleAgeMidpoints(rows.map((r: any) => r.sampleCode));
  const habitatRows = q(`SELECT sa.SampleCODE AS sampleCode, d.EcoLabel AS label, SUM(f.Abundance) AS n
                         FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE JOIN TEcoBugs e ON e.CODE=f.CODE JOIN TEcoDefBugs d ON d.BugsEcoCODE=e.BugsEcoCODE
                         GROUP BY sa.SampleCODE, d.EcoLabel`);
  const dominant = new Map<string, { label: string; n: number }>();
  for (const r of habitatRows) { const cur = dominant.get(r.sampleCode); if (!cur || r.n > cur.n) dominant.set(r.sampleCode, { label: r.label, n: r.n }); }
  const points = rows.map((r: any) => ({
    sampleCode: r.sampleCode, siteCode: r.siteCode, siteName: r.siteName, lat: r.lat, lon: r.lon,
    depth: r.depth, ageBP: mids.get(r.sampleCode) ?? null, individuals: r.individuals,
    habitat: dominant.get(r.sampleCode)?.label ?? null,
  }));
  return { points, counts: { total: points.length, dated: points.filter(p => p.ageBP != null).length, withDepth: points.filter(p => p.depth != null).length } };
}

// ---------- time machine ----------
import { estimate, sliceAt, type Mcr, type TMSample } from "../shared/timemachine";

const DATED_SAMPLES_SQL = `SELECT SampleCODE FROM TDatesRadio WHERE Date IS NOT NULL
  UNION SELECT SampleCODE FROM TDatesCalendar WHERE Date IS NOT NULL AND BCADBP IS NOT NULL
  UNION SELECT d.SampleCODE FROM TDatesPeriod d JOIN TPeriods p ON p.PeriodCODE=d.PeriodCODE WHERE d.PeriodCODE != '?' AND p.Begin IS NOT NULL`;

let tmSites: any[] | null = null;
export function bugsTimeMachineSites() {
  return (tmSites ??= q(`SELECT s.SiteCODE AS code, s.SiteName AS name, s.Country AS country, s.Region AS region, COUNT(*) AS dated
                         FROM TSample sa JOIN TSite s ON s.SiteCODE=sa.SiteCODE WHERE sa.SampleCODE IN (${DATED_SAMPLES_SQL})
                         GROUP BY s.SiteCODE ORDER BY s.SiteName`));
}

export function bugsTimeMachine(siteCode: string) {
  const site = one(`SELECT SiteCODE AS code, SiteName AS name, Region AS region, Country AS country, LatDD AS lat, LongDD AS lon FROM TSite WHERE SiteCODE=?`, siteCode);
  if (!site) throw new HttpError(404, `No BugsCEP site ${siteCode}`);
  const all = q<any>("SELECT SampleCODE AS code, ZorDepthTop AS depthTop, ZorDepthBot AS depthBot FROM TSample WHERE SiteCODE=? ORDER BY SampleCODE", siteCode);
  const items = agesForSamples(all.map(s => s.code)).filter(i => i.sampleCode && i.olderBP != null && i.youngerBP != null);
  const byS = new Map<string, any[]>();
  for (const i of items) byS.set(i.sampleCode!, [...(byS.get(i.sampleCode!) ?? []), i]);
  // A broad period label (e.g. "Late Glacial") would swamp precise dates, so it is only used when a sample has nothing finer.
  for (const [k, v] of byS) if (v.some(i => i.kind !== "period")) byS.set(k, v.filter(i => i.kind !== "period"));
  const taxaBy = new Map<string, { code: string; n: number }[]>();
  for (const r of q<any>(`SELECT f.SampleCODE AS s, f.CODE AS code, SUM(f.Abundance) AS n FROM TFossil f JOIN TSample sa ON sa.SampleCODE=f.SampleCODE WHERE sa.SiteCODE=? GROUP BY f.SampleCODE, f.CODE`, siteCode))
    taxaBy.set(r.s, [...(taxaBy.get(r.s) ?? []), { code: r.code, n: r.n ?? 0 }]);
  const samples: TMSample[] = all.filter(s => byS.has(s.code)).map(s => ({
    ...s, taxa: taxaBy.get(s.code) ?? [],
    ranges: byS.get(s.code)!.map(i => ({ kind: i.kind, label: i.label, detail: i.detail, older: i.olderBP, younger: i.youngerBP })),
  }));
  const taxonCodes = [...new Set(samples.flatMap(s => s.taxa.map(t => t.code)))];
  const taxa: Record<string, { name: string; family: string }> = {};
  const mcr: Record<string, Mcr> = {};
  const distrib: Record<string, string> = {};
  for (let i = 0; i < taxonCodes.length; i += 500) {
    const chunk = taxonCodes.slice(i, i + 500), ph = chunk.map(() => "?").join(",");
    for (const r of q<any>(`SELECT CODE, FAMILY, GENUS, SPECIES FROM "INDEX" WHERE CODE IN (${ph})`, ...chunk)) taxa[r.CODE] = { name: `${r.GENUS} ${r.SPECIES}`.trim(), family: r.FAMILY };
    for (const r of q<any>(`SELECT CODE, TMaxLo, TMaxHi, TRangeLo, TRangeHi FROM TMCRSummaryData WHERE CODE IN (${ph})`, ...chunk))
      if ([r.TMaxLo, r.TMaxHi, r.TRangeLo, r.TRangeHi].every(v => v != null)) mcr[r.CODE] = { tMaxLo: r.TMaxLo, tMaxHi: r.TMaxHi, tRangeLo: r.TRangeLo, tRangeHi: r.TRangeHi };
    for (const r of q<any>(`SELECT CODE, Data FROM TDistrib WHERE CODE IN (${ph}) AND Data IS NOT NULL`, ...chunk))
      distrib[r.CODE] = distrib[r.CODE] ? `${distrib[r.CODE]} ${r.Data}` : r.Data;
  }
  const bounds = [...new Set(samples.flatMap(s => s.ranges.flatMap(r => [r.older, r.younger])))].sort((a, b) => b - a);
  const years = bounds.length > 200 ? bounds.filter((_, i) => i % Math.ceil(bounds.length / 200) === 0 || i === bounds.length - 1) : bounds;
  const name = (c: string) => taxa[c]?.name ?? c;
  const curve = years.map(year => {
    const sl = sliceAt(year, samples);
    const e = estimate(sl.taxa.map(t => t.code).filter(c => mcr[c]), mcr, name);
    return { year, samples: sl.samples.length, n: e.n, status: e.status,
      summer: e.status === "ok" ? e.summer : null, winter: e.status === "ok" ? e.winter : null,
      nearSummer: e.status === "nearmiss" && e.basis === "summer" ? e.agree : null, k: e.status === "nearmiss" ? e.k : null };
  });
  return { site, samples, undated: all.length - samples.length, taxa, mcr, distrib, curve,
    oldestBP: bounds[0] ?? null, youngestBP: bounds[bounds.length - 1] ?? null };
}

// ---------- today's July mean (Open-Meteo ERA5), one call per site, cached on disk ----------
const todayDir = join(config.cacheDir, "openmeteo");
const todayInflight = new Map<string, Promise<unknown>>();
let todayActive = 0;

export type Today = { julyMean: number; years: string; source: string } | null;

async function fetchJulyMean(lat: number, lon: number): Promise<Today> {
  const url = `${config.openMeteoUrl}/v1/archive?latitude=${lat}&longitude=${lon}&start_date=1991-01-01&end_date=2020-12-31&daily=temperature_2m_mean&timezone=UTC`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j: any = await res.json();
  const days: string[] = j?.daily?.time ?? [], vals: (number | null)[] = j?.daily?.temperature_2m_mean ?? [];
  let sum = 0, n = 0;
  days.forEach((d, i) => { if (d.slice(5, 7) === "07" && vals[i] != null) { sum += vals[i]!; n++; } });
  if (n < 300) throw new Error("Open-Meteo returned too few July days");
  return { julyMean: Math.round((sum / n) * 10) / 10, years: "1991–2020", source: "ERA5 via Open-Meteo" };
}

export async function bugsToday(siteCode: string): Promise<Today> {
  const site = one<any>(`SELECT LatDD AS lat, LongDD AS lon FROM TSite WHERE SiteCODE=?`, siteCode);
  if (!site) throw new HttpError(404, `No BugsCEP site ${siteCode}`);
  if (site.lat == null || site.lon == null) return null;
  mkdirSync(todayDir, { recursive: true });
  const file = join(todayDir, `${siteCode.replace(/[^A-Za-z0-9_-]/g, "")}.json`);
  if (existsSync(file)) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { /* refetch */ } }
  const running = todayInflight.get(siteCode);
  if (running) return running as Promise<Today>;
  const p = (async () => {
    while (todayActive >= 3) await new Promise(r => setTimeout(r, 200));
    todayActive++;
    try {
      const t = await fetchJulyMean(site.lat, site.lon);
      writeFileSync(file, JSON.stringify(t));
      return t;
    } catch (e) { console.warn("today:", String(e)); return null; } // never fabricate; failures are not cached
    finally { todayActive--; todayInflight.delete(siteCode); }
  })();
  todayInflight.set(siteCode, p);
  return p;
}
