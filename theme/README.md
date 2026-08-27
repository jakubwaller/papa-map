# papa-map MapComplete theme

`papamap.theme.json` is a custom [MapComplete](https://mapcomplete.org) theme: the same
green/red/grey classification as the papa-map site, but *editable* — every pin asks the
OSM questions that fix the data gaps.

## What's in it

Four layers, all self-contained (no builtin-layer references, so the file has no hidden
dependencies beyond bundled icon paths):

- **`dad_toilet`** — all `amenity=toilets`. Pin color mirrors the CONTRACT.md
  classification rule; toilets without a table (or untagged) stay white and get the
  `changing_table` question on click. Questions (EN + DE + DA): `changing_table` yes/no,
  `changing_table:location` (approved value list only, multi-answer),
  `changing_table:fee` yes/no — plus a **clearly separated draft question group** for
  `toilets:num_chambers:female` / `toilets:num_chambers:male` (positive-integer inputs,
  labeled `draft_capacity`, rendered under a header that marks them as a draft schema
  under discussion, with the same warning in each question hint).
- **`dad_changing_table_amenity`** — `changing_table=*` on everything that is *not*
  `amenity=toilets` (cafés, restaurants, shops...). Same colors and questions, no draft
  group, no presets (you can't meaningfully "add a changing-table amenity" from scratch).
  Since v10 it also asks **`kids-area`** (see below).
- **`dad_play_place`** — added v10: places that record a kids' area and carry **no
  `changing_table` tag at all**, minus `amenity=toilets` (which has its own layer above).
  Blue `#0072b2` circle under the bundled playground pictogram, hollow on the website to
  match. It exists because the site draws those places as pins and their MapComplete deep
  links have to land on something selectable — a layer-less object opens to nothing. Its
  first question is `changing_table` yes/no, which is the whole point: these are the
  places a father goes to anyway, so he is the one who can answer it. Same location/fee
  follow-ups as the other layers, then `kids-area`.

- **`dad_venue`** — added v11 (27 Aug 2026): cafés, restaurants, fast food, bars, shops
  that plausibly have a customer toilet (malls, supermarkets, baby goods, DIY…), libraries,
  museums, cinemas, pools and sports centres, pharmacies, surgeries, stations and terminals —
  everything a parent walks into anyway — that carry **no `changing_table` tag at all**.
  Objects already in `dad_play_place` are excluded so nothing appears twice, and so is
  `amenity=toilets`. `minzoom` 16, unlike the other three at 12: a city centre has hundreds
  of these per square kilometre, and the layer is for the person standing in front of one,
  not for surveying. Orange `#e69f00` circle under the bundled café pictogram. It exists
  because the site's "a café / shop / restaurant has a table" button used to deep-link into
  iD, which on a phone meant finding the object, opening the raw tag editor and typing two
  keys; now the button opens this theme a zoom level inside the layer and the flow is tap →
  `changing_table` yes/no → room → fee → `kids-area`, the same questions as the layers above.

### The `kids-area` question (v10)

Asked on the two amenity layers, writing the OSM keys `kids_area` and `kids_area:indoor`:

- `kids_area:indoor=yes` → *"Yes, there is an indoor play area"* (adds `kids_area=yes`)
- `kids_area=no` → *"No, there is nowhere for children to play"*
- `kids_area:indoor=no` → *"There is a play area, but it is outdoors only"* (adds
  `kids_area=yes`)

Two deliberate choices. **Matching is on the `:indoor` sub-key alone**, with the parent
tag supplied via `addExtraTags` — so the 715 objects worldwide already tagged the wiki's
documented way render their answer instead of being asked again, while answering still
leaves both keys behind. And **a bare `kids_area=yes` matches no mapping on purpose**, so
those objects *are* asked: the tag says a kids' area exists and says nothing about
whether it is indoors, which is exactly the open question. `kids_area=no` is by far the
most-used value (2,780 vs 1,318 `yes` on taginfo, 17 Aug 2026), so this is a question
people demonstrably answer.

No `condition` limits which venues get asked. An allowlist of plausible amenity values
would rot, and "no" is an informative answer anywhere — the Hamburg sample turned up
doctors' surgeries with a play corner.

### Classification → tagRendering conditions

The contract rule (split `changing_table:location` on `;`, trim, lowercase, EXACT token
match) is expressed as MapComplete full-match regexes (`~i~` = case-invariant, must match
the entire value per `Docs/Tags_format.md`):

- accessible: `changing_table:location~i~(.*;)? *(male_toilet|unisex_toilet|dedicated_room|room|wheelchair_toilet|sales_area) *(;.*)?`
- female-only: `changing_table:location~i~(.*;)? *female_toilet *(;.*)?`

Precedence (accessible wins over female-only; anything else with `changing_table` ∈
{yes, limited} is grey) comes from mapping order in the marker color. The regexes were
unit-checked offline against 17 cases from the contract (including `female_toilet` not
matching the `male_toilet` alternative as a substring, `;`-lists with spaces, and junk
values like `02`) — all match the contract's pure function.

Colors: green `#117733`, red `#cc3311`, grey `#555555` (colorblind-safe; grey is
deliberately dark — it is the call to action).

### Filters

One dropdown per layer: *All / green / red / grey*. This deliberately differs from the
web frontend's three independent toggles: MapComplete combines multiple active filters
with AND, so three independent status filters would intersect to an empty map when two
are checked. A single-choice dropdown gives the three statuses without that trap.

## How to load a custom theme (2026)

Two routes. Route 1 is live-tested since 2 Aug 2026; Studio remains documented-only.

### 1. URL loading (`userlayout`) — live-tested 2 Aug 2026

Verified by reading `src/Logic/DetermineTheme.ts` on the GitHub mirror
(`github.com/pietervdvn/MapComplete`, master, fetched 26 Jul 2026):

```
https://mapcomplete.org/theme.html?userlayout=<URL of papamap.theme.json>
```

- The `userlayout` query parameter must be a URL starting with `http`; MapComplete
  downloads the JSON in the browser, fixes relative image paths, validates and loads it.
- Because the fetch happens in the browser from the mapcomplete.org origin, the host
  serving the JSON **must send CORS headers** (`Access-Control-Allow-Origin`). A
  `raw.githubusercontent.com` URL of this file works for that; `python -m http.server`
  does not send CORS headers, so local serving needs a header-adding server. If the
  theme is ever served from papamap.de instead, Caddy must add that header.
- Viewing works without an OSM account; **answering questions requires OSM login**.
  That full loop — load via `userlayout`, log in, answer, tags written — was completed
  on 2 Aug 2026 with a real edit through the `dad_changing_table_amenity` layer: a
  drugstore got `changing_table:location=sales_area` and `changing_table:fee=no`,
  exactly the intended tags and nothing else.

### 2. MapComplete Studio — documented, not tested

`https://mapcomplete.org/studio` is the official custom-theme editor
(per `Docs/Making_Your_Own_Theme.md` and `Docs/Studio_Introduction.md`, fetched
26 Jul 2026). It requires an OSM login, so it could not be exercised offline. It is the
right place to paste/adapt this theme's layers if URL loading ever misbehaves.

## Validation — read this before trusting the file

**Live-tested 17 Aug 2026 (v10):** mapcomplete.org loaded the three-layer theme from a
branch raw URL and rendered all of it, logged out:

- `dad_play_place` resolved to a working Overpass query — including the `changing_table!~*`
  (key absent) clause, which had no precedent in this file — and a `#node/<id>` deep link
  of the kind the site emits selected the object, showed the blue "children can play here,
  nobody has recorded whether there is a changing table" line and asked
  *Does this place have a baby changing table?* first (node/6374378143, node/2368201975).
- Sub-key matching behaves as designed: an object tagged only `kids_area:indoor=yes`
  rendered *"Yes, there is an indoor play area"* instead of being asked again, while one
  tagged only `kids_area=yes` was left unanswered and queued for the question.
- `kids-area` renders on `dad_changing_table_amenity` with its hint and all three answers,
  once the changing-table questions above it are answered (node/1578038179).

**Live-tested 2 Aug 2026:** mapcomplete.org loaded the theme via `userlayout` (which
runs its `PrepareTheme`/`PrevalidateTheme`/`ValidateThemeAndLayers` passes, so the
runtime accepts the `~i~` conditions too), both layers rendered, and a logged-in edit
through the second layer wrote its answers as exactly the intended tags. What follows
records the earlier offline verification (reference files fetched 26 Jul 2026 from the
GitHub master mirror of MapComplete):

Verified offline:

- The JSON parses.
- Validated with python-jsonschema against `Docs/Schemas/ThemeConfig.schema.json` — with
  an important caveat: the published schema is auto-generated and rejects *every*
  translation object (its `Record<string,string>` definition is
  `{"type":"object","additionalProperties":false}`, which matches only `{}`). As a
  control, the **official bundled toilets theme fails the raw schema the same way**.
  After patching only that degenerate definition, this theme produces exactly **one**
  remaining error — `freeform` demanding the internal `helperArgs` property, another
  generator artifact (the bundled official `toilet` layer trips the identical error, and
  `helperArgs` is marked `group: hidden` in the schema itself). Conclusion: the theme
  validates **at parity with the official bundled theme**; the published schema is not a
  clean oracle, so "passes the schema" would be an overclaim for any theme, including
  MapComplete's own. Since 12 Aug 2026 this exact procedure (patch the two artifacts,
  then validate, plus a fetch of the raw URL every pin embeds) runs automatically:
  `python -m pipeline.theme_check`, weekly in CI and on any change under `theme/` —
  since the v4 contract amendment *every* MapComplete link on the site loads this file,
  so it rotting would take down the edit flow on every pin, not just cafés and shops.
- Structure adapted from the bundled `assets/themes/toilets/toilets.json`,
  `assets/layers/toilet/toilet.json` and `assets/layers/toilet_at_amenity/…` rather than
  invented; tag-expression semantics from `Docs/Tags_format.md`; the
  `{questions(labels,blacklisted-labels)}` grouping syntax from
  `Docs/SpecialRenderings.md`.
- Classification regexes unit-checked against the contract rule (see above).
- Bundled icon paths (`./assets/layers/toilet/toilets.svg`, `…/baby.svg`) are kept
  untouched for remote themes per a source read of `FixImages.ts` (known images pass
  through) — source read only, not executed.

**Still not live-verified** (the 2 Aug test covered the second layer's location and
fee questions, answered with single values):

- **Writing** the v10 answers: no logged-in edit has been made through the
  `dad_play_place` layer or the `kids-area` question, so `addExtraTags` supplying
  `kids_area=yes` alongside the sub-key is source-read and schema-valid, not observed.

- That the draft group renders separately: `{questions(,draft_capacity)}` for the normal
  questions and `{questions(draft_capacity)}` under the draft header.
- That `multiAnswer` writes `changing_table:location=a;b` when several rooms are
  selected.
- The `dad_toilet` layer's questions end to end — same building blocks, but no live
  edit through that layer yet (the official toilets theme covers those objects anyway).

Format wrinkle worth recording: `Docs/Making_Your_Own_Theme.md` still documents a
`group` attribute on tagRenderings, but the current schema has no such property — the
mechanism today is `labels` plus the `questions` special visualization, which is what
this theme uses.

## Design decisions

- **All toilets are shown**, not just those with a changing table — MapComplete's own
  guidance ("don't use a layer to filter") and the point of the map: a white pin asked
  the right question becomes a green or red pin.
- **No freeform text on the location question** — only the approved wiki value list
  (`female_toilet`, `male_toilet`, `unisex_toilet`, `wheelchair_toilet`,
  `dedicated_room`, `room`, `sales_area`). Free text is how junk like `02` got into this
  tag in the first place. A junk value simply re-asks the question; answering overwrites
  it with clean tokens.
- `changing_table=limited` is rendered when present but not offered as an answer
  (matching the bundled theme's conservatism).
- Nothing in this repo writes to OSM. This theme only makes MapComplete — with a
  logged-in user pressing the buttons — do so.
