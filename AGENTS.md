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
- Chrome extension may be absent; headless Playwright (playwright-core + the cached chromium headless shell in `~/Library/Caches/ms-playwright`) works for screenshots and clicks.
- Offline test: run with `SEAD_URL=http://127.0.0.1:9/postgrest` and a throwaway `CACHE_DIR`.
