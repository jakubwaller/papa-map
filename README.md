# papa-map

**PapaMap — Wickeltische, die ein Vater erreicht.**

A static map of places across Germany and Denmark with a baby changing table, colored by whether a
dad can actually reach it: **green** = accessible room (men's/unisex/dedicated/wheelchair),
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
python -m pipeline.run   # Overpass + taginfo -> web/data/*.json + web/wickeltische/*.html
```
The default build sweeps all 16 Bundesländer plus Denmark and merges the
results (an all-Germany area query dies at a 60 s network idle cutoff, so
Germany stays chunked per Land; Denmark is small enough to answer whole in one
`admin_level=2` query, ~15 s). ~5 min in total.

- `PAPAMAP_COUNTRIES=dk` builds one country only (`de,dk` is the default) — an
  unknown code aborts rather than silently sweeping less.
- `PAPAMAP_AREA_NAME` + `PAPAMAP_AREA_ADMIN_LEVEL` select a single area instead
  (e.g. `Hamburg` / `4`), and `PAPAMAP_DISPLAY_AREA` names the dataset in the
  stats strip.

## Bundesland pages

The same run writes one static German page per Bundesland into
`web/wickeltische/` (git-ignored — they are build output), plus an index at
`web/wickeltische/index.html`. The map is a single URL for two countries, so a
search for "Wickeltisch Bayern" had nothing to match: the place names live
inside a 2.6 MB GeoJSON that crawlers read as a download. These pages put each
Land's counts and its named places into HTML, and link back into the map at that
Land's extent via `?bbox=`.

Which Land an object belongs to is recorded during the sweep — it is free, since
the sweep is already chunked per Land, and the GeoJSON carries no region field.
So the pages only appear on a build that sweeps German Länder: `PAPAMAP_COUNTRIES=dk`
or a hand-named single area outside the 16 writes none rather than publishing an
index that claims Germany has one Bundesland.

The 16 URLs are fixed (the names are a constant in `pipeline/config.py`), so
they are listed by hand in `web/sitemap.xml`; `tests/test_pages.py` asserts that
list matches the slugs the generator writes. `PAPAMAP_PAGES_DIR` moves the
output elsewhere.

## Play corners

Every feature carries a boolean `play`: true when the object also records an
indoor place for the kid to play (`kids_area:indoor` or `kids_area` =
`yes|indoor|designated`, `leisure=indoor_play`, or `leisure=playground` +
`indoor=yes`). `outdoor`, `no` and `limited` are excluded, and an explicit
`kids_area:indoor=no` overrules a bare `kids_area=yes`. The map draws it as a
blue halo under the pin and the chip bar gains a filter that narrows to those
places.

It is a badge, not a fourth status. A missing `kids_area` is silent across all
~13k pins and means nothing, so — unlike a grey `changing_table:location` pin —
there is no "unknown" state to render and no call to action attached to it. The
chip therefore starts **off** and subtracts, while the three status chips start
on. Costs no extra Overpass query: the sweep already returns every tag on these
objects. DE+DK on 17 Aug 2026: 828 objects pass the rule and 111 of them are
already pins (48 accessible / 13 female_only / 50 unknown).

## Places to play

The other 701 pass the same rule and carry no `changing_table` tag at all, so
they are not pins and never could be — nobody has answered the first question
about them. They get their own file, `web/data/play_places.geojson`, their own
hollow-blue-ring layer and their own chip, off by default. `changing_table=no`
places stay out: somebody did answer.

They are the best-targeted open questions on the map. A father with a toddler
is going to an indoor playground or a café with a ball pit anyway, and while he
is there he knows the answer. So the popup leads with the MapComplete link, the
theme has a `dad_play_place` layer so that link lands on a selectable object,
and the layer's first question is "does this place have a baby changing table?"

The sweep pays nothing for them: one union Overpass query per area returns both
halves, and `osm.split_sweep()` sorts them apart by tag.

## Leaderboard

A full build also appends one entry per day to `web/data/history.json` —
`[accessible, female_only, unknown]` counts per Bundesland/Denmark and per big
city (the curated `CITY_AREAS` list, membership via one ids-only Overpass query
per city) — and renders `web/wickeltische/rangliste.html` (German) plus
`leaderboard.html` (English) from it. The tables rank the **change** of the
answered share in percentage points against a snapshot at least a week back,
never the absolute counts: levels measure mapping thoroughness, movement
measures people answering the room question, and only the latter is an honest
race. A same-date re-run replaces its history entry; partial builds write no
history at all.

`python -m pipeline.backfill 2026-07-17 2026-07-24 ...` seeds past days from
Overpass attic (`[date:...]`) queries so the page can show a real week-over-week
delta from day one. It never overwrites a day that already exists. Attic queries
over a whole Land run for minutes, so give it `PAPAMAP_OVERPASS_QL_TIMEOUT=300`
and a host without a 60 s connection cutoff (see `docs/DEPLOY.md`).

Every Overpass answer is checked for freshness (`osm3s.timestamp_osm_base`,
`PAPAMAP_OVERPASS_MAX_DATA_AGE_H`, default 24 h): a mirror serving a frozen
database is skipped, because a region quietly computed from months-old data is
a data bug on the map and a fake mover on the leaderboard.

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

## Cron
```cron
30 4 * * * cd /path/to/papa-map && docker compose run --build --rm pipeline >> pipeline.log 2>&1
```
(Matches the deploy in [`docs/DEPLOY.md`](docs/DEPLOY.md) — adjust if your clone lives
elsewhere. Running the pipeline outside Docker works too; the venv variant is in the same
file.)

An optional second cron line runs `python -m pipeline.ops`: an anomaly-gated ops mail
(stale data, missing files, count drops) plus a Monday all-clear digest with the week's
grey→green transitions — see the "Ops mail" section in `docs/DEPLOY.md`.

## Deploy
Static files only — no API and no database. The site runs as a `caddy:2-alpine` container
that bind-mounts `web/`, so `git pull` is the deploy; serving the directory with any static
web server works just as well. Instructions: [`docs/DEPLOY.md`](docs/DEPLOY.md).

Live at [papamap.de](https://papamap.de) (`www.papamap.de` and `papamap.jakubwaller.eu` redirect there).

## Licences
Code: MIT (see `LICENSE`). Data: © OpenStreetMap contributors,
[ODbL](https://opendatacommons.org/licenses/odbl/) — attribution details in
[`web/methods.html`](web/methods.html).
