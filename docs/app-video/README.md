# App videos

`record-app-video.mjs` drives the app's bundled shell with Playwright and
records it; `encode.sh` turns the takes into the three deliverables:

| profile  | canvas    | what it is                                                       |
| -------- | --------- | ---------------------------------------------------------------- |
| `store`  | 886×1920  | App Store preview, ~26 s: map, nearest table, two-tap room answer, add a place, offline city, Mein PapaMap — each with the store screenshots' own headline in a band above the app (`../store-screenshots/texts.json`) |
| `social` | 1080×1920 | the same tour as a 9:16 clip for Reels, Bluesky and Mastodon      |
| `loop`   | 540 wide  | the bare app, grey pin → two taps → green, ~7 s, muted, for `web/app.html` |

The driving pattern (Capacitor stub, data proxy, pin walking) is the
screenshot recipe's — read `../store-screenshots/shoot-store-screenshots.mjs`
for the why. What this adds: a same-origin composer page (a caption band and
the app in an iframe, written into `app/www` for the run and removed after),
a tap ripple at every click, and a faked OSM API, so the two-tap answer can
be shown end to end. The composer also does the 2×: Chrome's screencast,
which Playwright's video recorder uses, delivers CSS pixels, so a 443×960
viewport at `deviceScaleFactor: 2` records as a quarter-size picture in the
corner of an 886×1920 grey canvas. The browser viewport is therefore the full
886×1920 at factor 1, the composer scales a 443×960 stage with a CSS transform,
and the app frame is told `devicePixelRatio = 2` so the map's canvas is sharp
too. **Nothing is written to OpenStreetMap**: the read, the
changeset and the element write are all answered locally, and the reader
"Papa" (user id 424242) exists only in the recording's local storage.

## Run

Two terminals, both starting in the repo root.

Terminal 1 builds the shell and serves it, and stays up while recording:

```
(cd app && npm ci && npm run build)
python3 -m http.server 8099 --bind 127.0.0.1 --directory app/www
```

Terminal 2 records and encodes:

```
cd docs/app-video
npm i playwright && npx playwright install ffmpeg      # once; uses the installed Google Chrome
node record-app-video.mjs ./out --profile store  --lang de
node record-app-video.mjs ./out --profile store  --lang en
node record-app-video.mjs ./out --profile social --lang de
node record-app-video.mjs ./out --profile loop   --lang de
node record-app-video.mjs ./out --profile loop   --lang en
./encode.sh ./out ./out/final                            # needs ffmpeg (brew install ffmpeg)
```

`--debug` logs the page's console and every request that leaves the shell.
`--served-dir` points at the folder the shell is served from, when it is not
`app/www`; the recorder writes its composer page there for the run and
removes it after. The recorder exits non-zero if the two-tap room answer does
not go through (no green pin, or the app's "could not save" line), and
`encode.sh` exits non-zero if a store take runs outside 15–30 s.

## What to check before uploading

- Bitrate: the spec lists 10–12 Mbit/s, and a real store take comes out
  at about 7.7 Mbit/s. This UI is mostly flat colour, so the encoder needs
  less than the 11 Mbit/s target, and `encode.sh` does not pad it up
  (no `-minrate`). Read it with
  `ffprobe -v error -show_entries format=bit_rate -of default=nw=1:nk=1 <file>`.
  If App Store Connect refuses an upload over the bitrate, that is the
  knob to turn.
- Store: 886×1920, 15–30 s, H.264 High 4.0, 30 fps, a silent stereo AAC
  track (App Store Connect's app preview specification; the spec asks for
  stereo audio and says nothing about silence — previews without sound are
  common). Up to three per device size and language; the poster frame is
  chosen in App Store Connect (default: 5 s).
- The pins and the places in the takes are live data on the day of the
  recording; a grey pin that has been answered since will not be grey any
  more — the recorder walks the rendered pins and takes the first open one.
- The widget, Siri and Control Centre cannot be recorded this way (they are
  native, not in the shell): those shots are phone recordings, as the
  screenshot recipe's `phone/` images are.
