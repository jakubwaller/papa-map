# PapaMap, the store app

The map at [papamap.de](https://papamap.de) in a native shell for the App Store and Google
Play — [Capacitor](https://capacitorjs.com) around the very same `web/` tree, plus the four
things a website cannot do:

1. **A city offline.** The reader downloads their city's basemap (a PMTiles extract of the
   Protomaps build, 20–100 MB, `pipeline/tiles.py`) and the app renders it under the pins with
   the Protomaps style — with no signal, and simply always once it is there. The tables
   themselves are kept on the phone on every load. The website has no equivalent:
   tile.openstreetmap.org's policy forbids caching its tiles (`web/sw.js`).
2. **"Hey Siri, nearest changing table in PapaMap."** An App Intent (`ios/App/App/Intents/`)
   that answers with the name and the distance and opens the pin. Also in Spotlight and the
   Shortcuts app.
3. **A home-screen widget** (`ios/App/PapaMapWidget/`), small, medium and lock-screen: the
   nearest table the reader can reach, with its distance and the pin's colour; tapping opens
   the pin.
4. **A button in Control Center** (`ios/App/PapaMapWidget/NearestTableControl.swift`, iOS 18):
   one tap and the app stands on the nearest reachable pin. The same control can be dragged
   onto the Lock Screen and bound to the Action button, which is the whole point — the nappy
   emergency is the moment the home screen is two taps too far away. It carries no distance:
   Control Center is drawn from a process with no fresh position, and a number quietly hours
   old is worse than none. The Siri shortcut is assignable to the Action button as well,
   through Settings → Action Button → Shortcut.

Everything the page promises still holds: the position is used on the phone and never sent,
the dataset comes from papamap.de, answers go to OpenStreetMap under the reader's own account.
The Swift side reads a compact copy of the dataset that `web/native.js` hands over through
the app's own plugin (`PapaMapSharePlugin.swift`), via an App Group container.

`web/native.js` is the whole seam. On the website every one of its exports is inert.

## Layout

```
app/
  package.json          Capacitor and its plugins (Filesystem, Geolocation, Browser, App, Network,
                        Preferences, AppLauncher — the last one only so the Route button
                        can ask iOS which navigation apps exist, docs/FEATURES.md)
  capacitor.config.json appId de.papamap.app, webDir www
  build-www.js          copies the shell from ../web into www/ (no sw.js, no site pages)
  shell.mjs             the one edit to the copied index.html: the donate span — the Ko-fi
                        link and the separator in front of it — is cut out whole
  assets/               icon and splash sources (the site's glyph on #009e73); every size under
                        ios/ and android/ comes from `npx @capacitor/assets generate --ios --android`
  ios/App/              the Xcode project (SPM, no CocoaPods)
    App/                AppDelegate, MainViewController (registers the plugin), Info.plist,
                        PapaMapSharePlugin.swift, Shared/ (TableStore, LocationOnce,
                        NearestLookup — the lookup Siri and the control share),
                        Intents/ (NearestTableIntent, OpenNearestTableIntent),
                        de.lproj/ (Siri phrases, permission text)
    PapaMapWidget/      the widget extension: the widget and the Control Center button. It
                        compiles Shared/ and Intents/OpenNearestTableIntent.swift too — the
                        button's intent has to exist in both, because the extension declares
                        it and the app is where it runs
  ios/add-native-targets.rb  registers the Swift files and the widget target with the project
  ios/asc.mjs           App Store Connect API for the runner: bundle ids, certificate, profiles,
                        TestFlight "What to Test" text and beta group distribution
  ios/distribution.csr  the request the distribution certificate was signed from (no secret in it)
  ios/testflight/       what-to-test.<locale>.txt, one per TestFlight locale (below)
  android/              the Android project (feature 1 only for now: no widget, no Assistant)
```

Bundle id `de.papamap.app` on both stores (the other PapaMap, papamap.com, holds
`com.papamap.app`). URL scheme `papamap://` — `papamap://auth` is the OSM login's return leg,
`papamap://table?osm=…` opens a pin (the widget, the shortcut).

The widget's tap hands that link to the OS; the Siri answer's tap cannot, because
`OpenURLIntent` is the universal-link API and drops a custom scheme on the way (docs/FEATURES.md
has the story). It runs `OpenTableIntent` in the app instead, which leaves the link in
`PendingTable` — one value, read once and expiring after two minutes — and
`PapaMapSharePlugin` posts it as an opened URL, so the page sees the widget's own event.

The Control Center button takes that same road for a second reason: `OpenNearestTableIntent`
sets `openAppWhenRun`, so it is performed in the app — the only process allowed to ask for the
position at all, since a control's own gets a cached fix at best and can put up no permission
dialog. It looks the table up there and leaves the link in the same slot. Nothing in `web/`
knows the control exists, and every way of finding nothing — no dataset yet, location refused,
nothing usable near — ends with the app open on the map rather than a tap that did nothing.

## Build

```bash
cd app
npm install
npm run sync          # build www/ from ../web, then npx cap sync (both platforms)
npx cap open ios      # Xcode
npx cap open android  # Android Studio
```

Needs Node 20+, Xcode 26+ (from the Mac App Store; App Store Connect refuses older SDKs), and for Android a JDK 17 and Android
Studio. `npx cap sync` regenerates `ios/App/CapApp-SPM/Package.swift` from whatever plugins it
finds actually installed under `node_modules` — and that file **is** committed (only
`CapApp-SPM/symlinks/` is not), because Xcode reads it straight out of the checkout, not out of
a build step.

**Run `npm ci` before every `npx cap sync`.** A sync run over a stale `node_modules` — one
missing a plugin `package.json` already lists, say after a merge that added one — silently
rewrites `Package.swift` to match what is actually installed and drops that plugin from it,
with nothing to say so until a Swift build fails on a missing symbol. `app/plugins.test.mjs`
holds `Package.swift`'s Capacitor plugin packages to `package.json`'s `@capacitor/*` plugin
dependencies, so a dropped plugin fails CI instead.

### iOS: signed on the runner, no Mac needed

`.github/workflows/app-build.yml` compiles both platforms unsigned on every PR push, and on
request archives, signs and uploads the iOS app to App Store Connect (TestFlight): *Run
workflow → testflight* in the Actions tab, or the label `testflight` on a pull request to get
that branch onto a phone. `ios/asc.mjs` talks to the App Store Connect API for it.

Once per Apple account (task or label `apple-setup`, safe to repeat):

1. registers `de.papamap.app` and `de.papamap.app.widget` and switches App Groups on for both;
2. has Apple sign `ios/distribution.csr` into the distribution certificate. The CSR's private
   key stays on the machine that made it; key + certificate go into the secrets
   `IOS_DIST_P12` (base64) and `IOS_DIST_P12_PASSWORD`. The certificate lasts a year: revoke
   the old one on developer.apple.com, run `apple-setup` again, rebuild the `.p12`.

By hand, because no API offers it: on developer.apple.com → Identifiers, create the App Group
`group.de.papamap.app` and tick it on both App IDs (App Groups → Configure). The build makes
fresh provisioning profiles every time and stops early, saying so, if the group is missing.
And in App Store Connect the app record for `de.papamap.app` has to exist before the first
upload.

Secrets: `APPLE_TEAM_ID`, `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_API_KEY_P8` (a team API key,
Admin), plus the two above. The Release configuration is signed manually (`Apple Distribution`,
profiles `PapaMap CI <bundle id>`); Debug stays automatic, so with Xcode on a Mac: select the
team on both targets and run.

- If `ios/` was ever regenerated (`npx cap add ios --packagemanager SPM`), run
  `ruby ios/add-native-targets.rb` again (`gem install --user-install xcodeproj`) and re-apply
  the two Info.plist edits it does not make (the `papamap` URL scheme, the location text) and
  the storyboard's `MainViewController` and `SceneDelegate.swift` (its root view controller
  must be `MainViewController`, or the share plugin is never registered) — `git diff` on those
  files shows what.

### TestFlight text, no browser needed

`ios/testflight/what-to-test.<locale>.txt` holds the tester-facing "What to Test" text for
each locale; the filename **is** the locale ASC uses (`de-DE`, `en-US`, `cs` — a new language
is a new file, no code change). After every `testflight` upload, a second job, `beta-text`
(`ubuntu-latest`, `needs: testflight` — no Xcode, and no reason to hold the Mac runner while
waiting on Apple):

1. waits for the freshly-uploaded build to leave `PROCESSING` and reach `VALID` (`asc.mjs
   beta-text push --build <n>`, polling every 30 s, up to 25 minutes; `INVALID`/`FAILED` fail
   right away rather than waiting out the clock);
2. creates or updates one `betaBuildLocalizations` record per file — idempotent, so a rerun
   only ever PATCHes what already exists;
3. if the repository variable `ASC_BETA_GROUP` is set, adds the build to that beta group and,
   for an external group, submits it for Beta App Review (`asc.mjs beta-text distribute --build
   <n> --group <name>`) — an already-submitted or already-approved build is left alone. With
   `ASC_BETA_GROUP` unset, only the text goes out.

Splitting this into its own job (rather than two more steps in `testflight`) means a problem
here (a stale `processingState`, an over-limit file) shows up as its own red job and never
makes the already-successful upload job look broken. `github.run_number` is the same for every
job of one workflow run, so `beta-text` still gets the build number `testflight` just uploaded.

Run `beta-text pull` (Actions tab, task `beta-text-pull`, or `node ios/asc.mjs beta-text
pull` with the same three `ASC_*` secrets) to print what App Store Connect currently shows —
the app's `betaAppLocalizations` and the latest build's `betaBuildLocalizations` — against
which the files in `ios/testflight/` can be compared. `pull` never writes anything.

Apple's `whatsNew` limit is 4000 characters per locale; `push` checks every file against it
before making any request. See `ios/asc.mjs` for the App Store Connect API docs consulted.

### The OSM login

The app uses the same OAuth client as the website (`web/osm.js`, `LIVE.clientId`), coming back
by `papamap://auth` instead of `https://papamap.de/`. That URI has to be added to the client's
redirect URIs on openstreetmap.org (application 12549, one URI per line) before the first login
from the app can succeed.

### The server side

The app fetches `/data/*.json` and `/tiles/index.json` from papamap.de under its own origin,
so those answers carry `Access-Control-Allow-Origin: *` (`deploy/papamap.Caddyfile`). The
city files come from the weekly `tiles` service (`docs/DEPLOY.md`).

## Testing the web side without a phone

`web/native.js` only needs `window.Capacitor`. A page that defines a fake one before `app.js`
runs — `isNativePlatform() → true`, `Plugins.Filesystem` answering from local files — exercises
every branch in a desktop browser, including the vector city over a local `.pmtiles`. That is
how the first version was checked (Hamburg at zoom 14, 70 layers, labels and sprites).
