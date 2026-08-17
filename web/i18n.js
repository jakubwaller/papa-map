// UI strings for all three languages — no DOM, no fetch, unit-tested via
// node --test. German is the default; the button cycles DE → EN → DA. The
// legal pages (Impressum, Datenschutz) stay German-only by design. Values may
// carry trusted markup (<b>, <a>, <code>) — they are constants from this file,
// never user input; anything interpolated into {tokens} must be escaped by the
// caller.

export const LANGS = ["de", "en", "da"];
export const DEFAULT_LANG = "de";

// Thousands separators differ per language and the strip is full of counts.
export const NUMBER_LOCALE = { de: "de-DE", en: "en-US", da: "da-DK" };

// Query param beats stored choice beats browser language beats default — a
// shared ?lang=en link should win over the recipient's remembered preference.
// Only Danish is auto-detected: the site is German-first and plenty of German
// readers run an English browser, so widening this would flip the default
// language out from under existing visitors.
export function pickLang(query, stored, navLang) {
  if (LANGS.includes(query)) return query;
  if (LANGS.includes(stored)) return stored;
  if (String(navLang ?? "").toLowerCase().startsWith("da")) return "da";
  return DEFAULT_LANG;
}

// The toggle button cycles rather than flips — three languages, one button,
// and every langButton value names the language it lands on.
export function nextLang(lang) {
  const i = LANGS.indexOf(lang);
  return LANGS[(i + 1) % LANGS.length] ?? DEFAULT_LANG;
}

// The map serves all three languages from one URL, so each language needs a
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
    metaDescription: "Eine Karte der Wickeltische in ganz Deutschland und Dänemark, eingefärbt danach, ob ein Papa sie tatsächlich erreicht. Daten: OpenStreetMap.",
    tagline: "Wickeltische, die ein Vater erreicht",
    addPlace: "+ Ort hinzufügen",
    methods: "Methoden",
    methodsHref: "methods.html",
    // The leaderboard exists as a DE/EN pair only; Danish borrows the English
    // page, and "Rangliste" happens to be the Danish word for it too.
    board: "Rangliste",
    boardHref: "wickeltische/rangliste.html",
    langButton: "EN",

    ariaZoomIn: "Hineinzoomen",
    ariaZoomOut: "Herauszoomen",
    ariaLocate: "Meinen Standort zeigen",
    ariaHome: "PapaMap — Startseite",
    ariaClose: "Schließen",
    ariaLang: "Switch to English",
    ariaStatsMore: "Mehr Zahlen anzeigen",
    ariaStatsLess: "Weniger Zahlen anzeigen",

    // Area labels, picked by stats.json's area_key — so a Dane reads
    // "Tyskland & Danmark", not the pipeline's fallback string.
    areaDe: "Deutschland",
    areaDk: "Dänemark",
    areaDeDk: "Deutschland & Dänemark",

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
    metaDescription: "A map of every changing table in Germany and Denmark, coloured by whether a dad can actually reach it. Data: OpenStreetMap.",
    tagline: "Changing tables dads can reach",
    addPlace: "+ Add a place",
    methods: "Methods",
    methodsHref: "methods-en.html",
    board: "Leaderboard",
    boardHref: "wickeltische/leaderboard.html",
    langButton: "DA",

    ariaZoomIn: "Zoom in",
    ariaZoomOut: "Zoom out",
    ariaLocate: "Show my location",
    ariaHome: "PapaMap — home",
    ariaClose: "Close",
    ariaLang: "Skift til dansk",
    ariaStatsMore: "Show more numbers",
    ariaStatsLess: "Show fewer numbers",

    areaDe: "Germany",
    areaDk: "Denmark",
    areaDeDk: "Germany & Denmark",

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
    metaDescription: "Et kort over alle pusleborde i Tyskland og Danmark, farvelagt efter om en far rent faktisk kan nå dem. Data: OpenStreetMap.",
    tagline: "Pusleborde, en far kan nå",
    addPlace: "+ Tilføj et sted",
    methods: "Metode",
    methodsHref: "methods-da.html",
    board: "Rangliste",
    boardHref: "wickeltische/leaderboard.html",
    langButton: "DE",

    ariaZoomIn: "Zoom ind",
    ariaZoomOut: "Zoom ud",
    ariaLocate: "Vis min placering",
    ariaHome: "PapaMap — forsiden",
    ariaClose: "Luk",
    ariaLang: "Auf Deutsch wechseln",
    ariaStatsMore: "Vis flere tal",
    ariaStatsLess: "Vis færre tal",

    areaDe: "Tyskland",
    areaDk: "Danmark",
    areaDeDk: "Tyskland & Danmark",

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
};
