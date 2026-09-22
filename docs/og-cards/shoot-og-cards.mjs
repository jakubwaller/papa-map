// Reusable recipe for PapaMap's two Open Graph card screenshots
// (web/og-image.jpg from ?lang=de, web/og-image-en.jpg from ?lang=en).
//
// Run from this directory after `npm i playwright` here (Chrome via the
// `chrome` channel, no separate browser download needed):
//
//   node shoot-og-cards.mjs <out-dir> [min-app-version]
//
// Example:
//   node shoot-og-cards.mjs ./out app39
//
// <min-app-version> is optional; if given, the script fails loudly when the
// live site's app.js?v= is older than that (guards against shooting a stale
// deploy). Writes <out-dir>/og-image.jpg and <out-dir>/og-image-en.jpg, then
// re-compresses each with `sips` to land near 250-300 KB.
//
// Trap this dodges: the site registers a service worker, and a stale one
// serves an old shell to a browser that already has one. Each shot below
// runs in its own freshly launched browser + brand-new context, so there is
// no prior SW registration to inherit.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

const OUT_DIR = process.argv[2];
const MIN_APP_VERSION = process.argv[3] || null;

if (!OUT_DIR) {
  console.error("usage: node shoot-og-cards.mjs <out-dir> [min-app-version]");
  process.exit(1);
}

function appVersionOf(src) {
  // src looks like "app.js?v=app39". Only match the shell script itself,
  // not "in-app.js" (which also ends in "app.js" as a substring).
  const m = /(?:^|\/)app\.js\?v=([A-Za-z0-9]+)/.exec(src || "");
  return m ? m[1] : null;
}

function versionNumber(v) {
  const m = /^app(\d+)$/.exec(v || "");
  return m ? parseInt(m[1], 10) : null;
}

async function shootOne(lang, outPath) {
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    await page.goto(`https://papamap.de/?lang=${lang}`, {
      waitUntil: "networkidle",
    });

    // Confirm the loaded shell is the current app.js, not a stale
    // service-worker shell.
    const scriptSrcs = await page.$$eval("script[src]", (els) =>
      els.map((e) => e.getAttribute("src")),
    );
    const appSrc = scriptSrcs.find((s) => appVersionOf(s));
    const appVersion = appSrc ? appVersionOf(appSrc) : null;
    console.log(`[${lang}] app script: ${appSrc} (version ${appVersion})`);
    if (!appVersion) {
      throw new Error(`[${lang}] could not find app.js?v=... among: ${scriptSrcs.join(", ")}`);
    }
    if (MIN_APP_VERSION) {
      const have = versionNumber(appVersion);
      const want = versionNumber(MIN_APP_VERSION);
      if (have != null && want != null && have < want) {
        throw new Error(
          `[${lang}] live site is on ${appVersion}, expected >= ${MIN_APP_VERSION}. ` +
          `Stale deploy or stale service worker — do not shoot yet.`,
        );
      }
    }

    // Map + pins ready via the debug handle.
    await page.waitForFunction(
      () => window._papamap && typeof window._papamap.jumpTo === "function",
      { timeout: 30000 },
    );
    await page.waitForFunction(() => window._papamap.loaded(), { timeout: 30000 });
    // The stats strip must carry the counts: a transient miss of stats.json
    // would bake "Statistik nicht verfügbar" into the card.
    await page.waitForFunction(
      () => document.querySelectorAll("#stats .stat").length >= 2
        && !/stats\.json/.test(document.querySelector("#stats")?.textContent || ""),
      { timeout: 30000 },
    );

    // Frame Europe — the ?bbox= URL param can't reach this framing.
    await page.evaluate(() => {
      window._papamap.jumpTo({ center: [4.5, 51], zoom: 3.53 });
    });

    // Let the jump, tile loads and pin redraw settle.
    await page.waitForTimeout(2500);
    await page.waitForFunction(
      () => !window._papamap.isMoving() && !window._papamap.isZooming(),
      { timeout: 15000 },
    ).catch(() => {});
    await page.waitForTimeout(500);

    // Hide #count (the trailing "shown / total" text in the chip row) — at
    // 1200px it is the thing that gets clipped mid-word by the row's
    // overflow-x scroll. Check for other overlays worth hiding the same way
    // (cookie/toast banners, an awkwardly placed "nearest" pill) by looking
    // at the screenshot afterwards; extend this list if one shows up.
    await page.evaluate(() => {
      const el = document.querySelector("#count");
      if (el) el.style.display = "none";
    });
    await page.waitForTimeout(300);

    await page.screenshot({ path: outPath, type: "jpeg", quality: 92 });
    console.log(`[${lang}] wrote ${outPath}`);
  } finally {
    await browser.close();
  }
}

function compress(path) {
  execFileSync("sips", ["-s", "formatOptions", "72", path]);
  const size = statSync(path).size;
  console.log(`${path}: ${(size / 1024).toFixed(0)} KB after sips compression`);
}

async function main() {
  const deOut = `${OUT_DIR}/og-image.jpg`;
  const enOut = `${OUT_DIR}/og-image-en.jpg`;
  await shootOne("de", deOut);
  await shootOne("en", enOut);
  for (const p of [deOut, enOut]) {
    if (existsSync(p)) compress(p);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
