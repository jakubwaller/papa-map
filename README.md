# papa-map

**PapaMap — Wickeltische, die ein Vater erreicht.**

A static map of places across Germany with a baby changing table, colored by whether a dad can
actually reach it: **green** = accessible room (men's/unisex/dedicated/wheelchair),
**red** = women's room only, **grey** = table exists but nobody has recorded which room —
the call to action. Every grey pin deep-links to the same object on MapComplete so the
missing answer becomes an OpenStreetMap contribution. OSM is the only data source and the
only write destination; this repo owns no data and writes nothing to OSM itself.

Why: Google Maps, Apple Maps and Yelp have no changing-table attribute at all, and OSM's
`changing_table:location` is the only open vocabulary on Earth recording *which room* a
table is in — globally ~485 places record a women's-room-only table vs ~71 men's-room-only
(~7:1). A full toilet-provision scorecard is impossible from open data (we checked), so
this site measures what is measurable and turns the gaps into edits. The honest full story,
including the exact classification rule: [`web/methods.html`](web/methods.html).

## Setup
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```
(Code targets Python 3.9+; `from __future__ import annotations` keeps the union
type hints working on the system Python.)

## Build the dataset
```bash
python -m pipeline.run   # Overpass + taginfo -> web/data/changing_tables.geojson + stats.json
```
The default build sweeps all 16 Bundesländer and merges the results (an
all-Germany area query dies at a 60 s network idle cutoff; the per-Land queries
take seconds each, ~5 min in total). `PAPAMAP_AREA_NAME` +
`PAPAMAP_AREA_ADMIN_LEVEL` select a single area instead (e.g. `Hamburg` / `4`),
`PAPAMAP_DISPLAY_AREA` names the dataset in the stats strip.

## Serve locally
```bash
python3 -m http.server -d web 8000   # http://localhost:8000
```

## Tests
```bash
pip install -r requirements-dev.txt   # adds pytest
pytest -v                  # pipeline (Python, offline — fixtures only)
node --test web/*.test.js  # frontend pure functions (needs Node.js)
```

## Cron (Raspberry Pi)
```cron
0 4 * * * cd /path/to/papa-map && ./.venv/bin/python -m pipeline.run >> pipeline.log 2>&1
```
(Paths match the Pi deploy in [`docs/DEPLOY.md`](docs/DEPLOY.md) — adjust if your clone
lives elsewhere.)

An optional second cron line runs `python -m pipeline.ops`: an anomaly-gated ops mail
(stale data, missing files, count drops) plus a Monday all-clear digest with the week's
grey→green transitions — see the "Ops mail" section in `docs/DEPLOY.md`.

## Deploy
Static files only — no API, no database, no container needed for v0. Raspberry Pi + Caddy
`file_server` instructions: [`docs/DEPLOY.md`](docs/DEPLOY.md).

Live at [papamap.de](https://papamap.de) (`www.papamap.de` and `papamap.jakubwaller.eu` redirect there).

## Licences
Code: MIT (see `LICENSE`). Data: © OpenStreetMap contributors,
[ODbL](https://opendatacommons.org/licenses/odbl/) — attribution details in
[`web/methods.html`](web/methods.html).
