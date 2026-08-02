// UI strings for both languages — no DOM, no fetch, unit-tested via node --test.
// German is the default; English is the toggle. The legal pages (Impressum,
// Datenschutz) stay German-only by design. Values may carry trusted markup
// (<b>, <a>, <code>) — they are constants from this file, never user input;
// anything interpolated into {tokens} must be escaped by the caller.

export const LANGS = ["de", "en"];
export const DEFAULT_LANG = "de";

// Query param beats stored choice beats default — a shared ?lang=en link
// should win over the recipient's remembered preference.
export function pickLang(query, stored) {
  if (LANGS.includes(query)) return query;
  if (LANGS.includes(stored)) return stored;
  return DEFAULT_LANG;
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
    tagline: "Wickeltische, die ein Vater erreicht",
    addPlace: "+ Ort hinzufügen",
    methods: "Methoden",
    methodsHref: "methods.html",
    langButton: "EN",

    ariaZoomIn: "Hineinzoomen",
    ariaZoomOut: "Herauszoomen",
    ariaLocate: "Meinen Standort zeigen",
    ariaHome: "PapaMap — Startseite",
    ariaClose: "Schließen",
    ariaLang: "Switch to English",

    stAccessible: "Für Papas erreichbar",
    stFemaleOnly: "Nur Damen-WC",
    stUnknown: "Raum unbekannt",
    metaAccessible: "Diesen Wickeltisch kann ein Papa erreichen.",
    metaFemaleOnly: "Der Wickeltisch ist nur im Damen-WC.",
    metaUnknown: "Niemand hat erfasst, in welchem Raum der Wickeltisch ist — weißt du es?",

    countShown: "{shown} von {total} Wickeltischen",
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
    tagline: "Changing tables dads can reach",
    addPlace: "+ Add a place",
    methods: "Methods",
    methodsHref: "methods-en.html",
    langButton: "DE",

    ariaZoomIn: "Zoom in",
    ariaZoomOut: "Zoom out",
    ariaLocate: "Show my location",
    ariaHome: "PapaMap — home",
    ariaClose: "Close",
    ariaLang: "Auf Deutsch wechseln",

    stAccessible: "Dads can reach it",
    stFemaleOnly: "Women's room only",
    stUnknown: "Room unknown",
    metaAccessible: "A dad can reach this changing table.",
    metaFemaleOnly: "The table is in the women's room only.",
    metaUnknown: "Nobody has tagged which room the table is in — can you answer?",

    countShown: "{shown} of {total} tables",
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
};
