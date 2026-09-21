# The PapaMap logo

Five master SVGs, one mark: a white door-sign-with-pin-tail holding the changing-table
pictogram, knocked out of the white by an SVG `<mask>` so the green shows through the
pictogram's strokes. Green is `#009e73` everywhere; white is `#fff`. Nothing here is
hand-tuned per output size — every PNG in the repo is a render of one of these five files at a
fixed pixel size, nothing more.

## The five masters and what each feeds

| Master | Feeds | Safe-zone scale |
| --- | --- | --- |
| `icon-square.svg` | `app/assets/icon-only.png` (iOS home-screen icon, no transparency, no rounded corners) | 0.86 |
| `icon-square.svg` | `web/icons/apple-touch-icon.png` (180 px, flattened onto the green — iOS renders transparency in an apple-touch icon as black) | 0.86 |
| `icon-rounded.svg` | `web/icons/icon-192.png`, `web/icons/icon-512.png` (the web manifest's `"any"` icons) | 0.86 |
| `icon-rounded.svg` | `web/icon.svg` (copied verbatim — this is the canonical single-file mark, linked from `web/taginfo.json`'s `icon_url` and bundled into the store app by `app/build-www.js`) | 0.86 |
| `icon-rounded.svg` | The splash logo, `app/assets/splash.png` / `splash-dark.png` (centred, not full-bleed — see below) | 0.86 |
| `icon-maskable.svg` | `web/icons/icon-maskable-512.png` (the manifest's `"maskable"` icon; full-bleed, mark inside the maskable safe zone, flattened — no transparency) | 0.70 |
| `icon-foreground.svg` | `app/assets/icon-foreground.png` (Android adaptive-icon foreground layer; transparent, mark inside the adaptive safe zone) | 0.52 |
| `icon-small.svg` | `web/favicon.svg` (copied verbatim, minified — every page's favicon) and `web/icons/favicon-32.png` (the PNG fallback) | n/a — 100×100 viewBox, a flat rounded tile with a simplified pictogram, not a scaled-down crop of the others |
| `icon-small.svg` | The 30×30 header brandmark, inline in `web/index.html`'s `<a class="brandmark">` (and therefore `web/index-en.html`, which `node web/build-index-en.js` regenerates from it) | n/a |

`app/assets/icon-background.png` is not generated from any of these — it is a flat
`#009e73` fill, unrelated to the mark, and stays as it is.

## The favicon is a file, not fifty copies of one

Until this change every page inlined the favicon as a `data:image/svg+xml,` URI, once per
`<head>` — cheap per request, expensive to keep in sync across the ~50 pages that carried it.
It is now two shared files instead: `web/favicon.svg` (the `icon-small.svg` master, byte for
byte) and `web/icons/favicon-32.png` (a PNG fallback for the browsers that ignore SVG
favicons). Every page links both:

```html
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
```

The PNG comes first: a browser that understands both types is expected to prefer the later,
more capable one, but the ordering also means a browser that only reads the first `<link
rel="icon">` it finds gets a favicon either way.

All of the site's hand-maintained pages sit in `web/` itself, so the relative hrefs above
resolve directly — confirmed against `deploy/papamap.Caddyfile` (the `?lang=en` rewrite serves
`index-en.html` from the same level) and the methods pages (served at the same level). The
one place the hrefs need help is the generated pages, which import
`pipeline/pages.py`'s `ICON` constant. It prefixes both hrefs with the module's existing `UP`
("../"), the same relative-path convention `IN_APP_JS` already used. That is right for the
pages written one directory below the site root (`web/wickeltische/*.html`, which includes the
leaderboard, and the ops page
at `/data/ops.html` and `/private/ops.html`). The ops page is also served at `/ops.html`
through the `rewrite /ops.html /data/ops.html` in `deploy/papamap.Caddyfile`, where the
browser resolves `../` from the root. It still finds the icons, but only because a URL cannot
climb above the root (RFC 3986, 5.2.4), so `../icons/…` lands on `/icons/…`. **A page served
two levels down would need its own prefix: check the served URL, not the file's directory,
before reusing `UP`.** `tests/test_pages.py` asserts that both hrefs resolve to files that
exist. **From now on, a logo change touches these two files, not every page that links them.**

Neither file is precached by `web/sw.js` — matching the existing convention there, where
`web/icon.svg` and the `web/icons/*.png` files aren't precached either. Only the shell's own
HTML/CSS/JS is.

## The icon pin: `?v=logo2`

The home-screen PNGs keep their file names when the artwork changes. Cloudflare caches PNGs
at the edge by default, as it does the shell's `.js` and `.css`. On those `docs/DEPLOY.md`
measured the edge rewriting Caddy's hour to `max-age=14400`, so a browser holds its copy for
four hours as well. So the three icon `src`s in
`web/manifest.webmanifest` and the `apple-touch-icon` link in `index.html`, `app.html` and
`app-en.html` (and `index-en.html`, generated) carry `?v=logo2`. **Raise it (`logo3`, …) with
every re-render of those PNGs**, in all of those places at once; `web/app-page.test.js` fails
if they disagree or a file is missing. It is separate from the shell's `?v=appNN` pin, which
moves far more often. The changed manifest is also what makes Chrome refresh the icon of an
installed Android web app. iOS never re-reads the icon of a site already on the home screen:
there the new logo arrives only when the reader adds the site again.

What carries no pin: `web/favicon.svg` and `web/icons/favicon-32.png`, new paths in this
change, and `web/icon.svg`, which was redrawn in place. Its one reader outside the bundle is
taginfo, through the `icon_url` in `web/taginfo.json`, and that can wait out the edge's four
hours. **A later redraw touches all three: give the favicon links a pin then, in the pages
and in `pipeline/pages.py`'s `ICON`.**

## Splash: measuring the mark's size against the background it replaces

The splash screens (`app/assets/splash.png`, `splash-dark.png`, 2732×2732) don't use the
0.86 safe-zone scale — they show the mark centred and small, the way a splash screen does.
The previous asset's green circle was measured directly (a horizontal scan through the
vertical centre of `splash.png`, looking for the first and last pixel that isn't the
background colour): 599 px across, i.e. 21.93% of the canvas width. The new mark
(`icon-rounded.svg`) is rendered at that same 599 px and centred on the same canvas.

Background colours are unchanged — sampled from the previous assets rather than
re-specified: `#f2f5f3` for `splash.png` (also the manifest's `background_color` /
`theme_color`), `#14201b` for `splash-dark.png`.

## Rendering

`rsvg-convert` isn't installed on this machine; renders used `sharp` (bundles librsvg), from
a scratch directory outside the repo (`npm init -y && npm i sharp`). One render call per
fixed-size PNG:

```js
import sharp from "sharp";

// viewBoxSize is the SVG's own user-unit width (all five masters are square).
// density maps 1 user unit to size/viewBoxSize px, so librsvg rasterises
// directly at the target resolution — no supersample-then-downscale step
// needed for a vector source.
async function render(svgPath, viewBoxSize, size, outPath, { flatten } = {}) {
  const density = (size / viewBoxSize) * 72;
  let img = sharp(svgPath, { density }).resize(size, size);
  if (flatten) img = img.flatten({ background: "#009e73" }); // drop the (all-opaque) alpha channel
  await img.png().toFile(outPath);
}

await render("icon-small.svg",      100,  32, "favicon-32.png");
await render("icon-rounded.svg",   1024, 192, "icon-192.png");
await render("icon-rounded.svg",   1024, 512, "icon-512.png");
await render("icon-maskable.svg",  1024, 512, "icon-maskable-512.png", { flatten: true });
await render("icon-square.svg",    1024, 180, "apple-touch-icon.png",  { flatten: true });
await render("icon-square.svg",    1024, 1024, "icon-only.png",        { flatten: true });
await render("icon-foreground.svg",1024, 1024, "icon-foreground.png");
```

The splash pair is a plain canvas-and-composite (`sharp({ create: … })`, `.composite([{
input, left, top }])`, then `.flatten()` to drop the alpha channel the composite step adds so
the output matches the originals' plain RGB) — see "Splash" above for the numbers (599 px
mark, offset `(2732 - 599) / 2` rounded, on the two background colours listed there.

After every render, look at the PNG: the pictogram must show the green background through
the white sign (the mask working), never a solid white blob (the mask failing to apply).

## Native platform assets

`app/assets/icon-only.png`, `icon-foreground.png`, `icon-background.png`, `splash.png`,
`splash-dark.png` are the five source files `@capacitor/assets` reads by convention
(`app/README.md`). After replacing the four that change:

```
cd app && npm ci && npx @capacitor/assets generate --ios --android
```

which regenerates every `ios/App/App/Assets.xcassets/AppIcon.appiconset/` and
`.../Splash.imageset/` file, and every Android `res/mipmap-*/ic_launcher*.png` and
`res/drawable*/splash.png`, from those five sources.

## Left alone

`web/og-image.jpg` and `web/og-image-en.jpg` are screenshots of the live map — the old
header brandmark is baked into them as pixels. Redoing them means retaking the screenshot
against a deployed build carrying the new mark, not a render job; they are unchanged by this
logo update.
