# Getting the BugsCEP Data

The app needs BugsCEP as a SQLite file at `data/bugs.sqlite`. The data file is not in git.

## Option A: download and convert (about 30 seconds)

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

## Option B: reuse an existing converted copy

If you already have one (for example in the sibling `mcp-investigations` project), either copy it to `data/bugs.sqlite` or point the app at it:

```sh
cp ../mcp-investigations/data/bugs.sqlite data/bugs.sqlite
# or: echo "BUGS_DB=../mcp-investigations/data/bugs.sqlite" > .env
```

The app opens the file read-only and never changes it.
