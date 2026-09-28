#!/bin/sh
# Download the BugsCEP database (Microsoft Access .mdb) and convert it to SQLite.
# Needs: curl, unzip, sqlite3, mdbtools (macOS: brew install mdbtools; Debian/Ubuntu: apt install mdbtools).
# Output: data/bugs.sqlite (or $BUGS_DB if set).
set -e
cd "$(dirname "$0")/.."
OUT="${BUGS_DB:-data/bugs.sqlite}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for tool in curl unzip sqlite3 mdb-schema mdb-export mdb-tables; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing tool: $tool (mdb-* tools come from mdbtools)"; exit 1; }
done
echo "Downloading bugsdata.zip from bugscep.com ..."
# bugscep.com rejects curl's default user agent
curl -fL -A "Mozilla/5.0 (Macintosh)" -o "$TMP/bugsdata.zip" "https://www.bugscep.com/downloads/bugsdata.zip"
unzip -q -o "$TMP/bugsdata.zip" -d "$TMP"
MDB="$(find "$TMP" -iname '*.mdb' | head -n 1)"
[ -n "$MDB" ] || { echo "no .mdb file found in the zip"; exit 1; }
echo "Converting $(basename "$MDB") to SQLite ..."
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT.tmp"
mdb-schema "$MDB" sqlite | sqlite3 "$OUT.tmp"
mdb-tables -1 "$MDB" | while IFS= read -r t; do
  mdb-export -I sqlite -D '%Y-%m-%d' "$MDB" "$t" | sqlite3 "$OUT.tmp"
done
mv "$OUT.tmp" "$OUT"
echo "Built $OUT ($(sqlite3 "$OUT" "select count(*) from sqlite_master where type='table'") tables)"
