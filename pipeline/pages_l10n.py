from __future__ import annotations

from . import config

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

# The per-area name forms of the other two chunked countries, in English:
# (name_in, name_for) exactly like FRANCE_REGION_FORMS. English inflects
# nothing, so the only work is the definite article — "in the District of
# Columbia", "in the Northwest Territories" — and name_for is None wherever
# the bare name reads right after "The numbers for …".
def _english_forms(names, the=()):
    return {n: (f"in the {n}", f"the {n}") if n in the else (f"in {n}", None)
            for n in names}


US_STATE_FORMS = _english_forms(
    tuple(name for name, _ in config.US_STATES), the=("District of Columbia",))
CANADA_PROVINCE_FORMS = _english_forms(
    tuple(name for name, _ in config.CANADA_PROVINCES),
    the=("Northwest Territories",))

# One forms table per hub country (config.CHUNK_HUBS), keyed the same way.
CHUNK_FORMS = {"fr": FRANCE_REGION_FORMS, "us": US_STATE_FORMS,
               "ca": CANADA_PROVINCE_FORMS}

# The hub page over a chunked country's per-area pages, and the three strings
# those area pages need to point back at it. Keyed by country, not language:
# the copy names the country and its kind of subdivision ("par région", "by
# state"), so it is the country's, even where two hubs share a language.
# The rest of a hub page — table headers, statuses, help, footer — comes from
# L[lang] like every other page.
HUB = {
    "fr": {
        "back_hub": "Toute la France",
        "crumb_hub": "Tables à langer en France",
        "siblings_h2": "Autres régions",
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
    "us": {
        "back_hub": "All of the United States",
        "crumb_hub": "Changing tables in the United States",
        "siblings_h2": "Other states",
        "hub_title": "Changing tables in the United States, by state — PapaMap",
        "hub_desc": ("Changing tables in the United States, state by state: "
                     "{total} places according to OpenStreetMap; for {unknown} "
                     "of them nobody has recorded the room."),
        "hub_h1": "Changing tables in the United States, by state",
        "hub_intro": ("OpenStreetMap knows <strong>{total}</strong> places "
                      "with a baby changing table in the United States. For "
                      "<strong>{unknown}</strong> of them nobody has recorded "
                      "which room the table is in — so whether a dad can "
                      "actually reach it. State by state (the District of "
                      "Columbia has its own row):"),
        "hub_col": "State",
        "hub_toilets": "Toilets",
        "hub_note": ("Alphabetical, not ranked. A ranking would mislead: "
                     "these numbers mostly measure how thoroughly a state has "
                     "been mapped, not what it actually provides. The "
                     "<em>Toilets</em> column counts every public toilet on "
                     "record, with or without a changing table. What compares "
                     'honestly is movement — it is on the <a href="'
                     'leaderboard.html">leaderboard</a>.'),
    },
    "ca": {
        "back_hub": "All of Canada",
        "crumb_hub": "Changing tables in Canada",
        "siblings_h2": "Other provinces and territories",
        "hub_title": "Changing tables in Canada, by province — PapaMap",
        "hub_desc": ("Changing tables in Canada, province by province: "
                     "{total} places according to OpenStreetMap; for {unknown} "
                     "of them nobody has recorded the room."),
        "hub_h1": "Changing tables in Canada, by province and territory",
        "hub_intro": ("OpenStreetMap knows <strong>{total}</strong> places "
                      "with a baby changing table in Canada. For "
                      "<strong>{unknown}</strong> of them nobody has recorded "
                      "which room the table is in — so whether a dad can "
                      "actually reach it. Province by province, the three "
                      "territories included:"),
        "hub_col": "Province / territory",
        "hub_toilets": "Toilets",
        "hub_note": ("Alphabetical, not ranked. A ranking would mislead: "
                     "these numbers mostly measure how thoroughly a province "
                     "has been mapped, not what it actually provides. The "
                     "<em>Toilets</em> column counts every public toilet on "
                     "record, with or without a changing table. What compares "
                     'honestly is movement — it is on the <a href="'
                     'leaderboard.html">leaderboard</a>.'),
    },
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
    "no": {
        "toilets": "Offentlig toalett", "restaurant": "Restaurant",
        "cafe": "Kafé", "fast_food": "Gatekjøkken",
        "community_centre": "Samfunnshus", "library": "Bibliotek",
        "fuel": "Bensinstasjon", "pub": "Pub", "biergarten": "Ølhage",
        "ice_cream": "Iskiosk", "social_facility": "Sosial institusjon",
        "townhall": "Rådhus", "doctors": "Legekontor", "pharmacy": "Apotek",
        "place_of_worship": "Kirke", "cinema": "Kino", "theatre": "Teater",
        "hospital": "Sykehus", "marketplace": "Torg",
        "kindergarten": "Barnehage",
    },
    "fi": {
        "toilets": "Yleinen wc", "restaurant": "Ravintola",
        "cafe": "Kahvila", "fast_food": "Pikaruokapaikka",
        "community_centre": "Asukastalo", "library": "Kirjasto",
        "fuel": "Huoltoasema", "pub": "Pubi", "biergarten": "Biergarten",
        "ice_cream": "Jäätelöbaari", "social_facility": "Sosiaalipalvelu",
        "townhall": "Kaupungintalo", "doctors": "Lääkäriasema",
        "pharmacy": "Apteekki", "place_of_worship": "Kirkko",
        "cinema": "Elokuvateatteri", "theatre": "Teatteri",
        "hospital": "Sairaala", "marketplace": "Tori",
        "kindergarten": "Päiväkoti",
    },
    "is": {
        "toilets": "Almenningssalerni", "restaurant": "Veitingastaður",
        "cafe": "Kaffihús", "fast_food": "Skyndibiti",
        "community_centre": "Félagsheimili", "library": "Bókasafn",
        "fuel": "Bensínstöð", "pub": "Krá", "biergarten": "Bjórgarður",
        "ice_cream": "Ísbúð", "social_facility": "Félagsþjónusta",
        "townhall": "Ráðhús", "doctors": "Læknastofa",
        "pharmacy": "Apótek", "place_of_worship": "Kirkja",
        "cinema": "Kvikmyndahús", "theatre": "Leikhús",
        "hospital": "Sjúkrahús", "marketplace": "Markaðstorg",
        "kindergarten": "Leikskóli",
    },
    "et": {
        "toilets": "Avalik WC", "restaurant": "Restoran",
        "cafe": "Kohvik", "fast_food": "Kiirtoit",
        "community_centre": "Kogukonnakeskus", "library": "Raamatukogu",
        "fuel": "Tankla", "pub": "Pubi", "biergarten": "Õlleaed",
        "ice_cream": "Jäätisekiosk", "social_facility": "Sotsiaalasutus",
        "townhall": "Raekoda", "doctors": "Arstipraksis",
        "pharmacy": "Apteek", "place_of_worship": "Kirik",
        "cinema": "Kino", "theatre": "Teater", "hospital": "Haigla",
        "marketplace": "Turg", "kindergarten": "Lasteaed",
    },
    "lv": {
        "toilets": "Publiskā tualete", "restaurant": "Restorāns",
        "cafe": "Kafejnīca", "fast_food": "Ātrā ēdināšana",
        "community_centre": "Kopienas centrs", "library": "Bibliotēka",
        "fuel": "Degvielas uzpildes stacija", "pub": "Krogs",
        "biergarten": "Alus dārzs", "ice_cream": "Saldējuma bārs",
        "social_facility": "Sociālā iestāde", "townhall": "Rātsnams",
        "doctors": "Ārsta prakse", "pharmacy": "Aptieka",
        "place_of_worship": "Baznīca", "cinema": "Kino", "theatre": "Teātris",
        "hospital": "Slimnīca", "marketplace": "Tirgus",
        "kindergarten": "Bērnudārzs",
    },
    "lt": {
        "toilets": "Viešas tualetas", "restaurant": "Restoranas",
        "cafe": "Kavinė", "fast_food": "Greitas maistas",
        "community_centre": "Bendruomenės centras", "library": "Biblioteka",
        "fuel": "Degalinė", "pub": "Baras", "biergarten": "Alaus sodas",
        "ice_cream": "Ledainė", "social_facility": "Socialinė įstaiga",
        "townhall": "Rotušė", "doctors": "Gydytojo kabinetas",
        "pharmacy": "Vaistinė", "place_of_worship": "Bažnyčia",
        "cinema": "Kino teatras", "theatre": "Teatras",
        "hospital": "Ligoninė", "marketplace": "Turgus",
        "kindergarten": "Darželis",
    },
    "es": {
        "toilets": "Aseo público", "restaurant": "Restaurante",
        "cafe": "Cafetería", "fast_food": "Comida rápida",
        "community_centre": "Centro cívico", "library": "Biblioteca",
        "fuel": "Gasolinera", "pub": "Pub", "biergarten": "Biergarten",
        "ice_cream": "Heladería", "social_facility": "Centro social",
        "townhall": "Ayuntamiento", "doctors": "Consulta médica",
        "pharmacy": "Farmacia", "place_of_worship": "Iglesia",
        "cinema": "Cine", "theatre": "Teatro", "hospital": "Hospital",
        "marketplace": "Mercado", "kindergarten": "Guardería",
    },
    "pt": {
        "toilets": "WC público", "restaurant": "Restaurante",
        "cafe": "Café", "fast_food": "Comida rápida",
        "community_centre": "Centro comunitário", "library": "Biblioteca",
        "fuel": "Estação de serviço", "pub": "Bar", "biergarten": "Esplanada",
        "ice_cream": "Gelataria", "social_facility": "Instalação social",
        "townhall": "Câmara municipal", "doctors": "Consultório médico",
        "pharmacy": "Farmácia", "place_of_worship": "Igreja",
        "cinema": "Cinema", "theatre": "Teatro", "hospital": "Hospital",
        "marketplace": "Mercado", "kindergarten": "Jardim de infância",
    },
    "it": {
        "toilets": "Bagno pubblico", "restaurant": "Ristorante",
        "cafe": "Bar", "fast_food": "Fast food",
        "community_centre": "Centro sociale", "library": "Biblioteca",
        "fuel": "Stazione di servizio", "pub": "Pub",
        "biergarten": "Biergarten", "ice_cream": "Gelateria",
        "social_facility": "Struttura sociale", "townhall": "Municipio",
        "doctors": "Studio medico", "pharmacy": "Farmacia",
        "place_of_worship": "Chiesa", "cinema": "Cinema",
        "theatre": "Teatro", "hospital": "Ospedale",
        "marketplace": "Mercato", "kindergarten": "Asilo",
    },
    "el": {
        "toilets": "Δημόσια τουαλέτα", "restaurant": "Εστιατόριο",
        "cafe": "Καφετέρια", "fast_food": "Φαστ φουντ",
        "community_centre": "Κοινοτικό κέντρο", "library": "Βιβλιοθήκη",
        "fuel": "Πρατήριο καυσίμων", "pub": "Παμπ",
        "biergarten": "Κήπος μπύρας", "ice_cream": "Παγωτατζίδικο",
        "social_facility": "Κοινωνική υπηρεσία", "townhall": "Δημαρχείο",
        "doctors": "Ιατρείο", "pharmacy": "Φαρμακείο",
        "place_of_worship": "Εκκλησία", "cinema": "Κινηματογράφος",
        "theatre": "Θέατρο", "hospital": "Νοσοκομείο",
        "marketplace": "Αγορά", "kindergarten": "Νηπιαγωγείο",
    },
    "sl": {
        "toilets": "Javno stranišče", "restaurant": "Restavracija",
        "cafe": "Kavarna", "fast_food": "Hitra prehrana",
        "community_centre": "Skupnostni center", "library": "Knjižnica",
        "fuel": "Bencinska črpalka", "pub": "Pivnica",
        "biergarten": "Pivski vrt", "ice_cream": "Sladoledarna",
        "social_facility": "Socialna ustanova", "townhall": "Rotovž",
        "doctors": "Zdravniška ordinacija", "pharmacy": "Lekarna",
        "place_of_worship": "Cerkev", "cinema": "Kino",
        "theatre": "Gledališče", "hospital": "Bolnišnica",
        "marketplace": "Tržnica", "kindergarten": "Vrtec",
    },
    "sk": {
        "toilets": "Verejné WC", "restaurant": "Reštaurácia",
        "cafe": "Kaviareň", "fast_food": "Rýchle občerstvenie",
        "community_centre": "Komunitné centrum", "library": "Knižnica",
        "fuel": "Čerpacia stanica", "pub": "Krčma",
        "biergarten": "Pivná záhrada", "ice_cream": "Zmrzlina",
        "social_facility": "Sociálne zariadenie", "townhall": "Radnica",
        "doctors": "Ambulancia", "pharmacy": "Lekáreň",
        "place_of_worship": "Kostol", "cinema": "Kino", "theatre": "Divadlo",
        "hospital": "Nemocnica", "marketplace": "Trhovisko",
        "kindergarten": "Škôlka",
    },
    "hu": {
        "toilets": "Nyilvános mosdó", "restaurant": "Étterem",
        "cafe": "Kávézó", "fast_food": "Gyorsétterem",
        "community_centre": "Közösségi ház", "library": "Könyvtár",
        "fuel": "Benzinkút", "pub": "Kocsma", "biergarten": "Sörkert",
        "ice_cream": "Fagyizó", "social_facility": "Szociális intézmény",
        "townhall": "Városháza", "doctors": "Orvosi rendelő",
        "pharmacy": "Gyógyszertár", "place_of_worship": "Templom",
        "cinema": "Mozi", "theatre": "Színház", "hospital": "Kórház",
        "marketplace": "Piac", "kindergarten": "Óvoda",
    },
    "hr": {
        "toilets": "Javni WC", "restaurant": "Restoran",
        "cafe": "Kafić", "fast_food": "Brza hrana",
        "community_centre": "Društveni centar", "library": "Knjižnica",
        "fuel": "Benzinska postaja", "pub": "Pub", "biergarten": "Pivski vrt",
        "ice_cream": "Slastičarnica", "social_facility": "Socijalna ustanova",
        "townhall": "Gradska vijećnica", "doctors": "Liječnička ordinacija",
        "pharmacy": "Ljekarna", "place_of_worship": "Crkva",
        "cinema": "Kino", "theatre": "Kazalište", "hospital": "Bolnica",
        "marketplace": "Tržnica", "kindergarten": "Vrtić",
    },
    "ro": {
        "toilets": "Toaletă publică", "restaurant": "Restaurant",
        "cafe": "Cafenea", "fast_food": "Fast-food",
        "community_centre": "Centru comunitar", "library": "Bibliotecă",
        "fuel": "Benzinărie", "pub": "Pub", "biergarten": "Grădină de bere",
        "ice_cream": "Gelaterie", "social_facility": "Instituție socială",
        "townhall": "Primărie", "doctors": "Cabinet medical",
        "pharmacy": "Farmacie", "place_of_worship": "Biserică",
        "cinema": "Cinema", "theatre": "Teatru", "hospital": "Spital",
        "marketplace": "Piață", "kindergarten": "Grădiniță",
    },
    "bg": {
        "toilets": "Обществена тоалетна", "restaurant": "Ресторант",
        "cafe": "Кафене", "fast_food": "Бързо хранене",
        "community_centre": "Читалище", "library": "Библиотека",
        "fuel": "Бензиностанция", "pub": "Кръчма",
        "biergarten": "Бирария на открито", "ice_cream": "Сладкарница",
        "social_facility": "Социално заведение", "townhall": "Кметство",
        "doctors": "Лекарски кабинет", "pharmacy": "Аптека",
        "place_of_worship": "Църква", "cinema": "Кино", "theatre": "Театър",
        "hospital": "Болница", "marketplace": "Пазар",
        "kindergarten": "Детска градина",
    },
    "sr": {
        "toilets": "Јавни тоалет", "restaurant": "Ресторан",
        "cafe": "Кафић", "fast_food": "Брза храна",
        "community_centre": "Дом културе", "library": "Библиотека",
        "fuel": "Бензинска пумпа", "pub": "Паб",
        "biergarten": "Пивска башта", "ice_cream": "Сладолеџиница",
        "social_facility": "Социјална установа",
        "townhall": "Градска већница", "doctors": "Ординација",
        "pharmacy": "Апотека", "place_of_worship": "Црква",
        "cinema": "Биоскоп", "theatre": "Позориште", "hospital": "Болница",
        "marketplace": "Пијаца", "kindergarten": "Вртић",
    },
    "bs": {
        "toilets": "Javni WC", "restaurant": "Restoran",
        "cafe": "Kafić", "fast_food": "Brza hrana",
        "community_centre": "Dom kulture", "library": "Biblioteka",
        "fuel": "Benzinska pumpa", "pub": "Pub", "biergarten": "Biergarten",
        "ice_cream": "Slastičarna", "social_facility": "Socijalna ustanova",
        "townhall": "Opštinska zgrada", "doctors": "Ljekarska ordinacija",
        "pharmacy": "Apoteka", "place_of_worship": "Crkva",
        "cinema": "Bioskop", "theatre": "Pozorište", "hospital": "Bolnica",
        "marketplace": "Pijaca", "kindergarten": "Vrtić",
    },
    "sq": {
        "toilets": "Tualet publik", "restaurant": "Restorant",
        "cafe": "Kafene", "fast_food": "Ushqim i shpejtë",
        "community_centre": "Qendër komunitare", "library": "Bibliotekë",
        "fuel": "Stacion karburanti", "pub": "Pub",
        "biergarten": "Biergarten", "ice_cream": "Akullore",
        "social_facility": "Institucion social", "townhall": "Bashki",
        "doctors": "Ordinancë mjekësore", "pharmacy": "Farmaci",
        "place_of_worship": "Kishë", "cinema": "Kinema",
        "theatre": "Teatër", "hospital": "Spital",
        "marketplace": "Treg", "kindergarten": "Kopsht fëmijësh",
    },
    "mk": {
        "toilets": "Јавен тоалет", "restaurant": "Ресторан",
        "cafe": "Кафуле", "fast_food": "Брза храна",
        "community_centre": "Дом на културата", "library": "Библиотека",
        "fuel": "Бензинска станица", "pub": "Паб",
        "biergarten": "Пивска градина", "ice_cream": "Сладоледарница",
        "social_facility": "Социјална установа", "townhall": "Општина",
        "doctors": "Лекарска ординација", "pharmacy": "Аптека",
        "place_of_worship": "Црква", "cinema": "Кино", "theatre": "Театар",
        "hospital": "Болница", "marketplace": "Пазар",
        "kindergarten": "Градинка",
    },
    "uk": {
        "toilets": "Громадський туалет", "restaurant": "Ресторан",
        "cafe": "Кафе", "fast_food": "Фастфуд",
        "community_centre": "Будинок культури", "library": "Бібліотека",
        "fuel": "Заправна станція", "pub": "Паб",
        "biergarten": "Пивний сад", "ice_cream": "Морозивня",
        "social_facility": "Соціальна установа", "townhall": "Ратуша",
        "doctors": "Лікарський кабінет", "pharmacy": "Аптека",
        "place_of_worship": "Церква", "cinema": "Кінотеатр",
        "theatre": "Театр", "hospital": "Лікарня",
        "marketplace": "Ринок", "kindergarten": "Дитячий садок",
    },
    "be": {
        "toilets": "Грамадскі туалет", "restaurant": "Рэстаран",
        "cafe": "Кафэ", "fast_food": "Хуткае харчаванне",
        "community_centre": "Дом культуры", "library": "Бібліятэка",
        "fuel": "Заправачная станцыя", "pub": "Паб",
        "biergarten": "Півны сад", "ice_cream": "Кафэ-марозіва",
        "social_facility": "Сацыяльная ўстанова", "townhall": "Ратуша",
        "doctors": "Кабінет урача", "pharmacy": "Аптэка",
        "place_of_worship": "Царква", "cinema": "Кінатэатр",
        "theatre": "Тэатр", "hospital": "Бальніца",
        "marketplace": "Рынак", "kindergarten": "Дзіцячы сад",
    },
    "ca": {
        "toilets": "Lavabo públic", "restaurant": "Restaurant",
        "cafe": "Cafè", "fast_food": "Menjar ràpid",
        "community_centre": "Centre cívic", "library": "Biblioteca",
        "fuel": "Benzinera", "pub": "Pub", "biergarten": "Biergarten",
        "ice_cream": "Gelateria", "social_facility": "Equipament social",
        "townhall": "Ajuntament", "doctors": "Consultori mèdic",
        "pharmacy": "Farmàcia", "place_of_worship": "Església",
        "cinema": "Cinema", "theatre": "Teatre", "hospital": "Hospital",
        "marketplace": "Mercat", "kindergarten": "Escola bressol",
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
    "no": ("januar", "februar", "mars", "april", "mai", "juni", "juli",
           "august", "september", "oktober", "november", "desember"),
    "fi": ("tammikuuta", "helmikuuta", "maaliskuuta", "huhtikuuta",
           "toukokuuta", "kesäkuuta", "heinäkuuta", "elokuuta",
           "syyskuuta", "lokakuuta", "marraskuuta", "joulukuuta"),
    "is": ("janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí",
           "ágúst", "september", "október", "nóvember", "desember"),
    "et": ("jaanuar", "veebruar", "märts", "aprill", "mai", "juuni",
           "juuli", "august", "september", "oktoober", "november",
           "detsember"),
    "lv": ("janvāra", "februāra", "marta", "aprīļa", "maija", "jūnija",
           "jūlija", "augusta", "septembra", "oktobra", "novembra",
           "decembra"),
    "lt": ("sausio", "vasario", "kovo", "balandžio", "gegužės",
           "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio",
           "lapkričio", "gruodžio"),
    "es": ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
           "agosto", "septiembre", "octubre", "noviembre", "diciembre"),
    "pt": ("janeiro", "fevereiro", "março", "abril", "maio", "junho",
           "julho", "agosto", "setembro", "outubro", "novembro",
           "dezembro"),
    "it": ("gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
           "luglio", "agosto", "settembre", "ottobre", "novembre",
           "dicembre"),
    "el": ("Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου",
           "Ιουνίου", "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου",
           "Νοεμβρίου", "Δεκεμβρίου"),
    "sl": ("januarja", "februarja", "marca", "aprila", "maja", "junija",
           "julija", "avgusta", "septembra", "oktobra", "novembra",
           "decembra"),
    "sk": ("januára", "februára", "marca", "apríla", "mája", "júna",
           "júla", "augusta", "septembra", "októbra", "novembra",
           "decembra"),
    "hu": ("január", "február", "március", "április", "május", "június",
           "július", "augusztus", "szeptember", "október", "november",
           "december"),
    "hr": ("siječnja", "veljače", "ožujka", "travnja", "svibnja",
           "lipnja", "srpnja", "kolovoza", "rujna", "listopada",
           "studenoga", "prosinca"),
    "ro": ("ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
           "iulie", "august", "septembrie", "octombrie", "noiembrie",
           "decembrie"),
    "bg": ("януари", "февруари", "март", "април", "май", "юни",
           "юли", "август", "септември", "октомври", "ноември",
           "декември"),
    "sr": ("јануара", "фебруара", "марта", "априла", "маја", "јуна",
           "јула", "августа", "септембра", "октобра", "новембра",
           "децембра"),
    "bs": ("januara", "februara", "marta", "aprila", "maja", "juna",
           "jula", "avgusta", "septembra", "oktobra", "novembra",
           "decembra"),
    "sq": ("janar", "shkurt", "mars", "prill", "maj", "qershor", "korrik",
           "gusht", "shtator", "tetor", "nëntor", "dhjetor"),
    "mk": ("јануари", "февруари", "март", "април", "мај", "јуни", "јули",
           "август", "септември", "октомври", "ноември", "декември"),
    "uk": ("січня", "лютого", "березня", "квітня", "травня", "червня",
           "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"),
    "be": ("студзеня", "лютага", "сакавіка", "красавіка", "мая", "чэрвеня",
           "ліпеня", "жніўня", "верасня", "кастрычніка", "лістапада",
           "снежня"),
    "ca": ("gener", "febrer", "març", "abril", "maig", "juny", "juliol",
           "agost", "setembre", "octubre", "novembre", "desembre"),
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
<p class="muted">Gebaut von einem Papa, der den Wickeltisch immer wieder in der Damentoilette fand. PapaMap ist kostenlos und werbefrei.
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
<p class="muted">Built by a dad who kept finding the changing table in the women's toilet. PapaMap is free and ad-free.
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
<p class="muted">Bygget af en far, der blev ved med at finde puslebordet på dametoilettet. PapaMap er gratis og reklamefrit.
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
<p class="muted">Gebouwd door een vader die de verschoontafel steeds weer op het damestoilet aantrof. PapaMap is gratis en reclamevrij.
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
<p class="muted">Créé par un papa qui trouvait toujours la table à langer dans les toilettes des femmes. PapaMap est gratuit et sans pub.
<a href="https://ko-fi.com/jakubwaller">&#9749; Offrir un café</a>.</p>
""",
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
<p class="muted">Vytvořil táta, který přebalovací pult pořád nacházel na dámských záchodech. PapaMap je zdarma a bez reklam.
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
<p class="muted">Stworzona przez tatę, który przewijak wciąż znajdował w damskiej toalecie. PapaMap jest darmowa i bez reklam.
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
<p class="muted">Byggt av en pappa som hela tiden hittade skötbordet på damtoaletten. PapaMap är gratis och reklamfritt.
<a href="https://ko-fi.com/jakubwaller">&#9749; Bjud på en kaffe</a>.</p>
""",
    },
    "no": {
        "months": _MONTHS["no"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": " ",
        "methods": "methods-no.html",
        "title": "Stellebord {name_in} — PapaMap",
        "h1": "Stellebord {name_in}",
        "meta_desc": ("{tables} steder {name_in} med stellebord, fra "
                      "OpenStreetMap. For {unknown} av dem har ingen "
                      "registrert hvilket rom bordet står i — og nettopp det "
                      "kan rettes."),
        "stand": "Per {date} · Data fra OpenStreetMap",
        "back_map": "Til kartet",
        "empty": ("OpenStreetMap kjenner for øyeblikket ikke ett eneste "
                  "sted {name_in} med stellebord. Det betyr nesten helt "
                  "sikkert: ingen har registrert det ennå."),
        "intro": ("OpenStreetMap kjenner <strong>{tables}</strong> steder "
                  "{name_in} med stellebord. For <strong>{accessible}</strong> "
                  "av dem er det registrert at en pappa også når det — "
                  "herretoalett, unisex-toalett eller eget stellerom. "
                  "<strong>{female_only}</strong> henger bare på "
                  "dametoalettet. Og for <strong>{unknown}</strong> av "
                  "{tables} ({pct}&nbsp;%) har ingen registrert hvilket rom "
                  "bordet står i. Det er de grå nålene på kartet, og de er "
                  "selve oppgaven: spørsmålet besvarer du på stedet på "
                  "under et minutt."),
        "map_cta": "Åpne {name_for} på kartet",
        "numbers_h2": "Tallene for {name_for}",
        "th_things": "Stellebord", "th_places": "Steder", "total": "Totalt",
        "statuses": {"accessible": "Tilgjengelig",
                     "female_only": "Kun dametoalett",
                     "unknown": "Rom ukjent"},
        "toilets_note": ("{In} er det dessuten registrert {toilets} "
                         "offentlige toaletter — de aller fleste uten noen "
                         "opplysning om stellebord. En sammenligning av "
                         "tilbudet kan ikke bygges på det; hvorfor, står i "
                         '<a href="{up}{methods}">metoden</a>.'),
        "named_h2": "Steder med navn",
        "named_intro": ("{named_places} av de {tables} stedene har et navn "
                        "i OpenStreetMap, til sammen {named} ulike. De "
                        "øvrige {unnamed} er nesten utelukkende offentlige "
                        "toaletter uten navn — de står på kartet, men lar "
                        "seg ikke liste meningsfullt her. Filialer av en "
                        "kjede er slått sammen til én rad."),
        "th_place": "Sted", "th_kind": "Type", "th_count": "Steder",
        "help_h2": "Slik hjelper du her",
        "help": ("En grå nål betyr: stellebordet finnes, men ingen har "
                 "registrert hvilket rom det står i. Akkurat det svaret "
                 "mangler pappaer. Alle med en gratis OpenStreetMap-konto "
                 "kan gi det, på stedet, på under et minutt — lenken ved "
                 "nålen åpner MapComplete rett på riktig objekt. Svaret "
                 "havner i OpenStreetMap, tilhører alle og vises her etter "
                 "neste nattlige oppdatering. "
                 '<a href="{up}{methods}#contribute">Steg for steg</a>.'),
        "countries_h2": "PapaMap i andre land",
        "places_unit": "steder",
        "footer": """\
<h2>Data &amp; lisens</h2>
<p class="muted">Alle data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, under <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Denne
siden bygges på nytt hver natt fra en Overpass-spørring og lagrer ingenting om deg.
Slik telles og fargelegges det: <a href="{up}methods-no.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Laget av en pappa som stadig fant stellebordet på dametoalettet. PapaMap er gratis og reklamefritt.
<a href="https://ko-fi.com/jakubwaller">&#9749; Spander en kaffe på meg</a>.</p>
""",
    },
    "fi": {
        "months": _MONTHS["fi"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": " ",
        "methods": "methods-fi.html",
        "title": "Hoitopöydät {name_in} — PapaMap",
        "h1": "Hoitopöydät {name_in}",
        "meta_desc": ("{tables} paikkaa {name_in}, joissa on hoitopöytä, "
                      "OpenStreetMapin mukaan. {unknown} niistä kohdalla ei "
                      "ole merkitty, missä huoneessa pöytä on — ja juuri se "
                      "on korjattavissa."),
        "stand": "Tilanne {date} · Tiedot OpenStreetMapista",
        "back_map": "Kartalle",
        "empty": ("OpenStreetMap ei tällä hetkellä tunne {name_in} "
                  "yhtäkään paikkaa, jossa on hoitopöytä. Se tarkoittaa "
                  "lähes varmasti: kukaan ei ole vielä merkinnyt sitä."),
        "intro": ("OpenStreetMap tuntee {name_in} <strong>{tables}</strong> "
                  "paikkaa, joissa on hoitopöytä. Niistä "
                  "<strong>{accessible}</strong>:ssa on merkitty, että "
                  "isäkin pääsee pöydälle — miesten wc, unisex-wc tai oma "
                  "hoitohuone. <strong>{female_only}</strong> roikkuu vain "
                  "naisten wc:ssä. Ja <strong>{unknown}</strong>:ssa "
                  "{tables}:stä ({pct}&nbsp;%) kukaan ei ole yksinkertaisesti "
                  "merkinnyt, missä huoneessa pöytä on. Ne ovat kartan "
                  "harmaat nastat, ja ne ovat se varsinainen tehtävä: "
                  "kysymykseen vastaa paikan päällä alle minuutissa."),
        "map_cta": "Avaa {name_for} kartalla",
        "numbers_h2": "{name_for} numeroina",
        "th_things": "Hoitopöydät", "th_places": "Paikat",
        "total": "Yhteensä",
        "statuses": {"accessible": "Isä pääsee",
                     "female_only": "Vain naisten WC",
                     "unknown": "Tila tuntematon"},
        "toilets_note": ("{In} OpenStreetMap tuntee myös {toilets} julkista "
                         "wc:tä — valtaosassa niistä ei ole mitään tietoa "
                         "hoitopöydästä. Tarjontavertailua ei voi rehellisesti "
                         "rakentaa siitä; "
                         '<a href="{up}{methods}">menetelmät</a>-sivu '
                         "kertoo miksi."),
        "named_h2": "Paikat, joilla on nimi",
        "named_intro": ("{named_places} paikkaa {tables}:stä kantaa "
                        "OpenStreetMapissa nimen, yhteensä {named} eri "
                        "nimeä. Loput {unnamed} ovat lähes kaikki nimettömiä "
                        "julkisia wc:itä — ne ovat kartalla, mutta niitä ei "
                        "voi järkevästi luetella tässä. Ketjun toimipisteet "
                        "on yhdistetty yhdelle riville."),
        "th_place": "Paikka", "th_kind": "Tyyppi", "th_count": "Paikat",
        "help_h2": "Näin autat",
        "help": ("Harmaa nasta tarkoittaa: hoitopöytä on olemassa, mutta "
                 "kukaan ei ole merkinnyt, missä huoneessa se on. Juuri "
                 "sitä vastausta isät kaipaavat. Sen voi antaa kuka tahansa, "
                 "jolla on ilmainen OpenStreetMap-tili, paikan päällä, alle "
                 "minuutissa — nastan linkki avaa MapCompleten suoraan "
                 "oikeassa kohteessa. Vastaus tallentuu OpenStreetMapiin, "
                 "kuuluu kaikille ja näkyy täällä seuraavan yöllisen "
                 "päivityksen jälkeen. "
                 '<a href="{up}{methods}#contribute">Vaihe vaiheelta</a>.'),
        "countries_h2": "PapaMap muissa maissa",
        "places_unit": "paikkaa",
        "footer": """\
<h2>Data ja lisenssi</h2>
<p class="muted">Kaikki data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMapin
tekijät</a>, lisenssillä <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Tämä
sivu luodaan joka yö uudelleen Overpass-kyselystä eikä se tallenna sinusta mitään.
Näin laskenta ja väritys toimivat: <a href="{up}methods-fi.html">Menetelmät</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Tehnyt isä, joka löysi hoitopöydän yhä uudelleen naisten vessasta. PapaMap on ilmainen eikä siinä ole mainoksia.
<a href="https://ko-fi.com/jakubwaller">&#9749; Tarjoa minulle kahvia</a>.</p>
""",
    },
    "is": {
        "months": _MONTHS["is"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": ".",
        "methods": "methods-is.html",
        "title": "Skiptiborð {name_in} — PapaMap",
        "h1": "Skiptiborð {name_in}",
        "meta_desc": ("{tables} staðir með skiptiborði {name_in}, úr "
                      "OpenStreetMap. Hjá {unknown} þeirra er ekki skráð í "
                      "hvaða rými borðið er — og það er einmitt hægt að "
                      "laga."),
        "stand": "Staða þann {date} · Gögn úr OpenStreetMap",
        "back_map": "Á kortið",
        "empty": ("OpenStreetMap þekkir sem stendur {name_in} engan stað "
                  "með skiptiborði. Það þýðir nánast örugglega: enginn "
                  "hefur skráð hann ennþá."),
        "intro": ("OpenStreetMap þekkir <strong>{tables}</strong> staði "
                  "með skiptiborði {name_in}. Hjá "
                  "<strong>{accessible}</strong> þeirra er skráð að pabbi "
                  "kemst líka að því — karlasalerni, kynhlutlaust salerni "
                  "eða sérstakt skiptiherbergi. "
                  "<strong>{female_only}</strong> hanga aðeins á "
                  "kvennasalerni. Og hjá <strong>{unknown}</strong> af "
                  "{tables} ({pct}%) hefur einfaldlega enginn skráð í "
                  "hvaða rými borðið er. Það eru gráu punktarnir á "
                  "kortinu, og þeir eru raunverulega verkefnið: "
                  "spurningunni er hægt að svara á staðnum á innan við "
                  "mínútu."),
        "map_cta": "Opna {name_for} á kortinu",
        "numbers_h2": "Tölurnar fyrir {name_for}",
        "th_things": "Skiptiborð", "th_places": "Staðir",
        "total": "Samtals",
        "statuses": {"accessible": "Aðgengilegt",
                     "female_only": "Aðeins kvennasalerni",
                     "unknown": "Rými óþekkt"},
        "toilets_note": ("{In} eru líka skráð {toilets} "
                         "almenningssalerni — langflest án nokkurra "
                         "upplýsinga um skiptiborð. Samanburð á framboði "
                         "er ekki hægt að byggja heiðarlega á því; af "
                         'hverju er útskýrt á <a href="{up}{methods}">'
                         "aðferðasíðunni</a>."),
        "named_h2": "Staðir með nafni",
        "named_intro": ("{named_places} af {tables} stöðum bera nafn í "
                        "OpenStreetMap, {named} mismunandi alls. Þau "
                        "{unnamed} sem eftir standa eru nánast öll "
                        "nafnlaus almenningssalerni — þau eru á kortinu, "
                        "en það er ekki vit í að telja þau upp hér. "
                        "Útibú sömu keðju eru sameinuð í eina línu."),
        "th_place": "Staður", "th_kind": "Tegund", "th_count": "Staðir",
        "help_h2": "Svona hjálpar þú hér",
        "help": ("Grár punktur þýðir: skiptiborðið er til, en enginn "
                 "hefur skráð í hvaða rými það er. Þetta svar vantar "
                 "pabba nákvæmlega. Hver sem er með ókeypis "
                 "OpenStreetMap-aðgang getur svarað því, á staðnum, á "
                 "innan við mínútu — tengillinn á punktinum opnar "
                 "MapComplete beint á réttum hlut. Svarið endar í "
                 "OpenStreetMap, tilheyrir öllum og sést hér eftir næstu "
                 'næturuppfærslu. <a href="{up}{methods}#contribute">'
                 "Skref fyrir skref</a>."),
        "countries_h2": "PapaMap í öðrum löndum",
        "places_unit": "staðir",
        "footer": """\
<h2>Gögn og leyfi</h2>
<p class="muted">Öll gögn &copy; <a href="https://www.openstreetmap.org/copyright">framlagsaðilar
OpenStreetMap</a>, undir <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>-leyfinu.
Þessi síða er endurgerð á hverri nóttu úr Overpass-fyrirspurn og geymir ekkert um þig.
Hvernig talið er og litað: <a href="{up}methods-is.html">Aðferð</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Smíðað af pabba sem fann skiptiborðið sífellt á kvennaklósettinu. PapaMap er ókeypis og auglýsingalaust.
<a href="https://ko-fi.com/jakubwaller">&#9749; Bjóða mér upp á kaffi</a>.</p>
""",
    },
    "et": {
        "months": _MONTHS["et"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": " ",
        "methods": "methods-et.html",
        "title": "Mähkimislauad {name_in} — PapaMap",
        "h1": "Mähkimislauad {name_in}",
        "meta_desc": ("{tables} kohta mähkimislauaga {name_in}, "
                      "OpenStreetMapist. {unknown}-l neist pole märgitud, "
                      "millises ruumis laud asub — ja just seda saab "
                      "parandada."),
        "stand": "Seis {date} · Andmed: OpenStreetMap",
        "back_map": "Kaardile",
        "empty": ("OpenStreetMap ei tunne praegu {name_in} ühtegi kohta "
                  "mähkimislauaga. See tähendab peaaegu kindlasti: keegi "
                  "pole seda veel märkinud."),
        "intro": ("OpenStreetMap teab {name_in} <strong>{tables}</strong> "
                  "kohta mähkimislauaga. <strong>{accessible}</strong> "
                  "puhul on märgitud, et ka isa selleni pääseb — meeste "
                  "WC, unisex WC või eraldi mähkimistuba. "
                  "<strong>{female_only}</strong> ripub ainult naiste "
                  "WC-s. Ja <strong>{unknown}</strong> puhul {tables}-st "
                  "({pct}&nbsp;%) pole keegi märkinud, millises ruumis "
                  "laud asub. Need on kaardil hallid nõelad ja need ongi "
                  "see tegelik ülesanne: küsimusele saab kohapeal vastata "
                  "alla minutiga."),
        "map_cta": "Ava {name_for} kaardil",
        "numbers_h2": "{name_for} arvudes",
        "th_things": "Mähkimislauad", "th_places": "Kohad",
        "total": "Kokku",
        "statuses": {"accessible": "Ligipääsetav",
                     "female_only": "Ainult naiste WC",
                     "unknown": "Ruum teadmata"},
        "toilets_note": ("{In} on OpenStreetMapis registreeritud ka "
                         "{toilets} avalikku WC-d — valdav enamus ilma "
                         "igasuguse mähkimislaua infota. Varustatuse "
                         "võrdlust sellest ausalt teha ei saa; miks, on "
                         'kirjas <a href="{up}{methods}">meetodite '
                         "lehel</a>."),
        "named_h2": "Nimega kohad",
        "named_intro": ("{named_places} kohta {tables}-st kannab "
                        "OpenStreetMapis nime, kokku {named} erinevat. "
                        "Ülejäänud {unnamed} on peaaegu eranditult "
                        "nimeta avalikud WC-d — need on kaardil, aga "
                        "siin pole mõtet neid loetleda. Keti harud on "
                        "liidetud üheks reaks."),
        "th_place": "Koht", "th_kind": "Liik", "th_count": "Kohad",
        "help_h2": "Kuidas sina saad aidata",
        "help": ("Hall nõel tähendab: mähkimislaud on olemas, aga keegi "
                 "pole märkinud, millises ruumis see asub. Just seda "
                 "vastust isadel vaja on. Selle saab anda igaüks, kellel "
                 "on tasuta OpenStreetMapi konto, kohapeal, alla "
                 "minutiga — nõela juures olev link avab MapComplete'i "
                 "otse õigel objektil. Vastus jõuab OpenStreetMapi, "
                 "kuulub kõigile ja on siin näha pärast järgmist öist "
                 'uuendust. <a href="{up}{methods}#contribute">'
                 "Samm-sammult</a>."),
        "countries_h2": "PapaMap teistes riikides",
        "places_unit": "kohta",
        "footer": """\
<h2>Andmed ja litsents</h2>
<p class="muted">Kõik andmed &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, litsentsi <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a> alusel. Leht
ehitatakse iga öö uuesti Overpassi päringu põhjal ega salvesta sinu kohta midagi.
Kuidas kohti loetakse ja värvitakse: <a href="{up}methods-et.html">Meetodid</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Loonud isa, kes leidis mähkimislaua ikka ja jälle naiste tualetist. PapaMap on tasuta ja reklaamivaba.
<a href="https://ko-fi.com/jakubwaller">&#9749; Osta mulle kohv</a>.</p>
""",
    },
    "lv": {
        "months": _MONTHS["lv"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": " ",
        "methods": "methods-lv.html",
        "title": "Pārtinamie galdiņi {name_in} — PapaMap",
        "h1": "Pārtinamie galdiņi {name_in}",
        "meta_desc": ("{tables} vietas ar pārtinamo galdiņu {name_in}, no "
                      "OpenStreetMap. {unknown} no tām nav zināms, kurā "
                      "telpā galdiņš atrodas — un tieši to var izlabot."),
        "stand": "Atjaunots {date} · dati no OpenStreetMap",
        "back_map": "Uz karti",
        "empty": ("OpenStreetMap {name_in} pašlaik nezina nevienu vietu ar "
                  "pārtinamo galdiņu. Tas gandrīz noteikti nozīmē: to vēl "
                  "neviens nav ierakstījis."),
        "intro": ("OpenStreetMap {name_in} zina <strong>{tables}</strong> "
                  "vietas ar pārtinamo galdiņu. No tām "
                  "<strong>{accessible}</strong> ir ierakstīts, ka pie "
                  "galdiņa var tikt arī tētis — vīriešu tualete, unisex "
                  "tualete vai atsevišķa pārtinamā telpa. "
                  "<strong>{female_only}</strong> pieejami tikai sieviešu "
                  "tualetē. Un <strong>{unknown}</strong> no {tables} "
                  "({pct}&nbsp;%) vienkārši nav ierakstīts, kurā telpā "
                  "galdiņš atrodas. Tie ir pelēkie punkti kartē — un "
                  "tieši tie ir uzdevums: uz vietas atbildi var sniegt "
                  "ātrāk nekā minūtē."),
        # Latvian declines the name after "atvērt" (Latvija → Latviju), so
        # the button does without it.
        "map_cta": "Atvērt karti",
        "numbers_h2": "{name_for} skaitļos",
        "th_things": "Pārtinamie galdiņi", "th_places": "Vietas",
        "total": "Kopā",
        "statuses": {"accessible": "Pieejams",
                     "female_only": "Tikai sieviešu WC",
                     "unknown": "Telpa nezināma"},
        "toilets_note": ("{In} turklāt ierakstītas {toilets} publiskas "
                         "tualetes — lielākajai daļai bez jebkādas "
                         "informācijas par pārtinamo galdiņu. Godīgu "
                         "nodrošinājuma reitingu no tā izveidot nevar; "
                         'kāpēc, paskaidro <a href="{up}{methods}">'
                         "metodikas lapa</a>."),
        "named_h2": "Vietas ar nosaukumu",
        "named_intro": ("{named_places} no {tables} vietām OpenStreetMap "
                        "ir nosaukums, kopā {named} dažādi. Atlikušās "
                        "{unnamed} gandrīz visas ir publiskas tualetes bez "
                        "nosaukuma — tās ir kartē, bet tās šeit nav "
                        "jēgas uzskaitīt. Ķēdes filiāles ir apvienotas "
                        "vienā rindā."),
        "th_place": "Vieta", "th_kind": "Veids", "th_count": "Vietas",
        "help_h2": "Kā vari palīdzēt",
        "help": ("Pelēks punkts nozīmē: pārtinamais galdiņš eksistē, bet "
                 "neviens nav ierakstījis, kurā telpā tas atrodas. Tieši "
                 "šīs atbildes tētiem trūkst. To var sniegt ikviens ar "
                 "bezmaksas OpenStreetMap kontu, uz vietas, ātrāk nekā "
                 "minūtē — saite pie punkta atver MapComplete tieši pie "
                 "pareizā objekta. Atbilde nonāk OpenStreetMap, pieder "
                 "visiem un pēc nākamās nakts atjaunināšanas būs redzama "
                 'šeit. <a href="{up}{methods}#contribute">Soli pa '
                 "solim</a>."),
        "countries_h2": "PapaMap citās valstīs",
        "places_unit": "vietas",
        "footer": """\
<h2>Dati un licence</h2>
<p class="muted">Visi dati &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
līdzstrādnieki</a>, saskaņā ar <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a> licenci. Šī
lapa katru nakti tiek no jauna izveidota no Overpass vaicājuma un par tevi neko neuzglabā.
Kā tiek skaitīts un iekrāsots: <a href="{up}methods-lv.html">Metodika</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Izveidoja tētis, kurš pārtinamo galdu atkal un atkal atrada sieviešu tualetē. PapaMap ir bezmaksas un bez reklāmām.
<a href="https://ko-fi.com/jakubwaller">&#9749; Nopērc man kafiju</a>.</p>
""",
    },
    "lt": {
        "months": _MONTHS["lt"],
        "date_fmt": "{y} m. {m} {d} d.",
        "num_sep": " ",
        "methods": "methods-lt.html",
        "title": "Pervystymo stalai {name_in} — PapaMap",
        "h1": "Pervystymo stalai {name_in}",
        "meta_desc": ("{tables} vietų {name_in} su pervystymo stalu, iš "
                      "OpenStreetMap. {unknown} iš jų nepažymėta, kurioje "
                      "patalpoje stalas yra — ir būtent tai galima "
                      "pataisyti."),
        "stand": "{date} duomenimis · Duomenys iš OpenStreetMap",
        "back_map": "Į žemėlapį",
        "empty": ("OpenStreetMap {name_in} šiuo metu nežino nė vienos "
                  "vietos su pervystymo stalu. Tai beveik tikrai reiškia: "
                  "dar niekas jo nepažymėjo."),
        "intro": ("OpenStreetMap {name_in} žino <strong>{tables}</strong> "
                  "vietas su pervystymo stalu. Prie "
                  "<strong>{accessible}</strong> iš jų pažymėta, kad tėtis "
                  "irgi gali jį pasiekti — vyrų tualetas, unisex tualetas "
                  "arba atskira pervystymo patalpa. "
                  "<strong>{female_only}</strong> kabo tik moterų tualete. "
                  "O prie <strong>{unknown}</strong> iš {tables} "
                  "({pct}&nbsp;%) niekas paprasčiausiai nepažymėjo, "
                  "kurioje patalpoje stalas yra. Tai pilki smeigtukai "
                  "žemėlapyje, ir jie yra tikrasis uždavinys: į klausimą "
                  "vietoje galima atsakyti per mažiau nei minutę."),
        # Lithuanian declines the name after "Atidaryti" (Lietuva ->
        # Lietuvą), so the button does without it, like the Polish entry.
        "map_cta": "Atidaryti žemėlapį",
        "numbers_h2": "{name_for} skaičiais",
        "th_things": "Pervystymo stalai", "th_places": "Vietos",
        "total": "Iš viso",
        "statuses": {"accessible": "Pasiekiama",
                     "female_only": "Tik moterų tualetas",
                     "unknown": "Patalpa nežinoma"},
        "toilets_note": ("{In} taip pat pažymėti {toilets} vieši tualetai "
                         "— dauguma be jokios informacijos apie pervystymo "
                         "stalą. Aprūpinimo palyginimo iš to sąžiningai "
                         "sudaryti negalima; kodėl, paaiškinta "
                         '<a href="{up}{methods}">metoduose</a>.'),
        "named_h2": "Vietos su pavadinimu",
        "named_intro": ("{named_places} iš {tables} vietų OpenStreetMap "
                        "turi pavadinimą, iš viso {named} skirtingų. "
                        "Likusios {unnamed} yra beveik vien vieši tualetai "
                        "be pavadinimo — jie yra žemėlapyje, bet čia jų "
                        "prasmingai išvardyti negalima. Tinklo filialai "
                        "sujungti į vieną eilutę."),
        "th_place": "Vieta", "th_kind": "Tipas", "th_count": "Vietos",
        "help_h2": "Kaip padėti",
        "help": ("Pilkas smeigtukas reiškia: pervystymo stalas yra, bet "
                 "niekas nepažymėjo, kurioje patalpoje jis stovi. Būtent "
                 "šio atsakymo tėčiams ir trūksta. Jį gali duoti bet kas "
                 "su nemokama OpenStreetMap paskyra, vietoje, per mažiau "
                 "nei minutę — nuoroda prie smeigtuko atidaro MapComplete "
                 "tiesiai ties reikiamu objektu. Atsakymas atsiduria "
                 "OpenStreetMap, priklauso visiems ir čia pasirodo po "
                 "kito nakties atnaujinimo. "
                 '<a href="{up}{methods}#contribute">Žingsnis po '
                 "žingsnio</a>."),
        "countries_h2": "PapaMap kitose šalyse",
        "places_unit": "vietos",
        "footer": """\
<h2>Duomenys ir licencija</h2>
<p class="muted">Visi duomenys &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, pagal <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a> licenciją. Šis
puslapis kas naktį perkuriamas iš Overpass užklausos ir apie tave nesaugo nieko.
Kaip skaičiuojama ir spalvinama: <a href="{up}methods-lt.html">Metodai</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Sukūrė tėtis, kuris vystymo stalą vis rasdavo moterų tualete. PapaMap yra nemokamas ir be reklamos.
<a href="https://ko-fi.com/jakubwaller">&#9749; Pavaišink mane kava</a>.</p>
""",
    },
    "es": {
        "months": _MONTHS["es"],
        "date_fmt": "{d} de {m} de {y}",
        "num_sep": ".",
        "methods": "methods-es.html",
        "title": "Cambiadores {name_in} — PapaMap",
        "h1": "Cambiadores {name_in}",
        "meta_desc": ("{tables} lugares con cambiador de bebés {name_in}, "
                      "según OpenStreetMap. En {unknown} de ellos nadie ha "
                      "registrado en qué sala está el cambiador — y eso es "
                      "exactamente lo que se puede arreglar."),
        "stand": "A fecha de {date} · Datos de OpenStreetMap",
        "back_map": "Volver al mapa",
        "empty": ("OpenStreetMap actualmente no conoce ni un solo lugar con "
                  "cambiador de bebés {name_in}. Eso casi con toda seguridad "
                  "significa: todavía nadie lo ha registrado."),
        "intro": ("OpenStreetMap conoce <strong>{tables}</strong> lugares "
                  "con cambiador de bebés {name_in}. En "
                  "<strong>{accessible}</strong> de ellos alguien ha "
                  "registrado que un papá también puede llegar — baño de "
                  "hombres, baño unisex o una sala de cambio propia. "
                  "<strong>{female_only}</strong> están solo en el baño de "
                  "mujeres. Y en <strong>{unknown}</strong> de {tables} "
                  "({pct}&nbsp;%) nadie ha registrado en qué sala está el "
                  "cambiador. Esos son los pines grises del mapa, y esa es "
                  "la tarea real: la pregunta se responde in situ en menos "
                  "de un minuto."),
        "map_cta": "Abrir {name_for} en el mapa",
        "numbers_h2": "Los números para {name_for}",
        "th_things": "Cambiadores", "th_places": "Lugares",
        "total": "Total",
        "statuses": {"accessible": "Accesible",
                     "female_only": "Solo baño de mujeres",
                     "unknown": "Sala desconocida"},
        "toilets_note": ("{In} además hay registrados {toilets} aseos "
                         "públicos — la inmensa mayoría sin ningún dato "
                         "sobre cambiador. Con eso no se puede construir "
                         "honestamente una clasificación de la oferta; los "
                         '<a href="{up}{methods}">métodos</a> explican por '
                         "qué."),
        "named_h2": "Lugares con nombre",
        "named_intro": ("{named_places} de los {tables} lugares tienen "
                        "nombre en OpenStreetMap, {named} distintos en "
                        "total. Los {unnamed} restantes son casi todos "
                        "aseos públicos sin nombre — están en el mapa, pero "
                        "no tiene sentido listarlos aquí. Las sucursales de "
                        "una cadena se agrupan en una sola fila."),
        "th_place": "Lugar", "th_kind": "Tipo", "th_count": "Lugares",
        "help_h2": "Cómo ayudas aquí",
        "help": ("Un pin gris significa: el cambiador existe, pero nadie ha "
                 "registrado en qué sala está. Esa es exactamente la "
                 "respuesta que les falta a los papás. Cualquiera con una "
                 "cuenta gratuita de OpenStreetMap puede darla, in situ, en "
                 "menos de un minuto — el enlace del pin abre MapComplete "
                 "directamente en el objeto correcto. La respuesta llega a "
                 "OpenStreetMap, es de todos y se ve aquí después de la "
                 "próxima actualización nocturna. "
                 '<a href="{up}{methods}#contribute">Paso a paso</a>.'),
        "countries_h2": "PapaMap en otros países",
        "places_unit": "lugares",
        "footer": """\
<h2>Datos y licencia</h2>
<p class="muted">Todos los datos &copy; <a href="https://www.openstreetmap.org/copyright">colaboradores
de OpenStreetMap</a>, bajo la <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Esta
página se regenera cada noche a partir de una consulta a Overpass y no guarda nada sobre ti.
Cómo se cuenta y se colorea: <a href="{up}methods-es.html">Métodos</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Creado por un padre que siempre encontraba el cambiador en el baño de mujeres. PapaMap es gratis y sin publicidad.
<a href="https://ko-fi.com/jakubwaller">&#9749; Invítame a un café</a>.</p>
""",
    },
    "pt": {
        "months": _MONTHS["pt"],
        "date_fmt": "{d} de {m} de {y}",
        "num_sep": ".",
        "methods": "methods-pt.html",
        "title": "Fraldários {name_in} — PapaMap",
        "h1": "Fraldários {name_in}",
        "meta_desc": ("{tables} locais com fraldário {name_in}, do "
                      "OpenStreetMap. Em {unknown} deles não está "
                      "registado em que sala fica o fraldário — e é "
                      "exatamente isso que se pode corrigir."),
        "stand": "Atualizado a {date} · Dados do OpenStreetMap",
        "back_map": "Para o mapa",
        "empty": ("O OpenStreetMap não conhece atualmente nenhum local "
                  "com fraldário {name_in}. Isso quase de certeza "
                  "significa: ainda ninguém o registou."),
        "intro": ("O OpenStreetMap conhece {name_in} <strong>{tables}</strong> "
                  "locais com fraldário. Em <strong>{accessible}</strong> "
                  "deles está registado que um pai também consegue lá "
                  "chegar — casa de banho masculina, unissexo ou uma sala "
                  "própria para trocar a fralda. <strong>{female_only}</strong> "
                  "estão só na casa de banho feminina. E em "
                  "<strong>{unknown}</strong> de {tables} ({pct}&nbsp;%) "
                  "simplesmente ninguém registou em que sala fica o "
                  "fraldário. Esses são os pins cinzentos no mapa, e são "
                  "eles o verdadeiro trabalho: a pergunta responde-se no "
                  "local em menos de um minuto."),
        "map_cta": "Abrir {name_for} no mapa",
        "numbers_h2": "Os números para {name_for}",
        "th_things": "Fraldários", "th_places": "Locais",
        "total": "Total",
        "statuses": {"accessible": "Acessível",
                     "female_only": "Só WC feminino",
                     "unknown": "Sala desconhecida"},
        "toilets_note": ("{In} estão também registadas {toilets} casas "
                         "de banho públicas — a grande maioria sem "
                         "qualquer informação sobre fraldário. Uma "
                         "classificação de cobertura não se pode construir "
                         "a partir disso; o porquê está explicado nos "
                         '<a href="{up}{methods}">métodos</a>.'),
        "named_h2": "Locais com nome",
        "named_intro": ("{named_places} dos {tables} locais têm um nome "
                        "no OpenStreetMap, {named} diferentes ao todo. Os "
                        "restantes {unnamed} são quase todos WC públicos "
                        "sem nome — estão no mapa, mas não faz sentido "
                        "listá-los aqui. As filiais de uma cadeia estão "
                        "juntas numa só linha."),
        "th_place": "Local", "th_kind": "Tipo", "th_count": "Locais",
        "help_h2": "Como ajudas aqui",
        "help": ("Um pin cinzento significa: o fraldário existe, mas "
                 "ninguém registou em que sala fica. É exatamente essa "
                 "resposta que falta aos pais. Qualquer pessoa com uma "
                 "conta gratuita no OpenStreetMap pode dá-la, no local, "
                 "em menos de um minuto — a ligação no pin abre o "
                 "MapComplete diretamente no objeto certo. A resposta "
                 "fica no OpenStreetMap, pertence a todos e aparece aqui "
                 "depois da próxima atualização noturna. "
                 '<a href="{up}{methods}#contribute">Passo a passo</a>.'),
        "countries_h2": "O PapaMap noutros países",
        "places_unit": "locais",
        "footer": """\
<h2>Dados e licença</h2>
<p class="muted">Todos os dados &copy; <a href="https://www.openstreetmap.org/copyright">colaboradores
do OpenStreetMap</a>, sob a <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Esta
página é gerada de novo todas as noites a partir de uma consulta Overpass e não guarda nada sobre ti.
Como se conta e colore: <a href="{up}methods-pt.html">Métodos</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Criado por um pai que encontrava sempre o fraldário na casa de banho das senhoras. O PapaMap é gratuito e sem anúncios.
<a href="https://ko-fi.com/jakubwaller">&#9749; Oferece-me um café</a>.</p>
""",
    },
    "it": {
        "months": _MONTHS["it"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": ".",
        "methods": "methods-it.html",
        "title": "Fasciatoi {name_in} — PapaMap",
        "h1": "Fasciatoi {name_in}",
        "meta_desc": ("{tables} luoghi con un fasciatoio {name_in}, da "
                      "OpenStreetMap. Per {unknown} di questi nessuno ha "
                      "registrato in quale stanza si trova il fasciatoio "
                      "— ed è esattamente questo che si può correggere."),
        "stand": "Aggiornato al {date} · Dati da OpenStreetMap",
        "back_map": "Alla mappa",
        "empty": ("OpenStreetMap al momento non conosce nemmeno un luogo "
                  "con un fasciatoio {name_in}. Questo significa quasi "
                  "certamente: nessuno l'ha ancora registrato."),
        "intro": ("OpenStreetMap conosce <strong>{tables}</strong> luoghi "
                  "con un fasciatoio {name_in}. Per "
                  "<strong>{accessible}</strong> di questi è stato "
                  "registrato che ci può arrivare anche un papà — un bagno "
                  "uomini, un bagno unisex o una stanza dedicata al "
                  "cambio. <strong>{female_only}</strong> si trovano solo "
                  "nel bagno donne. E per <strong>{unknown}</strong> di "
                  "{tables} ({pct}%) nessuno ha registrato in quale stanza "
                  "si trova il fasciatoio. Questi sono i pin grigi sulla "
                  "mappa, e sono il compito vero e proprio: la domanda si "
                  "risponde sul posto in meno di un minuto."),
        "map_cta": "Apri {name_for} sulla mappa",
        "numbers_h2": "I numeri per {name_for}",
        "th_things": "Fasciatoi", "th_places": "Luoghi",
        "total": "Totale",
        "statuses": {"accessible": "Raggiungibile",
                     "female_only": "Solo bagno donne",
                     "unknown": "Stanza sconosciuta"},
        "toilets_note": ("{In}, OpenStreetMap registra anche {toilets} "
                         "bagni pubblici — la grande maggioranza senza "
                         "alcuna informazione sul fasciatoio. Una "
                         "classifica dell'offerta non si può costruire "
                         "onestamente da questi dati; la "
                         '<a href="{up}{methods}">pagina del metodo</a> '
                         "spiega perché."),
        "named_h2": "Luoghi con un nome",
        "named_intro": ("{named_places} dei {tables} luoghi hanno un nome "
                        "su OpenStreetMap, {named} diversi in totale. I "
                        "restanti {unnamed} sono quasi tutti bagni "
                        "pubblici senza nome — sono sulla mappa, ma qui "
                        "non avrebbe senso elencarli. Le sedi di una "
                        "catena sono raggruppate in una sola riga."),
        "th_place": "Luogo", "th_kind": "Tipo", "th_count": "Luoghi",
        "help_h2": "Come puoi aiutare",
        "help": ("Un pin grigio significa: il fasciatoio esiste, ma "
                 "nessuno ha registrato in quale stanza si trova. È "
                 "esattamente questa la risposta che manca ai papà. "
                 "Chiunque abbia un account OpenStreetMap gratuito può "
                 "darla, sul posto, in meno di un minuto — il link sul "
                 "pin apre MapComplete direttamente sull'oggetto giusto. "
                 "La risposta finisce su OpenStreetMap, appartiene a "
                 "tutti e compare qui dopo il prossimo aggiornamento "
                 "notturno. "
                 '<a href="{up}{methods}#contribute">Passo per passo</a>.'),
        "countries_h2": "PapaMap negli altri paesi",
        "places_unit": "luoghi",
        "footer": """\
<h2>Dati &amp; licenza</h2>
<p class="muted">Tutti i dati &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, sotto licenza <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Questa
pagina viene rigenerata ogni notte da una query Overpass e non salva nulla su di te.
Come si conta e si colora: <a href="{up}methods-it.html">Metodo</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Creata da un papà che trovava sempre il fasciatoio nel bagno delle donne. PapaMap è gratuita e senza pubblicità.
<a href="https://ko-fi.com/jakubwaller">&#9749; Offrimi un caffè</a>.</p>
""",
    },
    "el": {
        "months": _MONTHS["el"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": ".",
        "methods": "methods-el.html",
        "title": "Αλλαξιέρες {name_in} — PapaMap",
        "h1": "Αλλαξιέρες {name_in}",
        "meta_desc": ("{tables} μέρη με αλλαξιέρα {name_in}, από το "
                      "OpenStreetMap. Για {unknown} από αυτά δεν έχει "
                      "καταγραφεί σε ποιον χώρο βρίσκεται η αλλαξιέρα — και "
                      "ακριβώς αυτό μπορεί να διορθωθεί."),
        "stand": "Ενημερώθηκε στις {date} · Δεδομένα από το OpenStreetMap",
        "back_map": "Πίσω στον χάρτη",
        "empty": ("Το OpenStreetMap δεν γνωρίζει προς το παρόν ούτε ένα "
                  "μέρος με αλλαξιέρα {name_in}. Αυτό σχεδόν σίγουρα "
                  "σημαίνει: κανείς δεν το έχει καταγράψει ακόμα."),
        "intro": ("Το OpenStreetMap γνωρίζει <strong>{tables}</strong> μέρη "
                  "με αλλαξιέρα {name_in}. Για <strong>{accessible}</strong> "
                  "από αυτά έχει καταγραφεί ότι φτάνει σε αυτήν και ένας "
                  "μπαμπάς — ανδρική τουαλέτα, τουαλέτα unisex ή ξεχωριστός "
                  "χώρος αλλαγής. <strong>{female_only}</strong> βρίσκονται "
                  "μόνο στη γυναικεία τουαλέτα. Και για "
                  "<strong>{unknown}</strong> από {tables} ({pct}%) απλώς "
                  "κανείς δεν έχει καταγράψει σε ποιον χώρο βρίσκεται η "
                  "αλλαξιέρα. Αυτές είναι οι γκρι καρφίτσες στον χάρτη, και "
                  "είναι το πραγματικό έργο: η ερώτηση απαντιέται επιτόπου "
                  "σε λιγότερο από ένα λεπτό."),
        "map_cta": "Άνοιξε {name_for} στον χάρτη",
        "numbers_h2": "Οι αριθμοί για {name_for}",
        "th_things": "Αλλαξιέρες", "th_places": "Μέρη",
        "total": "Σύνολο",
        "statuses": {"accessible": "Προσβάσιμο",
                     "female_only": "Μόνο γυναικεία τουαλέτα",
                     "unknown": "Άγνωστος χώρος"},
        "toilets_note": ("{In}, το OpenStreetMap καταγράφει επίσης "
                         "{toilets} δημόσιες τουαλέτες — η συντριπτική "
                         "πλειοψηφία χωρίς καμία πληροφορία για αλλαξιέρα. "
                         "Μια κατάταξη επάρκειας δεν μπορεί να χτιστεί τίμια "
                         "από αυτό· η <a href=\"{up}{methods}\">σελίδα "
                         "μεθόδου</a> εξηγεί γιατί."),
        "named_h2": "Μέρη με όνομα",
        "named_intro": ("{named_places} από τα {tables} μέρη έχουν όνομα "
                        "στο OpenStreetMap, {named} διαφορετικά συνολικά. "
                        "Τα υπόλοιπα {unnamed} είναι σχεδόν όλα δημόσιες "
                        "τουαλέτες χωρίς όνομα — βρίσκονται στον χάρτη, "
                        "αλλά δεν έχει νόημα να τις παραθέσουμε εδώ. Τα "
                        "καταστήματα μιας αλυσίδας συγχωνεύονται σε μία "
                        "γραμμή."),
        "th_place": "Μέρος", "th_kind": "Είδος", "th_count": "Μέρη",
        "help_h2": "Πώς βοηθάς εδώ",
        "help": ("Μια γκρι καρφίτσα σημαίνει: η αλλαξιέρα υπάρχει, αλλά "
                 "κανείς δεν έχει καταγράψει σε ποιον χώρο βρίσκεται. "
                 "Ακριβώς αυτή την απάντηση χρειάζονται οι μπαμπάδες. "
                 "Οποιοσδήποτε με έναν δωρεάν λογαριασμό OpenStreetMap "
                 "μπορεί να τη δώσει, επιτόπου, σε λιγότερο από ένα λεπτό "
                 "— ο σύνδεσμος στην καρφίτσα ανοίγει το MapComplete "
                 "ακριβώς στο σωστό αντικείμενο. Η απάντηση καταλήγει στο "
                 "OpenStreetMap, ανήκει σε όλους και εμφανίζεται εδώ μετά "
                 "την επόμενη νυχτερινή ενημέρωση. "
                 '<a href="{up}{methods}#contribute">Βήμα-βήμα</a>.'),
        "countries_h2": "Το PapaMap σε άλλες χώρες",
        "places_unit": "μέρη",
        "footer": """\
<h2>Δεδομένα &amp; άδεια</h2>
<p class="muted">Όλα τα δεδομένα &copy; <a href="https://www.openstreetmap.org/copyright">συνεισφέροντες
του OpenStreetMap</a>, υπό την άδεια <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Αυτή
η σελίδα κατασκευάζεται ξανά κάθε βράδυ από ερώτημα Overpass και δεν αποθηκεύει τίποτα για εσένα.
Πώς μετριούνται και χρωματίζονται τα δεδομένα: <a href="{up}methods-el.html">Μέθοδος</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Φτιαγμένο από έναν μπαμπά που έβρισκε συνέχεια την αλλαξιέρα στην τουαλέτα των γυναικών. Το PapaMap είναι δωρεάν και χωρίς διαφημίσεις.
<a href="https://ko-fi.com/jakubwaller">&#9749; Κέρασέ με έναν καφέ</a>.</p>
""",
    },
    "sl": {
        "months": _MONTHS["sl"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": ".",
        "methods": "methods-sl.html",
        "title": "Previjalne mize {name_in} — PapaMap",
        "h1": "Previjalne mize {name_in}",
        "meta_desc": ("{tables} krajev {name_in} s previjalno mizo, iz "
                      "OpenStreetMap. Pri {unknown} od njih ni zabeleženo, "
                      "v katerem prostoru je miza — in prav to je mogoče "
                      "popraviti."),
        "stand": "Stanje na dan {date} · Podatki iz OpenStreetMap",
        "back_map": "Na zemljevid",
        "empty": ("OpenStreetMap {name_in} trenutno ne pozna niti enega "
                  "kraja s previjalno mizo. To skoraj zagotovo pomeni: je "
                  "še nihče ni zabeležil."),
        "intro": ("OpenStreetMap {name_in} pozna <strong>{tables}</strong> "
                  "krajev s previjalno mizo. Pri "
                  "<strong>{accessible}</strong> od njih je zabeleženo, da "
                  "mizo doseže tudi oče — moško stranišče, unisex "
                  "stranišče ali ločen prostor za previjanje. "
                  "<strong>{female_only}</strong> visi samo v ženskem "
                  "stranišču. In pri <strong>{unknown}</strong> od "
                  "{tables} ({pct}&nbsp;%) preprosto nihče ni zabeležil, v "
                  "katerem prostoru je miza. To so sive bucke na "
                  "zemljevidu, in prav te so pravi izziv: na vprašanje "
                  "odgovoriš na kraju samem v manj kot minuti."),
        # Slovene declines the name after "odpri" (Slovenija → Slovenijo),
        # but the nominative bare name already works after "v številkah",
        # so the button does without it, like the Polish entry.
        "map_cta": "Prikaži na zemljevidu",
        "numbers_h2": "{name_for} v številkah",
        "th_things": "Previjalne mize", "th_places": "Kraji",
        "total": "Skupaj",
        "statuses": {"accessible": "Dostopno",
                     "female_only": "Samo žensko stranišče",
                     "unknown": "Prostor neznan"},
        "toilets_note": ("{In} je poleg tega zabeleženih {toilets} javnih "
                         "stranišč — velika večina brez kakršnekoli "
                         "informacije o previjalni mizi. Poštene "
                         "primerjave oskrbljenosti iz tega ni mogoče "
                         "sestaviti; zakaj, pojasnjuje "
                         '<a href="{up}{methods}">stran o metodah</a>.'),
        "named_h2": "Kraji z imenom",
        "named_intro": ("{named_places} od {tables} krajev ima v "
                        "OpenStreetMap ime, skupaj {named} različnih. "
                        "Preostalih {unnamed} je skoraj v celoti javnih "
                        "stranišč brez imena — na zemljevidu so, a jih "
                        "tukaj ni smiselno naštevati. Podružnice verige so "
                        "združene v eno vrstico."),
        "th_place": "Kraj", "th_kind": "Vrsta", "th_count": "Kraji",
        "help_h2": "Kako lahko pomagaš",
        "help": ("Siva bucka pomeni: previjalna miza obstaja, a nihče ni "
                 "zabeležil, v katerem prostoru je. Prav ta odgovor "
                 "očetom manjka. Da ga lahko kdorkoli z brezplačnim "
                 "računom OpenStreetMap, na kraju samem, v manj kot "
                 "minuti — povezava pri bucki odpre MapComplete naravnost "
                 "na pravem objektu. Odgovor pristane v OpenStreetMap, "
                 "pripada vsem in je viden tukaj po naslednji nočni "
                 'posodobitvi. <a href="{up}{methods}#contribute">Korak '
                 "za korakom</a>."),
        "countries_h2": "PapaMap v drugih državah",
        "places_unit": "krajev",
        "footer": """\
<h2>Podatki in licenca</h2>
<p class="muted">Vsi podatki &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, pod licenco <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ta
stran se vsako noč znova zgradi iz poizvedbe Overpass in o tebi ne shranjuje ničesar.
Kako se šteje in barva: <a href="{up}methods-sl.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Ustvaril očka, ki je previjalno mizo vedno znova našel v ženskem stranišču. PapaMap je brezplačen in brez oglasov.
<a href="https://ko-fi.com/jakubwaller">&#9749; Povabi me na kavo</a>.</p>
""",
    },
    "sk": {
        "months": _MONTHS["sk"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": " ",
        "methods": "methods-sk.html",
        "title": "Prebaľovacie pulty {name_in} — PapaMap",
        "h1": "Prebaľovacie pulty {name_in}",
        "meta_desc": ("{tables} miest s prebaľovacím pultom {name_in}, z "
                      "OpenStreetMap. Pri {unknown} z nich nie je "
                      "zaznamenané, v ktorej miestnosti pult je — a presne "
                      "to sa dá opraviť."),
        "stand": "Stav k {date} · Dáta z OpenStreetMap",
        "back_map": "Na mapu",
        "empty": ("OpenStreetMap {name_in} momentálne nepozná ani jedno "
                  "miesto s prebaľovacím pultom. To takmer isto znamená: "
                  "ešte ho nikto nezaznamenal."),
        "intro": ("OpenStreetMap pozná {name_in} <strong>{tables}</strong> "
                  "miest s prebaľovacím pultom. Pri "
                  "<strong>{accessible}</strong> z nich je zaznamenané, že "
                  "sa k pultu dostane aj otec — pánske WC, unisex WC alebo "
                  "samostatná prebaľovacia miestnosť. "
                  "<strong>{female_only}</strong> visí len na dámskom WC. "
                  "A pri <strong>{unknown}</strong> z {tables} "
                  "({pct}&nbsp;%) jednoducho nikto nezaznamenal, v ktorej "
                  "miestnosti pult je. To sú sivé špendlíky na mape — a "
                  "práve tie sú tou úlohou: otázku zodpovieš na mieste za "
                  "menej ako minútu."),
        "map_cta": "Otvoriť {name_for} na mape",
        "numbers_h2": "{name_for} v číslach",
        "th_things": "Prebaľovacie pulty", "th_places": "Miesta",
        "total": "Spolu",
        "statuses": {"accessible": "Dostupné",
                     "female_only": "Len dámske WC",
                     "unknown": "Neznáma miestnosť"},
        "toilets_note": ("{In} je okrem toho zaznamenaných {toilets} "
                         "verejných WC — prevažná väčšina bez akéhokoľvek "
                         "údaja o prebaľovacom pulte. Porovnanie "
                         "vybavenosti z toho postaviť nejde; prečo, "
                         'vysvetľuje <a href="{up}{methods}">stránka o '
                         "metódach</a>."),
        "named_h2": "Miesta s názvom",
        "named_intro": ("{named_places} z {tables} miest má v "
                        "OpenStreetMap názov, spolu {named} rôznych. "
                        "Zvyšných {unnamed} sú takmer výhradne verejné WC "
                        "bez názvu — na mape sú, no tu ich zmysluplne "
                        "vypísať nejde. Pobočky reťazca sú zlúčené do "
                        "jedného riadku."),
        "th_place": "Miesto", "th_kind": "Typ", "th_count": "Miesta",
        "help_h2": "Ako pomôžeš",
        "help": ("Sivý špendlík znamená: prebaľovací pult existuje, ale "
                 "nikto nezaznamenal, v ktorej miestnosti je. Presne táto "
                 "odpoveď otcom chýba. Dať ju môže ktokoľvek s bezplatným "
                 "účtom OpenStreetMap, na mieste, za menej ako minútu — "
                 "odkaz pri špendlíku otvorí MapComplete rovno na "
                 "správnom objekte. Odpoveď skončí v OpenStreetMap, patrí "
                 "všetkým a po najbližšej nočnej aktualizácii bude vidieť "
                 'tu. <a href="{up}{methods}#contribute">Krok za '
                 "krokom</a>."),
        "countries_h2": "PapaMap v ďalších krajinách",
        "places_unit": "miest",
        "footer": """\
<h2>Dáta a licencia</h2>
<p class="muted">Všetky dáta &copy; <a href="https://www.openstreetmap.org/copyright">prispievatelia
OpenStreetMap</a>, pod licenciou <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>.
Táto stránka sa každú noc znova generuje z dopytu na Overpass a nič si o tebe neukladá.
Ako sa počíta a farbí: <a href="{up}methods-sk.html">Metódy</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Vytvoril otec, ktorý prebaľovací pult stále nachádzal na dámskych toaletách. PapaMap je zadarmo a bez reklám.
<a href="https://ko-fi.com/jakubwaller">&#9749; Pozvi ma na kávu</a>.</p>
""",
    },
    "hu": {
        "months": _MONTHS["hu"],
        "date_fmt": "{y}. {m} {d}.",
        "num_sep": " ",
        "methods": "methods-hu.html",
        "title": "Pelenkázóasztalok {name_in} — PapaMap",
        "h1": "Pelenkázóasztalok {name_in}",
        "meta_desc": ("{tables} hely {name_in} pelenkázóasztallal, az "
                      "OpenStreetMap alapján. {unknown} helynél nem "
                      "jegyezték fel, melyik helyiségben van az asztal — és "
                      "pontosan ez javítható."),
        "stand": "Állapot: {date} · Adatok az OpenStreetMapből",
        "back_map": "A térképre",
        "empty": ("Az OpenStreetMap {name_in} jelenleg egyetlen "
                  "pelenkázóasztallal rendelkező helyet sem ismer. Ez "
                  "szinte biztosan azt jelenti: még senki nem jegyezte "
                  "fel."),
        "intro": ("Az OpenStreetMap {name_in} <strong>{tables}</strong> "
                  "pelenkázóasztallal rendelkező helyet ismer. Ezek közül "
                  "<strong>{accessible}</strong> esetében fel van "
                  "jegyezve, hogy egy apa is eléri — férfi mosdó, unisex "
                  "mosdó vagy külön pelenkázó helyiség. "
                  "<strong>{female_only}</strong> csak a női mosdóban van. "
                  "És a {tables} hely közül <strong>{unknown}</strong> "
                  "esetében ({pct}&nbsp;%) egyszerűen senki nem jegyezte "
                  "fel, melyik helyiségben van az asztal. Ezek a szürke "
                  "jelölők a térképen, és ez az igazi feladat: a kérdésre "
                  "a helyszínen egy percnél is kevesebb idő alatt "
                  "válaszolhatsz."),
        "map_cta": "Megnyitás a térképen",
        "numbers_h2": "{name_for} számokban",
        "th_things": "Pelenkázóasztalok", "th_places": "Helyek",
        "total": "Összesen",
        "statuses": {"accessible": "Elérhető",
                     "female_only": "Csak női mosdó",
                     "unknown": "Ismeretlen helyiség"},
        "toilets_note": ("{In} az OpenStreetMap emellett {toilets} "
                         "nyilvános mosdót is rögzít — a túlnyomó "
                         "többségnél semmilyen pelenkázóasztal-adat nincs. "
                         "Ebből becsületes ellátottsági rangsor nem "
                         'építhető; hogy miért, azt a <a href="{up}'
                         '{methods}">Módszertan</a> oldal elmagyarázza.'),
        "named_h2": "Helyek névvel",
        "named_intro": ("A {tables} hely közül {named_places} visel nevet "
                        "az OpenStreetMapben, összesen {named} "
                        "különbözőt. A maradék {unnamed} szinte kivétel "
                        "nélkül név nélküli nyilvános mosdó — szerepelnek "
                        "a térképen, de itt nincs értelme felsorolni "
                        "őket. Egy lánc üzleteit egy sorba vontuk össze."),
        "th_place": "Hely", "th_kind": "Típus", "th_count": "Helyek",
        "help_h2": "Így segíthetsz",
        "help": ("Egy szürke jelölő azt jelenti: a pelenkázóasztal "
                 "létezik, de senki nem jegyezte fel, melyik helyiségben "
                 "van. Pontosan ez a válasz hiányzik az apáknak. Bárki "
                 "megadhatja egy ingyenes OpenStreetMap-fiókkal, a "
                 "helyszínen, egy percen belül — a jelölőnél lévő link "
                 "egyenesen a megfelelő objektumnál nyitja meg a "
                 "MapCompletet. A válasz az OpenStreetMapbe kerül, "
                 "mindenkié, és a következő éjszakai frissítés után itt "
                 'is látszik. <a href="{up}{methods}#contribute">'
                 "Lépésről lépésre</a>."),
        "countries_h2": "PapaMap más országokban",
        "places_unit": "hely",
        "footer": """\
<h2>Adatok és licenc</h2>
<p class="muted">Minden adat &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
közreműködők</a>, az <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a> licenc alatt. Ez
az oldal minden éjjel újraépül egy Overpass-lekérdezésből, és semmit sem tárol rólad.
Hogyan számolunk és színezünk: <a href="{up}methods-hu.html">Módszertan</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Egy apa készítette, aki a pelenkázót újra és újra a női mosdóban találta. A PapaMap ingyenes és reklámmentes.
<a href="https://ko-fi.com/jakubwaller">&#9749; Hívj meg egy kávéra</a>.</p>
""",
    },
    "hr": {
        "months": _MONTHS["hr"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": ".",
        "methods": "methods-hr.html",
        "title": "Stolovi za previjanje {name_in} — PapaMap",
        "h1": "Stolovi za previjanje {name_in}",
        "meta_desc": ("{tables} mjesta sa stolom za previjanje {name_in}, iz "
                      "OpenStreetMap. Za {unknown} od njih nije zabilježeno "
                      "u kojoj se prostoriji stol nalazi — a upravo je to "
                      "moguće popraviti."),
        "stand": "Stanje {date} · Podaci iz OpenStreetMap",
        "back_map": "Na kartu",
        "empty": ("OpenStreetMap {name_in} trenutačno ne poznaje nijedno "
                  "mjesto sa stolom za previjanje. To gotovo sigurno znači: "
                  "još ga nitko nije zabilježio."),
        "intro": ("OpenStreetMap {name_in} poznaje <strong>{tables}</strong> "
                  "mjesta sa stolom za previjanje. Za "
                  "<strong>{accessible}</strong> od njih zabilježeno je da "
                  "do njega može doći i tata — muško WC, unisex WC ili "
                  "posebna prostorija za previjanje. "
                  "<strong>{female_only}</strong> nalazi se samo u ženskom "
                  "WC-u. A za <strong>{unknown}</strong> od {tables} "
                  "({pct}&nbsp;%) jednostavno nitko nije zabilježio u kojoj "
                  "se prostoriji stol nalazi. To su sivi pinovi na karti, i "
                  "upravo su oni pravi zadatak: na pitanje se na licu mjesta "
                  "odgovara za manje od minute."),
        "map_cta": "Otvori kartu",
        "numbers_h2": "{name_for} u brojkama",
        "th_things": "Stolovi za previjanje", "th_places": "Mjesta",
        "total": "Ukupno",
        "statuses": {"accessible": "Dostupno",
                     "female_only": "Samo žensko WC",
                     "unknown": "Nepoznata prostorija"},
        "toilets_note": ("{In} je osim toga zabilježeno {toilets} javnih "
                         "WC-a — velika većina bez ikakvog podatka o stolu "
                         "za previjanje. Poštenu ljestvicu opremljenosti od "
                         "toga nije moguće napraviti; zašto, objašnjava "
                         '<a href="{up}{methods}">stranica o metodama</a>.'),
        "named_h2": "Mjesta s nazivom",
        "named_intro": ("{named_places} od {tables} mjesta ima naziv u "
                        "OpenStreetMap, ukupno {named} različitih. Preostalih "
                        "{unnamed} gotovo su sve javni WC-i bez naziva — na "
                        "karti jesu, ali ovdje ih nema smisla nabrajati. "
                        "Podružnice jednog lanca sažete su u jedan redak."),
        "th_place": "Mjesto", "th_kind": "Vrsta", "th_count": "Mjesta",
        "help_h2": "Kako ovdje pomažeš",
        "help": ("Sivi pin znači: stol za previjanje postoji, ali nitko "
                 "nije zabilježio u kojoj je prostoriji. Upravo taj odgovor "
                 "tatama nedostaje. Dati ga može bilo tko s besplatnim "
                 "OpenStreetMap računom, na licu mjesta, za manje od minute "
                 "— poveznica na pinu otvara MapComplete izravno na "
                 "ispravnom objektu. Odgovor završava u OpenStreetMap, "
                 "pripada svima i vidljiv je ovdje nakon sljedeće noćne "
                 'nadogradnje. <a href="{up}{methods}#contribute">Korak po '
                 "korak</a>."),
        "countries_h2": "PapaMap u drugim zemljama",
        "places_unit": "mjesta",
        "footer": """\
<h2>Podaci i licencija</h2>
<p class="muted">Svi podaci &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, pod licencijom <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ova
stranica se svake noći iznova generira iz Overpass upita i o tebi ništa ne pohranjuje.
Kako se broji i boji: <a href="{up}methods-hr.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Izradio tata koji je stol za previjanje stalno nalazio u ženskom WC-u. PapaMap je besplatan i bez oglasa.
<a href="https://ko-fi.com/jakubwaller">&#9749; Časti me kavom</a>.</p>
""",
    },
    "ro": {
        "months": _MONTHS["ro"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": ".",
        "methods": "methods-ro.html",
        "title": "Mese de înfășat {name_in} — PapaMap",
        "h1": "Mese de înfășat {name_in}",
        "meta_desc": ("{tables} locuri cu masă de înfășat {name_in}, din "
                      "OpenStreetMap. La {unknown} dintre ele nimeni nu a "
                      "înregistrat în ce încăpere se află masa — și exact "
                      "asta se poate repara."),
        "stand": "Stare la {date} · Date din OpenStreetMap",
        "back_map": "La hartă",
        "empty": ("OpenStreetMap nu cunoaște, în acest moment, niciun loc "
                  "cu masă de înfășat {name_in}. Asta înseamnă aproape "
                  "sigur: încă nu a înregistrat-o nimeni."),
        "intro": ("OpenStreetMap cunoaște <strong>{tables}</strong> locuri "
                  "cu masă de înfășat {name_in}. La "
                  "<strong>{accessible}</strong> dintre ele este "
                  "înregistrat că un tată poate ajunge la ea — toaletă "
                  "bărbați, toaletă unisex sau o încăpere separată pentru "
                  "înfășat. <strong>{female_only}</strong> atârnă doar în "
                  "toaleta femeilor. Iar la <strong>{unknown}</strong> din "
                  "{tables} ({pct}&nbsp;%) pur și simplu nimeni nu a "
                  "înregistrat în ce încăpere se află masa. Acestea sunt "
                  "marcajele gri de pe hartă, și ele sunt adevărata "
                  "sarcină: la fața locului, întrebarea se răspunde în "
                  "mai puțin de un minut."),
        "map_cta": "Deschide {name_for} pe hartă",
        "numbers_h2": "Cifrele pentru {name_for}",
        "th_things": "Mese de înfășat", "th_places": "Locuri",
        "total": "Total",
        "statuses": {"accessible": "Accesibil",
                     "female_only": "Doar toaleta femeilor",
                     "unknown": "Încăpere necunoscută"},
        "toilets_note": ("{In}, OpenStreetMap mai înregistrează și "
                         "{toilets} toalete publice — marea majoritate "
                         "fără nicio informație despre masa de înfășat. Un "
                         "clasament al ofertei nu poate fi construit "
                         'cinstit din asta; <a href="{up}{methods}">pagina '
                         "de metode</a> explică de ce."),
        "named_h2": "Locuri cu nume",
        "named_intro": ("{named_places} din cele {tables} locuri au un "
                        "nume în OpenStreetMap, în total {named} diferite. "
                        "Restul de {unnamed} sunt aproape toate toalete "
                        "publice fără nume — sunt pe hartă, dar nu are "
                        "sens să fie listate aici. Filialele unui lanț "
                        "sunt strânse într-un singur rând."),
        "th_place": "Loc", "th_kind": "Tip", "th_count": "Locuri",
        "help_h2": "Cum ajuți",
        "help": ("Un marcaj gri înseamnă: masa de înfășat există, dar "
                 "nimeni nu a înregistrat în ce încăpere se află. Exact "
                 "acest răspuns le lipsește taților. Îl poate da oricine "
                 "are un cont OpenStreetMap gratuit, la fața locului, în "
                 "mai puțin de un minut — linkul de la marcaj deschide "
                 "MapComplete direct la obiectul corect. Răspunsul ajunge "
                 "în OpenStreetMap, aparține tuturor și apare aici după "
                 "următoarea actualizare de peste noapte. "
                 '<a href="{up}{methods}#contribute">Pas cu pas</a>.'),
        "countries_h2": "PapaMap în alte țări",
        "places_unit": "locuri",
        "footer": """\
<h2>Date &amp; licență</h2>
<p class="muted">Toate datele &copy; <a href="https://www.openstreetmap.org/copyright">contribuitorii
OpenStreetMap</a>, sub <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Această
pagină este regenerată în fiecare noapte dintr-o interogare Overpass și nu stochează nimic despre tine.
Cum se numără și se colorează: <a href="{up}methods-ro.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Creat de un tată care găsea mereu masa de înfășat în toaleta femeilor. PapaMap este gratuit și fără reclame.
<a href="https://ko-fi.com/jakubwaller">&#9749; Oferă-mi o cafea</a>.</p>
""",
    },
    "bg": {
        "months": _MONTHS["bg"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": " ",
        "methods": "methods-bg.html",
        "title": "Маси за повиване {name_in} — PapaMap",
        "h1": "Маси за повиване {name_in}",
        "meta_desc": ("{tables} места с маса за повиване {name_in}, от "
                      "OpenStreetMap. За {unknown} от тях никой не е "
                      "отбелязал в коя стая е масата — а точно това може "
                      "да се поправи."),
        "stand": "Към {date} · Данни от OpenStreetMap",
        "back_map": "Към картата",
        "empty": ("OpenStreetMap не познава {name_in} нито едно място с "
                  "маса за повиване. Това почти сигурно означава: никой "
                  "още не го е отбелязал."),
        "intro": ("OpenStreetMap познава {name_in} <strong>{tables}</strong> "
                  "места с маса за повиване. За <strong>{accessible}</strong> "
                  "от тях е отбелязано, че и татко може да стигне до нея — "
                  "мъжка тоалетна, унисекс тоалетна или отделна стая за "
                  "повиване. <strong>{female_only}</strong> висят само в "
                  "дамската тоалетна. А за <strong>{unknown}</strong> от "
                  "{tables} ({pct}&nbsp;%) просто никой не е отбелязал в "
                  "коя стая е масата. Това са сивите маркери на картата, и "
                  "те са истинската задача: въпросът се отговаря на място "
                  "за по-малко от минута."),
        "map_cta": "Отвори {name_for} на картата",
        "numbers_h2": "Числата за {name_for}",
        "th_things": "Маси за повиване", "th_places": "Места",
        "total": "Общо",
        "statuses": {"accessible": "Достъпно",
                     "female_only": "Само дамска тоалетна",
                     "unknown": "Непозната стая"},
        "toilets_note": ("{In} освен това са отбелязани {toilets} обществени "
                         "тоалетни — по-голямата част без никаква "
                         "информация за маса за повиване. Класация на "
                         "наличността не може да се изгради от това; защо "
                         'не, е обяснено в <a href="{up}{methods}">'
                         "методите</a>."),
        "named_h2": "Места с име",
        "named_intro": ("{named_places} от {tables} места носят име в "
                        "OpenStreetMap, общо {named} различни. Останалите "
                        "{unnamed} са почти изцяло обществени тоалетни без "
                        "име — те са на картата, но тук няма смисъл да се "
                        "изброяват. Обектите на една верига са обединени в "
                        "един ред."),
        "th_place": "Място", "th_kind": "Вид", "th_count": "Места",
        "help_h2": "Как да помогнеш",
        "help": ("Сив маркер означава: масата за повиване съществува, но "
                 "никой не е отбелязал в коя стая е. Точно този отговор "
                 "липсва на татковците. Може да го даде всеки с безплатен "
                 "акаунт в OpenStreetMap, на място, за по-малко от минута "
                 "— връзката при маркера отваря MapComplete директно на "
                 "правилния обект. Отговорът отива в OpenStreetMap, "
                 "принадлежи на всички и се вижда тук след следващата "
                 'нощна актуализация. <a href="{up}{methods}#contribute">'
                 "Стъпка по стъпка</a>."),
        "countries_h2": "PapaMap в други държави",
        "places_unit": "места",
        "footer": """\
<h2>Данни и лиценз</h2>
<p class="muted">Всички данни &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, под <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Страницата
се генерира наново всяка нощ от заявка към Overpass и не съхранява нищо за теб.
Как се брои и оцветява: <a href="{up}methods-bg.html">Методи</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Създаден от татко, който все намираше масата за повиване в дамската тоалетна. PapaMap е безплатен и без реклами.
<a href="https://ko-fi.com/jakubwaller">&#9749; Почерпи ме с кафе</a>.</p>
""",
    },
    "sr": {
        "months": _MONTHS["sr"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": ".",
        "methods": "methods-sr.html",
        "title": "Столови за превијање {name_in} — PapaMap",
        "h1": "Столови за превијање {name_in}",
        "meta_desc": ("{tables} места {name_in} са столом за превијање, из "
                      "OpenStreetMap-а. За {unknown} од њих није забележено "
                      "у којој се просторији сто налази — а управо то може "
                      "да се исправи."),
        "stand": "Стање {date} · Подаци из OpenStreetMap-а",
        "back_map": "На мапу",
        "empty": ("OpenStreetMap {name_in} тренутно не зна ниједно место "
                  "са столом за превијање. То готово сигурно значи: још га "
                  "нико није забележио."),
        "intro": ("OpenStreetMap {name_in} зна за <strong>{tables}</strong> "
                  "места са столом за превијање. За "
                  "<strong>{accessible}</strong> од њих је забележено да "
                  "тата заиста може до њега — мушки тоалет, унисекс тоалет "
                  "или посебна просторија за превијање. "
                  "<strong>{female_only}</strong> висе само у женском "
                  "тоалету. А за <strong>{unknown}</strong> од {tables} "
                  "({pct}&nbsp;%) једноставно нико није забележио у којој "
                  "се просторији сто налази. То су сиви пинови на мапи, и "
                  "они су прави задатак: на лицу места на то питање "
                  "одговараш за мање од минута."),
        # Serbian declines the name after "прикажи"/"отвори" (Србија →
        # Србију, Црна Гора → Црну Гору), so the button does without it,
        # same escape hatch as Polish.
        "map_cta": "Прикажи на мапи",
        "numbers_h2": "Бројке за {name_for}",
        "th_things": "Столови за превијање", "th_places": "Места",
        "total": "Укупно",
        "statuses": {"accessible": "Доступно",
                     "female_only": "Само женски тоалет",
                     "unknown": "Непозната просторија"},
        "toilets_note": ("{In} је осим тога забележено {toilets} јавних "
                         "тоалета — огромна већина без икаквог податка о "
                         "столу за превијање. Поштено поређење "
                         "опремљености из тога не може да се направи; "
                         'зашто, објашњава <a href="{up}{methods}">страница '
                         "о методама</a>."),
        "named_h2": "Места са именом",
        "named_intro": ("{named_places} од {tables} места носи име у "
                        "OpenStreetMap-у, укупно {named} различитих. "
                        "Преосталих {unnamed} су скоро сви безимени јавни "
                        "тоалети — они су на мапи, али их овде нема смисла "
                        "набрајати. Огранци исте фирме су спојени у један "
                        "ред."),
        "th_place": "Место", "th_kind": "Врста", "th_count": "Места",
        "help_h2": "Како можеш да помогнеш",
        "help": ("Сиви пин значи: сто за превијање постоји, али нико није "
                 "забележио у којој је просторији. Управо тај одговор "
                 "недостаје татама. Може га дати свако ко има бесплатан "
                 "OpenStreetMap налог, на лицу места, за мање од минута — "
                 "линк на пину отвара MapComplete тачно на том објекту. "
                 "Одговор иде у OpenStreetMap, припада свима и појављује "
                 "се овде после следећег ноћног ажурирања. "
                 '<a href="{up}{methods}#contribute">Корак по корак</a>.'),
        "countries_h2": "PapaMap у другим земљама",
        "places_unit": "места",
        "footer": """\
<h2>Подаци и лиценца</h2>
<p class="muted">Сви подаци &copy; <a href="https://www.openstreetmap.org/copyright">сарадници
OpenStreetMap-а</a>, под лиценцом <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ова
страница се сваке ноћи изнова генерише из Overpass упита и о теби ништа не чува.
Како се броји и боји: <a href="{up}methods-sr.html">Методе</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Направио тата који је сто за повијање стално налазио у женском тоалету. PapaMap је бесплатан и без реклама.
<a href="https://ko-fi.com/jakubwaller">&#9749; Части ме кафом</a>.</p>
""",
    },
    "bs": {
        "months": _MONTHS["bs"],
        "date_fmt": "{d}. {m} {y}",
        "num_sep": ".",
        "methods": "methods-bs.html",
        "title": "Stolovi za previjanje {name_in} — PapaMap",
        "h1": "Stolovi za previjanje {name_in}",
        "meta_desc": ("{tables} mjesta sa stolom za previjanje {name_in}, "
                      "sa OpenStreetMapa. Za {unknown} od njih niko nije "
                      "zabilježio u kojoj se prostoriji sto nalazi — a "
                      "upravo to se da popraviti."),
        "stand": "Stanje na dan {date} · Podaci sa OpenStreetMapa",
        "back_map": "Na kartu",
        "empty": ("OpenStreetMap {name_in} trenutno ne zna ni za jedno "
                  "mjesto sa stolom za previjanje. To skoro sigurno znači: "
                  "niko ga još nije zabilježio."),
        "intro": ("OpenStreetMap {name_in} zna za <strong>{tables}</strong> "
                  "mjesta sa stolom za previjanje. Za "
                  "<strong>{accessible}</strong> od njih je zabilježeno da "
                  "tata zaista može doći do njega — muški WC, unisex WC ili "
                  "posebna prostorija za previjanje. "
                  "<strong>{female_only}</strong> vise samo u ženskom WC-u. "
                  "A za <strong>{unknown}</strong> od {tables} ({pct}%) "
                  "niko nije zabilježio u kojoj se prostoriji sto nalazi. "
                  "To su sive oznake na karti, i one su pravi zadatak: na "
                  "licu mjesta na to pitanje odgovoriš za manje od "
                  "minute."),
        "map_cta": "Otvori {name_for} na karti",
        "numbers_h2": "{name_for} u brojevima",
        "th_things": "Stolovi za previjanje", "th_places": "Mjesta",
        "total": "Ukupno",
        "statuses": {"accessible": "Dostupno tati",
                     "female_only": "Samo žensko WC",
                     "unknown": "Prostorija nepoznata"},
        "toilets_note": ("{In}, OpenStreetMap bilježi i {toilets} javnih "
                         "WC-a — velika većina bez ikakvog podatka o stolu "
                         "za previjanje. Rang lista opremljenosti se iz "
                         "toga ne može pošteno napraviti; zašto, objašnjeno "
                         'je u <a href="{up}{methods}">metodama</a>.'),
        "named_h2": "Mjesta sa imenom",
        "named_intro": ("{named_places} od {tables} mjesta u OpenStreetMap "
                        "ima ime, ukupno {named} različitih. Preostalih "
                        "{unnamed} su skoro sve javni WC-i bez imena — na "
                        "karti jesu, ali ovdje ih nema smisla nabrajati. "
                        "Poslovnice jednog lanca su spojene u jedan red."),
        "th_place": "Mjesto", "th_kind": "Vrsta", "th_count": "Mjesta",
        "help_h2": "Kako pomažeš",
        "help": ("Siva oznaka znači: sto za previjanje postoji, ali niko "
                 "nije zabilježio u kojoj je prostoriji. Baš taj odgovor "
                 "tatama nedostaje. Da ga da može bilo ko sa besplatnim "
                 "OpenStreetMap nalogom, na licu mjesta, za manje od "
                 "minute — link na oznaci otvara MapComplete tačno na "
                 "pravom objektu. Odgovor ide u OpenStreetMap, pripada "
                 "svima i pojavljuje se ovdje poslije sljedećeg noćnog "
                 'ažuriranja. <a href="{up}{methods}#contribute">Korak po '
                 "korak</a>."),
        "countries_h2": "PapaMap u drugim zemljama",
        "places_unit": "mjesta",
        "footer": """\
<h2>Podaci &amp; licenca</h2>
<p class="muted">Svi podaci &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, pod licencom <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ova
stranica se svake noći iznova generiše iz Overpass upita i ne čuva ništa o tebi.
Kako se broji i boji: <a href="{up}methods-bs.html">Metode</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Napravio tata koji je sto za previjanje stalno nalazio u ženskom toaletu. PapaMap je besplatan i bez reklama.
<a href="https://ko-fi.com/jakubwaller">&#9749; Časti me kafom</a>.</p>
""",
    },
    "sq": {
        "months": _MONTHS["sq"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": ".",
        "methods": "methods-sq.html",
        "title": "Tavolina ndërrimi {name_in} — PapaMap",
        "h1": "Tavolina ndërrimi {name_in}",
        "meta_desc": ("{tables} vende {name_in} me tavolinë ndërrimi, nga "
                      "OpenStreetMap. Për {unknown} prej tyre askush nuk ka "
                      "shënuar në cilën dhomë ndodhet tavolina — dhe "
                      "pikërisht kjo mund të rregullohet."),
        "stand": "Më {date} · Të dhëna nga OpenStreetMap",
        "back_map": "Te harta",
        "empty": ("OpenStreetMap {name_in} nuk njeh aktualisht asnjë vend "
                  "me tavolinë ndërrimi. Kjo pothuajse me siguri do të "
                  "thotë: ende askush nuk ka shënuar një të tillë."),
        "intro": ("OpenStreetMap njeh {name_in} <strong>{tables}</strong> "
                  "vende me tavolinë ndërrimi. Për "
                  "<strong>{accessible}</strong> prej tyre është shënuar se "
                  "një baba mund ta arrijë vërtet — tualeti i burrave, "
                  "tualet unisex ose një dhomë e veçantë ndërrimi. "
                  "<strong>{female_only}</strong> ndodhen vetëm te tualeti "
                  "i grave. Kurse për <strong>{unknown}</strong> nga "
                  "{tables} ({pct}%) askush nuk ka shënuar në cilën dhomë "
                  "ndodhet tavolina. Këto janë shenjuesit gri në hartë, "
                  "dhe ato janë detyra e vërtetë: pyetjes i përgjigjesh "
                  "në vend për më pak se një minutë."),
        "map_cta": "Hap {name_for} në hartë",
        "numbers_h2": "Numrat për {name_for}",
        "th_things": "Tavolina ndërrimi", "th_places": "Vende",
        "total": "Gjithsej",
        "statuses": {"accessible": "E arritshme",
                     "female_only": "Vetëm tualeti i grave",
                     "unknown": "Dhomë e panjohur"},
        "toilets_note": ("{In}, OpenStreetMap regjistron edhe {toilets} "
                         "tualete publike — shumica dërrmuese pa asnjë të "
                         "dhënë për tavolinë ndërrimi. Nga kjo nuk mund të "
                         "ndërtohet ndershmërisht një renditje vlerësimi; "
                         '<a href="{up}{methods}">faqja e metodologjisë</a> '
                         "shpjegon pse."),
        "named_h2": "Vende me emër",
        "named_intro": ("{named_places} nga {tables} vendet kanë një emër "
                        "në OpenStreetMap, {named} të ndryshëm gjithsej. "
                        "{unnamed} e mbetura janë pothuajse të gjitha "
                        "tualete publike pa emër — ato janë në hartë, por "
                        "nuk ka kuptim t'i listosh këtu. Degët e një "
                        "zinxhiri bashkohen në një rresht të vetëm."),
        "th_place": "Vendi", "th_kind": "Lloji", "th_count": "Vende",
        "help_h2": "Si ndihmon këtu",
        "help": ("Një shenjues gri do të thotë: tavolina e ndërrimit "
                 "ekziston, por askush nuk ka shënuar në cilën dhomë "
                 "ndodhet. Pikërisht kjo përgjigje u mungon baballarëve. "
                 "Këdo me një llogari falas OpenStreetMap mund ta japë, në "
                 "vend, për më pak se një minutë — lidhja te shenjuesi hap "
                 "MapComplete pikërisht te objekti i saktë. Përgjigja "
                 "përfundon në OpenStreetMap, i përket të gjithëve dhe "
                 "shfaqet këtu pas përditësimit të ardhshëm të natës. "
                 '<a href="{up}{methods}#contribute">Hap pas hapi</a>.'),
        "countries_h2": "PapaMap në vende të tjera",
        "places_unit": "vende",
        "footer": """\
<h2>Të dhëna &amp; licencë</h2>
<p class="muted">Të gjitha të dhënat &copy; <a href="https://www.openstreetmap.org/copyright">kontribuesit e
OpenStreetMap</a>, nën licencën <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Kjo
faqe rigjenerohet çdo natë nga një kërkesë Overpass dhe nuk ruan asgjë për ty.
Si numërohet dhe ngjyroset: <a href="{up}methods-sq.html">Metodologjia</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Ndërtuar nga një baba që tavolinën e ndërrimit e gjente gjithnjë në tualetin e grave. PapaMap është falas dhe pa reklama.
<a href="https://ko-fi.com/jakubwaller">&#9749; Blimë një kafe</a>.</p>
""",
    },
    "mk": {
        "months": _MONTHS["mk"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": ".",
        "methods": "methods-mk.html",
        "title": "Маси за пеленање {name_in} — PapaMap",
        "h1": "Маси за пеленање {name_in}",
        "meta_desc": ("{tables} места со маса за пеленање {name_in}, од "
                      "OpenStreetMap. За {unknown} од нив не е запишано во "
                      "која просторија е масата — а токму тоа може да се "
                      "поправи."),
        "stand": "Состојба: {date} · Податоци од OpenStreetMap",
        "back_map": "На мапата",
        "empty": ("OpenStreetMap во моментов не знае ниту едно место со "
                  "маса за пеленање {name_in}. Тоа скоро сигурно значи: "
                  "сè уште никој не го забележал."),
        "intro": ("OpenStreetMap знае за <strong>{tables}</strong> места со "
                  "маса за пеленање {name_in}. За "
                  "<strong>{accessible}</strong> од нив е запишано дека до "
                  "масата навистина може да стигне татко — машки тоалет, "
                  "унисекс тоалет или посебна просторија за пеленање. "
                  "<strong>{female_only}</strong> висат само во женскиот "
                  "тоалет. А за <strong>{unknown}</strong> од {tables} "
                  "({pct}%) никој не запишал во која просторија е масата. "
                  "Тоа се сивите точки на мапата, и токму тие се вистинската "
                  "задача: прашањето бара помалку од минута за да се "
                  "одговори на лице место."),
        "map_cta": "Отвори {name_for} на мапата",
        "numbers_h2": "Бројките за {name_for}",
        "th_things": "Маси за пеленање", "th_places": "Места",
        "total": "Вкупно",
        "statuses": {"accessible": "Достапно",
                     "female_only": "Само женски тоалет",
                     "unknown": "Просторија непозната"},
        "toilets_note": ("{In}, OpenStreetMap исто така бележи {toilets} "
                         "јавни тоалети — огромното мнозинство без никаков "
                         "податок за маса за пеленање. Рангирање на "
                         "опременост чесно не може да се направи од тоа; "
                         '<a href="{up}{methods}">страницата со методи</a> '
                         "објаснува зошто."),
        "named_h2": "Места со име",
        "named_intro": ("{named_places} од {tables} места имаат име во "
                        "OpenStreetMap, вкупно {named} различни. "
                        "Преостанатите {unnamed} се речиси сите неименувани "
                        "јавни тоалети — тие се на мапата, но нема смислено "
                        "да се набројат тука. Ограноците на синџир се "
                        "споени во еден ред."),
        "th_place": "Место", "th_kind": "Тип", "th_count": "Места",
        "help_h2": "Како помагаш тука",
        "help": ("Сива точка значи: масата за пеленање постои, но никој не "
                 "запишал во која просторија е. Токму тој одговор им "
                 "недостасува на татковците. Може да го даде секој со "
                 "бесплатна сметка на OpenStreetMap, на лице место, за "
                 "помалку од минута — линкот на точката ги отвора "
                 "MapComplete точно на вистинскиот објект. Одговорот "
                 "завршува во OpenStreetMap, им припаѓа на сите и се "
                 "прикажува тука по следната ноќна надградба. "
                 '<a href="{up}{methods}#contribute">Чекор по чекор</a>.'),
        "countries_h2": "PapaMap во други земји",
        "places_unit": "места",
        "footer": """\
<h2>Податоци &amp; лиценца</h2>
<p class="muted">Сите податоци &copy; <a href="https://www.openstreetmap.org/copyright">соработниците на
OpenStreetMap</a>, под лиценцата <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Оваа
страница се преизградува секоја ноќ од Overpass-барање и не чува ништо за тебе.
Како се брои и обојува: <a href="{up}methods-mk.html">Методи</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Направен од татко кој масата за повивање постојано ја наоѓаше во женскиот тоалет. PapaMap е бесплатен и без реклами.
<a href="https://ko-fi.com/jakubwaller">&#9749; Почерпи ме со кафе</a>.</p>
""",
    },
    "uk": {
        "months": _MONTHS["uk"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": " ",
        "methods": "methods-uk.html",
        "title": "Пеленальні столики {name_in} — PapaMap",
        "h1": "Пеленальні столики {name_in}",
        "meta_desc": ("{tables} місць із пеленальним столиком {name_in}, з "
                      "OpenStreetMap. Для {unknown} із них не зафіксовано, "
                      "у якому приміщенні столик — і саме це можна "
                      "виправити."),
        "stand": "Станом на {date} · Дані з OpenStreetMap",
        "back_map": "До карти",
        "empty": ("OpenStreetMap {name_in} наразі не знає жодного місця з "
                  "пеленальним столиком. Це майже напевно означає: його ще "
                  "ніхто не зафіксував."),
        "intro": ("OpenStreetMap знає {name_in} <strong>{tables}</strong> "
                  "місць із пеленальним столиком. Для "
                  "<strong>{accessible}</strong> із них зафіксовано, що "
                  "тато справді дістанеться — чоловічий туалет, "
                  "унісекс-туалет або окрема кімната для пеленання. "
                  "<strong>{female_only}</strong> висять лише в жіночому "
                  "туалеті. А для <strong>{unknown}</strong> із {tables} "
                  "({pct}&nbsp;%) просто ніхто не зафіксував, у якому "
                  "приміщенні столик. Це сірі позначки на карті — і саме "
                  "вони є справжнім завданням: відповісти на це питання "
                  "на місці можна менш ніж за хвилину."),
        # Ukrainian declines the name after "Відкрити" (Україна →
        # Україну), so the button does without it — same escape hatch as
        # the Polish entry.
        "map_cta": "Показати на карті",
        "numbers_h2": "{name_for} у цифрах",
        "th_things": "Пеленальні столики", "th_places": "Місця",
        "total": "Разом",
        "statuses": {"accessible": "Доступний",
                     "female_only": "Лише жіночий туалет",
                     "unknown": "Приміщення невідоме"},
        "toilets_note": ("{In} OpenStreetMap також фіксує {toilets} "
                         "громадських туалетів — переважна більшість без "
                         "жодної інформації про пеленальний столик. "
                         "Чесний рейтинг забезпеченості з цього не "
                         "побудувати; чому — пояснює "
                         '<a href="{up}{methods}">сторінка методів</a>.'),
        "named_h2": "Місця з назвою",
        "named_intro": ("{named_places} із {tables} місць мають назву в "
                        "OpenStreetMap, {named} різних загалом. Решта "
                        "{unnamed} — це майже завжди громадські туалети "
                        "без назви: вони є на карті, але наводити їх тут "
                        "списком немає сенсу. Філії мережі об'єднані в "
                        "один рядок."),
        "th_place": "Місце", "th_kind": "Тип", "th_count": "Місця",
        "help_h2": "Як ти можеш допомогти",
        "help": ("Сіра позначка означає: пеленальний столик існує, але "
                 "ніхто не зафіксував, у якому приміщенні він "
                 "розташований. Саме цієї відповіді бракує татам. Дати її "
                 "може будь-хто з безкоштовним акаунтом OpenStreetMap, на "
                 "місці, менш ніж за хвилину — посилання біля позначки "
                 "одразу відкриває MapComplete на потрібному об'єкті. "
                 "Відповідь потрапляє в OpenStreetMap, належить усім і "
                 "з'явиться тут після наступного нічного оновлення. "
                 '<a href="{up}{methods}#contribute">Крок за кроком</a>.'),
        "countries_h2": "PapaMap в інших країнах",
        "places_unit": "місць",
        "footer": """\
<h2>Дані та ліцензія</h2>
<p class="muted">Усі дані &copy; <a href="https://www.openstreetmap.org/copyright">учасники
OpenStreetMap</a>, за ліцензією <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Ця
сторінка перебудовується щоночі з Overpass-запиту і не зберігає нічого про тебе.
Як усе рахується й фарбується: <a href="{up}methods-uk.html">Методи</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Зробив тато, який раз у раз знаходив пеленальний столик у жіночому туалеті. PapaMap безкоштовний і без реклами.
<a href="https://ko-fi.com/jakubwaller">&#9749; Пригости мене кавою</a>.</p>
""",
    },
    "be": {
        "months": _MONTHS["be"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": " ",
        "methods": "methods-be.html",
        "title": "Сталы для спавівання {name_in} — PapaMap",
        "h1": "Сталы для спавівання {name_in}",
        "meta_desc": ("{tables} месцаў {name_in} са сталом для спавівання, "
                      "з OpenStreetMap. У {unknown} з іх не пазначана, у "
                      "якім памяшканні стаіць стол — і менавіта гэта можна "
                      "паправіць."),
        "stand": "Стан на {date} · Дадзеныя з OpenStreetMap",
        "back_map": "Да карты",
        "empty": ("OpenStreetMap {name_in} на дадзены момант не ведае "
                  "ніводнага месца са сталом для спавівання. Гэта амаль "
                  "напэўна азначае: яго яшчэ ніхто не занёс на карту."),
        "intro": ("OpenStreetMap ведае {name_in} <strong>{tables}</strong> "
                  "месцаў са сталом для спавівання. У "
                  "<strong>{accessible}</strong> з іх пазначана, што тата "
                  "таксама можа да яго дабрацца — мужчынскі туалет, "
                  "унісэкс-туалет або асобны пакой для спавівання. "
                  "<strong>{female_only}</strong> вісяць толькі ў жаночым "
                  "туалеце. А ў <strong>{unknown}</strong> з {tables} "
                  "({pct}&nbsp;%) проста ніхто не пазначыў, у якім "
                  "памяшканні стаіць стол. Гэта шэрыя шпількі на карце, і "
                  "менавіта яны — сапраўдная задача: на гэтае пытанне "
                  "адказваюць на месцы менш чым за хвіліну."),
        "map_cta": "Адкрыць {name_for} на карце",
        "numbers_h2": "{name_for} у лічбах",
        "th_things": "Сталы для спавівання", "th_places": "Месцы",
        "total": "Разам",
        "statuses": {"accessible": "Даступна",
                     "female_only": "Толькі жаночы туалет",
                     "unknown": "Невядомае памяшканне"},
        "toilets_note": ("{In} таксама зафіксавана {toilets} грамадскіх "
                         "туалетаў — пераважная большасць без якой-небудзь "
                         "інфармацыі пра стол для спавівання. Сумленна "
                         "пабудаваць з гэтага рэйтынг забяспечанасці "
                         "немагчыма; чаму — тлумачыць "
                         '<a href="{up}{methods}">старонка метадаў</a>.'),
        "named_h2": "Месцы з назвамі",
        "named_intro": ("{named_places} з {tables} месцаў маюць назву ў "
                        "OpenStreetMap, разам {named} розных. Астатнія "
                        "{unnamed} — гэта амаль заўсёды грамадскія туалеты "
                        "без назвы: яны ёсць на карце, але пералічваць іх "
                        "тут сэнсу няма. Філіялы адной сеткі аб'яднаны ў "
                        "адзін радок."),
        "th_place": "Месца", "th_kind": "Тып", "th_count": "Месцы",
        "help_h2": "Як ты можаш дапамагчы",
        "help": ("Шэрая шпілька азначае: стол для спавівання ёсць, але "
                 "ніхто не пазначыў, у якім ён памяшканні. Менавіта гэтага "
                 "адказу не хапае бацькам. Даць яго можа кожны з бясплатным "
                 "акаўнтам OpenStreetMap, на месцы, менш чым за хвіліну — "
                 "спасылка на шпільцы адкрывае MapComplete адразу на "
                 "патрэбным аб'екце. Адказ трапляе ў OpenStreetMap, "
                 "належыць усім і з'яўляецца тут пасля наступнага начнога "
                 'абнаўлення. <a href="{up}{methods}#contribute">Крок за '
                 "крокам</a>."),
        "countries_h2": "PapaMap у іншых краінах",
        "places_unit": "месцаў",
        "footer": """\
<h2>Дадзеныя і ліцэнзія</h2>
<p class="muted">Усе дадзеныя &copy; <a href="https://www.openstreetmap.org/copyright">удзельнікі
OpenStreetMap</a>, паводле <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Гэтая
старонка перабудоўваецца кожную ноч з запыту Overpass і не захоўвае пра цябе нічога.
Як усё лічыцца і афарбоўваецца: <a href="{up}methods-be.html">Метады</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Зрабіў тата, які раз за разам знаходзіў пеленальны столік у жаночай прыбіральні. PapaMap бясплатны і без рэкламы.
<a href="https://ko-fi.com/jakubwaller">&#9749; Пачастуй мяне кавай</a>.</p>
""",
    },
    "ca": {
        "months": _MONTHS["ca"],
        "date_fmt": "{d} {m} {y}",
        "num_sep": ".",
        "methods": "methods-ca.html",
        "title": "Canviadors {name_in} — PapaMap",
        "h1": "Canviadors {name_in}",
        "meta_desc": ("{tables} llocs amb canviador {name_in}, segons "
                      "OpenStreetMap. A {unknown} d'ells ningú no ha "
                      "registrat en quina sala és el canviador — i això és "
                      "exactament el que es pot arreglar."),
        "stand": "Actualitzat el {date} · Dades d'OpenStreetMap",
        "back_map": "Torna al mapa",
        "empty": ("OpenStreetMap actualment no coneix cap lloc amb "
                  "canviador {name_in}. Això gairebé segur vol dir: encara "
                  "ningú no l'ha registrat."),
        "intro": ("OpenStreetMap coneix <strong>{tables}</strong> llocs amb "
                  "canviador {name_in}. A <strong>{accessible}</strong> "
                  "d'ells, algú ha registrat que un pare hi pot arribar de "
                  "debò — lavabo d'homes, lavabo unisex o una sala de "
                  "canviador pròpia. <strong>{female_only}</strong> només "
                  "pengen al lavabo de dones. I a "
                  "<strong>{unknown}</strong> de {tables} ({pct}&nbsp;%) "
                  "ningú no ha registrat en quina sala és el canviador. "
                  "Aquests són els pins grisos al mapa, i són la veritable "
                  "tasca: la pregunta es respon in situ en menys d'un "
                  "minut."),
        "map_cta": "Obre {name_for} al mapa",
        "numbers_h2": "Xifres: {name_for}",
        "th_things": "Canviadors", "th_places": "Llocs", "total": "Total",
        "statuses": {"accessible": "A l'abast",
                     "female_only": "Només lavabo de dones",
                     "unknown": "Sala desconeguda"},
        "toilets_note": ("{In}, a més, hi ha {toilets} lavabos públics "
                         "registrats — la immensa majoria sense cap "
                         "informació sobre el canviador. D'això no se'n pot "
                         "construir honestament un rànquing de l'oferta; "
                         'els <a href="{up}{methods}">mètodes</a> expliquen '
                         "per què."),
        "named_h2": "Llocs amb nom",
        "named_intro": ("{named_places} dels {tables} llocs tenen un nom a "
                        "OpenStreetMap, {named} de diferents en total. Els "
                        "{unnamed} restants són gairebé tots lavabos "
                        "públics sense nom — són al mapa, però no té sentit "
                        "llistar-los aquí. Les sucursals d'una cadena es "
                        "junten en una sola fila."),
        "th_place": "Lloc", "th_kind": "Tipus", "th_count": "Llocs",
        "help_h2": "Com pots ajudar",
        "help": ("Un pin gris vol dir: el canviador existeix, però ningú no "
                 "ha registrat en quina sala és. Aquesta resposta és "
                 "exactament el que els pares troben a faltar. Qualsevol "
                 "persona amb un compte gratuït d'OpenStreetMap la pot "
                 "donar, in situ, en menys d'un minut — l'enllaç del pin "
                 "obre MapComplete directament a l'objecte correcte. La "
                 "resposta queda a OpenStreetMap, és de tothom i es veurà "
                 "aquí després de la propera actualització nocturna. "
                 '<a href="{up}{methods}#contribute">Pas a pas</a>.'),
        "countries_h2": "PapaMap en altres països",
        "places_unit": "llocs",
        "footer": """\
<h2>Dades i llicència</h2>
<p class="muted">Totes les dades &copy; <a href="https://www.openstreetmap.org/copyright">col·laboradors
d'OpenStreetMap</a>, sota la <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. Aquesta
pàgina es regenera cada nit a partir d'una consulta a Overpass i no desa res sobre tu.
Com es compta i s'acoloreix: <a href="{up}methods-ca.html">Mètodes</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
<p class="muted">Creat per un pare que sempre trobava el canviador al lavabo de dones. PapaMap és gratuït i sense publicitat.
<a href="https://ko-fi.com/jakubwaller">&#9749; Convida'm a un cafè</a>.</p>
""",
    },
}

# ---- The leaderboard link the generated pages carry --------------------------
# Label per language, mirroring web/i18n.js's `board` strings — the map footer
# and the static pages must call the same page by the same name. Mined from
# i18n.js on 2026-08-23; when a label changes there, change it here too.
BOARD_LABEL = {
    "de": "Rangliste", "en": "Leaderboard", "da": "Rangliste",
    "nl": "Ranglijst", "fr": "Classement", "it": "Classifica",
    "cs": "Žebříček", "pl": "Ranking", "sv": "Topplista",
    "bs": "Rang lista", "ca": "Classificació", "et": "Edetabel",
    "es": "Clasificación", "hr": "Ljestvica", "is": "Topplisti",
    "lv": "Reitings", "lt": "Reitingas", "hu": "Ranglista",
    "no": "Toppliste", "pt": "Classificação", "ro": "Clasament",
    "sq": "Renditja", "sk": "Rebríček", "sl": "Lestvica",
    "fi": "Kärkisijat", "el": "Κατάταξη", "be": "Рэйтынг",
    "bg": "Класация", "mk": "Ранг-листа", "sr": "Ранглиста",
    "uk": "Рейтинг",
}


def board_file(lang: str) -> str:
    """The leaderboard file this language reads — de/en keep their
    pre-2026-08-22 names (leaderboard_strings.DE_FILE/EN_FILE spell out why),
    every other language follows the leaderboard-<lang>.html convention."""
    return {"de": "rangliste.html", "en": "leaderboard.html"}.get(
        lang, f"leaderboard-{lang}.html")
