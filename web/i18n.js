// UI strings for all three languages — no DOM, no fetch, unit-tested via
// node --test. German is the default; the button cycles DE → EN → DA. The
// legal pages (Impressum, Datenschutz) stay German-only by design. Values may
// carry trusted markup (<b>, <a>, <code>) — they are constants from this file,
// never user input; anything interpolated into {tokens} must be escaped by the
// caller.

// One language per official language of the eleven swept countries, plus
// English. de/en/da came first; nl, fr, it, cs, pl and sv arrived with the UK
// and France. Order is the order the picker lists them in: German first
// because the site is German-first, then the rest by endonym.
// Romansh is deliberately absent — Switzerland's fourth language has ~40k
// speakers and no monolingual ones.
export const LANGS = ["de", "en", "da", "nl", "fr", "it", "cs", "pl", "sv"];
export const DEFAULT_LANG = "de";

// Thousands separators differ per language and the strip is full of counts.
export const NUMBER_LOCALE = {
  de: "de-DE", en: "en-US", da: "da-DK", nl: "nl-NL", fr: "fr-FR",
  it: "it-IT", cs: "cs-CZ", pl: "pl-PL", sv: "sv-SE",
};

// Query param beats stored choice beats browser language beats default — a
// shared ?lang=en link should win over the recipient's remembered preference.
//
// Every language is auto-detected now, not just Danish. The old rule existed
// because the site spoke three languages and two of them were wrong for most
// visitors; with nine, a Czech reader arriving on a German page is the worse
// default. The cost is real and was the reason for the old rule: a German
// reader running an English browser now lands on English. They can switch,
// and the choice is remembered — `stored` is checked before the browser, so
// one click settles it permanently.
//
// `nav` accepts navigator.languages (preferred — it is ordered by preference)
// or a single navigator.language string. Region subtags are ignored: "en-GB",
// "de-AT" and "fr-CH" all match their base language, which is what the tag
// means. An unsupported language falls through to the next entry rather than
// ending the search, so a ["ga", "en"] browser gets English, not German.
export function pickLang(query, stored, nav) {
  if (LANGS.includes(query)) return query;
  if (LANGS.includes(stored)) return stored;
  const prefs = Array.isArray(nav) ? nav : [nav];
  for (const tag of prefs) {
    const base = String(tag ?? "").toLowerCase().split("-")[0];
    if (LANGS.includes(base)) return base;
  }
  return DEFAULT_LANG;
}

// The map serves all nine languages from one URL, so each language needs a
// distinct address for search engines to index it separately: German owns the
// bare URL, the others hang off the same ?lang= param pickLang() already
// honours. Keep in sync with index.html's hreflang tags and sitemap.xml.
export function langUrl(lang, base = "https://papamap.de/") {
  return lang === DEFAULT_LANG ? base : `${base}?lang=${lang}`;
}

// Tiny {token} interpolation; unknown tokens stay literal so a missing var is
// visible instead of silently vanishing.
export function fmt(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g,
    (m, k) => (k in vars ? String(vars[k]) : m));
}

export const STRINGS = {
  de: {
    title: "PapaMap — Wickeltische, die ein Vater erreicht",
    // Mirrors index.html's static <meta name="description">, which stays German
    // because that is the canonical page; app.js swaps it for the ?lang= views.
    // Counted, not listed, for the same reason as there: the eleven names add
    // ~135 characters to a snippet Google cuts at about 160.
    metaDescription: "Eine Karte der Wickeltische in elf europäischen Ländern, eingefärbt danach, ob ein Papa sie tatsächlich erreicht. Daten: OpenStreetMap.",
    tagline: "Wickeltische, die ein Vater erreicht",
    addPlace: "+ Ort hinzufügen",
    methods: "Methoden",
    methodsHref: "methods.html",
    // The leaderboard exists as a DE/EN pair only (pipeline/leaderboard.py
    // renders those two); every other language borrows the English page, the
    // way Danish already did — and "Rangliste" happens to be the Danish word
    // for it too.
    board: "Rangliste",
    boardHref: "wickeltische/rangliste.html",
    // The picker's own entry: every language names itself, so a reader who
    // cannot read the current UI can still find their own. Never translated.
    langName: "Deutsch",
    kofi: "☕ Kaffee",

    ariaZoomIn: "Hineinzoomen",
    ariaZoomOut: "Herauszoomen",
    ariaLocate: "Meinen Standort zeigen",
    ariaHome: "PapaMap — Startseite",
    ariaClose: "Schließen",
    ariaLang: "Sprache wählen",
    ariaKofi: "Kaffee spendieren (Ko-fi)",
    ariaStatsMore: "Mehr Zahlen anzeigen",
    ariaStatsLess: "Weniger Zahlen anzeigen",

    // Area labels, picked by stats.json's area_key — so a Dane reads
    // "Tyskland & Danmark", not the pipeline's fallback string.
    areaDe: "Deutschland",
    areaDk: "Dänemark",
    areaDeDk: "Deutschland & Dänemark",
    // Past two swept countries stats.json counts the set instead of naming it
    // (area_key "countries_11"): eleven joined names overflow the strip, and a
    // count stays one string per language however many countries follow.
    // Two forms because German declines: the wordmark reads "11 Länder", while
    // statsLocal already supplies the preposition and needs the dative —
    // "… Wickeltische in 9 Ländern".
    // Static fallback for the wordmark: index.html paints it before
    // stats.json arrives, and keeps it if the fetch fails. Count-free,
    // because applyI18n() calls t() with no vars and "{n}" would show.
    areaFallback: "elf europäische Länder",
    areaCountries: "{n} Länder",
    areaCountriesIn: "{n} Ländern",

    stAccessible: "Für Papas erreichbar",
    stFemaleOnly: "Nur Damen-WC",
    stUnknown: "Raum unbekannt",
    metaAccessible: "Diesen Wickeltisch kann ein Papa erreichen.",
    metaFemaleOnly: "Der Wickeltisch ist nur im Damen-WC.",
    metaUnknown: "Niemand hat erfasst, in welchem Raum der Wickeltisch ist — weißt du es?",

    // Kein vierter Status, sondern ein Filter: die Karte zeigt nur die Orte,
    // an denen eine Spielecke erfasst IST. Über den Rest sagt OSM nichts.
    stPlay: "Mit Spielecke",
    ariaPlay: "Nur Orte mit erfasster Spielecke zeigen",
    popupPlay: "Spielecke zum Bleiben",

    // Der zweite blaue Chip: kein Filter über die Pins, sondern ein zweiter
    // Datensatz. Das kurze Label passt in die Chipleiste, das aria-label sagt,
    // was es wirklich ist.
    stPlaces: "Nur Spielecke",
    ariaPlaces: "Orte mit Spielecke anzeigen, an denen niemand einen Wickeltisch erfasst hat",
    metaPlaces: "Spielecke erfasst — über einen Wickeltisch sagt OSM hier nichts.",
    popupPlacesCta: "Warst du hier? Dann weißt du, ob es einen Wickeltisch gibt.",

    countShown: "{shown} von {total} Wickeltischen",
    countPlaces: " + {n} Spielorte",
    countNoData: "Noch keine Daten — Pipeline ausführen",

    popupTable: "Wickeltisch",
    popupRoom: "Raum",
    popupFee: "Gebühr",
    popupHours: "Öffnungszeiten",
    popupAnswerMC: "Auf MapComplete beantworten",
    popupViewOSM: "Auf OSM ansehen",
    popupToilets: "Öffentliche Toilette",
    popupUnnamed: "Unbenannter Ort",

    statsMissing: 'Statistik nicht verfügbar — <code>data/stats.json</code> fehlt. <a href="{href}">Methoden</a>',
    statsLocal: '<b>{tables}</b> Wickeltische in {area} — <b>{unknown}</b> in unbekanntem Raum. <span class="cta-grey">Tippe auf die grauen Pins, um das zu ändern.</span>',
    statsGlobal: "Weltweit, wo der Raum erfasst ist ({total}): <b>{f}</b> nur Damen-WC vs. <b>{m}</b> nur Herren-WC — {ratio}.",
    statsGlobalMissing: "Weltweite Raum-Statistik gerade nicht verfügbar.",
    statsHonesty: '{toilets} Toiletten hier erfasst, Kapazitäts-Tags an {cap} — das Angebot selbst ist nicht messbar. <a href="{href}">Methoden</a>{updated}',
    statsUpdated: " · Stand {date}",

    toastNoGeo: "Standortbestimmung ist in diesem Browser nicht verfügbar.",
    toastGeoFail: "Standort nicht gefunden — Browser-Berechtigung prüfen.",

    dlgTitle: "Fehlenden Ort hinzufügen",
    dlgIntro: "PapaMap hat keine eigenen Daten — neue Orte gehen in OpenStreetMap und erscheinen hier nach dem nächtlichen Update.",
    dlgToilet: "Eine öffentliche Toilette fehlt",
    dlgToiletHint: "Öffnet MapComplete am aktuellen Kartenausschnitt — Toilette hinzufügen und die Wickeltisch-Fragen beantworten. Braucht einen kostenlosen OSM-Login.",
    dlgVenue: "Ein Café / Laden / Restaurant hat einen Tisch",
    dlgVenueHint: "Der Ort existiert auf OSM fast sicher schon — hier den Editor öffnen und die <code>changing_table</code>-Tags ergänzen. Schritt für Schritt: siehe Methoden.",
    dlgFoot: '<a href="{href}#contribute">Editieren, Schritt für Schritt</a>',
  },
  en: {
    title: "PapaMap — Changing tables dads can reach",
    metaDescription: "A map of every changing table in eleven European countries, coloured by whether a dad can actually reach it. Data: OpenStreetMap.",
    tagline: "Changing tables dads can reach",
    addPlace: "+ Add a place",
    methods: "Methods",
    methodsHref: "methods-en.html",
    board: "Leaderboard",
    boardHref: "wickeltische/leaderboard.html",
    langName: "English",
    kofi: "☕ Coffee",

    ariaZoomIn: "Zoom in",
    ariaZoomOut: "Zoom out",
    ariaLocate: "Show my location",
    ariaHome: "PapaMap — home",
    ariaClose: "Close",
    ariaLang: "Choose language",
    ariaKofi: "Buy me a coffee (Ko-fi)",
    ariaStatsMore: "Show more numbers",
    ariaStatsLess: "Show fewer numbers",

    areaDe: "Germany",
    areaDk: "Denmark",
    areaDeDk: "Germany & Denmark",
    // The two are identical on purpose: English does not decline after "in".
    // The pair exists for German ("11 Länder" vs "in 11 Ländern") — collapsing
    // it here would break that one language, not tidy this one.
    // Static fallback for the wordmark: index.html paints it before
    // stats.json arrives, and keeps it if the fetch fails. Count-free,
    // because applyI18n() calls t() with no vars and "{n}" would show.
    areaFallback: "eleven European countries",
    areaCountries: "{n} countries",
    areaCountriesIn: "{n} countries",

    stAccessible: "Dads can reach it",
    stFemaleOnly: "Women's room only",
    stUnknown: "Room unknown",
    metaAccessible: "A dad can reach this changing table.",
    metaFemaleOnly: "The table is in the women's room only.",
    metaUnknown: "Nobody has tagged which room the table is in — can you answer?",

    stPlay: "With play area",
    ariaPlay: "Show only places with a recorded play area",
    popupPlay: "Play area — worth staying",

    stPlaces: "Play area only",
    ariaPlaces: "Show places with a play area where nobody has recorded a changing table",
    metaPlaces: "A play area is recorded here — about a changing table, OSM says nothing.",
    popupPlacesCta: "Been here? Then you know whether there is a changing table.",

    countShown: "{shown} of {total} tables",
    countPlaces: " + {n} play places",
    countNoData: "No table data yet — run the pipeline",

    popupTable: "Changing table",
    popupRoom: "room",
    popupFee: "Fee",
    popupHours: "Hours",
    popupAnswerMC: "Answer on MapComplete",
    popupViewOSM: "View on OSM",
    popupToilets: "Public toilets",
    popupUnnamed: "Unnamed place",

    statsMissing: 'Stats unavailable — <code>data/stats.json</code> is missing. <a href="{href}">Methods</a>',
    statsLocal: '<b>{tables}</b> changing tables in {area} — <b>{unknown}</b> in an unknown room. <span class="cta-grey">Tap the grey pins to fix that.</span>',
    statsGlobal: "Worldwide, where the room is tagged ({total}): <b>{f}</b> women's-room-only vs <b>{m}</b> men's-room-only — {ratio}.",
    statsGlobalMissing: "Worldwide room-tag stats unavailable right now.",
    statsHonesty: '{toilets} toilets mapped here, capacity tags on {cap} — provision itself is unmeasurable. <a href="{href}">Methods</a>{updated}',
    statsUpdated: " · updated {date}",

    toastNoGeo: "Geolocation is not available in this browser.",
    toastGeoFail: "Couldn't get your location — check the browser's permission.",

    dlgTitle: "Add a missing place",
    dlgIntro: "PapaMap has no data of its own — new places go into OpenStreetMap and show up here after the nightly refresh.",
    dlgToilet: "A public toilet is missing",
    dlgToiletHint: "Opens MapComplete at this map view — add it and answer the changing-table questions. Needs a free OSM login.",
    dlgVenue: "A café / shop / restaurant has a table",
    dlgVenueHint: "The place almost certainly exists on OSM already — open the editor here and add the <code>changing_table</code> tags. Step-by-step: see Methods.",
    dlgFoot: '<a href="{href}#contribute">How to edit, step by step</a>',
  },
  da: {
    title: "PapaMap — pusleborde, en far kan nå",
    metaDescription: "Et kort over alle pusleborde i elleve europæiske lande, farvelagt efter om en far rent faktisk kan nå dem. Data: OpenStreetMap.",
    tagline: "Pusleborde, en far kan nå",
    addPlace: "+ Tilføj et sted",
    methods: "Metode",
    methodsHref: "methods-da.html",
    board: "Rangliste",
    boardHref: "wickeltische/leaderboard.html",
    langName: "Dansk",
    kofi: "☕ Kaffe",

    ariaZoomIn: "Zoom ind",
    ariaZoomOut: "Zoom ud",
    ariaLocate: "Vis min placering",
    ariaHome: "PapaMap — forsiden",
    ariaClose: "Luk",
    ariaLang: "Vælg sprog",
    ariaKofi: "Giv mig en kaffe (Ko-fi)",
    ariaStatsMore: "Vis flere tal",
    ariaStatsLess: "Vis færre tal",

    areaDe: "Tyskland",
    areaDk: "Danmark",
    areaDeDk: "Tyskland & Danmark",
    // Same string twice on purpose: Danish does not decline after "i" either.
    // The pair exists for German ("11 Länder" vs "in 11 Ländern").
    // Static fallback for the wordmark: index.html paints it before
    // stats.json arrives, and keeps it if the fetch fails. Count-free,
    // because applyI18n() calls t() with no vars and "{n}" would show.
    areaFallback: "elleve europæiske lande",
    areaCountries: "{n} lande",
    areaCountriesIn: "{n} lande",

    stAccessible: "En far kan nå det",
    stFemaleOnly: "Kun på dametoilettet",
    stUnknown: "Rummet er ukendt",
    metaAccessible: "Dette puslebord kan en far nå.",
    metaFemaleOnly: "Puslebordet er kun på dametoilettet.",
    metaUnknown: "Ingen har registreret, hvilket rum puslebordet står i — ved du det?",

    stPlay: "Med legeområde",
    ariaPlay: "Vis kun steder med et registreret legeområde",
    popupPlay: "Legeområde — værd at blive",

    stPlaces: "Kun legeområde",
    ariaPlaces: "Vis steder med legeområde, hvor ingen har registreret et puslebord",
    metaPlaces: "Her er der registreret et legeområde — om et puslebord siger OSM intet.",
    popupPlacesCta: "Har du været her? Så ved du, om der er et puslebord.",

    countShown: "{shown} af {total} pusleborde",
    countPlaces: " + {n} legesteder",
    countNoData: "Ingen data endnu — kør pipelinen",

    popupTable: "Puslebord",
    popupRoom: "rum",
    popupFee: "Gebyr",
    popupHours: "Åbningstider",
    popupAnswerMC: "Svar på MapComplete",
    popupViewOSM: "Se på OSM",
    popupToilets: "Offentligt toilet",
    popupUnnamed: "Sted uden navn",

    statsMissing: 'Statistik utilgængelig — <code>data/stats.json</code> mangler. <a href="{href}">Metode</a>',
    statsLocal: '<b>{tables}</b> pusleborde i {area} — <b>{unknown}</b> i et ukendt rum. <span class="cta-grey">Tryk på de grå nåle for at ændre det.</span>',
    statsGlobal: "På verdensplan, hvor rummet er registreret ({total}): <b>{f}</b> kun dametoilet mod <b>{m}</b> kun herretoilet — {ratio}.",
    statsGlobalMissing: "Global statistik over rum er ikke tilgængelig lige nu.",
    statsHonesty: '{toilets} toiletter registreret her, kapacitets-tags på {cap} — selve udbuddet kan ikke måles. <a href="{href}">Metode</a>{updated}',
    statsUpdated: " · opdateret {date}",

    toastNoGeo: "Placering er ikke tilgængelig i denne browser.",
    toastGeoFail: "Kunne ikke finde din placering — tjek browserens tilladelse.",

    dlgTitle: "Tilføj et sted, der mangler",
    dlgIntro: "PapaMap har ingen egne data — nye steder kommer ind i OpenStreetMap og dukker op her efter den natlige opdatering.",
    dlgToilet: "Et offentligt toilet mangler",
    dlgToiletHint: "Åbner MapComplete på dette kortudsnit — tilføj toilettet og besvar spørgsmålene om puslebord. Kræver et gratis OSM-login.",
    dlgVenue: "En café / butik / restaurant har et puslebord",
    dlgVenueHint: "Stedet findes næsten helt sikkert i OSM allerede — åbn editoren her og tilføj <code>changing_table</code>-taggene. Trin for trin: se Metode.",
    dlgFoot: '<a href="{href}#contribute">Sådan redigerer du, trin for trin</a>',
  },

  // Nederlands — added 19 Aug 2026 with the UK and France; the Netherlands and Flanders.
  nl: {
    title: "PapaMap — Verschoontafels waar een papa bij kan",
    metaDescription: "Een kaart van de verschoontafels (luiertafels) in elf Europese landen, ingekleurd naar de vraag of een papa er echt bij kan. Data: OpenStreetMap.",
    tagline: "Verschoontafels waar een papa bij kan",
    addPlace: "+ Plek toevoegen",
    methods: "Methode",
    methodsHref: "methods-nl.html",
    board: "Ranglijst",
    boardHref: "wickeltische/leaderboard.html",
    langName: "Nederlands",
    kofi: "☕ Koffie",

    ariaZoomIn: "Inzoomen",
    ariaZoomOut: "Uitzoomen",
    ariaLocate: "Mijn locatie tonen",
    ariaHome: "PapaMap — startpagina",
    ariaClose: "Sluiten",
    ariaLang: "Taal kiezen",
    ariaKofi: "Trakteer me op een koffie (Ko-fi)",
    ariaStatsMore: "Meer cijfers tonen",
    ariaStatsLess: "Minder cijfers tonen",

    areaDe: "Duitsland",
    areaDk: "Denemarken",
    areaDeDk: "Duitsland & Denemarken",
    areaFallback: "elf Europese landen",
    areaCountries: "{n} landen",
    areaCountriesIn: "{n} landen",

    stAccessible: "Papa kan erbij",
    stFemaleOnly: "Alleen damestoilet",
    stUnknown: "Ruimte onbekend",
    metaAccessible: "Een papa kan bij deze verschoontafel.",
    metaFemaleOnly: "De verschoontafel staat alleen op het damestoilet.",
    metaUnknown: "Niemand heeft vastgelegd in welke ruimte de verschoontafel staat — weet jij het?",

    stPlay: "Met speelhoek",
    ariaPlay: "Alleen plekken met een vastgelegde speelhoek tonen",
    popupPlay: "Speelhoek — om even te blijven",

    stPlaces: "Alleen speelhoek",
    ariaPlaces: "Plekken met een speelhoek tonen waar niemand een verschoontafel heeft vastgelegd",
    metaPlaces: "Hier is een speelhoek vastgelegd — over een verschoontafel zegt OSM niets.",
    popupPlacesCta: "Ben je hier geweest? Dan weet jij of er een verschoontafel is.",

    countShown: "{shown} van {total} verschoontafels",
    countPlaces: " + {n} speelplekken",
    countNoData: "Nog geen gegevens — pipeline uitvoeren",

    popupTable: "Verschoontafel",
    popupRoom: "ruimte",
    popupFee: "Kosten",
    popupHours: "Openingstijden",
    popupAnswerMC: "Beantwoorden op MapComplete",
    popupViewOSM: "Bekijken op OSM",
    popupToilets: "Openbaar toilet",
    popupUnnamed: "Naamloze plek",

    statsMissing: "Statistiek niet beschikbaar — <code>data/stats.json</code> ontbreekt. <a href=\"{href}\">Methode</a>",
    statsLocal: "<b>{tables}</b> verschoontafels in {area} — <b>{unknown}</b> in een onbekende ruimte. <span class=\"cta-grey\">Tik op de grijze pins om dat te veranderen.</span>",
    statsGlobal: "Wereldwijd, waar de ruimte is vastgelegd ({total}): <b>{f}</b> alleen damestoilet tegenover <b>{m}</b> alleen herentoilet — {ratio}.",
    statsGlobalMissing: "Wereldwijde cijfers over de ruimte zijn nu niet beschikbaar.",
    statsHonesty: "{toilets} toiletten hier vastgelegd, capaciteitstags bij {cap} — het aanbod zelf is niet meetbaar. <a href=\"{href}\">Methode</a>{updated}",
    statsUpdated: " · bijgewerkt {date}",

    toastNoGeo: "Locatiebepaling is niet beschikbaar in deze browser.",
    toastGeoFail: "Locatie niet gevonden — controleer de toestemming in de browser.",

    dlgTitle: "Ontbrekende plek toevoegen",
    dlgIntro: "PapaMap heeft geen eigen gegevens — nieuwe plekken gaan naar OpenStreetMap en verschijnen hier na de nachtelijke update.",
    dlgToilet: "Er ontbreekt een openbaar toilet",
    dlgToiletHint: "Opent MapComplete op dit kaartbeeld — voeg het toilet toe en beantwoord de vragen over de verschoontafel. Vereist een gratis OSM-account.",
    dlgVenue: "Een café / winkel / restaurant heeft een tafel",
    dlgVenueHint: "De plek bestaat vrijwel zeker al op OSM — open hier de editor en vul de <code>changing_table</code>-tags aan. Stap voor stap: zie Methode.",
    dlgFoot: "<a href=\"{href}#contribute\">Bewerken, stap voor stap</a>",
  },
  // Français — added 19 Aug 2026 with the UK and France; France, Wallonia and Romandy.
  fr: {
    title: "PapaMap — Des tables à langer accessibles aux papas",
    metaDescription: "Une carte des tables à langer dans onze pays européens, colorée selon qu'un papa peut vraiment y accéder. Données : OpenStreetMap.",
    tagline: "Des tables à langer accessibles aux papas",
    addPlace: "+ Ajouter un lieu",
    methods: "Méthodes",
    methodsHref: "methods-fr.html",
    board: "Classement",
    boardHref: "wickeltische/leaderboard.html",
    langName: "Français",
    kofi: "☕ Café",

    ariaZoomIn: "Zoom avant",
    ariaZoomOut: "Zoom arrière",
    ariaLocate: "Afficher ma position",
    ariaHome: "PapaMap — accueil",
    ariaClose: "Fermer",
    ariaLang: "Choisir la langue",
    ariaKofi: "Offrir un café (Ko-fi)",
    ariaStatsMore: "Afficher plus de chiffres",
    ariaStatsLess: "Afficher moins de chiffres",

    areaDe: "Allemagne",
    areaDk: "Danemark",
    areaDeDk: "Allemagne & Danemark",
    areaFallback: "onze pays européens",
    areaCountries: "{n} pays",
    areaCountriesIn: "{n} pays",

    stAccessible: "Accessible aux papas",
    stFemaleOnly: "Femmes uniquement",
    stUnknown: "Pièce inconnue",
    metaAccessible: "Un papa peut atteindre cette table à langer.",
    metaFemaleOnly: "La table à langer est uniquement dans les WC femmes.",
    metaUnknown: "Personne n'a indiqué dans quelle pièce se trouve la table — tu le sais ?",

    stPlay: "Avec coin jeux",
    ariaPlay: "Afficher uniquement les lieux avec un coin jeux renseigné",
    popupPlay: "Coin jeux — de quoi rester",

    stPlaces: "Coin jeux uniquement",
    ariaPlaces: "Afficher les lieux avec un coin jeux où personne n'a renseigné de table à langer",
    metaPlaces: "Un coin jeux est renseigné ici — sur une table à langer, OSM ne dit rien.",
    popupPlacesCta: "Tu es déjà venu ? Alors tu sais s'il y a une table à langer.",

    countShown: "{shown} tables sur {total}",
    countPlaces: " + {n} lieux de jeu",
    countNoData: "Pas encore de données — lance le pipeline",

    popupTable: "Table à langer",
    popupRoom: "pièce",
    popupFee: "Tarif",
    popupHours: "Horaires",
    popupAnswerMC: "Répondre sur MapComplete",
    popupViewOSM: "Voir sur OSM",
    popupToilets: "Toilettes publiques",
    popupUnnamed: "Lieu sans nom",

    statsMissing: "Statistiques indisponibles — <code>data/stats.json</code> est absent. <a href=\"{href}\">Méthodes</a>",
    statsLocal: "<b>{tables}</b> tables à langer dans {area} — <b>{unknown}</b> dans une pièce inconnue. <span class=\"cta-grey\">Touche les marqueurs gris pour changer ça.</span>",
    statsGlobal: "Dans le monde, là où la pièce est renseignée ({total}) : <b>{f}</b> uniquement WC femmes contre <b>{m}</b> uniquement WC hommes — {ratio}.",
    statsGlobalMissing: "Pas de statistiques mondiales sur les pièces pour le moment.",
    statsHonesty: "{toilets} toilettes recensées ici, tags de capacité sur {cap} — l'offre elle-même n'est pas mesurable. <a href=\"{href}\">Méthodes</a>{updated}",
    statsUpdated: " · mis à jour le {date}",

    toastNoGeo: "La géolocalisation n'est pas disponible dans ce navigateur.",
    toastGeoFail: "Position introuvable — vérifie l'autorisation du navigateur.",

    dlgTitle: "Ajouter un lieu manquant",
    dlgIntro: "PapaMap n'a pas de données à lui — les nouveaux lieux vont dans OpenStreetMap et apparaissent ici après la mise à jour nocturne.",
    dlgToilet: "Il manque des toilettes publiques",
    dlgToiletHint: "Ouvre MapComplete sur la vue actuelle — ajoute-les et réponds aux questions sur la table à langer. Nécessite un compte OSM gratuit.",
    dlgVenue: "Un café / magasin / restaurant a une table",
    dlgVenueHint: "Le lieu existe presque certainement déjà sur OSM — ouvre l'éditeur ici et ajoute les tags <code>changing_table</code>. Pas à pas : voir Méthodes.",
    dlgFoot: "<a href=\"{href}#contribute\">Éditer, pas à pas</a>",
  },
  // Italiano — added 19 Aug 2026 with the UK and France; Ticino and the Italian-speaking Grisons.
  it: {
    title: "PapaMap — Fasciatoi che un papà può raggiungere",
    metaDescription: "Una mappa dei fasciatoi in undici paesi europei, colorati in base al fatto che un papà possa davvero raggiungerli. Dati: OpenStreetMap.",
    tagline: "Fasciatoi che un papà può raggiungere",
    addPlace: "+ Aggiungi luogo",
    methods: "Metodo",
    methodsHref: "methods-it.html",
    board: "Classifica",
    boardHref: "wickeltische/leaderboard.html",
    langName: "Italiano",
    kofi: "☕ Caffè",

    ariaZoomIn: "Ingrandisci",
    ariaZoomOut: "Rimpicciolisci",
    ariaLocate: "Mostra la mia posizione",
    ariaHome: "PapaMap — pagina iniziale",
    ariaClose: "Chiudi",
    ariaLang: "Scegli la lingua",
    ariaKofi: "Offrimi un caffè (Ko-fi)",
    ariaStatsMore: "Mostra più numeri",
    ariaStatsLess: "Mostra meno numeri",

    areaDe: "Germania",
    areaDk: "Danimarca",
    areaDeDk: "Germania & Danimarca",
    areaFallback: "undici paesi europei",
    areaCountries: "{n} paesi",
    areaCountriesIn: "{n} paesi",

    stAccessible: "Un papà ci arriva",
    stFemaleOnly: "Solo bagno donne",
    stUnknown: "Stanza sconosciuta",
    metaAccessible: "Questo fasciatoio un papà può raggiungerlo.",
    metaFemaleOnly: "Il fasciatoio è solo nel bagno donne.",
    metaUnknown: "Nessuno ha registrato in quale stanza si trova il fasciatoio — lo sai tu?",

    stPlay: "Con angolo giochi",
    ariaPlay: "Mostra solo i luoghi con un angolo giochi registrato",
    popupPlay: "Angolo giochi — vale la pena fermarsi",

    stPlaces: "Solo angolo giochi",
    ariaPlaces: "Mostra i luoghi con angolo giochi dove nessuno ha registrato un fasciatoio",
    metaPlaces: "Qui è registrato un angolo giochi — sul fasciatoio OSM non dice nulla.",
    popupPlacesCta: "Ci sei stato? Allora sai se c'è un fasciatoio.",

    countShown: "{shown} di {total} fasciatoi",
    countPlaces: " + {n} luoghi con giochi",
    countNoData: "Ancora nessun dato — esegui la pipeline",

    popupTable: "Fasciatoio",
    popupRoom: "stanza",
    popupFee: "Costo",
    popupHours: "Orari",
    popupAnswerMC: "Rispondi su MapComplete",
    popupViewOSM: "Vedi su OSM",
    popupToilets: "Bagno pubblico",
    popupUnnamed: "Luogo senza nome",

    statsMissing: "Statistiche non disponibili — manca <code>data/stats.json</code>. <a href=\"{href}\">Metodo</a>",
    statsLocal: "<b>{tables}</b> fasciatoi in {area} — <b>{unknown}</b> in una stanza sconosciuta. <span class=\"cta-grey\">Tocca i pin grigi per rimediare.</span>",
    statsGlobal: "Nel mondo, dove la stanza è registrata ({total}): <b>{f}</b> solo bagno donne contro <b>{m}</b> solo bagno uomini — {ratio}.",
    statsGlobalMissing: "Statistiche mondiali sulle stanze non disponibili al momento.",
    statsHonesty: "{toilets} bagni registrati qui, tag di capienza su {cap} — l'offerta in sé non è misurabile. <a href=\"{href}\">Metodo</a>{updated}",
    statsUpdated: " · aggiornato il {date}",

    toastNoGeo: "La geolocalizzazione non è disponibile in questo browser.",
    toastGeoFail: "Non riesco a trovare la tua posizione — controlla i permessi del browser.",

    dlgTitle: "Aggiungi un luogo che manca",
    dlgIntro: "PapaMap non ha dati propri — i nuovi luoghi finiscono in OpenStreetMap e compaiono qui dopo l'aggiornamento notturno.",
    dlgToilet: "Manca un bagno pubblico",
    dlgToiletHint: "Apre MapComplete su questa porzione di mappa — aggiungi il bagno e rispondi alle domande sul fasciatoio. Serve un account OSM gratuito.",
    dlgVenue: "Un bar / negozio / ristorante ha un fasciatoio",
    dlgVenueHint: "Il luogo su OSM esiste quasi di sicuro già — apri qui l'editor e aggiungi i tag <code>changing_table</code>. Passo per passo: vedi Metodo.",
    dlgFoot: "<a href=\"{href}#contribute\">Come si modifica, passo per passo</a>",
  },
  // Čeština — added 19 Aug 2026 with the UK and France; Czechia.
  cs: {
    title: "PapaMap — přebalovací pulty, ke kterým se táta dostane",
    metaDescription: "Mapa přebalovacích pultů v jedenácti evropských zemích, barevně odlišených podle toho, jestli se k nim táta opravdu dostane. Data: OpenStreetMap.",
    tagline: "Přebalovací pulty, ke kterým se táta dostane",
    addPlace: "+ Přidat místo",
    methods: "Metody",
    methodsHref: "methods-cs.html",
    board: "Žebříček",
    boardHref: "wickeltische/leaderboard.html",
    langName: "Čeština",
    kofi: "☕ Káva",

    ariaZoomIn: "Přiblížit",
    ariaZoomOut: "Oddálit",
    ariaLocate: "Zobrazit mou polohu",
    ariaHome: "PapaMap — úvodní stránka",
    ariaClose: "Zavřít",
    ariaLang: "Vybrat jazyk",
    ariaKofi: "Pozvat mě na kávu (Ko-fi)",
    ariaStatsMore: "Zobrazit více čísel",
    ariaStatsLess: "Zobrazit méně čísel",

    areaDe: "Německo",
    areaDk: "Dánsko",
    areaDeDk: "Německo a Dánsko",
    areaFallback: "jedenáct evropských zemí",
    areaCountries: "{n} zemí",
    areaCountriesIn: "{n} zemích",

    stAccessible: "Dostupné pro tátu",
    stFemaleOnly: "Jen dámské WC",
    stUnknown: "Neznámá místnost",
    metaAccessible: "K tomuto přebalovacímu pultu se táta dostane.",
    metaFemaleOnly: "Přebalovací pult je jen na dámském WC.",
    metaUnknown: "Nikdo nezaznamenal, ve které místnosti přebalovací pult je — víš to ty?",

    stPlay: "S dětským koutkem",
    ariaPlay: "Zobrazit jen místa se zaznamenaným dětským koutkem",
    popupPlay: "Dětský koutek — vyplatí se zůstat",

    stPlaces: "Jen dětský koutek",
    ariaPlaces: "Zobrazit místa s dětským koutkem, kde nikdo nezaznamenal přebalovací pult",
    metaPlaces: "Je tu zaznamenaný dětský koutek — o přebalovacím pultu OSM neříká nic.",
    popupPlacesCta: "Znáš to tady? Pak víš, jestli tu přebalovací pult je.",

    countShown: "{shown} z {total} přebalovacích pultů",
    countPlaces: " + {n} míst s koutkem",
    countNoData: "Zatím žádná data — spusť pipeline",

    popupTable: "Přebalovací pult",
    popupRoom: "místnost",
    popupFee: "Poplatek",
    popupHours: "Otevírací doba",
    popupAnswerMC: "Odpovědět na MapComplete",
    popupViewOSM: "Zobrazit na OSM",
    popupToilets: "Veřejné WC",
    popupUnnamed: "Místo bez názvu",

    statsMissing: "Statistika není k dispozici — chybí <code>data/stats.json</code>. <a href=\"{href}\">Metody</a>",
    statsLocal: "<b>{tables}</b> přebalovacích pultů v {area} — u <b>{unknown}</b> není známá místnost. <span class=\"cta-grey\">Klepni na šedé špendlíky a změň to.</span>",
    statsGlobal: "Celosvětově tam, kde je místnost zaznamenaná ({total}): <b>{f}</b> jen dámské WC vs. <b>{m}</b> jen pánské WC — {ratio}.",
    statsGlobalMissing: "Celosvětová statistika místností teď není k dispozici.",
    statsHonesty: "Tady zaznamenáno {toilets} toalet, tagy s kapacitou u {cap} — samotnou vybavenost změřit nejde. <a href=\"{href}\">Metody</a>{updated}",
    statsUpdated: " · aktualizováno {date}",

    toastNoGeo: "Určování polohy není v tomto prohlížeči k dispozici.",
    toastGeoFail: "Polohu se nepodařilo zjistit — zkontroluj oprávnění prohlížeče.",

    dlgTitle: "Přidat chybějící místo",
    dlgIntro: "PapaMap nemá vlastní data — nová místa se zapisují do OpenStreetMap a objeví se tady po noční aktualizaci.",
    dlgToilet: "Chybí veřejné WC",
    dlgToiletHint: "Otevře MapComplete na aktuálním výřezu mapy — přidej WC a odpověz na otázky k přebalovacímu pultu. Je potřeba bezplatné přihlášení k OSM.",
    dlgVenue: "Kavárna / obchod / restaurace má pult",
    dlgVenueHint: "To místo v OSM skoro jistě už je — otevři tady editor a doplň tagy <code>changing_table</code>. Krok za krokem: viz Metody.",
    dlgFoot: "<a href=\"{href}#contribute\">Jak editovat, krok za krokem</a>",
  },
  // Polski — added 19 Aug 2026 with the UK and France; Poland.
  pl: {
    title: "PapaMap — przewijaki, do których dotrze tata",
    metaDescription: "Mapa przewijaków w jedenastu krajach Europy — kolor mówi, czy tata faktycznie do nich dotrze. Dane: OpenStreetMap.",
    tagline: "Przewijaki, do których dotrze tata",
    addPlace: "+ Dodaj miejsce",
    methods: "Metody",
    methodsHref: "methods-pl.html",
    board: "Ranking",
    boardHref: "wickeltische/leaderboard.html",
    langName: "Polski",
    kofi: "☕ Kawa",

    ariaZoomIn: "Powiększ",
    ariaZoomOut: "Pomniejsz",
    ariaLocate: "Pokaż moją lokalizację",
    ariaHome: "PapaMap — strona główna",
    ariaClose: "Zamknij",
    ariaLang: "Wybierz język",
    ariaKofi: "Postaw mi kawę (Ko-fi)",
    ariaStatsMore: "Pokaż więcej liczb",
    ariaStatsLess: "Pokaż mniej liczb",

    areaDe: "Niemcy",
    areaDk: "Dania",
    areaDeDk: "Niemcy i Dania",
    areaFallback: "jedenaście krajów Europy",
    areaCountries: "{n} krajów",
    areaCountriesIn: "{n} krajach",

    stAccessible: "Tata dotrze",
    stFemaleOnly: "Tylko damskie WC",
    stUnknown: "Nie wiadomo gdzie",
    metaAccessible: "Tata dotrze do tego przewijaka.",
    metaFemaleOnly: "Przewijak jest tylko w damskiej toalecie.",
    metaUnknown: "Nikt nie zapisał, w jakim pomieszczeniu jest ten przewijak — a ty wiesz?",

    stPlay: "Z kącikiem zabaw",
    ariaPlay: "Pokaż tylko miejsca z zapisanym kącikiem zabaw",
    popupPlay: "Kącik zabaw — warto zostać",

    stPlaces: "Tylko kącik zabaw",
    ariaPlaces: "Pokaż miejsca z kącikiem zabaw, w których nikt nie zapisał przewijaka",
    metaPlaces: "Kącik zabaw jest zapisany — o przewijaku OSM nic tu nie mówi.",
    popupPlacesCta: "Znasz to miejsce? To wiesz, czy jest tu przewijak.",

    countShown: "{shown} z {total} przewijaków",
    countPlaces: " + {n} miejsc do zabawy",
    countNoData: "Jeszcze brak danych — uruchom pipeline",

    popupTable: "Przewijak",
    popupRoom: "pomieszczenie",
    popupFee: "Opłata",
    popupHours: "Godziny otwarcia",
    popupAnswerMC: "Odpowiedz w MapComplete",
    popupViewOSM: "Zobacz na OSM",
    popupToilets: "Toaleta publiczna",
    popupUnnamed: "Miejsce bez nazwy",

    statsMissing: "Statystyki niedostępne — brakuje pliku <code>data/stats.json</code>. <a href=\"{href}\">Metody</a>",
    statsLocal: "<b>{tables}</b> przewijaków w {area} — <b>{unknown}</b> w nieznanym pomieszczeniu. <span class=\"cta-grey\">Kliknij szare pinezki, żeby to zmienić.</span>",
    statsGlobal: "Na świecie, tam gdzie pomieszczenie jest zapisane ({total}): <b>{f}</b> tylko damskie WC vs <b>{m}</b> tylko męskie WC — {ratio}.",
    statsGlobalMissing: "Światowe statystyki pomieszczeń są w tej chwili niedostępne.",
    statsHonesty: "{toilets} toalet zapisanych tutaj, tagi pojemności ma {cap} z nich — samej dostępności nie da się zmierzyć. <a href=\"{href}\">Metody</a>{updated}",
    statsUpdated: " · dane z {date}",

    toastNoGeo: "Geolokalizacja nie jest dostępna w tej przeglądarce.",
    toastGeoFail: "Nie udało się ustalić lokalizacji — sprawdź uprawnienia przeglądarki.",

    dlgTitle: "Dodaj brakujące miejsce",
    dlgIntro: "PapaMap nie ma własnych danych — nowe miejsca trafiają do OpenStreetMap i pojawiają się tutaj po nocnej aktualizacji.",
    dlgToilet: "Brakuje toalety publicznej",
    dlgToiletHint: "Otwiera MapComplete na tym wycinku mapy — dodaj toaletę i odpowiedz na pytania o przewijak. Potrzebne darmowe konto OSM.",
    dlgVenue: "Kawiarnia / sklep / restauracja ma przewijak",
    dlgVenueHint: "To miejsce prawie na pewno już jest w OSM — otwórz tu edytor i dodaj tagi <code>changing_table</code>. Krok po kroku: zobacz Metody.",
    dlgFoot: "<a href=\"{href}#contribute\">Jak edytować, krok po kroku</a>",
  },
  // Svenska — added 19 Aug 2026 with the UK and France; Sweden.
  sv: {
    title: "PapaMap — skötbord som en pappa kommer åt",
    metaDescription: "En karta över skötbord i elva europeiska länder, färglagda efter om en pappa faktiskt kommer åt dem. Data: OpenStreetMap.",
    tagline: "Skötbord som en pappa kommer åt",
    addPlace: "+ Ny plats",
    methods: "Metod",
    methodsHref: "methods-sv.html",
    board: "Topplista",
    boardHref: "wickeltische/leaderboard.html",
    langName: "Svenska",
    kofi: "☕ Kaffe",

    ariaZoomIn: "Zooma in",
    ariaZoomOut: "Zooma ut",
    ariaLocate: "Visa min position",
    ariaHome: "PapaMap — startsidan",
    ariaClose: "Stäng",
    ariaLang: "Välj språk",
    ariaKofi: "Bjud på en kaffe (Ko-fi)",
    ariaStatsMore: "Visa fler siffror",
    ariaStatsLess: "Visa färre siffror",

    areaDe: "Tyskland",
    areaDk: "Danmark",
    areaDeDk: "Tyskland & Danmark",
    areaFallback: "elva europeiska länder",
    areaCountries: "{n} länder",
    areaCountriesIn: "{n} länder",

    stAccessible: "Pappa kommer åt",
    stFemaleOnly: "Bara damtoalett",
    stUnknown: "Okänt rum",
    metaAccessible: "Det här skötbordet kommer en pappa åt.",
    metaFemaleOnly: "Skötbordet finns bara på damtoaletten.",
    metaUnknown: "Ingen har registrerat vilket rum skötbordet står i — vet du det?",

    stPlay: "Med lekhörna",
    ariaPlay: "Visa bara platser med registrerad lekhörna",
    popupPlay: "Lekhörna — värt att stanna kvar",

    stPlaces: "Bara lekhörna",
    ariaPlaces: "Visa platser med lekhörna där ingen har registrerat något skötbord",
    metaPlaces: "Här finns en lekhörna registrerad — om skötbord säger OSM ingenting.",
    popupPlacesCta: "Har du varit här? Då vet du om det finns ett skötbord.",

    countShown: "{shown} av {total} skötbord",
    countPlaces: " + {n} lekställen",
    countNoData: "Inga data ännu — kör pipelinen",

    popupTable: "Skötbord",
    popupRoom: "rum",
    popupFee: "Avgift",
    popupHours: "Öppettider",
    popupAnswerMC: "Svara på MapComplete",
    popupViewOSM: "Visa på OSM",
    popupToilets: "Offentlig toalett",
    popupUnnamed: "Namnlös plats",

    statsMissing: "Statistik inte tillgänglig — <code>data/stats.json</code> saknas. <a href=\"{href}\">Metod</a>",
    statsLocal: "<b>{tables}</b> skötbord i {area} — <b>{unknown}</b> i okänt rum. <span class=\"cta-grey\">Tryck på de grå nålarna för att ändra det.</span>",
    statsGlobal: "Världen över, där rummet är registrerat ({total}): <b>{f}</b> bara damtoalett mot <b>{m}</b> bara herrtoalett — {ratio}.",
    statsGlobalMissing: "Global rumsstatistik är inte tillgänglig just nu.",
    statsHonesty: "{toilets} toaletter registrerade här, kapacitetstaggar på {cap} — själva tillgången går inte att mäta. <a href=\"{href}\">Metod</a>{updated}",
    statsUpdated: " · uppdaterad {date}",

    toastNoGeo: "Positionering är inte tillgänglig i den här webbläsaren.",
    toastGeoFail: "Hittade inte din position — kontrollera webbläsarens behörighet.",

    dlgTitle: "Lägg till en plats som saknas",
    dlgIntro: "PapaMap har inga egna data — nya platser hamnar i OpenStreetMap och dyker upp här efter den nattliga uppdateringen.",
    dlgToilet: "En offentlig toalett saknas",
    dlgToiletHint: "Öppnar MapComplete vid det här kartutsnittet — lägg till toaletten och svara på skötbordsfrågorna. Kräver en gratis OSM-inloggning.",
    dlgVenue: "Café / butik / restaurang har ett skötbord",
    dlgVenueHint: "Platsen finns nästan säkert redan i OSM — öppna editorn här och lägg till <code>changing_table</code>-taggarna. Steg för steg: se Metod.",
    dlgFoot: "<a href=\"{href}#contribute\">Så redigerar du, steg för steg</a>",
  },
};
