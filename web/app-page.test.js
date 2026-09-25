// The app page tells readers how to put PapaMap on the home screen. This
// pins the parts that have to agree without ever running together: the
// header pill's per-language target, the two pages' install steps and the
// manifest they rely on, the sitemap — and that nothing of the vote counter
// the page carried until September 2026 is left behind (its POST paths, its
// Caddy log, its line in the Datenschutz).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { STRINGS, LANGS } from "./i18n.js";

const dir = new URL(".", import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), "utf8");
const PAGES = ["app.html", "app-en.html"];
// Changes with the artwork, not with the shell: see docs/logo/README.md.
const ICON_PIN = "logo2";

test("every language's app link lands on one of the two pages", () => {
  for (const lang of LANGS) {
    assert.ok(PAGES.includes(STRINGS[lang].appHref), `${lang}: ${STRINGS[lang].appHref}`);
    assert.ok(STRINGS[lang].app.trim(), `${lang}: empty label`);
    assert.ok(STRINGS[lang].ariaApp.includes("PapaMap"), `${lang}: aria`);
    // The label names the page; the vote question it used to ask is gone.
    assert.ok(!/[?？;]/.test(STRINGS[lang].ariaApp), `${lang}: aria still asks`);
  }
  assert.equal(STRINGS.de.appHref, "app.html");
  assert.equal(STRINGS.en.appHref, "app-en.html");
});

test("both pages carry the install steps, and the map carries the manifest they rely on", () => {
  const de = read("app.html"), en = read("app-en.html");
  assert.ok(de.includes("„Zum Home-Bildschirm“") && de.includes("„Zum Startbildschirm hinzufügen“"));
  assert.ok(en.includes("“Add to Home Screen”") && en.includes("“Add to Home screen”"));
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.name, "PapaMap");
  assert.equal(manifest.display, "standalone");
  assert.ok(read("index.html").includes('<link rel="manifest" href="manifest.webmanifest" />'));
  // The steps are read here, so here is where people follow them: without
  // the manifest, iOS would pin the instructions and Android would show no
  // "Install" item at all.
  for (const f of PAGES) {
    const html = read(f);
    assert.ok(html.includes('<link rel="manifest" href="manifest.webmanifest">'), f);
    assert.ok(html.includes(`<link rel="apple-touch-icon" href="icons/apple-touch-icon.png?v=${ICON_PIN}">`), f);
    assert.ok(html.includes('<meta name="apple-mobile-web-app-title" content="PapaMap">'), f);
  }
});

test("every home-screen icon exists and carries the one artwork pin", () => {
  // The PNGs keep their names when the logo changes, so the pin is what tells
  // Cloudflare and an installed web app that the picture is a new one. One
  // icon left on an old pin (or none) keeps the old logo there.
  const { icons } = JSON.parse(read("manifest.webmanifest"));
  assert.equal(icons.length, 3);
  const touch = ["index.html", "index-en.html", ...PAGES].map((f) => {
    const m = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(read(f));
    assert.ok(m, f);
    return m[1];
  });
  for (const src of [...icons.map((i) => i.src), ...touch]) {
    const [path, query] = src.split("?");
    assert.equal(query, `v=${ICON_PIN}`, src);
    assert.ok(existsSync(new URL(path, dir)), path);
  }
});

test("nothing of the vote counter is left: no buttons, no POST paths, no Caddy log, no key", () => {
  for (const f of PAGES) {
    const html = read(f);
    assert.ok(!html.includes("data-tap=") && !html.includes("/app/ja/"), f);
    // A reader who voted still holds the key; the page removes it, since
    // the Datenschutz no longer names it.
    assert.ok(html.includes('localStorage.removeItem("papamap-app")'), f);
  }
  const caddy = read("../deploy/papamap.Caddyfile");
  assert.ok(!caddy.includes("/app/ja/") && !caddy.includes("log_skip") && !caddy.includes("respond 204"));
  const ds = read("datenschutz.html");
  assert.ok(!ds.includes("papamap-app") && ds.includes("<code>papamap-mode</code>"));
});

test("the header pill, the sitemap and the pages know each other", () => {
  const index = read("index.html");
  assert.ok(index.includes('id="app-link"') && index.includes('data-i18n="app"'));
  assert.ok(read("index-en.html").includes('id="app-link"'), "index-en.html is regenerated");
  assert.ok(read("app.js").includes('getElementById("app-link").href = t("appHref")'));
  const sitemap = read("sitemap.xml");
  for (const f of PAGES)
    assert.ok(sitemap.includes(`<loc>https://papamap.de/${f}</loc>`), f);
  assert.ok(read("app.html").includes('hreflang="en" href="https://papamap.de/app-en.html"'));
  assert.ok(read("app-en.html").includes('hreflang="de" href="https://papamap.de/app.html"'));
});

test("both pages link the iPhone app in the store, say where Android stands and offer a mail when it ships", () => {
  // The iPhone line became the store link when 1.0 went live (2026-09-25).
  // Android keeps a mailto rather than a signup form: nothing is stored by
  // the site, and the Datenschutz's e-mail section is what covers the address.
  // The German page links the German storefront; the English one leaves the
  // country to Apple, which sends the reader to their own.
  for (const [f, store, words] of [
    ["app.html", "https://apps.apple.com/de/app/papamap/id6813376985", ["im App Store", "in Arbeit"]],
    ["app-en.html", "https://apps.apple.com/app/papamap/id6813376985", ["on the App Store", "in development"]],
  ]) {
    const html = read(f);
    assert.ok(html.includes(`href="${store}"`), `${f}: store link`);
    assert.ok(!/im Test|in testing/.test(html), `${f}: still says the app is in testing`);
    for (const w of words) assert.ok(html.includes(w), `${f}: ${w}`);
    const subjects = [...html.matchAll(/href="mailto:papamap@jakubwaller\.eu\?subject=([^"]+)"/g)]
      .map((m) => decodeURIComponent(m[1]));
    assert.deepEqual(subjects.map((s) => s.includes("Android")), [true], `${f}: ${subjects}`);
    assert.ok(!html.includes("<form"), f);
  }
  assert.ok(read("datenschutz.html").includes("Kontakt per E-Mail"));
});
