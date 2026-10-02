# Putting It Online

The app is one Bun process that serves both the API and the built page. It needs the SQLite file next to it.

## Known

- **Server:** any host that can run Bun (a small VM, Fly.io, Railway, a Docker container). Set `HOST=0.0.0.0` and `PORT`, and ship `data/bugs.sqlite` (62 MB) with it or mount it. Memory use measured at about 90 MB just after start (BugsCEP is copied into memory); it grows as SEAD answers are cached.
- **SEAD cross-origin access:** checked on 2026-09-27. `browser.sead.se/postgrest` sends `Access-Control-Allow-Origin: *`, so a browser on another website could call it directly. This app calls SEAD from its own server anyway, so it can cache answers and stay polite.
- **Cache:** `data/cache` must be writable. If it isn't, the app still works but asks SEAD more often.
- **HTTPS, a domain name and a process manager** come from the host.

## Not known yet

- **BugsCEP licence (unknown).** Whether the BugsCEP data may be re-published or served on a public website has not been checked. The download is public, but the terms are not stated next to it. Ask the BugsCEP maintainers before going public.
- **SEAD licence and terms of use (unknown).** The API needs no login. What SEAD's data licence requires (attribution wording, allowed uses) has not been checked.
- **SEAD rate limits (unknown).** No rate-limit headers were seen, and none are documented where we looked. A public site with many users would lean on the cache; a longer `SEAD_CACHE_HOURS` would reduce load further.
- **SEAD API stability (unknown).** `browser.sead.se/postgrest` is the endpoint SEAD's own browser uses. It is not documented as a public API with a stability promise, so table or column changes could break parts of the app. `api.sead.se` did not answer when tried.
- **OpenStreetMap tiles.** The public tile server allows light use with attribution (shown on the map). Heavy public traffic would need another tile provider.
