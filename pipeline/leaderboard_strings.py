from __future__ import annotations

# The leaderboard's translations — one entry per UI language, same set as
# web/i18n.js's LANGS. Split out of leaderboard.py because 31 entries of
# ~40 keys each would bury the rendering logic under a kilometre of prose.
#
# Every entry defines exactly the same keys as "en" (tests/test_leaderboard.py
# enforces parity, the way web/i18n.test.js does for the frontend strings).
# Beyond the visible copy, each entry carries its language's formatting rules:
#   lang_name  — endonym for the language switcher, never translated
#   file       — the page this language is written to (de/en keep their
#                pre-2026-08-22 names; renaming them would break inbound links)
#   months     — the twelve month names as they appear after a day number
#   date_fmt   — how {d}/{m}/{y} assemble into a date
#   decimal    — the decimal separator for shares and deltas
#   thousands  — the grouping separator for whole counts
#   back_map   — the "back to the map" link text
# The Bundesländer link and the language switcher itself are generated in
# leaderboard.py, not translated: "Bundesländer" stays German in every
# language (it points at German-only pages, same as index.html), and endonyms
# are per definition not translatable.

from .pages import FOOTER, GERMAN_MONTHS

MONTHS_EN = ("January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December")

DE_FILE = "rangliste.html"
EN_FILE = "leaderboard.html"

L = {
    "de": {
        "lang_name": "Deutsch",
        "file": DE_FILE,
        "months": GERMAN_MONTHS,
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Zur Karte",
        "title": "Wickeltisch-Rangliste — PapaMap",
        "desc": ("Wo wurde zuletzt beantwortet, in welchem Raum der Wickeltisch "
                 "hängt? Veränderung in Prozentpunkten, jede Nacht neu aus "
                 "OpenStreetMap."),
        "h1": "Die Rangliste",
        "stand": "Stand {date} · Daten aus OpenStreetMap",
        "stand_base": ("Stand {date} · Veränderung gegenüber dem {base} · "
                       "Daten aus OpenStreetMap"),
        "intro1": (
            "<p>Wer die meisten Wickeltische hat, steht hier absichtlich "
            "nicht. Absolute Zahlen messen vor allem, wie gründlich irgendwo "
            "gemappt wurde, nicht wie gut eine Stadt versorgt ist — eine "
            "Rangliste daraus wäre irreführend (warum, steht in den "
            '<a href="{up}methods.html">Methoden</a>). Ehrlich vergleichen '
            "lässt sich die Veränderung: wo zuletzt beantwortet wurde, in "
            "welchem Raum der Wickeltisch hängt. Genau das zählt diese Seite "
            "— den Anteil der Orte mit beantworteter Raumfrage, und wer ihn "
            "zuletzt am stärksten gesteigert hat.</p>\n"),
        "intro2": (
            "<p>Jede Antwort zählt, auch „nur im Damen-WC“ — die Karte lebt "
            "von ehrlichen Antworten, nicht von grünen Pins. Beantworten "
            "kannst du die Frage vor Ort in unter einer Minute: grauen Pin "
            'auf der <a href="{up}">Karte</a> antippen und dem '
            'MapComplete-Link folgen. <a href="{up}methods.html#contribute">'
            "Schritt für Schritt</a>.</p>\n"),
        "fresh": ("<p>Die Aufzeichnung hat am {date} begonnen. Sobald es "
                  "einen Vergleichszeitpunkt gibt, steht hier, wer sich "
                  "bewegt hat.</p>\n"),
        "quiet": ("<p>Seit dem {base} hat sich nirgends etwas bewegt. Die "
                  "grauen Pins warten.</p>\n"),
        "cities_h2": "Städte",
        "cities_note": ("<p>{n} große Städte, sortiert nach der Veränderung "
                        "des beantworteten Anteils. Berlin, Hamburg und "
                        "Bremen stehen auch unten bei den Ländern — hier "
                        "zählt die Stadt.</p>\n"),
        "regions_h2": "Bundesländer und Dänemark",
        "regions_note": ("<p>Dieselbe Rechnung für die {n} Bundesländer und "
                         "Dänemark als Ganzes.</p>\n"),
        "regions_h2_regions": "Bundesländer, Régions und ganze Länder",
        # Three groups now, and any of them can be absent (de,fr has no whole
        # country at all), so the sentence is assembled from clauses rather
        # than written out: a fixed template produces either "1 Länder", which
        # is not German, or a dangling "und". Same problem regions_note_one
        # below solves for the two-group case.
        "regions_note_regions": "<p>Dieselbe Rechnung für {list}.</p>\n",
        "cl_lands": "die {n} Bundesländer",
        "cl_regions": "die {r} französischen Régions",
        "cl_country_one": "{names} als Ganzes",
        "cl_country_many": "{c} Länder als Ganzes ({names})",
        "and_sep": " und ",
        "regions_h2_many": "Bundesländer und ganze Länder",
        "regions_note_many": ("<p>Dieselbe Rechnung für die {n} Bundesländer "
                              "und für {c} Länder als Ganzes: {names}.</p>\n"),
        "regions_h2_one": "Bundesländer und ein ganzes Land",
        "regions_note_one": ("<p>Dieselbe Rechnung für die {n} Bundesländer "
                             "und für {names} als Ganzes.</p>\n"),
        "regions_h2_lands": "Bundesländer",
        "regions_note_lands": ("<p>Dieselbe Rechnung für die {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Stadt", "col_name_region": "Region",
        "col_delta": "Δ Punkte", "col_share": "beantwortet",
        "col_total": "Orte", "col_acc": "+ erreichbar", "col_new": "+ Orte",
        "sort_hint": ("Auf eine Spaltenüberschrift tippen, um danach zu "
                      "sortieren — nochmal tippen dreht die Richtung um."),
        "footer": FOOTER,
    },
    "en": {
        "lang_name": "English",
        "file": EN_FILE,
        "months": MONTHS_EN,
        "date_fmt": "{d} {m} {y}",
        "decimal": ".",
        "thousands": ",",
        "back_map": "&larr; To the map",
        "title": "PapaMap Leaderboard",
        "desc": ("Where did the room question — which room is the changing "
                 "table in? — get answered lately? Change in percentage "
                 "points, rebuilt nightly from OpenStreetMap."),
        "h1": "The leaderboard",
        "stand": "As of {date} · Data from OpenStreetMap",
        "stand_base": ("As of {date} · Change since {base} · "
                       "Data from OpenStreetMap"),
        "intro1": (
            "<p>Which city has the most changing tables is deliberately not "
            "on this page. Absolute counts mostly measure how thoroughly a "
            "place has been mapped, not how well it is equipped — ranking "
            "them would mislead (the "
            '<a href="{up}methods-en.html">methods page</a> explains why). '
            "What can honestly be compared is change: where the room "
            "question — which room is the changing table in? — got answered "
            "lately. That is what this page counts — the share of places "
            "with an answered room question, and who has raised it most.</p>\n"),
        "intro2": (
            "<p>Every answer counts, including “women's toilet only” — the "
            "map runs on honest answers, not on green pins. Answering takes "
            'under a minute on site: tap a grey pin on the <a href="{up}">'
            "map</a> and follow its MapComplete link. "
            '<a href="{up}methods-en.html#contribute">Step by step</a>.</p>\n'),
        "fresh": ("<p>Recording started on {date}. As soon as there is a "
                  "point of comparison, this page will show who moved.</p>\n"),
        "quiet": ("<p>Nothing has moved anywhere since {base}. The grey "
                  "pins are waiting.</p>\n"),
        "cities_h2": "Cities",
        "cities_note": ("<p>{n} big cities, sorted by the change of their "
                        "answered share. Berlin, Hamburg and Bremen also "
                        "appear under the states below — here the city "
                        "counts.</p>\n"),
        "regions_h2": "German states and Denmark",
        "regions_note": ("<p>The same arithmetic for the {n} Bundesländer "
                         "and Denmark as a whole.</p>\n"),
        "regions_h2_regions": ("German states, French régions and whole "
                               "countries"),
        "regions_note_regions": "<p>The same arithmetic for {list}.</p>\n",
        "cl_lands": "the {n} Bundesländer",
        "cl_regions": "the {r} French régions",
        "cl_country_one": "{names} as a whole",
        "cl_country_many": "{c} countries as a whole ({names})",
        "and_sep": " and ",
        "regions_h2_many": "German states and whole countries",
        "regions_note_many": ("<p>The same arithmetic for the {n} Bundesländer "
                              "and for {c} countries as a whole: "
                              "{names}.</p>\n"),
        "regions_h2_one": "German states and one whole country",
        "regions_note_one": ("<p>The same arithmetic for the {n} Bundesländer "
                             "and for {names} as a whole.</p>\n"),
        "regions_h2_lands": "German states",
        "regions_note_lands": ("<p>The same arithmetic for the {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "City", "col_name_region": "Region",
        "col_delta": "Δ points", "col_share": "answered",
        "col_total": "places", "col_acc": "+ reachable", "col_new": "+ places",
        "sort_hint": ("Tap a column header to sort by it — tap again to "
                      "reverse."),
        "footer": ("""\
<h2>Data &amp; licence</h2>
<p class="muted">All data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, under the <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. This
page is regenerated every night from an Overpass query and stores nothing about you.
How things are counted and coloured: <a href="{up}methods-en.html">Methods</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap is free and ad-free.
<a href="https://ko-fi.com/jakubwaller">&#9749; Buy me a coffee</a>.</p>
"""),
    },
    "da": {
        "lang_name": "Dansk",
        "file": "leaderboard-da.html",
        "months": ("januar", "februar", "marts", "april", "maj", "juni", "juli",
                   "august", "september", "oktober", "november", "december"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Tilbage til kortet",
        "title": "PapaMap Rangliste",
        "desc": ("Hvor er der senest blevet svaret på, hvilket rum "
                 "puslebordet står i? Ændring i procentpoint, bygget på ny "
                 "hver nat fra OpenStreetMap."),
        "h1": "Ranglisten",
        "stand": "Pr. {date} · Data fra OpenStreetMap",
        "stand_base": ("Pr. {date} · Ændring siden {base} · "
                       "Data fra OpenStreetMap"),
        "intro1": (
            "<p>Hvilken by der har flest pusleborde, er bevidst ikke med "
            "her. Absolutte tal måler mest, hvor grundigt et sted er blevet "
            "mappet — ikke hvor godt det er udstyret — så en rangliste ud "
            "fra dem ville være misvisende (hvorfor, forklarer "
            '<a href="{up}methods-da.html">metodesiden</a>). Det, der '
            "ærligt kan sammenlignes, er forandringen: hvor spørgsmålet om "
            "rummet — hvilket rum puslebordet står i — senest er blevet "
            "besvaret. Det er, hvad denne side tæller — andelen af steder "
            "med et besvaret rumspørgsmål, og hvem der har løftet den mest "
            "på det seneste.</p>\n"),
        "intro2": (
            "<p>Hvert svar tæller, også »kun på dametoilettet« — kortet "
            "lever af ærlige svar, ikke af grønne nåle. At svare tager "
            'under et minut på stedet: tryk på en grå nål på <a href="{up}">'
            "kortet</a> og følg MapComplete-linket. "
            '<a href="{up}methods-da.html#contribute">Trin for trin</a>.</p>\n'),
        "fresh": ("<p>Registreringen begyndte den {date}. Så snart der er "
                  "et sammenligningstidspunkt, viser denne side, hvem der "
                  "har rykket sig.</p>\n"),
        "quiet": ("<p>Intet har rykket sig nogen steder siden {base}. De "
                  "grå nåle venter.</p>\n"),
        "cities_h2": "Byer",
        "cities_note": ("<p>{n} store byer, sorteret efter ændringen i den "
                        "besvarede andel. Berlin, Hamborg og Bremen "
                        "optræder også nedenfor under delstaterne — her "
                        "tæller byen.</p>\n"),
        "regions_h2": "Tyske delstater og Danmark",
        "regions_note": ("<p>Samme regnestykke for de {n} Bundesländer og "
                         "Danmark som helhed.</p>\n"),
        "regions_h2_regions": "Tyske delstater, franske régions og hele lande",
        "regions_note_regions": "<p>Samme regnestykke for {list}.</p>\n",
        "cl_lands": "de {n} Bundesländer",
        "cl_regions": "de {r} franske régions",
        "cl_country_one": "{names} som helhed",
        "cl_country_many": "{c} lande som helhed ({names})",
        "and_sep": " og ",
        "regions_h2_many": "Tyske delstater og hele lande",
        "regions_note_many": ("<p>Samme regnestykke for de {n} Bundesländer "
                              "og for {c} lande som helhed: {names}.</p>\n"),
        "regions_h2_one": "Tyske delstater og ét helt land",
        "regions_note_one": ("<p>Samme regnestykke for de {n} Bundesländer "
                             "og for {names} som helhed.</p>\n"),
        "regions_h2_lands": "Tyske delstater",
        "regions_note_lands": ("<p>Samme regnestykke for de {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "By", "col_name_region": "Region",
        "col_delta": "Δ point", "col_share": "besvaret",
        "col_total": "steder", "col_acc": "+ tilgængelig", "col_new": "+ steder",
        "sort_hint": ("Tryk på en kolonneoverskrift for at sortere efter "
                      "den — tryk igen for at vende retningen."),
        "footer": ("""\
<h2>Data &amp; licens</h2>
<p class="muted">Alle data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, under <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Denne
side genskabes hver nat ud fra en Overpass-forespørgsel og gemmer ingenting om dig.
Sådan tælles og farvelægges der: <a href="{up}methods-da.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap er gratis og uden reklamer.
<a href="https://ko-fi.com/jakubwaller">&#9749; Giv mig en kaffe</a>.</p>
"""),
    },
    "nl": {
        "lang_name": "Nederlands",
        "file": "leaderboard-nl.html",
        "months": ("januari", "februari", "maart", "april", "mei", "juni",
                   "juli", "augustus", "september", "oktober", "november",
                   "december"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Terug naar de kaart",
        "title": "PapaMap — Ranglijst",
        "desc": ("Waar is de ruimtevraag — in welke ruimte hangt de "
                 "verschoontafel? — de laatste tijd beantwoord? "
                 "Verandering in procentpunten, elke nacht opnieuw uit "
                 "OpenStreetMap opgebouwd."),
        "h1": "De ranglijst",
        "stand": "Stand {date} · Data van OpenStreetMap",
        "stand_base": ("Stand {date} · Verandering sinds {base} · "
                       "Data van OpenStreetMap"),
        "intro1": (
            "<p>Welke stad de meeste verschoontafels heeft, staat hier "
            "bewust niet. Absolute aantallen meten vooral hoe grondig een "
            "plek in kaart is gebracht, niet hoe goed ze is voorzien — "
            "een ranglijst daarvan zou misleidend zijn (waarom, staat in de "
            "<a href=\"{up}methods-nl.html\">Methode</a>). Eerlijk te "
            "vergelijken is de verandering: waar de ruimtevraag — in "
            "welke ruimte hangt de verschoontafel? — de laatste tijd is "
            "beantwoord. Dat telt deze pagina — het aandeel plekken met "
            "een beantwoorde ruimtevraag, en wie dat aandeel het laatst het "
            "sterkst heeft verhoogd.</p>\n"),
        "intro2": (
            "<p>Elk antwoord telt, ook “alleen damestoilet” — "
            "de kaart leeft van eerlijke antwoorden, niet van groene pins. "
            "Beantwoorden kan ter plekke in minder dan een minuut: tik op "
            "een grijze pin op de <a href=\"{up}\">kaart</a> en volg de "
            "MapComplete-link. <a href=\"{up}methods-nl.html#contribute\">"
            "Stap voor stap</a>.</p>\n"),
        "fresh": ("<p>De registratie is begonnen op {date}. Zodra er een "
                  "vergelijkingsmoment is, laat deze pagina zien wie in "
                  "beweging is gekomen.</p>\n"),
        "quiet": ("<p>Sinds {base} is nergens iets veranderd. De grijze "
                  "pins wachten.</p>\n"),
        "cities_h2": "Steden",
        "cities_note": ("<p>{n} grote steden, gesorteerd op de verandering "
                        "van het beantwoorde aandeel. Berlijn, Hamburg en "
                        "Bremen staan hieronder ook bij de deelstaten — "
                        "hier telt de stad.</p>\n"),
        "regions_h2": "Duitse deelstaten en Denemarken",
        "regions_note": ("<p>Dezelfde rekensom voor de {n} Bundesländer "
                         "en Denemarken als geheel.</p>\n"),
        "regions_h2_regions": "Duitse deelstaten, Franse régions en hele landen",
        "regions_note_regions": "<p>Dezelfde rekensom voor {list}.</p>\n",
        "cl_lands": "de {n} Bundesländer",
        "cl_regions": "de {r} Franse régions",
        "cl_country_one": "{names} als geheel",
        "cl_country_many": "{c} landen als geheel ({names})",
        "and_sep": " en ",
        "regions_h2_many": "Duitse deelstaten en hele landen",
        "regions_note_many": ("<p>Dezelfde rekensom voor de {n} "
                              "Bundesländer en voor {c} landen als "
                              "geheel: {names}.</p>\n"),
        "regions_h2_one": "Duitse deelstaten en één heel land",
        "regions_note_one": ("<p>Dezelfde rekensom voor de {n} "
                             "Bundesländer en voor {names} als "
                             "geheel.</p>\n"),
        "regions_h2_lands": "Duitse deelstaten",
        "regions_note_lands": ("<p>Dezelfde rekensom voor de {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Stad", "col_name_region": "Regio",
        "col_delta": "Δ punten", "col_share": "beantwoord",
        "col_total": "plekken", "col_acc": "+ bereikbaar", "col_new": "+ plekken",
        "sort_hint": ("Tik op een kolomkop om erop te sorteren — nog een "
                      "keer tikken keert de richting om."),
        "footer": ("""\
<h2>Gegevens &amp; licentie</h2>
<p class="muted">Alle gegevens &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, onder de <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Deze
pagina wordt elke nacht opnieuw opgebouwd uit een Overpass-query en slaat niets over je op.
Hoe geteld en gekleurd wordt: <a href="{up}methods-nl.html">Methode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap is gratis en reclamevrij.
<a href="https://ko-fi.com/jakubwaller">&#9749; Trakteer me op een koffie</a>.</p>
"""),
    },
    "fr": {
        "lang_name": "Français",
        "file": "leaderboard-fr.html",
        "months": ("janvier", "février", "mars", "avril", "mai", "juin", "juillet",
                   "août", "septembre", "octobre", "novembre", "décembre"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Retour à la carte",
        "title": "PapaMap — Classement des tables à langer",
        "desc": ("Où la question de la pièce — dans quelle pièce se trouve la "
                 "table à langer ? — a-t-elle reçu une réponse récemment ? "
                 "Évolution en points de pourcentage, recalculée chaque nuit "
                 "à partir d'OpenStreetMap."),
        "h1": "Le classement",
        "stand": "Situation au {date} · Données : OpenStreetMap",
        "stand_base": ("Situation au {date} · Évolution depuis le {base} · "
                       "Données : OpenStreetMap"),
        "intro1": (
            "<p>Quelle ville a le plus de tables à langer n'est "
            "volontairement pas le sujet de cette page. Les chiffres "
            "absolus mesurent surtout à quel point un lieu a été "
            "cartographié, pas à quel point il est équipé — en tirer un "
            "classement serait trompeur (pourquoi, c'est expliqué dans les "
            '<a href="{up}methods-fr.html">Méthodes</a>). Ce qui se compare '
            "honnêtement, c'est l'évolution : où la question de la pièce — "
            "dans quelle pièce se trouve la table à langer ? — a récemment "
            "reçu une réponse. C'est exactement ce que compte cette page — "
            "la part des lieux dont la question de la pièce a une réponse, "
            "et qui l'a le plus fait progresser dernièrement.</p>\n"),
        "intro2": (
            "<p>Chaque réponse compte, même « uniquement WC femmes » — la "
            "carte vit de réponses honnêtes, pas de marqueurs verts. Tu "
            "peux répondre à la question sur place en moins d'une minute : "
            'touche un marqueur gris sur la <a href="{up}">carte</a> et '
            'suis son lien MapComplete. <a href="{up}methods-fr.html'
            '#contribute">Éditer, pas à pas</a>.</p>\n'),
        "fresh": ("<p>Le suivi a commencé le {date}. Dès qu'il y aura un "
                  "point de comparaison, cette page indiquera qui a "
                  "bougé.</p>\n"),
        "quiet": ("<p>Rien n'a bougé nulle part depuis le {base}. Les "
                  "marqueurs gris attendent.</p>\n"),
        "cities_h2": "Villes",
        "cities_note": ("<p>{n} grandes villes, triées par l'évolution de "
                        "leur taux de réponse. Berlin, Hambourg et Brême "
                        "apparaissent aussi plus bas parmi les Bundesländer "
                        "— ici, c'est la ville qui compte.</p>\n"),
        "regions_h2": "Bundesländer et Danemark",
        "regions_note": ("<p>Le même calcul pour les {n} Bundesländer et le "
                         "Danemark dans son ensemble.</p>\n"),
        "regions_h2_regions": "Bundesländer, régions françaises et pays entiers",
        "regions_note_regions": "<p>Le même calcul pour {list}.</p>\n",
        "cl_lands": "les {n} Bundesländer",
        "cl_regions": "les {r} régions françaises",
        "cl_country_one": "{names} dans son ensemble",
        "cl_country_many": "{c} pays dans leur ensemble ({names})",
        "and_sep": " et ",
        "regions_h2_many": "Bundesländer et pays entiers",
        "regions_note_many": ("<p>Le même calcul pour les {n} Bundesländer "
                              "et pour {c} pays dans leur ensemble : "
                              "{names}.</p>\n"),
        "regions_h2_one": "Bundesländer et un pays entier",
        "regions_note_one": ("<p>Le même calcul pour les {n} Bundesländer "
                             "et pour {names} dans son ensemble.</p>\n"),
        "regions_h2_lands": "Bundesländer",
        "regions_note_lands": ("<p>Le même calcul pour les {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Ville", "col_name_region": "Région",
        "col_delta": "Δ points", "col_share": "répondu",
        "col_total": "lieux", "col_acc": "+ accessibles", "col_new": "+ lieux",
        "sort_hint": ("Touche l'en-tête d'une colonne pour trier — touche à "
                      "nouveau pour inverser l'ordre."),
        "footer": ("""\
<h2>Données &amp; licence</h2>
<p class="muted">Toutes les données &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, sous licence <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Cette
page est régénérée chaque nuit à partir d'une requête Overpass et ne stocke rien sur toi.
Comment le comptage et les couleurs fonctionnent : <a href="{up}methods-fr.html">Méthodes</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap est gratuit et sans publicité.
<a href="https://ko-fi.com/jakubwaller">&#9749; M'offrir un café</a>.</p>
"""),
    },
    "it": {
        "lang_name": "Italiano",
        "file": "leaderboard-it.html",
        "months": ("gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
                   "agosto", "settembre", "ottobre", "novembre", "dicembre"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Torna alla mappa",
        "title": "Classifica fasciatoi — PapaMap",
        "desc": ("Dove è stata risposta di recente alla domanda sulla stanza — "
                 "in quale stanza si trova il fasciatoio? Variazione in punti "
                 "percentuali, ricalcolata ogni notte da OpenStreetMap."),
        "h1": "La classifica",
        "stand": "Aggiornato al {date} · Dati da OpenStreetMap",
        "stand_base": ("Aggiornato al {date} · Variazione dal {base} · "
                       "Dati da OpenStreetMap"),
        "intro1": (
            "<p>Quale città abbia più fasciatoi, di proposito non sta in "
            "questa pagina. I numeri assoluti misurano soprattutto quanto a "
            "fondo un posto è stato mappato, non quanto sia ben attrezzato "
            "— una classifica del genere sarebbe fuorviante (il perché è "
            'spiegato nella <a href="{up}methods-it.html">pagina del '
            "metodo</a>). Quello che si può confrontare onestamente è il "
            "cambiamento: dove è stata risposta di recente alla domanda "
            "sulla stanza — in quale stanza si trova il fasciatoio? È "
            "questo che conta questa pagina — la quota di luoghi con la "
            "domanda sulla stanza risposta, e chi l'ha fatta crescere di "
            "più.</p>\n"),
        "intro2": (
            "<p>Ogni risposta conta, anche «solo bagno donne» — la mappa "
            "vive di risposte oneste, non di pin verdi. Rispondere richiede "
            "meno di un minuto sul posto: tocca un pin grigio sulla "
            '<a href="{up}">mappa</a> e segui il link a MapComplete. '
            '<a href="{up}methods-it.html#contribute">Passo per passo</a>.'
            "</p>\n"),
        "fresh": ("<p>La registrazione è iniziata il {date}. Appena ci sarà "
                  "un punto di confronto, qui si vedrà chi si è mosso.</p>\n"),
        "quiet": ("<p>Dal {base} non si è mosso nulla da nessuna parte. I "
                  "pin grigi aspettano.</p>\n"),
        "cities_h2": "Città",
        "cities_note": ("<p>{n} grandi città, ordinate per la variazione "
                        "della quota di risposte. Berlino, Amburgo e Brema "
                        "compaiono anche più sotto tra i Länder — qui però "
                        "conta la città.</p>\n"),
        "regions_h2": "Länder tedeschi e Danimarca",
        "regions_note": ("<p>Lo stesso calcolo per i {n} Bundesländer e per "
                         "la Danimarca nel suo complesso.</p>\n"),
        "regions_h2_regions": "Länder tedeschi, régions francesi e interi paesi",
        "regions_note_regions": "<p>Lo stesso calcolo per {list}.</p>\n",
        "cl_lands": "i {n} Bundesländer",
        "cl_regions": "le {r} régions francesi",
        "cl_country_one": "{names} nel suo complesso",
        "cl_country_many": "{c} paesi nel loro complesso ({names})",
        "and_sep": " e ",
        "regions_h2_many": "Länder tedeschi e interi paesi",
        "regions_note_many": ("<p>Lo stesso calcolo per i {n} Bundesländer "
                              "e per {c} paesi nel loro complesso: "
                              "{names}.</p>\n"),
        "regions_h2_one": "Länder tedeschi e un intero paese",
        "regions_note_one": ("<p>Lo stesso calcolo per i {n} Bundesländer e "
                             "per {names} nel suo complesso.</p>\n"),
        "regions_h2_lands": "Länder tedeschi",
        "regions_note_lands": ("<p>Lo stesso calcolo per i {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Città", "col_name_region": "Regione",
        "col_delta": "Δ punti", "col_share": "risposto",
        "col_total": "luoghi", "col_acc": "+ raggiungibili", "col_new": "+ luoghi",
        "sort_hint": ("Tocca l'intestazione di una colonna per ordinare la "
                      "tabella — tocca di nuovo per invertire l'ordine."),
        "footer": ("""\
<h2>Dati &amp; licenza</h2>
<p class="muted">Tutti i dati &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, sotto licenza <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Questa
pagina viene rigenerata ogni notte da una query Overpass e non salva nulla su di te.
Come si conta e si colora: <a href="{up}methods-it.html">Metodo</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap è gratuita e senza pubblicità.
<a href="https://ko-fi.com/jakubwaller">&#9749; Offrimi un caffè</a>.</p>
"""),
    },
    "cs": {
        "lang_name": "Čeština",
        "file": "leaderboard-cs.html",
        "months": ("ledna", "února", "března", "dubna", "května", "června",
                   "července", "srpna", "září", "října", "listopadu", "prosince"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Zpět na mapu",
        "title": "Žebříček přebalovacích pultů — PapaMap",
        "desc": ("Kde se v poslední době nejvíc odpovídalo na otázku, ve které "
                 "místnosti visí přebalovací pult? Změna v procentních "
                 "bodech, každou noc znovu z OpenStreetMap."),
        "h1": "Žebříček",
        "stand": "Aktualizováno {date} · Data z OpenStreetMap",
        "stand_base": ("Aktualizováno {date} · Změna od {base} · "
                       "Data z OpenStreetMap"),
        "intro1": (
            "<p>Které město má nejvíc přebalovacích pultů, tu záměrně "
            "nenajdeš. Absolutní čísla měří hlavně to, jak důkladně bylo "
            "dané místo zmapováno, ne jak dobře je vybavené — žebříček z "
            "toho by byl zavádějící (proč, vysvětlují "
            '<a href="{up}methods-cs.html">metody</a>). Poctivě se dá '
            "srovnávat změna: kde se v poslední době odpovědělo na otázku "
            "po místnosti — ve které místnosti přebalovací pult visí. "
            "Přesně to tahle stránka počítá — podíl míst se zodpovězenou "
            "otázkou po místnosti a kdo ho v poslední době zvýšil "
            "nejvíc.</p>\n"),
        "intro2": (
            "<p>Počítá se každá odpověď, i „jen dámské WC“ — mapa žije z "
            "poctivých odpovědí, ne ze zelených špendlíků. Odpovědět na "
            "místě zabere necelou minutu: ťukni na šedý špendlík na "
            '<a href="{up}">mapě</a> a jdi podle jejího odkazu na '
            'MapComplete. <a href="{up}methods-cs.html#contribute">Krok za '
            "krokem</a>.</p>\n"),
        "fresh": ("<p>Záznam začal {date}. Jakmile bude k dispozici bod "
                  "srovnání, ukáže se tu, kdo se pohnul.</p>\n"),
        "quiet": ("<p>Od {base} se nikde nic nehnulo. Šedé špendlíky "
                  "čekají.</p>\n"),
        "cities_h2": "Města",
        "cities_note": ("<p>{n} velkých měst, seřazených podle změny "
                        "zodpovězeného podílu. Berlín, Hamburk a Brémy jsou "
                        "i níž mezi spolkovými zeměmi — tady se počítá "
                        "město.</p>\n"),
        "regions_h2": "Bundesländer a Dánsko",
        "regions_note": ("<p>Stejný výpočet pro {n} Bundesländer a Dánsko "
                         "jako celek.</p>\n"),
        "regions_h2_regions": "Bundesländer, francouzské régions a celé země",
        "regions_note_regions": "<p>Stejný výpočet pro {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} francouzských régions",
        "cl_country_one": "{names} jako celek",
        "cl_country_many": "{c} zemí jako celek ({names})",
        "and_sep": " a ",
        "regions_h2_many": "Bundesländer a celé země",
        "regions_note_many": ("<p>Stejný výpočet pro {n} Bundesländer a pro "
                              "{c} zemí jako celek: {names}.</p>\n"),
        "regions_h2_one": "Bundesländer a jedna celá země",
        "regions_note_one": ("<p>Stejný výpočet pro {n} Bundesländer a pro "
                             "{names} jako celek.</p>\n"),
        "regions_h2_lands": "Bundesländer",
        "regions_note_lands": ("<p>Stejný výpočet pro {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Město", "col_name_region": "Region",
        "col_delta": "Δ body", "col_share": "zodpovězeno",
        "col_total": "místa", "col_acc": "+ dostupná", "col_new": "+ místa",
        "sort_hint": ("Klepni na záhlaví sloupce a seřadíš podle něj — "
                      "dalším klepnutím obrátíš směr."),
        "footer": ("""\
<h2>Data a licence</h2>
<p class="muted">Všechna data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, pod licencí <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Tahle
stránka se každou noc znovu generuje z dotazu na Overpass a neukládá o tobě nic.
Jak se tu počítá a barví: <a href="{up}methods-cs.html">Metody</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap je zdarma a bez reklam.
<a href="https://ko-fi.com/jakubwaller">&#9749; Pozvat mě na kávu</a>.</p>
"""),
    },
    "pl": {
        "lang_name": "Polski",
        "file": "leaderboard-pl.html",
        "months": ("stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
                   "lipca", "sierpnia", "września", "października",
                   "listopada", "grudnia"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Powrót do mapy",
        "title": "PapaMap — ranking przewijaków",
        "desc": ("Gdzie ostatnio odpowiedziano na pytanie o pomieszczenie — w "
                 "jakim pomieszczeniu wisi przewijak? Zmiana w punktach "
                 "procentowych, co noc od nowa z OpenStreetMap."),
        "h1": "Ranking",
        "stand": "Stan na {date} · dane z OpenStreetMap",
        "stand_base": ("Stan na {date} · zmiana od {base} · "
                       "dane z OpenStreetMap"),
        "intro1": (
            "<p>Które miasto ma najwięcej przewijaków, celowo nie jest "
            "tematem tej strony. Liczby bezwzględne mierzą przede wszystkim, "
            "jak dokładnie coś zmapowano, a nie jak dobrze miejsce jest "
            "wyposażone — ranking z tego byłby mylący (dlaczego, wyjaśniają "
            '<a href="{up}methods-pl.html">Metody</a>). Uczciwie porównać da '
            "się za to zmianę: gdzie ostatnio odpowiedziano na pytanie o "
            "pomieszczenie — w jakim pomieszczeniu wisi przewijak. Właśnie to "
            "liczy ta strona — udział miejsc z odpowiedzianym pytaniem o "
            "pomieszczenie i kto ostatnio podniósł go najbardziej.</p>\n"),
        "intro2": (
            "<p>Liczy się każda odpowiedź, także &bdquo;tylko damskie "
            "WC&rdquo; — mapa żyje z uczciwych odpowiedzi, nie z zielonych "
            "pinezek. Odpowiedzieć można na miejscu w niecałą minutę: "
            'stuknij szarą pinezkę na <a href="{up}">mapie</a> i podążaj za '
            'linkiem do MapComplete. <a href="{up}methods-pl.html#contribute">'
            "Krok po kroku</a>.</p>\n"),
        "fresh": ("<p>Zapisywanie zaczęło się {date}. Gdy tylko pojawi się "
                  "punkt porównania, ta strona pokaże, kto się poruszył.</p>\n"),
        "quiet": ("<p>Od {base} nigdzie nic się nie zmieniło. Szare pinezki "
                  "czekają.</p>\n"),
        "cities_h2": "Miasta",
        "cities_note": ("<p>{n} dużych miast, posortowanych według zmiany "
                        "udziału odpowiedzianych pytań. Berlin, Hamburg i "
                        "Brema pojawiają się też niżej, wśród krajów "
                        "związkowych — tu liczy się miasto.</p>\n"),
        "regions_h2": "Niemieckie kraje związkowe i Dania",
        "regions_note": ("<p>Ten sam rachunek dla {n} Bundesländer i całej "
                         "Danii.</p>\n"),
        "regions_h2_regions": ("Niemieckie kraje związkowe, francuskie "
                               "regiony i całe kraje"),
        "regions_note_regions": "<p>Ten sam rachunek dla {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} francuskich regionów",
        "cl_country_one": "{names} jako całości",
        "cl_country_many": "{c} krajów jako całości ({names})",
        "and_sep": " i ",
        "regions_h2_many": "Niemieckie kraje związkowe i całe kraje",
        "regions_note_many": ("<p>Ten sam rachunek dla {n} Bundesländer i "
                              "dla {c} krajów jako całości: {names}.</p>\n"),
        "regions_h2_one": "Niemieckie kraje związkowe i jeden cały kraj",
        "regions_note_one": ("<p>Ten sam rachunek dla {n} Bundesländer i "
                             "dla {names} jako całości.</p>\n"),
        "regions_h2_lands": "Niemieckie kraje związkowe",
        "regions_note_lands": ("<p>Ten sam rachunek dla {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Miasto", "col_name_region": "Region",
        "col_delta": "Δ punkty", "col_share": "odpowiedziane",
        "col_total": "miejsca", "col_acc": "+ dostępne", "col_new": "+ miejsca",
        "sort_hint": ("Stuknij nagłówek kolumny, żeby sortować według niej — "
                      "stuknij ponownie, żeby odwrócić kierunek."),
        "footer": ("""\
<h2>Dane i licencja</h2>
<p class="muted">Wszystkie dane &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, na licencji <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ta
strona jest odtwarzana co noc z zapytania Overpass i nie zapisuje o tobie niczego.
Jak liczymy i kolorujemy: <a href="{up}methods-pl.html">Metody</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap jest darmowy i bez reklam.
<a href="https://ko-fi.com/jakubwaller">&#9749; Postaw mi kawę</a>.</p>
"""),
    },
    "sv": {
        "lang_name": "Svenska",
        "file": "leaderboard-sv.html",
        "months": ("januari", "februari", "mars", "april", "maj", "juni", "juli",
                   "augusti", "september", "oktober", "november", "december"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Tillbaka till kartan",
        "title": "PapaMap — topplista över skötbord",
        "desc": ("Var har rumsfrågan — i vilket rum skötbordet står — besvarats på "
                 "sistone? Förändring i procentenheter, byggd på nytt varje natt "
                 "från OpenStreetMap."),
        "h1": "Topplistan",
        "stand": "Uppdaterad {date} · Data från OpenStreetMap",
        "stand_base": ("Uppdaterad {date} · Förändring sedan {base} · "
                       "Data från OpenStreetMap"),
        "intro1": (
            "<p>Vilken stad som har flest skötbord står avsiktligt inte här. "
            "Absoluta antal mäter mest hur grundligt en plats har kartlagts, "
            "inte hur väl den är utrustad — en rangordning av dem vore "
            "missvisande (varför förklaras på "
            '<a href="{up}methods-sv.html">metodsidan</a>). Det som går att '
            "jämföra ärligt är förändringen: var rumsfrågan — i vilket rum "
            "skötbordet står — har besvarats på sistone. Det är vad den här "
            "sidan räknar — andelen platser med besvarad rumsfråga, och vem "
            "som har ökat den mest.</p>\n"),
        "intro2": (
            "<p>Varje svar räknas, även ”bara damtoalett” — kartan lever av "
            "ärliga svar, inte av gröna nålar. Att svara tar under en minut "
            'på plats: tryck på en grå nål på <a href="{up}">kartan</a> och '
            'följ dess MapComplete-länk. <a href="{up}methods-sv.html#contribute">'
            "Steg för steg</a>.</p>\n"),
        "fresh": ("<p>Registreringen började {date}. Så snart det finns en "
                  "jämförelsepunkt visar den här sidan vem som har rört "
                  "sig.</p>\n"),
        "quiet": ("<p>Inget har rört sig någonstans sedan {base}. De grå "
                  "nålarna väntar.</p>\n"),
        "cities_h2": "Städer",
        "cities_note": ("<p>{n} stora städer, sorterade efter förändringen "
                        "av den besvarade andelen. Berlin, Hamburg och "
                        "Bremen finns också med bland delstaterna nedan — "
                        "här räknas staden.</p>\n"),
        "regions_h2": "Tyska delstater och Danmark",
        "regions_note": ("<p>Samma räkning för de {n} Bundesländer och "
                         "Danmark som helhet.</p>\n"),
        "regions_h2_regions": "Tyska delstater, franska régions och hela länder",
        "regions_note_regions": "<p>Samma räkning för {list}.</p>\n",
        "cl_lands": "de {n} Bundesländer",
        "cl_regions": "de {r} franska régions",
        "cl_country_one": "{names} som helhet",
        "cl_country_many": "{c} länder som helhet ({names})",
        "and_sep": " och ",
        "regions_h2_many": "Tyska delstater och hela länder",
        "regions_note_many": ("<p>Samma räkning för de {n} Bundesländer "
                              "och för {c} länder som helhet: {names}.</p>\n"),
        "regions_h2_one": "Tyska delstater och ett helt land",
        "regions_note_one": ("<p>Samma räkning för de {n} Bundesländer "
                             "och för {names} som helhet.</p>\n"),
        "regions_h2_lands": "Tyska delstater",
        "regions_note_lands": ("<p>Samma räkning för de {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Stad", "col_name_region": "Region",
        "col_delta": "Δ poäng", "col_share": "besvarat",
        "col_total": "platser", "col_acc": "+ nåbara", "col_new": "+ platser",
        "sort_hint": ("Tryck på en kolumnrubrik för att sortera efter den — "
                      "tryck igen för att vända ordningen."),
        "footer": ("""\
<h2>Data &amp; licens</h2>
<p class="muted">Alla data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, under <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Den här
sidan byggs om varje natt från en Overpass-fråga och sparar ingenting om dig.
Hur saker räknas och färgläggs: <a href="{up}methods-sv.html">Metod</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap är gratis och reklamfri.
<a href="https://ko-fi.com/jakubwaller">&#9749; Bjud på en kaffe</a>.</p>
"""),
    },
    "bs": {
        "lang_name": "Bosanski",
        "file": "leaderboard-bs.html",
        "months": ("januara", "februara", "marta", "aprila", "maja", "juna",
                   "jula", "avgusta", "septembra", "oktobra", "novembra",
                   "decembra"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Nazad na kartu",
        "title": "Rang lista stolova za previjanje — PapaMap",
        "desc": ("Gdje je nedavno odgovoreno na pitanje o prostoriji — u "
                 "kojoj se prostoriji nalazi sto za previjanje? Promjena u "
                 "procentnim poenima, ponovo izgrađeno svake noći iz "
                 "OpenStreetMapa."),
        "h1": "Rang lista",
        "stand": "Stanje na dan {date} · Podaci sa OpenStreetMapa",
        "stand_base": ("Stanje na dan {date} · Promjena od {base} · "
                       "Podaci sa OpenStreetMapa"),
        "intro1": (
            "<p>Koji grad ima najviše stolova za previjanje namjerno nije "
            "na ovoj stranici. Apsolutni brojevi uglavnom mjere koliko je "
            "neko mjesto temeljito mapirano, a ne koliko je dobro "
            "opremljeno — rang lista po tome bi zavaravala (zašto, "
            'objašnjeno je na stranici <a href="{up}methods-bs.html">'
            "Metode</a>). Ono što se pošteno može uporediti jeste promjena: "
            "gdje je nedavno odgovoreno na pitanje o prostoriji — u kojoj "
            "se prostoriji nalazi sto za previjanje. Upravo to ova "
            "stranica broji — udio mjesta sa odgovorenim pitanjem o "
            "prostoriji, i ko ga je posljednje najviše povećao.</p>\n"),
        "intro2": (
            "<p>Svaki odgovor je važan, uključujući &bdquo;samo žensko "
            "WC&ldquo; — karta živi od iskrenih odgovora, ne od zelenih "
            "oznaka. Odgovoriti možeš na licu mjesta za manje od minute: "
            'dodirni sivu oznaku na <a href="{up}">karti</a> i prati '
            'MapComplete link. <a href="{up}methods-bs.html#contribute">'
            "Korak po korak</a>.</p>\n"),
        "fresh": ("<p>Bilježenje je počelo {date}. Čim postoji tačka za "
                  "poređenje, ovdje će pisati ko se pomjerio.</p>\n"),
        "quiet": ("<p>Od {base} se nigdje ništa nije pomjerilo. Sive "
                  "oznake čekaju.</p>\n"),
        "cities_h2": "Gradovi",
        "cities_note": ("<p>{n} velikih gradova, poređanih po promjeni "
                        "udjela odgovorenih. Berlin, Hamburg i Bremen "
                        "pojavljuju se i niže, među pokrajinama — ovdje se "
                        "računa grad.</p>\n"),
        "regions_h2": "Njemačke pokrajine i Danska",
        "regions_note": ("<p>Ista računica za {n} Bundesländer i Dansku u "
                         "cjelini.</p>\n"),
        "regions_h2_regions": "Njemačke pokrajine, francuske régions i cijele zemlje",
        "regions_note_regions": "<p>Ista računica za {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} francuskih régions",
        "cl_country_one": "{names} u cjelini",
        "cl_country_many": "{c} zemlje u cjelini ({names})",
        "and_sep": " i ",
        "regions_h2_many": "Njemačke pokrajine i cijele zemlje",
        "regions_note_many": ("<p>Ista računica za {n} Bundesländer i za "
                              "{c} zemlje u cjelini: {names}.</p>\n"),
        "regions_h2_one": "Njemačke pokrajine i jedna cijela zemlja",
        "regions_note_one": ("<p>Ista računica za {n} Bundesländer i za "
                             "{names} u cjelini.</p>\n"),
        "regions_h2_lands": "Njemačke pokrajine",
        "regions_note_lands": ("<p>Ista računica za {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Grad", "col_name_region": "Regija",
        "col_delta": "Δ poena", "col_share": "odgovoreno",
        "col_total": "mjesta", "col_acc": "+ dostupno", "col_new": "+ mjesta",
        "sort_hint": ("Dodirni naslov kolone da sortiraš po njoj — dodirni "
                      "ponovo da promijeniš smjer."),
        "footer": ("""\
<h2>Podaci &amp; licenca</h2>
<p class="muted">Svi podaci &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, pod licencom <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ova
stranica se svake noći iznova generiše iz Overpass upita i ne čuva ništa o tebi.
Kako se broji i boji: <a href="{up}methods-bs.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap je besplatan i bez reklama.
<a href="https://ko-fi.com/jakubwaller">&#9749; Časti me kafom</a>.</p>
"""),
    },
    "ca": {
        "lang_name": "Català",
        "file": "leaderboard-ca.html",
        "months": ("gener", "febrer", "març", "abril", "maig", "juny", "juliol",
                   "agost", "setembre", "octubre", "novembre", "desembre"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Torna al mapa",
        "title": "PapaMap — Classificació",
        "desc": ("On s'ha respost últimament la pregunta de la sala — a quina "
                 "sala és el canviador? Canvi en punts percentuals, "
                 "reconstruït cada nit a partir d'OpenStreetMap."),
        "h1": "La classificació",
        "stand": "Actualitzat el {date} · Dades d'OpenStreetMap",
        "stand_base": ("Actualitzat el {date} · Canvi des de {base} · "
                       "Dades d'OpenStreetMap"),
        "intro1": (
            "<p>Quina ciutat té més canviadors: expressament, no hi surt en "
            "aquesta pàgina. Els recomptes absoluts mesuren sobretot amb "
            "quin detall s'ha mapejat un lloc, no com d'equipat està — "
            "fer-ne una classificació seria enganyós (la "
            '<a href="{up}methods-ca.html">pàgina de mètodes</a> explica '
            "per què). El que es pot comparar honestament és el canvi: on "
            "s'ha respost últimament la pregunta de la sala, és a dir, a "
            "quina sala és el canviador. Això és el que compta aquesta "
            "pàgina: la proporció de llocs amb la pregunta de la sala "
            "resposta, i qui l'ha augmentada més últimament.</p>\n"),
        "intro2": (
            "<p>Cada resposta compta, també «només lavabo de dones» — el "
            "mapa viu de respostes honestes, no de pins verds. Respondre "
            "triga menys d'un minut, allà mateix: toca un pin gris al "
            '<a href="{up}">mapa</a> i segueix l\'enllaç a MapComplete. '
            '<a href="{up}methods-ca.html#contribute">Pas a pas</a>.</p>\n'),
        "fresh": ("<p>El registre va començar el {date}. Tan aviat com hi "
                  "hagi un punt de comparació, aquesta pàgina mostrarà qui "
                  "s'ha mogut.</p>\n"),
        "quiet": ("<p>Des de {base} no s'ha mogut res enlloc. Els pins "
                  "grisos esperen.</p>\n"),
        "cities_h2": "Ciutats",
        "cities_note": ("<p>{n} grans ciutats, ordenades pel canvi en la "
                        "seva proporció resposta. Berlín, Hamburg i Bremen "
                        "també apareixen més avall entre els Bundesländer "
                        "— aquí compta la ciutat.</p>\n"),
        "regions_h2": "Bundesländer i Dinamarca",
        "regions_note": ("<p>El mateix càlcul per als {n} Bundesländer i "
                         "per a Dinamarca en conjunt.</p>\n"),
        "regions_h2_regions": "Bundesländer, régions franceses i països sencers",
        "regions_note_regions": "<p>El mateix càlcul per a {list}.</p>\n",
        "cl_lands": "els {n} Bundesländer",
        "cl_regions": "les {r} régions franceses",
        "cl_country_one": "{names} en conjunt",
        "cl_country_many": "{c} països en conjunt ({names})",
        "and_sep": " i ",
        "regions_h2_many": "Bundesländer i països sencers",
        "regions_note_many": ("<p>El mateix càlcul per als {n} Bundesländer "
                              "i per a {c} països en conjunt: {names}.</p>\n"),
        "regions_h2_one": "Bundesländer i un país sencer",
        "regions_note_one": ("<p>El mateix càlcul per als {n} Bundesländer "
                             "i per a {names} en conjunt.</p>\n"),
        "regions_h2_lands": "Bundesländer",
        "regions_note_lands": ("<p>El mateix càlcul per als {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Ciutat", "col_name_region": "Regió",
        "col_delta": "Δ punts", "col_share": "resposta",
        "col_total": "llocs", "col_acc": "+ a l'abast", "col_new": "+ llocs",
        "sort_hint": ("Toca una capçalera de columna per ordenar-hi — torna "
                      "a tocar per invertir l'ordre."),
        "footer": ("""\
<h2>Dades i llicència</h2>
<p class="muted">Totes les dades &copy; <a href="https://www.openstreetmap.org/copyright">col·laboradors
d'OpenStreetMap</a>, sota la <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Aquesta
pàgina es regenera cada nit a partir d'una consulta a Overpass i no desa res sobre tu.
Com es compta i s'acoloreix: <a href="{up}methods-ca.html">Mètodes</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap és gratuït i sense publicitat.
<a href="https://ko-fi.com/jakubwaller">&#9749; Convida'm a un cafè</a>.</p>
"""),
    },
    "et": {
        "lang_name": "Eesti",
        "file": "leaderboard-et.html",
        "months": ("jaanuar", "veebruar", "märts", "aprill", "mai", "juuni",
                   "juuli", "august", "september", "oktoober", "november",
                   "detsember"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Tagasi kaardile",
        "title": "PapaMapi edetabel",
        "desc": ("Kus on hiljuti vastatud ruumi küsimusele — millises ruumis "
                 "mähkimislaud asub? Muutus protsendipunktides, uuendatud "
                 "iga öö OpenStreetMapi andmete põhjal."),
        "h1": "Edetabel",
        "stand": "Seis {date} · Andmed: OpenStreetMap",
        "stand_base": ("Seis {date} · Muutus alates {base} · "
                       "Andmed: OpenStreetMap"),
        "intro1": (
            "<p>Milline linn pakub kõige rohkem mähkimislaudu — seda ei "
            "leia siit lehelt meelega. Absoluutsed arvud mõõdavad enamasti "
            "seda, kui põhjalikult üht kohta on kaardistatud, mitte seda, "
            "kui hästi see on varustatud — nende järjestamine oleks "
            'eksitav (miks, seletab <a href="{up}methods-et.html">meetodite '
            "leht</a>). Ausalt saab võrrelda muutust: kus on hiljuti "
            "vastatud ruumi küsimusele — millises ruumis mähkimislaud "
            "asub. Just seda see leht loeb — nende kohtade osakaalu, kus "
            "ruumi küsimusele on vastatud, ja kes on seda osakaalu "
            "viimasel ajal kõige rohkem kasvatanud.</p>\n"),
        "intro2": (
            "<p>Iga vastus loeb, ka &bdquo;ainult naiste WC-s&ldquo; — "
            "kaart toetub ausatele vastustele, mitte rohelistele "
            "nõeltele. Vastamine võtab kohapeal alla minuti: puuduta "
            'halli nõela <a href="{up}">kaardil</a> ja järgi selle '
            "MapComplete'i linki. "
            '<a href="{up}methods-et.html#contribute">Samm-sammult</a>.</p>\n'),
        "fresh": ("<p>Andmete kogumine algas {date}. Niipea kui on olemas "
                  "võrdluspunkt, näitab see leht, kes on liikunud.</p>\n"),
        "quiet": ("<p>Alates {base} pole midagi kuskil muutunud. Hallid "
                  "nõelad ootavad.</p>\n"),
        "cities_h2": "Linnad",
        "cities_note": ("<p>{n} suurlinna, järjestatud nende vastatud "
                        "osakaalu muutuse järgi. Berliin, Hamburg ja Bremen "
                        "esinevad ka allpool liidumaade seas — siin loeb "
                        "linn.</p>\n"),
        "regions_h2": "Bundesländer ja Taani",
        "regions_note": "<p>Sama arvutus: {n} Bundesländer ja Taani tervikuna.</p>\n",
        "regions_h2_regions": "Bundesländer, Prantsuse régions ja terved riigid",
        "regions_note_regions": "<p>Sama arvutus: {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} Prantsuse régions",
        "cl_country_one": "{names} tervikuna",
        "cl_country_many": "{c} riiki tervikuna ({names})",
        "and_sep": " ja ",
        "regions_h2_many": "Bundesländer ja terved riigid",
        "regions_note_many": ("<p>Sama arvutus: {n} Bundesländer ja {c} "
                              "riiki tervikuna ({names}).</p>\n"),
        "regions_h2_one": "Bundesländer ja üks terve riik",
        "regions_note_one": ("<p>Sama arvutus: {n} Bundesländer ja {names} "
                             "tervikuna.</p>\n"),
        "regions_h2_lands": "Bundesländer",
        "regions_note_lands": "<p>Sama arvutus: {n} Bundesländer.</p>\n",
        "col_name_city": "Linn", "col_name_region": "Piirkond",
        "col_delta": "Δ punktid", "col_share": "vastatud",
        "col_total": "kohad", "col_acc": "+ ligipääsetavad", "col_new": "+ kohad",
        "sort_hint": ("Puuduta veeru pealkirja, et selle järgi sortida — "
                      "puuduta uuesti, et suund ümber pöörata."),
        "footer": ("""\
<h2>Andmed ja litsents</h2>
<p class="muted">Kõik andmed &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, litsentsi <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a> alusel. Leht
ehitatakse iga öö uuesti Overpassi päringu põhjal ega salvesta sinu kohta midagi.
Kuidas kohti loetakse ja värvitakse: <a href="{up}methods-et.html">Meetodid</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap on tasuta ja reklaamivaba.
<a href="https://ko-fi.com/jakubwaller">&#9749; Osta mulle kohv</a>.</p>
"""),
    },
    "es": {
        "lang_name": "Español",
        "file": "leaderboard-es.html",
        "months": ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                   "agosto", "septiembre", "octubre", "noviembre", "diciembre"),
        "date_fmt": "{d} de {m} de {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Volver al mapa",
        "title": "Clasificación de PapaMap",
        "desc": ("¿Dónde se ha respondido últimamente a la pregunta de la sala, "
                 "es decir, en qué sala está el cambiador? Cambio en puntos "
                 "porcentuales, recalculado cada noche a partir de "
                 "OpenStreetMap."),
        "h1": "La clasificación",
        "stand": "A fecha de {date} · Datos de OpenStreetMap",
        "stand_base": ("A fecha de {date} · Cambio desde el {base} · "
                       "Datos de OpenStreetMap"),
        "intro1": (
            "<p>Qué ciudad tiene más cambiadores no aparece aquí a propósito. "
            "Los números absolutos miden sobre todo lo minuciosamente que se ha "
            "mapeado un lugar, no lo bien equipado que está — clasificarlos así "
            "induciría a error (los "
            '<a href="{up}methods-es.html">métodos</a> explican por qué). Lo '
            "que sí se puede comparar con honestidad es el cambio: dónde se ha "
            "respondido últimamente a la pregunta de la sala — en qué sala "
            "está el cambiador. Eso es lo que cuenta esta página: la "
            "proporción de lugares con la pregunta de la sala respondida, y "
            "quién la ha aumentado más últimamente.</p>\n"),
        "intro2": (
            "<p>Cada respuesta cuenta, incluso «solo baño de mujeres» — el "
            "mapa vive de respuestas honestas, no de pines verdes. Responder "
            'lleva menos de un minuto, allí mismo: toca un pin gris en el '
            '<a href="{up}">mapa</a> y sigue su enlace a MapComplete. '
            '<a href="{up}methods-es.html#contribute">Paso a paso</a>.</p>\n'),
        "fresh": ("<p>El registro empezó el {date}. En cuanto haya un punto de "
                  "comparación, esta página mostrará quién se ha movido.</p>\n"),
        "quiet": ("<p>Nada se ha movido en ningún sitio desde el {base}. Los "
                  "pines grises esperan.</p>\n"),
        "cities_h2": "Ciudades",
        "cities_note": ("<p>{n} grandes ciudades, ordenadas por el cambio en "
                        "su proporción respondida. Berlín, Hamburgo y Bremen "
                        "también aparecen más abajo, entre los estados — aquí "
                        "cuenta la ciudad.</p>\n"),
        "regions_h2": "Estados alemanes y Dinamarca",
        "regions_note": ("<p>El mismo cálculo para los {n} Bundesländer y "
                         "Dinamarca en su conjunto.</p>\n"),
        "regions_h2_regions": "Estados alemanes, régions francesas y países enteros",
        "regions_note_regions": "<p>El mismo cálculo para {list}.</p>\n",
        "cl_lands": "los {n} Bundesländer",
        "cl_regions": "las {r} régions francesas",
        "cl_country_one": "{names} en su conjunto",
        "cl_country_many": "{c} países en su conjunto ({names})",
        "and_sep": " y ",
        "regions_h2_many": "Estados alemanes y países enteros",
        "regions_note_many": ("<p>El mismo cálculo para los {n} Bundesländer "
                              "y para {c} países en su conjunto: {names}.</p>\n"),
        "regions_h2_one": "Estados alemanes y un país entero",
        "regions_note_one": ("<p>El mismo cálculo para los {n} Bundesländer "
                             "y para {names} en su conjunto.</p>\n"),
        "regions_h2_lands": "Estados alemanes",
        "regions_note_lands": ("<p>El mismo cálculo para los {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Ciudad", "col_name_region": "Región",
        "col_delta": "Δ puntos", "col_share": "respondido",
        "col_total": "lugares", "col_acc": "+ accesible", "col_new": "+ lugares",
        "sort_hint": ("Toca el encabezado de una columna para ordenar por "
                      "ella — vuelve a tocar para invertir el orden."),
        "footer": ("""\
<h2>Datos y licencia</h2>
<p class="muted">Todos los datos &copy; <a href="https://www.openstreetmap.org/copyright">colaboradores
de OpenStreetMap</a>, bajo la <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Esta
página se regenera cada noche a partir de una consulta a Overpass y no guarda nada sobre ti.
Cómo se cuenta y se colorea: <a href="{up}methods-es.html">Métodos</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap es gratis y sin publicidad.
<a href="https://ko-fi.com/jakubwaller">&#9749; Invítame a un café</a>.</p>
"""),
    },
    "hr": {
        "lang_name": "Hrvatski",
        "file": "leaderboard-hr.html",
        "months": ("siječnja", "veljače", "ožujka", "travnja", "svibnja",
                   "lipnja", "srpnja", "kolovoza", "rujna", "listopada",
                   "studenoga", "prosinca"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Natrag na kartu",
        "title": "PapaMap — ljestvica",
        "desc": ("Gdje je nedavno odgovoreno na pitanje o prostoriji — u "
                 "kojoj se prostoriji nalazi stol za previjanje? Promjena u "
                 "postotnim bodovima, svake noći iznova izgrađeno iz "
                 "OpenStreetMapa."),
        "h1": "Ljestvica",
        "stand": "Stanje {date} · Podaci iz OpenStreetMapa",
        "stand_base": ("Stanje {date} · Promjena od {base} · Podaci iz "
                       "OpenStreetMapa"),
        "intro1": (
            "<p>Koji grad ima najviše stolova za previjanje namjerno nije "
            "na ovoj stranici. Apsolutni brojevi uglavnom mjere koliko je "
            "neko mjesto temeljito mapirano, a ne koliko je dobro "
            "opremljeno — ljestvica od toga bi zavaravala (razlog "
            'objašnjava stranica <a href="{up}methods-hr.html">Metode</a>). '
            "Pošteno se može usporediti promjena: gdje je zadnje odgovoreno "
            "na pitanje o prostoriji — u kojoj se prostoriji nalazi stol za "
            "previjanje? Upravo to broji ova stranica — udio mjesta s "
            "odgovorenim pitanjem o prostoriji, i tko ga je posljednje "
            "najviše povećao.</p>\n"),
        "intro2": (
            "<p>Svaki odgovor se broji, uključujući »samo žensko WC« — "
            "karta živi od poštenih odgovora, a ne od zelenih pinova. "
            "Odgovoriti na licu mjesta traje manje od minute: dodirni sivi "
            'pin na <a href="{up}">karti</a> i slijedi njegovu MapComplete '
            'poveznicu. <a href="{up}methods-hr.html#contribute">Korak po '
            "korak</a>.</p>\n"),
        "fresh": ("<p>Bilježenje je počelo {date}. Čim postoji točka za "
                  "usporedbu, ova će stranica pokazati tko se pomaknuo.</p>\n"),
        "quiet": ("<p>Od {base} se nigdje ništa nije pomaknulo. Sivi pinovi "
                  "čekaju.</p>\n"),
        "cities_h2": "Gradovi",
        "cities_note": ("<p>{n} velikih gradova, poredanih prema promjeni "
                        "njihova odgovorenog udjela. Berlin, Hamburg i "
                        "Bremen pojavljuju se i niže među pokrajinama — "
                        "ovdje se broji grad.</p>\n"),
        "regions_h2": "Njemačke pokrajine i Danska",
        "regions_note": ("<p>Isti izračun za {n} Bundesländer i Dansku u "
                         "cjelini.</p>\n"),
        "regions_h2_regions": "Njemačke pokrajine, francuske regije i cijele zemlje",
        "regions_note_regions": "<p>Isti izračun za {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} francuskih regija",
        "cl_country_one": "{names} u cjelini",
        "cl_country_many": "{c} zemlje u cjelini ({names})",
        "and_sep": " i ",
        "regions_h2_many": "Njemačke pokrajine i cijele zemlje",
        "regions_note_many": ("<p>Isti izračun za {n} Bundesländer i za {c} "
                              "zemlje u cjelini: {names}.</p>\n"),
        "regions_h2_one": "Njemačke pokrajine i jedna cijela zemlja",
        "regions_note_one": ("<p>Isti izračun za {n} Bundesländer i za "
                             "{names} u cjelini.</p>\n"),
        "regions_h2_lands": "Njemačke pokrajine",
        "regions_note_lands": ("<p>Isti izračun za {n} Bundesländer.</p>\n"),
        "col_name_city": "Grad", "col_name_region": "Regija",
        "col_delta": "Δ bodovi", "col_share": "odgovoreno",
        "col_total": "mjesta", "col_acc": "+ dostupno", "col_new": "+ mjesta",
        "sort_hint": ("Dodirni zaglavlje stupca za sortiranje po njemu — "
                      "dodirni ponovno za obrnuti redoslijed."),
        "footer": ("""\
<h2>Podaci i licencija</h2>
<p class="muted">Svi podaci &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, pod licencijom <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ova
stranica se svake noći iznova generira iz Overpass upita i o tebi ništa ne pohranjuje.
Kako se broji i boji: <a href="{up}methods-hr.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap je besplatan i bez oglasa.
<a href="https://ko-fi.com/jakubwaller">&#9749; Časti me kavom</a>.</p>
"""),
    },
    "is": {
        "lang_name": "Íslenska",
        "file": "leaderboard-is.html",
        "months": ("janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí",
                   "ágúst", "september", "október", "nóvember", "desember"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Til baka á kortið",
        "title": "PapaMap — Topplisti skiptiborða",
        "desc": ("Hvar var spurningunni um rýmið — í hvaða rými hangir "
                 "skiptiborðið? — nýlega svarað? Breyting í prósentustigum, "
                 "endurreiknuð á hverri nóttu úr OpenStreetMap."),
        "h1": "Topplistinn",
        "stand": "Staða þann {date} · Gögn úr OpenStreetMap",
        "stand_base": ("Staða þann {date} · Breyting frá {base} · "
                       "Gögn úr OpenStreetMap"),
        "intro1": (
            "<p>Hvaða borg er með flest skiptiborð er vísvitandi ekki á "
            "þessari síðu. Heildartölur mæla aðallega hversu ítarlega "
            "staður hefur verið kortlagður, ekki hversu vel hann er búinn "
            "— að raða eftir þeim væri villandi (<a "
            'href="{up}methods-is.html">aðferðasíðan</a> útskýrir af '
            "hverju). Það sem hægt er að bera heiðarlega saman er breyting: "
            "hvar spurningunni um rýmið — í hvaða rými er skiptiborðið? — "
            "var nýlega svarað. Það er það sem þessi síða telur — hlutfall "
            "staða þar sem spurningunni um rýmið hefur verið svarað, og "
            "hver hefur hækkað það hlutfall mest.</p>\n"),
        "intro2": (
            "<p>Sérhvert svar telur, líka „aðeins á kvennasalerni“ — "
            "kortið lifir á heiðarlegum svörum, ekki grænum punktum. Að "
            'svara tekur innan við mínútu á staðnum: ýttu á gráan punkt á '
            '<a href="{up}">kortinu</a> og fylgdu MapComplete-tenglinum. '
            '<a href="{up}methods-is.html#contribute">Skref fyrir '
            "skref</a>.</p>\n"),
        "fresh": ("<p>Skráning hófst þann {date}. Um leið og til er "
                  "samanburðarpunktur, sýnir þessi síða hver hefur "
                  "breyst.</p>\n"),
        "quiet": ("<p>Ekkert hefur breyst neins staðar síðan {base}. Gráu "
                  "punktarnir bíða.</p>\n"),
        "cities_h2": "Borgir",
        "cities_note": ("<p>{n} stórborgir, raðað eftir breytingu á "
                        "svöruðu hlutfalli þeirra. Berlín, Hamborg og "
                        "Bremen koma líka fyrir hér fyrir neðan hjá "
                        "sambandslöndunum — hér gildir borgin.</p>\n"),
        "regions_h2": "Þýsk sambandslönd og Danmörk",
        "regions_note": ("<p>Sami útreikningur fyrir þau {n} Bundesländer "
                         "og Danmörku í heild.</p>\n"),
        "regions_h2_regions": ("Þýsk sambandslönd, frönsk héruð og heil "
                               "lönd"),
        "regions_note_regions": "<p>Sami útreikningur fyrir {list}.</p>\n",
        "cl_lands": "þau {n} Bundesländer",
        "cl_regions": "þau {r} frönsku héruð",
        "cl_country_one": "{names} í heild",
        "cl_country_many": "{c} lönd í heild ({names})",
        "and_sep": " og ",
        "regions_h2_many": "Þýsk sambandslönd og heil lönd",
        "regions_note_many": ("<p>Sami útreikningur fyrir þau {n} "
                              "Bundesländer og fyrir {c} lönd í heild: "
                              "{names}.</p>\n"),
        "regions_h2_one": "Þýsk sambandslönd og eitt heilt land",
        "regions_note_one": ("<p>Sami útreikningur fyrir þau {n} "
                             "Bundesländer og fyrir {names} í heild.</p>\n"),
        "regions_h2_lands": "Þýsk sambandslönd",
        "regions_note_lands": ("<p>Sami útreikningur fyrir þau {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Borg", "col_name_region": "Svæði",
        "col_delta": "Δ stig", "col_share": "svarað",
        "col_total": "staðir", "col_acc": "+ aðgengilegt", "col_new": "+ staðir",
        "sort_hint": ("Ýttu á dálkfyrirsögn til að raða eftir henni — "
                      "ýttu aftur til að snúa við röðinni."),
        "footer": ("""\
<h2>Gögn og leyfi</h2>
<p class="muted">Öll gögn &copy; <a href="https://www.openstreetmap.org/copyright">framlagsaðilar
OpenStreetMap</a>, undir <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>-leyfinu.
Þessi síða er endurgerð á hverri nóttu úr Overpass-fyrirspurn og geymir ekkert um þig.
Hvernig talið er og litað: <a href="{up}methods-is.html">Aðferð</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap er ókeypis og auglýsingalaust.
<a href="https://ko-fi.com/jakubwaller">&#9749; Bjóða mér upp á kaffi</a>.</p>
"""),
    },
    "lv": {
        "lang_name": "Latviešu",
        "file": "leaderboard-lv.html",
        "months": ("janvāra", "februāra", "marta", "aprīļa", "maija", "jūnija",
                   "jūlija", "augusta", "septembra", "oktobra", "novembra",
                   "decembra"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Atpakaļ uz karti",
        "title": "PapaMap — pārtinamo galdiņu reitings",
        "desc": ("Kur pēdējā laikā atbildēts uz jautājumu par telpu — kurā "
                 "telpā atrodas pārtinamais galdiņš? Izmaiņas procentpunktos, "
                 "katru nakti no jauna veidots no OpenStreetMap datiem."),
        "h1": "Reitings",
        "stand": "Atjaunots {date} · dati no OpenStreetMap",
        "stand_base": ("Atjaunots {date} · izmaiņas kopš {base} · "
                       "dati no OpenStreetMap"),
        "intro1": (
            "<p>Kurai pilsētai ir visvairāk pārtinamo galdiņu, šajā lapā "
            "apzināti nav redzams. Absolūtie skaitļi galvenokārt parāda, cik "
            "rūpīgi vieta ir kartēta, nevis cik labi tā ir aprīkota — "
            "reitings pēc tiem būtu maldinošs (kāpēc, to paskaidro "
            '<a href="{up}methods-lv.html">metodikas lapa</a>). Godīgi var '
            "salīdzināt izmaiņas: kur pēdējā laikā atbildēts uz jautājumu "
            "par telpu — kurā telpā atrodas pārtinamais galdiņš? Tieši to "
            "šī lapa skaita — to vietu daļu, kurām telpas jautājums ir "
            "atbildēts, un kas to pēdējā laikā palielinājis visvairāk.</p>\n"),
        "intro2": (
            "<p>Katra atbilde ir svarīga, arī &bdquo;tikai sieviešu "
            "telpā&ldquo; — karte dzīvo no godīgām atbildēm, nevis no zaļām "
            "atzīmēm. Atbildēt var uz vietas, mazāk nekā minūtē: uzspied uz "
            'pelēkas atzīmes <a href="{up}">kartē</a> un seko MapComplete '
            'saitei. <a href="{up}methods-lv.html#contribute">Soli pa '
            "solim</a>.</p>\n"),
        "fresh": ("<p>Pierakstīšana sākās {date}. Tiklīdz būs pieejams "
                  "salīdzinājuma datums, šeit būs redzams, kurš ir "
                  "virzījies uz priekšu.</p>\n"),
        "quiet": ("<p>Kopš {base} nekas nekur nav mainījies. Pelēkās "
                  "atzīmes gaida.</p>\n"),
        "cities_h2": "Pilsētas",
        "cities_note": ("<p>{n} lielas pilsētas, sakārtotas pēc atbildētās "
                        "daļas izmaiņām. Berlīne, Hamburga un Brēmene "
                        "parādās arī zemāk pie federālajām zemēm — šeit "
                        "skaitās pilsēta.</p>\n"),
        "regions_h2": "Vācijas federālās zemes un Dānija",
        "regions_note": ("<p>Tas pats aprēķins: {n} Bundesländer un Dānija "
                         "kopumā.</p>\n"),
        "regions_h2_regions": ("Vācijas federālās zemes, Francijas reģioni "
                               "un veselas valstis"),
        "regions_note_regions": "<p>Tas pats aprēķins: {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} Francijas reģioni",
        "cl_country_one": "{names} kopumā",
        "cl_country_many": "{c} valstis kopumā ({names})",
        "and_sep": " un ",
        "regions_h2_many": "Vācijas federālās zemes un veselas valstis",
        "regions_note_many": ("<p>Tas pats aprēķins: {n} Bundesländer un "
                              "{c} valstis kopumā — {names}.</p>\n"),
        "regions_h2_one": "Vācijas federālās zemes un viena vesela valsts",
        "regions_note_one": ("<p>Tas pats aprēķins: {n} Bundesländer un "
                             "{names} kopumā.</p>\n"),
        "regions_h2_lands": "Vācijas federālās zemes",
        "regions_note_lands": ("<p>Tas pats aprēķins: {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Pilsēta", "col_name_region": "Reģions",
        "col_delta": "Δ punkti", "col_share": "atbildēts",
        "col_total": "vietas", "col_acc": "+ pieejami", "col_new": "+ vietas",
        "sort_hint": ("Uzspied uz kolonnas virsraksta, lai kārtotu pēc tā — "
                      "uzspied vēlreiz, lai mainītu virzienu."),
        "footer": ("""\
<h2>Dati un licence</h2>
<p class="muted">Visi dati &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
līdzstrādnieki</a>, saskaņā ar <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a> licenci. Šī
lapa katru nakti tiek no jauna izveidota no Overpass vaicājuma un par tevi neko neuzglabā.
Kā tiek skaitīts un iekrāsots: <a href="{up}methods-lv.html">Metodika</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap ir bezmaksas un bez reklāmām.
<a href="https://ko-fi.com/jakubwaller">&#9749; Nopērc man kafiju</a>.</p>
"""),
    },
    "lt": {
        "lang_name": "Lietuvių",
        "file": "leaderboard-lt.html",
        "months": ("sausio", "vasario", "kovo", "balandžio", "gegužės",
                   "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio",
                   "lapkričio", "gruodžio"),
        "date_fmt": "{y} m. {m} {d} d.",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Grįžti į žemėlapį",
        "title": "Pervystymo stalų reitingas — PapaMap",
        "desc": ("Kur pastaruoju metu buvo atsakyta į klausimą apie patalpą "
                 "— kurioje patalpoje yra pervystymo stalas? Pokytis "
                 "procentiniais punktais, kas naktį perskaičiuojamas iš "
                 "OpenStreetMap."),
        "h1": "Reitingas",
        "stand": "{date} duomenimis · šaltinis — OpenStreetMap",
        "stand_base": ("{date} duomenimis · pokytis nuo {base} · "
                       "šaltinis — OpenStreetMap"),
        "intro1": (
            "<p>Kuriame mieste yra daugiausia pervystymo stalų — apie tai "
            "šis puslapis sąmoningai nekalba. Absoliutūs skaičiai "
            "daugiausia rodo, kaip nuodugniai vieta sužymėta OSM, o ne kaip "
            "gerai ji aprūpinta — pagal juos sudarytas reitingas klaidintų "
            "(kodėl, paaiškinta "
            '<a href="{up}methods-lt.html">metoduose</a>). Sąžiningai '
            "palyginti galima pokytį: kur pastaruoju metu buvo atsakyta į "
            "klausimą apie patalpą — kurioje patalpoje yra pervystymo "
            "stalas. Būtent tai šis puslapis ir skaičiuoja — vietų, kuriose "
            "atsakyta į klausimą apie patalpą, dalį, ir kas ją pastaruoju "
            "metu labiausiai padidino.</p>\n"),
        "intro2": (
            "<p>Kiekvienas atsakymas yra svarbus, net ir „tik moterų "
            "tualete“ — žemėlapis gyvuoja iš sąžiningų atsakymų, o ne iš "
            "žalių smeigtukų. Atsakyti gali vietoje, per mažiau nei "
            'minutę: bakstelėk pilką smeigtuką <a href="{up}">žemėlapyje'
            "</a> ir sek MapComplete nuorodą. "
            '<a href="{up}methods-lt.html#contribute">Žingsnis po '
            "žingsnio</a>.</p>\n"),
        "fresh": ("<p>Duomenų rinkimas prasidėjo {date}. Kai tik atsiras "
                  "palyginimo taškas, čia bus matyti, kas pajudėjo.</p>\n"),
        "quiet": ("<p>Nuo {base} niekur nieko nepasikeitė. Pilki smeigtukai "
                  "laukia.</p>\n"),
        "cities_h2": "Miestai",
        "cities_note": ("<p>{n} dideli miestai, surikiuoti pagal atsakytos "
                        "dalies pokytį. Berlynas, Hamburgas ir Brėmenas "
                        "taip pat matomi žemiau tarp žemių — čia "
                        "skaičiuojamas miestas.</p>\n"),
        "regions_h2": "Vokietijos žemės ir Danija",
        "regions_note": ("<p>Tas pats skaičiavimas — {n} Bundesländer ir "
                         "Danija kaip visa šalis.</p>\n"),
        "regions_h2_regions": ("Vokietijos žemės, Prancūzijos regionai ir "
                               "ištisos šalys"),
        "regions_note_regions": "<p>Tas pats skaičiavimas — {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} Prancūzijos regionai",
        "cl_country_one": "{names} kaip visa šalis",
        "cl_country_many": "{c} ištisos šalys ({names})",
        "and_sep": " ir ",
        "regions_h2_many": "Vokietijos žemės ir ištisos šalys",
        "regions_note_many": ("<p>Tas pats skaičiavimas — {n} Bundesländer "
                              "ir {c} ištisos šalys: {names}.</p>\n"),
        "regions_h2_one": "Vokietijos žemės ir viena ištisa šalis",
        "regions_note_one": ("<p>Tas pats skaičiavimas — {n} Bundesländer "
                             "ir {names} kaip visa šalis.</p>\n"),
        "regions_h2_lands": "Vokietijos žemės",
        "regions_note_lands": ("<p>Tas pats skaičiavimas — {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Miestas", "col_name_region": "Regionas",
        "col_delta": "Δ punktai", "col_share": "atsakyta",
        "col_total": "vietos", "col_acc": "+ pasiekiama", "col_new": "+ vietos",
        "sort_hint": ("Bakstelėk stulpelio antraštę, kad pagal ją "
                      "surikiuotum — bakstelėk dar kartą, kad apverstum "
                      "tvarką."),
        "footer": ("""\
<h2>Duomenys ir licencija</h2>
<p class="muted">Visi duomenys &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, pagal <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a> licenciją. Šis
puslapis kas naktį perkuriamas iš Overpass užklausos ir apie tave nesaugo nieko.
Kaip skaičiuojama ir spalvinama: <a href="{up}methods-lt.html">Metodai</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap yra nemokamas ir be reklamos.
<a href="https://ko-fi.com/jakubwaller">&#9749; Pavaišink mane kava</a>.</p>
"""),
    },
    "hu": {
        "lang_name": "Magyar",
        "file": "leaderboard-hu.html",
        "months": ("január", "február", "március", "április", "május", "június",
                   "július", "augusztus", "szeptember", "október", "november",
                   "december"),
        "date_fmt": "{y}. {m} {d}.",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Vissza a térképhez",
        "title": "PapaMap-ranglista",
        "desc": ("Hol válaszoltak mostanában arra a kérdésre, hogy melyik "
                 "helyiségben van a pelenkázóasztal? Változás "
                 "százalékpontban, minden éjjel újraépítve az "
                 "OpenStreetMapból."),
        "h1": "A ranglista",
        "stand": "Állapot: {date} · Adatok az OpenStreetMapből",
        "stand_base": ("Állapot: {date} · Változás {base} óta · "
                       "Adatok az OpenStreetMapből"),
        "intro1": (
            "<p>Hogy melyik városban van a legtöbb pelenkázóasztal, az "
            "szándékosan nem szerepel ezen az oldalon. A nyers számok "
            "főleg azt mérik, mennyire alaposan térképezték fel az adott "
            "helyet, nem pedig azt, hogy mennyire jól el van látva — egy "
            "ebből készült rangsor félrevezetne (hogy miért, azt a "
            '<a href="{up}methods-hu.html">Módszertan</a> oldal '
            "elmagyarázza). Amit becsületesen lehet összehasonlítani, az a "
            "változás: hol válaszolták meg mostanában, hogy melyik "
            "helyiségben van a pelenkázóasztal. Pontosan ezt számolja ez "
            "az oldal — azoknak a helyeknek az arányát, ahol "
            "megválaszolták a helyiség kérdését, és hogy ki növelte ezt "
            "legutóbb a legnagyobb mértékben.</p>\n"),
        "intro2": (
            "<p>Minden válasz számít, akár az is, hogy „csak a női "
            "mosdóban” — a térkép őszinte válaszokból él, nem zöld "
            "jelölőkből. A válaszadás a helyszínen egy percnél is "
            'kevesebb ideig tart: koppints egy szürke jelölőre a '
            '<a href="{up}">térképen</a>, és kövesd a MapComplete-linket. '
            '<a href="{up}methods-hu.html#contribute">Lépésről lépésre</a>.</p>\n'),
        "fresh": ("<p>A rögzítés kezdete: {date}. Amint lesz egy "
                  "összehasonlítási időpont, ez az oldal megmutatja, ki "
                  "mozdult.</p>\n"),
        "quiet": ("<p>{base} óta semmi nem mozdult sehol. A szürke "
                  "jelölők várnak.</p>\n"),
        "cities_h2": "Városok",
        "cities_note": ("<p>{n} nagyváros, a megválaszolt arány változása "
                        "szerint rendezve. Berlin, Hamburg és Bremen is "
                        "szerepel lent a tartományoknál — itt viszont a "
                        "város számít.</p>\n"),
        "regions_h2": "Német tartományok és Dánia",
        "regions_note": ("<p>Ugyanaz a számítás a {n} Bundesländer és "
                         "Dánia egésze esetén.</p>\n"),
        "regions_h2_regions": "Német tartományok, francia régiók és egész országok",
        "regions_note_regions": "<p>Ugyanaz a számítás {list} esetén.</p>\n",
        "cl_lands": "a {n} Bundesländer",
        "cl_regions": "a {r} francia régió",
        "cl_country_one": "{names} egésze",
        "cl_country_many": "{c} ország egésze ({names})",
        "and_sep": " és ",
        "regions_h2_many": "Német tartományok és egész országok",
        "regions_note_many": ("<p>Ugyanaz a számítás a {n} Bundesländer "
                              "esetén, valamint {c} ország egésze esetén: "
                              "{names}.</p>\n"),
        "regions_h2_one": "Német tartományok és egy egész ország",
        "regions_note_one": ("<p>Ugyanaz a számítás a {n} Bundesländer "
                             "esetén, valamint {names} egésze esetén.</p>\n"),
        "regions_h2_lands": "Német tartományok",
        "regions_note_lands": ("<p>Ugyanaz a számítás a {n} Bundesländer "
                               "esetén.</p>\n"),
        "col_name_city": "Város", "col_name_region": "Régió",
        "col_delta": "Δ pont", "col_share": "megválaszolva",
        "col_total": "hely", "col_acc": "+ elérhető", "col_new": "+ hely",
        "sort_hint": ("Koppints egy oszlopfejlécre, hogy aszerint rendezz "
                      "— koppints újra az irány megfordításához."),
        "footer": ("""\
<h2>Adatok és licenc</h2>
<p class="muted">Minden adat &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
közreműködők</a>, az <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a> licenc alatt. Ez
az oldal minden éjjel újraépül egy Overpass-lekérdezésből, és semmit sem tárol rólad.
Hogyan számolunk és színezünk: <a href="{up}methods-hu.html">Módszertan</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">A PapaMap ingyenes és reklámmentes.
<a href="https://ko-fi.com/jakubwaller">&#9749; Hívj meg egy kávéra</a>.</p>
"""),
    },
    "no": {
        "lang_name": "Norsk",
        "file": "leaderboard-no.html",
        "months": ("januar", "februar", "mars", "april", "mai", "juni", "juli",
                   "august", "september", "oktober", "november", "desember"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Tilbake til kartet",
        "title": "PapaMap — toppliste",
        "desc": ("Hvor ble romspørsmålet — hvilket rom stellebordet står i? "
                 "— besvart sist? Endring i prosentpoeng, bygget på nytt "
                 "hver natt fra OpenStreetMap."),
        "h1": "Topplisten",
        "stand": "Per {date} · Data fra OpenStreetMap",
        "stand_base": ("Per {date} · Endring siden {base} · "
                       "Data fra OpenStreetMap"),
        "intro1": (
            "<p>Hvilken by som har flest stellebord, står bevisst ikke på "
            "denne siden. Absolutte tall måler stort sett hvor grundig et "
            "sted er kartlagt, ikke hvor godt det er utstyrt — en rangering "
            "av dem ville villede (<a href=\"{up}methods-no.html\">"
            "metodesiden</a> forklarer hvorfor). Det som ærlig kan "
            "sammenlignes, er endring: hvor romspørsmålet — hvilket rom "
            "stellebordet står i? — sist ble besvart. Det er det denne "
            "siden teller — andelen steder med besvart romspørsmål, og hvem "
            "som har løftet den mest.</p>\n"),
        "intro2": (
            "<p>Hvert svar teller, også «bare dametoalett» — kartet lever "
            "av ærlige svar, ikke av grønne nåler. Å svare tar under et "
            "minutt på stedet: trykk på en grå nål på <a href=\"{up}\">"
            "kartet</a> og følg MapComplete-lenken. "
            "<a href=\"{up}methods-no.html#contribute\">Steg for steg</a>."
            "</p>\n"),
        "fresh": ("<p>Registreringen startet {date}. Så snart det finnes et "
                  "sammenligningspunkt, viser denne siden hvem som har "
                  "beveget seg.</p>\n"),
        "quiet": ("<p>Ingenting har beveget seg noe sted siden {base}. De "
                  "grå nålene venter.</p>\n"),
        "cities_h2": "Byer",
        "cities_note": ("<p>{n} store byer, sortert etter endringen i sin "
                        "besvarte andel. Berlin, Hamburg og Bremen dukker "
                        "også opp under delstatene nedenfor — her er det "
                        "byen som teller.</p>\n"),
        "regions_h2": "Tyske delstater og Danmark",
        "regions_note": ("<p>Samme regnestykke for de {n} Bundesländer og "
                         "Danmark som helhet.</p>\n"),
        "regions_h2_regions": "Tyske delstater, franske régions og hele land",
        "regions_note_regions": "<p>Samme regnestykke for {list}.</p>\n",
        "cl_lands": "de {n} Bundesländer",
        "cl_regions": "de {r} franske régions",
        "cl_country_one": "{names} som helhet",
        "cl_country_many": "{c} land som helhet ({names})",
        "and_sep": " og ",
        "regions_h2_many": "Tyske delstater og hele land",
        "regions_note_many": ("<p>Samme regnestykke for de {n} Bundesländer "
                              "og for {c} land som helhet: {names}.</p>\n"),
        "regions_h2_one": "Tyske delstater og ett helt land",
        "regions_note_one": ("<p>Samme regnestykke for de {n} Bundesländer "
                             "og for {names} som helhet.</p>\n"),
        "regions_h2_lands": "Tyske delstater",
        "regions_note_lands": ("<p>Samme regnestykke for de {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "By", "col_name_region": "Region",
        "col_delta": "Δ poeng", "col_share": "besvart",
        "col_total": "steder", "col_acc": "+ nåbare", "col_new": "+ steder",
        "sort_hint": ("Trykk på en kolonneoverskrift for å sortere etter "
                      "den — trykk igjen for å snu rekkefølgen."),
        "footer": ("""\
<h2>Data &amp; lisens</h2>
<p class="muted">Alle data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, under <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Denne
siden bygges på nytt hver natt fra en Overpass-spørring og lagrer ingenting om deg.
Slik telles og fargelegges det: <a href="{up}methods-no.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap er gratis og reklamefritt.
<a href="https://ko-fi.com/jakubwaller">&#9749; Spander en kaffe på meg</a>.</p>
"""),
    },
    "pt": {
        "lang_name": "Português",
        "file": "leaderboard-pt.html",
        "months": ("janeiro", "fevereiro", "março", "abril", "maio", "junho",
                   "julho", "agosto", "setembro", "outubro", "novembro",
                   "dezembro"),
        "date_fmt": "{d} de {m} de {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Voltar ao mapa",
        "title": "PapaMap — Classificação dos fraldários",
        "desc": ("Onde é que a pergunta sobre a sala — em que sala está o "
                 "fraldário? — foi respondida ultimamente? Variação em "
                 "pontos percentuais, recalculada todas as noites a partir "
                 "do OpenStreetMap."),
        "h1": "A classificação",
        "stand": "Atualizado a {date} · Dados do OpenStreetMap",
        "stand_base": ("Atualizado a {date} · Variação desde {base} · "
                       "Dados do OpenStreetMap"),
        "intro1": (
            "<p>Que cidade tem mais fraldários não está aqui de propósito. "
            "Números absolutos medem sobretudo o quão bem um local foi "
            "mapeado, não o quão bem está equipado — uma classificação a "
            "partir deles seria enganadora (a "
            '<a href="{up}methods-pt.html">página de métodos</a> explica '
            "porquê). O que se pode comparar com honestidade é a variação: "
            "onde a pergunta sobre a sala — em que sala está o fraldário? — "
            "foi respondida ultimamente. É isso que esta página conta — a "
            "fração de locais com a pergunta da sala respondida, e quem "
            "mais a fez subir.</p>\n"),
        "intro2": (
            "<p>Toda a resposta conta, incluindo «só WC feminino» — o mapa "
            "vive de respostas honestas, não de pins verdes. Responder "
            "demora menos de um minuto no local: toca num pin cinzento no "
            '<a href="{up}">mapa</a> e segue a ligação do MapComplete. '
            '<a href="{up}methods-pt.html#contribute">Passo a passo</a>.</p>\n'),
        "fresh": ("<p>O registo começou a {date}. Assim que houver um ponto "
                  "de comparação, esta página mostra quem se mexeu.</p>\n"),
        "quiet": ("<p>Desde {base}, nada se mexeu em lado nenhum. Os pins "
                  "cinzentos esperam.</p>\n"),
        "cities_h2": "Cidades",
        "cities_note": ("<p>{n} grandes cidades, ordenadas pela variação da "
                        "sua fração respondida. Berlim, Hamburgo e Bremen "
                        "também aparecem em baixo, nos estados — aqui é a "
                        "cidade que conta.</p>\n"),
        "regions_h2": "Bundesländer e Dinamarca",
        "regions_note": ("<p>A mesma conta para os {n} Bundesländer e para "
                         "a Dinamarca como um todo.</p>\n"),
        "regions_h2_regions": "Bundesländer, régions francesas e países inteiros",
        "regions_note_regions": "<p>A mesma conta para {list}.</p>\n",
        "cl_lands": "os {n} Bundesländer",
        "cl_regions": "as {r} régions francesas",
        "cl_country_one": "{names} como um todo",
        "cl_country_many": "{c} países como um todo ({names})",
        "and_sep": " e ",
        "regions_h2_many": "Bundesländer e países inteiros",
        "regions_note_many": ("<p>A mesma conta para os {n} Bundesländer e "
                              "para {c} países como um todo: {names}.</p>\n"),
        "regions_h2_one": "Bundesländer e um país inteiro",
        "regions_note_one": ("<p>A mesma conta para os {n} Bundesländer e "
                             "para {names} como um todo.</p>\n"),
        "regions_h2_lands": "Bundesländer",
        "regions_note_lands": ("<p>A mesma conta para os {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Cidade", "col_name_region": "Região",
        "col_delta": "Δ pontos", "col_share": "respondido",
        "col_total": "locais", "col_acc": "+ acessível", "col_new": "+ locais",
        "sort_hint": ("Toca no cabeçalho de uma coluna para ordenar por "
                      "ela — toca outra vez para inverter."),
        "footer": ("""\
<h2>Dados e licença</h2>
<p class="muted">Todos os dados &copy; <a href="https://www.openstreetmap.org/copyright">colaboradores
do OpenStreetMap</a>, sob a <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Esta
página é gerada de novo todas as noites a partir de uma consulta Overpass e não guarda nada sobre ti.
Como se conta e colore: <a href="{up}methods-pt.html">Métodos</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">O PapaMap é gratuito e sem anúncios.
<a href="https://ko-fi.com/jakubwaller">&#9749; Oferece-me um café</a>.</p>
"""),
    },
    "ro": {
        "lang_name": "Română",
        "file": "leaderboard-ro.html",
        "months": ("ianuarie", "februarie", "martie", "aprilie", "mai",
                   "iunie", "iulie", "august", "septembrie", "octombrie",
                   "noiembrie", "decembrie"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Înapoi la hartă",
        "title": "Clasamentul meselor de înfășat — PapaMap",
        "desc": ("Unde s-a răspuns de curând la întrebarea despre încăpere "
                 "— în ce încăpere este masa de înfășat? Schimbare în "
                 "puncte procentuale, reconstruit în fiecare noapte din "
                 "OpenStreetMap."),
        "h1": "Clasamentul",
        "stand": "Stare la {date} · Date din OpenStreetMap",
        "stand_base": ("Stare la {date} · Schimbare de la {base} · "
                       "Date din OpenStreetMap"),
        "intro1": (
            "<p>Care oraș are cele mai multe mese de înfășat este, în mod "
            "intenționat, absent de pe această pagină. Numerele absolute "
            "măsoară mai ales cât de temeinic a fost cartografiat un loc, "
            "nu cât de bine este dotat — un clasament din ele ar induce în "
            'eroare (<a href="{up}methods-ro.html">pagina de metode</a> '
            "explică de ce). Ce se poate compara cinstit este schimbarea: "
            "unde s-a răspuns de curând la întrebarea despre încăpere — în "
            "ce încăpere este masa de înfășat? Asta numără această pagină "
            "— proporția locurilor cu întrebarea despre încăpere "
            "răspunsă, și cine a crescut-o cel mai mult.</p>\n"),
        "intro2": (
            "<p>Fiecare răspuns contează, inclusiv „doar toaleta "
            "femeilor” — harta trăiește din răspunsuri cinstite, nu din "
            "marcaje verzi. Poți răspunde la întrebare chiar la fața "
            'locului, în mai puțin de un minut: atinge un marcaj gri pe '
            '<a href="{up}">hartă</a> și urmează linkul către '
            'MapComplete. <a href="{up}methods-ro.html#contribute">Pas cu '
            "pas</a>.</p>\n"),
        "fresh": ("<p>Înregistrarea a început la {date}. De îndată ce "
                  "apare un punct de comparație, această pagină va arăta "
                  "cine a avansat.</p>\n"),
        "quiet": ("<p>Nimic nu s-a schimbat nicăieri de la {base}. "
                  "Marcajele gri așteaptă.</p>\n"),
        "cities_h2": "Orașe",
        "cities_note": ("<p>{n} de orașe mari, sortate după schimbarea "
                        "proporției răspunsurilor. Berlin, Hamburg și "
                        "Bremen apar și mai jos, la landuri — aici "
                        "contează orașul.</p>\n"),
        "regions_h2": "Landurile germane și Danemarca",
        "regions_note": ("<p>Același calcul pentru cele {n} Bundesländer "
                         "și pentru Danemarca ca întreg.</p>\n"),
        "regions_h2_regions": "Landurile germane, régions franceze și țări întregi",
        "regions_note_regions": "<p>Același calcul pentru {list}.</p>\n",
        "cl_lands": "cele {n} Bundesländer",
        "cl_regions": "cele {r} régions franceze",
        "cl_country_one": "{names} ca întreg",
        "cl_country_many": "{c} de țări ca întreg ({names})",
        "and_sep": " și ",
        "regions_h2_many": "Landurile germane și țări întregi",
        "regions_note_many": ("<p>Același calcul pentru cele {n} "
                              "Bundesländer și pentru {c} de țări ca întreg: "
                              "{names}.</p>\n"),
        "regions_h2_one": "Landurile germane și o țară întreagă",
        "regions_note_one": ("<p>Același calcul pentru cele {n} "
                             "Bundesländer și pentru {names} ca "
                             "întreg.</p>\n"),
        "regions_h2_lands": "Landurile germane",
        "regions_note_lands": ("<p>Același calcul pentru cele {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Oraș", "col_name_region": "Regiune",
        "col_delta": "Δ puncte", "col_share": "răspuns",
        "col_total": "locuri", "col_acc": "+ accesibile", "col_new": "+ locuri",
        "sort_hint": ("Atinge un antet de coloană pentru a sorta după el "
                      "— atinge din nou ca să inversezi direcția."),
        "footer": ("""\
<h2>Date &amp; licență</h2>
<p class="muted">Toate datele &copy; <a href="https://www.openstreetmap.org/copyright">contribuitorii
OpenStreetMap</a>, sub <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Această
pagină este regenerată în fiecare noapte dintr-o interogare Overpass și nu stochează nimic despre tine.
Cum se numără și se colorează: <a href="{up}methods-ro.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap este gratuit și fără reclame.
<a href="https://ko-fi.com/jakubwaller">&#9749; Oferă-mi o cafea</a>.</p>
"""),
    },
    "sq": {
        "lang_name": "Shqip",
        "file": "leaderboard-sq.html",
        "months": ("janar", "shkurt", "mars", "prill", "maj", "qershor", "korrik",
                   "gusht", "shtator", "tetor", "nëntor", "dhjetor"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Kthehu te harta",
        "title": "PapaMap — Renditja",
        "desc": ("Ku mori përgjigje kohët e fundit pyetja e dhomës — në cilën "
                 "dhomë ndodhet tavolina e ndërrimit? Ndryshimi në pikë "
                 "përqindjeje, rindërtuar çdo natë nga OpenStreetMap."),
        "h1": "Renditja",
        "stand": "Më {date} · Të dhëna nga OpenStreetMap",
        "stand_base": ("Më {date} · Ndryshimi që nga {base} · "
                       "Të dhëna nga OpenStreetMap"),
        "intro1": (
            "<p>Cili qytet ka më shumë tavolina ndërrimi qëllimisht nuk "
            "gjendet në këtë faqe. Numrat absolutë matin kryesisht sa thellë "
            "është hartëzuar një vend, jo sa mirë është i pajisur — një "
            "renditje e tillë do të mashtronte (<a "
            'href="{up}methods-sq.html">faqja e metodologjisë</a> shpjegon '
            "pse). Ajo që krahasohet me ndershmëri është ndryshimi: ku "
            "pyetja e dhomës — në cilën dhomë ndodhet tavolina e ndërrimit? "
            "— mori përgjigje kohët e fundit. Pikërisht këtë numëron kjo "
            "faqe — pjesën e vendeve ku pyetja e dhomës ka marrë përgjigje, "
            "dhe kush e ka rritur atë më shumë së fundmi.</p>\n"),
        "intro2": (
            "<p>Çdo përgjigje ka vlerë, edhe „vetëm tualeti i grave” — harta "
            "jeton nga përgjigje të ndershme, jo nga shenjues të gjelbër. Të "
            "përgjigjesh zgjat më pak se një minutë, aty për aty: prek një "
            'shenjues gri në <a href="{up}">hartë</a> dhe ndiq lidhjen për '
            'MapComplete. <a href="{up}methods-sq.html#contribute">Hap pas '
            "hapi</a>.</p>\n"),
        "fresh": ("<p>Regjistrimi filloi më {date}. Sapo të ketë një pikë "
                  "krahasimi, kjo faqe do të tregojë kush ka lëvizur.</p>\n"),
        "quiet": ("<p>Që nga {base} nuk ka lëvizur asgjë askund. Shenjuesit "
                  "gri presin.</p>\n"),
        "cities_h2": "Qytetet",
        "cities_note": ("<p>{n} qytete të mëdha, renditur sipas ndryshimit "
                        "të pjesës së përgjigjur. Berlini, Hamburgu dhe "
                        "Bremeni shfaqen edhe poshtë te shtetet federale "
                        "gjermane — këtu numërohet qyteti.</p>\n"),
        "regions_h2": "Shtetet federale gjermane dhe Danimarka",
        "regions_note": ("<p>E njëjta llogaritje për {n} Bundesländer dhe "
                         "Danimarkën si e tërë.</p>\n"),
        "regions_h2_regions": ("Shtetet federale gjermane, régions franceze "
                               "dhe vende të tëra"),
        "regions_note_regions": "<p>E njëjta llogaritje për {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} régions franceze",
        "cl_country_one": "{names} si e tërë",
        "cl_country_many": "{c} vende si e tërë ({names})",
        "and_sep": " dhe ",
        "regions_h2_many": "Shtetet federale gjermane dhe vende të tëra",
        "regions_note_many": ("<p>E njëjta llogaritje për {n} Bundesländer "
                              "dhe për {c} vende si e tërë: {names}.</p>\n"),
        "regions_h2_one": "Shtetet federale gjermane dhe një vend i tërë",
        "regions_note_one": ("<p>E njëjta llogaritje për {n} Bundesländer "
                             "dhe për {names} si e tërë.</p>\n"),
        "regions_h2_lands": "Shtetet federale gjermane",
        "regions_note_lands": ("<p>E njëjta llogaritje për {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Qyteti", "col_name_region": "Rajoni",
        "col_delta": "Δ pika", "col_share": "e përgjigjur",
        "col_total": "vende", "col_acc": "+ e arritshme", "col_new": "+ vende",
        "sort_hint": ("Prek titullin e një kolone për ta renditur sipas tij "
                      "— prek përsëri për të kthyer drejtimin."),
        "footer": ("""\
<h2>Të dhënat &amp; licenca</h2>
<p class="muted">Të gjitha të dhënat &copy; <a href="https://www.openstreetmap.org/copyright">kontribuesit
e OpenStreetMap</a>, sipas <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Kjo
faqe rindërtohet çdo natë nga një kërkim Overpass dhe nuk ruan asgjë për ty.
Si numërohet dhe ngjyroset: <a href="{up}methods-sq.html">Metodologjia</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap është falas dhe pa reklama.
<a href="https://ko-fi.com/jakubwaller">&#9749; Blimë një kafe</a>.</p>
"""),
    },
    "sk": {
        "lang_name": "Slovenčina",
        "file": "leaderboard-sk.html",
        "months": ("januára", "februára", "marca", "apríla", "mája", "júna",
                   "júla", "augusta", "septembra", "októbra", "novembra",
                   "decembra"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Späť na mapu",
        "title": "PapaMap — rebríček prebaľovacích pultov",
        "desc": ("Kde sa naposledy zodpovedala otázka o miestnosti — v "
                 "ktorej miestnosti je prebaľovací pult? Zmena v "
                 "percentuálnych bodoch, každú noc znova vypočítaná z "
                 "OpenStreetMap."),
        "h1": "Rebríček",
        "stand": "Stav k {date} · Dáta z OpenStreetMap",
        "stand_base": ("Stav k {date} · Zmena od {base} · "
                       "Dáta z OpenStreetMap"),
        "intro1": (
            "<p>Ktoré mesto má najviac prebaľovacích pultov, tu zámerne "
            "nenájdeš. Absolútne počty merajú hlavne to, ako dôkladne je "
            "dané miesto zmapované, nie ako dobre je vybavené — rebríček z "
            "toho by bol zavádzajúci (vysvetľuje to "
            '<a href="{up}methods-sk.html">stránka o metódach</a>). Čestne '
            "sa dá porovnať zmena: kde sa v poslednom čase zodpovedala "
            "otázka o miestnosti — v ktorej miestnosti je prebaľovací "
            "pult? Presne to táto stránka počíta — podiel miest so "
            "zodpovedanou otázkou o miestnosti a kto ho zvýšil "
            "najviac.</p>\n"),
        "intro2": (
            "<p>Počíta sa každá odpoveď, aj „len dámske WC“ — mapa žije z "
            "úprimných odpovedí, nie zo zelených špendlíkov. Odpovedať "
            'môžeš priamo na mieste za menej ako minútu: ťukni na sivý '
            'špendlík na <a href="{up}">mape</a> a nasleduj jeho odkaz na '
            'MapComplete. <a href="{up}methods-sk.html#contribute">Krok za '
            "krokom</a>.</p>\n"),
        "fresh": ("<p>Záznam sa začal {date}. Hneď ako bude k dispozícii "
                  "porovnávací bod, ukáže sa tu, kto sa pohol.</p>\n"),
        "quiet": ("<p>Od {base} sa nikde nič nepohlo. Sivé špendlíky "
                  "čakajú.</p>\n"),
        "cities_h2": "Mestá",
        "cities_note": ("<p>{n} veľkých miest, zoradených podľa zmeny "
                        "podielu zodpovedaných otázok. Berlín, Hamburg a "
                        "Brémy sa objavujú aj nižšie pri spolkových "
                        "krajinách — tu sa počíta mesto.</p>\n"),
        "regions_h2": "Nemecké spolkové krajiny a Dánsko",
        "regions_note": ("<p>Rovnaký výpočet pre {n} Bundesländer a pre "
                         "Dánsko ako celok.</p>\n"),
        "regions_h2_regions": ("Nemecké spolkové krajiny, francúzske "
                               "regióny a celé krajiny"),
        "regions_note_regions": "<p>Rovnaký výpočet pre {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} francúzskych regiónov",
        "cl_country_one": "{names} ako celok",
        "cl_country_many": "{c} krajín ako celok ({names})",
        "and_sep": " a ",
        "regions_h2_many": "Nemecké spolkové krajiny a celé krajiny",
        "regions_note_many": ("<p>Rovnaký výpočet pre {n} Bundesländer a "
                              "pre {c} krajín ako celok: {names}.</p>\n"),
        "regions_h2_one": "Nemecké spolkové krajiny a jedna celá krajina",
        "regions_note_one": ("<p>Rovnaký výpočet pre {n} Bundesländer a "
                             "pre {names} ako celok.</p>\n"),
        "regions_h2_lands": "Nemecké spolkové krajiny",
        "regions_note_lands": ("<p>Rovnaký výpočet pre {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Mesto", "col_name_region": "Región",
        "col_delta": "Δ body", "col_share": "zodpovedané",
        "col_total": "miesta", "col_acc": "+ dostupné", "col_new": "+ miesta",
        "sort_hint": ("Ťukni na záhlavie stĺpca a zoradíš podľa neho — "
                      "druhým ťuknutím obrátiš smer."),
        "footer": ("""\
<h2>Dáta a licencia</h2>
<p class="muted">Všetky dáta &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, pod licenciou <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Táto
stránka sa každú noc znova vygeneruje z dopytu na Overpass a neukladá o tebe nič.
Ako sa počíta a farbí: <a href="{up}methods-sk.html">Metódy</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap je zadarmo a bez reklám.
<a href="https://ko-fi.com/jakubwaller">&#9749; Pozvi ma na kávu</a>.</p>
"""),
    },
    "sl": {
        "lang_name": "Slovenščina",
        "file": "leaderboard-sl.html",
        "months": ("januarja", "februarja", "marca", "aprila", "maja", "junija",
                   "julija", "avgusta", "septembra", "oktobra", "novembra",
                   "decembra"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Nazaj na zemljevid",
        "title": "Lestvica previjalnih miz — PapaMap",
        "desc": ("Kje je bilo v zadnjem času odgovorjeno na vprašanje o "
                 "prostoru — v katerem prostoru je previjalna miza? "
                 "Sprememba v odstotnih točkah, vsako noč znova iz "
                 "OpenStreetMap."),
        "h1": "Lestvica",
        "stand": "Stanje na dan {date} · Podatki iz OpenStreetMap",
        "stand_base": ("Stanje na dan {date} · Sprememba od {base} · "
                       "Podatki iz OpenStreetMap"),
        "intro1": (
            "<p>Katero mesto ima največ previjalnih miz, na tej strani "
            "namerno ne piše. Absolutna števila predvsem merijo, kako "
            "temeljito je bil kraj kartiran, ne kako dobro je opremljen — "
            "lestvica iz tega bi zavajala (razlog je pojasnjen na "
            '<a href="{up}methods-sl.html">strani o metodah</a>). Pošteno je '
            "mogoče primerjati spremembo: kje je bilo v zadnjem času "
            "odgovorjeno na vprašanje o prostoru — v katerem prostoru je "
            "previjalna miza. Prav to šteje ta stran — delež krajev z "
            "odgovorjenim vprašanjem o prostoru in kdo ga je nazadnje "
            "najbolj povečal.</p>\n"),
        "intro2": (
            "<p>Šteje vsak odgovor, tudi &bdquo;samo v ženskem "
            "stranišču&ldquo; — zemljevid poganjajo pošteni odgovori, ne "
            "zelene bucke. Odgovoriti je mogoče na kraju samem v manj kot "
            'minuti: tapni sivo bucko na <a href="{up}">zemljevidu</a> in '
            'sledi njeni povezavi MapComplete. '
            '<a href="{up}methods-sl.html#contribute">Korak za korakom</a>.'
            '</p>\n'),
        "fresh": ("<p>Beleženje se je začelo {date}. Takoj ko bo na voljo "
                  "primerjalna točka, bo tu pisalo, kdo se je premaknil.</p>\n"),
        "quiet": ("<p>Od {base} se nikjer ni nič premaknilo. Sive bucke "
                  "čakajo.</p>\n"),
        "cities_h2": "Mesta",
        "cities_note": ("<p>{n} velikih mest, razvrščenih po spremembi "
                        "njihovega odgovorjenega deleža. Berlin, Hamburg in "
                        "Bremen se pojavijo tudi spodaj pri deželah — tu "
                        "šteje mesto.</p>\n"),
        "regions_h2": "Nemške dežele in Danska",
        "regions_note": ("<p>Enak izračun za {n} Bundesländer in Dansko kot "
                         "celoto.</p>\n"),
        "regions_h2_regions": "Nemške dežele, francoske regije in cele države",
        "regions_note_regions": "<p>Enak izračun za {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} francoskih regij",
        "cl_country_one": "{names} v celoti",
        "cl_country_many": "{c} držav v celoti ({names})",
        "and_sep": " in ",
        "regions_h2_many": "Nemške dežele in cele države",
        "regions_note_many": ("<p>Enak izračun za {n} Bundesländer in za {c} "
                              "držav v celoti: {names}.</p>\n"),
        "regions_h2_one": "Nemške dežele in ena cela država",
        "regions_note_one": ("<p>Enak izračun za {n} Bundesländer in za "
                             "{names} v celoti.</p>\n"),
        "regions_h2_lands": "Nemške dežele",
        "regions_note_lands": ("<p>Enak izračun za {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Mesto", "col_name_region": "Regija",
        "col_delta": "Δ točke", "col_share": "odgovorjeno",
        "col_total": "kraji", "col_acc": "+ dostopno", "col_new": "+ kraji",
        "sort_hint": ("Tapni glavo stolpca, da razvrstiš po njem — tapni še "
                      "enkrat za obratni vrstni red."),
        "footer": ("""\
<h2>Podatki in licenca</h2>
<p class="muted">Vsi podatki &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, pod licenco <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ta
stran se vsako noč znova zgradi iz poizvedbe Overpass in o tebi ne shranjuje ničesar.
Kako se šteje in barva: <a href="{up}methods-sl.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap je brezplačen in brez oglasov.
<a href="https://ko-fi.com/jakubwaller">&#9749; Povabi me na kavo</a>.</p>
"""),
    },
    "fi": {
        "lang_name": "Suomi",
        "file": "leaderboard-fi.html",
        "months": ("tammikuuta", "helmikuuta", "maaliskuuta", "huhtikuuta",
                   "toukokuuta", "kesäkuuta", "heinäkuuta", "elokuuta",
                   "syyskuuta", "lokakuuta", "marraskuuta", "joulukuuta"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Takaisin kartalle",
        "title": "PapaMap — Hoitopöytien kärkisijat",
        "desc": ("Missä on viimeksi vastattu kysymykseen, missä huoneessa "
                 "hoitopöytä on? Muutos prosenttiyksikköinä, päivittyy joka "
                 "yö OpenStreetMapista."),
        "h1": "Kärkisijat",
        "stand": "Tilanne {date} · Tiedot OpenStreetMapista",
        "stand_base": ("Tilanne {date} · Muutos {base} lähtien · "
                       "Tiedot OpenStreetMapista"),
        "intro1": (
            "<p>Missä kaupungissa on eniten hoitopöytiä, ei kerrota tällä "
            "sivulla — se on tarkoituksellista. Kokonaismäärät kertovat "
            "lähinnä, miten tarkasti jokin paikka on kartoitettu, ei sitä, "
            "miten hyvin se on varustettu — niiden pohjalta tehty ranking "
            "johtaisi harhaan (<a href=\"{up}methods-fi.html\">Menetelmät</a>"
            "-sivu kertoo miksi). Rehellisesti voi verrata vain muutosta: "
            "missä on viimeksi vastattu kysymykseen, missä huoneessa "
            "hoitopöytä on. Juuri sitä tämä sivu laskee — kuinka suuressa "
            "osassa paikkoja tilakysymykseen on vastattu, ja kuka on "
            "nostanut sitä osuutta viimeksi eniten.</p>\n"),
        "intro2": (
            "<p>Jokainen vastaus lasketaan, myös ”vain naisten WC:ssä” — "
            "kartta elää rehellisistä vastauksista, ei vihreistä nastoista. "
            "Vastaaminen vie paikan päällä alle minuutin: napauta harmaata "
            "nastaa <a href=\"{up}\">kartalla</a> ja seuraa sen "
            "MapComplete-linkkiä. <a href=\"{up}methods-fi.html#contribute\">"
            "Vaihe vaiheelta</a>.</p>\n"),
        "fresh": ("<p>Seuranta alkoi {date}. Heti kun vertailukohta on "
                  "olemassa, tällä sivulla näkyy, kuka on liikkunut.</p>\n"),
        "quiet": ("<p>{base} lähtien mikään ei ole liikkunut missään. "
                  "Harmaat nastat odottavat.</p>\n"),
        "cities_h2": "Kaupungit",
        "cities_note": ("<p>{n} suurta kaupunkia, järjestetty vastatun "
                        "osuuden muutoksen mukaan. Berliini, Hampuri ja "
                        "Bremen näkyvät myös alempana osavaltioiden "
                        "joukossa — täällä lasketaan kaupunki.</p>\n"),
        "regions_h2": "Saksan osavaltiot ja Tanska",
        "regions_note": ("<p>Sama laskutapa: {n} Bundesländer ja Tanska "
                         "kokonaisuutena.</p>\n"),
        "regions_h2_regions": "Saksan osavaltiot, Ranskan régions ja kokonaiset maat",
        "regions_note_regions": "<p>Sama laskutapa: {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} Ranskan régions",
        "cl_country_one": "{names} kokonaisuutena",
        "cl_country_many": "{c} maata kokonaisuutena ({names})",
        "and_sep": " ja ",
        "regions_h2_many": "Saksan osavaltiot ja kokonaiset maat",
        "regions_note_many": ("<p>Sama laskutapa: {n} Bundesländer ja {c} "
                              "maata kokonaisuutena — {names}.</p>\n"),
        "regions_h2_one": "Saksan osavaltiot ja yksi kokonainen maa",
        "regions_note_one": ("<p>Sama laskutapa: {n} Bundesländer ja "
                             "{names} kokonaisuutena.</p>\n"),
        "regions_h2_lands": "Saksan osavaltiot",
        "regions_note_lands": ("<p>Sama laskutapa: {n} Bundesländer.</p>\n"),
        "col_name_city": "Kaupunki", "col_name_region": "Alue",
        "col_delta": "Δ pistettä", "col_share": "Vastattu",
        "col_total": "Paikkoja", "col_acc": "+ Saavutettavaa", "col_new": "+ Paikkoja",
        "sort_hint": ("Napauta sarakkeen otsikkoa lajitellaksesi sen "
                      "mukaan — napauta uudelleen, niin järjestys kääntyy."),
        "footer": ("""\
<h2>Data ja lisenssi</h2>
<p class="muted">Kaikki data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMapin
tekijät</a>, lisenssillä <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Tämä
sivu luodaan joka yö uudelleen Overpass-kyselystä eikä se tallenna sinusta mitään.
Näin laskenta ja väritys toimivat: <a href="{up}methods-fi.html">Menetelmät</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap on ilmainen eikä siinä ole mainoksia.
<a href="https://ko-fi.com/jakubwaller">&#9749; Tarjoa minulle kahvia</a>.</p>
"""),
    },
    "el": {
        "lang_name": "Ελληνικά",
        "file": "leaderboard-el.html",
        "months": ("Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου",
                   "Ιουνίου", "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου",
                   "Νοεμβρίου", "Δεκεμβρίου"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Πίσω στον χάρτη",
        "title": "PapaMap — Κατάταξη",
        "desc": ("Πού απαντήθηκε πρόσφατα η ερώτηση για τον χώρο — σε ποιον χώρο "
                 "βρίσκεται η αλλαξιέρα; Μεταβολή σε ποσοστιαίες μονάδες, "
                 "ανανεώνεται κάθε βράδυ από το OpenStreetMap."),
        "h1": "Η κατάταξη",
        "stand": "Ενημερώθηκε στις {date} · Δεδομένα από το OpenStreetMap",
        "stand_base": ("Ενημερώθηκε στις {date} · Μεταβολή από {base} · "
                       "Δεδομένα από το OpenStreetMap"),
        "intro1": (
            "<p>Ποια πόλη έχει τις περισσότερες αλλαξιέρες δεν εμφανίζεται εδώ, "
            "επίτηδες. Οι απόλυτοι αριθμοί δείχνουν κυρίως πόσο διεξοδικά έχει "
            "χαρτογραφηθεί ένα μέρος, όχι πόσο καλά είναι εξοπλισμένο — μια "
            "κατάταξη μ' αυτούς θα παραπλανούσε (γιατί, εξηγεί η "
            '<a href="{up}methods-el.html">Μέθοδος</a>). Αυτό που συγκρίνεται '
            "τίμια είναι η μεταβολή: πού απαντήθηκε πρόσφατα η ερώτηση για τον "
            "χώρο — σε ποιον χώρο βρίσκεται η αλλαξιέρα. Αυτό μετράει ακριβώς "
            "αυτή η σελίδα — το ποσοστό των μερών με απαντημένη ερώτηση χώρου, "
            "και ποιος το αύξησε περισσότερο τελευταία.</p>\n"),
        "intro2": (
            "<p>Κάθε απάντηση μετράει, ακόμα και «μόνο στη γυναικεία "
            "τουαλέτα» — ο χάρτης ζει από ειλικρινείς απαντήσεις, όχι από "
            "πράσινες καρφίτσες. Μπορείς να απαντήσεις επιτόπου σε λιγότερο "
            'από ένα λεπτό: πάτησε μια γκρι καρφίτσα στον <a href="{up}">'
            "χάρτη</a> και ακολούθησε τον σύνδεσμο MapComplete. "
            '<a href="{up}methods-el.html#contribute">Βήμα-βήμα</a>.</p>\n'),
        "fresh": ("<p>Η καταγραφή ξεκίνησε στις {date}. Μόλις υπάρξει σημείο "
                  "σύγκρισης, αυτή η σελίδα θα δείξει ποιος κινήθηκε.</p>\n"),
        "quiet": ("<p>Τίποτα δεν έχει κινηθεί πουθενά από {base}. Οι γκρι "
                  "καρφίτσες περιμένουν.</p>\n"),
        "cities_h2": "Πόλεις",
        "cities_note": ("<p>{n} μεγάλες πόλεις, ταξινομημένες κατά τη μεταβολή "
                        "του απαντημένου ποσοστού τους. Το Βερολίνο, το "
                        "Αμβούργο και η Βρέμη εμφανίζονται και παρακάτω, στα "
                        "κρατίδια — εδώ όμως μετράει η πόλη.</p>\n"),
        "regions_h2": "Γερμανικά κρατίδια και Δανία",
        "regions_note": ("<p>Ο ίδιος υπολογισμός για τα {n} Bundesländer και "
                         "τη Δανία ως σύνολο.</p>\n"),
        "regions_h2_regions": ("Γερμανικά κρατίδια, γαλλικές régions και "
                               "ολόκληρες χώρες"),
        "regions_note_regions": "<p>Ο ίδιος υπολογισμός για {list}.</p>\n",
        "cl_lands": "τα {n} Bundesländer",
        "cl_regions": "τις {r} γαλλικές régions",
        "cl_country_one": "{names} ως σύνολο",
        "cl_country_many": "{c} χώρες ως σύνολο ({names})",
        "and_sep": " και ",
        "regions_h2_many": "Γερμανικά κρατίδια και ολόκληρες χώρες",
        "regions_note_many": ("<p>Ο ίδιος υπολογισμός για τα {n} Bundesländer "
                              "και για {c} χώρες ως σύνολο: {names}.</p>\n"),
        "regions_h2_one": "Γερμανικά κρατίδια και μία ολόκληρη χώρα",
        "regions_note_one": ("<p>Ο ίδιος υπολογισμός για τα {n} Bundesländer "
                             "και για {names} ως σύνολο.</p>\n"),
        "regions_h2_lands": "Γερμανικά κρατίδια",
        "regions_note_lands": ("<p>Ο ίδιος υπολογισμός για τα {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Πόλη", "col_name_region": "Περιοχή",
        "col_delta": "Δ μονάδες", "col_share": "απαντημένο",
        "col_total": "μέρη", "col_acc": "+ προσβάσιμα", "col_new": "+ μέρη",
        "sort_hint": ("Πάτησε μια επικεφαλίδα στήλης για ταξινόμηση — πάτα "
                      "ξανά για αντιστροφή."),
        "footer": ("""\
<h2>Δεδομένα &amp; άδεια</h2>
<p class="muted">Όλα τα δεδομένα &copy; <a href="https://www.openstreetmap.org/copyright">συνεισφέροντες
του OpenStreetMap</a>, υπό την άδεια <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Αυτή
η σελίδα κατασκευάζεται ξανά κάθε βράδυ από ερώτημα Overpass και δεν αποθηκεύει τίποτα για εσένα.
Πώς μετριούνται και χρωματίζονται τα δεδομένα: <a href="{up}methods-el.html">Μέθοδος</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Το PapaMap είναι δωρεάν και χωρίς διαφημίσεις.
<a href="https://ko-fi.com/jakubwaller">&#9749; Κέρασέ με έναν καφέ</a>.</p>
"""),
    },
    "be": {
        "lang_name": "Беларуская",
        "file": "leaderboard-be.html",
        "months": ("студзеня", "лютага", "сакавіка", "красавіка", "мая",
                   "чэрвеня", "ліпеня", "жніўня", "верасня", "кастрычніка",
                   "лістапада", "снежня"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Назад да карты",
        "title": "PapaMap — Рэйтынг",
        "desc": ("Дзе апошнім часам адказалі на пытанне пра памяшканне — у "
                 "якім памяшканні стаіць стол для спавівання? Змяненне ў "
                 "працэнтных пунктах, пабудавана нанова кожную ноч з "
                 "OpenStreetMap."),
        "h1": "Рэйтынг",
        "stand": "Стан на {date} · Дадзеныя з OpenStreetMap",
        "stand_base": ("Стан на {date} · Змяненне з {base} · Дадзеныя з "
                       "OpenStreetMap"),
        "intro1": (
            "<p>У якім горадзе больш за ўсё сталоў для спавівання — тут "
            "наўмысна не пазначана. Абсалютныя лічбы пераважна паказваюць, "
            "наколькі грунтоўна месца занеслі на карту, а не наколькі яно "
            "добра абсталявана — рэйтынг з такіх лічбаў уводзіў бы ў зман "
            "(чаму менавіта, тлумачыць "
            '<a href="{up}methods-be.html">старонка метадаў</a>). Сумленна '
            "параўнаць можна змяненне: дзе апошнім часам адказалі на "
            "пытанне пра памяшканне — у якім памяшканні стаіць стол для "
            "спавівання. Менавіта гэта лічыць гэтая старонка — долю месцаў "
            "з адказаным пытаннем пра памяшканне і тых, хто павялічыў яе "
            "мацней за ўсіх.</p>\n"),
        "intro2": (
            "<p>Мае значэнне кожны адказ, у тым ліку «толькі жаночы "
            "туалет» — карта трымаецца на сумленных адказах, а не на "
            "зялёных шпільках. Адказаць можна на месцы менш чым за "
            'хвіліну: націсні на шэрую шпільку на <a href="{up}">карце</a> '
            'і перайдзі па яе спасылцы MapComplete. <a href="{up}'
            'methods-be.html#contribute">Крок за крокам</a>.</p>\n'),
        "fresh": ("<p>Запіс пачаўся {date}. Як толькі з'явіцца пункт для "
                  "параўнання, гэтая старонка пакажа, хто зрушыўся з "
                  "месца.</p>\n"),
        "quiet": ("<p>З {base} нідзе нічога не змянілася. Шэрыя шпількі "
                  "чакаюць.</p>\n"),
        "cities_h2": "Гарады",
        "cities_note": ("<p>{n} буйных гарадоў, адсартаваных па змяненні "
                        "долі адказаных. Берлін, Гамбург і Брэмен таксама "
                        "сустракаюцца ніжэй сярод зямель — тут лічыцца "
                        "горад.</p>\n"),
        "regions_h2": "Нямецкія землі і Данія",
        "regions_note": ("<p>Тыя ж падлікі для {n} Bundesländer і Даніі "
                         "цалкам.</p>\n"),
        "regions_h2_regions": ("Нямецкія землі, французскія рэгіёны і "
                               "цэлыя краіны"),
        "regions_note_regions": "<p>Тыя ж падлікі для {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} французскіх рэгіёнаў",
        "cl_country_one": "{names} цалкам",
        "cl_country_many": "{c} краін цалкам ({names})",
        "and_sep": " і ",
        "regions_h2_many": "Нямецкія землі і цэлыя краіны",
        "regions_note_many": ("<p>Тыя ж падлікі для {n} Bundesländer і для "
                              "{c} краін цалкам: {names}.</p>\n"),
        "regions_h2_one": "Нямецкія землі і адна цэлая краіна",
        "regions_note_one": ("<p>Тыя ж падлікі для {n} Bundesländer і для "
                             "{names} цалкам.</p>\n"),
        "regions_h2_lands": "Нямецкія землі",
        "regions_note_lands": ("<p>Тыя ж падлікі для {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Горад", "col_name_region": "Рэгіён",
        "col_delta": "Δ пункты", "col_share": "адказана",
        "col_total": "месцы", "col_acc": "+ даступна", "col_new": "+ месцы",
        "sort_hint": ("Націсні на загаловак слупка, каб адсартаваць па ім "
                      "— яшчэ раз націсні, каб змяніць напрамак."),
        "footer": ("""\
<h2>Дадзеныя і ліцэнзія</h2>
<p class="muted">Усе дадзеныя &copy; <a href="https://www.openstreetmap.org/copyright">удзельнікі
OpenStreetMap</a>, паводле <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Гэтая
старонка перабудоўваецца кожную ноч з запыту Overpass і не захоўвае пра цябе нічога.
Як усё лічыцца і афарбоўваецца: <a href="{up}methods-be.html">Метады</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap бясплатны і без рэкламы.
<a href="https://ko-fi.com/jakubwaller">&#9749; Пачастуй мяне кавай</a>.</p>
"""),
    },
    "bg": {
        "lang_name": "Български",
        "file": "leaderboard-bg.html",
        "months": ("януари", "февруари", "март", "април", "май", "юни",
                   "юли", "август", "септември", "октомври", "ноември",
                   "декември"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; Обратно към картата",
        "title": "Класация на PapaMap",
        "desc": ("Къде наскоро бе отговорено в коя стая е масата за "
                 "повиване? Промяна в процентни пункта, всяка нощ наново "
                 "от OpenStreetMap."),
        "h1": "Класацията",
        "stand": "Към {date} · Данни от OpenStreetMap",
        "stand_base": ("Към {date} · Промяна от {base} · "
                       "Данни от OpenStreetMap"),
        "intro1": (
            "<p>Кой град има най-много маси за повиване, умишлено не е на "
            "тази страница. Абсолютните числа показват най-вече колко "
            "старателно е картографирано дадено място, а не колко добре е "
            "оборудвано — класация по тях би подвела (страницата с "
            '<a href="{up}methods-bg.html">методите</a> обяснява защо). '
            "Честно може да се сравнява промяната: къде наскоро бе "
            "отговорено в коя стая е масата за повиване. Точно това брои "
            "тази страница — делът на местата с отговорена стая, и кой го "
            "е увеличил най-много напоследък.</p>\n"),
        "intro2": (
            "<p>Всеки отговор има значение, включително „само в дамска "
            "тоалетна“ — картата се крепи на честни отговори, не на зелени "
            "маркери. Отговарянето отнема под минута на място: докосни сив "
            'маркер на <a href="{up}">картата</a> и последвай връзката му '
            'към MapComplete. <a href="{up}methods-bg.html#contribute">'
            "Стъпка по стъпка</a>.</p>\n"),
        "fresh": ("<p>Записът започна на {date}. Щом се появи момент за "
                  "сравнение, тук ще пише кой се е раздвижил.</p>\n"),
        "quiet": ("<p>От {base} насам никъде нищо не се е променило. "
                  "Сивите маркери чакат.</p>\n"),
        "cities_h2": "Градове",
        "cities_note": ("<p>{n} големи града, подредени по промяната в "
                        "дела на местата с отговорена стая. Берлин, "
                        "Хамбург и Бремен се появяват и по-долу сред "
                        "провинциите — тук се брои градът.</p>\n"),
        "regions_h2": "Германски провинции и Дания",
        "regions_note": ("<p>Същото изчисление за {n}-те Bundesländer и "
                         "за Дания като цяло.</p>\n"),
        "regions_h2_regions": ("Германски провинции, френски региони и "
                               "цели държави"),
        "regions_note_regions": "<p>Същото изчисление за {list}.</p>\n",
        "cl_lands": "{n}-те Bundesländer",
        "cl_regions": "{r}-те френски региона",
        "cl_country_one": "{names} като цяло",
        "cl_country_many": "{c} държави като цяло ({names})",
        "and_sep": " и ",
        "regions_h2_many": "Германски провинции и цели държави",
        "regions_note_many": ("<p>Същото изчисление за {n}-те Bundesländer "
                              "и за {c} държави като цяло: {names}.</p>\n"),
        "regions_h2_one": "Германски провинции и една цяла държава",
        "regions_note_one": ("<p>Същото изчисление за {n}-те Bundesländer "
                             "и за {names} като цяло.</p>\n"),
        "regions_h2_lands": "Германски провинции",
        "regions_note_lands": ("<p>Същото изчисление за {n}-те "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Град", "col_name_region": "Регион",
        "col_delta": "Δ пункта", "col_share": "отговорено",
        "col_total": "места", "col_acc": "+ достъпни", "col_new": "+ места",
        "sort_hint": ("Докосни заглавие на колона, за да подредиш по нея "
                      "— докосни отново, за да обърнеш посоката."),
        "footer": ("""\
<h2>Данни и лиценз</h2>
<p class="muted">Всички данни &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, под <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Страницата
се генерира наново всяка нощ от заявка към Overpass и не съхранява нищо за теб.
Как се брои и оцветява: <a href="{up}methods-bg.html">Методи</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap е безплатен и без реклами.
<a href="https://ko-fi.com/jakubwaller">&#9749; Почерпи ме с кафе</a>.</p>
"""),
    },
    "mk": {
        "lang_name": "Македонски",
        "file": "leaderboard-mk.html",
        "months": ("јануари", "февруари", "март", "април", "мај", "јуни", "јули",
                   "август", "септември", "октомври", "ноември", "декември"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Назад на мапата",
        "title": "PapaMap — ранг-листа",
        "desc": ("Каде беше одговорено во последно време на прашањето за "
                 "просторијата — во која просторија е масата за пеленање? "
                 "Промена во процентни поени, пресметана секоја ноќ одново "
                 "од OpenStreetMap."),
        "h1": "Ранг-листата",
        "stand": "Состојба на {date} · Податоци од OpenStreetMap",
        "stand_base": ("Состојба на {date} · Промена од {base} · "
                       "Податоци од OpenStreetMap"),
        "intro1": (
            "<p>Кој град има најмногу маси за пеленање намерно не е на "
            "оваа страница. Апсолутните бројки мерат пред сè колку темелно "
            "е измапано едно место, а не колку добро е опремено — "
            "рангирање според нив би било погрешно "
            '(<a href="{up}methods-mk.html">страницата со методи</a> '
            "објаснува зошто). Чесно може да се спореди промената: каде "
            "прашањето за просторијата — во која просторија е масата за "
            "пеленање? — беше одговорено во последно време. Токму тоа го "
            "брои оваа страница — уделот на места со одговорено прашање за "
            "просторијата, и кој најмногу го зголемил.</p>\n"),
        "intro2": (
            "<p>Секој одговор се брои, вклучително и „само во женскиот "
            "тоалет“ — мапата живее од чесни одговори, а не од зелени "
            "точки. Одговарањето на лице место трае под една минута: "
            'допри сива точка на <a href="{up}">мапата</a> и следи го '
            'нејзиниот MapComplete-линк. <a href="{up}methods-mk.html#contribute">'
            "Чекор по чекор</a>.</p>\n"),
        "fresh": ("<p>Снимањето започна на {date}. Штом ќе има точка за "
                  "споредба, оваа страница ќе покаже кој се придвижил.</p>\n"),
        "quiet": ("<p>Никаде ништо не се придвижило од {base}. Сивите "
                  "точки чекаат.</p>\n"),
        "cities_h2": "Градови",
        "cities_note": ("<p>{n} големи градови, подредени по промената на "
                        "нивниот одговорен удел. Берлин, Хамбург и Бремен "
                        "се појавуваат и подолу кај покраините — тука се "
                        "брои градот.</p>\n"),
        "regions_h2": "Германски покраини и Данска",
        "regions_note": ("<p>Истата сметка за {n}-те Bundesländer и за "
                         "Данска како целина.</p>\n"),
        "regions_h2_regions": "Германски покраини, француски региони и цели земји",
        "regions_note_regions": "<p>Истата сметка за {list}.</p>\n",
        "cl_lands": "{n}-те Bundesländer",
        "cl_regions": "{r}-те француски региони",
        "cl_country_one": "{names} како целина",
        "cl_country_many": "{c} земји како целина ({names})",
        "and_sep": " и ",
        "regions_h2_many": "Германски покраини и цели земји",
        "regions_note_many": ("<p>Истата сметка за {n}-те Bundesländer и за "
                              "{c} земји како целина: {names}.</p>\n"),
        "regions_h2_one": "Германски покраини и една цела земја",
        "regions_note_one": ("<p>Истата сметка за {n}-те Bundesländer и за "
                             "{names} како целина.</p>\n"),
        "regions_h2_lands": "Германски покраини",
        "regions_note_lands": ("<p>Истата сметка за {n}-те "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Град", "col_name_region": "Регион",
        "col_delta": "Δ поени", "col_share": "одговорено",
        "col_total": "места", "col_acc": "+ достапни", "col_new": "+ места",
        "sort_hint": ("Допри наслов на колона за да сортираш по неа — допри "
                      "повторно за да ја смениш насоката."),
        "footer": ("""\
<h2>Податоци &amp; лиценца</h2>
<p class="muted">Сите податоци &copy; <a href="https://www.openstreetmap.org/copyright">соработниците на
OpenStreetMap</a>, под лиценцата <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Оваа
страница се преизградува секоја ноќ од Overpass-барање и не чува ништо за тебе.
Како се брои и обојува: <a href="{up}methods-mk.html">Методи</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap е бесплатен и без реклами.
<a href="https://ko-fi.com/jakubwaller">&#9749; Почерпи ме со кафе</a>.</p>
"""),
    },
    "sr": {
        "lang_name": "Српски",
        "file": "leaderboard-sr.html",
        "months": ("јануара", "фебруара", "марта", "априла", "маја", "јуна",
                   "јула", "августа", "септембра", "октобра", "новембра",
                   "децембра"),
        "date_fmt": "{d}. {m} {y}",
        "decimal": ",",
        "thousands": ".",
        "back_map": "&larr; Назад на мапу",
        "title": "PapaMap — Ранглиста",
        "desc": ("Где је недавно одговорено на питање о просторији — у "
                 "којој се просторији налази сто за превијање? Промена у "
                 "процентним поенима, сваке ноћи изнова направљено из "
                 "OpenStreetMap-а."),
        "h1": "Ранглиста",
        "stand": "Стање {date} · Подаци из OpenStreetMap-а",
        "stand_base": ("Стање {date} · Промена од {base} · Подаци из "
                       "OpenStreetMap-а"),
        "intro1": (
            "<p>Који град има највише столова за превијање намерно није на "
            "овој страници. Апсолутни бројеви углавном мере колико је неко "
            "место темељно мапирано, а не колико је добро опремљено — "
            "ранг-листа од тога би заваравала (зашто, објашњава страница "
            '<a href="{up}methods-sr.html">Методе</a>). Поштено се може '
            "упоредити промена: где је последње одговорено на питање о "
            "просторији — у којој се просторији налази сто за превијање? "
            "Управо то броји ова страница — удео места с одговореним "
            "питањем о просторији, и ко га је последње највише "
            "повећао.</p>\n"),
        "intro2": (
            "<p>Сваки одговор се рачуна, укључујући „Само женски тоалет“ — "
            "мапа живи од искрених одговора, а не од зелених пинова. "
            "Одговарање на лицу места траје мање од минута: додирни сиви "
            'пин на <a href="{up}">мапи</a> и прати његов MapComplete '
            'линк. <a href="{up}methods-sr.html#contribute">Корак по '
            "кораку</a>.</p>\n"),
        "fresh": ("<p>Праћење је почело {date}. Чим постоји тачка за "
                  "поређење, ова страница ће показати ко се померио.</p>\n"),
        "quiet": ("<p>Од {base} се нигде ништа није померило. Сиви пинови "
                  "чекају.</p>\n"),
        "cities_h2": "Градови",
        "cities_note": ("<p>{n} великих градова, поређаних по промени "
                        "њиховог одговореног удела. Берлин, Хамбург и "
                        "Бремен појављују се и ниже међу покрајинама — "
                        "овде се рачуна град.</p>\n"),
        "regions_h2": "Немачке покрајине и Данска",
        "regions_note": ("<p>Исти рачун за {n} Bundesländer и Данску у "
                         "целини.</p>\n"),
        "regions_h2_regions": "Немачке покрајине, француски региони и целе земље",
        "regions_note_regions": "<p>Исти рачун за {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} француских региона",
        "cl_country_one": "{names} у целини",
        "cl_country_many": "{c} земље у целини ({names})",
        "and_sep": " и ",
        "regions_h2_many": "Немачке покрајине и целе земље",
        "regions_note_many": ("<p>Исти рачун за {n} Bundesländer и за {c} "
                              "земље у целини: {names}.</p>\n"),
        "regions_h2_one": "Немачке покрајине и једна цела земља",
        "regions_note_one": ("<p>Исти рачун за {n} Bundesländer и за "
                             "{names} у целини.</p>\n"),
        "regions_h2_lands": "Немачке покрајине",
        "regions_note_lands": ("<p>Исти рачун за {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Град", "col_name_region": "Регион",
        "col_delta": "Δ поени", "col_share": "одговорено",
        "col_total": "места", "col_acc": "+ доступно", "col_new": "+ места",
        "sort_hint": ("Додирни заглавље колоне да сортираш по њему — "
                      "додирни поново да обрнеш редослед."),
        "footer": ("""\
<h2>Подаци и лиценца</h2>
<p class="muted">Сви подаци &copy; <a href="https://www.openstreetmap.org/copyright">сарадници
OpenStreetMap-а</a>, под лиценцом <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ова
страница се сваке ноћи изнова генерише из Overpass упита и о теби ништа не чува.
Како се броји и боји: <a href="{up}methods-sr.html">Методе</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap је бесплатан и без реклама.
<a href="https://ko-fi.com/jakubwaller">&#9749; Части ме кафом</a>.</p>
"""),
    },
    "uk": {
        "lang_name": "Українська",
        "file": "leaderboard-uk.html",
        "months": ("січня", "лютого", "березня", "квітня", "травня", "червня",
                   "липня", "серпня", "вересня", "жовтня", "листопада",
                   "грудня"),
        "date_fmt": "{d} {m} {y}",
        "decimal": ",",
        "thousands": "&nbsp;",
        "back_map": "&larr; До карти",
        "title": "Рейтинг PapaMap",
        "desc": ("Де нещодавно відповіли на питання про приміщення — в якому "
                 "приміщенні висить пеленальний столик? Зміна у відсоткових "
                 "пунктах, дані щоночі перебудовуються з OpenStreetMap."),
        "h1": "Рейтинг",
        "stand": "Станом на {date} · Дані з OpenStreetMap",
        "stand_base": ("Станом на {date} · Зміна з {base} · "
                       "Дані з OpenStreetMap"),
        "intro1": (
            "<p>Яке місто має найбільше пеленальних столиків — навмисно не "
            "на цій сторінці. Абсолютні числа здебільшого показують, "
            "наскільки ретельно щось замапили, а не наскільки добре місце "
            "обладнане — рейтинг із таких чисел вводив би в оману (чому "
            'саме, дивись <a href="{up}methods-uk.html">Методи</a>). Чесно '
            "порівняти можна лише зміну: де останнім часом відповіли на "
            "питання про приміщення — в якому приміщенні висить пеленальний "
            "столик. Саме це рахує ця сторінка — частку місць із відповіддю "
            "про приміщення й хто підняв її найбільше.</p>\n"),
        "intro2": (
            "<p>Важлива кожна відповідь, навіть «лише в жіночому туалеті» "
            "— карта тримається на чесних відповідях, а не на зелених "
            "позначках. Відповісти можна на місці менш ніж за хвилину: "
            'торкнися сірої позначки на <a href="{up}">карті</a> і перейди '
            'за посиланням MapComplete. <a href="{up}methods-uk.html#contribute">'
            "Крок за кроком</a>.</p>\n"),
        "fresh": ("<p>Запис даних почався {date}. Щойно з'явиться точка для "
                  "порівняння, тут буде видно, хто зрушив з місця.</p>\n"),
        "quiet": ("<p>З {base} ніде нічого не змінилося. Сірі позначки "
                  "чекають.</p>\n"),
        "cities_h2": "Міста",
        "cities_note": ("<p>{n} великих міст, відсортовані за зміною частки "
                        "відповідей. Берлін, Гамбург і Бремен також є нижче "
                        "серед земель — тут рахується місто.</p>\n"),
        "regions_h2": "Німецькі землі та Данія",
        "regions_note": ("<p>Той самий підрахунок для {n} Bundesländer і "
                         "Данії в цілому.</p>\n"),
        "regions_h2_regions": ("Німецькі землі, французькі régions і цілі "
                               "країни"),
        "regions_note_regions": "<p>Той самий підрахунок для {list}.</p>\n",
        "cl_lands": "{n} Bundesländer",
        "cl_regions": "{r} французьких régions",
        "cl_country_one": "{names} в цілому",
        "cl_country_many": "{c} країн в цілому ({names})",
        "and_sep": " і ",
        "regions_h2_many": "Німецькі землі та цілі країни",
        "regions_note_many": ("<p>Той самий підрахунок для {n} Bundesländer "
                              "і для {c} країн в цілому: {names}.</p>\n"),
        "regions_h2_one": "Німецькі землі й одна ціла країна",
        "regions_note_one": ("<p>Той самий підрахунок для {n} Bundesländer, "
                             "а {names} рахується в цілому.</p>\n"),
        "regions_h2_lands": "Німецькі землі",
        "regions_note_lands": ("<p>Той самий підрахунок для {n} "
                               "Bundesländer.</p>\n"),
        "col_name_city": "Місто", "col_name_region": "Регіон",
        "col_delta": "Δ пункти", "col_share": "відповіли",
        "col_total": "місця", "col_acc": "+ доступні", "col_new": "+ місця",
        "sort_hint": ("Торкнися заголовка стовпця, щоб сортувати за ним — "
                      "торкнися ще раз, щоб змінити напрямок."),
        "footer": ("""\
<h2>Дані та ліцензія</h2>
<p class="muted">Усі дані &copy; <a href="https://www.openstreetmap.org/copyright">учасники
OpenStreetMap</a>, за ліцензією <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ця
сторінка перебудовується щоночі з Overpass-запиту і не зберігає нічого про тебе.
Як усе рахується й фарбується: <a href="{up}methods-uk.html">Методи</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">PapaMap безкоштовний і без реклами.
<a href="https://ko-fi.com/jakubwaller">&#9749; Пригости мене кавою</a>.</p>
"""),
    },
}
