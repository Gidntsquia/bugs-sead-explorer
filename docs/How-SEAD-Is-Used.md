# How SEAD Is Used

- SEAD is queried live, but politely.
  - At most 3 requests run at once.
  - Every answer is saved in `data/cache/sead/` and reused for 24 hours (`SEAD_CACHE_HOURS`).
  - Nothing is bulk-downloaded.
- The biggest single request is the list of all ~59,000 SEAD datasets (two numbers each), which the comparison page needs. It takes about 15-20 s the first time and is then served from the cache.
- If SEAD can't be reached, a banner says so and each SEAD panel shows "SEAD is unreachable". Everything from BugsCEP keeps working.
  - The map's country outlines ship with the app, so the map still shows land offline.
  - Map tiles come from openstreetmap.org and need the internet.

## Development

- Settings (port, data file path, SEAD address, cache time) are in `.env`; copy `.env.example` to start one. All paths are relative to the project folder.
- For development with hot reload, run `bun run dev:server` and `bun run dev:web` in two terminals, then open the Vite URL (http://127.0.0.1:5173).
- `bun run typecheck` checks the TypeScript.

## Project layout

```
server/        Bun server: BugsCEP (bun:sqlite), SEAD client + cache, site matching, table descriptions
web/           React + Vite + Tailwind front end
scripts/       get-bugs-data.sh (download + convert BugsCEP)
data/          bugs.sqlite and the SEAD cache (not in git)
```
