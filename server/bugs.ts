import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
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
