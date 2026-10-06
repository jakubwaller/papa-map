// The App Store product-page header (Apple's optional "header" asset),
// 3840x1646 and 5244x2950, one per language. Same look as the screenshots
// (DESIGN.md): brand green ground, the app's system font, the logo from
// web/icon.svg, two real app screens from the raw shots. Apple crops the
// header per device, so everything sits in the central 60 % of the width.
//
//   node make-header.mjs <out-dir>     reads <out-dir>/raw/iphone69-<lang>-*,
//                                      writes <out-dir>/final/header-<lang>-<W>x<H>.png
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT_DIR = process.argv[2];
if (!OUT_DIR) { console.error("usage: node make-header.mjs <out-dir>"); process.exit(1); }

const SIZES = [[3840, 1646], [5244, 2950]];
const HEADLINES = {
  de: "Wickeltische, an die *Papa* rankommt",
  en: "Changing tables *dads* can get to",
};
const LOGO = readFileSync(new URL("../../web/icon.svg", import.meta.url), "utf8");
const dataUrl = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;

function html(W, H, lang, headline) {
  const u = W / 3840;                       // every length below is in units of the 3840 layout
  const px = (n) => `${Math.round(n * u)}px`;
  const hl = headline.replace(/\*(.+?)\*/, '<span class="accent">$1</span>');
  const map = dataUrl(`${OUT_DIR}/raw/iphone69-${lang}-01-map.png`);
  const add = dataUrl(`${OUT_DIR}/raw/iphone69-${lang}-05-add.png`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#009e73;overflow:hidden}
  *{box-sizing:border-box;font-family:-apple-system,system-ui,"Segoe UI",Roboto,sans-serif}
  #c{position:relative;width:${W}px;height:${H}px;overflow:hidden;
     background:linear-gradient(135deg,#00a97b 0%,#009e73 55%,#008a64 100%)}
  #logo{position:absolute;left:${px(780)};top:${H / 2 - 330 * u}px;width:${px(210)};height:${px(210)}}
  #logo svg{width:100%;height:100%;display:block;border-radius:${px(48)};box-shadow:0 ${px(12)} ${px(40)} rgba(0,0,0,.22)}
  #wm{position:absolute;left:${px(1030)};top:${H / 2 - 330 * u}px;height:${px(210)};display:flex;align-items:center;
      font-size:${px(96)};font-weight:700;color:#fff;letter-spacing:-.01em}
  #h{position:absolute;left:${px(780)};top:${H / 2 - 60 * u}px;width:${px(1060)};
     font-size:${px(116)};font-weight:700;line-height:1.1;color:#fff;letter-spacing:-.015em}
  #h .accent{color:#1c2b26}
  .ph{position:absolute;width:${px(600)};border-radius:${px(60)};overflow:hidden;border:${px(6)} solid rgba(255,255,255,.9);
      box-shadow:0 ${px(30)} ${px(80)} rgba(0,40,28,.35);background:#fff}
  .ph img{display:block;width:100%;height:auto}
  #a{left:${px(1890)};top:${H * 0.13}px}
  #b{left:${px(2470)};top:${H * 0.27}px}
</style></head><body><div id="c">
  <div id="logo">${LOGO}</div><div id="wm">PapaMap</div>
  <div id="h">${hl}</div>
  <div class="ph" id="a"><img src="${map}"></div>
  <div class="ph" id="b"><img src="${add}"></div>
</div></body></html>`;
}

const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
try {
  for (const lang of Object.keys(HEADLINES)) {
    for (const [W, H] of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.setContent(html(W, H, lang, HEADLINES[lang]), { waitUntil: "load" });
      await page.waitForTimeout(200);
      const out = `${OUT_DIR}/final/header-${lang}-${W}x${H}.png`;
      await page.screenshot({ path: out });
      await ctx.close();
      const s = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", "-g", "hasAlpha", out]).toString();
      const got = `${/pixelWidth: (\d+)/.exec(s)[1]}x${/pixelHeight: (\d+)/.exec(s)[1]}`;
      if (got !== `${W}x${H}` || /hasAlpha: yes/.test(s)) throw new Error(`${out}: ${got}, ${s}`);
      console.log(`OK   ${out}: ${got}`);
    }
  }
} finally { await browser.close(); }
