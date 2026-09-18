import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The Siri answer's tap, read off the Swift it is made of.
//
// There is no Swift test runner in this repo and the thing that broke is not
// a calculation but a choice of API: build 20 returned the app's own
// `papamap://table?osm=…` from `OpenURLIntent`, which is the universal-link
// API, and iOS foregrounded the app and dropped the URL — Siri named the
// table and the map never heard of it, while the widget's identical link
// opened it. So what is guarded here is the choice: that the tap runs an
// intent of the app's own, in the app, and that the slot it hands the link
// through cannot open a table twice or open a stale one.
// Comments dropped: this file is about what the code does, and the comments
// over there name the very API the code must not use.
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const intents = read("./App/App/Intents/NearestTableIntent.swift");
const store = read("./App/App/Shared/TableStore.swift");
const plugin = read("./App/App/PapaMapSharePlugin.swift");

test("the tap opens an intent of the app's own, never a URL intent", () => {
  assert.doesNotMatch(intents, /OpenURLIntent/,
                      "OpenURLIntent is for universal links: papamap:// through it loses the table");
  const opens = intents.match(/opensIntent: \w+/g) ?? [];
  assert.equal(opens.length, 4, "one per answer: no data, no location, none found, found");
  assert.deepEqual([...new Set(opens)], ["opensIntent: OpenTableIntent"]);
  // Found: the deep link goes with it. The other three only bring the app up.
  assert.match(intents, /opensIntent: OpenTableIntent\(link: hit\.table\.deepLink\)/);
  assert.match(intents, /static var openAppWhenRun: Bool = true/, "or perform() never runs in the app");
});

test("the spoken answer is untouched", () => {
  for (const line of ["L.noData(lang: lang)", "L.noLocation(lang: lang)", "L.none(lang: lang)",
                      "L.nearestFound(hit, mode: TableStore.mode, lang: lang)"]) {
    assert.ok(intents.includes(line), line);
  }
});

test("the hand-over slot is emptied before it is judged, so a stale tap cannot wait for a later launch", () => {
  const consume = store.slice(store.indexOf("func consume"));
  const removed = consume.indexOf("removeObject(forKey: PapaMap.pendingTableKey)");
  const judged = consume.indexOf("maxAge");
  assert.ok(removed > 0 && judged > removed,
            "read once and removed whatever its age, and only then checked for freshness");
  assert.match(store, /public static let maxAge/);
  assert.match(store, /guard url\.scheme == "papamap"/, "only the app's own links go in");
});

test("the plugin listens on every moment that can be the first, and delivers as an opened URL", () => {
  for (const name of ["papaMapPendingTable", "capacitorViewDidAppear", "didBecomeActiveNotification"]) {
    assert.ok(plugin.includes(name), name);
  }
  assert.match(plugin, /PendingTable\.consume\(\)/);
  assert.match(plugin, /post\(name: \.capacitorOpenURL, object: \["url": url\]\)/,
               "App's own listener is what web/native.js already reads");
});
