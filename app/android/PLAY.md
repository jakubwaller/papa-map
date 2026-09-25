# Google Play

The Android app is the same Capacitor shell as the iPhone one (`web/` inside a
WebView, `web/native.js` the seam). It builds on GitHub's runners, never on a
laptop: the `play` task of `.github/workflows/app-build.yml`.

## Keys and secrets

| What | Where |
|---|---|
| Upload key (PKCS12, alias `upload`, RSA 4096, valid to 2056) | `~/gitlab/papamap-android-upload-key/` on the Mac: `upload.p12`, `password.txt`, `upload.crt` — back these up in the password manager |
| `ANDROID_UPLOAD_KEYSTORE` | repo secret: `upload.p12`, base64 |
| `ANDROID_UPLOAD_KEYSTORE_PASSWORD` | repo secret: `password.txt` (store and key share it) |
| `PLAY_SERVICE_ACCOUNT_JSON` | repo secret: the service account's JSON key (below). Optional — without it the bundle is only a run artifact |
| `PLAY_TRACK`, `PLAY_RELEASE_STATUS` | repo *variables*, default `alpha` (closed testing) and `draft` |

It is the **upload** key. Play App Signing keeps the key phones actually verify,
so a lost or leaked upload key is a reset request in the Console (Setup → App
signing → Request upload key reset), not the end of the app.

Made with openssl, so no JDK is needed to renew it:

```bash
openssl req -x509 -newkey rsa:4096 -sha256 -days 10950 -nodes \
  -keyout upload.key -out upload.crt -subj "/CN=PapaMap upload key/O=PapaMap/C=DE"
openssl pkcs12 -export -name upload -inkey upload.key -in upload.crt \
  -out upload.p12 -passout file:password.txt && rm upload.key
```

## First release, once

1. Play Console → **Create app**: name `PapaMap`, default language German, App, Free.
2. Actions → App build → Run workflow → task **play**. The run's artifact
   `papamap-aab-<n>` is the signed bundle.
3. Console → Testing → **Closed testing** → create track → Create release →
   accept Play App Signing (Google-generated key) → drag the `.aab` in.
4. Testers: a Google Group or an email list, and the opt-in link to them.
   New personal accounts need **12 testers opted in for 14 days in a row**
   before *Apply for production* unlocks.
5. For later builds without the web page: Google Cloud → a project → enable the
   *Google Play Android Developer API* → a service account → a JSON key; Play
   Console → Users and permissions → invite the service account's email, app
   `PapaMap`, permissions *Release to testing tracks* (and *Release to
   production* later). Put the JSON in `PLAY_SERVICE_ACCOUNT_JSON`.

From then on task **play** uploads by itself. While the app has never been
published, Play only accepts `draft` releases, so each one waits for a person's
*Roll out* in the Console; once the app is live, set `PLAY_RELEASE_STATUS` to
`completed`.

## Version code

`github.run_number`, the same as the iOS build number: Play refuses a code it
has seen, and the run number only goes up. `versionName` stays `1.0` in
`app/build.gradle` until there is a reason to change it on both platforms.

## What differs from the iPhone app

- **The back key** closes the top layer (a dialog, the search list, the popup,
  the room card) and only then sends the app to the background
  (`onBackButton`, `closeTopmost`).
- **Directions** are a plain `geo:` URI, which Android answers with the
  reader's own maps app; the iOS cascade (`planRoute`) never runs.
- **Safe areas**: Capacitor 8 pads the WebView itself on WebViews older than
  140 and passes the insets through on newer ones, so `env(safe-area-inset-*)`
  in `style.css` is right either way.
- **No widget, no Assistant shortcut** yet — the iOS ones are Swift.
- `allowBackup="false"`: the dataset copy and saved cities are re-downloaded,
  never restored from someone else's backup.
