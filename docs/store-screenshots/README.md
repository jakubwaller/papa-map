# Store screenshots

`shoot-store-screenshots.mjs` produces the finished App Store screenshot
set: ten composed images per language for the iPhone 6.9" slot (map,
nearest, room, route, search, filters, offline, me, widget, control), the
same first eight recomposed for the iPhone 6.5" slot (see "The 6.5" canvas"
below), and the first eight for iPad 13" (no widget/Control Center on a
tablet). Design: `DESIGN.md`
next to this file — canvas sizes, margins, fonts, colours, and every
headline/subline in German and English. Modelled on
`docs/og-cards/shoot-og-cards.mjs`.

The script has two phases, both run by one invocation:

1. **raw** — Playwright drives the app and screenshots the bare app screen
   for the first eight shots, per device and language, to
   `<out>/raw/<device>-<lang>-<NN>-<stem>.png`.
2. **compose** — for every raw PNG (plus `phone/widget.png` and
   `phone/control.png`, when present), renders the HTML template
   `DESIGN.md` describes — headline, subline, the app screen in a rounded,
   bleeding frame — at the exact canvas size and screenshots it to
   `<out>/final/<device>-<lang>-<NN>-<stem>.png`. `final/*` is what gets
   uploaded to App Store Connect; `raw/*` and `phone/*` are working files.

## One-time setup

```
cd docs/store-screenshots
npm i playwright
```

## Build and serve the app's bundled shell (preferred source)

```
cd ../../app
npm ci
npm run build          # writes app/www/ — the website shell, minus the Ko-fi donate span
cd www
python3 -m http.server 8080
```

Leave that server running in its own terminal. `npm run sync` is not
needed for screenshots (it also runs `npx cap sync`, which is a known
foot-gun over stale `node_modules` — avoid it here).

## Shoot and compose

```
cd docs/store-screenshots
node shoot-store-screenshots.mjs ./out
```

Runs both phases: drives the browser for the raw shots, then composes
`./out/final/*`. Verify exact pixel sizes before uploading — Apple rejects
anything off-spec — but the script already does this itself at the end of
every run and throws if a composed PNG is off size, so a clean exit means
every `final/*` file already checked out. To spot-check by hand anyway:

```
sips -g pixelWidth -g pixelHeight out/final/iphone69-de-01-map.png
```

Expect 1320×2868 for `iphone69-*` and 2064×2752 for `ipad13-*`, for both
`raw/*` and `final/*`. `iphone65-*` only exists under `final/`, at
1284×2778 — see "The 6.5" canvas" below.

### Recompose only

After editing `texts.json` or the HTML template in the script, re-run just
the compose phase against the raw shots already on disk — no browser drive
through the app needed:

```
node shoot-store-screenshots.mjs ./out --compose-only
```

## The 6.5" canvas (`iphone65`)

App Store Connect's iPhone screenshot slot for this app is the 6.5" Display
size, which only accepts 1284×2778 (or 1242×2688) — not the 6.9" size the
`iphone69` raw shots are taken at (1320×2868, the one Apple's spec sheet
calls for during capture). Rather than driving a third Playwright device,
the `iphone65` canvas preset reuses the existing `iphone69` raw shots as its
source image: the frame scales whatever it's given to `frameWidth` and lets
it bleed off the canvas's bottom edge, so the source image's own aspect
ratio never has to match the canvas exactly. `iphone65` therefore only ever
appears in `DEVICE_CANVAS` (the compose step), never in `DEVICES` (the raw
shot step) — there is no `raw/iphone65-*` and there never needs to be one.
Compose it on its own, without re-composing `iphone69`/`ipad13`, with
`--canvas <name>`:

```
node shoot-store-screenshots.mjs ./out --compose-only --canvas iphone65
```

`--canvas` also works without `--compose-only`, and accepts any key in
`DEVICE_CANVAS` (currently `iphone69`, `iphone65`, `ipad13`). The 09/10
phone shots are iPhone-only and always land under `final/iphone69-*`
regardless of canvas, so they're skipped when `--canvas` names anything but
`iphone69`.

## Texts

`texts.json`, next to this script, holds every headline and subline in
German and English, keyed by language then by shot number (`"01"`…`"10"`,
matching `DESIGN.md`'s shot table). A headline's one accent word is marked
`*like this*` in the JSON; the compose step renders it in `#009e73`
(`--green`) and the rest of the headline in ink. Edit the text there, not
in the script.

## The phone shots (09-widget, 10-control)

Shots 9 and 10 (the home-screen widget and the Control Center control) come
from Jakub's own iPhone, not Playwright — a browser cannot reach either
surface. Drop the two screenshots in:

```
out/phone/widget.png
out/phone/control.png
```

any iPhone size (the compose step scales to the frame width, so the source
resolution does not matter). When present, `--compose-only` (or a full run)
composes them into `final/iphone69-<lang>-09-widget.png` and
`final/iphone69-<lang>-10-control.png` for both languages — the phone is in
German, so the English set reuses the same source images with the English
text. When absent, those two are skipped with a log line saying so; the
run does not fail for it. No iPad versions exist (iPad's own set stops at
shot 8).

## Why the two route proxies

`app/www`'s `app.js` fetches its dataset (`data/*.geojson`, `data/stats.json`,
`data/areas.json`) with a same-origin relative path — the code path written
for the website, since the native app instead goes through `native.js`.
Served from a plain `http.server`, those requests 404 (`app/www` ships the
shell only, not the dataset copy). The script closes that gap with a
Playwright route handler that fetches `/data/*` from
`https://papamap.de/data/*` server-side and hands the response back — the
same data the shell would reach for on a real phone. A second, identically
shaped handler covers `tiles/index.json`, the one other absolute fetch
`native.js` makes with no Filesystem plugin backing it — needed to fill the
offline dialog's city list (07-offline). Both only run when shooting the
bundled shell; they are skipped automatically when shooting the live site.

## Fallback: shoot the live site directly

If the bundled shell can't be built or served (data still fails to load, or
the local checkout is broken), shoot the live website instead:

```
node shoot-store-screenshots.mjs ./out https://papamap.de
```

In this mode the script injects `.donate{display:none!important}` to hide
the Ko-fi span the App Store build must not show (the bundled shell never
has it in the first place — `app/shell.mjs` cuts it out at build time).

## Geolocation

Every shot runs with geolocation permission granted and the coordinates set
to Hamburg Rathaus (53.5503, 9.9937), so the map's own "you are here" dot,
the search bias, and the nearest-table button all land somewhere the sweep
actually has pins.

## State reset between shots

Shots 03 through 08 each start with a full `page.reload()` (see
`reloadFresh` in the script) rather than trying to undo the previous shot's
own UI changes by hand. A reload on its own wipes every bit of *pure*
in-page JS state a shot could have touched — the chip filters, the chip
bar's scroll position, the search field, any open popup or dialog — while
keeping the Capacitor stub and the two data proxies, both of which survive
navigation on the same page/context.

Mode is not pure in-page state, though: `web/app.js` persists the reader's
Papa/Mama choice to `localStorage`'s `papamap-mode` on every toggle and
reads it back at boot, so a reload alone would restore whatever a previous
shot last set — confirmed: 07-offline and 08-me kept showing Mama mode and
the Mama-view chip labels after 06 (filters) switched to Mama, even with
the reload in place. `reloadFresh` now resets `papamap-mode` to `"papa"`
(and clears `papamap-wheelchair`, the one other persisted filter-like key,
defensively — nothing in the script sets it any more) before navigating,
and asserts `#mode-papa` carries the active state afterwards.
`papamap-lang` is left alone; that is the language the whole run is
shooting. It also re-centres the map on the same wide Hamburg zoom-13 view
every shot starts from.

The stub also pre-seeds `localStorage`'s `papamap-intro` key with `app99999` (the
key `web/me.js` exports as `INTRO_KEY`) before any page script runs — a pin far
ahead of the shell's, so `app.js`'s `maybeShowIntro()` finds neither the
first-launch intro nor release notes to float over a later shot's own popup or
dialog.

## If a raw shot fails

The script never aborts on one missing element — it logs which shot was
skipped and why, and keeps going with the rest; the compose phase then
just skips the PNG that never showed up. Common causes:

- On a wide viewport (iPad) the topbar can cover the first rendered map
  pin, so the pin-picking shots (nearest's popup, room, route) walk the
  rendered pins until one resolves (via `elementFromPoint`) to the map
  canvas rather than the header chrome above it.
- A grey (room) or green (route) pin needs to still be in view after the
  reload described above — every shot from 03 on starts from the same wide
  Hamburg view shot 01 uses, so this should not normally come up.

## App mode, not website mode

The shell only shows the app's first screen (brand, Papa/Mama, chips, map; no
App button, no nav links, no stats strip in the header) when `bootNative()` in
`web/app.js` runs, and that needs `globalThis.Capacitor.isNativePlatform()` to
be true. The script therefore installs a Capacitor stub before any page
script runs (`context.addInitScript`): `isNativePlatform` true, `getPlatform`
"ios", and one plugin — `Geolocation`, delegating to the browser
(`locateNative()` reads that plugin without a null guard, needed for the
nearest-table button, shot 02). No `AppLauncher` plugin: `native.js`'s
`planRoute` (the Route button's iOS cascade) throws "no AppLauncher" with
none present, and `app.js`'s own `.catch` just leaves the anchor as a plain
link — no chooser dialog opens, which is what shot 04 wants (it shows the
popup with the Route button visible, not clicked; see that shot's own
comment for why the dialog itself is the wrong thing to screenshot). Every
other plugin access in `web/native.js` is null-guarded, so the dataset falls
through to `fetch(SITE + url)`, which the `/data/*` and `tiles/index.json`
route proxies serve. `verifyNativeShell()` asserts the app-mode markers on
`<html>` before the first shot — and again after every reload — and aborts
the run if they are missing. `--web` turns the stub off and shoots the
website instead.
