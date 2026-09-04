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
# Circuit breaker (osm.py). Retries and rounds ride out a flapping host; they
# are the wrong tool for one that has stopped talking to us altogether —
# 2026-08-23 overpass-api.de refused this host's IPv4 address at the TCP level
# for six hours while both mirrors answered HTTP 500 to everything, and the
# run kept knocking: 71 areas × 2 queries × 3 attempts × 3 hosts × 6 rounds.
# Whatever had banned us was given every reason to keep it up. So a host
# whose port will not even open (refused, unreachable) is rested on the spot;
# one that keeps failing at the HTTP level is rested after TRIP_AFTER
# consecutive queries that exhausted their retries. The rest doubles with each
# consecutive trip up to TRIP_MAX_S; a successful answer clears the slate.
OVERPASS_TRIP_AFTER = int(os.environ.get("PAPAMAP_OVERPASS_TRIP_AFTER", "3"))
OVERPASS_TRIP_COOLDOWN_S = float(os.environ.get("PAPAMAP_OVERPASS_TRIP_COOLDOWN_S", "900"))
OVERPASS_TRIP_MAX_S = float(os.environ.get("PAPAMAP_OVERPASS_TRIP_MAX_S", "7200"))

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

# France's 13 metropolitan régions, the analogue of BUNDESLAENDER: admin_level=4
# is the région, 6 the département (96 of those would be 192 queries a night).
#
# This is an ALLOWLIST, not a subdivision, and the distinction is load-bearing.
# The five overseas régions — Guadeloupe, Martinique, Guyane, La Réunion,
# Mayotte — are ALSO admin_level=4 and also carry ISO3166-2 FR-*, so the level
# does not exclude them; only these thirteen names do. Sweeping France whole
# instead would drop ~170 pins into the Caribbean, the Indian Ocean and South
# America, thousands of kilometres from the France its page and leaderboard
# row are about — and the country whole is an empty reply at 60 s anyway.
#
# Selected on `name`, never name:en — the opposite of the countries in
# NAME_EN_AREAS below. Every French région has a single unambiguous `name`,
# while name:en is actively wrong for this set: "Bourgogne – Franche-Comté"
# carries an EN DASH with spaces, "Ile-de-France" silently drops the accent,
# and four of the thirteen are translated (Brittany, Corsica, Normandy,
# Occitania) while the rest are not.
#
# All 13 verified to resolve as Overpass areas on 19 Aug 2026, each with a
# plausible count (7,568 objects total; largest Île-de-France 1,356, smallest
# Corse 32). Corse is admin_level=4 despite being a collectivité territoriale
# unique since 2018, and its `name` is "Corse", not "Collectivité de Corse".
FRANCE_REGIONS = (
    "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne",
    "Centre-Val de Loire", "Corse", "Grand Est", "Hauts-de-France",
    "Île-de-France", "Normandie", "Nouvelle-Aquitaine", "Occitanie",
    "Pays de la Loire", "Provence-Alpes-Côte d'Azur",
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
#
# Brussels-Capital is the one non-country in the set: the leaderboard city
# area for Brussels (CITY_AREAS below). Its `name` has Belgium's disease —
# the bilingual "Région de Bruxelles-Capitale - Brussels Hoofdstedelijk
# Gewest" — and name:en="Brussels-Capital" is exact on the admin_level=4
# region (verified 21 Aug 2026, 351 changing_table objects).
NAME_EN_AREAS = frozenset({
    "Belgium", "Netherlands", "Austria", "Switzerland", "Czechia",
    "Poland", "Sweden",
    "Brussels-Capital",
    # The Europe-complete ring (2026-08-22), all on name:en as one rule, even
    # where `name` happens to coincide (Malta, San Marino, Liechtenstein):
    # every one was verified to resolve on name:en with a plausible count
    # before it went in, and one rule survives the next reader where two
    # don't. Several would break on `name` outright — "Ireland / Éire",
    # "Suomi / Finland", "Ελλάδα", "Україна", "Bosna i Hercegovina /
    # Босна и Херцеговина".
    "Norway", "Finland", "Iceland", "Ireland",
    "Estonia", "Latvia", "Lithuania",
    "Luxembourg", "Liechtenstein", "Andorra", "Monaco", "San Marino",
    "Malta",
    "Spain", "Portugal", "Italy", "Greece", "Cyprus",
    "Slovenia", "Slovakia", "Hungary", "Croatia",
    "Romania", "Bulgaria",
    "Serbia", "Bosnia and Herzegovina", "Montenegro", "Albania",
    "North Macedonia", "Kosovo",
    "Moldova", "Ukraine", "Belarus",
    # The first non-European wave (2026-09-04). New Zealand's `name` is the
    # bilingual "New Zealand / Aotearoa", so name:en is not optional there;
    # Australia rides the one rule. Both verified to resolve on name:en the
    # same day: 3,373 and 770 changing_table objects.
    "Australia", "New Zealand",
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
# France is the second chunked country, for the same reason Germany is: a
# whole-France sweep produced ZERO bytes and died at 60.14 s (measured
# 19 Aug 2026 against overpass-api.de itself, not a mirror — the ~60 s cutoff
# is in the network path, and the main instance is not exempt from it).
# Per-région it is comfortable: the three largest measured 27.1 s
# (Auvergne-Rhône-Alpes), 19.7 s (Île-de-France) and 13.3 s
# (Nouvelle-Aquitaine) against the same [timeout:55] budget. See FRANCE_REGIONS
# above for why the list is an allowlist and why it is selected on `name`.
#
# The UK answers whole, but it is the tightest area in the project and the
# number to watch is NOT the object sweep. Every area is resolved twice a
# night, and for the UK the cheap-looking counting query is the slower of the
# two (measured 19 Aug 2026):
#   sweep_ql            41.9 s to first byte, 51.5 s total, 2.15 MB
#   toilets_counts_ql   45.2 s, 633 bytes  <- the binding one
# 45.2 s is 82 % of the budget. Judge any future area on the MAX of its two
# queries, not on the sweep alone; the slowest area otherwise shipped is the
# Netherlands at 41.7 s, so ~45 s is the line. If the UK crosses it, the only
# clean split is the four nations at admin_level=4 — and their names are
# bilingual ("Alba / Scotland", "Cymru / Wales"), so all of them would need
# name:en, while England keeps ~80 % of the objects anyway. England has no
# clean cover below that short of admin_level=6.
#
# "United Kingdom" is exact on `name` (name and name:en are identical), so it
# stays out of NAME_EN_AREAS. The relation covers England, Scotland, Wales and
# Northern Ireland only: the Crown Dependencies and Gibraltar carry their own
# admin_level=2 relations and are NOT swept (Isle of Man 9, Jersey 28,
# Gibraltar 3 changing_table objects, verified absent from the UK answer).
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
    "gb": (("United Kingdom", "2"),),
    "fr": tuple((name, "4") for name in FRANCE_REGIONS),
    # ------ the Europe-complete ring, added 2026-08-22 ------
    "no": (("Norway", "2"),),
    "fi": (("Finland", "2"),),
    "is": (("Iceland", "2"),),
    "ie": (("Ireland", "2"),),
    "ee": (("Estonia", "2"),),
    "lv": (("Latvia", "2"),),
    "lt": (("Lithuania", "2"),),
    "lu": (("Luxembourg", "2"),),
    "li": (("Liechtenstein", "2"),),
    "ad": (("Andorra", "2"),),
    "mc": (("Monaco", "2"),),
    "sm": (("San Marino", "2"),),
    "mt": (("Malta", "2"),),
    "es": (("Spain", "2"),),
    "pt": (("Portugal", "2"),),
    "it": (("Italy", "2"),),
    "gr": (("Greece", "2"),),
    "cy": (("Cyprus", "2"),),
    "si": (("Slovenia", "2"),),
    "sk": (("Slovakia", "2"),),
    "hu": (("Hungary", "2"),),
    "hr": (("Croatia", "2"),),
    "ro": (("Romania", "2"),),
    "bg": (("Bulgaria", "2"),),
    "rs": (("Serbia", "2"),),
    "ba": (("Bosnia and Herzegovina", "2"),),
    "me": (("Montenegro", "2"),),
    "al": (("Albania", "2"),),
    "mk": (("North Macedonia", "2"),),
    "xk": (("Kosovo", "2"),),
    "md": (("Moldova", "2"),),
    "ua": (("Ukraine", "2"),),
    "by": (("Belarus", "2"),),
    # ------ the first non-European wave, added 2026-09-04 ------
    # Picked by count, not by size: a per-country tally of every
    # changing_table object on the planet (QLever over osm-planet, one query
    # per admin_level=2 relation) ranks the world outside Europe as
    # US 3,298 pins / AU 1,393 / JP 1,170 / CA 700 / CN 306 / NZ 284, where a
    # pin is an object whose value is not `no`. A country joins above 250.
    # Australia and New Zealand are the two of those that answer WHOLE inside
    # the [timeout:55] budget on both nightly queries (AU 19.0 s sweep /
    # 29.1 s counting, NZ 14.7 / 23.3, measured 2026-09-04); the US dies at
    # the 60 s cutoff on both, Canada's count times out, and Japan counts in
    # 49.7 s — past the UK's 45.2 s, the tightest area shipped. Those three
    # need chunking like Germany and France and are their own waves.
    "au": (("Australia", "2"),),
    "nz": (("New Zealand", "2"),),
}

# Fallback display name per country. Germany and Denmark are named in their own
# language, from when the joined label had two readers; the countries added
# since are named the way the sweep selects them (NAME_EN_AREAS above), so the
# string in stats.json always names the area actually queried — Belgium and
# Switzerland have no single endonym to use instead. France is the exception
# that proves it: the sweep selects 13 régions, so the label is the aggregate
# "France", exactly as "Deutschland" aggregates 16 Länder. The frontend translates
# via area_key and only falls back to these when it has no translation.
COUNTRY_LABELS = {
    "de": "Deutschland", "dk": "Danmark", "be": "Belgium",
    "nl": "Netherlands", "at": "Austria", "ch": "Switzerland",
    "cz": "Czechia", "pl": "Poland", "se": "Sweden",
    "gb": "United Kingdom", "fr": "France",
    "no": "Norway", "fi": "Finland", "is": "Iceland", "ie": "Ireland",
    "ee": "Estonia", "lv": "Latvia", "lt": "Lithuania",
    "lu": "Luxembourg", "li": "Liechtenstein", "ad": "Andorra",
    "mc": "Monaco", "sm": "San Marino", "mt": "Malta",
    "es": "Spain", "pt": "Portugal", "it": "Italy", "gr": "Greece",
    "cy": "Cyprus", "si": "Slovenia", "sk": "Slovakia", "hu": "Hungary",
    "hr": "Croatia", "ro": "Romania", "bg": "Bulgaria", "rs": "Serbia",
    "ba": "Bosnia and Herzegovina", "me": "Montenegro", "al": "Albania",
    "mk": "North Macedonia", "xk": "Kosovo", "md": "Moldova",
    "ua": "Ukraine", "by": "Belarus",
    "au": "Australia", "nz": "New Zealand",
}

# One static page per country beyond Germany (pipeline/pages.py), each in the
# language its readers search in — the same argument that created the German
# Bundesland pages ("Wickeltisch Bayern" is searched in German) says
# "puslebord Danmark" is searched in Danish. Values: (page language, local
# display name, prepositional phrase for running prose, and the form a heading
# like "Die Zahlen für …" needs — None when the plain name serves). The
# phrases exist because names inflect: German says "in der Schweiz", Czech
# "v Česku", Polish "w Polsce" — see pages_l10n.py for how templates use them.
# The page slug is slugify(local name), pinned in test_pages.
#
# Belgium and Switzerland are multilingual; each page is written in the
# majority language (Dutch, German) rather than duplicated per language.
# France's entry is the hub page over its 13 région pages, which are written
# in French from FRANCE_REGION_FORMS in pages_l10n.py. The micro-states and
# the countries whose language the site does not speak borrow a neighbour's
# page language the same way: Ireland and Malta get English, Monaco and
# Luxembourg French, Liechtenstein German, Andorra Catalan, San Marino
# Italian, Moldova Romanian, Montenegro Serbian, Kosovo Albanian, Cyprus
# Greek — the language its readers already get from the map UI.
COUNTRY_PAGES = {
    "dk": ("da", "Danmark", "i Danmark", None),
    "be": ("nl", "België", "in België", None),
    "nl": ("nl", "Nederland", "in Nederland", None),
    "at": ("de", "Österreich", "in Österreich", None),
    "ch": ("de", "Schweiz", "in der Schweiz", "die Schweiz"),
    "cz": ("cs", "Česko", "v Česku", None),
    "pl": ("pl", "Polska", "w Polsce", None),
    "se": ("sv", "Sverige", "i Sverige", None),
    "gb": ("en", "United Kingdom", "in the United Kingdom",
           "the United Kingdom"),
    "fr": ("fr", "France", "en France", "la France"),
    # ------ the Europe-complete ring, pages added 2026-08-23 ------
    "no": ("no", "Norge", "i Norge", None),
    "fi": ("fi", "Suomi", "Suomessa", None),
    "is": ("is", "Ísland", "á Íslandi", None),
    "ie": ("en", "Ireland", "in Ireland", None),
    "ee": ("et", "Eesti", "Eestis", None),
    "lv": ("lv", "Latvija", "Latvijā", None),
    "lt": ("lt", "Lietuva", "Lietuvoje", None),
    "lu": ("fr", "Luxembourg", "au Luxembourg", "le Luxembourg"),
    "li": ("de", "Liechtenstein", "in Liechtenstein", None),
    "ad": ("ca", "Andorra", "a Andorra", None),
    "mc": ("fr", "Monaco", "à Monaco", None),
    "sm": ("it", "San Marino", "a San Marino", None),
    "mt": ("en", "Malta", "in Malta", None),
    "es": ("es", "España", "en España", None),
    "pt": ("pt", "Portugal", "em Portugal", None),
    "it": ("it", "Italia", "in Italia", "l'Italia"),
    "gr": ("el", "Ελλάδα", "στην Ελλάδα", "την Ελλάδα"),
    "cy": ("el", "Κύπρος", "στην Κύπρο", "την Κύπρο"),
    "si": ("sl", "Slovenija", "v Sloveniji", None),
    "sk": ("sk", "Slovensko", "na Slovensku", None),
    "hu": ("hu", "Magyarország", "Magyarországon", None),
    "hr": ("hr", "Hrvatska", "u Hrvatskoj", None),
    "ro": ("ro", "România", "în România", None),
    "bg": ("bg", "България", "в България", None),
    "rs": ("sr", "Србија", "у Србији", "Србију"),
    "ba": ("bs", "Bosna i Hercegovina", "u Bosni i Hercegovini", None),
    "me": ("sr", "Црна Гора", "у Црној Гори", "Црну Гору"),
    "al": ("sq", "Shqipëria", "në Shqipëri", "Shqipërinë"),
    "mk": ("mk", "Северна Македонија", "во Северна Македонија", None),
    "xk": ("sq", "Kosova", "në Kosovë", "Kosovën"),
    "md": ("ro", "Moldova", "în Moldova", None),
    "ua": ("uk", "Україна", "в Україні", None),
    "by": ("be", "Беларусь", "у Беларусі", None),
    # ------ the first non-European wave, pages added 2026-09-04 ------
    "au": ("en", "Australia", "in Australia", None),
    "nz": ("en", "New Zealand", "in New Zealand", None),
}

# Slug overrides for pages.slugify, keyed by display name. Only the non-Latin
# script names need one: slugify folds accents to base letters, but a Greek or
# Cyrillic name folds to nothing at all. The override is the romanization the
# country's own readers type; test_pages pins each one like every other slug.
COUNTRY_SLUGS = {
    "Ελλάδα": "ellada",
    "Κύπρος": "kypros",
    "България": "balgariya",
    "Србија": "srbija",
    "Црна Гора": "crna-gora",
    "Северна Македонија": "severna-makedonija",
    "Україна": "ukrayina",
    "Беларусь": "bielarus",
}

# Primary country per page language — where a language's leaderboard sends its
# readers "home". Most languages serve exactly one swept country; the ones that
# serve several (de: DE/AT/CH/LI, en: GB/IE/MT, fr: FR/MC/LU, nl: NL/BE,
# el: GR/CY, ro: RO/MD, sq: AL/XK, sr: RS/ME, it: IT/SM, ca: AD) name the
# biggest — its page's country list reaches the rest. "de" is special-cased by
# the consumer to the Bundesland hub at ./ rather than a country page.
LANG_HOME_CC = {
    "de": "de", "en": "gb", "da": "dk", "nl": "nl", "fr": "fr", "it": "it",
    "cs": "cz", "pl": "pl", "sv": "se", "bs": "ba", "ca": "ad", "et": "ee",
    "es": "es", "hr": "hr", "is": "is", "lv": "lv", "lt": "lt", "hu": "hu",
    "no": "no", "pt": "pt", "ro": "ro", "sq": "al", "sk": "sk", "sl": "si",
    "fi": "fi", "el": "gr", "be": "by", "bg": "bg", "mk": "mk", "sr": "rs",
    "uk": "ua",
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
#
# The 34 cities outside Germany and Denmark joined on 21 Aug 2026, two days
# after the regions table went to eleven countries while the city table still
# ended at Aalborg. Same curation rule, and levels stay non-uniform because
# the countries are: London is "Greater London" at 5 (a bare "London" at any
# level is Ontario, not England), Glasgow and Edinburgh carry their council
# areas' official names at 6, Wien and Praha are their country's level 4 the
# way Berlin is, the Polish five are city powiats at 6, Swedish kommuner sit
# at 7 like the Danish ones, and Paris-the-commune is also Paris-the-
# département in one level-6 relation.
#
# Some name+level pairs also match namesake areas abroad (Manchester,
# Birmingham, Bern, Lyon and Amsterdam at level 8 are each also small US
# towns). Harmless by construction: city membership is a join against the
# features the country sweep produced, and an id from Kansas never matches
# one — the namesakes only pad the ids-only payload by a few objects.
#
# Each city costs one ids-only query — one ~40 s Overpass slot — per night;
# these 34 add ~23 min, which the 03:30 cron absorbs while still finishing
# well before the 05:30 ops mail.
#
# Grouped by country code, not flat, because the leaderboard's country column
# renders from AREA_COUNTRY below — a flat list would need a second, hand-kept
# name→country table that could silently disagree with this one.
CITY_AREAS_BY_COUNTRY = {
    "de": (
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
    ),
    "dk": (
        ("København", "Københavns Kommune", "7"),
        ("Aarhus", "Aarhus Kommune", "7"),
        ("Odense", "Odense Kommune", "7"),
        ("Aalborg", "Aalborg Kommune", "7"),
    ),
    # Brussels is the Capital Region (19 communes, selected on name:en — see
    # NAME_EN_AREAS); the level-8 commune "Bruxelles - Brussel" would cover
    # about a fifth of the city.
    "be": (
        ("Brussels", "Brussels-Capital", "4"),
        ("Antwerpen", "Antwerpen", "8"),
        ("Gent", "Gent", "8"),
    ),
    # Gemeenten. "Utrecht" the province is level 4, no clash.
    "nl": (
        ("Amsterdam", "Amsterdam", "8"),
        ("Rotterdam", "Rotterdam", "8"),
        ("Den Haag", "Den Haag", "8"),
        ("Utrecht", "Utrecht", "8"),
    ),
    # Wien is a Bundesland, Graz and Linz are Statutarstädte.
    "at": (
        ("Wien", "Wien", "4"),
        ("Graz", "Graz", "6"),
        ("Linz", "Linz", "6"),
    ),
    # Gemeinden — the level-4 relations of the same names are the cantons.
    "ch": (
        ("Zürich", "Zürich", "8"),
        ("Bern", "Bern", "8"),
        ("Basel", "Basel", "8"),
        ("Genève", "Genève", "8"),
    ),
    # Praha is its own kraj; Brno is an obec. (A level-8 "Praha" exists too —
    # a Slovak village, excluded by the level.)
    "cz": (
        ("Praha", "Praha", "4"),
        ("Brno", "Brno", "8"),
    ),
    # City powiats.
    "pl": (
        ("Warszawa", "Warszawa", "6"),
        ("Kraków", "Kraków", "6"),
        ("Wrocław", "Wrocław", "6"),
        ("Gdańsk", "Gdańsk", "6"),
        ("Poznań", "Poznań", "6"),
    ),
    # Kommuner, and two of the three carry official names a reader would not
    # type — same display-vs-selector split as København.
    "se": (
        ("Stockholm", "Stockholms kommun", "7"),
        ("Göteborg", "Göteborgs Stad", "7"),
        ("Malmö", "Malmö kommun", "7"),
    ),
    "gb": (
        ("London", "Greater London", "5"),
        ("Birmingham", "Birmingham", "8"),
        ("Manchester", "Manchester", "8"),
        ("Glasgow", "Glasgow City", "6"),
        ("Edinburgh", "City of Edinburgh", "6"),
    ),
    # Communes, except Paris (see above).
    "fr": (
        ("Paris", "Paris", "6"),
        ("Marseille", "Marseille", "8"),
        ("Lyon", "Lyon", "8"),
        ("Toulouse", "Toulouse", "8"),
        ("Bordeaux", "Bordeaux", "8"),
    ),
}

# The flat (display name, OSM area name, admin_level) list everything else
# consumes, in the grouping's order.
CITY_AREAS = tuple(city for cities in CITY_AREAS_BY_COUNTRY.values()
                   for city in cities)

# Leaderboard row label → country code, for the country column on both tables.
# Region rows are keyed by sweep-area name, city rows by display name; Berlin,
# Hamburg and Bremen appear in both maps with the same answer. A history key
# that matches neither (an area removed from config after it was recorded)
# renders as a dash rather than KeyErroring a page build.
AREA_COUNTRY = {name: c for c, areas in COUNTRY_AREAS.items()
                for name, _ in areas}
AREA_COUNTRY.update({display: c for c, cities in CITY_AREAS_BY_COUNTRY.items()
                     for display, _, _ in cities})

# Per-region daily snapshots, appended by every full build and rendered into
# the leaderboard pages. Lives next to stats.json so it lands in the one
# writable mount under Docker and survives image rebuilds.
HISTORY_PATH = os.environ.get("PAPAMAP_HISTORY_PATH", "web/data/history.json")
HISTORY_MAX_DAYS = int(os.environ.get("PAPAMAP_HISTORY_MAX_DAYS", "400"))

# Comma-separated subset for a cheaper build (PAPAMAP_COUNTRIES=dk builds
# Denmark alone in ~30 s instead of sweeping all 17 areas).
# Named, not inlined into the os.environ.get() below, so a test can assert the
# default without the ambient PAPAMAP_COUNTRIES of whoever runs it: an operator
# who has exported an eleven-country build would otherwise see the guard that
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


def chunked_area_names() -> frozenset[str]:
    """Sweep-area names that are one chunk of a chunked country — Germany's 16
    Bundesländer and France's 13 régions — rather than a country swept whole.

    The leaderboard's regions table mixes both, and until France it could tell
    them apart with "everything that is not a Bundesland is a whole country".
    That stopped being true the moment a second country was chunked: it would
    have printed 13 French régions as sovereign states. Derived from
    COUNTRY_AREAS rather than listed, so a third chunked country cannot
    reintroduce the bug by omission.
    """
    return frozenset(name for areas in COUNTRY_AREAS.values() if len(areas) > 1
                     for name, _ in areas)


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
    ("countries_11"). Joining eleven labels overflows the strip, and a key per
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
    """Two integers, not every public toilet in eleven countries: how many
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
