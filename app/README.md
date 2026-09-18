# PapaMap, the store app

The map at [papamap.de](https://papamap.de) in a native shell for the App Store and Google
Play — [Capacitor](https://capacitorjs.com) around the very same `web/` tree, plus the three
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

Everything the page promises still holds: the position is used on the phone and never sent,
the dataset comes from papamap.de, answers go to OpenStreetMap under the reader's own account.
The Swift side reads a compact copy of the dataset that `web/native.js` hands over through
the app's own plugin (`PapaMapSharePlugin.swift`), via an App Group container.

`web/native.js` is the whole seam. On the website every one of its exports is inert.

## Layout

```
app/
  package.json          Capacitor and its plugins (Filesystem, Geolocation, Browser, App, Preferences)
  capacitor.config.json appId de.papamap.app, webDir www
  build-www.js          copies the shell from ../web into www/ (no sw.js, no site pages)
  ios/App/              the Xcode project (SPM, no CocoaPods)
    App/                AppDelegate, MainViewController (registers the plugin), Info.plist,
                        PapaMapSharePlugin.swift, Shared/ (TableStore, LocationOnce),
                        Intents/NearestTableIntent.swift, de.lproj/ (Siri phrases, permission text)
    PapaMapWidget/      the widget extension
  ios/add-native-targets.rb  registers the Swift files and the widget target with the project
  ios/asc.mjs           App Store Connect API for the runner: bundle ids, certificate, profiles
  ios/distribution.csr  the request the distribution certificate was signed from (no secret in it)
  android/              the Android project (feature 1 only for now: no widget, no Assistant)
```

Bundle id `de.papamap.app` on both stores (the other PapaMap, papamap.com, holds
`com.papamap.app`). URL scheme `papamap://` — `papamap://auth` is the OSM login's return leg,
`papamap://table?osm=…` opens a pin (the widget, the shortcut).

## Build

```bash
cd app
npm install
npm run sync          # build www/ from ../web, then npx cap sync (both platforms)
npx cap open ios      # Xcode
npx cap open android  # Android Studio
```

Needs Node 20+, Xcode 26+ (from the Mac App Store; App Store Connect refuses older SDKs), and for Android a JDK 17 and Android
Studio. `npx cap sync` regenerates `ios/App/CapApp-SPM/` from `package.json`, which is why
that directory is not committed.

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
