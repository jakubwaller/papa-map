from __future__ import annotations

# Every string the generated area pages need, in the language of the people
# who search for them. The German Bundesland pages exist because "Wickeltisch
# Bayern" is searched in German — and by the same argument "puslebord Danmark"
# is searched in Danish and "table à langer Bretagne" in French, so each
# country's page is written in that country's language, not in the visitor's
# UI language (a static page has exactly one).
#
# The vocabulary is NOT free to drift: the map UI (web/i18n.js) and the nine
# methods pages already settled what a changing table is called per language
# (puslebord, verschoontafel, table à langer, přebalovací pult, przewijak,
# skötbord) and what the three colours mean. Every string below reuses that
# wording; when editing here, check those two places first.
#
# Templates dodge inflection on purpose. Slavic languages decline area names
# ("v Česku", "w Polsce") and French needs an article that varies per région
# ("en Bretagne" but "dans le Grand Est"), so a page never interpolates a bare
# name into running prose: it interpolates {name_in} (a complete prepositional
# phrase), {In} (the same, capitalised for a sentence start) or {name_for} (the
# form a heading like "Die Zahlen für …" needs — "die Schweiz", "la Bretagne").
# The forms live in config.COUNTRY_PAGES and FRANCE_REGION_FORMS below; a
# language whose template would still inflect (Polish "Otwórz …") uses a
# name-free sentence instead.
#
# Impressum and Datenschutz stay German in every footer: they are the German
# legal pages themselves, and their names function as proper nouns.

# French prepositional phrase and article form per région: "en" for the
# feminine and vowel-initial names, "dans le/les" for the rest. Keys must
# match config.FRANCE_REGIONS exactly (test_pages pins that).
FRANCE_REGION_FORMS = {
    "Auvergne-Rhône-Alpes": ("en Auvergne-Rhône-Alpes", "l'Auvergne-Rhône-Alpes"),
    "Bourgogne-Franche-Comté": ("en Bourgogne-Franche-Comté",
                                "la Bourgogne-Franche-Comté"),
    "Bretagne": ("en Bretagne", "la Bretagne"),
    "Centre-Val de Loire": ("en Centre-Val de Loire", "le Centre-Val de Loire"),
    "Corse": ("en Corse", "la Corse"),
    "Grand Est": ("dans le Grand Est", "le Grand Est"),
    "Hauts-de-France": ("dans les Hauts-de-France", "les Hauts-de-France"),
    "Île-de-France": ("en Île-de-France", "l'Île-de-France"),
    "Normandie": ("en Normandie", "la Normandie"),
    "Nouvelle-Aquitaine": ("en Nouvelle-Aquitaine", "la Nouvelle-Aquitaine"),
    "Occitanie": ("en Occitanie", "l'Occitanie"),
    "Pays de la Loire": ("dans les Pays de la Loire", "les Pays de la Loire"),
    "Provence-Alpes-Côte d'Azur": ("en Provence-Alpes-Côte d'Azur",
                                   "la Provence-Alpes-Côte d'Azur"),
}

# The amenity tag is a controlled OSM vocabulary; these 20 values cover 99% of
# the German dataset and the tail falls back to the raw value with underscores
# stripped. Same 20 keys per language — a page that reads half-translated is
# better than one that silently drops the type.
AMENITY = {
    "de": {
        "toilets": "Öffentliche Toilette", "restaurant": "Restaurant",
        "cafe": "Café", "fast_food": "Imbiss",
        "community_centre": "Bürgerhaus", "library": "Bibliothek",
        "fuel": "Tankstelle", "pub": "Kneipe", "biergarten": "Biergarten",
        "ice_cream": "Eisdiele", "social_facility": "Soziale Einrichtung",
        "townhall": "Rathaus", "doctors": "Arztpraxis", "pharmacy": "Apotheke",
        "place_of_worship": "Kirche", "cinema": "Kino", "theatre": "Theater",
        "hospital": "Krankenhaus", "marketplace": "Marktplatz",
        "kindergarten": "Kindergarten",
    },
    "en": {
        "toilets": "Public toilet", "restaurant": "Restaurant",
        "cafe": "Café", "fast_food": "Fast food",
        "community_centre": "Community centre", "library": "Library",
        "fuel": "Petrol station", "pub": "Pub", "biergarten": "Beer garden",
        "ice_cream": "Ice cream parlour", "social_facility": "Social facility",
        "townhall": "Town hall", "doctors": "Doctor's practice",
        "pharmacy": "Pharmacy", "place_of_worship": "Church",
        "cinema": "Cinema", "theatre": "Theatre", "hospital": "Hospital",
        "marketplace": "Marketplace", "kindergarten": "Nursery",
    },
    "da": {
        "toilets": "Offentligt toilet", "restaurant": "Restaurant",
        "cafe": "Café", "fast_food": "Fastfood",
        "community_centre": "Medborgerhus", "library": "Bibliotek",
        "fuel": "Tankstation", "pub": "Pub", "biergarten": "Biergarten",
        "ice_cream": "Isbutik", "social_facility": "Social institution",
        "townhall": "Rådhus", "doctors": "Lægepraksis", "pharmacy": "Apotek",
        "place_of_worship": "Kirke", "cinema": "Biograf", "theatre": "Teater",
        "hospital": "Hospital", "marketplace": "Markedsplads",
        "kindergarten": "Børnehave",
    },
    "nl": {
        "toilets": "Openbaar toilet", "restaurant": "Restaurant",
        "cafe": "Café", "fast_food": "Snackbar",
        "community_centre": "Buurthuis", "library": "Bibliotheek",
        "fuel": "Tankstation", "pub": "Pub", "biergarten": "Biertuin",
        "ice_cream": "IJssalon", "social_facility": "Sociale voorziening",
        "townhall": "Gemeentehuis", "doctors": "Huisartsenpraktijk",
        "pharmacy": "Apotheek", "place_of_worship": "Kerk",
        "cinema": "Bioscoop", "theatre": "Theater", "hospital": "Ziekenhuis",
        "marketplace": "Markt", "kindergarten": "Kinderdagverblijf",
    },
    "fr": {
        "toilets": "Toilettes publiques", "restaurant": "Restaurant",
        "cafe": "Café", "fast_food": "Restauration rapide",
        "community_centre": "Centre socioculturel", "library": "Bibliothèque",
        "fuel": "Station-service", "pub": "Pub", "biergarten": "Biergarten",
        "ice_cream": "Glacier", "social_facility": "Établissement social",
        "townhall": "Mairie", "doctors": "Cabinet médical",
        "pharmacy": "Pharmacie", "place_of_worship": "Église",
        "cinema": "Cinéma", "theatre": "Théâtre", "hospital": "Hôpital",
        "marketplace": "Place de marché", "kindergarten": "Crèche",
    },
    "cs": {
        "toilets": "Veřejné WC", "restaurant": "Restaurace",
        "cafe": "Kavárna", "fast_food": "Rychlé občerstvení",
        "community_centre": "Komunitní centrum", "library": "Knihovna",
        "fuel": "Čerpací stanice", "pub": "Hospoda",
        "biergarten": "Pivní zahrádka", "ice_cream": "Zmrzlina",
        "social_facility": "Sociální zařízení", "townhall": "Radnice",
        "doctors": "Ordinace", "pharmacy": "Lékárna",
        "place_of_worship": "Kostel", "cinema": "Kino", "theatre": "Divadlo",
        "hospital": "Nemocnice", "marketplace": "Tržiště",
        "kindergarten": "Školka",
    },
    "pl": {
        "toilets": "Toaleta publiczna", "restaurant": "Restauracja",
        "cafe": "Kawiarnia", "fast_food": "Fast food",
        "community_centre": "Dom kultury", "library": "Biblioteka",
        "fuel": "Stacja paliw", "pub": "Pub", "biergarten": "Ogródek piwny",
        "ice_cream": "Lodziarnia", "social_facility": "Placówka społeczna",
        "townhall": "Ratusz", "doctors": "Przychodnia", "pharmacy": "Apteka",
        "place_of_worship": "Kościół", "cinema": "Kino", "theatre": "Teatr",
        "hospital": "Szpital", "marketplace": "Targowisko",
        "kindergarten": "Przedszkole",
    },
    "sv": {
        "toilets": "Offentlig toalett", "restaurant": "Restaurang",
        "cafe": "Kafé", "fast_food": "Snabbmat",
        "community_centre": "Medborgarhus", "library": "Bibliotek",
        "fuel": "Bensinstation", "pub": "Pub", "biergarten": "Biergarten",
        "ice_cream": "Glassbar", "social_facility": "Social inrättning",
        "townhall": "Kommunhus", "doctors": "Läkarmottagning",
        "pharmacy": "Apotek", "place_of_worship": "Kyrka",
        "cinema": "Biograf", "theatre": "Teater", "hospital": "Sjukhus",
        "marketplace": "Marknadsplats", "kindergarten": "Förskola",
    },
}

# Czech and Polish month names are genitive because they follow a day number
# ("21. srpna", "21 sierpnia") — the nominative would be wrong in a date.
_MONTHS = {
    "de": ("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
           "August", "September", "Oktober", "November", "Dezember"),
    "en": ("January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"),
    "da": ("januar", "februar", "marts", "april", "maj", "juni", "juli",
           "august", "september", "oktober", "november", "december"),
    "nl": ("januari", "februari", "maart", "april", "mei", "juni", "juli",
           "augustus", "september", "oktober", "november", "december"),
    "fr": ("janvier", "février", "mars", "avril", "mai", "juin", "juillet",
           "août", "septembre", "octobre", "novembre", "décembre"),
    "cs": ("ledna", "února", "března", "dubna", "května", "června",
           "července", "srpna", "září", "října", "listopadu", "prosince"),
    "pl": ("stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
           "lipca", "sierpnia", "września", "października", "listopada",
           "grudnia"),
    "sv": ("januari", "februari", "mars", "april", "maj", "juni", "juli",
           "augusti", "september", "oktober", "november", "december"),
}

L = {
    "de": {
        "months": _MONTHS["de"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": ".",
        "methods": "methods.html",
        "title": "Wickeltische {name_in} — PapaMap",
        "h1": "Wickeltische {name_in}",
        "meta_desc": ("{tables} Orte {name_in} mit Wickeltisch, aus "
                      "OpenStreetMap. Bei {unknown} davon ist nicht erfasst, "
                      "in welchem Raum der Tisch steht — und genau das lässt "
                      "sich reparieren."),
        "stand": "Stand {date} · Daten aus OpenStreetMap",
        "back_map": "Zur Karte",
        "back_hub": "Alle Bundesländer",
        "crumb_hub": "Wickeltische nach Bundesland",
        "empty": ("OpenStreetMap kennt {name_in} derzeit keinen einzigen "
                  "Ort mit Wickeltisch. Das heißt fast sicher: es hat ihn "
                  "noch niemand erfasst."),
        "intro": ("OpenStreetMap kennt {name_in} <strong>{tables}</strong> Orte "
                  "mit Wickeltisch. Bei <strong>{accessible}</strong> ist "
                  "erfasst, dass ein Vater ihn auch erreicht — Herren-WC, "
                  "Unisex-WC oder eigener Wickelraum. "
                  "<strong>{female_only}</strong> hängen "
                  "nur im Damen-WC. Und bei "
                  "<strong>{unknown}</strong> von {tables} "
                  "({pct}&nbsp;%) hat schlicht niemand erfasst, in welchem Raum der Tisch "
                  "steht. Das sind die grauen Pins auf der Karte, und die sind die "
                  "eigentliche Aufgabe: die Frage beantwortet man vor Ort in unter einer "
                  "Minute."),
        "map_cta": "{Name_for} auf der Karte öffnen",
        "numbers_h2": "Die Zahlen für {name_for}",
        "th_things": "Wickeltische", "th_places": "Orte", "total": "Gesamt",
        "statuses": {"accessible": "Erreichbar",
                     "female_only": "Nur Damen-WC",
                     "unknown": "Raum unbekannt"},
        "toilets_note": ("{In} sind außerdem "
                         "{toilets} öffentliche Toiletten erfasst — die "
                         "allermeisten ohne jede Angabe zum Wickeltisch. Ein "
                         "Versorgungsvergleich "
                         "zwischen Ländern lässt sich daraus nicht bauen; warum nicht, steht in den "
                         '<a href="{up}{methods}">Methoden</a>.'),
        "named_h2": "Orte mit Namen",
        "named_intro": ("{named_places} der {tables} Orte tragen in "
                        "OpenStreetMap einen Namen, zusammen "
                        "{named} verschiedene. Die übrigen "
                        "{unnamed} sind fast durchweg öffentliche Toiletten ohne "
                        "Namen — sie stehen auf der Karte, lassen sich hier aber nicht sinnvoll "
                        "auflisten. Filialen einer Kette sind zu einer Zeile zusammengefasst."),
        "th_place": "Ort", "th_kind": "Art", "th_count": "Orte",
        "help_h2": "Wie du hier hilfst",
        "help": ("Ein grauer Pin heißt: den Wickeltisch gibt es, aber niemand hat erfasst, in "
                 "welchem Raum er steht. Genau diese Antwort fehlt Vätern. Beantworten kann sie "
                 "jeder mit einem kostenlosen OpenStreetMap-Konto, vor Ort, in unter einer "
                 "Minute — der Link am Pin öffnet MapComplete direkt am richtigen Objekt. Die "
                 "Antwort landet in OpenStreetMap, gehört allen und ist nach dem nächsten "
                 'nächtlichen Update hier zu sehen. <a href="{up}{methods}#contribute">'
                 "Schritt für Schritt</a>."),
        "siblings_h2": "Andere Bundesländer",
        "countries_h2": "PapaMap in anderen Ländern",
        "places_unit": "Orte",
        "footer": """\
<h2>Daten &amp; Lizenz</h2>
<p class="muted">Alle Daten &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, unter der <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Diese
Seite wird jede Nacht aus einer Overpass-Abfrage neu erzeugt und speichert nichts über dich.
Wie gezählt und eingefärbt wird: <a href="{up}methods.html">Methoden</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap ist kostenlos und werbefrei.
<a href="https://ko-fi.com/jakubwaller">&#9749; Kaffee spendieren</a>.</p>
""",
    },
    "en": {
        "months": _MONTHS["en"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": ",",
        "methods": "methods-en.html",
        "title": "Changing tables {name_in} — PapaMap",
        "h1": "Changing tables {name_in}",
        "meta_desc": ("{tables} places with a baby changing table {name_in}, "
                      "from OpenStreetMap. For {unknown} of them nobody has "
                      "recorded which room the table is in — and that is "
                      "exactly what can be fixed."),
        "stand": "As of {date} · Data from OpenStreetMap",
        "back_map": "To the map",
        "empty": ("OpenStreetMap currently knows not a single place with a "
                  "baby changing table {name_in}. That almost certainly "
                  "means: nobody has recorded one yet."),
        "intro": ("OpenStreetMap knows <strong>{tables}</strong> places with a "
                  "baby changing table {name_in}. For "
                  "<strong>{accessible}</strong> of them someone recorded "
                  "that a dad can actually reach it — a men's room, a unisex "
                  "toilet or a dedicated changing room. "
                  "<strong>{female_only}</strong> hang in the women's room "
                  "only. And for <strong>{unknown}</strong> of {tables} "
                  "({pct}%) nobody has recorded which room the table is in. "
                  "Those are the grey pins on the map, and they are the "
                  "actual task: the question takes under a minute to answer "
                  "on site."),
        "map_cta": "Open {name_for} on the map",
        "numbers_h2": "The numbers for {name_for}",
        "th_things": "Changing tables", "th_places": "Places",
        "total": "Total",
        "statuses": {"accessible": "Reachable",
                     "female_only": "Women's room only",
                     "unknown": "Room unknown"},
        "toilets_note": ("{In}, OpenStreetMap also records {toilets} public "
                         "toilets — the vast majority without any "
                         "changing-table information at all. A provision "
                         "ranking cannot honestly be built from that; the "
                         '<a href="{up}{methods}">methods page</a> explains '
                         "why."),
        "named_h2": "Named places",
        "named_intro": ("{named_places} of the {tables} places carry a name "
                        "in OpenStreetMap, {named} different ones in total. "
                        "The remaining {unnamed} are almost all unnamed "
                        "public toilets — they are on the map, but there is "
                        "no sensible way to list them here. Branches of a "
                        "chain are folded into one row."),
        "th_place": "Place", "th_kind": "Type", "th_count": "Places",
        "help_h2": "How you help here",
        "help": ("A grey pin means: the changing table exists, but nobody "
                 "has recorded which room it is in. That answer is exactly "
                 "what dads are missing. Anyone with a free OpenStreetMap "
                 "account can give it, on site, in under a minute — the link "
                 "on the pin opens MapComplete right at the correct object. "
                 "The answer lands in OpenStreetMap, belongs to everyone and "
                 "shows up here after the next nightly update. "
                 '<a href="{up}{methods}#contribute">Step by step</a>.'),
        "countries_h2": "PapaMap in other countries",
        "places_unit": "places",
        "footer": """\
<h2>Data &amp; licence</h2>
<p class="muted">All data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, under the <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. This
page is regenerated every night from an Overpass query and stores nothing about you.
How things are counted and coloured: <a href="{up}methods-en.html">Methods</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap is free and ad-free.
<a href="https://ko-fi.com/jakubwaller">&#9749; Buy me a coffee</a>.</p>
""",
    },
    "da": {
        "months": _MONTHS["da"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": ".",
        "methods": "methods-da.html",
        "title": "Pusleborde {name_in} — PapaMap",
        "h1": "Pusleborde {name_in}",
        "meta_desc": ("{tables} steder med puslebord {name_in}, fra "
                      "OpenStreetMap. For {unknown} af dem er det ikke "
                      "registreret, hvilket rum bordet står i — og netop det "
                      "kan repareres."),
        "stand": "Status {date} · Data fra OpenStreetMap",
        "back_map": "Til kortet",
        "empty": ("OpenStreetMap kender i øjeblikket ikke ét eneste sted med "
                  "puslebord {name_in}. Det betyder næsten helt sikkert: "
                  "ingen har registreret det endnu."),
        "intro": ("OpenStreetMap kender <strong>{tables}</strong> steder med "
                  "puslebord {name_in}. For <strong>{accessible}</strong> af "
                  "dem er det registreret, at en far også kan nå bordet — "
                  "herretoilet, unisex-toilet eller eget puslerum. "
                  "<strong>{female_only}</strong> hænger kun på "
                  "dametoilettet. Og for <strong>{unknown}</strong> af "
                  "{tables} ({pct}&nbsp;%) har ingen registreret, hvilket "
                  "rum bordet står i. Det er de grå nåle på kortet, og de er "
                  "den egentlige opgave: spørgsmålet kan besvares på stedet "
                  "på under et minut."),
        "map_cta": "Åbn {name_for} på kortet",
        "numbers_h2": "Tallene for {name_for}",
        "th_things": "Pusleborde", "th_places": "Steder", "total": "I alt",
        "statuses": {"accessible": "Kan nås",
                     "female_only": "Kun dametoilet",
                     "unknown": "Rum ukendt"},
        "toilets_note": ("{In} er der desuden registreret {toilets} "
                         "offentlige toiletter — langt de fleste uden nogen "
                         "oplysning om puslebord. En sammenligning af "
                         "dækningen kan ikke bygges på det; hvorfor ikke, "
                         'står i <a href="{up}{methods}">metoderne</a>.'),
        "named_h2": "Steder med navn",
        "named_intro": ("{named_places} af de {tables} steder har et navn i "
                        "OpenStreetMap, tilsammen {named} forskellige. De "
                        "øvrige {unnamed} er næsten alle offentlige "
                        "toiletter uden navn — de står på kortet, men kan "
                        "ikke opremses meningsfuldt her. Filialer af en "
                        "kæde er samlet i én række."),
        "th_place": "Sted", "th_kind": "Type", "th_count": "Steder",
        "help_h2": "Sådan hjælper du",
        "help": ("En grå nål betyder: puslebordet findes, men ingen har "
                 "registreret, hvilket rum det står i. Præcis det svar "
                 "mangler fædrene. Alle med en gratis OpenStreetMap-konto "
                 "kan give det, på stedet, på under et minut — linket på "
                 "nålen åbner MapComplete direkte ved det rigtige objekt. "
                 "Svaret lander i OpenStreetMap, tilhører alle og kan ses "
                 "her efter næste natlige opdatering. "
                 '<a href="{up}{methods}#contribute">Trin for trin</a>.'),
        "countries_h2": "PapaMap i andre lande",
        "places_unit": "steder",
        "footer": """\
<h2>Data &amp; licens</h2>
<p class="muted">Alle data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-bidragydere</a>,
under <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Denne side genskabes hver
nat fra en Overpass-forespørgsel og gemmer intet om dig.
Sådan tælles og farvelægges der: <a href="{up}methods-da.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap er gratis og reklamefrit.
<a href="https://ko-fi.com/jakubwaller">&#9749; Giv en kop kaffe</a>.</p>
""",
    },
    "nl": {
        "months": _MONTHS["nl"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": ".",
        "methods": "methods-nl.html",
        "title": "Verschoontafels {name_in} — PapaMap",
        "h1": "Verschoontafels {name_in}",
        "meta_desc": ("{tables} plekken met verschoontafel (luiertafel) "
                      "{name_in}, uit OpenStreetMap. Bij {unknown} daarvan "
                      "is niet vastgelegd in welke ruimte de tafel hangt — "
                      "en precies dat valt te repareren."),
        "stand": "Stand {date} · Gegevens uit OpenStreetMap",
        "back_map": "Naar de kaart",
        "empty": ("OpenStreetMap kent {name_in} op dit moment geen enkele "
                  "plek met verschoontafel. Dat betekent vrijwel zeker: "
                  "niemand heeft er nog een vastgelegd."),
        "intro": ("OpenStreetMap kent <strong>{tables}</strong> plekken met "
                  "verschoontafel {name_in}. Bij "
                  "<strong>{accessible}</strong> daarvan is vastgelegd dat "
                  "een papa er ook bij kan — herentoilet, unisektoilet of "
                  "een eigen verschoonruimte. <strong>{female_only}</strong> "
                  "hangen alleen in het damestoilet. En bij "
                  "<strong>{unknown}</strong> van de {tables} "
                  "({pct}&nbsp;%) heeft simpelweg niemand vastgelegd in "
                  "welke ruimte de tafel hangt. Dat zijn de grijze pins op "
                  "de kaart, en die zijn de eigenlijke opgave: de vraag "
                  "beantwoord je ter plekke in nog geen minuut."),
        "map_cta": "Open {name_for} op de kaart",
        "numbers_h2": "De cijfers voor {name_for}",
        "th_things": "Verschoontafels", "th_places": "Plekken",
        "total": "Totaal",
        "statuses": {"accessible": "Bereikbaar",
                     "female_only": "Alleen damestoilet",
                     "unknown": "Ruimte onbekend"},
        "toilets_note": ("{In} zijn daarnaast {toilets} openbare toiletten "
                         "vastgelegd — verreweg de meeste zonder enige "
                         "informatie over een verschoontafel. Een "
                         "vergelijking van het aanbod valt daar niet op te "
                         'bouwen; waarom niet staat in de <a href="{up}'
                         '{methods}">methoden</a>.'),
        "named_h2": "Plekken met naam",
        "named_intro": ("{named_places} van de {tables} plekken dragen in "
                        "OpenStreetMap een naam, samen {named} verschillende. "
                        "De overige {unnamed} zijn vrijwel allemaal openbare "
                        "toiletten zonder naam — ze staan op de kaart, maar "
                        "zijn hier niet zinvol op te sommen. Filialen van "
                        "een keten zijn samengevoegd tot één regel."),
        "th_place": "Plek", "th_kind": "Soort", "th_count": "Plekken",
        "help_h2": "Zo help je mee",
        "help": ("Een grijze pin betekent: de verschoontafel bestaat, maar "
                 "niemand heeft vastgelegd in welke ruimte hij hangt. "
                 "Precies dat antwoord missen papa's. Iedereen met een "
                 "gratis OpenStreetMap-account kan het geven, ter plekke, in "
                 "nog geen minuut — de link bij de pin opent MapComplete "
                 "meteen bij het juiste object. Het antwoord belandt in "
                 "OpenStreetMap, is van iedereen en staat hier na de "
                 "volgende nachtelijke update. "
                 '<a href="{up}{methods}#contribute">Stap voor stap</a>.'),
        "countries_h2": "PapaMap in andere landen",
        "places_unit": "plekken",
        "footer": """\
<h2>Gegevens &amp; licentie</h2>
<p class="muted">Alle gegevens &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-bijdragers</a>,
onder de <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Deze pagina wordt elke
nacht opnieuw opgebouwd uit een Overpass-query en slaat niets over jou op.
Hoe er geteld en gekleurd wordt: <a href="{up}methods-nl.html">Methoden</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap is gratis en reclamevrij.
<a href="https://ko-fi.com/jakubwaller">&#9749; Trakteer op koffie</a>.</p>
""",
    },
    "fr": {
        "months": _MONTHS["fr"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": " ",
        "methods": "methods-fr.html",
        "title": "Tables à langer {name_in} — PapaMap",
        "h1": "Tables à langer {name_in}",
        "meta_desc": ("{tables} lieux avec table à langer {name_in}, "
                      "d'après OpenStreetMap. Pour {unknown} d'entre eux, on "
                      "ignore dans quelle pièce se trouve la table — et "
                      "c'est exactement ce qui se répare."),
        "stand": "Au {date} · Données OpenStreetMap",
        "back_map": "Vers la carte",
        "back_hub": "Toute la France",
        "crumb_hub": "Tables à langer en France",
        "empty": ("OpenStreetMap ne connaît actuellement aucun lieu avec "
                  "table à langer {name_in}. Cela veut presque sûrement "
                  "dire : personne ne l'a encore notée."),
        "intro": ("OpenStreetMap connaît <strong>{tables}</strong> lieux "
                  "avec table à langer {name_in}. Pour "
                  "<strong>{accessible}</strong> d'entre eux, quelqu'un a "
                  "noté qu'un papa peut vraiment l'atteindre — toilettes "
                  "hommes, toilettes mixtes ou espace bébé dédié. "
                  "<strong>{female_only}</strong> ne sont que dans les "
                  "toilettes femmes. Et pour <strong>{unknown}</strong> sur "
                  "{tables} ({pct}&nbsp;%), personne n'a noté dans quelle "
                  "pièce se trouve la table. Ce sont les marqueurs gris sur "
                  "la carte, et c'est là la vraie tâche : la question se "
                  "règle sur place en moins d'une minute."),
        "map_cta": "Ouvrir {name_for} sur la carte",
        "numbers_h2": "Les chiffres pour {name_for}",
        "th_things": "Tables à langer", "th_places": "Lieux",
        "total": "Total",
        "statuses": {"accessible": "Accessible",
                     "female_only": "Femmes uniquement",
                     "unknown": "Pièce inconnue"},
        "toilets_note": ("{In}, OpenStreetMap recense aussi {toilets} "
                         "toilettes publiques — l'immense majorité sans la "
                         "moindre information sur une table à langer. "
                         "Impossible d'en tirer un classement honnête de "
                         'l\'offre ; les <a href="{up}{methods}">méthodes</a> '
                         "expliquent pourquoi."),
        "named_h2": "Lieux nommés",
        "named_intro": ("{named_places} des {tables} lieux portent un nom "
                        "dans OpenStreetMap, soit {named} noms différents. "
                        "Les {unnamed} restants sont presque tous des "
                        "toilettes publiques sans nom — ils sont sur la "
                        "carte, mais impossibles à lister utilement ici. "
                        "Les enseignes d'une chaîne sont regroupées sur une "
                        "ligne."),
        "th_place": "Lieu", "th_kind": "Type", "th_count": "Lieux",
        "help_h2": "Comment aider",
        "help": ("Un marqueur gris veut dire : la table à langer existe, "
                 "mais personne n'a noté dans quelle pièce elle se trouve. "
                 "C'est exactement la réponse qui manque aux papas. "
                 "N'importe qui, avec un compte OpenStreetMap gratuit, peut "
                 "la donner, sur place, en moins d'une minute — le lien du "
                 "marqueur ouvre MapComplete directement sur le bon objet. "
                 "La réponse atterrit dans OpenStreetMap, appartient à tout "
                 "le monde et apparaît ici après la prochaine mise à jour "
                 'nocturne. <a href="{up}{methods}#contribute">Pas à '
                 "pas</a>."),
        "siblings_h2": "Autres régions",
        "countries_h2": "PapaMap dans les autres pays",
        "places_unit": "lieux",
        "footer": """\
<h2>Données &amp; licence</h2>
<p class="muted">Toutes les données &copy; <a href="https://www.openstreetmap.org/copyright">les
contributeurs OpenStreetMap</a>, sous <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>.
Cette page est régénérée chaque nuit à partir d'une requête Overpass et n'enregistre rien sur toi.
Comment on compte et colore&nbsp;: <a href="{up}methods-fr.html">Méthodes</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap est gratuit et sans pub.
<a href="https://ko-fi.com/jakubwaller">&#9749; Offrir un café</a>.</p>
""",
        # france.html is the hub the 13 région pages hang off, the way
        # /wickeltische/ is for the 16 Länder.
        "hub_title": "Tables à langer en France, par région — PapaMap",
        "hub_desc": ("Tables à langer en France, région par région : "
                     "{total} lieux d'après OpenStreetMap ; pour {unknown} "
                     "d'entre eux, la pièce n'est pas renseignée."),
        "hub_h1": "Tables à langer en France, par région",
        "hub_intro": ("OpenStreetMap connaît en France "
                      "<strong>{total}</strong> lieux avec table à langer. "
                      "Pour <strong>{unknown}</strong> d'entre eux, personne "
                      "n'a noté dans quelle pièce se trouve la table — donc "
                      "si un papa peut vraiment l'atteindre. Région par "
                      "région :"),
        "hub_col": "Région",
        "hub_toilets": "Toilettes",
        "hub_note": ("Par ordre alphabétique, pas par nombre. Un classement "
                     "serait trompeur : ces chiffres mesurent surtout à quel "
                     "point une région a été cartographiée, pas son "
                     "équipement réel. La colonne <em>Toilettes</em> compte "
                     "toutes les toilettes publiques recensées, avec ou sans "
                     "table à langer. Ce qui se compare honnêtement, c'est "
                     'le mouvement — il est sur le <a href="leaderboard.html">'
                     "classement (en anglais)</a>."),
    },
    "cs": {
        "months": _MONTHS["cs"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": " ",
        "methods": "methods-cs.html",
        "title": "Přebalovací pulty {name_in} — PapaMap",
        "h1": "Přebalovací pulty {name_in}",
        "meta_desc": ("{tables} míst s přebalovacím pultem {name_in}, z "
                      "OpenStreetMap. U {unknown} z nich není zaznamenáno, "
                      "ve které místnosti pult je — a přesně to jde "
                      "spravit."),
        "stand": "Stav: {date} · Data z OpenStreetMap",
        "back_map": "Na mapu",
        "empty": ("OpenStreetMap {name_in} momentálně nezná jediné místo s "
                  "přebalovacím pultem. To téměř jistě znamená: ještě ho "
                  "nikdo nezaznamenal."),
        "intro": ("OpenStreetMap zná {name_in} <strong>{tables}</strong> "
                  "míst s přebalovacím pultem. U "
                  "<strong>{accessible}</strong> z nich je zaznamenáno, že "
                  "se k pultu dostane i táta — pánské WC, unisex WC nebo "
                  "samostatná přebalovací místnost. "
                  "<strong>{female_only}</strong> visí jen na dámském WC. A "
                  "u <strong>{unknown}</strong> z {tables} ({pct}&nbsp;%) "
                  "prostě nikdo nezaznamenal, ve které místnosti pult je. "
                  "To jsou šedé špendlíky na mapě — a právě ty jsou ten "
                  "úkol: otázku zodpovíš na místě za necelou minutu."),
        "map_cta": "Otevřít {name_for} na mapě",
        "numbers_h2": "{name_for} v číslech",
        "th_things": "Přebalovací pulty", "th_places": "Místa",
        "total": "Celkem",
        "statuses": {"accessible": "Dostupné",
                     "female_only": "Jen dámské WC",
                     "unknown": "Neznámá místnost"},
        "toilets_note": ("{In} je kromě toho zaznamenáno {toilets} "
                         "veřejných WC — naprostá většina bez jakéhokoli "
                         "údaje o přebalovacím pultu. Srovnání vybavenosti "
                         "z toho postavit nejde; proč, je popsané v "
                         '<a href="{up}{methods}">metodách</a>.'),
        "named_h2": "Místa se jménem",
        "named_intro": ("{named_places} z {tables} míst má v OpenStreetMap "
                        "jméno, dohromady {named} různých. Zbylých "
                        "{unnamed} jsou téměř vesměs veřejná WC beze jména "
                        "— na mapě jsou, ale tady je nemá smysl vypisovat. "
                        "Pobočky řetězce jsou sloučené do jednoho řádku."),
        "th_place": "Místo", "th_kind": "Typ", "th_count": "Místa",
        "help_h2": "Jak pomůžeš",
        "help": ("Šedý špendlík znamená: přebalovací pult existuje, ale "
                 "nikdo nezaznamenal, ve které místnosti je. Přesně tahle "
                 "odpověď tátům chybí. Dát ji může kdokoli s bezplatným "
                 "účtem OpenStreetMap, na místě, za necelou minutu — odkaz "
                 "u špendlíku otevře MapComplete rovnou na správném "
                 "objektu. Odpověď skončí v OpenStreetMap, patří všem a po "
                 "příští noční aktualizaci bude vidět tady. "
                 '<a href="{up}{methods}#contribute">Krok za krokem</a>.'),
        "countries_h2": "PapaMap v dalších zemích",
        "places_unit": "míst",
        "footer": """\
<h2>Data &amp; licence</h2>
<p class="muted">Všechna data &copy; <a href="https://www.openstreetmap.org/copyright">přispěvatelé
OpenStreetMap</a>, pod licencí <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>.
Tahle stránka se každou noc znovu generuje z dotazu na Overpass a nic si o tobě neukládá.
Jak se počítá a barví: <a href="{up}methods-cs.html">Metody</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap je zdarma a bez reklam.
<a href="https://ko-fi.com/jakubwaller">&#9749; Kup mi kafe</a>.</p>
""",
    },
    "pl": {
        "months": _MONTHS["pl"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": " ",
        "methods": "methods-pl.html",
        "title": "Przewijaki {name_in} — PapaMap",
        "h1": "Przewijaki {name_in}",
        "meta_desc": ("{tables} miejsc z przewijakiem {name_in}, z "
                      "OpenStreetMap. Przy {unknown} z nich nie zapisano, w "
                      "którym pomieszczeniu jest przewijak — i właśnie to "
                      "da się naprawić."),
        "stand": "Stan na {date} · Dane z OpenStreetMap",
        "back_map": "Do mapy",
        "empty": ("OpenStreetMap nie zna {name_in} obecnie ani jednego "
                  "miejsca z przewijakiem. To niemal na pewno znaczy: nikt "
                  "go jeszcze nie zapisał."),
        "intro": ("OpenStreetMap zna {name_in} <strong>{tables}</strong> "
                  "miejsc z przewijakiem. Przy "
                  "<strong>{accessible}</strong> z nich zapisano, że tata "
                  "też do niego dotrze — męska toaleta, toaleta "
                  "koedukacyjna albo osobny pokój do przewijania. "
                  "<strong>{female_only}</strong> wiszą tylko w damskiej "
                  "toalecie. A przy <strong>{unknown}</strong> z {tables} "
                  "({pct}&nbsp;%) nikt po prostu nie zapisał, w którym "
                  "pomieszczeniu jest przewijak. To są szare pinezki na "
                  "mapie — i to one są właściwym zadaniem: na miejscu "
                  "odpowiesz na to pytanie w niecałą minutę."),
        # Polish declines the name after "otwórz" (Polska → Polskę), so the
        # button does without it.
        "map_cta": "Pokaż na mapie",
        "numbers_h2": "{name_for} w liczbach",
        "th_things": "Przewijaki", "th_places": "Miejsca", "total": "Razem",
        "statuses": {"accessible": "Dostępny",
                     "female_only": "Tylko damskie WC",
                     "unknown": "Nie wiadomo gdzie"},
        "toilets_note": ("{In} zapisano poza tym {toilets} publicznych "
                         "toalet — zdecydowaną większość bez żadnej "
                         "informacji o przewijaku. Rankingu dostępności z "
                         "tego się nie zbuduje; dlaczego, wyjaśniają "
                         '<a href="{up}{methods}">metody</a>.'),
        "named_h2": "Miejsca z nazwą",
        "named_intro": ("{named_places} z {tables} miejsc ma w "
                        "OpenStreetMap nazwę, łącznie {named} różnych. "
                        "Pozostałe {unnamed} to niemal wyłącznie publiczne "
                        "toalety bez nazwy — są na mapie, ale nie da się "
                        "ich tu sensownie wypisać. Filie sieci są zebrane "
                        "w jeden wiersz."),
        "th_place": "Miejsce", "th_kind": "Rodzaj", "th_count": "Miejsca",
        "help_h2": "Jak możesz pomóc",
        "help": ("Szara pinezka znaczy: przewijak istnieje, ale nikt nie "
                 "zapisał, w którym pomieszczeniu jest. Właśnie tej "
                 "odpowiedzi brakuje tatom. Może jej udzielić każdy z "
                 "bezpłatnym kontem OpenStreetMap, na miejscu, w niecałą "
                 "minutę — link przy pinezce otwiera MapComplete od razu na "
                 "właściwym obiekcie. Odpowiedź trafia do OpenStreetMap, "
                 "należy do wszystkich i po najbliższej nocnej aktualizacji "
                 "będzie widoczna tutaj. "
                 '<a href="{up}{methods}#contribute">Krok po kroku</a>.'),
        "countries_h2": "PapaMap w innych krajach",
        "places_unit": "miejsc",
        "footer": """\
<h2>Dane i licencja</h2>
<p class="muted">Wszystkie dane &copy; <a href="https://www.openstreetmap.org/copyright">autorzy
OpenStreetMap</a>, na licencji <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>.
Ta strona jest co noc generowana od nowa z zapytania Overpass i nic o tobie nie zapisuje.
Jak liczymy i kolorujemy: <a href="{up}methods-pl.html">Metody</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap jest darmowa i bez reklam.
<a href="https://ko-fi.com/jakubwaller">&#9749; Postaw kawę</a>.</p>
""",
    },
    "sv": {
        "months": _MONTHS["sv"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": " ",
        "methods": "methods-sv.html",
        "title": "Skötbord {name_in} — PapaMap",
        "h1": "Skötbord {name_in}",
        "meta_desc": ("{tables} platser med skötbord {name_in}, från "
                      "OpenStreetMap. För {unknown} av dem är det inte "
                      "registrerat vilket rum bordet står i — och precis "
                      "det går att laga."),
        "stand": "Per {date} · Data från OpenStreetMap",
        "back_map": "Till kartan",
        "empty": ("OpenStreetMap känner just nu inte till en enda plats med "
                  "skötbord {name_in}. Det betyder nästan säkert: ingen har "
                  "registrerat det ännu."),
        "intro": ("OpenStreetMap känner till <strong>{tables}</strong> "
                  "platser med skötbord {name_in}. För "
                  "<strong>{accessible}</strong> av dem är det registrerat "
                  "att en pappa också kommer åt det — herrtoalett, "
                  "unisextoalett eller eget skötrum. "
                  "<strong>{female_only}</strong> hänger bara på "
                  "damtoaletten. Och för <strong>{unknown}</strong> av "
                  "{tables} ({pct}&nbsp;%) har helt enkelt ingen "
                  "registrerat vilket rum bordet finns i. Det är de grå "
                  "nålarna på kartan, och de är den egentliga uppgiften: "
                  "frågan besvaras på plats på under en minut."),
        "map_cta": "Öppna {name_for} på kartan",
        "numbers_h2": "Siffrorna för {name_for}",
        "th_things": "Skötbord", "th_places": "Platser", "total": "Totalt",
        "statuses": {"accessible": "Nåbart",
                     "female_only": "Bara damtoalett",
                     "unknown": "Okänt rum"},
        "toilets_note": ("{In} finns dessutom {toilets} offentliga "
                         "toaletter registrerade — de allra flesta utan "
                         "någon uppgift om skötbord. Någon jämförelse av "
                         "utbudet går inte att bygga på det; varför står i "
                         '<a href="{up}{methods}">metoden</a>.'),
        "named_h2": "Platser med namn",
        "named_intro": ("{named_places} av de {tables} platserna bär ett "
                        "namn i OpenStreetMap, sammanlagt {named} olika. De "
                        "återstående {unnamed} är nästan alla offentliga "
                        "toaletter utan namn — de finns på kartan men går "
                        "inte att lista meningsfullt här. Filialer i en "
                        "kedja är hopslagna till en rad."),
        "th_place": "Plats", "th_kind": "Typ", "th_count": "Platser",
        "help_h2": "Så hjälper du till",
        "help": ("En grå nål betyder: skötbordet finns, men ingen har "
                 "registrerat vilket rum det står i. Precis det svaret "
                 "saknar papporna. Vem som helst med ett gratis "
                 "OpenStreetMap-konto kan ge det, på plats, på under en "
                 "minut — länken på nålen öppnar MapComplete direkt vid "
                 "rätt objekt. Svaret hamnar i OpenStreetMap, tillhör alla "
                 "och syns här efter nästa nattliga uppdatering. "
                 '<a href="{up}{methods}#contribute">Steg för steg</a>.'),
        "countries_h2": "PapaMap i andra länder",
        "places_unit": "platser",
        "footer": """\
<h2>Data &amp; licens</h2>
<p class="muted">Alla data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMaps
bidragsgivare</a>, under <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Den här
sidan byggs om varje natt ur en Overpass-fråga och sparar inget om dig.
Hur det räknas och färgläggs: <a href="{up}methods-sv.html">Metod</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap är gratis och reklamfritt.
<a href="https://ko-fi.com/jakubwaller">&#9749; Bjud på en kaffe</a>.</p>
""",
    },
}
