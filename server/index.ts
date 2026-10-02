import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { config } from "./config";
import { HttpError, openBugs, bugsError, bugsSummary, bugsSites, bugsSite, searchTaxa, taxon, bugsTables, bugsTable, bugsAvailable, bugsFilters, bugsAnalyze, bugsTimeSeries, bugsHabitatMix, bugsPoints3D, bugsTimeMachine, bugsTimeMachineSites, bugsToday } from "./bugs";
import { seadStatus, matchesForBugsSite, seadSites, seadSite, compare, seadTables, seadTableCount, seadTable } from "./sead";

openBugs();

type Handler = (m: RegExpMatchArray, url: URL) => unknown | Promise<unknown>;
const routes: [RegExp, Handler][] = [
  [/^\/api\/status$/, async () => ({ bugs: { available: bugsAvailable(), message: bugsError }, sead: await seadStatus() })],
  [/^\/api\/bugs\/summary$/, () => bugsSummary()],
  [/^\/api\/bugs\/sites$/, () => bugsSites()],
  [/^\/api\/bugs\/site\/([^/]+)$/, m => bugsSite(decodeURIComponent(m[1]))],
  [/^\/api\/bugs\/taxa$/, (_, u) => searchTaxa(u.searchParams.get("q") ?? "")],
  [/^\/api\/bugs\/taxon\/([^/]+)$/, m => taxon(decodeURIComponent(m[1]))],
  [/^\/api\/bugs\/tables$/, () => bugsTables()],
  [/^\/api\/bugs\/table\/([^/]+)$/, (m, u) => bugsTable(decodeURIComponent(m[1]), u.searchParams)],
  [/^\/api\/bugs\/filters$/, () => bugsFilters()],
  [/^\/api\/bugs\/analyze$/, (_, u) => bugsAnalyze({
    country: u.searchParams.get("country") ?? undefined, period: u.searchParams.get("period") ?? undefined,
    habitat: u.searchParams.get("habitat") ?? undefined, taxon: u.searchParams.get("taxon") ?? undefined,
  })],
  [/^\/api\/bugs\/timeseries$/, (_, u) => bugsTimeSeries(
    (u.searchParams.get("kind") as "taxon" | "habitat" | "country") ?? "taxon", u.searchParams.get("code") ?? "",
    Number(u.searchParams.get("binYears") ?? 500),
  )],
  [/^\/api\/bugs\/habitatmix$/, (_, u) => bugsHabitatMix((u.searchParams.get("sites") ?? "").split(",").map(s => s.trim()).filter(Boolean))],
  [/^\/api\/bugs\/points3d$/, () => bugsPoints3D()],
  [/^\/api\/bugs\/timemachine\/sites$/, () => bugsTimeMachineSites()],
  [/^\/api\/bugs\/today$/, (_, u) => bugsToday(u.searchParams.get("site") ?? "")],
  [/^\/api\/bugs\/timemachine$/, (_, u) => bugsTimeMachine(u.searchParams.get("site") ?? "")],
  [/^\/api\/sead\/sites$/, () => seadSites()],
  [/^\/api\/sead\/site\/(\d+)$/, m => seadSite(Number(m[1]))],
  [/^\/api\/sead\/matches\/([^/]+)$/, m => matchesForBugsSite(decodeURIComponent(m[1]))],
  [/^\/api\/sead\/tables$/, () => seadTables()],
  [/^\/api\/sead\/count\/([^/]+)$/, m => seadTableCount(decodeURIComponent(m[1]))],
  [/^\/api\/sead\/table\/([^/]+)$/, (m, u) => seadTable(decodeURIComponent(m[1]), u.searchParams)],
  [/^\/api\/compare$/, () => compare()],
];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) {
    for (const [re, h] of routes) {
      const m = url.pathname.match(re);
      if (!m) continue;
      try { return json(await h(m, url)); }
      catch (e: any) {
        if (e instanceof HttpError) return json({ error: e.message, seadUnreachable: e.status === 503 && /SEAD/.test(e.message) }, e.status);
        console.error(e);
        return json({ error: String(e?.message ?? e) }, 500);
      }
    }
    return json({ error: "not found" }, 404);
  }
  // static files from the built front end, falling back to index.html for page routes
  const path = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  const file = join(config.distDir, path);
  if (file.startsWith(config.distDir) && path !== "/" && existsSync(file)) return new Response(Bun.file(file));
  const index = join(config.distDir, "index.html");
  if (existsSync(index)) return new Response(Bun.file(index), { headers: { "Content-Type": "text/html" } });
  return new Response("Front end not built yet. Run `bun run build`.", { status: 500 });
}

const server = Bun.serve({ port: config.port, hostname: config.host, fetch: handle, idleTimeout: 120 });
console.log(`\n  BugsCEP + SEAD explorer running at  http://${server.hostname === "0.0.0.0" ? "localhost" : server.hostname}:${server.port}\n`);
