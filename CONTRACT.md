# papa-map — build contract (v0)

> **v16 amendment (22 Aug 2026, central key locks, scoped):** v5 dropped every
> object carrying a `centralkey` tag other than `no`. That rule was written
> for the German Euro key, where the locked object is normally the single
> accessible cubicle; UK practice breaks it — a toilet block with open male
> and female sections plus a RADAR-key (`centralkey=nks`) disabled cubicle is
> commonly mapped as **one** object (`access=yes` +
> `wheelchair:access=centralkey` + `centralkey=nks`), so the table is
> reachable without the key unless it sits in that cubicle (raised by Robert
> Whittaker, 22 Aug 2026; 28 UK objects were dropped, 13 of them of this
> shape). From v16 the key locks the table only when **`access=centralkey`**
> (the key gates the whole object), or **`changing_table:location` names only
> `wheelchair_toilet`**, or **nothing scopes the key to a sub-part** — the
> scoping tags are `wheelchair:access=centralkey` and `male=yes` /
> `female=yes`. Every other `centralkey` object is an ordinary feature,
> `unknown` until someone records the room. `classify()` therefore takes the
> object's tag dict (third argument) instead of the bare `centralkey` value;
> `centralkey_locked(tags, location=None)` is the single home of the rule and
> `stats.centralkey_locked` keeps its meaning (key-locked drops that would
> otherwise be pins). No change to the emitted shape.

> **v15 amendment (22 Aug 2026, Europe complete):** papamap.de sweeps
> **44 countries** — the eleven of v13 plus every remaining European
> sovereign: `no fi is ie ee lv lt lu li ad mc sm mt es pt it gr cy si sk hu
> hr ro bg rs ba me al mk xk md ua by` (ISO 3166-1 alpha-2; Kosovo is the
> user-assigned `xk`). Each is **one whole `admin_level=2` area selected on
> `name:en`**, extending v11's rule to the whole list — several would break
> on `name` outright ("Ireland / Éire", "Україна"). Germany and France stay
> the only chunked countries. Vatican City is deliberately absent: an area
> with zero `changing_table` **and** zero `amenity=toilets` objects is
> indistinguishable from a failed sweep (`run.py`'s zero-objects check), so
> it cannot join under the current pipeline semantics.
>
> **The emitted shape does not change.** No new feature property, no new
> `stats.json` field, no new file. `area_key` becomes `countries_44`, the
> form v11 contracted and the frontend parses. Region keys in `history.json`
> grow 38 → **71** (16 Länder + 13 régions + 42 whole countries); the set
> stays open, as v13 already required.
>
> **Retraction — v13's implication that overseas territory stays out.**
> France's five overseas régions are excluded by the `FRANCE_REGIONS`
> allowlist, and v13 presented that as the pattern. It does not generalise:
> Spain and Portugal answer **whole**, so the Canary Islands (27.6°N), Ceuta,
> Melilla, Madeira and the Azores (−31.3°W) are *in* the dataset by the same
> mechanism that keeps Guadeloupe out of it — the shape of the OSM relation,
> not a papamap policy. The frontend's `maxBounds` widened to
> `[[-32, 27], [41, 71.5]]` so every swept pin stays pannable-to; the
> France exclusion stands only because its allowlist predates this and its
> removal would re-litigate v13 for no reader benefit.
>
> **UI languages grow nine → 31**, keeping v13's rule that every swept
> country gets at least one of its official languages: the 22 additions are
> `bs ca et es hr is lv lt hu no pt ro sq sk sl fi el be bg mk sr uk` (sr in
> Cyrillic; `no` is Bokmål, with `nb`/`nn` browser tags aliased to it in
> `pickLang`). Skipped on the Romansh precedent — every speaker reads another
> UI language: Luxembourgish, Maltese, Irish, Montenegrin, and Turkish for
> Cyprus. Each language is a `STRINGS` block plus its own `methods-<code>.html`;
> `index.html`'s hreflang block, `sitemap.xml` and the methods pages'
> cross-links must list exactly the same 31 (the sitemap's two multilingual
> clusters and every methods page's hreflang + language nav are generated
> from one table, not hand-typed). The leaderboard renders one page per
> language too (`pipeline/leaderboard_strings.py` is the translation table;
> de/en keep `rangliste.html`/`leaderboard.html` so inbound links survive,
> the rest are `leaderboard-<code>.html`, and every page carries v14's
> country-code column). The 33 new countries join the sweep **without**
> `COUNTRY_PAGES` entries, so v14's per-country pages still cover only the
> eleven — extending them is its own amendment once the page translations
> exist. The site's copy counts the set ("44 European countries") instead
> of naming it everywhere except the JSON-LD `spatialCoverage`, which
> enumerates for machines.

> **v14 amendment (21 Aug 2026, area pages for every country):** the build's
> HTML output grows from the German set to one page per swept area: the v3
> Bundesland pages and their index stay exactly as they were, and every other
> swept country now gets **one page in its own language** under its
> local-name slug (`danmark.html` in Danish, `belgie.html` in Dutch,
> `cesko.html` in Czech, `oesterreich.html`/`schweiz.html` in German,
> `united-kingdom.html` in English …), while France gets `france.html` — a
> French hub in the role /wickeltische/ plays for the Länder — plus 13
> per-région pages in French. Routing and the inflected name forms live in
> `config.COUNTRY_PAGES` and `pipeline/pages_l10n.py`; a country's page is
> written whenever that country's sweep is complete, so a
> `PAPAMAP_COUNTRIES=dk` build writes `danmark.html` and nothing German.
> All slugs are pinned in `tests/test_pages.py` and hand-listed in
> `web/sitemap.xml`, as before. The map's footer link is language-routed to
> match (`regions`/`regionsHref` in `web/i18n.js`): the Danish UI links
> danmark.html, the French UI france.html, German keeps the Bundesland
> index. **The data files do not change**: no new feature property, no new
> `stats.json` field, no change to history.json — this amendment is HTML
> surface only.

> **v13 amendment (19 Aug 2026, the UK and France, and nine UI languages):**
> papamap.de sweeps **eleven countries** — the nine of v12 plus **United
> Kingdom** and **France** — because `docker-compose.yml` now sets
> `PAPAMAP_COUNTRIES=de,dk,be,nl,at,ch,cz,pl,se,gb,fr`. Codes are ISO 3166-1
> alpha-2, so the UK is `gb`. `config.DEFAULT_COUNTRIES` still stays `de,dk`;
> the v12 reasoning is unchanged and unrepeated.
>
> **The emitted shape does not change.** No new feature property, no new
> `stats.json` field, no new file. `area_key` becomes `countries_11`, which is
> the `countries_<n>` form v11 already contracted and the frontend already
> parses with `/^countries_(\d+)$/`. This amendment exists for the three
> statements it has to retract, not for a shape change.
>
> **Retraction 1 — v11's "France is deliberately left out".** v11 states that
> France needs a per-région area list before it can join. It has one:
> `config.FRANCE_REGIONS`, the 13 metropolitan régions at `admin_level=4`,
> selected on `name` and **not** `name:en` (which is `Bourgogne – Franche-Comté`
> with an en dash and `Ile-de-France` without the accent). It is an allowlist,
> not a subdivision — the five overseas régions are `admin_level=4` as well.
> Measured 19 Aug 2026: France whole is an empty reply at 60.14 s; the slowest
> région is Auvergne-Rhône-Alpes at 27.1 s.
>
> **Retraction 2 — v6's "`regions`: the 16 Länder + `Danmark`".** History keys
> and leaderboard rows are, and always were, the sweep-area names verbatim. With
> a second chunked country that is 16 Länder + 13 French régions + the nine
> countries swept whole = **38 region keys**. France never appears as a key;
> "France" exists only as a `COUNTRY_LABELS` value inside `area_name`. Anything
> reading `history.json` must treat the region set as open, which it already
> had to after v11.
>
> **Retraction 3 — v2's "a `da*` browser language auto-selects Danish (nothing
> else does)".** Every language is auto-detected now. `pickLang` reads the
> browser's full ordered preference list, matches on the primary subtag only
> (`en-GB`, `de-AT`, `fr-CH` all match), and falls through unsupported entries
> instead of stopping. Precedence is unchanged: `?lang=` beats the stored
> choice beats the browser. The known cost, which v2 named as the reason not to
> do this: a German reader on an English browser now lands on English until
> they pick once.
>
> **Nine UI languages** — `de en da nl fr it cs pl sv`, one per official
> language of the eleven countries with a monolingual readership, plus English.
> `i18n.js`'s `LANGS` is the source of truth; `index.html`'s hreflang block,
> `sitemap.xml` and the `methods-*.html` set must list exactly the same nine.
> Each language ships a `methods-<code>.html`; the leaderboard stays a DE/EN
> pair and every other language borrows the English page, as Danish already
> did. `nextLang()` is **removed** — nine languages are picked from a
> `<select>`, not cycled — and the `langButton` string key is replaced by
> `langName`, each language's own endonym.

> **v12 amendment (18 Aug 2026, the deployment sweeps the ring):** papamap.de
> now sweeps **nine countries** — Deutschland, Danmark, Belgium, Netherlands,
> Austria, Switzerland, Czechia, Poland, Sweden — because `docker-compose.yml`
> sets `PAPAMAP_COUNTRIES=de,dk,be,nl,at,ch,cz,pl,se` on the `pipeline`
> service. First run under it: the 04:30 cron of 19 Aug 2026. This is the
> operator flipping the variable v11 below deliberately left unflipped, so
> v11's "papamap.de builds exactly what it built yesterday" now reads as the
> statement about the code default that it always was.
>
> **`config.DEFAULT_COUNTRIES` stays `de,dk`**, deliberately and not by
> oversight. A `git clone` and `pytest -v` must keep building exactly what they
> built yesterday: the default is what a stranger and the offline test suite
> get, and neither should inherit a sweep this deployment chose — nine areas
> cost nine areas' worth of Overpass rounds, and a fixture-backed test suite has
> no business tracking the operator's country list. The environment variable is
> where the deployment speaks, `config.py` is where the repo does. So
> `stats.json` carries `area_key: "countries_9"` (v11) on the live site and
> `"de_dk"` in a checkout, and consumers must tolerate both.
>
> **Site copy is corrected to match the deployment, not the default** — the
> `<meta>` description, the JSON-LD **`spatialCoverage`**, the three methods
> pages (DE/EN/DA) and the `metaDescription` strings in the i18n bundle now say
> nine European countries / neun europäischen Ländern / ni europæiske lande.
> This is not cosmetic: a map that claims Germany and Denmark while plotting
> Poland is simply lying to the reader, and `methods.html` exists precisely to
> be the honest account of what the site did.
>
> **The methods pages' play-corner counts now come from `stats.json`** instead
> of standing in the prose. 828 / 111 / 701 (v9, v10) were measured on DE+DK on
> 17 Aug 2026 and stopped describing the served dataset the night the ring was
> swept; a hardcoded number nobody rebuilds is worse than no number. The pages
> read `local.play_tables` and `local.play_places` from the file the stats
> strip already loads. **828 is not derivable from `stats.json`**: it counts
> every object passing the play rule, pin or not, while the file records only
> the pins (`play_tables`) and the prospects (`play_places`) — two different
> questions that must never be added up (v10). The sentence was therefore
> rewritten to use those two numbers alone rather than reconstruct a total the
> data contract does not carry.

> **v11 amendment (18 Aug 2026, neighbouring countries):** seven more countries
> are selectable through `PAPAMAP_COUNTRIES` — `be` Belgium, `nl` Netherlands,
> `at` Austria, `ch` Switzerland, `cz` Czechia, `pl` Poland, `se` Sweden — each
> a single `admin_level=2` area, the way Denmark has answered since v2 rather
> than the way Germany has to be chunked. **The default is still `de,dk`**:
> this makes the countries *available*, and papamap.de builds exactly what it
> built yesterday until the operator flips the variable.
>
> The seven are selected on **`name:en`**, not `name`
> (`config.NAME_EN_AREAS`, applied by `config.area_name_key()`). A country's
> `name` is whatever its own mappers write, and for two of the neighbours that
> is several languages at once: Belgium is `België / Belgique / Belgien`,
> Switzerland `Schweiz/Suisse/Svizzera/Svizra`. `area["name"="Belgium"]`
> resolves to nothing, and `run.py` can only read a zero-object area as a
> failed sweep — the build would burn all six rounds and then die complaining
> about a stale mirror. `name:en` is exact on all seven, and resolved for all
> 25 European countries probed on 18 Aug 2026. Germany and Denmark keep `name`
> on purpose: `Deutschland` and `Danmark` are also the region keys in
> `history.json`, so selecting them by another tag would orphan every baseline
> already recorded.
>
> Because the sweep selects them by their English name, that is also the string
> they carry everywhere else: `Belgium`, `Netherlands`, `Austria`,
> `Switzerland`, `Czechia`, `Poland`, `Sweden` in `COUNTRY_LABELS`, in
> `history.json`, and as leaderboard rows beside `Bayern` and `Danmark`. The
> label always names the area actually queried, and Belgium and Switzerland
> have no single endonym to use instead. The Bundesland pages are unaffected —
> `pages.py` only writes pages for names in `BUNDESLAENDER`, so a swept country
> produces none.
>
> **`area_key` in `stats.json` gains the form `countries_<n>`** for three or
> more countries (`countries_9` for all nine). One and two countries are
> untouched, so `de`, `dk` and `de_dk` keep meaning what they meant. This
> amends both the v2 amendment below and the `"de_dk | de | dk | null"` in the
> data contract further down, which are now `"de_dk | de | dk | countries_<n> |
> null"`. A count rather than a key per set, because nine joined labels
> overflow the stats strip anyway, and a key per set would cost three new
> translations every time a country is added — where a count costs one string
> per language, ever. `area_name` is unchanged: still the labels joined with
> " & ", still the verbatim fallback for consumers that don't know the key.
>
> **France is deliberately left out.** 7,739 `changing_table` objects (measured
> 18 Aug 2026) — about twice the UK's 3,707, and the UK's single-area sweep
> already spent 38.7 s of the 55 s `[timeout:55]` budget. France needs a
> per-région area list, the way Germany needs its 16 Länder, before it can join
> the list.

> **v10 amendment (17 Aug 2026, places to play):** the build emits a second
> dataset, **`web/data/play_places.geojson`** (`PAPAMAP_PLAY_GEOJSON_PATH`) —
> the objects that pass the v9 play-area rule and carry **no `changing_table`
> tag at all**. `changing_table=no` is excluded on purpose: someone answered,
> and the answer was no. Feature `properties`: `osm_type`, `osm_id`, `name`,
> `kind` (the first of `leisure`/`amenity`/`shop`/`tourism`/`healthcare` the
> object carries), `opening_hours`, `osm_url`, `mapcomplete_url`. **No
> `status`, no `changing_table`** — nobody has answered the first question, so
> there is nothing to colour them by, and a fourth status value would have
> broken the leaderboard, the Bundesland pages and the stats, all of which
> count changing tables and must keep doing so. Measured 17 Aug 2026: **701**
> such objects in DE+DK.
>
> It costs **no extra Overpass query**. `config.sweep_ql()` replaces
> `changing_table_ql` in the nightly build with a union of the changing_table
> clause and four play-area clauses, and `osm.split_sweep()` sorts the answer
> back into the two halves by tag; a second query would have cost a whole ~40 s
> slot per area for a few hundred objects nationwide (measured on Hamburg: 222
> changing_table objects, 15 play-only, 147 kB for the union). The QL value
> regex is generated from `classify.PLAY_AREA_VALUES`, so the query cannot
> drift from the rule, and it is a *prefilter* — `has_play_area` is re-applied
> in Python because QL cannot express "an explicit `kids_area:indoor=no`
> overrules a bare `kids_area=yes`". `pipeline.backfill` keeps the narrow
> `changing_table_ql`: attic queries already take ~3 min per Land and the
> leaderboard has only ever counted tables.
>
> `local` stats gain **`play_tables`** (pins that also have a play corner) and
> **`play_places`** (prospects) — two different questions, never to be added
> up; both skip coordless objects, like every other feature-facing counter. The
> map draws the prospects as hollow blue rings under a fifth chip, off by
> default, and `theme/papamap.theme.json` gains a third layer
> (`dad_play_place`) so their MapComplete deep links land on a selectable
> object whose first question is "does this place have a changing table?" —
> plus a `kids-area` question on the amenity layer, which is the half that
> grows the data.

> **v9 amendment (17 Aug 2026, play corners):** every feature gains a boolean
> **`play`** property — true when the object also records an indoor place for
> the kid to play, by any of `kids_area:indoor` or `kids_area` in {`yes`,
> `indoor`, `designated`}, `leisure=indoor_play`, or `leisure=playground` +
> `indoor=yes` (`pipeline/classify.py::has_play_area`). `outdoor`, `no` and
> `limited` are excluded on purpose (the wiki defines `limited` as "toys are
> available, but no designated area"), and an explicit `kids_area:indoor=no`
> overrules a bare `kids_area=yes`, which says nothing about indoor or outdoor.
> It costs no new Overpass query: the sweep already asks for every tag on these
> objects. The map draws it as an Okabe-Ito blue **halo** under the
> pin, and the chip bar gains a fourth chip that *narrows* to those places.
>
> `play` is a badge, never a status, and the distinction is load-bearing.
> `changing_table:location` can honestly render a grey "nobody has answered
> this" pin because the object is known to have a table, so the silence is a
> question. A missing `kids_area` is silent across ~13k pins and asks nothing —
> so there is no third state, no grey, no call to action, and the filter starts
> **off** and subtracts rather than starting on like the three status chips.
> Rendering it as a fourth status would claim every other pin has no play area,
> which OSM never said. Measured 17 Aug 2026: 828 objects in DE+DK pass the
> rule (222 via `kids_area:indoor`, 213 indoor `leisure=playground`, 199
> `leisure=indoor_play`, 194 bare `kids_area`) and 111 of them are already pins
> — 48 accessible, 13 female_only, 50 unknown. The other 717 have a play area
> and no changing-table answer at all.

> **v8 amendment (16 Aug 2026, sortable leaderboard):** the leaderboard tables
> are emitted as `<thead>`/`<tbody>`, every cell carrying its sort value in
> `data-v` (the raw number, or the DIN-5007 folded name) beside the German
> text, and each header its `data-sort` (num/text) and `data-first` (which way
> it opens). An inline script — no external file, no state stored, nothing
> loaded — upgrades the headers into buttons at runtime, so a reader with
> JavaScript blocked sees the same complete table, sorted by Δ points as
> before, and no dead controls. Two rules the sorter must keep: a cell with no
> value (no baseline to compare) sorts last in **both** directions, and a
> measured 0 is a number that does not; rank opens ascending though it is
> numeric, because #1 belongs on top.

> **v7 amendment (15 Aug 2026, mirror freshness):** every Overpass answer is
> checked against its own `osm3s.timestamp_osm_base`; a database older than
> `PAPAMAP_OVERPASS_MAX_DATA_AGE_H` (default 24 h) is a **stale mirror** — the
> answer is discarded, the mirror skipped without retries, and the next one
> tried. Prompted by overpass.kumi.systems serving a database frozen on
> 2026-05-31 with HTTP 200 and no remark: on busy nights the cascade handed it
> whole Länder, and every one silently lost two months of mapping — a data bug
> on the map and a false "mover" on the leaderboard. Attic queries are checked
> the same way (a frozen mirror can't answer any date after its freeze). The
> backfill's own lesson: attic queries over a whole Land take ~3 min on the
> main instance even off-peak, so `pipeline.backfill` runs on the VPS with
> `PAPAMAP_OVERPASS_QL_TIMEOUT=300`, never from a laptop behind the 60 s cutoff.

> **v6 amendment (14 Aug 2026, leaderboard):** the full default build now also
> maintains **`web/data/history.json`** — one entry per build day with
> `[accessible, female_only, unknown]` triples per region (`regions`: the 16
> Länder + `Danmark`) and per city (`cities`: the curated `CITY_AREAS` list in
> `pipeline/config.py`, membership via one ids-only Overpass query per city) —
> and renders two pages from it: `wickeltische/rangliste.html` (German) and
> `wickeltische/leaderboard.html` (English), ranked by the **change of the
> answered share** (accessible + female_only over total) in percentage points
> against a snapshot ≥ 7 days back. Change, not level, on purpose: absolute
> counts measure mapping thoroughness, and the Bundesland index explicitly
> refuses to rank them. A same-date re-run replaces its history entry (builds
> stay idempotent); city sweep failures degrade to a WARN and a city-less day,
> never a failed build; partial builds (`PAPAMAP_AREA_NAME`, country subsets)
> write no history at all. `python -m pipeline.backfill YYYY-MM-DD ...` seeds
> past days from Overpass attic (`[date:...]`) queries through the same
> classify/dedup path; it never overwrites an existing day.

> **v5 amendment (14 Aug 2026, central key locks):** objects with a
> `centralkey` tag other than `no` (the Euro key and similar central key
> systems) are not features at all — the key is issued only against proof of
> disability, so whatever room the table is in, the map's audience can't open
> the door. `classify()` returns None for them before any coloring, and the
> `local` stats block gains **`centralkey_locked`**: the number of key-locked
> objects that would otherwise be pins (coordless and `changing_table=no`
> objects don't count into it). The v0 classification rule below is amended
> accordingly; ~174 DE+DK objects (2.7%) leave the map with this change.

> **v4 amendment (12 Aug 2026, changeset attribution):** every MapComplete
> link on the site — `mapcomplete_url` on **all** features including
> `amenity=toilets`, and the add-a-place link — now opens PapaMap's own theme
> via `theme.html?userlayout=<raw URL of theme/papamap.theme.json>` instead of
> the official toilets theme. Reason: MapComplete stamps changesets with a
> `theme` tag, so edits made through the site become countable (the official
> theme would tag them `theme=toilets`, indistinguishable from any other
> MapComplete user). The v0 `mapcomplete_url` rule below is superseded.
> Because the theme is now load-bearing for every pin and only exists in this
> repo, `python -m pipeline.theme_check` (weekly CI + on theme changes)
> validates it against MapComplete's published schema and checks the raw URL
> still serves it.

> **v3 amendment (4 Aug 2026, Bundesland pages):** the build now emits HTML as
> well as data. `python -m pipeline.run` writes one static German page per
> Bundesland plus an index into `PAPAMAP_PAGES_DIR` (default `web/wickeltische/`,
> served at `/wickeltische/<slug>.html`), generated by `pipeline/pages.py` from
> the same features the map gets. Which Land an object belongs to is recorded
> during the sweep — the GeoJSON is unchanged and still carries no region field,
> so the data contract below still holds. A build that sweeps no German Land
> writes no pages. The pages are German-only and carry no hreflang alternates,
> like the legal pages; their 17 URLs are fixed and listed by hand in
> `web/sitemap.xml`. The map reads `?bbox=minLon,minLat,maxLon,maxLat` (invalid
> → home view) so those pages can link into it at a Land's extent; the canonical
> stays `https://papamap.de/`.

> **v2 amendment (4 Aug 2026, Denmark):** the sweep is now per-country
> (`PAPAMAP_COUNTRIES`, default `de,dk`). Germany keeps the 16-Land chunking
> below; Denmark answers whole as one `admin_level=2` area (`Danmark` —
> 933 changing_table + 4,655 toilet objects, 14.5 s measured, Grønland and
> Føroyar excluded by that relation). `stats.json` gains **`area_key`**
> (`"de_dk"` / `"de"` / `"dk"`, or `null` for a hand-named build; v11 adds
> `"countries_<n>"` for three or more countries) next to
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
  "play": "true|false — indoor play area recorded (v9); false also means unrecorded",
  "fee": "string or null",
  "opening_hours": "string or null",
  "osm_url": "https://www.openstreetmap.org/<type>/<id>",
  "mapcomplete_url": "string or null"
}
```

`web/data/play_places.geojson` — same FeatureCollection shape, the v10 dataset
of places with a play area and no changing-table answer. Feature `properties`:

```json
{
  "osm_type": "node|way|relation",
  "osm_id": 123,
  "name": "string or null",
  "kind": "cafe|indoor_play|mall|... or null",
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
  "area_key": "de_dk | de | dk | countries_<n> | null",
  "local": {
    "toilets_total": 443, "ct_objects": 213, "ct_yes": 85, "ct_no": 127, "ct_limited": 1,
    "yes_location_known": 17, "yes_location_unknown": 68,
    "accessible": 0, "female_only": 0, "unknown": 0,
    "play_tables": 0, "play_places": 0,
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
