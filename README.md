# papa-map

**PapaMap — Wickeltische, die ein Vater erreicht.**

A static map of places across 44 European countries — from Iceland to Cyprus, from Portugal
to Ukraine — with a baby changing table, colored by whether a
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
A fresh checkout sweeps all 16 Bundesländer plus Denmark and merges the
results (an all-Germany area query dies at a ~60 s network idle cutoff, so
Germany stays chunked per Land; Denmark is small enough to answer whole in one
`admin_level=2` query, ~15 s). ~5 min in total. papamap.de sweeps more than
that — see the first bullet. Germany is no longer the only chunked country:
France is swept as its 13 metropolitan régions for exactly the same reason,
measured on 19 Aug 2026 as an empty reply at 60.14 s for the country whole.

- `PAPAMAP_COUNTRIES` picks the countries. **The code default is `de,dk`** — a
  fresh checkout and the test suite build Germany + Denmark, and that stays
  that way on purpose, so neither depends on a 44-country sweep.
  **The deployment sets the variable instead:** `docker-compose.yml` carries
  the full `PAPAMAP_COUNTRIES` list, so papamap.de sweeps 44 European
  countries — every European sovereign from Iceland to Cyprus except
  Vatican City (too small to survive the zero-objects check) and the
  transcontinental states.
  Codes are ISO 3166-1 alpha-2, so the UK is **`gb`**, not `uk`, and Kosovo
  is the user-assigned **`xk`**. All but two of them
  are one `admin_level=2` area each, the way Denmark is. `fr` is 13 areas, one
  per metropolitan région, and `de` is the 16 Bundesländer — the only two
  chunked countries. So `PAPAMAP_COUNTRIES=dk` builds Denmark alone and
  `de,dk,at,ch` adds the German-speaking neighbours; an unknown code aborts
  rather than silently sweeping less. (The map's `maxBounds` is
  `[[-32,27],[41,71.5]]`, each edge set by a real pin — the Azores west,
  the Canary Islands south, Ukraine east, Nordkapp north; `web/app.js`
  documents all four. Check it *with* any expansion, not after.)
- Every country since the 2026-08-18 ring is matched on `name:en`, because a country's own `name`
  can be several languages at once — Belgium is "België / Belgique / Belgien",
  Switzerland "Schweiz/Suisse/Svizzera/Svizra" — and a `name=` miss resolves to
  zero objects, which the build can only read as a failed sweep. Their region
  labels, on the leaderboard and in `history.json`, are therefore the English
  names. Germany and Denmark keep `name=`: `Deutschland` and `Danmark` are
  existing history keys. The United Kingdom keeps it too — its `name` and
  `name:en` are the same string. **France's régions must use `name=`**, where
  `name:en` would actively break: it is `Bourgogne – Franche-Comté` with an en
  dash, `Ile-de-France` with the accent dropped, and translated for four of the
  thirteen. The 13 are an allowlist, not a subdivision — the five overseas
  régions are `admin_level=4` too, and sweeping them would put pins in the
  Caribbean, outside `maxBounds` where nothing can be panned to.
- A build of three or more countries names itself by count rather than by name:
  `stats.json`'s `area_key` becomes `countries_<n>` (`countries_44` for all
  44), since the joined labels overflow the stats strip. One and two
  countries keep `de` / `dk` / `de_dk`.
- `PAPAMAP_AREA_NAME` + `PAPAMAP_AREA_ADMIN_LEVEL` select a single area instead
  (e.g. `Hamburg` / `4`), and `PAPAMAP_DISPLAY_AREA` names the dataset in the
  stats strip.

## Area pages

The same run writes one static page per swept area into `web/wickeltische/`
(git-ignored — they are build output). The map is a single URL for every
country it sweeps, so a search for "Wickeltisch Bayern" — or "puslebord
Danmark", or "table à langer Bretagne" — had nothing to match: the place names
live inside a multi-megabyte GeoJSON that crawlers read as a download. These
pages put each area's counts and its named places into HTML, and link back
into the map at that area's extent via `?bbox=`.

Each page is written in the language its readers search in, which is the whole
point of their existing: German for the 16 Bundesländer (plus their index at
`web/wickeltische/index.html`) and for Austria and Switzerland, Danish for
`danmark.html`, English for `united-kingdom.html`, French for `france.html` —
a hub over 13 per-région pages — and so on. The routing (including the
inflected name forms prose needs: "in der Schweiz", "w Polsce") lives in
`config.COUNTRY_PAGES` and `pipeline/pages_l10n.py`; slugs are the local
names (`belgie.html`, `cesko.html`, `oesterreich.html`). The map's footer
"Bundesländer" link is language-routed the same way (`regionsHref` in
`web/i18n.js`): the Danish UI links danmark.html, the French UI france.html.
Every page carries a country list linking the others.

Which area an object belongs to is recorded during the sweep — it is free,
since the sweep is already chunked per area, and the GeoJSON carries no region
field. German pages only appear on a build that sweeps all 16 Länder
(`PAPAMAP_COUNTRIES=dk` must not publish an index claiming Germany has one
Bundesland); every other country's page appears whenever that country's sweep
is complete.

The URLs are fixed (the names are constants in `pipeline/config.py`), so they
are listed by hand in `web/sitemap.xml`; `tests/test_pages.py` asserts that
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
objects. Measured on the DE+DK build of 17 Aug 2026: 828 objects pass the rule
and 111 of them are already pins (48 accessible / 13 female_only / 50 unknown).
Those are DE+DK figures and the 44-country sweep is larger, so the served
numbers come from `stats.json` (`local.play_tables`, `local.play_places`) —
the methods pages read them from there rather than repeating a number that
moves every night.

## Places to play

The other 701 of those DE+DK objects pass the same rule and carry no
`changing_table` tag at all, so they are not pins and never could be — nobody
has answered the first question about them. They get their own file,
`web/data/play_places.geojson`, their own hollow-blue-ring layer and their own
chip, off by default. `changing_table=no` places stay out: somebody did answer.

They are the best-targeted open questions on the map. A father with a toddler
is going to an indoor playground or a café with a ball pit anyway, and while he
is there he knows the answer. So the popup leads with the MapComplete link, the
theme has a `dad_play_place` layer so that link lands on a selectable object,
and the layer's first question is "does this place have a baby changing table?"

The sweep pays nothing for them: one union Overpass query per area returns both
halves, and `osm.split_sweep()` sorts them apart by tag.

## Leaderboard

A full build also appends one entry per day to `web/data/history.json` —
`[accessible, female_only, unknown]` counts per region (the 16 Bundesländer,
plus every swept country outside Germany under its own label) and per big
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
0 2 * * * cd /path/to/papa-map && docker compose run --build --rm pipeline >> pipeline.log 2>&1
```
(02:00 since the 44-country sweep — projected ~105 min, and the ops mail is at 05:30.)
(Matches the deploy in [`docs/DEPLOY.md`](docs/DEPLOY.md) — adjust if your clone lives
elsewhere. Running the pipeline outside Docker works too; the venv variant is in the same
file.)

An optional second cron line runs `python -m pipeline.ops`: an anomaly-gated ops mail
(stale data, missing files, count drops **and count jumps** — a widened sweep is not
mapping activity) plus a Monday all-clear digest with the week's
grey→green transitions — see the "Ops mail" section in `docs/DEPLOY.md`.
The same run rewrites a public ops page, `/ops.html`: the report plus last night's per-area
build results, per-region counts and the daily history — aggregates only, no traffic numbers.

## Deploy
Static files only — no API and no database. The site runs as a `caddy:2-alpine` container
that bind-mounts `web/`, so `git pull` is the deploy; serving the directory with any static
web server works just as well. Instructions: [`docs/DEPLOY.md`](docs/DEPLOY.md).

Live at [papamap.de](https://papamap.de) (`www.papamap.de` and `papamap.jakubwaller.eu` redirect there).

## Licences
Code: MIT (see `LICENSE`). Data: © OpenStreetMap contributors,
[ODbL](https://opendatacommons.org/licenses/odbl/) — attribution details in
[`web/methods.html`](web/methods.html).
