import { resolve } from "node:path";

// Everything is relative to the project folder unless overridden in .env
const root = resolve(import.meta.dir, "..");

export const config = {
  root,
  port: Number(process.env.PORT ?? 5178),
  host: process.env.HOST ?? "127.0.0.1",
  bugsDb: resolve(root, process.env.BUGS_DB ?? "data/bugs.sqlite"),
  seadUrl: (process.env.SEAD_URL ?? "https://browser.sead.se/postgrest").replace(/\/$/, ""),
  cacheDir: resolve(root, process.env.CACHE_DIR ?? "data/cache"),
  // how long SEAD answers are reused before asking SEAD again (hours)
  seadCacheHours: Number(process.env.SEAD_CACHE_HOURS ?? 24),
  openMeteoUrl: (process.env.OPENMETEO_URL ?? "https://archive-api.open-meteo.com").replace(/\/$/, ""),
  distDir: resolve(root, "dist"),
};
