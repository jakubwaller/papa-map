from __future__ import annotations

import os

from .classify import PLAY_AREA_VALUES

USER_AGENT = "papa-map/0.1 (+https://papamap.de; papamap@jakubwaller.eu)"

OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
# Mirrors tried in order until one returns data — a single flaky/overloaded
# instance (the 406/504 the main balancer hands back under load) no longer
# fails the whole build. Override the whole list with a comma-separated
# OVERPASS_URLS.
OVERPASS_URLS = [u.strip() for u in os.environ.get(
    "OVERPASS_URLS",
    ",".join((
        OVERPASS_URL,
        "https://overpass.private.coffee/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    )),
).split(",") if u.strip()]
OVERPASS_RETRIES = int(os.environ.get("PAPAMAP_OVERPASS_RETRIES", "3"))
# overpass-api.de rate-limits per IP: 2 slots, and a used slot stays blocked
# for ~40 s whatever the query's runtime (measured 2026-08-15: a 2.7 s query
# and a 7 s query both left "slot available in ~36 s"). Its /api/status page
# says so up front, so the fetcher asks before every query on these hosts and
# sleeps the reported wait instead of collecting 429s. Mirrors have no such
# page — for them the answer is always "go".
OVERPASS_STATUS_HOSTS = {h.strip() for h in os.environ.get(
    "PAPAMAP_OVERPASS_STATUS_HOSTS", "overpass-api.de").split(",") if h.strip()}
OVERPASS_SLOT_WAIT_MAX_S = float(os.environ.get("PAPAMAP_OVERPASS_SLOT_WAIT_MAX_S", "120"))
# A mirror can fall behind without ever failing: overpass.kumi.systems served a
# database frozen on 2026-05-31 for weeks, HTTP 200 and no remark, and every
# region the cascade handed it on a busy night lost two months of mapping —
# a quiet data bug on the map, and poison for a leaderboard that ranks change.
# Every answer carries the database timestamp it was computed from; older than
# this and the mirror is treated as dead and skipped. Healthy mirrors lag by
# minutes, the main instance by hours on a bad day — a day is generous, a
# season is not.
OVERPASS_MAX_DATA_AGE_H = float(os.environ.get("PAPAMAP_OVERPASS_MAX_DATA_AGE_H", "24"))
# Congested evenings 504 (or proxy-kill) for minutes at a stretch, not
# seconds — 5s·2^n rides that out where the old 2s·2^n just burned attempts.
OVERPASS_BACKOFF_S = float(os.environ.get("PAPAMAP_OVERPASS_BACKOFF_S", "5"))

# Germany-wide is ~13k changing_table + ~32k toilet objects (2026-07-30), but a
# single all-Germany area query computes for >60 s before the first response
# byte — and something in the network path (router/LB idle timeout, observed
# identically against two independent mirrors) kills exactly such connections.
# So the sweep is chunked per Bundesland: 16 small queries like the v0 Hamburg
# one (the largest, Bayern, measured 23 s), merged and deduped in run.py.
AREA_NAME = os.environ.get("PAPAMAP_AREA_NAME")  # set → single-area build
AREA_ADMIN_LEVEL = os.environ.get("PAPAMAP_AREA_ADMIN_LEVEL", "4")
DISPLAY_AREA_OVERRIDE = os.environ.get("PAPAMAP_DISPLAY_AREA")

BUNDESLAENDER = (
    "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen",
    "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen",
    "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland", "Sachsen",
    "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen",
)

# Areas whose Overpass selector is name:en instead of name. A country's `name`
# is whatever its own mappers write, and for two of the neighbours that is
# several languages at once: Belgium is "België / Belgique / Belgien" and
# Switzerland "Schweiz/Suisse/Svizzera/Svizra" (spaces around the slashes in
# one, none in the other). area["name"="Belgium"] resolves to nothing, and
# run.py can only read a zero-object area as a failed sweep — the build would
# burn six rounds and die with an error about a stale mirror. name:en is exact
# on all of them, and was verified to resolve for all 25 European countries
# probed on 18 Aug 2026.
#
# Germany and Denmark deliberately keep `name`: those strings are also the
# region keys in history.json and the row labels on the leaderboard, so
# renaming them would orphan every existing baseline.
NAME_EN_AREAS = frozenset({
    "Belgium", "Netherlands", "Austria", "Switzerland", "Czechia",
    "Poland", "Sweden",
})

# Sweep areas per country. Germany needs the 16-Land chunking above; every
# other country so far is small enough to answer whole as a single
# admin_level=2 area. Denmark: 933 changing_table + 4,655 amenity=toilets
# objects, one 14.5 s query measured 2026-08-04 — that relation is Denmark
# proper, Grønland and Føroyar carry their own admin_level=2 relations and stay
# out, which the measured feature bbox (54.7–57.7 N) confirms.
#
# The seven neighbours were each measured whole on 18 Aug 2026 against the
# production [timeout:55] budget. changing_table / amenity=toilets objects:
#   Belgium 3,624/2,340   Netherlands 814/3,398   Austria 1,539/6,146
#   Switzerland 1,435/6,760   Czechia 696/3,143   Poland 1,927/8,128
#   Sweden 1,330/6,794
# Every one answered inside the budget. The slowest sweep was the Netherlands
# at 41.7 s to first byte — payload has little to do with it (0.54 MB, against
# Belgium's 2.13 MB in 30.7 s); resolving the area dominates. That is real
# headroom against the ~60 s network-path cutoff that forces Germany's
# chunking, but not a lot, so these stay one area per country only for as long
# as they keep measuring like this. Three of the fourteen probes came back 504
# on the first attempt — ordinary congestion, and exactly what the mirror
# cascade and SWEEP_ROUNDS absorb.
#
# France is the one neighbour that does NOT fit: 7,739 changing_table objects,
# twice the UK's 3,707, where the UK sweep already spent 38.7 s of the 55 s
# budget. It needs a per-région area list before it can join.
COUNTRY_AREAS = {
    "de": tuple((name, "4") for name in BUNDESLAENDER),
    "dk": (("Danmark", "2"),),
    "be": (("Belgium", "2"),),
    "nl": (("Netherlands", "2"),),
    "at": (("Austria", "2"),),
    "ch": (("Switzerland", "2"),),
    "cz": (("Czechia", "2"),),
    "pl": (("Poland", "2"),),
    "se": (("Sweden", "2"),),
}

# Fallback display name per country. Germany and Denmark are named in their own
# language, from when the joined label had two readers; the countries added
# since are named the way the sweep selects them (NAME_EN_AREAS above), so the
# string in stats.json always names the area actually queried — Belgium and
# Switzerland have no single endonym to use instead. The frontend translates
# via area_key and only falls back to these when it has no translation.
COUNTRY_LABELS = {
    "de": "Deutschland", "dk": "Danmark", "be": "Belgium",
    "nl": "Netherlands", "at": "Austria", "ch": "Switzerland",
    "cz": "Czechia", "pl": "Poland", "se": "Sweden",
}

# Leaderboard city sweep: (display name, OSM area name, admin_level). Curated —
# big cities only, so one answered question moves a share the reader can see
# without a 20-pin village jumping the table on a single edit. The levels are
# not uniform on purpose: Berlin and Hamburg exist only as Länder (4), Bremen
# the city is level 6 inside Land Bremen (which also contains Bremerhaven),
# Hannover sits at 8 under Region Hannover, and Danish Kommuner are level 7.
# Each entry was verified to resolve as an Overpass area with a plausible
# changing_table count before it went in; a new city must be verified the same
# way, because a typo'd name resolves to zero objects and run.py can only
# treat that as a failed sweep.
CITY_AREAS = (
    ("Berlin", "Berlin", "4"),
    ("Hamburg", "Hamburg", "4"),
    ("München", "München", "6"),
    ("Köln", "Köln", "6"),
    ("Frankfurt am Main", "Frankfurt am Main", "6"),
    ("Stuttgart", "Stuttgart", "6"),
    ("Düsseldorf", "Düsseldorf", "6"),
    ("Leipzig", "Leipzig", "6"),
    ("Dortmund", "Dortmund", "6"),
    ("Essen", "Essen", "6"),
    ("Dresden", "Dresden", "6"),
    ("Nürnberg", "Nürnberg", "6"),
    ("Duisburg", "Duisburg", "6"),
    ("Bochum", "Bochum", "6"),
    ("Wuppertal", "Wuppertal", "6"),
    ("Bielefeld", "Bielefeld", "6"),
    ("Bonn", "Bonn", "6"),
    ("Münster", "Münster", "6"),
    ("Karlsruhe", "Karlsruhe", "6"),
    ("Mannheim", "Mannheim", "6"),
    ("Augsburg", "Augsburg", "6"),
    ("Wiesbaden", "Wiesbaden", "6"),
    ("Bremen", "Bremen", "6"),
    ("Hannover", "Hannover", "8"),
    ("København", "Københavns Kommune", "7"),
    ("Aarhus", "Aarhus Kommune", "7"),
    ("Odense", "Odense Kommune", "7"),
    ("Aalborg", "Aalborg Kommune", "7"),
)

# Per-region daily snapshots, appended by every full build and rendered into
# the leaderboard pages. Lives next to stats.json so it lands in the one
# writable mount under Docker and survives image rebuilds.
HISTORY_PATH = os.environ.get("PAPAMAP_HISTORY_PATH", "web/data/history.json")
HISTORY_MAX_DAYS = int(os.environ.get("PAPAMAP_HISTORY_MAX_DAYS", "400"))

# Comma-separated subset for a cheaper build (PAPAMAP_COUNTRIES=dk builds
# Denmark alone in ~30 s instead of sweeping all 17 areas).
# Named, not inlined into the os.environ.get() below, so a test can assert the
# default without the ambient PAPAMAP_COUNTRIES of whoever runs it: an operator
# who has exported a nine-country build would otherwise see the guard that
# exists to catch a moved default fail on their own machine instead.
DEFAULT_COUNTRIES = "de,dk"
SWEEP_COUNTRIES = tuple(c.strip().lower() for c in os.environ.get(
    "PAPAMAP_COUNTRIES", DEFAULT_COUNTRIES).split(",") if c.strip())


def _validated_countries() -> tuple[str, ...]:
    """SWEEP_COUNTRIES, refusing unknown codes — a typo'd PAPAMAP_COUNTRIES
    must fail the build loudly, not silently sweep fewer areas."""
    unknown = [c for c in SWEEP_COUNTRIES if c not in COUNTRY_AREAS]
    if unknown or not SWEEP_COUNTRIES:
        raise ValueError(
            f"PAPAMAP_COUNTRIES={','.join(SWEEP_COUNTRIES)!r}: unknown country "
            f"code(s) {unknown or ['(empty)']} — known: {sorted(COUNTRY_AREAS)}")
    return SWEEP_COUNTRIES


def sweep_areas() -> list[tuple[str, str]]:
    """(name, admin_level) pairs the pipeline sweeps. PAPAMAP_AREA_NAME set →
    just that one area (e.g. Hamburg/4 for a city build); default is all 16
    Bundesländer plus Denmark."""
    if AREA_NAME:
        return [(AREA_NAME, AREA_ADMIN_LEVEL)]
    return [area for c in _validated_countries() for area in COUNTRY_AREAS[c]]


def display_area() -> tuple[str, str | None]:
    """(name, i18n key) for the stats strip. The key ("de_dk", "dk", …) lets
    the frontend print the area in the reader's own language; it is None for a
    build whose area was named by hand, where no translation can exist.

    Past two countries the key stops naming the set and starts counting it
    ("countries_9"). Joining nine labels overflows the strip, and a key per
    set would need three new translations every time a country is added —
    whereas a count needs one string per language, ever. One and two countries
    keep their existing keys untouched, so "de_dk" survives."""
    override = DISPLAY_AREA_OVERRIDE or AREA_NAME
    if override:
        return override, None
    countries = _validated_countries()
    name = " & ".join(COUNTRY_LABELS[c] for c in countries)
    if len(countries) > 2:
        return name, f"countries_{len(countries)}"
    return name, "_".join(countries)


# A congested evening can kill a query on every mirror (observed 2026-07-30:
# four Länder in, then all mirrors dead for minutes) — so beyond the per-query
# mirror cascade, run.py sweeps failed areas again in later rounds after a
# cool-down instead of aborting the 15 good fetches with them. Six rounds, not
# three, since the freshness guard: the fallbacks used to "succeed" with stale
# data, now they are honestly rejected and everything rides on the main
# instance, which flaps 504/200 within seconds when busy (2026-08-15: one
# Land missed three rounds in a row). Rounds only re-query the failures, so
# a healthy night still costs nothing extra.
SWEEP_ROUNDS = int(os.environ.get("PAPAMAP_SWEEP_ROUNDS", "6"))
SWEEP_PAUSE_S = float(os.environ.get("PAPAMAP_SWEEP_PAUSE_S", "120"))

# The query budget stays under the observed 60 s cutoff so the server answers
# (even with a timeout remark) instead of the connection dying mid-compute; the
# HTTP timeout must outlive the server-side [timeout:...] or requests aborts a
# query the server was still happily computing.
OVERPASS_QL_TIMEOUT = int(os.environ.get("PAPAMAP_OVERPASS_QL_TIMEOUT", "55"))
OVERPASS_HTTP_TIMEOUT = int(os.environ.get(
    "PAPAMAP_OVERPASS_HTTP_TIMEOUT", str(OVERPASS_QL_TIMEOUT + 60)))

GEOJSON_PATH = os.environ.get("PAPAMAP_GEOJSON_PATH", "web/data/changing_tables.geojson")
# Its own file rather than a fourth status in the one above: these objects have
# no changing-table answer at all, so none of the three statuses can describe
# them, and every consumer of the pin dataset (leaderboard, Bundesland pages,
# stats) is about changing tables and must stay that way.
PLAY_GEOJSON_PATH = os.environ.get("PAPAMAP_PLAY_GEOJSON_PATH",
                                   "web/data/play_places.geojson")
STATS_PATH = os.environ.get("PAPAMAP_STATS_PATH", "web/data/stats.json")

# One static page per Bundesland, regenerated by every full build (pipeline/
# pages.py). Both values are public URLs — changing PAGES_BASE_PATH changes 17
# indexed addresses, so it also means updating web/sitemap.xml and the footer
# link in web/index.html. The trailing slash is part of it.
SITE_BASE_URL = os.environ.get("PAPAMAP_SITE_BASE_URL", "https://papamap.de").rstrip("/")
PAGES_BASE_PATH = "/wickeltische/"
PAGES_DIR = os.environ.get("PAPAMAP_PAGES_DIR", "web/wickeltische")

TAGINFO_STATS_URL = ("https://taginfo.openstreetmap.org/api/4/key/stats"
                     "?key=changing_table")
TAGINFO_VALUES_URL = ("https://taginfo.openstreetmap.org/api/4/key/values"
                      "?key=changing_table:location&rp=999&page=1"
                      "&sortname=count&sortorder=desc")


def area_name_key(area_name: str) -> str:
    """Which tag selects this area — `name` for everything the project started
    with, `name:en` for the areas whose own `name` is multilingual. Applies to
    a hand-set PAPAMAP_AREA_NAME too, which is what you want: "Switzerland"
    should resolve however it resolves in the nightly build."""
    return "name:en" if area_name in NAME_EN_AREAS else "name"


def _area_ql(area_name: str, admin_level: str, date: str | None = None) -> str:
    # [date:...] turns the query attic: the data as of that moment. Areas
    # themselves are derived from *current* boundaries — acceptable, Länder and
    # city limits move on a scale of decades, our history on a scale of weeks.
    attic = f'[date:"{date}"]' if date else ""
    key = area_name_key(area_name)
    return (f'[out:json][timeout:{OVERPASS_QL_TIMEOUT}]{attic};'
            f'area["{key}"="{area_name}"]["admin_level"="{admin_level}"]->.a;')


def changing_table_ql(area_name: str = "Deutschland", admin_level: str = "2",
                      date: str | None = None) -> str:
    """All objects carrying a changing_table tag (any value — `no` and junk
    values feed the stats even though only yes/limited become features)."""
    return _area_ql(area_name, admin_level, date) + 'nwr["changing_table"](area.a);out tags center;'


# Overpass prefilter for classify.has_play_area. Deliberately looser than the
# rule — QL can't express "an explicit kids_area:indoor=no overrules a bare
# kids_area=yes" — so Python re-applies has_play_area to whatever comes back;
# the regex is only here to keep the payload small. The values come from
# PLAY_AREA_VALUES so the query and the rule cannot drift apart.
_PLAY_VALUES_RE = "^(" + "|".join(sorted(PLAY_AREA_VALUES)) + ")$"
PLAY_AREA_CLAUSES = (
    f'nwr["kids_area"~"{_PLAY_VALUES_RE}"](area.a);'
    f'nwr["kids_area:indoor"~"{_PLAY_VALUES_RE}"](area.a);'
    'nwr["leisure"="indoor_play"](area.a);'
    'nwr["leisure"="playground"]["indoor"="yes"](area.a);'
)


def sweep_ql(area_name: str = "Deutschland", admin_level: str = "2",
             date: str | None = None) -> str:
    """The nightly build's object query: everything carrying a changing_table
    tag, unioned with everything recording an indoor play area. One query
    rather than two, because a second one would cost a whole ~40 s Overpass
    slot per area for a handful of objects — measured on Hamburg, the union
    answers 237 elements / 147 kB where the changing_table half alone answers
    222. run.py splits the two sets apart again by tag.

    Kept separate from changing_table_ql, which pipeline.backfill still uses:
    attic queries already take ~3 min per Land, and the leaderboard has only
    ever counted changing tables."""
    return (_area_ql(area_name, admin_level, date)
            + '(nwr["changing_table"](area.a);' + PLAY_AREA_CLAUSES + ');'
            + 'out tags center;')


def changing_table_ids_ql(area_name: str, admin_level: str,
                          date: str | None = None) -> str:
    """Ids only — enough to say *which* already-classified objects lie in a
    city, at a fraction of the tag query's payload. Any changing_table value:
    the join against the feature list drops the `no`s for free."""
    return _area_ql(area_name, admin_level, date) + 'nwr["changing_table"](area.a);out ids;'


# Key regex for the capacity scan, mirroring the Python it replaced
# (`k.startswith("toilets:num_chambers")`) so the prefixed variants people
# actually map — toilets:num_chambers:female, :male — still count.
_CHAMBERS_KEY_RE = "^toilets:num_chambers"


def toilets_counts_ql(area_name: str = "Deutschland", admin_level: str = "2",
                      date: str | None = None) -> str:
    """Two integers, not every public toilet in nine countries: how many
    amenity=toilets the area holds, and how many of those carry a
    toilets:num_chambers* capacity tag.

    Those two numbers are all stats.local_stats ever took from this query, and
    fetching them as objects was most of the nightly download: 73,860 of the
    99,224 elements swept on 19 Aug 2026, about 12 MB of roughly 28 MB, for
    two counters. Measured the same day on Danmark, which holds 4,676 of them:
    786,302 bytes with `out tags;`, 633 bytes with the two `out count;`
    statements below.

    It does NOT make the build faster — the server still has to find every
    object, and the slot cost is unchanged. What it buys is our share of the
    ~1 GB/day download budget Overpass asks users to stay under
    (https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).

    Two `out count;` statements in ONE query, not two queries: counting costs
    the same slot as listing, and a second query would burn another ~40 s
    slot per area for one number. osm.parse_counts reads them back in this
    order — total first, capacity-tagged second.
    """
    return (_area_ql(area_name, admin_level, date)
            + 'nwr["amenity"="toilets"](area.a)->.t;'
            + '.t out count;'
            + f'nwr.t[~"{_CHAMBERS_KEY_RE}"~"."];'
            + 'out count;')
