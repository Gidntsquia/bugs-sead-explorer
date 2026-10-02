# AGENTS.md — repo facts

## Stack and commands
- Bun 1.3 server (`server/`, `bun:sqlite`) + React 19 / TypeScript / Vite 8 / Tailwind v4 front end (`web/`, built to `dist/`).
- `bun start` installs, builds and serves on http://127.0.0.1:5178 (`PORT`, `HOST`, `BUGS_DB`, `SEAD_URL`, `CACHE_DIR`, `SEAD_CACHE_HOURS` in `.env`; see `.env.example`).
- Dev: `bun run dev:server` + `bun run dev:web` (Vite proxies `/api`). `bun run typecheck`.
- Data: `data/bugs.sqlite` (gitignored, ~62 MB) from `scripts/get-bugs-data.sh` or copied from `../mcp-investigations/data/bugs.sqlite`. Never commit it. Never edit `mcp-investigations`.
- No absolute home-directory paths in code.

## BugsCEP (SQLite) quirks
- The server copies the read-only file into an in-memory DB at start.
- `INDEX` is a table name; always quote it (`"INDEX"`).
- Sample identity is `SampleCODE`; sample names repeat across sites, so never key samples by name.
- MCR exists for only 436 taxa (`TMCRSummaryData`). Helophorus rufipes (7.005001) has none, in BugsCEP or SEAD. Aphodius prodromus (85.019044) is a good MCR example.

## SEAD PostgREST (`https://browser.sead.se/postgrest`) quirks
- Aggregate functions are disabled; use `Prefer: count=exact` with `limit=0`/`Range` to count.
- `tbl_sample_alt_refs` with `alt_ref_type_id=12` holds BugsCEP sample codes (SAMP…): the reliable site link.
- `tbl_datasets.master_set_id = 1` means the dataset came from BugsCEP (13,433 of ~59,052).
- CORS is `*`. Be polite: max 3 concurrent requests, disk cache under `data/cache/sead`, no bulk downloads.

## Testing
- Chrome extension may be absent; headless Playwright (playwright-core + the cached chromium headless shell in `~/Library/Caches/ms-playwright`) works for screenshots and clicks. Install playwright-core in a scratch dir outside the repo, not in `package.json`.
- Offline test: run with `SEAD_URL=http://127.0.0.1:9/postgrest` and a throwaway `CACHE_DIR`.

## Analysis and 3D view (round 4)
- Frontend pages: `web/src/pages/Analyze.tsx` (tabs: filter/chart, change-over-time, habitat mix — via `?tab=`), `web/src/pages/View3D.tsx` (Three.js scene).
- Server routes in `server/bugs.ts` / `server/index.ts`: `bugs/filters`, `bugs/analyze`, `bugs/timeseries`, `bugs/habitatmix`, `bugs/points3d`.
- `bugsTimeSeries` drops empty bins before returning (`bins.filter(b => b.samples > 0)`) — otherwise sparse/undated date ranges produce thousands of near-empty bins. The frontend `<XAxis type="category">` (not `"number"`) spaces bins evenly by order, not literal years, so one extreme outlier (e.g. a Pliocene-age sample) can't squash the rest of the chart.
- 3D view renders points as a single `THREE.InstancedMesh`, not one `THREE.Mesh` per point — 9,000+ individual meshes hangs headless (software/swiftshader) WebGL rendering. Picking uses `raycaster.intersectObjects(meshes)[0].instanceId` to index back into the points array (no per-object `userData` on an InstancedMesh hit). Renderer uses `antialias: false`, `powerPreference: "low-power"`, `setPixelRatio(1)` to keep frame cost low.
- Samples with no recorded depth are placed on a fixed floor plane (`NO_DEPTH_Y`), not hidden or given a fabricated depth.
- `three` and `@types/three` are dependencies (added this round).

## Time machine (round 5)
- Page `web/src/pages/TimeMachine.tsx`; routes `bugs/timemachine?site=` and `bugs/timemachine/sites` in `server/bugs.ts`. Slice/MCR/ghost logic is in `shared/timemachine.ts` (tests: `bun test shared`). The page is picture-first (round 6): a sample strip (bars keyed by SampleCODE, linear BP axis, no interpolation across gaps), a slider whose stops are every range boundary and midpoint of the site's samples (`?year=` snaps to the nearest stop), a thermometer glyph and a tile grid. The server's `curve` is no longer used by the page. One tint ramp (`tint()`) is used everywhere.
- Per sample, a `TDatesPeriod` range is dropped if the sample has radiocarbon/calendar dates; otherwise broad period labels (e.g. Llanilid's 10,000-13,500 "Late Glacial") put every sample in every slice. Multiple dates on a sample are a set union.
- With many species the strict MCR intersection collapses to a point (Llanilid ~13 C) or is empty, so many slices show the near-miss line.

## Time machine (round 7)
- Headline block (tinted by the slice's summer midpoint, "N °C colder/warmer than today", "Summers like <place>") replaces the thermometer; tiles sit in four fixed bins (<12 / 12–16 / >16 / no data); strip bars are tinted per sample. Page stays in `web/src/pages/TimeMachine.tsx`; `shared/timemachine.ts` unchanged.
- Server route `bugs/today?site=` (`bugsToday` in `server/bugs.ts`) averages July daily means 1991–2020 from Open-Meteo ERA5, cached forever in `CACHE_DIR/openmeteo/<site>.json`; failures return `null` and are not cached. `OPENMETEO_URL` overrides the host (point at a dead port for the offline test; `SEAD_URL` alone does not stop it).
- Llanilid: every slice's strict MCR estimate is 13 °C, so the headline reads "3 °C colder than today" at all stops; only the column counts and the "best fit" tag change.
