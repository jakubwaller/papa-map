# Store screenshot set: design

Decided 2026-09-22 after the first set (five bare map views) was judged too samey. Each store
screenshot is a composed image: a short headline in Jakub's register at the top, a subline under
it, and the app screen below in a rounded frame that bleeds off the bottom edge. Ten shots for
iPhone (Apple's maximum), the first eight for iPad. Shots 1 to 8 come from Playwright, 9 and 10
are taken on Jakub's own iPhone (widget and Control Center are not reachable from a browser).

## Canvas

| Set | Canvas | Frame width | Side margin | Headline | Subline |
| --- | --- | --- | --- | --- | --- |
| iPhone 6.9" | 1320 × 2868 | 1140 px | 90 px | 88 px bold | 44 px regular |
| iPad 13" | 2064 × 2752 | 1560 px | 252 px | 96 px bold | 48 px regular |

- Background `#eef1ef` (the app's `--bg`). Text `#1c2b26` (`--ink`), subline `#64716b` (`--muted`).
- Font: `-apple-system, system-ui, "Segoe UI", Roboto, sans-serif`, same as the app.
- Headline starts 150 px from the top, left-aligned at the side margin, max two lines. Subline
  one or two lines. The frame starts 80 px under the subline.
- Frame: the raw screenshot scaled to the frame width, corner radius 72 px (iPhone) / 60 px
  (iPad), a 1 px `#d8ded9` border and shadow `0 24px 60px rgba(28,43,38,.18)`. The frame runs
  past the bottom edge of the canvas, so the app screen is cut, not shrunk.
- One accent per headline at most: the word that carries the shot in `#009e73` (`--green`),
  marked `*like this*` in the tables below. Nothing else coloured.
- No exclamation marks, no emoji, no device bezels, no "Download now".

## Shots, in store order

The first three show in search results, so map, nearest and the grey-pin question lead.

| # | File stem | Screen | Headline DE | Subline DE |
| --- | --- | --- | --- | --- |
| 1 | `01-map` | Hamburg centre, pins on screen, zoom 13 | Wickeltische, an die *Papa* rankommt | Grün: beide Eltern. Rot: nur Damen-WC. Grau: noch keiner weiß es. |
| 2 | `02-nearest` | after the nearest button, popup with distance toast | Der *nächste* Wickeltisch, den du auch erreichst | Mit Entfernung. Auch per Siri, Widget und Kontrollzentrum. |
| 3 | `03-room` | popup on a grey pin with the room question | Grauer Pin? Sag, in welchem *Raum* der Tisch ist | Die Antwort geht direkt nach OpenStreetMap. |
| 4 | `04-route` | green pin's popup with the Route button visible, no dialog | *Route* zum Wickeltisch | Öffnet deine Navi-App: Apple Maps, Google Maps, Waze oder Organic Maps. |
| 5 | `05-add` | "+ Ort hinzufügen" dialog at zoom 16, list of nearby places OSM already knows | Fehlenden *Ort* eintragen | Orte in deiner Nähe, die OpenStreetMap schon kennt. Antworte gleich in der App. |
| 6 | `06-filters` | wheelchair chip on, chip bar scrolled to it; iPad shows wheelchair, play corner and high chair with labels, iPhone only wheelchair + play corner (labels hide below 640 px, the bar is too narrow) | iPad: *Hochstuhl*, Spielecke, Barrierefrei; iPhone (`phone` block in texts.json): *Barrierefrei*, Spielecke | iPad: Die Karte zeigt nur, was du brauchst.; iPhone: the same |
| 7 | `07-offline` | offline dialog open (the download button in the map controls) | Stadt *offline* speichern | Hamburg sind 27 MB. Dann geht die Karte auch ohne Netz. |
| 8 | `08-me` | Mein PapaMap panel open | *Mein* PapaMap | Deine Antworten, gemerkte Orte, und wie viel in deiner Stadt schon beantwortet ist. |
| 9 | `09-widget` | Jakub's phone: home screen with the PapaMap widget | Der nächste Tisch auf dem *Homescreen* | Widget für Home- und Sperrbildschirm. |
| 10 | `10-control` | Jakub's phone: Control Center with the PapaMap control, or the Siri answer | *Siri* und Kontrollzentrum | „Nächster Wickeltisch“, ohne die App zu öffnen. |

| # | Headline EN | Subline EN |
| --- | --- | --- |
| 1 | Changing tables *dads* can get to | Green: both parents. Red: ladies' room only. Grey: nobody knows yet. |
| 2 | The *nearest* table you can actually reach | With the distance. Also via Siri, widget and Control Center. |
| 3 | Grey pin? Say which *room* the table is in | Your answer goes straight to OpenStreetMap. |
| 4 | *Route* to the table | Opens your navigation app: Apple Maps, Google Maps, Waze or Organic Maps. |
| 5 | Add a missing *place* | Places nearby that OpenStreetMap already knows. Answer right in the app. |
| 6 | iPad: *High chair*, play corner, accessible; phones (`phone`/`android` blocks): *Accessible*, play corner | The map shows only what you need. |
| 7 | Save a city *offline* | Hamburg is 27 MB. The map then works without a connection. |
| 8 | *My* PapaMap | Your answers, saved places, and how much of your city is answered already. |
| 9 | The nearest table on your *home screen* | Widget for the home and lock screen. |
| 10 | *Siri* and Control Center | "Nearest changing table", without opening the app. |

## Files

- `raw/<device>-<lang>-<stem>.png`: the bare app screen, exact device size, as before.
- `phone/widget.png`, `phone/control.png`: Jakub's own iPhone screenshots, any iPhone size.
  Used for shots 9 and 10 on iPhone only; scaled to the frame width, so the model does not
  matter. No language variants: the phone is in German, so the English set reuses them.
- `final/<device>-<lang>-<NN>-<stem>.png`: the composed store images, exact size, what gets
  uploaded. iPhone: 10 per language when the phone shots exist, 8 otherwise. iPad: 8.

## Composition

The compose step is an HTML template rendered by Playwright at the canvas size with
`deviceScaleFactor: 1`, the raw PNG inlined as a data URL. One template, two size presets, the
texts in a small JSON next to the script. Fonts and colours as above.

**Update 2026-09-22 (17:45): shots 9 and 10 dropped.** Jakub: a widget or Control Center
screenshot from his own phone shows his location, so no phone shots. The set is eight per device
and language; the Siri, widget and Control Center features are named in the sublines of shots 2
and in the store description instead. `phone/` stays empty; the compose step skips 9 and 10.

**Update 2026-09-22 (18:30): three shots corrected after the first composed run.** Shot 4 lost
the route chooser dialog: `routePlan()` opens Apple Maps directly whenever `maps:` can be opened,
the chooser only appears on a phone without Apple Maps and with two nav apps, so the dialog
misrepresented the app. Shot 6 no longer scrolls the chip bar (the toggle went off screen and
the accent chip was cut); it shows Mama view with Mit Spielecke active. Hamburg's offline city
is 27 MB in the catalogue, not 26. Also: every shot from 3 on starts from a reloaded page, and the
first-launch intro is suppressed by seeding `papamap-intro` in localStorage. Tables above updated in place.

**Update 2026-09-22 (19:00): shot 6 is the Mama view alone.** With a chip filter active the
active chip sits off screen on iPhone (the chip bar is wider than the screen and scrolling it
hides the toggle), so the shot read as "few pins, no reason". Mama view without a filter shows
the toggle and a full map. Also: `papamap-mode` persists in localStorage, so a page reload does
not reset Mama to Papa; the script sets it back before reloading.

**Update 2026-09-22 (20:00): App Store Connect rejected the 6.9" iPhone set on upload.** Error:
"Screenshots dimensions should be: 1242 × 2688px, 2688 × 1242px, 1284 × 2778px or 2778 × 1284px" —
this app's iPhone slot in App Store Connect is the 6.5" Display one, not 6.9". Confirmed live on
the page: the iPad slot is 13" and does accept 2064 × 2752 (the `ipad13` set was already right).
Added a new canvas `iphone65` (1284 × 2778) that composes from the same `raw/iphone69-*` shots —
no new raw shots needed, only a wider frame math. `final/` now also holds
`iphone65-{de,en}-01..08`; upload those to the iPhone slot, not `iphone69-*` (kept in the folder
as the 6.9" source rendering, not for upload — useful if a future device slot wants it).

**Update 2026-10-02: a Google Play set.** Play's asset library takes phone screenshots at 9:16 and
marks anything else "needs cropping" (a 1:2 set was, 2026-10-02). `--canvas play` shoots the shell
as Android (`getPlatform() === "android"`: crosshair locate button, Android tips in My PapaMap) at
412 × 800 and composes it at 1440 × 2560, same shots and order. Shots 2 and 4 take
their sublines from `texts.json`'s `android` block (widget and app icon instead of Siri and
Control Center; "your maps app" instead of Apple Maps). Upload `final/play-{de,en}-01..08`.

**Update 2026-10-06: the 1.3 set.** Shot 5 is now the add-a-place dialog (nearby places OSM already
knows, #214/#216) instead of search, and shot 6 switches the wheelchair chip on and scrolls the chip bar to
start at it. On the iPad all three filters (wheelchair, play corner, high chair #219) fit with
labels; on phones (iPhone 6.5"/6.9", Play) the bar is too narrow for the high-chair chip and
hides the wheelchair label below 640 px, so the phone and Android texts name only "accessible,
play corner". The Dad/Mum toggle scrolls out of sight.
The add dialog only loads its list from zoom 14, so the shot jumps to zoom 16 first, and it needs
network access to Photon.

**Product-page header (Apple's optional asset), same day.** `make-header.mjs` composes it from the
raw shots (`node make-header.mjs ./out`, after a shoot): brand green `#009e73` ground, the logo from
`web/icon.svg`, the app's font, the headline of shot 1 in white with the accent word in ink, and two
phone frames (map, add dialog). 3840 × 1646 and 5244 × 2950, one per language, PNG without alpha.
Apple crops the header per device, so logo, headline and both phones sit in the central 60 % of
the width (x 768 to 3072 at 3840 wide).
