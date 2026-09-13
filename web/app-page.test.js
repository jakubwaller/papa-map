// The app page tells readers how to put PapaMap on the home screen. This
// pins the parts that have to agree without ever running together: the
// header pill's per-language target, the two pages' install steps and the
// manifest they rely on, the sitemap — and that nothing of the vote counter
// the page carried until September 2026 is left behind (its POST paths, its
// Caddy log, its line in the Datenschutz).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STRINGS, LANGS } from "./i18n.js";

const dir = new URL(".", import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), "utf8");
const PAGES = ["app.html", "app-en.html"];

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
    assert.ok(html.includes('<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'), f);
    assert.ok(html.includes('<meta name="apple-mobile-web-app-title" content="PapaMap">'), f);
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
