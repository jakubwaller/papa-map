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
  for (const f of ["datenschutz.html", "datenschutz-en.html"]) {
    assert.ok(read(f).includes("<code>papamap-intro</code>"), f);
    assert.ok(!read(f).includes("papamap-tip-seen"), f);
  }
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

test("both privacy pages cover the Android app, and the manifest keeps their three promises", () => {
  // The pages are the Play listing's privacy URL, so the Android app has to
  // be on them before any Play release (issue #124). Three of their sentences
  // only the manifest can make true: the app stays out of cloud backup
  // (allowBackup="false"), never asks for location in the background, and
  // the WebView's Safe Browsing lookups it discloses are left switched on.
  const manifest = read("../app/android/app/src/main/AndroidManifest.xml");
  assert.ok(manifest.includes('android:allowBackup="false"'), "the pages say: no cloud backup");
  assert.ok(!manifest.includes("ACCESS_BACKGROUND_LOCATION"), "the pages say: no background location");
  assert.ok(!manifest.includes("EnableSafeBrowsing"), "the pages say: Safe Browsing is on");
  for (const [f, words] of [
    ["datenschutz.html", ["Die App (iPhone, iPad und Android)", "App: Google (Google Play)",
                          "Datensicherung in der Cloud", "Zugriff im Hintergrund", "Google Safe Browsing"]],
    ["datenschutz-en.html", ["The app (iPhone, iPad and Android)", "App: Google (Google Play)",
                             "cloud backup", "access in the background", "Google Safe Browsing"]],
  ]) {
    const html = read(f);
    for (const w of words) assert.ok(html.includes(w), `${f}: ${w}`);
  }
});

test("the option cards read at AA contrast in both colour schemes", () => {
  // In dark mode the old text badge kept the light scheme's #00775a on the
  // box's dark green, 2.7:1. The store link is Apple's badge now; what is left
  // to hold is the cards' own text and the Android button, in each scheme.
  const lum = (hex) => {
    const c = hex.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (const f of PAGES) {
    const src = read(f);
    const rule = (sel) => src.match(new RegExp(`${sel} \\{([^}]*)\\}`))[1];
    const ref = (body, prop) => body.match(new RegExp(`(?:^|[\\s;])${prop}: var\\((--[a-z-]+)\\)`))[1];
    const card = rule("\\.option"), link = rule("\\.option a"), cta = rule("\\.option a\\.cta");
    const pairs = [
      ["--ink", ref(card, "background")],
      [ref(link, "color"), ref(card, "background")],
      [ref(cta, "color"), ref(cta, "background")],
    ];
    const roots = [...src.matchAll(/:root \{([^}]*)\}/g)].map((m) => m[1]);
    assert.equal(roots.length, 2, `${f}: expected a light and a dark :root`);
    for (const root of roots) {
      const v = (name) => root.match(new RegExp(`${name}: (#[0-9a-f]{6})`, "i"))[1];
      for (const [fg, bg] of pairs) {
        const ratio = contrast(v(fg), v(bg));
        assert.ok(ratio >= 4.5, `${f}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

// The page source without comments. The loop's fallback <img> sits inside its
// <video>; stripping the videos leaves the pictures the page shows on its own.
const stripped = (f) => read(f).replace(/<!--[\s\S]*?-->/g, "");
const withoutVideos = (f) => stripped(f).replace(/<video\b[\s\S]*?<\/video>/g, "");
const attr = (tag, name) => (new RegExp(`\\s${name}="([^"]*)"`).exec(tag) || [])[1];
const local = (src) => src && !/^(?:[a-z]+:|\/\/)/i.test(src);

test("every image on the two pages is a local file with a size and alt text", () => {
  // The Datenschutz promises no third-party requests, so Apple's badge is
  // served from here, never hotlinked. Width and height keep the layout still
  // while the screenshots load; everything below the hero loads lazily.
  for (const f of PAGES) {
    const imgs = [...withoutVideos(f).matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(imgs.length >= 6, `${f}: ${imgs.length} images`);
    imgs.forEach((tag, i) => {
      const src = attr(tag, "src");
      assert.ok(local(src), `${f}: ${src} is not a local file`);
      assert.ok(existsSync(new URL(src, dir)), `${f}: ${src} is missing`);
      assert.ok(/^\d+$/.test(attr(tag, "width") || "") && /^\d+$/.test(attr(tag, "height") || ""), `${f}: ${src} has no size`);
      assert.ok((attr(tag, "alt") || "").trim().length > 10, `${f}: ${src} has no alt text`);
      // The badge and the hero screenshot are the first two; the rest wait.
      assert.equal(attr(tag, "loading") === "lazy", i >= 2, `${f}: ${src} loading`);
    });
    assert.ok(imgs[0].includes(`img/app-store-badge-${f === "app.html" ? "de" : "en"}.svg`), `${f}: badge language`);
    for (const tag of imgs.slice(1))
      assert.ok(attr(tag, "src").endsWith(f === "app.html" ? "-de.webp" : "-en.webp"), `${f}: ${attr(tag, "src")}`);
  }
});

test("the loop in step 3 is a muted, local, sized video with a poster and a still fallback", () => {
  // A muted video is the only kind a browser plays without a tap, and a phone
  // plays it in the page rather than full screen only with playsinline. Files
  // come from here like every picture (no third-party requests); the sizes keep
  // the layout still before the poster arrives. It has no autoplay and
  // preload="none": nothing but the poster is fetched until the script plays
  // it, when half of it is on screen.
  for (const f of PAGES) {
    const lang = f === "app.html" ? "de" : "en";
    const html = stripped(f);
    const videos = [...html.matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/g)];
    assert.ok(videos.length >= 1, `${f}: no video`);
    for (const [, open, inner] of videos) {
      const tag = `<video${open}>`;
      for (const flag of ["muted", "loop", "playsinline"])
        assert.ok(new RegExp(`\\s${flag}(?=[\\s>=])`).test(tag), `${f}: video lacks ${flag}`);
      assert.ok(!/\sautoplay(?=[\s>=])/.test(tag), `${f}: video must not autoplay`);
      assert.equal(attr(tag, "preload"), "none", `${f}: video preload`);
      assert.ok(/^\d+$/.test(attr(tag, "width") || "") && /^\d+$/.test(attr(tag, "height") || ""), `${f}: video has no size`);
      assert.ok((attr(tag, "aria-label") || "").trim().length > 10, `${f}: video has no aria-label`);
      const poster = attr(tag, "poster");
      const sources = [...inner.matchAll(/<source\b[^>]*>/g)].map((m) => m[0]);
      assert.ok(sources.length >= 1, `${f}: video has no source`);
      const files = [poster, ...sources.map((t) => attr(t, "src"))];
      for (const src of files) {
        assert.ok(local(src) && src.startsWith("img/"), `${f}: ${src} is not a local file under img/`);
        assert.ok(existsSync(new URL(src, dir)), `${f}: ${src} is missing`);
        assert.ok(src.includes(`-${lang}.`), `${f}: ${src} is not the ${lang} loop`);
      }
      for (const t of sources) {
        const src = attr(t, "src");
        assert.equal(attr(t, "type"), src.endsWith(".webm") ? "video/webm" : "video/mp4", `${f}: ${src} type`);
      }
      // What a browser without video support shows: the poster, with alt text.
      const img = /<img\b[^>]*>/.exec(inner)?.[0];
      assert.ok(img, `${f}: video has no fallback image`);
      assert.equal(attr(img, "src"), poster, `${f}: fallback is not the poster`);
      assert.ok((attr(img, "alt") || "").trim().length > 10, `${f}: fallback has no alt text`);
      assert.ok(/^\d+$/.test(attr(img, "width") || "") && /^\d+$/.test(attr(img, "height") || ""), `${f}: fallback has no size`);
    }
    // The script plays it only while half of it is on screen and pauses it
    // otherwise; a reader who asked for less motion gets the room dialog as the
    // poster and the controls, and the file for it has to exist.
    assert.ok(/intersectionRatio >= 0\.5\) e\.target\.play\(\)[^;]*; else e\.target\.pause\(\)/.test(html), `${f}: in-view playback`);
    assert.ok(html.includes("(prefers-reduced-motion: reduce)") && html.includes("v.controls = true"), `${f}: reduced motion`);
    assert.ok(html.includes('v.poster = "img/app/room-" + document.documentElement.lang + ".webp"'), `${f}: reduced-motion poster`);
    assert.ok(existsSync(new URL(`img/app/room-${lang}.webp`, dir)), `${f}: room screenshot`);
  }
});

// The page's <style> as a flat list of rules, each with the at-rules around it.
function cssRules(f) {
  const css = /<style>([\s\S]*?)<\/style>/.exec(read(f))[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [], stack = [];
  let buf = "";
  for (const ch of css) {
    if (ch === "{") {
      if (stack.length) stack[stack.length - 1].kids++;
      stack.push({ head: buf.trim(), kids: 0 });
      buf = "";
    } else if (ch === "}") {
      const frame = stack.pop();
      rules.push({ sel: frame.head, body: frame.kids ? "" : buf, ctx: stack.map((x) => x.head) });
      buf = "";
    } else buf += ch;
  }
  return rules.filter((r) => r.body);
}

test("the pages make no request of their own beyond local files", () => {
  // The Datenschutz promises no third-party requests. Scripts are inline; the
  // canonical and alternate links name pages, they are not fetched.
  for (const f of PAGES) {
    const html = stripped(f);
    assert.ok(!/<script\b[^>]*\ssrc=/i.test(html), `${f}: a script is loaded from a file`);
    for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
      if (/\srel="(?:canonical|alternate)"/.test(tag)) continue;
      assert.ok(local(attr(tag, "href")), `${f}: ${tag} is not local`);
    }
    assert.ok(!/@import|url\(\s*["']?(?:[a-z]+:|\/\/)/i.test(/<style>([\s\S]*?)<\/style>/.exec(html)[1]), `${f}: the CSS fetches from outside`);
  }
});

test("scroll animations: nothing starts hidden without the js class, and less motion switches them off", () => {
  for (const f of PAGES) {
    const html = read(f);
    // The first script sets the class, before any style applies.
    const head = html.slice(0, html.indexOf("<style>"));
    assert.ok(head.includes('document.documentElement.classList.add("js")'), `${f}: js class`);
    const rules = cssRules(f);
    const inKeyframes = (r) => r.ctx.some((c) => c.startsWith("@keyframes"));
    const hides = rules.filter((r) => !inKeyframes(r) && /(?:^|[;\s])(?:opacity:\s*0\s*(?:;|$)|transform:\s*translate[XY]?\()/.test(r.body.trim()));
    assert.ok(hides.length >= 3, `${f}: ${hides.length} hiding rules`);
    for (const r of hides)
      for (const sel of r.sel.split(","))
        assert.match(sel.trim(), /^\.js[\s.]/, `${f}: "${sel.trim()}" hides without .js`);
    // Only opacity and transform move (and the pin's colour changes): no
    // animation or transition on anything that would shift the layout.
    for (const r of rules)
      for (const [, prop] of r.body.matchAll(/transition:\s*([a-z-]+)/g))
        assert.ok(["none", "opacity", "transform", "background-color"].includes(prop), `${f}: transition on ${prop}`);
    // Less motion: every animation and transition off, every step there at once.
    const calm = rules.filter((r) => r.ctx.includes("@media (prefers-reduced-motion: reduce)"));
    assert.ok(calm.some((r) => /animation:\s*none/.test(r.body) && /transition:\s*none/.test(r.body)), `${f}: reduced motion keeps animating`);
    for (const sel of [".js .step > div:not(.media)", ".js .step > .media"])
      assert.ok(calm.some((r) => r.sel.split(",").map((x) => x.trim()).includes(sel) && /opacity:\s*1/.test(r.body)), `${f}: reduced motion hides ${sel}`);
    // The route's curtain exists only where scroll-driven animations do, and
    // never under reduced motion; without it the route is a plain line.
    const curtain = rules.find((r) => r.sel === ".steps::after" && r.body.includes("animation-timeline"));
    assert.deepEqual(curtain.ctx, ["@supports (animation-timeline: view())", "@media (prefers-reduced-motion: no-preference)"], f);
    assert.ok(rules.some((r) => r.sel === ".steps::before" && r.ctx.length === 0), `${f}: the route line is plain CSS`);
  }
});

test("the top of the page fades in within 700 ms, and the page's scripts stay small", () => {
  for (const f of PAGES) {
    const rules = cssRules(f);
    const main = rules.find((r) => r.sel.startsWith("h1,") && r.body.includes("animation: rise"));
    assert.ok(main && main.ctx.length === 0, `${f}: hero animation`);
    const ms = Number(/animation: rise (\d+)ms/.exec(main.body)[1]);
    const delays = rules.filter((r) => /^(?:\.lead|\.options|\.free|body > \.shot)$/.test(r.sel) && r.body.includes("animation-delay"))
      .map((r) => Number(/animation-delay: (\d+)ms/.exec(r.body)[1]));
    assert.equal(delays.length, 4, f);
    assert.ok(ms + Math.max(...delays) < 700, `${f}: ${ms + Math.max(...delays)} ms`);
    // The hero animation is CSS only and ends on the normal state (no fill forwards).
    assert.ok(!/forwards|both/.test(main.body), f);
    const lines = [...stripped(f).matchAll(/<script>([\s\S]*?)<\/script>/g)].reduce((n, m) => n + m[1].trim().split("\n").length, 0);
    assert.ok(lines <= 60, `${f}: ${lines} script lines`);
  }
});
