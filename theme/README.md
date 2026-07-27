# papa-map MapComplete theme

`papamap.theme.json` is a custom [MapComplete](https://mapcomplete.org) theme: the same
green/red/grey classification as the papa-map site, but *editable* — every pin asks the
OSM questions that fix the data gaps.

## What's in it

Two layers, both self-contained (no builtin-layer references, so the file has no hidden
dependencies beyond bundled icon paths):

- **`dad_toilet`** — all `amenity=toilets`. Pin color mirrors the CONTRACT.md
  classification rule; toilets without a table (or untagged) stay white and get the
  `changing_table` question on click. Questions (EN + DE): `changing_table` yes/no,
  `changing_table:location` (approved value list only, multi-answer),
  `changing_table:fee` yes/no — plus a **clearly separated draft question group** for
  `toilets:num_chambers:female` / `toilets:num_chambers:male` (positive-integer inputs,
  labeled `draft_capacity`, rendered under a header that marks them as a draft schema
  under discussion, with the same warning in each question hint).
- **`dad_changing_table_amenity`** — `changing_table=*` on everything that is *not*
  `amenity=toilets` (cafés, restaurants, shops...). Same colors and questions, no draft
  group, no presets (you can't meaningfully "add a changing-table amenity" from scratch).

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

Two routes. What follows distinguishes *verified from docs/source* from *needs a live
test* — nothing here has been loaded in a live browser session yet.

### 1. URL loading (`userlayout`) — verified against source, not live-tested

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
  theme is ever served from papamap.de (placeholder domain, not set up),
  Caddy must add that header.
- Viewing should work without an OSM account; **answering questions requires OSM
  login** — that full loop (login, answer, tag written) is exactly what still needs a
  live test.

### 2. MapComplete Studio — documented, not tested

`https://mapcomplete.org/studio` is the official custom-theme editor
(per `Docs/Making_Your_Own_Theme.md` and `Docs/Studio_Introduction.md`, fetched
26 Jul 2026). It requires an OSM login, so it could not be exercised offline. It is the
right place to paste/adapt this theme's layers if URL loading ever misbehaves.

## Validation — read this before trusting the file

**This theme has not been loaded in a live MapComplete instance.** Here is exactly what
was and was not verified (all reference files fetched 26 Jul 2026 from the GitHub master
mirror of MapComplete):

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
  MapComplete's own.
- Structure adapted from the bundled `assets/themes/toilets/toilets.json`,
  `assets/layers/toilet/toilet.json` and `assets/layers/toilet_at_amenity/…` rather than
  invented; tag-expression semantics from `Docs/Tags_format.md`; the
  `{questions(labels,blacklisted-labels)}` grouping syntax from
  `Docs/SpecialRenderings.md`.
- Classification regexes unit-checked against the contract rule (see above).
- Bundled icon paths (`./assets/layers/toilet/toilets.svg`, `…/baby.svg`) are kept
  untouched for remote themes per a source read of `FixImages.ts` (known images pass
  through) — source read only, not executed.

**Not verified — needs a live OSM-login test:**

- That mapcomplete.org actually loads the theme via `userlayout` (the runtime
  `PrepareTheme`/`PrevalidateTheme`/`ValidateThemeAndLayers` passes enforce rules beyond
  the JSON schema).
- That the draft group renders separately: `{questions(,draft_capacity)}` for the normal
  questions and `{questions(draft_capacity)}` under the draft header.
- That `multiAnswer` writes `changing_table:location=a;b` on multi-select.
- That `~i~` / `!~i~` regex conditions are accepted at runtime inside filter options and
  marker-color mappings.
- That answering each question writes exactly the intended tag, and nothing else.

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
