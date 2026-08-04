# papa-map — build contract (v0)

> **v2 amendment (4 Aug 2026, Denmark):** the sweep is now per-country
> (`PAPAMAP_COUNTRIES`, default `de,dk`). Germany keeps the 16-Land chunking
> below; Denmark answers whole as one `admin_level=2` area (`Danmark` —
> 933 changing_table + 4,655 toilet objects, 14.5 s measured, Grønland and
> Føroyar excluded by that relation). `stats.json` gains **`area_key`**
> (`"de_dk"` / `"de"` / `"dk"`, or `null` for a hand-named build) next to
> `area_name`: consumers translate the key when they know it and print
> `area_name` verbatim otherwise. The site is now trilingual DE/EN/**DA** —
> the language button cycles DE → EN → DA, a `da*` browser language auto-
> selects Danish (nothing else does), and each language owns a methods page.
> The map opens on a Germany+Denmark viewport.

> **v1 amendment (30 Jul 2026, Germany-wide):** the default build now sweeps all 16
> Bundesländer (`admin_level=4`) and merges + dedups the results — ~13k changing_table +
> ~32k toilet objects. One all-Germany area query was measured to die at a 60 s
> network-path idle cutoff, so the sweep stays chunked and each query keeps
> `[timeout:55]`; a `runtime error` remark in an HTTP-200 Overpass response is treated as
> a retryable failure. `PAPAMAP_AREA_NAME`/`_ADMIN_LEVEL` still select a single area;
> `PAPAMAP_DISPLAY_AREA` names the dataset (default `Deutschland`). The map opens on a
> Germany viewport with a locate button and an add-a-place flow (deep links out to
> MapComplete / the OSM editor). The data contract below is unchanged. City references
> below are the v0 build history.

Binding spec for all build agents. Read fully before writing code. Reference implementation for
patterns: the author's `beer-map` repo (same deploy target). The prior-art sweep and the
potty-parity spike this build rests on are private research notes and are not part of this repo —
everything needed to build is specified below.

## What v0 is

A static map of places with a baby changing table (Hamburg first), colored by whether a dad can
reach the table, with an honest stats strip and deep links that turn data gaps into OSM
contributions. **OSM is the only data source and the only write destination. We own no data.**
Nightly pipeline: Overpass → classify → GeoJSON + stats JSON → static site. No API, no accounts,
no database (SQLite optional as throwaway cache only — not required for v0).

## Repo layout & file ownership (one owner per file — do not touch other agents' files)

- `pipeline/` + `tests/` + `requirements*.txt` — **Agent A (pipeline)**
- `web/` except `web/methods.html` — **Agent B (frontend)**
- `README.md`, `LICENSE` (MIT, © Jakub Waller), `docs/DEPLOY.md`, `web/methods.html` — **Agent C (docs)**
- `theme/` — **Agent D (MapComplete theme)**

## Data contract (A produces, B consumes — this is the interface, do not deviate)

`web/data/changing_tables.geojson` — FeatureCollection, Point geometries (ways/relations via
Overpass `out center`). Feature `properties`:

```json
{
  "osm_type": "node|way|relation",
  "osm_id": 123,
  "name": "string or null",
  "amenity": "toilets|cafe|restaurant|... or null",
  "changing_table": "yes|limited",
  "location_raw": "raw changing_table:location value or null",
  "status": "accessible|female_only|unknown",
  "fee": "string or null",
  "opening_hours": "string or null",
  "osm_url": "https://www.openstreetmap.org/<type>/<id>",
  "mapcomplete_url": "string or null"
}
```

`web/data/stats.json`:

```json
{
  "generated_at": "ISO-8601 UTC",
  "area_name": "Hamburg",
  "area_key": "de_dk | de | dk | null",
  "local": {
    "toilets_total": 443, "ct_objects": 213, "ct_yes": 85, "ct_no": 127, "ct_limited": 1,
    "yes_location_known": 17, "yes_location_unknown": 68,
    "accessible": 0, "female_only": 0, "unknown": 0,
    "capacity_tagged_toilets": 2
  },
  "global": {
    "ct_total": 77287, "location_total": 3659,
    "location_female_only": 485, "location_male_only": 71, "location_male_any": 410,
    "source": "taginfo", "data_until": "date string"
  }
}
```

(Numbers above are the 26 Jul 2026 values — illustrative, pipeline computes fresh ones.)

`"global"` is object-or-null: it is `null` only on a cold start where taginfo is unreachable
and no previous stats.json exists to carry forward. Consumers must tolerate `null` there.

## Classification rule (pure function, unit-tested)

Input: `changing_table` value + `changing_table:location` value (may be null/free text).
Only objects with `changing_table` ∈ {yes, limited} are features; `no` counts only in stats.
Split location on `;`, trim, lowercase → tokens. EXACT token matching (never substring —
`female_toilet` contains `male`!):
- ACCESSIBLE_TOKENS = {male_toilet, unisex_toilet, dedicated_room, room, wheelchair_toilet, sales_area}
- any token ∈ ACCESSIBLE_TOKENS → `accessible`
- else if any token == female_toilet → `female_only`
- else (no location tag, or only unrecognized/free-text tokens) → `unknown`

## Pipeline requirements (Agent A)

- Python 3.9+, every module starts `from __future__ import annotations`. Deps: `requests` only
  (dev: `pytest`). Follow beer-map's `pipeline/osm.py` patterns: Overpass mirror list env
  `OVERPASS_URLS` with retry/backoff on transient statuses, identifying UA
  `papa-map/0.1 (+https://papamap.de; papamap@jakubwaller.eu)`.
- Overpass queries (area = env `PAPAMAP_AREA_NAME`, default `Hamburg`, `admin_level=4` — keep both
  configurable): (1) `nwr["changing_table"](area)` with `out tags center;` (2)
  `nwr["amenity"="toilets"](area)` count + capacity-tag scan (`toilets:num_chambers*` presence)
  for the honesty stat. Global stats from taginfo API
  (`/api/4/key/stats?key=changing_table`, `/api/4/key/values?key=changing_table:location&rp=999...`
  — compute female_only exact, male_only exact, male_any = values containing the male_toilet
  token after `;`-splitting).
- `python -m pipeline.run` = one idempotent build writing both JSON files. Any single upstream
  failure (taginfo down) degrades gracefully (keep last stats.json, log WARN) — never a half-
  written file (write temp + atomic rename).
- `mapcomplete_url`: for `amenity=toilets` objects:
  `https://mapcomplete.org/toilets?z=18&lat=<lat>&lon=<lon>#<osm_type>/<osm_id>` (verify the
  fragment format against MapComplete docs/source if feasible; if unverifiable, still emit — the
  lat/lon params alone land the user next to the feature). Other amenities: null.
- Tests offline only: stub the HTTP layer with recorded fixture JSON (create fixtures from small
  handwritten samples covering every classification branch + a way-with-center + free-text
  location + `02`-style junk values). No live network in tests.

## Frontend requirements (Agent B)

- Copy `web/vendor/` (maplibre-gl.js/.css) from beer-map. Same OSM raster style + attribution,
  Hamburg center. No build step, no npm deps, vanilla ES modules.
- Pins colored by `status`: accessible=green, female_only=red, unknown=grey (colorblind-safe
  shades; grey visually prominent — it's the call to action). Legend + count badges. Filter
  toggles per status. Popup: name/amenity/table info + two links: "Answer on MapComplete" (if
  mapcomplete_url) and "View on OSM" — **every interpolated string goes through `esc()`**
  (OSM data is attacker-controlled; copy beer-map's esc).
- Stats strip above map from stats.json: local (X tables, Y unknown-room → "tap grey pins"),
  global ratio (female-room vs male-room), honesty line ("N toilets mapped here, capacity tags:
  ~2 — provision itself is unmeasurable; see methods"). Link to `methods.html`.
- `datasource.js` = pure functions (load/filter/count) with `node --test` tests in `web/*.test.js`
  (same pattern as beer-map).
- English UI, one German tagline ok. Title: "PapaMap Hamburg — Wickeltische, die Väter erreichen".
- Serve check: `python3 -m http.server -d web` must work with no console errors.

## Methods page (Agent C, `web/methods.html`)

Self-contained HTML (minimal inline CSS, no JS deps). Content (sourced from the private research
notes): why a provision scorecard is impossible from OSM (the 8-city spike + capacity-tag numbers),
the changing_table:location skew as the one computable potty-parity fact, what the colors mean,
how to fix a grey pin (StreetComplete quest — note it's disabled by default; MapComplete), data
licence (ODbL, © OpenStreetMap contributors), and that this site stores nothing itself. Honest,
sourced, no advocacy overclaim. README covers: what/why, quickstart, cron example, link to
DEPLOY.md (Pi + Caddy static file_server, modeled on beer-map's deploy but static-only).

## MapComplete theme (Agent D, `theme/`)

`theme/papamap.theme.json` — a MapComplete custom theme: layer over `amenity=toilets` (+
`changing_table=*` on other amenities if feasible) showing changing-table status with our
green/red/grey logic, asking (established tags only, in EN + DE): changing_table yes/no,
changing_table:location (the approved value list), changing_table:fee. A clearly-separated
optional question group for the *proposed* keys `toilets:num_chambers:female/:male` (numeric,
labeled as draft schema). RESEARCH the current theme JSON format first (MapComplete docs/repo —
it moved to source.mapcomplete.org, GitHub mirror pietervdvn/MapComplete has Docs/) and validate
structure against a real bundled theme (e.g. the toilets theme JSON). `theme/README.md`: exactly
how to load a custom theme in 2026 (studio vs userlayout URL), what was verified vs needs a live
OSM-login test. If full validation is impossible offline, say so explicitly in the README —
do not silently ship something unloadable as if tested.

## Global rules

- Match beer-map's code style (comment density, naming). No frameworks, no TypeScript.
- Nothing in this repo may write to OSM. Contribution happens only via links out to
  MapComplete/StreetComplete/iD.
- Domain `papamap.de` is a placeholder — mark it as such in docs.
- Do not `git commit` — the orchestrator handles commits.
