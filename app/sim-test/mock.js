// Smoke test of the store app on a simulated phone (sim-test/run.sh loads this
// as the first script of the bundled shell; never part of a store build).
// Stands in for OSM, Photon and the delta file — nothing reaches
// OpenStreetMap — and drives the popup flows by tapping the real DOM. Every
// line it logs starts with [TEST]; run.sh takes a screenshot at each SHOT.
(() => {
  // Where the pins are picked from; run.sh puts the phone's fix in the same area.
  const AREA = { west: 9.93, south: 53.54, east: 10.05, north: 53.60 };   // Hamburg
  const LAT = 53.5691, LON = 9.9634;
  const realFetch = window.fetch.bind(window);
  const t0 = Date.now();
  const log = (...a) => console.log("[TEST]", ((Date.now() - t0) / 1000).toFixed(1) + "s", ...a);
  addEventListener("error", (e) => log("JSERR", e.message, e.filename, e.lineno));
  addEventListener("unhandledrejection", (e) => log("REJECT", e.reason?.message || String(e.reason)));
  // Four launches of one install, each a step: 0 picks the pins from the
  // dataset, 1 answers on a grey pin, 2 opens a green one, 3 is the map alone.
  const step = localStorage.getItem("test-step") || "0";
  const pins = JSON.parse(localStorage.getItem("test-pins") || "{}");
  localStorage.setItem("papamap-osm-token", "fake-token");   // a logged-in reader; OSM is mocked below
  localStorage.setItem("papamap-osm-user", "tester");
  localStorage.setItem("papamap-review", JSON.stringify({ answers: 0, days: 0, day: null, asked: new Date().toISOString().slice(0, 10) }));
  // "app1": every what's-new note there is, so step 3 always has a dialog to show.
  localStorage.setItem("papamap-intro", step === "3" ? "app1" : "app99999");
  const osmParam = step === "1" ? pins.grey : step === "2" ? pins.green : null;
  history.replaceState(null, "", osmParam ? "?osm=" + encodeURIComponent(osmParam) : location.pathname);
  log("STEP", step, location.href);

  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
  const text = (s) => new Response(s, { status: 200, headers: { "Content-Type": "text/plain" } });
  const inArea = (f) => { const [x, y] = f.geometry.coordinates; return x > AREA.west && x < AREA.east && y > AREA.south && y < AREA.north; };
  const noWheelchair = (p) => p.wheelchair == null && p.toilets_wheelchair == null;
  const pickPins = (features) => {
    const near = features.filter(inArea);
    const grey = (f) => f.properties.status === "unknown" && !f.properties.location_raw && noWheelchair(f.properties)
      && f.properties.play == null && f.properties.highchair == null;
    const green = (f) => f.properties.status === "accessible" && f.properties.name && noWheelchair(f.properties) && f.properties.play == null;
    const g = near.find((f) => grey(f) && f.properties.amenity === "cafe") || near.find(grey);
    const a = near.find(green);
    if (!g || !a) throw new Error("no test pins in the area");
    return { grey: g.properties.osm_url, green: a.properties.osm_url };
  };
  let delta = null;

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method || (typeof input === "string" ? "GET" : input.method) || "GET").toUpperCase();
    if (step === "0" && url.includes("changing_tables.geojson")) {
      // The app reads its own copy first (empty on a fresh install, then the
      // native download fills it): act on the read that has the features.
      const r = await realFetch(input, init);
      let features = null;
      try { features = (await r.clone().json()).features; } catch { log("dataset not there yet:", url); }
      if (features) try {
        const picked = pickPins(features);
        localStorage.setItem("test-pins", JSON.stringify(picked));
        localStorage.setItem("test-step", "1");
        log("PINS", JSON.stringify(picked));
        location.reload();
      } catch (e) { log("FAIL", e.message); }
      return r;
    }
    if (url.includes("openstreetmap.org/api/")) {
      const path = new URL(url).pathname;
      log("OSM mock", method, path, init.body ? String(init.body).replace(/\s+/g, " ").slice(0, 160) : "");
      const m = path.match(/\/(node|way)\/(\d+)\.json$/);
      // Every pin is changing_table=yes in OSM; answer() reads that back from the write.
      if (m && method === "GET") return json({ elements: [{ type: m[1], id: Number(m[2]), lat: LAT, lon: LON,
        version: 5, timestamp: "2026-10-01T00:00:00Z", tags: { amenity: "cafe", name: "Mock", changing_table: "yes" } }] });
      if (path.endsWith("/changeset/create")) return text("4242");
      if (method === "PUT" && /\/(node|way)\/\d+$/.test(path)) return text("6");
      if (path.endsWith("/user/details.json"))
        return json({ user: { id: 1, display_name: "tester", account_created: "2020-01-01T00:00:00Z" } });
      if (path.includes("/changesets")) return json({ changesets: [] });
      return text("");
    }
    if (url.includes("photon.komoot.io")) return json({ type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [LON + 0.0004, LAT + 0.0002] },
        properties: { osm_type: "N", osm_id: 990000001, osm_key: "amenity", osm_value: "cafe", name: "Mock Café",
                      street: "Teststraße", housenumber: "1", city: "Hamburg" } }] });
    if (url.includes("data/delta.json")) {   // an empty delta: the reader's own answers stay the only change
      if (!delta) {
        const d = await (await realFetch(input, init)).json();
        delta = { ...d, tables: { upsert: [], remove: [] }, places: { upsert: [], remove: [] }, new_toilets_no_table: [] };
      }
      return json(delta);
    }
    return realFetch(input, init);
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (what, fn, ms = 60000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) { const v = fn(); if (v) return v; }
    throw new Error("timed out waiting for " + what);
  };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const shot = async (name) => { await sleep(1000); log("SHOT", name); await sleep(3500); };
  const popup = () => $(".maplibregl-popup .popup");
  const fold = () => $(".maplibregl-popup details.more");
  const state = () => JSON.stringify({
    fold: fold() ? (fold().open ? "open" : "closed") : "none",
    summary: fold()?.querySelector("summary")?.textContent,
    inFold: $$(".maplibregl-popup details.more > [class^=ask-]").map((e) => e.className),
    chained: !!$(".maplibregl-popup .popup > .ask-wc"),
    who: $(".maplibregl-popup .ask-who")?.parentElement?.className,
    stored: localStorage.getItem("papamap-more-open"),
    rows: $$(".maplibregl-popup .row").map((r) => r.textContent.trim()),
    links: $$(".maplibregl-popup a").map((a) => a.textContent.trim()),
    share: !!$(".maplibregl-popup button[data-share]"),
    note: $(".maplibregl-popup .edit-note")?.textContent.trim(),
  });
  const next = (s) => { localStorage.setItem("test-step", s); location.reload(); };
  const tap = (el) => { el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); el.click(); };
  const answered = (cls) => waitFor(cls + " answered", () => popup() && !$(".maplibregl-popup ." + cls), 20000);

  addEventListener("load", async () => {
    try {
      if (step === "0") return;   // the fetch above reloads into step 1
      if (step === "1") {
        await waitFor("grey pin popup", () => popup() && $(".maplibregl-popup .ask .ask-btns button.ask-btn"));
        await sleep(2500);
        log("STATE grey pin", state()); await shot("01-grey-pin-logged-in");
        fold().querySelector("summary").click(); await sleep(700);
        log("STATE fold closed", state()); await shot("02-fold-closed");
        $('.maplibregl-popup .ask .ask-btns button.ask-btn[data-room="both"]').click();
        const chained = await waitFor("chained wheelchair question",
          () => { const q = $(".maplibregl-popup .popup > .ask-wc"); return q && !q.querySelector("button[disabled]") ? q : null; }, 20000);
        log("STATE chained", state()); await shot("03-chained-wheelchair");
        chained.querySelector('button.ask-btn[data-room="wc_yes"]').click();
        await answered("ask-wc"); await sleep(700);
        log("STATE wc answered", state()); await shot("04-wheelchair-answered");
        fold().querySelector("summary").click(); await sleep(700);
        log("STATE fold reopened", state()); await shot("05-fold-reopened");
        $('.maplibregl-popup details.more .ask-tw button.ask-btn[data-room="tw_limited"]').click();
        await answered("ask-tw"); await sleep(700);
        log("STATE tw answered", state()); await shot("06-table-answered");
        log("OVERRIDES", localStorage.getItem("papamap-answer-overrides"));
        next("2");
      } else if (step === "2") {
        await waitFor("green pin popup", () => popup() && fold());
        await sleep(2500);
        log("STATE green pin", state()); await shot("07-second-pin-sticky-fold");
        const route = $(".maplibregl-popup a[data-route]");
        log("ROUTE", route?.textContent.trim(), route?.getAttribute("href"));
        const mc = $(".maplibregl-popup details.more a");
        log("EDIT link", mc?.textContent.trim(), mc?.getAttribute("href"));
        $(".maplibregl-popup-close-button")?.click(); await sleep(600);
        next("3");
      } else {
        await waitFor("what's-new dialog", () => $("#intro-dialog[open]"), 40000);
        await sleep(1000);
        log("NEWS", $("#intro-title")?.textContent, "|", $("#intro-list")?.textContent.trim().replace(/\s+/g, " ").slice(0, 400));
        await shot("08-whats-new");
        $("#intro-ok").click(); await sleep(800);
        const inp = $("#search-input");
        tap(inp); inp.focus(); inp.value = "Mock";
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        await waitFor("search results", () => $("#search-results li.search-opt"), 15000);
        await sleep(1200);
        log("RESULTS", $$("#search-results li").map((l) => l.textContent.trim().replace(/\s+/g, " ")).join(" | ").slice(0, 400));
        await shot("09-search");
        tap($("#search-results li.search-opt")); await sleep(2500);
        log("after search tap: popup", !!popup());
        await shot("10-search-result");
        $(".maplibregl-popup-close-button")?.click();
        $("#mode-mama").click(); await sleep(1800);
        log("MODE mum pressed", $("#mode-mama")?.getAttribute("aria-pressed"));
        await shot("11-mum-view");
        log("DONE");
      }
    } catch (e) { log("FAIL", e.message); }
  });
})();
