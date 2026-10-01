# Beetles & Buried Time — a BugsCEP + SEAD explorer

A small web app for looking around two databases of evidence about past environments:

- **BugsCEP** — fossil beetles from ~1,400 sites, plus what each species needs to live today. Read from a local SQLite file.
- **SEAD** — the Strategic Environmental Archaeology Database (Umeå University). Read live from its public API at `https://browser.sead.se/postgrest`.

It opens straight onto a map of sites. Species lookup, an analysis page (filter/chart, change over time, habitat mix), a 3D view of sites/samples/ages, a raw table browser, BugsCEP-vs-SEAD comparison and a glossary are the other views, reached from the sidebar. Every technical word has a hover explanation.

### Analyses

- **Filter and chart** (`/analyze?tab=filter`) — filter by country, period, habitat group or species; site/sample/individual/taxa counts and charts (by family, habitat, period) update live; a list of matching sites links back to the map. Clearing filters returns to all 1,425 BugsCEP sites.
- **Change over time** (`/analyze?tab=time`) — pick a species, habitat group or country and see individuals/samples across dated samples, binned by year range (100–1000 years, your choice). Each dated sample gets one age (calendar date, else radiocarbon/radiometric midpoint, else period midpoint); undated samples are excluded and counted separately. Empty bins are dropped and the chart axis is spaced by bin order, not literal years, so one far outlier can't squash the rest — check a bin's label for its real date range.
- **Habitat mix** (`/analyze?tab=habitat`) — for a site (or two, side by side), see the share of beetle individuals per BugsCEP habitat group, per sample and overall. Individuals with no habitat code are shown as their own explicit slice, not dropped.
- **3D view** (`/view3d`) — every dated (or undated-but-located) sample as a point in 3D: x/y from site coordinates, height from age (older = higher, BP), colour from dominant habitat. Drag to orbit, scroll to zoom, WASD to fly, click a point to open its record. Samples with no recorded depth sit on a visible floor plane rather than being hidden or given a made-up depth.
- **Time machine** (`/timemachine?site=SITE…`) — pick a dated site, slide through its age range and see the beetles in that slice, a summer/winter temperature estimate from the overlap of their MCR ranges (needs at least 5 MCR species; shows the best-agreeing range when they conflict), and "ghost" species whose modern range text doesn't mention the site's country. Indicative only: MCR covers 436 of 11,420 taxa.

Species and site pages link into these analyses, and the analyses link back to the map/species pages.

## 1. Get the BugsCEP data (once)

The app needs BugsCEP as a SQLite file at `data/bugs.sqlite`. The data file is not in git.

**Option A: download and convert (about 30 seconds).**

```sh
brew install mdbtools          # Debian/Ubuntu: sudo apt install mdbtools
./scripts/get-bugs-data.sh
```

The script:

1. Downloads `https://www.bugscep.com/downloads/bugsdata.zip`. It sends a browser user agent, because bugscep.com rejects curl's default one.
2. Unzips it to get `bugsdata.mdb`, a Microsoft Access file.
3. Converts every table to SQLite with `mdb-schema` and `mdb-export`.
4. Writes `data/bugs.sqlite` (about 62 MB, 43 tables).

It needs `curl`, `unzip`, `sqlite3` and mdbtools.

**Option B: reuse an existing converted copy.** If you already have one (for example in the sibling `mcp-investigations` project), either copy it to `data/bugs.sqlite` or point the app at it:

```sh
cp ../mcp-investigations/data/bugs.sqlite data/bugs.sqlite
# or: echo "BUGS_DB=../mcp-investigations/data/bugs.sqlite" > .env
```

The app opens the file read-only and never changes it.

## 2. Run it

Needs [Bun](https://bun.sh) 1.3 or newer.

```sh
bun start
```

This installs dependencies, builds the web page, and starts the server. It prints:

```
BugsCEP + SEAD explorer running at  http://127.0.0.1:5178
```

Open that URL.

- Settings (port, data file path, SEAD address, cache time) are in `.env`; copy `.env.example` to start one. All paths are relative to this folder.
- For development with hot reload, run `bun run dev:server` and `bun run dev:web` in two terminals, then open the Vite URL (http://127.0.0.1:5173).
- `bun run typecheck` checks the TypeScript.

### How SEAD is used

- SEAD is queried live, but politely.
  - At most 3 requests run at once.
  - Every answer is saved in `data/cache/sead/` and reused for 24 hours (`SEAD_CACHE_HOURS`).
  - Nothing is bulk-downloaded.
- The biggest single request is the list of all ~59,000 SEAD datasets (two numbers each), which the comparison page needs. It takes about 15–20 s the first time and is then served from the cache.
- If SEAD can't be reached, a banner says so and each SEAD panel shows "SEAD is unreachable". Everything from BugsCEP keeps working.
  - The map's country outlines ship with the app, so the map still shows land offline.
  - Map tiles come from openstreetmap.org and need the internet.

## 3. What putting it online would take

The app is one Bun process that serves both the API and the built page. It needs the SQLite file next to it.

**Known:**

- **Server:** any host that can run Bun (a small VM, Fly.io, Railway, a Docker container). Set `HOST=0.0.0.0` and `PORT`, and ship `data/bugs.sqlite` (62 MB) with it or mount it. Memory use measured at about 90 MB just after start (BugsCEP is copied into memory); it grows as SEAD answers are cached.
- **SEAD cross-origin access:** checked on 2026-09-27. `browser.sead.se/postgrest` sends `Access-Control-Allow-Origin: *`, so a browser on another website could call it directly. This app calls SEAD from its own server anyway, so it can cache answers and stay polite.
- **Cache:** `data/cache` must be writable. If it isn't, the app still works but asks SEAD more often.
- **HTTPS, a domain name and a process manager** come from the host.

**Not known yet (labelled unknowns):**

- **BugsCEP licence (unknown).** Whether the BugsCEP data may be re-published or served on a public website has not been checked. The download is public, but the terms are not stated next to it. Ask the BugsCEP maintainers before going public.
- **SEAD licence and terms of use (unknown).** The API needs no login. What SEAD's data licence requires (attribution wording, allowed uses) has not been checked.
- **SEAD rate limits (unknown).** No rate-limit headers were seen, and none are documented where we looked. A public site with many users would lean on the cache; a longer `SEAD_CACHE_HOURS` would reduce load further.
- **SEAD API stability (unknown).** `browser.sead.se/postgrest` is the endpoint SEAD's own browser uses. It is not documented as a public API with a stability promise, so table or column changes could break parts of the app. `api.sead.se` did not answer when tried.
- **OpenStreetMap tiles.** The public tile server allows light use with attribution (shown on the map). Heavy public traffic would need another tile provider.

## Project layout

```
server/        Bun server: BugsCEP (bun:sqlite), SEAD client + cache, site matching, table descriptions
web/           React + Vite + Tailwind front end
scripts/       get-bugs-data.sh (download + convert BugsCEP)
data/          bugs.sqlite and the SEAD cache (not in git)
```

## Data sources and citation

This app is a viewer; it does not own or redistribute the underlying data. No data files are in this repository — see "Get the BugsCEP data" above.

- **BugsCEP** — the Bugs Coleopteran Ecology Package. Buckland, P.I. and Buckland, P.C. *BugsCEP Coleopteran Ecology Package*, [bugscep.com](https://www.bugscep.com). See also: Buckland, P.I., 2014. "The Bugs Coleopteran Ecology Package (BugsCEP) database: 1000 sites and half a million fossils later." *Quaternary International*, 341, pp.192–205.
- **SEAD** — the Strategic Environmental Archaeology Database, Umeå University, Sweden. [sead.se](https://www.sead.se). Queried live from `https://browser.sead.se/postgrest`; see SEAD's own site for its citation and licence terms.

Check each project's own terms before any public or commercial use of their data.
