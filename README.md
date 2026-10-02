# Beetles & Buried Time 🪲

<!-- TODO: screenshot or gif of the Time machine page (docs/time-machine.png) -->

A web app for exploring fossil beetle records from [BugsCEP](https://www.bugscep.com) (~1,400 sites, plus what each species needs to live today) and the [Strategic Environmental Archaeology Database](https://www.sead.se) (SEAD) at Umeå University. BugsCEP is read from a local SQLite file and SEAD is queried live from its public API. The app opens on a map of sites, and every technical word has a hover explanation.

The Time machine picks a dated site and tells you whether its summers were warmer or colder than today, using the temperatures the beetles in each sample can live in.

## Quickstart 🚀

Requires [Bun](https://bun.sh) 1.3+, plus `mdbtools` for the first-time data download.

```
git clone https://github.com/Gidntsquia/bugs-sead-explorer
cd bugs-sead-explorer
./scripts/get-bugs-data.sh   # Downloads BugsCEP and converts it to data/bugs.sqlite (~30 s, 62 MB, needed once)
bun start                    # Installs, builds and serves on http://127.0.0.1:5178
```

IMPORTANT: the data file isn't in git, so the app won't start until `data/bugs.sqlite` exists. If you already have a converted copy, put it there instead of running the script.

Other commands:

```
bun run dev:server   # API with hot reload (run next to dev:web)
bun run dev:web      # Vite dev server on http://127.0.0.1:5173
bun run typecheck    # Checks the TypeScript
```

Settings (port, data file path, SEAD address, cache time) go in `.env`; copy `.env.example` to start one.

## Features 🔬

- A map of all BugsCEP sites with matching SEAD records, plus species lookup and a raw table browser.
- Filter by country, period, habitat group or species and see site, sample, individual and taxa counts with charts.
- A change-over-time chart for a species, habitat group or country, binned from 100 to 1000 years.
- A habitat mix view that compares the share of beetles per habitat group at one or two sites.
- A 3D view of every located sample, with height from age and colour from dominant habitat.
- A Time machine with a "colder or warmer than today" headline, a strip of dated samples and the beetles in each slice sorted by the temperatures they live in.
- A BugsCEP vs SEAD comparison page and a glossary.
- If SEAD can't be reached, a banner says so and everything from BugsCEP keeps working.

## Documentation 📚

More details in the [docs](docs) folder:

- [Getting the BugsCEP Data](docs/Getting-the-BugsCEP-Data.md) — download, convert, or reuse a copy
- [Analyses](docs/Analyses.md) — filter, time series, habitat mix, 3D view
- [Time Machine](docs/Time-Machine.md) — headline, strip, temperature bins, Open-Meteo
- [How SEAD Is Used](docs/How-SEAD-Is-Used.md) — request limits, caching, development, layout
- [Putting It Online](docs/Putting-It-Online.md) — hosting needs and open licence questions
- [Data Sources and Citation](docs/Data-Sources-and-Citation.md) — BugsCEP, SEAD, Open-Meteo

## License 📄

[MIT](LICENSE). BugsCEP and SEAD data are downloaded or queried at run time and aren't distributed in this repo; check their terms before public or commercial use.
