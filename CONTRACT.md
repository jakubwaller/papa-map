# papa-map — build contract (v0)

> **v43 amendment (21 Sep 2026, first tester feedback): no shape change.** One
> new i18n key in all 32 languages, `nearestBtn` ("Nächster Wickeltisch"): the
> nearest-table button is a labelled pill at the foot of the map, no longer an
> icon in the control column, and hides while a popup is open. The locate
> button draws iOS's own arrow on iPhones and iPads (`isAppleTouch`,
> `web/datasource.js`) and the crosshair elsewhere. Popups stay clear of the
> control column (`popupPan`). In the store app the header's links, language
> picker and stats strip live in "Mein PapaMap" (`#me-about`) and the tagline
> is hidden; the website's header is unchanged. No new stored key, nothing
> new sent anywhere. Shell pin `app36` → `app37`.
>
> **v42 amendment (19 Sep 2026, "Mehr aus der App"): no shape change.** The
> iOS app's "Mein PapaMap" dialog gains a block that names what iOS keeps on
> its own screens and nobody would guess a map app has: the Control Center
> control, the home-screen widget, the Siri phrase. `appTips(platform, lang)`
> (`web/me.js`) returns the i18n keys to print — nothing off iOS, and
> `tipSiri` only in `SIRI_LANGS` (`de`, `en`), the languages the app ships
> App Shortcut phrases in; a test ties that list to the `.lproj` folders. The
> first "nearest" that finds a table is followed, once, by `toastTip`, whose
> tap opens the dialog; one new device key, `papamap-tip-seen`, set when the
> toast is shown, named in both Datenschutz pages. Five new i18n keys in all
> 32 languages (`meTipsHeading`, `tipControl`, `tipWidget`, `tipSiri`,
> `toastTip`); only German and English name iOS's own buttons. **Tightens
> v41:** the iPhone website Route anchor's fallback `href` is `#`, not the
> first provider's link, so no provider's URL opens before the reader has
> chosen one, even if the dialog never catches the tap. Shell pin `app35` →
> `app36`.
>
> **v41 amendment (19 Sep 2026, three findings from TestFlight build 24): no
> shape change.** **Corrects v39 below** on which changesets count as the
> reader's own. v39 says a MapComplete hand-off is marked `theme: "papamap"`;
> it is not. MapComplete writes the theme's **raw URL** into `theme` for a
> theme loaded by `userlayout=`, which is how every hand-off from this site
> opens it, so v39's rule never matched one MapComplete changeset (a reader
> with 3 answers on this site and 14 MapComplete sessions was shown "3").
> `isOwnChangeset` (`web/me.js`) now accepts `created_by: "PapaMap"`, the raw
> theme URL (`MAPCOMPLETE_THEME_URL`) and, still, the bare id. A cached
> answer's `n` is MapComplete's own `answer` tag where the changeset has one,
> `changes_count` otherwise, 1 when neither is usable: `changes_count` counts
> object versions, and two questions answered on one table are one version
> (14 real sessions: 42 answers, 18 changes). The device cache goes to
> version 3 with no change of shape, because v2 caches had marked the skipped
> history as scanned. **Corrects the Route button on the website (v36 below calls it
> "unchanged on every platform"):** a `geo:`
> URI is answered by Android only, so everywhere else the button was a dead
> link. `webRouteHref` (`web/datasource.js`) picks by device: `geo:` on
> Android, `https://www.openstreetmap.org/directions?to=…` in a new tab on a
> desktop, and on iPhone and iPad — where a web page cannot learn the default
> navigation app — the reader chooses in the `route-dialog` the app already
> has: Google Maps, Apple Maps, Waze (`webRouteChoices`), each an https
> universal link on a real `<a>`, never an app scheme. The
> apps keep `directionsUri` and the iOS cascade. Both Datenschutz pages say
> so. **Display:** `changing_table=no` prints as `roomNone` ("Kein
> Wickeltisch") in the play-place card and the edit confirmation, not as
> "Wickeltisch: no"; any other value still prints verbatim. Shell pin `app34`
> → `app35`.
>
> **v40 amendment (19 Sep 2026, "Mein PapaMap" scores exactly the area it
> names): no shape change.** **Corrects v39 below**, whose own text says the
> count runs "by `f.area` membership in the row's own area keys:
> `areaKeysFor(row)` is one key for a chunk" — true only for a reader whose
> UI language the chunk actually has a page in. Live bug, found after v39
> shipped: `https://papamap.de/?bbox=9.95,53.53,10.03,53.57` read in English
> said *"Changing tables in Germany: 31 % answered"* — 31 % is Hamburg's own
> figure (131 tables), not Germany's (6,242 tables, 20 %). `areaLink`'s own
> rule (CONTRACT.md v32) sends a chunk with no page of its own in the
> reader's language to its **parent country's** twin label — Hamburg has no
> English page, so an English reader's footer link already read "Changing
> tables in Germany" — while `areaKeysFor(currentArea)` kept scoring only
> the one chunk `currentArea` still was. Fixed in one place so label and
> count cannot diverge again: `web/datasource.js`'s new `areaForLabel(row,
> lang, rows)` returns `{label, keys}` together — the chunk's own label and
> `areaKeysFor(row)` when the reader's language has a page for it, otherwise
> the parent country's label (looked up in `rows`, the full `areas.json`
> list, by the chunk's own `parent` href) *and* `areaKeysFor(parent)`. A
> country row's own `en` fallback is unaffected (it is still that same
> country, just in English) and a chunk with no `en` at all (a US state, a
> Canadian province) never falls back either way, so neither ever hit this.
> `web/app.js`'s `meAreaNumbers` calls it in place of the two separate reads
> v39 had; `currentAreaLink`, which existed only to feed that second read,
> is gone — the footer link's own display is unaffected, still built from
> `areaLink(currentArea, lang)` directly. Same bug, same fix, for France's
> régions and Japan's prefectures, checked against a live `areas.json`: both
> chunk rows fall back to their country's own twin the same way Germany's
> Länder do. Shell pin `app33` → `app34`.
>
> **v39 amendment (19 Sep 2026, "Mein PapaMap"): no shape change** — no data
> file gains, loses or changes a property, and classification stays exactly
> where it was: nothing here derives a `status`, and PapaMap continues to
> **store nothing about anyone**. A new zoom-ctrl button, `#me` (between
> `#nearest` and the app-only `#offline`, on the website and in the store app
> alike), opens `<dialog id="me-dialog">`, three parts top to bottom, all
> wired in `web/app.js` from pure logic in the new `web/me.js`.
>
> **1. The game sentence.** The area is **whichever one the footer link
> already names** — `pickArea`'s own pick (CONTRACT.md v32), kept in
> `web/app.js`'s `currentArea`/`currentAreaLink` by `updateRegionsLink` on
> every pan, language change and first draw, and read from there rather than
> picked a second time with different inputs: the dialog can never disagree
> with the link sitting above it on screen, and it follows a pan the same
> way the link does (open in Hamburg, pan to Berlin, the sentence now says
> Berlin). **The area's own name in the sentence is the exact label the
> footer link shows** — `currentAreaLink.label` (`areaLink(currentArea,
> lang)`, unchanged: the row's own `label` or its `en.label`, whichever the
> link itself would choose for the reader's language) — never a bare sweep-
> area key on its own: `"Wickeltische in Hamburg: 31 % beantwortet"` for a
> chunk, `"Wickeltische in Deutschland: 28 % beantwortet"` for a country, so
> the dialog and the link can never read differently, in any language.
> Tables/answered/unknown are counted live over **every loaded feature**,
> never the chip-filtered subset — a reader who has switched off "female
> only" must not see the score move — by `f.area` membership in the row's
> own area keys: `web/datasource.js`'s new `areaKeysFor(row)` is one key for
> a chunk (its own `area`, "Hamburg") or every key behind a country
> (`areas`, Germany's 16 Länder); `web/me.js`'s new `areaAnswered`/
> `areaPercent` do the counting (live-checked against a real
> `changing_tables.geojson`: Hamburg is 131 tables, 35 `accessible` + 6
> `female_only` = 31 %). **Only when `pickArea` has found nothing at all**
> (open sea, zoomed out past any area's 250 km reach) does the sentence fall
> back to the site's own whole-sweep numbers — `localAnswered(stats.local)`
> and `answeredPercent`, unchanged, the same ones the stats strip renders,
> so the two still cannot disagree in that one case either; there `area` is
> `areaLabel(stats)`, the wordmark's own reading ("49 Länder").
>
> **The sentence is deliberately verbless** (`"{area}: {percent} %
> beantwortet"`, not `"{area} ist … beantwortet"`, and the mama reading
> `"{area}: wahrscheinlich …"` rather than `"In {area} sind …"`): `area` is
> whatever the footer link's own label happens to be — a full page label, a
> bare city name, a country's plural count — and a conjugated verb, let
> alone one behind a preposition demanding a declined form, is exactly the
> kind of thing that silently breaks in one language while the other
> thirty-one look fine, or has nothing to decline to in the first place. The
> colon-headline form needs neither, in any of the 32 languages.
>
> The "yours" clause is the reader's own answers **attributed to this same
> area**, weighted by how many answers a changeset actually holds (`n`,
> part 2 below): `web/me.js`'s `answerArea(answer, grid)` takes the `area`
> of the nearest loaded feature within the changeset's own `radius_m` —
> close enough that "nearest" is never ambiguous for this site's own
> point-changeset writes, and wide enough to still find a MapComplete
> session's own object(s) — and `answersInArea` sums `n` for every answer
> that lands in the current `areaKeysFor()` set; an answer with nothing
> that close (the object has since fallen out of the sweep) counts in the
> reader's total but in no area's score. `grid` is `buildFeatureGrid
> (allFeatures)`, rebuilt in `applyDataset` alongside everything else that
> depends on the loaded features — a coarse ~5.5 km-cell index, because a
> brute-force scan of ~26k features per answer (`answersInArea` calls
> `answerArea` once per cached answer) cost a few hundred ms on a phone once
> a reader had more than a handful, on both the dialog's open and the
> background refresh landing. In the whole-site fallback "yours" is simply
> `totalAnswers(answers)`, unattributed — there being only the one area to
> be in. Zero renders `meYoursZero`, an invitation, never "0 of those are
> yours". The "grey pins nearby" clause reads `greyNearby` (`web/me.js`):
> status `unknown` with **empty `location_raw`** — a room answered in words
> the classifier does not read is not a question to send anyone back to —
> within 1 km of `lastFix`, the last position either the locate or the
> nearest-table button actually resolved (`web/app.js`); the dialog **never
> triggers a location prompt of its own**, and with no fix yet the clause
> becomes a `meLocate` ("Standort verwenden") action that runs the existing
> `locate()` flow and re-renders in place. Tapping the grey-pins clause
> closes the dialog and calls `map.fitBounds` on `circleBounds` (`web/me.js`,
> a flat-earth degrees-per-km box — plenty for a 1 km circle already drawn
> in Web Mercator). Mama mode reads the same literal `status === "unknown"`
> pins, worded `meGreyNearbyMama` (amber, not grey) and framed by
> `meAreaSentenceMama` instead of `meAreaSentence` — the answered-percentage
> is the identical number either way (`momCounts`' `good` is
> `accessible + female_only`, the same two buckets `known` sums), only the
> sentence differs. `sentenceParts` (`web/me.js`) is the one place that
> picks the key and the numbers for all three clauses.
>
> **2. Your stats**, from the reader's own **public** OSM changesets, read
> live on the device: `GET {api}/changesets.json?display_name=<user>`, no
> auth header — a user's changesets are public information, this is not a
> privileged read. `time=T1` asks "closed after T1" (a top-up: only what's
> new since the cache); `time=T1,T2` additionally bounds "created before
> T2" (a page beyond the first 100, `T2` one second past the oldest
> `created_at` seen so far — `time=`'s own second resolution means a
> changeset sharing that exact second with the page's true oldest entry
> could otherwise be cut off by the 100-item limit and then excluded again
> by an exclusive bound set to that same second; `mergeAnswers`' dedup-by-id
> absorbs the one-page repeat the +1s reintroduces) — both exactly as OSM's
> API documents them, never a made-up cursor. `me.js`'s
> `changesetsUrl`/`pageBoundary` build and walk this. **A changeset counts
> as "yours" by its tags alone, never its contents, which are never
> downloaded**: `created_by: "PapaMap"` (this site's own writes,
> `writeTags`/`changesetTags`, unchanged) or `theme: "papamap"`
> (MapComplete's own hand-off tag for this theme, `theme/papamap.theme.json`'s
> id — equally reliable, so counted the same way; nothing else is, because
> nothing else can be told apart from an unrelated edit by its tags).
>
> **A PapaMap changeset edits exactly one object, so its bounding box is a
> point — a MapComplete changeset is not the same shape.** MapComplete
> reuses one changeset across a whole theme session, so one changeset can
> hold several answers (the room question and the play question on one
> table, or several tables visited in one sitting), spread over its own
> bbox. The API's own `changes_count` says how many edits a changeset holds;
> `me.js`'s `changesetAnswer` keeps it as `n` (defaulting to 1 for a
> changeset that lacks it — this site's own writes always are exactly 1;
> MapComplete's theme-session changesets are the only source that is ever
> more), and **all `n` of a changeset's answers are attributed as one
> block** to the single nearest feature within `radius_m` — `max(50 m, half
> the changeset's own bbox diagonal)`, capped at 5 km so one changeset can
> never claim a whole country's worth of area. `changes_count` may also
> count the theme's *other* questions (the play corner) on the same object,
> not only the room this project asks about, so **the count is honestly "a
> theme session's worth of answers", not "rooms recorded"** — the dialog
> still says "Antworten" (answers) in German, because every one of those
> changes is genuinely an answer to one of the theme's own questions, just
> not always this project's own one. Shown: the total (`totalAnswers`, the
> `n`s summed, not one per cached changeset record), the date of the first
> (`meStatsSince`, the full date — `{day, month: "long", year}` — not the
> abbreviated one, whose own trailing "." in German collided with the
> template's), and (part 1's own clause) how many lie in the area currently
> on screen — **no ranking, no other user's name, anywhere**, per the
> owner's ruling. **No per-answer colour breakdown in this cut**: matching
> each answer to the nearest loaded feature to show green/red/grey counts
> was in scope but is left for a later PR — omitted here to keep this one
> reviewable, not because it turned out unreliable.
>
> **Cached on the device**, localStorage key **`papamap-my-answers`**:
> `{ v, user, answers: [{id, lon, lat, closed_at, n, radius_m}, …],
> backfill: {oldest_scanned, done} | null }`, tied to the display name so a
> second login on the same browser never inherits the first one's numbers —
> `logout()` (`web/app.js`) removes the key outright and resets the
> refresh-throttle clock too (`myAnswersFetchedAt = 0`; missing this left a
> fresh login waiting out the five-minute throttle before its first fetch,
> showing "0 Antworten" until it did), and a read for a different `user`, or
> a stored `v` that does not match the cache's own current shape, is treated
> as empty rather than trusted or migrated — `v` bumps whenever the record's
> own shape changes, this being the first bump (no `n`/`radius_m`/`backfill`
> before it). Refreshed at most once every five minutes and once per dialog
> open (`MY_ANSWERS_REFRESH_MS`); the dialog always paints the cached
> numbers first and re-renders only once a refresh actually lands. **A
> failure — offline, a timeout, a dead mirror — is swallowed and answered
> with whatever the cache already has, no toast, no error state**:
> `native.js`'s own connectivity signal was removed by the pin `app23`→`app29`
> chain above as fundamentally unreliable on iOS, and this does not bring a
> new one back — the bounded fetch (`AbortSignal.timeout`, 15 s) simply
> fails the same way offline as it does on a bad host, and both are
> "nothing new happened this time" to the reader. **An answer this tap just
> wrote is appended immediately** from `writeTags`'s own reply — `obj.lon`/
> `obj.lat`, the changeset id it returns, `Date.now()` for `closed_at`, `n:
> 1` (this site's own writes are always exactly one) — so the count moves on
> the same tap rather than waiting for the next time the list happens to be
> paged; `mergeAnswers` (`web/me.js`) deduplicates by id so the same answer
> seen twice (the write's own echo, then the API's list) is never counted
> twice.
>
> **The backfill.** `MY_ANSWERS_PAGES` (5) calls is enough for a first-ever
> open to scan the reader's newest 500 changesets of any kind (the API
> filters by user, not by tag, so a heavy iD/StreetComplete mapper's own
> edits spend the same budget) — not necessarily their whole PapaMap
> history. `web/app.js`'s `fetchMyAnswers` splits that one budget across two
> passes: a top-up (what's new since the cache's own newest record, skipped
> outright when the cache is empty — it would only repeat the backfill
> pass's own first call) and a backfill continuing from a cursor kept in the
> cache record (`{oldest_scanned, done}`, `web/me.js`'s
> `advanceBackfillCursor`, walking `time=EPOCH,<oldest_scanned>` one page
> older each call). `done` flips true once a page comes back short — the
> true beginning of the reader's OSM history, not just this open's budget
> running out — and until then the total is not necessarily final: the
> dialog says so quietly, `meBackfillPending` ("Ältere Antworten werden noch
> gesucht …"), rather than presenting a partial scan as the whole answer.
>
> **3. Saved places.** A star toggle in the popup's title line — pin and
> play place alike, `web/app.js`'s `starHTML`/`toggleStar` — deliberately
> not in the Route row a parallel PR fills. Device-only, localStorage key
> **`papamap-saved`**: a list of up to `SAVED_MAX` (200) `{osm, name, lon,
> lat, saved_at}` records, newest first, `web/me.js`'s `addSaved`/
> `removeSaved`/`isSaved`. Not tied to a login — starring is a device
> preference, not an OSM write, and needs none. The dialog lists them with
> the pin's own colour when tonight's data still carries that `osm_url`
> (`viewFor(f.status, mode).cls`, the same lookup the pins and chips use)
> or a plain outline dot when it does not, and the distance from `lastFix`
> when there is one; a tap flies to it and reopens the popup (`openPin` for
> a still-loaded table, a direct `openPlacePopup` for a play place, a bare
> `flyTo` with nothing to open when the object has fallen out of tonight's
> sweep entirely) — that fallback is the whole reason the record carries its
> own `lon`/`lat` rather than only an id. A write that fails (private mode,
> a full quota) leaves the star exactly as it was and says so once
> (`meSaveFailed`), never a star that claims to be on when nothing was
> written.
>
> **Shell pin `app32` → `app33`** (v38's own `app31`→`app32` merged first,
> #146): `web/me.js` joins `web/sw.js`'s `SHELL` and `web/app.js`'s own
> imports at the new pin, and `app/build-www.js`'s file list, the same way
> `datasource.js`/`i18n.js`/`osm.js` already do — **including its own local
> imports**, `./osm.js?v=app33` and `./datasource.js?v=app33`: `me.js`
> shipped without the pin on those (PR #147) because `web/sw.test.js`'s
> "shell precache pins the same ?v=" test only ever read app.js's own
> imports. It now derives the file list to check from `SHELL` itself and
> scans every one of those modules' own `from "./*.js…"` imports, so a
> future module missing its pin fails there too, not just for app.js. New
> i18n keys — `ariaMe`, `meTitle`, `meAreaSentence(Mama)`, `meYours(Zero)`,
> `meGreyNearby(Mama)(Zero)(Mama)`, `meLocate`, `ariaMeGrey`,
> `meLoginInvite`, `meLogin`, `meStatsTotal(Zero)`, `meStatsSince`,
> `meBackfillPending`, `meSavedHeading`, `meSavedEmpty`, `ariaMeSavedRemove`,
> `ariaSave`, `ariaUnsave`, `meSaveFailed` — in all 32 languages, each block
> right after its own `statsGlobalMissing`, per `web/i18n.test.js`'s parity
> and token-matching tests.
>
> **Rebased onto v38 (#146, "share a pin, and the room card"), which touches
> the same popup code this amendment does.** `web/app.js` had gained two
> module-level `lastFix`, one this amendment's own `[lon, lat]` array for the
> grey-pins clause and the saved-places list's distances, one v38's own
> `{lat, lon, at}` for the room card — a `let`/`let` collision that is a
> `SyntaxError`, not a silent bug, caught rebasing rather than by any test
> here (nothing exercises `app.js` as a module). This amendment's own reads
> now take v38's shared `lastFix`/`noteFix` instead of keeping a second one;
> the "use my location" action in the dialog calls `noteFix` alongside
> `showYou`, exactly like the locate and nearest buttons already do. Three
> more findings, now this amendment's because it is in the same files:
> `sharePinGone` (v38) fires for an `?osm=` link this dataset never held too,
> where "nicht mehr"/"no longer" claimed a history the object never had —
> reworded neutral in all 32 languages. `docs/FEATURES.md`'s list of what
> gives the room card its turn named "tap a different pin" and "answer it";
> neither closes the popup the way described — a different pin replaces it
> with a new one, and answering leaves it open — corrected. `applyDataset`
> rebuilt `allFeatures` on every refresh but never re-evaluated a standing
> room card, so `roomCardFeature` could still name an object the new dataset
> had dropped for up to the card's own five minutes; it now calls
> `evaluateRoomCard()` too — but only when `roomCardFeature` is already set,
> to retarget or drop the standing card, never to raise one that is not
> showing: `evaluateRoomCard` reads only `lastFix`, with no memory of a pan
> that dismissed the card without touching the fix itself, and calling it
> unconditionally would have resurrected exactly that.
>
> **Round 2 review, same files again.** `web/app.js`'s `refreshMyAnswers`
> captured `user`/`cache` and awaited up to five sequential 15 s requests
> before unconditionally writing the result — a `logout()` during that
> window (the logout button lives inside this very dialog) cleared
> `papamap-my-answers` and the in-flight refresh then wrote the previous
> account's changesets straight back, breaking the Datenschutz page's own
> "gelöscht beim Abmelden". A generation counter, `myAnswersGeneration`,
> bumped by `logout()` and by a fresh login, is read before the fetch starts
> and checked again after — `me.js`'s new `refreshApplies(start, current)`,
> a tested seam rather than a comparison re-typed at each call site — before
> the result ever touches storage or the in-memory cache; `logout()` also
> aborts the fetch outright via one shared `AbortController`, so it does not
> keep running for nothing. Separately, the top-up pass (part 2, above) used
> to advance the watermark to the newest answer on its very first page
> regardless of budget — if more than a budget's worth of changesets sat
> between the old watermark and the new one, the unscanned stretch in
> between was gone for good the moment the watermark moved past it. `me.js`'s
> new `reopenGap(before, oldWatermark, previousBackfill)` reopens the
> backfill cursor at the point the top-up actually reached instead, with a
> `floor` at the old watermark so a previously-*finished* backfill does not
> have to re-walk history it already has; a still-unfinished one gets no
> floor and keeps walking to the real beginning, same as always. (Known,
> accepted simplification: a second gap opening before the first has closed
> reopens the cursor at the newer point without separately remembering the
> older, still-unfinished stretch — a reader would need to leave more than a
> page's worth of new changesets between nearly every dialog open for that
> to matter.)

> **v38 amendment (19 Sep 2026, share a pin, and the room card):** **no shape
> change** — no data file gains, loses or changes a property, and `STATUSES`
> is untouched.
>
> **Share.** The pin popup and the play-place popup gain a share button in the
> row the Route button already lives in — icon only (`popupShare` names it in
> the aria-label and the title, there being no room for a labelled button too
> in that row at 375 px in German). It builds
> `https://papamap.de/?osm=<osm_url>` (`shareUrl`, `web/datasource.js`) from
> the pipeline's own `osm_url`, urlencoded, verbatim — the very identifier
> `papamap://table?osm=…` already carries for the widget and the Siri shortcut
> (`TableStore.swift`'s `deepLink`). `openPin` (`web/app.js`) is now the one
> parser both read: this page's own `?osm=` on load, and the app's deep link,
> whichever scheme delivered it. It used to search only `changing_tables.geojson`;
> it now also searches `play_places.geojson`, so a shared play-place link opens
> its card too — an object neither array holds any more (deleted, or never on
> this dataset in the first place) flies nowhere and gets one toast
> (`sharePinGone`) instead of silently doing nothing, which the widget and the
> shortcut inherit for free, not only the share link. Once resolved, found or
> not, `?osm=` is stripped from the address bar with `history.replaceState`
> (`withoutOsmParam`, `web/datasource.js`, pure and tested), the way `?lang=`
> and `?mode=` already strip themselves — a page installed to the home screen
> from a shared link must not reopen that same pin on every future launch.
> The link carries no `?lang=` of its own: a shared link is not the sharer's
> language to choose for whoever opens it, so the receiver's own detection or
> stored choice wins exactly as it would on any other visit.
> `navigator.share({title, text, url})` where the browser has it — the
> reader's own share sheet decides where it goes from there; failing that, the
> link is copied to the clipboard (`navigator.clipboard`, then a
> hidden-textarea `execCommand("copy")` for a WebView with neither) and a
> toast confirms it (`shareCopied`), or, if even that fails, a toast says so
> (`shareFailed`) rather than leaving the tap looking like it did nothing.
> `title` is the place's name; `text` is the name plus one true line naming
> PapaMap, in the reader's own language — **two variants**, because a play
> place's own vocabulary (`popupPlay`/`tagPlay`/`metaPlaces`) is what makes
> one of them true: `shareText` ("a changing table on PapaMap") for a pin, or
> for a play place the reader has answered "yes" to in this session
> (`obj.changing_table === "yes"`, set by `answer()` the moment OSM confirms
> it — same as the popup's own tag row); `sharePlaceText` ("a play area on
> PapaMap") for every other play place, which OSM does not, in fact, record a
> changing table on. No `@capacitor/share`: both `navigator.share` and the
> clipboard API reach across Capacitor's WKWebView/Android WebView bridge on
> their own, so `app/plugins.test.mjs`'s list is unchanged.
>
> **The room card.** Standing in front of a table nobody has recorded a room
> for is the one moment this project most wants a reader's attention, and
> asking for it cold — a location permission prompt out of nowhere — is not
> this feature's to spend. So the card only ever follows a fix the reader
> already has for another reason: the locate button or the nearest-table
> button, the only two places `web/app.js` ever calls `locate()`. No new
> prompt, and never background location. The rule itself is pure and tested
> (`nearestUnknownRoom`, `web/datasource.js`): the nearest
> `changing_tables.geojson` feature with `status === "unknown"` and no
> `location_raw`, within **75 m** (`ROOM_CARD_RADIUS_KM`) of the fix,
> straight-line like `nearestUsable` — over every loaded feature, not
> `pinFeatures`, so neither the status chips nor the wheelchair chip narrow
> what the card can ask about: the question is about the place the reader is
> standing in, not about the view (a pin a chip is hiding is made visible
> again — `ensureVisible`, factored out of the nearest handler, which already
> did this for its own popup — the moment the card's own button is tapped, so
> it never flies to a spot that then shows nothing). Play places are out of
> scope for this v1 (`allPlaces` is not searched) — folding them in would mean
> deciding whether the card also files their bare `changing_table=yes`, a
> bigger question than 75 m answers.
>
> **A fix does not always get the card's turn at once.** `nearest` almost
> always opens a popup of its own first, and a card under it would be
> pointless; `evaluateRoomCard` is the one place that decides whether the card
> is up right now, recomputed from scratch — never patched — from the most
> recent fix (`lastFix`, `noteFix`) each time it runs: after `locate()` (which
> opens nothing, so the card's turn is immediate), after `nearest()` when it
> finds no usable table (same reasoning), and, deferred to a microtask,
> whenever a popup **closes** (`onPopupClosed`, wired on every popup this file
> ever creates, in `openPopup`/`openPlacePopup`) — a click on the map, the
> popup's own ×, this file's own remove-then-replace when a new popup opens on
> top, or `applyDataset` finding the object gone. A stale `lastFix` does not
> get the card back years later: it is good for **5 minutes** (`isFixFresh`,
> `web/datasource.js`, pure and tested) from the moment it was taken, popups
> and all. The deferral matters: a close fired by this file's own
> remove-then-open-a-new-one (the common case — reopening the same object
> after login, or opening a different pin) must see the *new* popup already in
> place before asking whether to show the card, which is why the check is
> `popup?.isOpen()` on the module's current popup, not on whichever instance
> just closed, and why it waits a microtask rather than asking synchronously
> mid-`remove()`. One close is deliberately **silent**: `applyMode` and the
> language switch tear the open popup down because its *text* belonged to the
> old reading, not because the reader dismissed anything, and must not bring
> the card back as a side effect (`closePopupSilently`, a one-shot
> `suppressCardOnClose` flag). Net effect: locate → card; open a pin → card
> hides; close that pin without answering → the card returns, naming the same
> pin, if the fix is still fresh; answer it instead → `location_raw` is truthy
> in memory the instant `answer()` returns (v25), so `nearestUnknownRoom` does
> not find it again and the card does not either; nearest → its own popup
> first, the card only once that one closes.
>
> A small card above the attribution line (`#room-card`, never a `<dialog>`:
> nothing here needs a backdrop, or the focus trap that would fight the map)
> names the place and repeats the popup's own question (`askRoom`, not a
> second translation of it — re-rendered on a language change, `applyI18n`,
> so a card left standing does not go stale in the old one) with one primary
> action that opens that pin's popup — the two-tap answer, the login line,
> all of it, already there — and one close ×. Closing it remembers the pin in
> `localStorage` under **`papamap-card-dismissed`** (a bounded FIFO list,
> capped at 200, wrapped in try/catch like every other storage read in this
> file) so it does not ask about that table again on that device. At most one
> card is shown at a time, and it disappears again if the reader pans the map
> more than 300 m from the fix that raised it (judged against the fix, not the
> pin — the card is still "about" that fix even while it is between popups).
> Never covers the popup, the toast or the app's dialogs on a 12 mini: mutual
> exclusion with the popup already guarantees the first, and the toast and the
> offline/route dialogs sit in their own corners of the screen. Works the same
> on the website and inside the app; this feature never asks `isNative()`.
>
> **The blocker this caught, same PR, before merge:** `popup`/`popupObj`
> (`web/app.js`) were never cleared when the reader closed a popup by clicking
> the map or the × — only this file's own `remove()`-then-reassign paths ever
> nulled them, which meant `if (popup)`, read anywhere as "is one open right
> now", was wrong the moment any popup had ever been opened in the session.
> The room card's own first cut used exactly that read and so could never
> reappear a second time. `onPopupClosed`, wired above, is now the one place
> that nulls them, on every close, whichever of the four ways above caused it.
>
> **Riding along, same PR, four fixes from the last review.** `roomLabelKeys`
> (`web/osm.js`) now lower-cases both the raw tag's tokens and its own
> vocabulary before comparing them, so `Female_toilet` still resolves to the
> room label instead of falling through to `{ raw: "Female_toilet" }` verbatim
> — `classify.py` already lower-cases before it matches, this only catches
> `roomLabelKeys` up to it. Matching stays exact, never substring, whatever the
> case: `female_toilet` and `male_toilet` still never match each other.
> De-duplication is case-insensitive too, first spelling wins:
> `Female_toilet;female_toilet` is one label, and `Attic;ATTIC;attic` is one
> `{ raw: "Attic" }`, not three. **Correcting v37:** its own CONTRACT.md text
> names only one shell-pin move, `app29` → `app30` — the sole pin line its
> prose carries. What actually shipped, in the same PR (#144), was a second
> bump to `app31`, for the three same-day review fixes (the `editFoundPlain`
> fallback, `placeHTML`'s table-row guard, and this file's own correction of
> v23) — recorded only in that PR's squashed commit message, never folded
> into v37's own prose here. "Since build 30" in v37's first paragraph should
> read "since build 31". **`docs/FEATURES.md`** (~line 302) said the
> play-place card never prints "Changing table: yes" at all — true of every
> path that writes to it today, since `tablePatch` always writes a room
> alongside it, but not what the code actually promises: `placeHTML`'s table
> row prints "yes" when there is no room to stand in for it (v37's own second
> review fix), so the sentence there now says exactly that instead of a
> blanket "never".
>
> Shell pin `app31` → `app32`.

> **v37 amendment (19 Sep 2026, the room in the reader's own language):** **no
> shape change** — no data file gains, loses or changes a property, `location_raw`
> is untouched, and this is still not a classifier: `pipeline/classify.py`'s exact
> token matching is the one place this project's colour comes from, and nothing
> here reads it. Corrects the "OSM's reply is quoted in the popup" line of the
> v25 amendment above: since build 30 it is quoted in the reader's own
> language, not verbatim. A new pure function, `roomLabelKeys` (`web/osm.js`,
> next to `ROOMS`), splits a raw `changing_table:location` value on `;`,
> matches each token against the theme's vocabulary — exactly, never by
> substring, the same rule `classify.py` lives by — and hands back either an
> i18n key (`ROOM_LABEL`, moved from `app.js` into `osm.js` next to `ROOMS` so
> the popup reuses the very map the answer buttons render their labels from,
> rather than a second copy of it) or the token verbatim when the vocabulary
> does not have one. The pair `{female_toilet, male_toilet}`, in either order,
> collapses to the one "both" label a reader would use for it, rather than
> printing two. The pin popup, the play-place card and the edit confirmation
> all render it the same way (`roomLabel` in `web/app.js`), in place of
> printing `location_raw` as OSM wrote it.
>
> **Riding along, same PR: "changing table: yes" is dropped from all three of
> those render sites.** Every pin and every place card the popup can show has
> a changing table, so the line said nothing; `limited`, or whatever other
> value OSM holds, is real information and still prints, in front of the room
> where one is on record. `printableTableValue` (`web/datasource.js`, a pure
> function next to `EDIT_TAG_LABEL`) is the one place this rule lives, so the
> three render sites cannot drift apart on it — `editTagLines()` itself is
> untouched and still hands back `"yes"` verbatim, since the rule is applied
> at render time, not to what the confirmation's own data represents.
>
> The `changing_table` value itself (`yes` / `limited` / `no`) has no matching
> label of its own in `web/i18n.js` — `wcYes`/`wcLimited`/`wcNo` are the
> wheelchair vocabulary, a different question in the same three words — so
> `limited` (the only value now ever printed beside "yes") stays verbatim, as
> before. Shell pin `app29` → `app30`.
>
> Also corrects the v23 amendment below, the same way this amendment corrects
> v25: since build 30 the edit confirmation no longer shows `changing_table`
> and `changing_table:location` "verbatim" — the room is translated, and a
> `changing_table=yes` line is dropped, exactly as above.
>
> *(19 Sep 2026, later: three review fixes, same PR, before merge.)* **Fix
> one:** dropping the `changing_table=yes` line at render time left a gap —
> `pollEdit` (`web/app.js`) chose between the `editFound` toast (quotes the
> tags) and `editFoundPlain` (does not) by asking only whether *any* `EDIT_TAGS`
> key had changed, not whether anything survived the render-time drop. A
> reader who answers only the theme's standalone table question on a play
> place — `changing_table=yes`, no room, the one tag the theme lets stand
> alone — changed a tag but left nothing printable, and the toast read "…is
> auf OSM: . …", an empty line where the tags should be. `printableEditTagLines`
> (`web/datasource.js`, next to `editTagLines`) is now the one rule both sides
> ask: `editTagLines` minus the line `printableTableValue` would drop.
> `tagsLabel` (`web/app.js`) renders it, and `pollEdit` picks `editFoundPlain`
> whenever it comes back empty. `editTagLines` itself is unchanged.
> **Fix two (a latent trap, not a live bug):** `placeHTML`'s table row used to
> risk rendering empty — a place with a truthy `changing_table`, no room and
> no printable value would have shown no headline row at all, table line
> suppressed and the "OSM says nothing" line skipped because `changing_table`
> is not, in fact, absent. `tablePatch` always sets a room alongside
> `changing_table`, so this could not happen through this site's own two taps,
> but the render code should not depend on that staying true. It now drops
> `yes` only when a room is there to stand in for it — `p.location_raw ?
> printableTableValue(p.changing_table) : p.changing_table` — so the row
> always has something in it. **Fix three:** this paragraph, correcting v23's
> "verbatim" the same way it corrects v25's "quoted… verbatim" above, and the
> `web/datasource.js` comment beside `OSM_REF` that made the same claim.
>
> **v36 amendment (18 Sep 2026, the Route button on iOS):** **no shape change** — no data
> file gains, loses or changes a property, and `STATUSES` is untouched. The
> popup's Route anchor now carries **`data-route="<lat>,<lon>"`** and
> **`data-route-label`** beside the `href` it always had; the `href` is
> unchanged on every platform (a `geo:` URI on the web and on Android, Apple
> Maps on iOS) and is still what a tap follows everywhere except inside the
> iOS app, where `web/app.js` catches the tap and `web/native.js`'s
> `routePlan` decides: `geo-navigation:` (the reader's chosen default
> navigation app) → `maps:` (Apple Maps) → a single installed navigation app
> by its own scheme → a chooser dialog (`#route-dialog`, new, i18n key
> `routeTitle` in all 32 languages) → the Google Maps directions URL on the
> open web. A URL the OS declines to open falls back to that same web URL in
> the in-app browser. Nothing is remembered between taps. New dependency
> `@capacitor/app-launcher` (8.x, matching Capacitor 8) and a new
> `LSApplicationQueriesSchemes` array in `app/ios/App/App/Info.plist`, which
> `web/native.test.js` holds to `ROUTE_SCHEMES` exactly. Why: `maps:` is Apple
> Maps' own scheme, so build 19's Route button did nothing but raise iOS's "No
> Navigation App Installed" on a phone whose owner had deleted Apple Maps.
> Shell pin `app21` → `app22`.
> *(18 Sep 2026, later: pin `app22` → `app23` for the store app's dataset
> loader, which no longer waits on a network without a bound — one budget per
> load shared by the download and the fallback fetch, eight seconds where a
> copy is already on the phone and twenty where none is, and nothing asked at
> all of a phone `navigator.onLine` reports as offline. The offline dialog
> gained an untranslated diagnostics block naming which of those paths
> answered (`web/native.js`, `app.js`, `index.html`, `style.css`); no contract
> change, no file gains or loses a property.)*
> *(18 Sep 2026, later still: pin `app23` → `app24`. That "nothing asked at
> all of a phone reported as offline" never fired on a phone: `navigator.onLine`
> is `true` in airplane mode in the app's WKWebView (build 20), so the answer
> now comes from **`@capacitor/network`** (SCNetworkReachability on iOS) where the plugin
> exists, asked once a launch before the four loads and bounded to 400 ms, with
> `navigator.onLine` the fallback everywhere else — the website is unchanged.
> The diagnostics block names which source answered, `online=false (native)`
> against `(navigator)`. `web/native.js`, `app.js`; new dependency
> `@capacitor/network` (8.x). No contract change, no file gains or loses a
> property.)*
> *(18 Sep 2026, and once more: pin `app24` → `app25` for the footer area link,
> which picked its area from the map canvas's own centre — including the
> strip underneath the (translucent) top bar, roughly the top third of a
> phone screen — so a reader looking at northern Germany could be told
> Denmark. `updateRegionsLink` (`web/app.js`) now feeds `pickArea` the centre
> and bounds of the canvas minus that covered strip, via a new pure helper
> `visibleMapView` in `web/datasource.js`; no data file gains, loses or
> changes a property, and `pickArea`'s own rule is unchanged.)*
> *(18 Sep 2026, and again: pin `app25` → `app26` for the app loader's clock
> (`budget` in `web/native.js`), which now counts itself spent the moment its
> own timer fires rather than only when `Date.now()` has reached the deadline.
> A timer can fire a millisecond early; asked then, the old clock said there
> was time left, so the download it had just let go of was not kept for
> promotion and a fallback fetch was issued with no time to hear it. No
> contract change, no file gains or loses a property.)*
> *(18 Sep 2026, last of the day: pin `app26` → `app27`. The untranslated
> diagnostics block at the foot of the app's offline dialog (pins `app23` and
> `app24` above) is removed, with `formatDiagnostics`, its `<pre>` and its
> style: it was a TestFlight aid, and it had done its job. The loader's `note`
> out-parameter stays for the tests. No contract change, no file gains or
> loses a property.)*
> *(18 Sep 2026, once more: pin `app27` → `app28`, and the store app's loader
> changes its rule from "network first, the copy after eight seconds" to
> "the copy first, always, refreshed behind it" — no answer iOS gives to "is
> there a network" turned out to be trustworthy. TestFlight build 21 (the
> owner's iPhone) still spent the full eight seconds in airplane mode: the
> loader's own note read `online=true (native)`, because an auto-connect VPN
> profile makes iOS report the network reachable even with no route out
> (SCNetworkReachability answers the on-demand flags the profile sets, and
> `@capacitor/network` read those as connected). `loadJSONNative`
> (`web/native.js`) now reads a stored copy — `path`, or `.new` when that is
> the only copy there is — and returns it **at once**, no clock, no network
> question; the download that keeps it current starts only once that read has
> finished (starting it any earlier could let it overwrite the very file
> being read, when `.new` was the only copy). The return value gains
> **`refreshed`**, a promise that never rejects: `{ ok: true, json }` when the
> background download found something that reads differently from what was
> drawn (compared as raw text, not parsed objects — the files run to several
> megabytes, and the dataset is rebuilt once a night, so most launches find
> no difference at all), `{ ok: true, json: null }` when it found the same
> thing, `{ ok: false, json: null }` when nothing fresh could be had — the
> download failed, or what it fetched would not parse. Present on every
> answer but `null` itself — a load with no copy to refresh (`fromStore:
> false`, the download or the page's own fetch drew fresh data directly)
> still gets one, the trivial `{ ok: true, json: null }`, so app.js never has
> to ask which shape it got. Bounded by the native downloader's own idle
> timeout (`NET_MS`, 20 s), so a black-holed refresh still settles. With no
> copy on the phone the loader is unchanged: `NET_MS` for the download, then
> the page's own fetch, then `null`.
>
> **The copy just drawn may itself be `.new`** (`path` missing or would not
> parse, `.new` the only copy there was), and the download the refresh starts
> writes into that same file — so before it does, the refresh promotes the
> drawn `.new` to `path` first. Without that, the download's own write would
> land on the reader's only copy before anything got the chance to compare
> it, and a response that happened to read the same, or a 200 that was not
> JSON at all (a captive portal's login page), would delete it outright. A
> promotion that itself fails skips the download for that launch and reports
> the refresh failed instead: a good copy already on the phone outranks a
> chance at a fresher one.
>
> `web/app.js` draws from the copies exactly as before, then watches all four
> `refreshed` promises together (`watchRefresh`); once every one has settled,
> whichever changed is applied exactly once — `applyDataset`, the five
> assignments a loaded dataset turns into on screen, which `boot()`'s own
> first draw calls too rather than keeping its own copy, so the two can never
> drift apart. It never moves the map and keeps an open popup open
> (re-rendered in place by `osm_url`, and only closed if that object is no
> longer in the new data), and it hands the refreshed dataset to the widget
> and the Siri shortcut the same way `boot()` does (`shareDataset`, inside
> `applyDataset` itself). The "Offline" toast, which used to
> fire whenever `fromStore` was true — every single launch, under this rule —
> now fires only once every one of the four refreshes has settled and **not
> one** found anything fresh; a refresh still running, or one that landed
> unchanged, says nothing. The website is untouched: `sw.js` keeps its own
> eight-second rule, `isNative()` remains the only branch, and the 32
> translated toast strings are unchanged.
>
> `connectivity`, `STATUS_MS`, the `online`/`onlineFrom` loader options and
> the `conn` plumbing in `app.js` are removed, and with them the
> `@capacitor/network` dependency (`app/package.json`,
> `app/ios/App/CapApp-SPM/Package.swift`, `app/android`). No data file gains,
> loses or changes a property; `{ json, fromStore }` is exactly what it was.)*
> *(18 Sep 2026, once more: pin `app28` → `app29`. Every launch that already
> has all four files on the phone used to redownload every one of them just
> to learn nothing had changed — `changing_tables.geojson` is 18.5 MB raw,
> `play_places.geojson` 3.3 MB, and the dataset is rebuilt once a night. Now
> `data/stats.json` (about a kilobyte, written by the same nightly build in
> the same second as the other three) is the canary: a launch with a stored
> copy of it refreshes THAT first, and downloads the other three only when
> its raw text differs from what was stored. Nothing new either way costs one
> small request instead of four. `loadDatasetNative` (`web/native.js`) owns
> the ordering; `loadJSONNative` gains two options, `gate` (await this before
> downloading; `"changed"` proceeds as before, `"unchanged"`/`"failed"` settle
> without a request) and `hold` (download and compare as usual, but leave a
> changed answer sitting at `.new` rather than promoting it). The invariant
> this keeps: the stored stats.json is never newer than any stored copy of
> the other three. Each of the three still promotes itself the moment its own
> download differs, same as always and independently of the other two — only
> stats.json's OWN promotion is held back until all three have settled ok
> (changed or unchanged, either counts), and thrown away instead if any of
> them failed, so the next launch reads last night's stats.json again, finds
> it still differs, and tries the whole thing over. Without this, one failed
> big download on an otherwise fine night would leave the phone a day behind
> with nothing to notice. A file with no stored copy of its own, or a launch
> with no stored stats.json to compare against at all, takes the long path
> exactly as before — nothing here gates a first launch. Accepted edge: a
> phone that refreshes in the exact second the nightly build is still being
> written can draw a new stats.json against still-old big files; it catches
> up the next night. A second, rarer way to the same edge: killed while
> stats.json's own `.new` is held (downloaded, not yet promoted) and its
> `path` copy has since gone unreadable, the next launch self-heals `path`
> out of that `.new` before its own download even runs, compares against a
> stats.json that already reads as last night's build, finds no difference,
> and never asks the three at all — same consequence, one night behind, and
> it self-heals the following night. `web/app.js`'s `loadJSON` stays the
> website's own fetch, unchanged; a new `loadDataset` picks between it and
> `loadDatasetNative` on
> `isNative()`, the only branch, and hands `boot()`/`watchRefresh` back
> exactly loadJSON's `{ json, refreshed }` shape per file. No data file
> gains, loses or changes a property.)*

> **v35 amendment (18 Sep 2026, no donate link inside the store app):**
> **HTML surface only** — no data file gains, loses or changes a property.
> Every generated page (the area pages, their hubs and the leaderboard, in all
> ~30 page languages) now wraps its Ko-fi link and the punctuation that ends
> its sentence in **`<span class="donate">`**, written at render time by
> `pages.wrap_donate`, which raises rather than emit a footer it does not
> recognise; loads **`in-app.js`** from the site root in its `<head>` (classic,
> blocking, unpinned — these pages are nightly output under plain URLs); and
> carries `.in-app .donate { display: none; }` in its inline `<style>`. The
> same span is in `web/index.html` and its generated twin. The frontend's half:
> `native.js`'s `openExternal` appends **`?app=1`** to the URLs it opens **on
> papamap.de only** (query and fragment preserved, nobody else's URL touched),
> and `web/in-app.js` turns that flag — or the `sessionStorage` key
> `papamap-in-app` it leaves behind for the rest of the in-app browsing
> session — into the class on `<html>`, before the first paint, and takes the
> flag out of the address once the key is set, so a shared link carries none. Why: the app
> opens the website's pages in an in-app browser, which is still inside the
> app, and the app may show no donate link (App Store 3.1.1, the non-trader
> declaration; issue #124). The bundled page still has the span cut out
> entirely (`app/shell.mjs`). A reader on the open web sees exactly what they
> saw before, and with JavaScript off nothing changes at all. Shell pin
> `app20` → `app21`; `in-app.js` joins the pinned shell and the sw precache.

> **v34 amendment (18 Sep 2026, the play question on every pin):**
> the popup's play line (v30, three answers since v31) is asked on **every**
> `changing_tables.geojson` pin whose `play` is `null` (`play_recorded`
> false), whatever its `status` — v30 asked it only where the room question
> was asked too, or had just been answered. A reader who notices a play corner
> in a café whose room is long on record could not say so without the
> MapComplete detour. Where no room question stands above it, the play line
> carries the login line itself ("Log in once with OSM…" / "Logged in as …"),
> so a tap never leads to a consent screen unannounced. The write, the guard
> over both keys, the changeset comments and the confirmation are v31's,
> unchanged; a play place still never asks it, and a recorded answer of either
> value still takes it away. **No shape change** — no file gains or loses a
> property. Shell pin `app18` → `app19`.
> *(18 Sep 2026, later: pin `app19` → `app20` for the store app's dataset copy
> and the offline dialog — `web/native.js`, `app.js`, `style.css`; no contract
> change.)*

> **v33 amendment (18 Sep 2026, the store app and its city basemaps):**
> a second, weekly pipeline (`pipeline/tiles.py`, the `tiles` compose service)
> writes **`tiles/<slug>.pmtiles`** — one PMTiles extract of the Protomaps
> daily build per leaderboard city (`CITY_AREAS_BY_COUNTRY`, 62), `maxzoom`
> 14 — and **`tiles/index.json`**, the catalogue: `generated` (ISO, UTC),
> `build` (the Protomaps build the extracts were cut from), `source` (the
> attribution line), **`cities`** — one row per city *whose file is there*:
> `slug`, `name`, `cc` (ISO country, lower case), `bbox` (`[w, s, e, n]`),
> `bytes`, `maxzoom` — and **`failed`**, the slugs whose extract did not come
> through this run (their previous file, if any, stays listed and served).
> Only the store app reads it (`web/native.js`: `cityCatalogue`,
> `downloadCity`); the website has no offline basemap and never requests
> `/tiles/`. The catalogue is served with `Access-Control-Allow-Origin: *`,
> as are `/data/*.geojson` and `/data/*.json`, because the app is this same
> shell under its own origin; the `.pmtiles` files are **not** — the app
> fetches them with the native downloader, which knows no CORS. The app hands the Swift side (widget, Siri) a compact
> copy of the tables — rows of `[lat, lon, status, name, osm_url]`, already
> narrowed by the wheelchair chip — and `status` is read there, never
> derived, as everywhere else. A changeset filed from the app carries
> `host=https://papamap.de/` like one from the site. Shell pin `app17` →
> `app18`; `native.js` joins the pinned shell.
> The two GeoJSON files, `stats.json`, `areas.json` and `history.json` are
> untouched.

> **v32 amendment (17 Sep 2026, the footer link follows the map view):**
> every `changing_tables.geojson` feature gains **`area`** — the sweep area
> that found the object (`"Hamburg"`, `"Bretagne"`, `"Florida"`,
> `"Danmark"`), from the same `ct_area` mapping the pages and the leaderboard
> count by; `null` for an object no sweep area claims. It is the one exact
> answer to "which Land or country is this pin in": a bounding box has
> Strasbourg in Germany and Salzburg in Bavaria. And the pipeline writes a
> fourth JSON, **`data/areas.json`**: a list of rows, one per generated area
> page. Every row has `href` (site-relative: `wickeltische/hamburg.html`,
> `wickeltische/` for the German index), `lang` (the page's language),
> `label` (its own h1, "Wickeltische in Hamburg"), `bbox` (`[w, s, e, n]` in
> the padded form the pages' own `?bbox=` links use, or `null` when the area
> has no object or straddles the antimeridian; a hub's box is the union of
> its chunks') and, unless the page is English already, `en`
> (`{href, label}`): the English reading for a reader whose UI language is
> not `lang` — a country's English twin, or for a chunk the twin of its
> country. A country row carries **`areas`**, the sweep area names behind
> it (Germany: the 16 Länder; Denmark: `["Danmark"]`); a chunk row — Land,
> région, state, prefecture — carries **`area`**, its one sweep area, and
> **`parent`**, the `href` of its country row. The frontend
> (`pickArea`/`areaLink` in `web/datasource.js`) lets the seven pins nearest
> the map centre vote with their `area`, weighted by nearness (none within
> 250 km: no answer),
> takes the chunk when its box covers at least a quarter of the view and the
> country otherwise, and falls back to the language-routed `regionsHref`
> when there is no answer or either file is missing.
>
> HTML surface: every country page not written in English gets an English
> twin at **`<slug>-en.html`** (Germany: `deutschland-en.html`, a hub over
> the 16 Land pages; France and Japan: hubs in English over their native
> chunk pages) whose `<link rel="canonical">` is the majority-language page.
> Twins link each other and the majority pages by endonym in the back row
> and are **not** in `sitemap.xml`. Shell pin `app15` → `app16` (→ `app17` with the
> review fixes the same day).
> `stats.json`, the two GeoJSON files and `history.json` are untouched.

> **v31 amendment (17 Sep 2026, the play question gets its third answer):**
> The popup's play line asks about a **play area for children**, not an indoor
> corner, and offers **three** answers — the three mappings of the theme's own
> `kids-area` question: *indoors* → `kids_area:indoor=yes` + `kids_area=yes`
> (v30, unchanged), *outdoors only* → `kids_area=yes` + `kids_area:indoor=no`,
> *none* → `kids_area=no`. v30 asked about the corner indoors and wrote the
> answer to the whole place: a bakery with a playground in the garden got a
> `kids_area=no`, which OSM reads as "nowhere for children to play"
> (issue #119). The third answer is what makes the other two truthful, and it
> is the theme's pair verbatim — the page and MapComplete still write the same
> thing for the same tap.
>
> **`play` gains a source that is nobody's answer:** an object with
> `leisure=playground` and no `indoor=yes` is **`false`**, where v30 said
> `null` ("a bare `leisure=playground` stays `null`", superseded here). The
> object *is* an outdoor play area, so there is nothing left to ask a reader
> standing on one — and v30's question, asked on a playground that carries a
> changing table, invited a `kids_area=no` on a playground. This is a
> classification rule (`pipeline/classify.py::play_state`), **not a shape
> change**: `play` is the same tri-state property with the same three values,
> read by the same `play === true`, and `play_recorded` follows as before. The
> only thing that moves is which pins ask the question.
>
> **The confirmation gives `kids_area:indoor` its own label.** Both keys shared
> `tagPlay`, so the outdoors-only pair rendered as "Play area: yes · Play area:
> no". `EDIT_TAG_LABEL` now maps it to `tagPlayIndoor`, and moves from
> `web/app.js` to `web/datasource.js` beside the tag lists it keys (superseding
> v25's pointer to its old home) together with `editTagLines()`, which builds
> the confirmation's `[label, value]` lines and drops the sub-key's line where
> it only repeats the parent's value. So the site's own *indoors* answer still
> reads "Play area: yes", and the theme's outdoors-only pair reads "Play area:
> yes · Indoor play area: no". Still displayed, never interpreted.
>
> **A play answer's "taken" check covers both keys** (`web/osm.js::guardKeys`).
> It tested the patch's own keys, so a `kids_area:indoor=yes` tagged since last
> night's build survived underneath a "none" — self-contradicting, ring still
> drawn, and v25's "that answer is theirs" broken inside the staleness window.
> A play answer now claims `PLAY_TAGS` whole, before any changeset is opened.
>
> Shell pin `app14` → `app15`. In 32 languages `askPlay` is reworded,
> `askPlayYes`/`askPlayNo` become `askPlayIndoor`/`askPlayNone`, and
> `askPlayOutdoor` and `tagPlayIndoor` are new. `theme/papamap.theme.json` is
> untouched — the three mappings were already there, and this is the popup
> catching up with them.

> **v30 amendment (17 Sep 2026, the popup asks about the play corner too):**
> `play` on a `changing_tables.geojson` feature becomes **tri-state** —
> `true` (an indoor play corner is recorded, the v9 rule unchanged), `false`
> (somebody has answered on `kids_area` or `kids_area:indoor` and the answer
> does not pass: `no`, `limited`, `outdoor`, a blank, junk) and `null` (nobody
> has answered). Key presence decides the false, not the value, the same
> reading `build_play_features` gives a blank `changing_table=`. `leisure` is
> not one of those keys: a playground is what an object *is*, not an answer
> about a café's corner, so a bare `leisure=playground` stays `null`.
>
> Nothing renders differently: the blue halo, the *with play area* chip, the
> badge and every count still read `play === true`, and false and null both
> draw nothing (`web/datasource.js` keeps `play: p.play === true`). The
> difference is the **question**. A pin that asks the room question now also
> asks *indoor play area?* — one line, two buttons, under the rooms — where
> `play` is `null`. Answering writes, under the reader's own account and in
> its own changeset, the mappings of the theme's `kids-area` question:
> `kids_area:indoor=yes` + `kids_area=yes` for yes, `kids_area=no` for no
> (`web/osm.js::playPatch`). Both are values `classify.py` already reads, so
> the ring follows at the next nightly build; the popup never classifies.
> The keys the site can write split into `TABLE_TAGS` + `PLAY_TAGS`, and `EDIT_TAGS`
> is the two of them: a confirmation quotes back the group the answer wrote, while
> the MapComplete edit check watches all four.
>
> `web/datasource.js` exposes the distinction as **`play_recorded`** (true for
> `true` and `false`, false for `null` or a missing property). A dataset from
> before v30 writes `false` where it now writes `null`, so the question simply
> does not appear until the next build — never on a pin whose reader has
> already answered it. `play_places.geojson` is untouched: those places *are*
> the play corner, and nobody is asked about it there.

> **v29 amendment (15 Sep 2026, the wheelchair chip is remembered):** the chip's state
> is kept in `localStorage` under **`papamap-wheelchair`** (`"1"` when on, removed when
> switched off; `web/datasource.js::pickWheelchair`), and the map opens with it as it
> was left. Its audience needs it on every visit, and the home-screen app otherwise
> opened with it off each time. No `?wheelchair=` parameter: nothing links to it. Named
> in the Datenschutz beside `papamap-lang` and `papamap-mode`. Nothing in the emitted
> data changes.

> **v28 amendment (15 Sep 2026, play places under the wheelchair chip):** every
> `play_places.geojson` feature gains the three v26 properties, verbatim and with the
> same values — **`wheelchair`**, **`toilets_wheelchair`** (`yes | limited | no | null`)
> and **`wheelchair_description`** (string or `null`). With the wheelchair chip on, the
> hollow and dashed rings narrow by the pins' rule, `wheelchair=yes` and nothing else
> (`web/datasource.js::placeFeatures`), and so do the "play area only" badge and the
> places clause of the count; the place popup shows the tags as the pin popup does.
> Until v28 the chip narrowed the tables and left every ring standing, which read as a
> promise of access nobody had recorded — 5,383 rings on 15 Sep 2026, none with the
> property. No `key` on places: v5 is about tables. A dataset from before v28 has no
> such property, so under the chip it shows no rings at all, never all of them. No new
> Overpass query.

> **v27 amendment (14 Sep 2026, the answered "no"):** `play_places.geojson` now also
> carries the places that record an indoor play area **and `changing_table=no`** —
> until now dropped as "somebody did answer". They are still not pins, and still not a
> fourth status: there is no table, so there is nothing to colour, and red would tell
> a mother there is a table for her. But a café with a play corner is worth a father's
> visit whether or not it has a table, so it is drawn — as a **dashed** blue ring
> (`play-places-no`, a symbol layer over a canvas-drawn icon, since a circle layer
> cannot dash its stroke; same size as the hollow ring at every zoom), and its popup
> says "changing table: no" where the hollow ring asks the question. Every play-place
> feature gains **`changing_table`: `"no" | null`** — `null` is the open question, and
> the only two values the frontend accepts (`web/datasource.js::loadPlaces`); a
> dataset from before v27 has no such property and reads as all-open. The pipeline's
> `build_play_features` takes the sweep's changing_table half as a second argument
> and keeps `no` from it; `yes`/`limited` remain pins, junk remains junk.
> `stats.local` gains **`play_places_no`**, counted apart: `play_places` stays the
> open questions (the methods pages' "nobody has answered" number), and the two are
> not to be added. Overpass is not asked anything new — the union sweep already
> returns every `changing_table` object. Measured on Germany, 14 Sep 2026: **18**
> such places; worldwide taginfo has 1,182 objects with both keys, the vast majority
> pins. Prompted by Nanas Café, Hamburg (node 3696100956): a play corner added and
> nowhere on the map, because the café had honestly recorded `changing_table=no`.

> **v26 amendment (14 Sep 2026, wheelchair access):** every feature gains four
> properties carried verbatim from OSM — **`wheelchair`** and **`toilets_wheelchair`**
> (`yes | limited | no | null`, the wiki's three values from `wheelchair` and
> `toilets:wheelchair`; anything else, and a missing tag, is `null`, which the frontend
> reads as unrecorded and never as `no`), **`wheelchair_description`** (`wheelchair:description`
> or `null`) and **`key`** (the `centralkey` value when the key locks the table per the v5
> rule, else `null`). No new Overpass query: the sweep already returns every tag. The
> popup shows the three as they are; the chip bar gains a last chip, off by default, that
> narrows to **`wheelchair=yes` and nothing else** (`web/datasource.js::isWheelchairOk`).
> `limited` is one step of up to 7 cm or help needed by the wiki's definition, Wheelmap
> paints it orange, and `toilets:wheelchair=yes` alone would admit a place with a step at
> the door — so both stay in the popup and out of the filter. A badge, never a status, on
> the v9 reasoning: an untagged place is unrecorded, not inaccessible.
>
> **v5 is amended, not retracted.** A key-locked object is now **emitted**, with `key`
> set and its `status` from the room rule alone (the key locks the door, not the room),
> but it is still not a pin: `web/datasource.js::pinFeatures` hides every `key != null`
> feature by default and admits it only under the wheelchair chip and only if it passes
> the chip's rule — the chip's audience is exactly who holds the key (the 2026-08-14
> "exclude, don't caveat" call stands for the default map). `pipeline/run.py` hands only
> the `key: null` features to the area pages, the leaderboard and the history, the chip
> counts and the "shown of total" figure are taken over the pins, and
> `stats.local.centralkey_locked` counts them as locked as before, so no published number
> changes by them. On the map a keyed pin carries a white key glyph from zoom 13 (a
> symbol layer, `tables-key`) and the popup a line saying the door needs a central key;
> the nearest-table search skips them unless the chip is on, and with it on searches
> only what the chip shows. Measured on Germany, 13 Sep 2026: 6,190 `changing_table=yes`
> objects, 4,419 `wheelchair=yes` (71 %), 534 `limited`, 495 `no`, 742 untagged; 1,339
> `toilets:wheelchair=yes`; 390 tables in a wheelchair toilet, 7 behind a Euro key.

> **v25 amendment (11 Sep 2026, the in-page answer):** the frontend may now **write to
> OSM on the reader's behalf** — the one Global Rule that has changed since v0, and it is
> edited in that section directly, not only noted here. `web/osm.js` logs the reader in
> with OAuth 2 + PKCE (a public client: no secret in the repo, the token exchange runs in
> the browser as iD's does), and the two-tap room answer on a grey pin becomes one
> changeset under the reader's own account, tagged `created_by=PapaMap`,
> `hashtags=#papamap`, `host=https://papamap.de/`, `source=survey`. The pipeline still
> writes nothing, PapaMap still stores nothing, and the changeset's author is the reader,
> as with StreetComplete. Only `changing_table:location` is written, with values from the
> theme's own vocabulary (`female_toilet;male_toilet`, `male_toilet`, `female_toilet`,
> `unisex_toilet`, `dedicated_room`; never `changing_table` itself, so `limited` is not
> promoted to `yes`), and only on a pin whose status is `unknown` *and* whose
> `location_raw` is empty — a room somebody tagged in words the classifier does not read
> is left to MapComplete, where the reader sees it before writing over it. The mother's
> reading offers only the rooms she can vouch for (`female`, `unisex`, `dedicated`).
> **Still not a classifier:** OSM's reply is quoted in the popup, `location_raw` on the
> in-memory feature is updated so the question does not reappear, and the pin keeps its
> colour until the nightly build — the emitted shape is untouched. Any host other than
> `papamap.de` talks to the sandbox API. The token lives in `localStorage`
> (`papamap-osm-token`, `papamap-osm-user`), named in the Datenschutz; the pending answer
> and the PKCE state sit in `sessionStorage` for the round trip only.
> **The play places get the same question** (later the same day): a room tapped on a
> blue pin writes `changing_table=yes` *and* `changing_table:location`, because on an
> object with no table tag at all the room alone would make a grey pin tonight and the
> yes alone would ask the room question twice. `yes`, never `limited` — the reader stood in
> front of one. The place stays in `play_places.geojson` and stays blue until the nightly
> build moves it over; the in-memory object learns both tags so the popup reads like a
> pin's. Nothing is written to an object that is not already on the map: an untagged café
> is still MapComplete's `dad_venue` layer, since the site's GeoJSON carries no venues.
> **The same question also offers "no"** (13 Sep 2026): a play place can be told there is
> no changing table at all, which writes `changing_table=no` alone — no room tag, since a
> "no" names no room — under its own changeset comment. `pipeline/export.py` already
> treats `changing_table=no` as an answered place and leaves it off next night's ask list,
> so the question does not return.
> **The whole vocabulary** (13 Sep 2026, evening): `wheelchair_toilet` joins both readings
> — it was the commonest value in OSM and the one the first cut left out — and `room`,
> `sales_area`, `outdoor` are offered behind a "more" link, so the values written are now
> ACCESSIBLE_TOKENS plus the women's room and the two-room list. Still only
> `changing_table:location` on a pin, still never `changing_table` itself.

> **v24 amendment (8 Sep 2026, the Papa/Mama reading; numbered after v23 when the two branches met on 11 Sep):** the frontend now offers
> **two readings of the same three statuses**, and the emitted shape does not change
> by one byte. `classify.py` still answers exactly one question — can a *father*
> reach this table — and still emits `accessible | female_only | unknown`; the new
> `viewFor(status, mode)` in `web/datasource.js` is a lookup over those three values
> and nothing else. No OSM tag is read in JavaScript, no fourth status exists, and
> `stats.json`, `changing_tables.geojson` and `history.json` are untouched.
>
> **What the mother's reading changes:** `accessible` and `female_only` both paint
> green (a table in the women's room is one she can use), and `unknown` paints
> Okabe-Ito orange `#e69f00` rather than the grey call to action, because for her an
> unrecorded room is usually still her room. The three filter chips stay three, over
> the *literal* status, with identical counts in both readings — a mother may
> deliberately want the women's-room tables over a shared unisex one, and collapsing
> the chips would remove that. Only the pin colour, the chip labels, the popup
> sentence and the one `statsLocal` sentence differ; `statsGlobal` and
> `statsHonesty` are objective dataset facts and stay mode-invariant.
>
> **The mother's count sentence needs no new pipeline field:** `momCounts` adds
> `local.accessible + local.female_only` and keeps `local.unknown` apart, and those
> three already partition the tables (2,873 + 477 + 22,419 = 25,769 = `ct_yes` +
> `ct_limited`, live build of 8 Sep 2026).
>
> **The one disclosed simplification:** a table tagged `changing_table:location=male_toilet`
> alone reads green in the mother's view too, which is not literally true. It is named
> in `methods.html` in all 32 languages *and* hedged in the product copy itself — the
> popup says "in rare cases the men's room only" and the count sentence says
> "probably" — because a reader deciding at the door has not read the methods page.
> Demoting those pins instead would mean branching on `location_raw` in JavaScript,
> which is the re-derivation this contract forbids.
>
> `?mode=papa|mama` is honoured on load and stripped from the URL once the reader
> chooses in-page, exactly as `?lang=` is; it deliberately does **not** touch the
> canonical or the hreflang set, because a reading is a personalization of the same
> content, not a new indexable page. Stored in `localStorage` under `papamap-mode`,
> named in the Datenschutz beside `papamap-lang`.
> **v23 amendment (10 Sep 2026, the edit confirmation):** after a reader
> clicks a pin's MapComplete button, the frontend re-reads **that one object**
> from the OSM API (`api.openstreetmap.org/api/0.6/<type>/<id>.json` — answers
> papamap.de cross-origin, needs no login, reflects a changeset the moment it
> lands where Overpass lags minutes): once on the click as a baseline, then a
> few times over five minutes once the tab is back in front. It then tells the
> reader what OSM now holds — the raw `changing_table` and
> `changing_table:location` values, verbatim, as a popup row or a toast — or,
> after five minutes with no new version, that MapComplete may still be holding
> unsaved changes. **It is still not a classifier.** No status is derived from
> those tags, no pin changes colour, no count moves; the nightly build remains
> the only path from OSM into the map, and the confirmation says so ("the map
> updates tonight"). The changing-table tags JavaScript touches are named in
> `EDIT_TAGS` (`web/datasource.js`, which compares them) and labelled in
> `EDIT_TAG_LABEL` (`web/app.js`, which prints them) — displayed, never
> interpreted. The emitted shape does not change by one byte. The reader's
> browser talks to the OSM API directly (named in the Datenschutz), and what it
> remembers — the object and its baseline version — lives in `sessionStorage`
> under `papamap-edit-check` and counts as expired fifteen minutes after the
> click — the next read removes it, and the tab's end removes it in any
> case. Riding along on the same day: the
> *play area only* chip now starts switched **on**, so the prospects are on
> the map from the first paint; v10's "off by default" describes the state
> before 10 Sep 2026. Its count stays a separate clause of the count line
> and never joins the table total.

> **v22 amendment (5 Sep 2026, wave 3 — Japan, and Japanese as the 32nd page
> language):** papamap.de sweeps **49 countries** — v21's 48 plus `jp`, the
> last of the world's top six by pins that is *in*. The one left out, China
> (306 pins), clears v19's 250-pin threshold and is parked by decision
> (2026-09-04): 74 % of its tags say `no`, so a page would be nearly all
> red and grey, and the threshold admits a country, it does not compel one.
> Russia (241) is under it. Japan sweeps whole in 39.6 s but counts
> its toilets in 49.7 s (v19), 90 % of the budget and past the UK's 45.2 s,
> so it is chunked into its **47 prefectures** like the US into states, every
> one selected by `ISO3166-2` code (`JP-01` … `JP-47`, v21's mechanism).
> Measured 2026-09-05 from the Mac: no prefecture above 22.1 s on either
> query (Hiroshima's sweep; Tokyo 9.0 s / 12.4 s with 576 objects and 4,460
> toilets), 293 s of sweep and 144 s of count time over the 47; their 2,225
> objects and 31,948 toilets match the whole-country numbers of 2026-09-04 to
> within a day's edits, so the chunks cover the country. Three prefectures
> hold a single changing_table object (Kochi, Tokushima, Toyama).
>
> **Display names are the Japanese `name`** (北海道, 東京都, 京都府 …): the row
> labels are endonyms as for Ελλάδα or Україна, the history keys are these
> strings, and every slug is declared in `COUNTRY_SLUGS` (Hepburn without
> macrons — `tokyo`, `osaka`, `hokkaido`; kanji fold to nothing in
> `slugify`). The country page is `nihon.html`, a hub over the 47 prefecture
> pages, **in JIS X 0401 code order, north to south** — the one hub whose
> chunk pages are not sorted by name (`CHUNK_HUBS_IN_CONFIG_ORDER`), because
> kanji have no alphabet a reader expects.
>
> **Japanese is the 32nd page language:** a `STRINGS.ja` block and `ja-JP`
> locale in `web/i18n.js`, `methods-ja.html`, `L["ja"]` in `pages_l10n` (with
> `AMENITY`, months "1月"…"12月" and the date form `{y}年{m}{d}日`) and in
> `leaderboard_strings` (`leaderboard-ja.html`), `LANG_HOME_CC["ja"] = "jp"`.
> Japanese inflects nothing and puts the place before の, so both name forms
> are the bare name ("東京都のおむつ交換台", "東京都を地図で開く"). Per v16's
> rule every multilingual cluster lists all 32: `index.html`'s hreflang
> block, the 31 existing methods pages' hreflang + language nav, and the
> sitemap's three clusters (index, methods, leaderboards) gain `ja`. The
> leaderboard sentence gains a fourth chunk clause, `cl_prefectures` ("the
> {j} Japanese prefectures"), in all 32 languages; 32 methods pages name
> Japan in the coverage sentence.
>
> **No change to the emitted shape:** `area_key` becomes `countries_49`,
> `history.json` region keys grow 137 → 184, and the `status` vocabulary is
> untouched. Nightly cost: 184 sweeps + a seventh of 184 counts + 62 cities
> ≈ 270 queries, about a third above the pre-rota night; the 02:00 cron
> keeps roughly an hour and three quarters before the ops mail.

> **v21 amendment (5 Sep 2026, wave 2 — the United States and Canada, chunked):**
> papamap.de sweeps **48 countries** — v19's 46 plus `us ca`, the two of the
> world's top six by pins that die whole (v19's timings: the US on both
> queries at the ~60 s cutoff, Canada's count at the 56 s timeout). They join
> the way Germany and France did, as `admin_level=4` chunks: the US as its
> **50 states plus the District of Columbia** (51 areas), Canada as its
> **10 provinces and 3 territories** (13). The five US territories (Puerto
> Rico, Guam, the US Virgin Islands, American Samoa, the Northern Mariana
> Islands) are level 4 too and deliberately absent, like France's overseas
> régions — an allowlist, not a subdivision.
>
> **A third way to select an area.** Every chunk is selected by its
> **`ISO3166-2` code** (`config.AREA_SELECTORS`, consulted by `_area_ql`
> before the `name` / `name:en` rule of v11), never by name: a level-4
> "Florida" is also a department of Uruguay, and a name sweep would have put
> Uruguayan pins on the Florida page; Quebec, New Brunswick and Nunavut would
> have needed `name:en` on top ("Québec", "New Brunswick / Nouveau-Brunswick",
> "ᓄᓇᕗᑦ Nunavut"). The display name — the history key, the row label, the
> page slug — is the English name, as for the ring.
>
> **Measured 2026-09-05 from the Mac, slot waits separated out:** every one
> of the 64 areas answers both queries inside the budget, the slowest being
> Maryland's sweep at 26.5 s and Colorado's count at 23.3 s; California is
> 20.9 s on both (1,338 objects, 11,723 toilets). The 64 sweeps sum to 656 s
> of query time, the 64 counts to 419 s. The Northwest Territories hold **no
> changing_table object at all** (59 toilets) — the first swept area with an
> empty object sweep; the v15 zero-objects check passes on its toilet count,
> and the v20 rota recounts an empty sweep every night by design.
>
> **HTML surface:** `united-states.html` and `canada.html` are English hubs
> over 51 state and 13 province pages, the shape `france.html` has over its
> régions (`render_hub` over `pages_l10n.HUB` and `CHUNK_FORMS`, keyed by
> country code). The leaderboard's regions table gains 64 rows; its sentence
> gains two clauses in 31 languages ("the {s} US states and DC", s counted
> without the District, and "the {p} Canadian provinces and territories") and
> its heading for the chunked case becomes generic ("German states, regions
> and whole countries"). The site's copy counts 48; 31 methods pages name
> the two countries; the JSON-LD lists them; the sitemap grows by 66 URLs.
> **No change to the emitted shape:** `area_key` becomes `countries_48`,
> `history.json` region keys grow 73 → 137, and the `status` vocabulary is
> untouched. Nightly cost: 137 sweeps + a seventh of 137 counts + 62 cities
> ≈ 220 queries, the pre-rota level of the 46-country night (80 min).

> **v20 amendment (5 Sep 2026, the toilets-count rota):** the two per-area
> `amenity=toilets` counts behind `stats.local.toilets_total` and
> `capacity_tagged_toilets` (and the toilets column on every area page) are
> no longer fetched every night. Each area is recounted **one night a week**,
> staggered by a hash of its name so about a seventh of the areas is due on
> any night, and the last count is kept in **`web/data/toilets_counts.json`**
> (`{"areas": {name: {total, capacity, level, query, date}}}` — `level` the
> admin_level and `query` a 12-hex-digit hash of the count query, both of
> which must match tonight's or the entry is recounted; an entry without
> them is simply recounted) — state next to `history.json`, written last,
> after the pages and the history, never read by the frontend, and never
> allowed to fail a build (a cache that cannot be written is a WARN). It is
> served like `history.json` is, at `/data/toilets_counts.json`: public ODbL
> aggregates and a query hash, nothing else. Two smaller changes ride along:
> a zero toilets total is never cached (every swept area has mapped toilets,
> so a zero is a mirror without the area, healed the next night as before);
> and `generated_at` — and with it every page's date and the history's day —
> is read once at the **start** of the build rather than its end, so the
> rota's entry dates and the history's day come from one clock read. So those numbers are a sum of per-area counts each at
> most seven days old; the object sweep, and every count the frontend renders
> from the GeoJSON, stay nightly. Two guarantees carry over unchanged: an area
> whose sweep answers with no elements is always recounted that night, so
> the v15 zero-objects check still compares two answers fetched tonight, never
> a cached number; and a count query answering one number instead of two
> still fails the area. Only a two-count answer is written to the cache — the
> empty body a mirror without an area database returns is (0, 0) for tonight,
> as before, but is not remembered.
> `PAPAMAP_TOILETS_COUNTS_PERIOD_DAYS=1` restores the every-night behaviour.
> **The emitted shape does not change.** The reason: the count is the slower
> of an area's two queries in the big areas (UK 45.2 s, Japan 49.7 s) and the
> number that moves least, and halving the nightly query count is what makes
> room for the chunked US and Canada sweeps of the next wave.

> **v19 amendment (4 Sep 2026, the first non-European wave):** papamap.de
> sweeps **46 countries** — v15's 44 plus `au nz`, each **one whole
> `admin_level=2` area selected on `name:en`** like the ring (New Zealand's
> `name` is "New Zealand / Aotearoa"). Both get English `COUNTRY_PAGES`
> entries (`australia.html`, `new-zealand.html`). The rule that let them in
> and keeps the rest out: a country joins above **250 pins** (objects whose
> `changing_table` is not `no`) by a per-country count of the whole planet
> taken before any sweep, and only if both nightly queries answer inside the
> budget whole or chunked. The count ranks the world outside Europe US 3,298
> / AU 1,393 / JP 1,170 / CA 700 / CN 306 / NZ 284, and the timings say the
> US dies whole on both queries, Canada's count times out and Japan counts in
> 49.7 s — so those three wait for chunking and are not part of this
> amendment. The frontend drops its Europe-only `maxBounds` (a box holding
> both hemispheres constrains nothing); the site's copy counts 46 and says
> "plus Australia and New Zealand" where it used to say "44 European". No
> change to the emitted shape: `area_key` becomes `countries_46`, every key
> and the `status` vocabulary are untouched.

> **v18 amendment (24 Aug 2026, `outdoor` is a dad-accessible token):**
> `ACCESSIBLE_TOKENS` gains `outdoor` — an open-air table has no room to be
> locked out of, so it classifies `accessible`. The value earned its way in
> the agreed order: papamap refused to invent tagging through its theme
> (14 Aug), Metzor documented `outdoor` on `Key:changing_table:location`
> (wiki, de/en/fr, 24 Aug), and only then did the token land here. The
> MapComplete theme gains the matching answer option and its colour regexes
> the alternation; all 31 methods pages list the new token. Worldwide usage
> at adoption: ~5 objects, so no visible dataset shift. No change to the
> emitted shape — the `status` vocabulary and every key are untouched.

> **v17 amendment (23 Aug 2026, every swept country gets a page):** the HTML
> surface catches up with v15's sweep: `COUNTRY_PAGES` covers all 43 non-German
> countries, so `web/wickeltische/` gains 33 pages in 23 new page languages —
> `pages_l10n.L` grows 8 → **31**, the same set the leaderboard and the map UI
> already speak. Non-Latin-script names (Ελλάδα, Україна, България, Беларусь,
> Северна Македонија, Србија, Црна Гора, Κύπρος) take an explicit slug from
> `config.COUNTRY_SLUGS` — the romanization their readers type — because
> `slugify` folds those scripts to nothing. Three navigation fixes ride along:
> every generated page's back row links its language's leaderboard
> (`pages_l10n.board_file`), every leaderboard's second link goes to
> `LANG_HOME_CC`'s country page instead of the hardcoded German index, and the
> area pages print help + sibling/country navigation ABOVE the named-places
> table instead of below its hundreds of rows. **The emitted data shape does
> not change** — this is HTML surface only, like v14.

> **v16 amendment (22 Aug 2026, central key locks, scoped):** v5 dropped every
> object carrying a `centralkey` tag other than `no`. That rule was written
> for the German Euro key, where the locked object is normally the single
> accessible cubicle; UK practice breaks it — a toilet block with open male
> and female sections plus a RADAR-key (`centralkey=nks`) disabled cubicle is
> commonly mapped as **one** object (`access=yes` +
> `wheelchair:access=centralkey` + `centralkey=nks`), so the table is
> reachable without the key unless it sits in that cubicle (raised by Robert
> Whittaker, 22 Aug 2026; 28 UK objects were dropped, 13 of them of this
> shape). From v16 the key locks the table only when **`access=centralkey`**
> (the key gates the whole object), or **`changing_table:location` names only
> `wheelchair_toilet`**, or **nothing scopes the key to a sub-part** — the
> scoping tags are `wheelchair:access=centralkey` and `male=yes` /
> `female=yes`. Every other `centralkey` object is an ordinary feature,
> `unknown` until someone records the room. `classify()` therefore takes the
> object's tag dict (third argument) instead of the bare `centralkey` value;
> `centralkey_locked(tags, location=None)` is the single home of the rule and
> `stats.centralkey_locked` keeps its meaning (key-locked drops that would
> otherwise be pins). No change to the emitted shape.

> **v15 amendment (22 Aug 2026, Europe complete):** papamap.de sweeps
> **44 countries** — the eleven of v13 plus every remaining European
> sovereign: `no fi is ie ee lv lt lu li ad mc sm mt es pt it gr cy si sk hu
> hr ro bg rs ba me al mk xk md ua by` (ISO 3166-1 alpha-2; Kosovo is the
> user-assigned `xk`). Each is **one whole `admin_level=2` area selected on
> `name:en`**, extending v11's rule to the whole list — several would break
> on `name` outright ("Ireland / Éire", "Україна"). Germany and France stay
> the only chunked countries. Vatican City is deliberately absent: an area
> with zero `changing_table` **and** zero `amenity=toilets` objects is
> indistinguishable from a failed sweep (`run.py`'s zero-objects check), so
> it cannot join under the current pipeline semantics.
>
> **The emitted shape does not change.** No new feature property, no new
> `stats.json` field, no new file. `area_key` becomes `countries_44`, the
> form v11 contracted and the frontend parses. Region keys in `history.json`
> grow 38 → **71** (16 Länder + 13 régions + 42 whole countries); the set
> stays open, as v13 already required.
>
> **Retraction — v13's implication that overseas territory stays out.**
> France's five overseas régions are excluded by the `FRANCE_REGIONS`
> allowlist, and v13 presented that as the pattern. It does not generalise:
> Spain and Portugal answer **whole**, so the Canary Islands (27.6°N), Ceuta,
> Melilla, Madeira and the Azores (−31.3°W) are *in* the dataset by the same
> mechanism that keeps Guadeloupe out of it — the shape of the OSM relation,
> not a papamap policy. The frontend's `maxBounds` widened to
> `[[-32, 27], [41, 71.5]]` so every swept pin stays pannable-to; the
> France exclusion stands only because its allowlist predates this and its
> removal would re-litigate v13 for no reader benefit.
>
> **UI languages grow nine → 31**, keeping v13's rule that every swept
> country gets at least one of its official languages: the 22 additions are
> `bs ca et es hr is lv lt hu no pt ro sq sk sl fi el be bg mk sr uk` (sr in
> Cyrillic; `no` is Bokmål, with `nb`/`nn` browser tags aliased to it in
> `pickLang`). Skipped on the Romansh precedent — every speaker reads another
> UI language: Luxembourgish, Maltese, Irish, Montenegrin, and Turkish for
> Cyprus. Each language is a `STRINGS` block plus its own `methods-<code>.html`;
> `index.html`'s hreflang block, `sitemap.xml` and the methods pages'
> cross-links must list exactly the same 31 (the sitemap's two multilingual
> clusters and every methods page's hreflang + language nav are generated
> from one table, not hand-typed). The leaderboard renders one page per
> language too (`pipeline/leaderboard_strings.py` is the translation table;
> de/en keep `rangliste.html`/`leaderboard.html` so inbound links survive,
> the rest are `leaderboard-<code>.html`, and every page carries v14's
> country-code column). The 33 new countries join the sweep **without**
> `COUNTRY_PAGES` entries, so v14's per-country pages still cover only the
> eleven — extending them is its own amendment once the page translations
> exist. The site's copy counts the set ("44 European countries") instead
> of naming it everywhere except the JSON-LD `spatialCoverage`, which
> enumerates for machines.

> **v14 amendment (21 Aug 2026, area pages for every country):** the build's
> HTML output grows from the German set to one page per swept area: the v3
> Bundesland pages and their index stay exactly as they were, and every other
> swept country now gets **one page in its own language** under its
> local-name slug (`danmark.html` in Danish, `belgie.html` in Dutch,
> `cesko.html` in Czech, `oesterreich.html`/`schweiz.html` in German,
> `united-kingdom.html` in English …), while France gets `france.html` — a
> French hub in the role /wickeltische/ plays for the Länder — plus 13
> per-région pages in French. Routing and the inflected name forms live in
> `config.COUNTRY_PAGES` and `pipeline/pages_l10n.py`; a country's page is
> written whenever that country's sweep is complete, so a
> `PAPAMAP_COUNTRIES=dk` build writes `danmark.html` and nothing German.
> All slugs are pinned in `tests/test_pages.py` and hand-listed in
> `web/sitemap.xml`, as before. The map's footer link is language-routed to
> match (`regions`/`regionsHref` in `web/i18n.js`): the Danish UI links
> danmark.html, the French UI france.html, German keeps the Bundesland
> index. **The data files do not change**: no new feature property, no new
> `stats.json` field, no change to history.json — this amendment is HTML
> surface only.

> **v13 amendment (19 Aug 2026, the UK and France, and nine UI languages):**
> papamap.de sweeps **eleven countries** — the nine of v12 plus **United
> Kingdom** and **France** — because `docker-compose.yml` now sets
> `PAPAMAP_COUNTRIES=de,dk,be,nl,at,ch,cz,pl,se,gb,fr`. Codes are ISO 3166-1
> alpha-2, so the UK is `gb`. `config.DEFAULT_COUNTRIES` still stays `de,dk`;
> the v12 reasoning is unchanged and unrepeated.
>
> **The emitted shape does not change.** No new feature property, no new
> `stats.json` field, no new file. `area_key` becomes `countries_11`, which is
> the `countries_<n>` form v11 already contracted and the frontend already
> parses with `/^countries_(\d+)$/`. This amendment exists for the three
> statements it has to retract, not for a shape change.
>
> **Retraction 1 — v11's "France is deliberately left out".** v11 states that
> France needs a per-région area list before it can join. It has one:
> `config.FRANCE_REGIONS`, the 13 metropolitan régions at `admin_level=4`,
> selected on `name` and **not** `name:en` (which is `Bourgogne – Franche-Comté`
> with an en dash and `Ile-de-France` without the accent). It is an allowlist,
> not a subdivision — the five overseas régions are `admin_level=4` as well.
> Measured 19 Aug 2026: France whole is an empty reply at 60.14 s; the slowest
> région is Auvergne-Rhône-Alpes at 27.1 s.
>
> **Retraction 2 — v6's "`regions`: the 16 Länder + `Danmark`".** History keys
> and leaderboard rows are, and always were, the sweep-area names verbatim. With
> a second chunked country that is 16 Länder + 13 French régions + the nine
> countries swept whole = **38 region keys**. France never appears as a key;
> "France" exists only as a `COUNTRY_LABELS` value inside `area_name`. Anything
> reading `history.json` must treat the region set as open, which it already
> had to after v11.
>
> **Retraction 3 — v2's "a `da*` browser language auto-selects Danish (nothing
> else does)".** Every language is auto-detected now. `pickLang` reads the
> browser's full ordered preference list, matches on the primary subtag only
> (`en-GB`, `de-AT`, `fr-CH` all match), and falls through unsupported entries
> instead of stopping. Precedence is unchanged: `?lang=` beats the stored
> choice beats the browser. The known cost, which v2 named as the reason not to
> do this: a German reader on an English browser now lands on English until
> they pick once.
>
> **Nine UI languages** — `de en da nl fr it cs pl sv`, one per official
> language of the eleven countries with a monolingual readership, plus English.
> `i18n.js`'s `LANGS` is the source of truth; `index.html`'s hreflang block,
> `sitemap.xml` and the `methods-*.html` set must list exactly the same nine.
> Each language ships a `methods-<code>.html`; the leaderboard stays a DE/EN
> pair and every other language borrows the English page, as Danish already
> did. `nextLang()` is **removed** — nine languages are picked from a
> `<select>`, not cycled — and the `langButton` string key is replaced by
> `langName`, each language's own endonym.

> **v12 amendment (18 Aug 2026, the deployment sweeps the ring):** papamap.de
> now sweeps **nine countries** — Deutschland, Danmark, Belgium, Netherlands,
> Austria, Switzerland, Czechia, Poland, Sweden — because `docker-compose.yml`
> sets `PAPAMAP_COUNTRIES=de,dk,be,nl,at,ch,cz,pl,se` on the `pipeline`
> service. First run under it: the 04:30 cron of 19 Aug 2026. This is the
> operator flipping the variable v11 below deliberately left unflipped, so
> v11's "papamap.de builds exactly what it built yesterday" now reads as the
> statement about the code default that it always was.
>
> **`config.DEFAULT_COUNTRIES` stays `de,dk`**, deliberately and not by
> oversight. A `git clone` and `pytest -v` must keep building exactly what they
> built yesterday: the default is what a stranger and the offline test suite
> get, and neither should inherit a sweep this deployment chose — nine areas
> cost nine areas' worth of Overpass rounds, and a fixture-backed test suite has
> no business tracking the operator's country list. The environment variable is
> where the deployment speaks, `config.py` is where the repo does. So
> `stats.json` carries `area_key: "countries_9"` (v11) on the live site and
> `"de_dk"` in a checkout, and consumers must tolerate both.
>
> **Site copy is corrected to match the deployment, not the default** — the
> `<meta>` description, the JSON-LD **`spatialCoverage`**, the three methods
> pages (DE/EN/DA) and the `metaDescription` strings in the i18n bundle now say
> nine European countries / neun europäischen Ländern / ni europæiske lande.
> This is not cosmetic: a map that claims Germany and Denmark while plotting
> Poland is simply lying to the reader, and `methods.html` exists precisely to
> be the honest account of what the site did.
>
> **The methods pages' play-corner counts now come from `stats.json`** instead
> of standing in the prose. 828 / 111 / 701 (v9, v10) were measured on DE+DK on
> 17 Aug 2026 and stopped describing the served dataset the night the ring was
> swept; a hardcoded number nobody rebuilds is worse than no number. The pages
> read `local.play_tables` and `local.play_places` from the file the stats
> strip already loads. **828 is not derivable from `stats.json`**: it counts
> every object passing the play rule, pin or not, while the file records only
> the pins (`play_tables`) and the prospects (`play_places`) — two different
> questions that must never be added up (v10). The sentence was therefore
> rewritten to use those two numbers alone rather than reconstruct a total the
> data contract does not carry.

> **v11 amendment (18 Aug 2026, neighbouring countries):** seven more countries
> are selectable through `PAPAMAP_COUNTRIES` — `be` Belgium, `nl` Netherlands,
> `at` Austria, `ch` Switzerland, `cz` Czechia, `pl` Poland, `se` Sweden — each
> a single `admin_level=2` area, the way Denmark has answered since v2 rather
> than the way Germany has to be chunked. **The default is still `de,dk`**:
> this makes the countries *available*, and papamap.de builds exactly what it
> built yesterday until the operator flips the variable.
>
> The seven are selected on **`name:en`**, not `name`
> (`config.NAME_EN_AREAS`, applied by `config.area_name_key()`). A country's
> `name` is whatever its own mappers write, and for two of the neighbours that
> is several languages at once: Belgium is `België / Belgique / Belgien`,
> Switzerland `Schweiz/Suisse/Svizzera/Svizra`. `area["name"="Belgium"]`
> resolves to nothing, and `run.py` can only read a zero-object area as a
> failed sweep — the build would burn all six rounds and then die complaining
> about a stale mirror. `name:en` is exact on all seven, and resolved for all
> 25 European countries probed on 18 Aug 2026. Germany and Denmark keep `name`
> on purpose: `Deutschland` and `Danmark` are also the region keys in
> `history.json`, so selecting them by another tag would orphan every baseline
> already recorded.
>
> Because the sweep selects them by their English name, that is also the string
> they carry everywhere else: `Belgium`, `Netherlands`, `Austria`,
> `Switzerland`, `Czechia`, `Poland`, `Sweden` in `COUNTRY_LABELS`, in
> `history.json`, and as leaderboard rows beside `Bayern` and `Danmark`. The
> label always names the area actually queried, and Belgium and Switzerland
> have no single endonym to use instead. The Bundesland pages are unaffected —
> `pages.py` only writes pages for names in `BUNDESLAENDER`, so a swept country
> produces none.
>
> **`area_key` in `stats.json` gains the form `countries_<n>`** for three or
> more countries (`countries_9` for all nine). One and two countries are
> untouched, so `de`, `dk` and `de_dk` keep meaning what they meant. This
> amends both the v2 amendment below and the `"de_dk | de | dk | null"` in the
> data contract further down, which are now `"de_dk | de | dk | countries_<n> |
> null"`. A count rather than a key per set, because nine joined labels
> overflow the stats strip anyway, and a key per set would cost three new
> translations every time a country is added — where a count costs one string
> per language, ever. `area_name` is unchanged: still the labels joined with
> " & ", still the verbatim fallback for consumers that don't know the key.
>
> **France is deliberately left out.** 7,739 `changing_table` objects (measured
> 18 Aug 2026) — about twice the UK's 3,707, and the UK's single-area sweep
> already spent 38.7 s of the 55 s `[timeout:55]` budget. France needs a
> per-région area list, the way Germany needs its 16 Länder, before it can join
> the list.

> **v10 amendment (17 Aug 2026, places to play):** the build emits a second
> dataset, **`web/data/play_places.geojson`** (`PAPAMAP_PLAY_GEOJSON_PATH`) —
> the objects that pass the v9 play-area rule and carry **no `changing_table`
> tag at all**. `changing_table=no` is excluded on purpose: someone answered,
> and the answer was no. Feature `properties`: `osm_type`, `osm_id`, `name`,
> `kind` (the first of `leisure`/`amenity`/`shop`/`tourism`/`healthcare` the
> object carries), `opening_hours`, `osm_url`, `mapcomplete_url`. **No
> `status`, no `changing_table`** — nobody has answered the first question, so
> there is nothing to colour them by, and a fourth status value would have
> broken the leaderboard, the Bundesland pages and the stats, all of which
> count changing tables and must keep doing so. Measured 17 Aug 2026: **701**
> such objects in DE+DK.
>
> It costs **no extra Overpass query**. `config.sweep_ql()` replaces
> `changing_table_ql` in the nightly build with a union of the changing_table
> clause and four play-area clauses, and `osm.split_sweep()` sorts the answer
> back into the two halves by tag; a second query would have cost a whole ~40 s
> slot per area for a few hundred objects nationwide (measured on Hamburg: 222
> changing_table objects, 15 play-only, 147 kB for the union). The QL value
> regex is generated from `classify.PLAY_AREA_VALUES`, so the query cannot
> drift from the rule, and it is a *prefilter* — `has_play_area` is re-applied
> in Python because QL cannot express "an explicit `kids_area:indoor=no`
> overrules a bare `kids_area=yes`". `pipeline.backfill` keeps the narrow
> `changing_table_ql`: attic queries already take ~3 min per Land and the
> leaderboard has only ever counted tables.
>
> `local` stats gain **`play_tables`** (pins that also have a play corner) and
> **`play_places`** (prospects) — two different questions, never to be added
> up; both skip coordless objects, like every other feature-facing counter. The
> map draws the prospects as hollow blue rings under a fifth chip, off by
> default, and `theme/papamap.theme.json` gains a third layer
> (`dad_play_place`) so their MapComplete deep links land on a selectable
> object whose first question is "does this place have a changing table?" —
> plus a `kids-area` question on the amenity layer, which is the half that
> grows the data.

> **v9 amendment (17 Aug 2026, play corners):** every feature gains a boolean
> **`play`** property — true when the object also records an indoor place for
> the kid to play, by any of `kids_area:indoor` or `kids_area` in {`yes`,
> `indoor`, `designated`}, `leisure=indoor_play`, or `leisure=playground` +
> `indoor=yes` (`pipeline/classify.py::has_play_area`). `outdoor`, `no` and
> `limited` are excluded on purpose (the wiki defines `limited` as "toys are
> available, but no designated area"), and an explicit `kids_area:indoor=no`
> overrules a bare `kids_area=yes`, which says nothing about indoor or outdoor.
> It costs no new Overpass query: the sweep already asks for every tag on these
> objects. The map draws it as an Okabe-Ito blue **halo** under the
> pin, and the chip bar gains a fourth chip that *narrows* to those places.
>
> `play` is a badge, never a status, and the distinction is load-bearing.
> `changing_table:location` can honestly render a grey "nobody has answered
> this" pin because the object is known to have a table, so the silence is a
> question. A missing `kids_area` is silent across ~13k pins and asks nothing —
> so there is no third state, no grey, no call to action, and the filter starts
> **off** and subtracts rather than starting on like the three status chips.
> Rendering it as a fourth status would claim every other pin has no play area,
> which OSM never said. Measured 17 Aug 2026: 828 objects in DE+DK pass the
> rule (222 via `kids_area:indoor`, 213 indoor `leisure=playground`, 199
> `leisure=indoor_play`, 194 bare `kids_area`) and 111 of them are already pins
> — 48 accessible, 13 female_only, 50 unknown. The other 717 have a play area
> and no changing-table answer at all.

> **v8 amendment (16 Aug 2026, sortable leaderboard):** the leaderboard tables
> are emitted as `<thead>`/`<tbody>`, every cell carrying its sort value in
> `data-v` (the raw number, or the DIN-5007 folded name) beside the German
> text, and each header its `data-sort` (num/text) and `data-first` (which way
> it opens). An inline script — no external file, no state stored, nothing
> loaded — upgrades the headers into buttons at runtime, so a reader with
> JavaScript blocked sees the same complete table, sorted by Δ points as
> before, and no dead controls. Two rules the sorter must keep: a cell with no
> value (no baseline to compare) sorts last in **both** directions, and a
> measured 0 is a number that does not; rank opens ascending though it is
> numeric, because #1 belongs on top.

> **v7 amendment (15 Aug 2026, mirror freshness):** every Overpass answer is
> checked against its own `osm3s.timestamp_osm_base`; a database older than
> `PAPAMAP_OVERPASS_MAX_DATA_AGE_H` (default 24 h) is a **stale mirror** — the
> answer is discarded, the mirror skipped without retries, and the next one
> tried. Prompted by overpass.kumi.systems serving a database frozen on
> 2026-05-31 with HTTP 200 and no remark: on busy nights the cascade handed it
> whole Länder, and every one silently lost two months of mapping — a data bug
> on the map and a false "mover" on the leaderboard. Attic queries are checked
> the same way (a frozen mirror can't answer any date after its freeze). The
> backfill's own lesson: attic queries over a whole Land take ~3 min on the
> main instance even off-peak, so `pipeline.backfill` runs on the VPS with
> `PAPAMAP_OVERPASS_QL_TIMEOUT=300`, never from a laptop behind the 60 s cutoff.

> **v6 amendment (14 Aug 2026, leaderboard):** the full default build now also
> maintains **`web/data/history.json`** — one entry per build day with
> `[accessible, female_only, unknown]` triples per region (`regions`: the 16
> Länder + `Danmark`) and per city (`cities`: the curated `CITY_AREAS` list in
> `pipeline/config.py`, membership via one ids-only Overpass query per city) —
> and renders two pages from it: `wickeltische/rangliste.html` (German) and
> `wickeltische/leaderboard.html` (English), ranked by the **change of the
> answered share** (accessible + female_only over total) in percentage points
> against a snapshot ≥ 7 days back. Change, not level, on purpose: absolute
> counts measure mapping thoroughness, and the Bundesland index explicitly
> refuses to rank them. A same-date re-run replaces its history entry (builds
> stay idempotent); city sweep failures degrade to a WARN and a city-less day,
> never a failed build; partial builds (`PAPAMAP_AREA_NAME`, country subsets)
> write no history at all. `python -m pipeline.backfill YYYY-MM-DD ...` seeds
> past days from Overpass attic (`[date:...]`) queries through the same
> classify/dedup path; it never overwrites an existing day.

> **v5 amendment (14 Aug 2026, central key locks):** objects with a
> `centralkey` tag other than `no` (the Euro key and similar central key
> systems) are not features at all — the key is issued only against proof of
> disability, so whatever room the table is in, the map's audience can't open
> the door. `classify()` returns None for them before any coloring, and the
> `local` stats block gains **`centralkey_locked`**: the number of key-locked
> objects that would otherwise be pins (coordless and `changing_table=no`
> objects don't count into it). The v0 classification rule below is amended
> accordingly; ~174 DE+DK objects (2.7%) leave the map with this change.

> **v4 amendment (12 Aug 2026, changeset attribution):** every MapComplete
> link on the site — `mapcomplete_url` on **all** features including
> `amenity=toilets`, and the add-a-place link — now opens PapaMap's own theme
> via `theme.html?userlayout=<raw URL of theme/papamap.theme.json>` instead of
> the official toilets theme. Reason: MapComplete stamps changesets with a
> `theme` tag, so edits made through the site become countable (the official
> theme would tag them `theme=toilets`, indistinguishable from any other
> MapComplete user). The v0 `mapcomplete_url` rule below is superseded.
> Because the theme is now load-bearing for every pin and only exists in this
> repo, `python -m pipeline.theme_check` (weekly CI + on theme changes)
> validates it against MapComplete's published schema and checks the raw URL
> still serves it.

> **v3 amendment (4 Aug 2026, Bundesland pages):** the build now emits HTML as
> well as data. `python -m pipeline.run` writes one static German page per
> Bundesland plus an index into `PAPAMAP_PAGES_DIR` (default `web/wickeltische/`,
> served at `/wickeltische/<slug>.html`), generated by `pipeline/pages.py` from
> the same features the map gets. Which Land an object belongs to is recorded
> during the sweep — the GeoJSON is unchanged and still carries no region field,
> so the data contract below still holds. A build that sweeps no German Land
> writes no pages. The pages are German-only and carry no hreflang alternates,
> like the legal pages; their 17 URLs are fixed and listed by hand in
> `web/sitemap.xml`. The map reads `?bbox=minLon,minLat,maxLon,maxLat` (invalid
> → home view) so those pages can link into it at a Land's extent; the canonical
> stays `https://papamap.de/`.

> **v2 amendment (4 Aug 2026, Denmark):** the sweep is now per-country
> (`PAPAMAP_COUNTRIES`, default `de,dk`). Germany keeps the 16-Land chunking
> below; Denmark answers whole as one `admin_level=2` area (`Danmark` —
> 933 changing_table + 4,655 toilet objects, 14.5 s measured, Grønland and
> Føroyar excluded by that relation). `stats.json` gains **`area_key`**
> (`"de_dk"` / `"de"` / `"dk"`, or `null` for a hand-named build; v11 adds
> `"countries_<n>"` for three or more countries) next to
> `area_name`: consumers translate the key when they know it and print
> `area_name` verbatim otherwise. The site is now trilingual DE/EN/**DA** —
> the language button cycles DE → EN → DA, a `da*` browser language auto-
> selects Danish (nothing else does), and each language owns a methods page.
> The map opens on a Germany+Denmark viewport.

> **v1 amendment (30 Jul 2026, Germany-wide):** the default build now sweeps all 16
> Bundesländer (`admin_level=4`) and merges + dedups the results — ~13k changing_table +
> ~32k toilet objects. One all-Germany area query was measured to die at a 60 s
> network-path idle cutoff, so the sweep stays chunked and each query keeps
> `[timeout:55]`; a `runtime error` remark in an HTTP-200 Overpass response is treated as
> a retryable failure. `PAPAMAP_AREA_NAME`/`_ADMIN_LEVEL` still select a single area;
> `PAPAMAP_DISPLAY_AREA` names the dataset (default `Deutschland`). The map opens on a
> Germany viewport with a locate button and an add-a-place flow (deep links out to
> MapComplete / the OSM editor). The data contract below is unchanged. City references
> below are the v0 build history.

Binding spec for all build agents. Read fully before writing code. Reference implementation for
patterns: the author's `beer-map` repo (same deploy target). The prior-art sweep and the
potty-parity spike this build rests on are private research notes and are not part of this repo —
everything needed to build is specified below.

## What v0 is

A static map of places with a baby changing table (Hamburg first), colored by whether a dad can
reach the table, with an honest stats strip and deep links that turn data gaps into OSM
contributions. **OSM is the only data source and the only write destination. We own no data.**
Nightly pipeline: Overpass → classify → GeoJSON + stats JSON → static site. No API, no accounts,
no database (SQLite optional as throwaway cache only — not required for v0).

## Repo layout & file ownership (one owner per file — do not touch other agents' files)

- `pipeline/` + `tests/` + `requirements*.txt` — **Agent A (pipeline)**
- `web/` except `web/methods.html` — **Agent B (frontend)**
- `README.md`, `LICENSE` (MIT, © Jakub Waller), `docs/DEPLOY.md`, `web/methods.html` — **Agent C (docs)**
- `theme/` — **Agent D (MapComplete theme)**

## Data contract (A produces, B consumes — this is the interface, do not deviate)

`web/data/changing_tables.geojson` — FeatureCollection, Point geometries (ways/relations via
Overpass `out center`). Feature `properties`:

```json
{
  "osm_type": "node|way|relation",
  "osm_id": 123,
  "name": "string or null",
  "amenity": "toilets|cafe|restaurant|... or null",
  "changing_table": "yes|limited",
  "location_raw": "raw changing_table:location value or null",
  "status": "accessible|female_only|unknown",
  "play": "true|false|null — indoor play area recorded (v9); false is an answered 'none' or an outdoor leisure=playground (v30, v31), null is unanswered",
  "wheelchair": "yes|limited|no|null — the place's wheelchair tag verbatim (v26); null also means unrecorded",
  "toilets_wheelchair": "yes|limited|no|null — toilets:wheelchair verbatim (v26)",
  "wheelchair_description": "string or null — wheelchair:description verbatim (v26)",
  "key": "string or null — the centralkey value when the key locks the table (v5 rule); such a feature is not a pin (v26)",
  "fee": "string or null",
  "opening_hours": "string or null",
  "osm_url": "https://www.openstreetmap.org/<type>/<id>",
  "mapcomplete_url": "string or null"
}
```

`web/data/play_places.geojson` — same FeatureCollection shape, the v10 dataset
of places with a play area and no changing-table answer — or, since v27, the answer
`no`. Feature `properties`:

```json
{
  "osm_type": "node|way|relation",
  "osm_id": 123,
  "name": "string or null",
  "kind": "cafe|indoor_play|mall|... or null",
  "changing_table": "\"no\" (answered: no table, v27) or null (nobody has answered)",
  "wheelchair": "yes|limited|no|null — as on the tables (v28)",
  "toilets_wheelchair": "yes|limited|no|null — as on the tables (v28)",
  "wheelchair_description": "string or null — as on the tables (v28)",
  "opening_hours": "string or null",
  "osm_url": "https://www.openstreetmap.org/<type>/<id>",
  "mapcomplete_url": "string or null"
}
```

`web/data/stats.json`:

```json
{
  "generated_at": "ISO-8601 UTC",
  "area_name": "Hamburg",
  "area_key": "de_dk | de | dk | countries_<n> | null",
  "local": {
    "toilets_total": 443, "ct_objects": 213, "ct_yes": 85, "ct_no": 127, "ct_limited": 1,
    "yes_location_known": 17, "yes_location_unknown": 68,
    "accessible": 0, "female_only": 0, "unknown": 0,
    "play_tables": 0, "play_places": 0, "play_places_no": 0,
    "capacity_tagged_toilets": 2
  },
  "global": {
    "ct_total": 77287, "location_total": 3659,
    "location_female_only": 485, "location_male_only": 71, "location_male_any": 410,
    "source": "taginfo", "data_until": "date string"
  }
}
```

(Numbers above are the 26 Jul 2026 values — illustrative, pipeline computes fresh ones.)

`"global"` is object-or-null: it is `null` only on a cold start where taginfo is unreachable
and no previous stats.json exists to carry forward. Consumers must tolerate `null` there.

## Classification rule (pure function, unit-tested)

Input: `changing_table` value + `changing_table:location` value (may be null/free text).
Only objects with `changing_table` ∈ {yes, limited} are features; `no` counts only in stats.
Split location on `;`, trim, lowercase → tokens. EXACT token matching (never substring —
`female_toilet` contains `male`!):
- ACCESSIBLE_TOKENS = {male_toilet, unisex_toilet, dedicated_room, room, wheelchair_toilet, sales_area, outdoor}
- any token ∈ ACCESSIBLE_TOKENS → `accessible`
- else if any token == female_toilet → `female_only`
- else (no location tag, or only unrecognized/free-text tokens) → `unknown`

## Pipeline requirements (Agent A)

- Python 3.9+, every module starts `from __future__ import annotations`. Deps: `requests` only
  (dev: `pytest`). Follow beer-map's `pipeline/osm.py` patterns: Overpass mirror list env
  `OVERPASS_URLS` with retry/backoff on transient statuses, identifying UA
  `papa-map/0.1 (+https://papamap.de; papamap@jakubwaller.eu)`.
- Overpass queries (area = env `PAPAMAP_AREA_NAME`, default `Hamburg`, `admin_level=4` — keep both
  configurable): (1) `nwr["changing_table"](area)` with `out tags center;` (2)
  `nwr["amenity"="toilets"](area)` count + capacity-tag scan (`toilets:num_chambers*` presence)
  for the honesty stat. Global stats from taginfo API
  (`/api/4/key/stats?key=changing_table`, `/api/4/key/values?key=changing_table:location&rp=999...`
  — compute female_only exact, male_only exact, male_any = values containing the male_toilet
  token after `;`-splitting).
- `python -m pipeline.run` = one idempotent build writing both JSON files. Any single upstream
  failure (taginfo down) degrades gracefully (keep last stats.json, log WARN) — never a half-
  written file (write temp + atomic rename).
- `mapcomplete_url`: for `amenity=toilets` objects:
  `https://mapcomplete.org/toilets?z=18&lat=<lat>&lon=<lon>#<osm_type>/<osm_id>` (verify the
  fragment format against MapComplete docs/source if feasible; if unverifiable, still emit — the
  lat/lon params alone land the user next to the feature). Other amenities: null.
- Tests offline only: stub the HTTP layer with recorded fixture JSON (create fixtures from small
  handwritten samples covering every classification branch + a way-with-center + free-text
  location + `02`-style junk values). No live network in tests.

## Frontend requirements (Agent B)

- Copy `web/vendor/` (maplibre-gl.js/.css) from beer-map. Same OSM raster style + attribution,
  Hamburg center. No build step, no npm deps, vanilla ES modules.
- Pins colored by `status`: accessible=green, female_only=red, unknown=grey (colorblind-safe
  shades; grey visually prominent — it's the call to action). Legend + count badges. Filter
  toggles per status. Popup: name/amenity/table info + two links: "Answer on MapComplete" (if
  mapcomplete_url) and "View on OSM" — **every interpolated string goes through `esc()`**
  (OSM data is attacker-controlled; copy beer-map's esc).
- Stats strip above map from stats.json: local (X tables, Y unknown-room → "tap grey pins"),
  global ratio (female-room vs male-room), honesty line ("N toilets mapped here, capacity tags:
  ~2 — provision itself is unmeasurable; see methods"). Link to `methods.html`.
- `datasource.js` = pure functions (load/filter/count) with `node --test` tests in `web/*.test.js`
  (same pattern as beer-map).
- English UI, one German tagline ok. Title: "PapaMap Hamburg — Wickeltische, die Väter erreichen".
- Serve check: `python3 -m http.server -d web` must work with no console errors.

## Methods page (Agent C, `web/methods.html`)

Self-contained HTML (minimal inline CSS, no JS deps). Content (sourced from the private research
notes): why a provision scorecard is impossible from OSM (the 8-city spike + capacity-tag numbers),
the changing_table:location skew as the one computable potty-parity fact, what the colors mean,
how to fix a grey pin (StreetComplete quest — note it's disabled by default; MapComplete), data
licence (ODbL, © OpenStreetMap contributors), and that this site stores nothing itself. Honest,
sourced, no advocacy overclaim. README covers: what/why, quickstart, cron example, link to
DEPLOY.md (Pi + Caddy static file_server, modeled on beer-map's deploy but static-only).

## MapComplete theme (Agent D, `theme/`)

`theme/papamap.theme.json` — a MapComplete custom theme: layer over `amenity=toilets` (+
`changing_table=*` on other amenities if feasible) showing changing-table status with our
green/red/grey logic, asking (established tags only, in EN + DE): changing_table yes/no,
changing_table:location (the approved value list), changing_table:fee. A clearly-separated
optional question group for the *proposed* keys `toilets:num_chambers:female/:male` (numeric,
labeled as draft schema). RESEARCH the current theme JSON format first (MapComplete docs/repo —
it moved to source.mapcomplete.org, GitHub mirror pietervdvn/MapComplete has Docs/) and validate
structure against a real bundled theme (e.g. the toilets theme JSON). `theme/README.md`: exactly
how to load a custom theme in 2026 (studio vs userlayout URL), what was verified vs needs a live
OSM-login test. If full validation is impossible offline, say so explicitly in the README —
do not silently ship something unloadable as if tested.

## Global rules

- Match beer-map's code style (comment density, naming). No frameworks, no TypeScript.
- The pipeline never writes to OSM. The frontend writes only on a logged-in reader's
  behalf — OAuth 2 with PKCE in the browser, the reader's own account, one element per
  changeset tagged `created_by=PapaMap` (`web/osm.js`, v25) — and derives nothing from
  what it wrote: the nightly build stays the only path from OSM into the map. Links out
  to MapComplete/StreetComplete/iD remain for everything the in-page answer does not cover.
- Domain `papamap.de` is a placeholder — mark it as such in docs.
- Do not `git commit` — the orchestrator handles commits.
