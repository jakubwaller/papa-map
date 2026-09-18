# How PapaMap works, in detail

The long version of the README. Each section explains one part of the site and the
reasoning behind it. The pipeline↔frontend contract is in [`../CONTRACT.md`](../CONTRACT.md),
the deploy runbook in [`DEPLOY.md`](DEPLOY.md), the public classification rule in
[`../web/methods.html`](../web/methods.html).

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
  that way on purpose, so neither depends on a 49-country sweep.
  **The deployment sets the variable instead:** `docker-compose.yml` carries
  the full `PAPAMAP_COUNTRIES` list, so papamap.de sweeps 49 countries:
  every European sovereign from Iceland to Cyprus except
  Vatican City (too small to survive the zero-objects check) and the
  transcontinental states, plus Australia, New Zealand, the United States,
  Canada and Japan — the five outside Europe, picked by a per-country count
  of the whole planet (CONTRACT v19 has the rule and the ranking, v21 and
  v22 the second and third waves).
  Codes are ISO 3166-1 alpha-2, so the UK is **`gb`**, not `uk`, and Kosovo
  is the user-assigned **`xk`**. All but five of them
  are one `admin_level=2` area each, the way Denmark is. `fr` is 13 areas, one
  per metropolitan région, `de` the 16 Bundesländer, `us` the 50 states plus
  the District of Columbia, `ca` the 10 provinces and 3 territories and `jp`
  the 47 prefectures — the five chunked countries, each because the country
  whole dies at the ~60 s cutoff or (Japan) counts its toilets in 49.7 s. The
  US, Canadian and Japanese areas are selected by `ISO3166-2` code, not name:
  a level-4 "Florida" is also a department of Uruguay
  (`config.AREA_SELECTORS`). So `PAPAMAP_COUNTRIES=dk` builds Denmark alone and
  `de,dk,at,ch` adds the German-speaking neighbours; an unknown code aborts
  rather than silently sweeping less. (The map has had no `maxBounds` since
  Australia and New Zealand joined on 2026-09-04; until then every expansion
  had to widen a Europe-only box first, and `web/app.js` keeps the history.)
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
  régions are `admin_level=4` too, and sweeping them would put ~170 pins in
  the Caribbean, the Indian Ocean and South America, thousands of kilometres
  from the France its page and leaderboard row are about.
- A build of three or more countries names itself by count rather than by name:
  `stats.json`'s `area_key` becomes `countries_<n>` (`countries_49` for all
  49), since the joined labels overflow the stats strip. One and two
  countries keep `de` / `dk` / `de_dk`.
- `PAPAMAP_AREA_NAME` + `PAPAMAP_AREA_ADMIN_LEVEL` select a single area instead
  (e.g. `Hamburg` / `4`), and `PAPAMAP_DISPLAY_AREA` names the dataset in the
  stats strip.
- Each area costs one Overpass query a night, not two. The object sweep runs
  nightly; the `amenity=toilets` count behind "N toilets mapped here" is
  recounted on a weekly rota — every area on its own night, a seventh of them
  each night — and kept in `web/data/toilets_counts.json` between builds
  (state, like `history.json`; deleting it costs one night of counts). The
  count is the slower query in the big areas and the number that moves least,
  so this is where the wall clock for the next countries comes from.
  `PAPAMAP_TOILETS_COUNTS_PERIOD_DAYS=1` recounts every area every night. An
  area whose sweep comes back empty is always recounted, whatever the rota:
  the stale-mirror check needs a number fetched tonight, not a cached one.

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
a hub over 13 per-région pages — English again for `united-states.html` and
`canada.html`, hubs over 51 state and 13 province pages, Japanese for
`nihon.html`, a hub over 47 prefecture pages in JIS code order (kanji have no
alphabet to sort by), and so on. The routing (including the
inflected name forms prose needs: "in der Schweiz", "w Polsce") lives in
`config.COUNTRY_PAGES` and `pipeline/pages_l10n.py`; slugs are the local
names (`belgie.html`, `cesko.html`, `oesterreich.html`). Every page carries
a country list linking the others.

**Every country page not written in English has an English twin** at
`<slug>-en.html` (since 2026-09-17; Germany's is `deutschland-en.html`, a
hub over the Land pages). The twin's canonical is the majority-language page
and it is not in the sitemap: it exists for readers, not for search. Why it
exists: **the map's footer link follows the map view, not the UI language.**
It names the area page for what is on screen — "Wickeltische in Hamburg"
when zoomed into Hamburg, "Wickeltische in Deutschland" at country zoom,
"Pusleborde i Danmark" after a pan north — in the reader's UI language where
that page exists and in English otherwise, so a reader with an English phone
in Hamburg gets Germany in English rather than the United Kingdom (which is
what the old language routing sent them to). "On screen" means what the
reader can actually see, not the map canvas: the canvas extends underneath
the (translucent) top bar, roughly the top third of a phone screen, so since
2026-09-18 the centre and view fed to the vote below are of the canvas minus
that covered strip (`visibleMapView` in `web/datasource.js`, fed from
`web/app.js`'s `updateRegionsLink`) — before that fix a reader with northern
Germany filling their visible map could be told Denmark, because the canvas
centre sat a third of a screen further north than anything on screen. Which
area is on screen is asked of the pins, not of a bounding box: every feature
carries the sweep `area` that found it (CONTRACT.md v32), and the seven pins
nearest the visible centre vote, weighted by nearness — exact at the
borders, where boxes are not (Strasbourg lies inside Germany's box, Salzburg
inside Bavaria's). The pipeline also writes
`data/areas.json`, one row per area page with its box; `pickArea` in
`web/datasource.js` shows the Land, région, state or prefecture when its box
covers at least a quarter of the view and the country otherwise, and the
language-routed `regionsHref` in `web/i18n.js` remains the fallback when no
pin is within 250 km of the centre (open sea, an unswept country) or a file
is missing.

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

## Reading the map as a father or as a mother

The pipeline emits three statuses and the frontend renders them two ways. A
`Papa` / `Mama` switch sits at the head of the chip bar; the choice is stored in
`localStorage` under `papamap-mode` and a `?mode=` parameter overrides it for a
shared link, exactly as `?lang=` does.

It is a **view, not a second classification.** `VIEW` in `web/datasource.js`
maps each status to a bucket per reading, and everything downstream — pin
colour, chip dot, chip label, popup sentence, the local stats sentence, the
headline, and what "usable" means to the nearest-table button — is read out of
that one table:

| status        | Papa                     | Mama                     |
| ------------- | ------------------------ | ------------------------ |
| `accessible`  | good — green             | good — green             |
| `female_only` | bad — orange             | good — green             |
| `unknown`     | ask — grey               | maybe — amber            |

Nothing is re-derived from the raw tags in JavaScript, no pipeline field was
added and `CONTRACT.md`'s emitted shape did not move. The default stays `papa`:
it is the rendering every screenshot and every og: description describes, so a
mother's map is a deliberate opt-in rather than a silent redefinition for
everyone. Switching mode is one `setPaintProperty` on a layer whose source data
never changes, so 26k pins recolour without a re-fetch.

The one simplification the switch inherits is disclosed on the methods pages: a
table tagged `male_toilet` only is counted as reachable in both readings.

## Nearest usable table

The second button under the zoom controls answers "where can I change him?" in
one tap. It asks the browser for a position, finds the nearest table the
**current reading** calls usable, flies there and opens the popup.

Three things it deliberately does not do:

- **It does not send the position anywhere.** The whole GeoJSON is already in
  memory, so the search is a haversine loop in the tab and no request leaves the
  browser. That also makes it a true global nearest over every pin in every
  swept country, not the nearest thing in the current viewport.
- **It does not choose a maps app.** The popup's `Route` button is a `geo:` URI,
  so the phone opens Apple Maps or Organic Maps or whatever the reader already
  uses, and no third party learns where they are standing. Only the
  *destination's* coordinates travel in that link. The openstreetmap.org link
  stays beside it for desktop browsers, which mostly ignore `geo:`.

  iOS has no `geo:` handler at all, so there the app has to make the choice —
  and it makes it in the reader's favour, in this order (`routePlan` in
  `web/native.js`, a pure function with its own tests):

  1. **`geo-navigation:`** — the navigation app the reader *chose* in Settings →
     Apps → Default Apps → Navigation (iOS 18.4 in the EU, 26.2 in Japan). Apple
     documents this scheme for the app that wants to *be* the default; that a
     caller reaches the chosen app by opening
     `geo-navigation:///directions?destination=<lat>,<lon>` is read off MapKit,
     which builds exactly that URL for default navigation, and off the apps
     already calling it that way. If nothing claims the scheme, `canOpenUrl`
     says no and the cascade moves on.
  2. **`maps:`** — Apple Maps, the URL every build up to 19 sent and the only
     one it sent. That was the bug: `maps:` is Apple Maps' *own* scheme, so an
     iPhone whose owner deleted Apple Maps answered the Route button with
     iOS's "No Navigation App Installed" alert, and setting Google Maps as the
     default navigation app did not change that.
  3. **Whatever is installed**, by each app's own documented scheme — Google
     Maps, Waze, Organic Maps, declared in `LSApplicationQueriesSchemes` because
     iOS answers `canOpenURL` for nothing else. Exactly one: it opens. Several:
     a small dialog asks, once, and *nothing is remembered* — acquiring an
     opinion about the reader's maps app is the thing this feature is against.
  4. **Nothing at all:** `google.com/maps/dir/?api=1&destination=…`, handed to
     the OS rather than to the in-app browser, so a universal link can still be
     caught by an app and only otherwise opens a browser. And if any step's URL
     is one the OS declines to open — a scheme it claimed to know and then
     refused — that same web URL opens in the in-app browser instead, so the
     cascade has no branch that ends in nothing happening.

  No step names a travel mode. A reader pushing a pram and a reader driving to
  the next town get the same link, and the maps app asks them. The website and
  the Android app are untouched: there `geo:` still does all of this by itself.
- **It does not claim to know how far you will walk.** The distance is
  straight-line and the toast says so — "1,2 km Luftlinie" — because routing
  needs a server this project does not have.

Distances round to the nearest 10 m: a good phone fix is accurate to a handful
of metres and a poor one to fifty, so "437 m" would claim precision the sensor
cannot deliver. The search ignores the chip filters, since a chip left switched
off should not change which table is *nearest* — but a filter that would hide
the winner is switched back on, visibly, so the map never flies to an empty
spot.

## Offline

`web/sw.js` is a service worker that makes the map work with no signal, which is
where a parent actually needs it. One rule governs the whole file:

**It must never cache map tiles.** The OSMF tile policy states outright that
"Offline use is not permitted on tile.openstreetmap.org", defines bulk
downloading as *any* pre-emptive fetching beyond what the user is actively
viewing, and warns that prefetch and offline patterns "will be blocked without
notice". papamap.de carries a Ko-fi link, which also puts it inside that
policy's explicit warning to services that seek donations. So the fetch handler
returns early for every cross-origin request and never calls `respondWith()` on
one: tiles go to the network exactly as if no worker were installed. Offline,
you therefore get the pins without a basemap. Fixing *that* means moving to
OpenFreeMap — a different source under a different licence — and it belongs in
its own commit, not in a widened condition here.

`web/sw.test.js` loads the worker into a `vm` context with a faked service
worker scope and drives the fetch handler, so the tile rule is a failing test
rather than a comment. It also pins that an origin check cannot be loosened to
a prefix match, since `papamap.de.evil.example` would pass one.

Two strategies. The **dataset** (`data/`) is network-first: a reader who is
online sees tonight's build, which is what the edit confirmation promises, and
the stored copy answers only when the network fails or cannot deliver it within
eight seconds. A stored answer carries an `X-PapaMap-Source: cache` header, and
that header — not `navigator.onLine`, which says "online" on a Wi-Fi with no
internet — is what makes the page say it is showing stored data. The **shell**
is stale-while-revalidate: answered from the cache immediately and refreshed in
the background, so a visitor is at most one visit behind on a deploy of the page
itself; the `?v=` pins make that safe, and a test holds `sw.js`'s precache list
to the same pin as `index.html`. Only the shell is precached — the GeoJSON is
not, because the page fetches it anyway on the first visit and the runtime
handler stores *that* response, so offline costs the visitor no extra bytes
rather than a surprise 1.3 MB on mobile data. `ops.html` and `private/` are
never stored: they exist to say what is true right now, and a stale status page
is worse than none.

To test offline, kill the dev server. DevTools' "Offline" throttling applies to
the page's own requests and not to the worker's, so the worker keeps fetching
from the network and the fallback never runs.

## Answering on the map: OSM login and the two-tap room answer

A grey pin's popup asks *which room is the changing table in?* and offers the
rooms as buttons. The first tap on a room sends the reader to openstreetmap.org
once, to log in and consent; they come back with the answer still in hand and it
is saved without asking again. From then on it is two taps: the pin, the room.

`web/osm.js` is the whole of it. The login is OAuth 2 with PKCE — a static site
is a *public* client, so there is no secret anywhere in this repo and the token
exchange runs in the browser, the way iD does it. The answer is one changeset
under the **reader's own OSM account** (StreetComplete's model: PapaMap is the
tool in `created_by`, the reader is the author), and it writes exactly one tag,
`changing_table:location`, with values from the theme's vocabulary — the same
words MapComplete would write for the same tap, and the words `classify.py`
reads. `changing_table` itself is never touched, so `limited` is not promoted
to `yes` by someone who was only asked about the door. In the mother's reading
the buttons are the rooms she can vouch for — women's, unisex, the accessible
toilet, a separate room — and the men's room is left to a father to answer.
Three rarer rooms (a hallway, the shop floor, outdoors) sit behind a *more* link
in either reading.

What OSM holds afterwards is quoted in the popup, and that is all that changes:
the pin keeps its colour until the nightly build, because classification lives
in the pipeline and nowhere else (`CONTRACT.md` v26). A pin that already carries
a room in words the classifier does not read is not asked — that is somebody's
tag, and MapComplete shows it before letting anyone write over it.

The popup asks one more thing, on one line: *play area for children?* —
*indoors*, *outdoors only*, *none*. It is the second question a father standing
in a café can answer without looking anything up, and it is asked on every pin,
green and red included (v34: at first only under the room question, until the
first play corner noticed in a café whose room was long on record had nowhere
to go but MapComplete). Alone on such a pin it carries the login line itself.
It is asked only where OSM is silent: a recorded play corner shows its blue ring
instead, a recorded answer of any kind is never asked again, and a
`leisure=playground` is not asked at all, because the object itself is the
answer. *Indoors* writes `kids_area:indoor=yes` together with `kids_area=yes`,
*outdoors only* writes `kids_area=yes` together with `kids_area:indoor=no`,
*none* writes `kids_area=no`: the three mappings the site's own MapComplete
theme uses for the same question, and values `classify.py` already reads, so
the ring appears (or stays away) at the next build. The third answer is what
makes the first two honest — `kids_area=no` is OSM's "nowhere for children to
play", and a two-button *indoor play area? yes/no* wrote it under bakeries with
a garden playground (issue #119, v31). The two questions are independent taps
and independent changesets — answering the room leaves the play line standing,
and answering the play line leaves the room question where it was.

A blue play place asks the other question, *is there a changing table? then tap
its room*, and the one tap writes both `changing_table=yes` and the room —
the table is news to OSM there, and the yes without the room would only make
a grey pin tonight. One more button on a row of its own, *no changing table*,
writes `changing_table=no` alone; everything else stays with the MapComplete
link under it. Nothing is written to an object that is not already on the map: a café with no tags at all is still MapComplete's `dad_venue` layer.

Any host that is not `papamap.de` talks to the **sandbox** API
(`master.apis.dev.openstreetmap.org`), whose database is separate and wiped
periodically. Its client is registered for `http://127.0.0.1:8000/` and
`:8899/` — open the dev server at `127.0.0.1`, not `localhost`, or the redirect
is refused. The token is kept in `localStorage` (`papamap-osm-token`,
`papamap-osm-user`) and named in the Datenschutz; "Abmelden" in the popup
forgets it here and revokes it at OSM.

## Play corners

Every feature carries a tri-state `play`: true when the object also records an
indoor place for the kid to play (`kids_area:indoor` or `kids_area` =
`yes|indoor|designated`, `leisure=indoor_play`, or `leisure=playground` +
`indoor=yes`), false when somebody has answered on one of the `kids_area` keys
and the answer does not pass — or when the object is an outdoor
`leisure=playground`, which answers the question by being one (v31) — null when
nobody has answered at all. `outdoor`,
`no` and `limited` are excluded, and an explicit `kids_area:indoor=no`
overrules a bare `kids_area=yes`. False and null draw the same — nothing — and
differ only in whether the popup asks the question (CONTRACT v30). The map draws it as a
blue halo under the pin and the chip bar gains a filter that narrows to those
places.

It is a badge, not a fourth status. A missing `kids_area` is silent across all
~13k pins and means nothing, so — unlike a grey `changing_table:location` pin —
there is no "unknown" state to render and no call to action attached to it. The
chip therefore starts **off** and subtracts, while the three status chips start
on. Costs no extra Overpass query: the sweep already returns every tag on these
objects. Measured on the DE+DK build of 17 Aug 2026: 828 objects pass the rule
and 111 of them are already pins (48 accessible / 13 female_only / 50 unknown).
Those are DE+DK figures and the 46-country sweep is larger, so the served
numbers come from `stats.json` (`local.play_tables`, `local.play_places`) —
the methods pages read them from there rather than repeating a number that
moves every night.

## Places to play

The other 701 of those DE+DK objects pass the same rule and carry no
`changing_table` tag at all, so they are not pins and never could be — nobody
has answered the first question about them. They get their own file,
`web/data/play_places.geojson`, their own hollow-blue-ring layer and their own
chip, on by default. Since v27 the file also holds the `changing_table=no`
places with a play corner — somebody did answer, and a café with a ball pit is
worth the visit anyway — drawn as a dashed ring, never as a pin: no table is no
colour, and red would promise a mother one.

They are the best-targeted open questions on the map. A father with a toddler
is going to an indoor playground or a café with a ball pit anyway, and while he
is there he knows the answer. So the popup leads with the MapComplete link, the
theme has a `dad_play_place` layer so that link lands on a selectable object,
and the layer's first question is "does this place have a baby changing table?"

The sweep pays nothing for them: one union Overpass query per area returns both
halves, and `osm.split_sweep()` sorts them apart by tag.

## Wheelchair access

Every feature carries the place's wheelchair tags as recorded, and nothing
derived from them: `wheelchair` (`yes|limited|no|null`), `toilets_wheelchair`
(the same three, from `toilets:wheelchair`), `wheelchair_description` (the
mapper's free text) and `key` — the central-key system that locks the door
(`eurokey`, `nks`, …) or null. On a shop or a café `wheelchair=*` describes the
entrance, on a toilet block the toilet itself. The popup shows all of it; the
chip bar gains a last chip that narrows to `wheelchair=yes` and nothing else.
`limited` is one step of up to 7 cm or help needed (the wiki's definition, and
what Wheelmap paints orange), and `toilets:wheelchair=yes` alone would admit a
place with a step at the door, so both stay in the popup and out of the
filter. Like play it is a badge, never a status: an untagged place is
unrecorded, not inaccessible, so the chip starts off and subtracts. Switched on,
it stays on for that device (`localStorage`, `papamap-wheelchair`). The play
places carry the same three tags since v28, and the chip narrows their rings
by the same rule.

What the chip changes on the map is the Euro-key tables. Since v5 an object
whose door needs a central key is not a pin, because the key is issued only
against proof of disability and a typical father cannot get one. The people
this chip is for are exactly the people who hold that key, so under it — and
only under it — those tables come back, with a white key drawn inside the pin
from zoom 13 and a line in the popup. They ride in the GeoJSON with `key` set,
the frontend hides them by default, and `pipeline/run.py` hands only the
`key: null` features to the area pages and the leaderboard, so no count
anywhere grows by them; `stats.local.centralkey_locked` still counts them as
locked. Costs no extra Overpass query. Measured on Germany, 13 Sep 2026:
6,190 `changing_table=yes` objects, 4,419 of them `wheelchair=yes`, 534
`limited`, 495 `no`, 742 untagged; 390 tables in a wheelchair toilet, 7 of
them behind a Euro key.

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
and a host without a 60 s connection cutoff (see `DEPLOY.md`).

Every Overpass answer is checked for freshness (`osm3s.timestamp_osm_base`,
`PAPAMAP_OVERPASS_MAX_DATA_AGE_H`, default 24 h): a mirror serving a frozen
database is skipped, because a region quietly computed from months-old data is
a data bug on the map and a fake mover on the leaderboard.

## The store app

`app/` is the same map in a native shell (Capacitor) for the App Store and Google Play — the
very same `web/` tree, with `web/native.js` as the only seam; on the website every export of
it is inert. It exists for the three things a web page cannot do (`app/README.md` has the
layout, the build and the signing):

- **A city offline.** The website may not keep a basemap (see *Offline* above: the OSMF tile
  policy), so the app brings its own: a PMTiles extract of the Protomaps daily build per
  leaderboard city, cut weekly by `pipeline/tiles.py` and listed in `tiles/index.json`
  (CONTRACT.md v33). A saved city is drawn as vector layers under the pins, with or without a
  network. A mounted city is its whole file in memory, which is why only the cities the view is
  on are mounted, two at most (`citiesToMount`) — six saved cities read at launch would have
  iOS kill the app, and deleting a city needs the app.
- **"Nearest changing table" from Siri and Spotlight**, and
- **a home-screen widget** with the nearest table the reader can reach, its distance and its
  pin's colour. Both run in Swift over a compact copy of the tables the app writes into its App
  Group container — already narrowed by the wheelchair chip and read with the reader's
  Papa/Mama setting, so the widget, the shortcut and the app's own button name the same table.
  `status` is read there, never derived.

Both end at the same deep link, `papamap://table?osm=…`, and only the widget's tap takes it
through the OS. Siri's cannot: `OpenURLIntent` is the universal-link API, and handed the app's
own scheme iOS brings the app to the front and drops the URL — `application(_:open:)` never
fires, so the page is never told which table was found. Build 20 did exactly that: Siri said the
name and the distance, the tap opened the map on wherever it had been, and the same link from
the widget opened the pin. So the tap runs an intent of the app's own instead (`OpenTableIntent`,
`openAppWhenRun`, which is what makes `perform()` run inside the app), and that leaves the link
in a one-value slot the app's plugin empties into Capacitor's own opened-URL path. The slot is
read once and removed whatever its age, and ignored when it is older than two minutes: a tap
that never arrived must not open a table on some later morning.

The promises of the page hold unchanged: the position is used on the phone and never sent,
the dataset comes from papamap.de, and an answer goes to OpenStreetMap under the reader's own
account — with `host=https://papamap.de/` on the changeset, the OAuth return by
`papamap://auth` being the only difference. Location in the app comes from a short position
watch rather than one "current position" request: iOS holds the latter back for seconds until
it likes the accuracy; the first fix good to 100 m wins, after three seconds the best seen.

The app keeps the dataset the way it keeps a city: the native downloader puts the file on the
phone, beside the last good copy, and it replaces that copy only once it has parsed. The map is
drawn from that file with a network and without one, so a copy that cannot be read shows on the
first day, not in the basement. (Build 18 handed the 18 MB across the bridge as one string and
came up in airplane mode with the city and no pins.)

The loader also keeps its own clock — twenty seconds for the download and the fallback fetch
together, after which the copy on the phone answers. Until build 19 it had no bound at all, and
that, not the storing, is why builds 18 and 19 both came up in airplane mode with the saved city
drawn and no pins: a request into a black hole is not refused, it is left unanswered, and iOS and
WebKit will sit on one for as long as it takes. Measured in the simulator against an address that
drops packets, the native download took 75 s per file and the four fallback fetches, which WebKit
serialises per host, took 975 to 1200 s; the map drew at once, because a saved city is read off
the phone and owes the network nothing, and the pins arrived twenty-one minutes later.

**Letting go is not cancelling.** The download the clock gave up on keeps running, and when it
lands it is parsed and promoted to the good copy anyway — nothing waits for it, the pins were
drawn from the phone seconds earlier. That matters more than it sounds: without it, a link merely
*slow* rather than dead would abandon its download on every single launch, read the same stored
copy it read last time, and freeze the map on it for good. The service worker the eight seconds
below come from makes the same call — its timed-out request still stores the response it
eventually gets. A file that does not parse is deleted instead, never promoted, because `.new` is
itself a file the loader reads. And it waits for the stored read to finish before it moves
anything: promoting renames the very two files that read is working through, and on iOS renaming
onto an existing file means unlinking the old one first — done underneath a reader, that is how a
link finishing *just* after the clock would end up with no pins at all. A first launch too slow for
the clock draws an empty map once; the launch after it has the data.

A known rough edge: a reader on a slow-but-working link is told "Offline — the map is showing
stored data", because `fromStore` is what the toast keys on and the copy is indeed what they are
looking at. It is not wrong, only unkind. Saying it better means a new string in 32 languages,
so it waits.

How long that clock runs depends on what the waiting is worth, and a `stat` — not a parse — asks
the question: is there a copy on the phone at all? If there is, it is read in under a tenth of a
second and the network is racing something that has already won, so it gets **eight seconds**, the
same number the website's service worker has always used for the same trade. If there is nothing
stored, there is nothing to cut to and an empty map helps nobody, so the download keeps the long
rope.

And a phone that is not on a network at all waits for nothing: the copy is read before a single
request is made. Asking that question properly took two goes. `navigator.onLine` was the obvious
source and is simply wrong on iOS — build 20 came up in airplane mode reporting **online=true**
inside the app's WKWebView, so the shortcut never fired and the reader sat through all eight
seconds while four files already on the phone did nothing. The answer now comes from
`@capacitor/network`, which asks the OS (`SCNetworkReachability` on iOS, `ConnectivityManager` on Android);
`navigator.onLine` is the fallback where the plugin is not there, which is every browser. The
question is asked **once** a launch, before the four loads, and bounded to 400 ms of its own —
a new question must not become the new unbounded wait — and no answer in time counts as online,
since a wrong "offline" costs a refresh that was available while a wrong "online" costs only the
clock the reader was waiting anyway. "Connected" is still not "reachable": a Wi-Fi with no way out
reports connected, and that is what the eight seconds remain for. With no copy stored there is
nothing to shortcut to, and that case goes the long way regardless.

The state is read on the device and used there. Nothing about it is sent anywhere or written down.

At the foot of the offline dialog, **in the app only**, sits a small monospace block: for each of
the four dataset files, which of the loader's paths actually answered this launch (download,
fetch, stored, stored-new, none), how long it took, what the OS said about the network **and which
source said it** (`online=false (native)` against `(navigator)` — the difference between a phone
that knew and a phone that lied), and the size of the stored copy — under the shell pin. It is English and untranslated on purpose, because
it is a TestFlight aid rather than a feature: a tester whose map comes up without pins can say
which step produced that in one message, instead of one build per guess. Nothing in it is fetched,
stored or sent; every number is one the app already had in hand. On the website the block is
empty, and `:empty` keeps it out of the layout.

One thing the app never shows is the Ko-fi link: Apple wants a tip for the developer to go
through in-app purchase, and the developer account is declared a non-trader because the app has
no purchase and no donate button. On the app's own page the link is not there at all —
`app/shell.mjs` cuts the whole `<span class="donate">` out of the bundled `index.html`,
separator included, and the build fails if it cannot find it or leaves a Ko-fi URL behind. But
the app also opens the website's pages — a country page, the leaderboard, the methods, and the
map itself when a reader taps "back to the map" — and those are the website's, link and all,
inside an in-app browser that is still the app (issue #124). So `openExternal` marks every URL
it opens on our own origin, and only those, with `?app=1`; `web/in-app.js`, loaded blocking from
the head of each of those pages, reads the flag, remembers it in `sessionStorage` for the rest
of that in-app browsing session and puts `.in-app` on `<html>` before the first paint, under
which the CSS hides the donate span; once the session remembers, the script takes the flag out
of the address again, so a link shared out of the in-app browser does not hide the line for
whoever opens it. Every generated footer gets that span at render time
(`wrap_donate` in `pipeline/pages.py`, one rule over ~50 hand-written footers, raising rather
than shipping the link). A reader on the open web sees exactly what they saw before, and with
JavaScript off nothing happens at all.

