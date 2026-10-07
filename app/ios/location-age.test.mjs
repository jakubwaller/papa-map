import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// How old a fix the widget and Siri measure from, read off the Swift.
//
// No Swift test runner here, and CLLocationManager.location is whatever fix
// the system last held, of any age: a widget renewed every half hour kept
// renewing a distance from yesterday's city. The rule is Android's
// (NearestWidget.MAX_FIX_AGE_MS): older than 30 minutes counts as none.
// Comments dropped, so a rule only described in prose does not pass.
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const store = read("./App/App/Shared/TableStore.swift");
const widget = read("./App/PapaMapWidget/PapaMapWidget.swift");
const once = read("./App/App/Shared/LocationOnce.swift");
const android = readFileSync(new URL("../android/app/src/main/java/de/papamap/app/NearestWidget.java", import.meta.url), "utf8");

test("one freshness rule, half an hour, the same as Android's", () => {
  assert.match(store, /public static let maxFixAge: TimeInterval = 30 \* 60/);
  assert.match(android, /MAX_FIX_AGE_MS = 30 \* 60 \* 1000L/);
  assert.match(store, /now\.timeIntervalSince\(loc\.timestamp\) <= maxAge else \{ return nil \}/);
});

test("the widget measures only from a fresh fix it is allowed to use", () => {
  assert.match(widget, /guard manager\.isAuthorizedForWidgetUpdates,\s+let loc = TableStore\.freshFix\(manager\.location\) else/);
  assert.doesNotMatch(widget, /let loc = manager\.location/);
});

test("Siri's fallbacks drop a stale fix too", () => {
  assert.doesNotMatch(once, /finish\((self\?\.)?manager\.location\)/, "every last-known fallback goes through freshFix");
  assert.equal(once.match(/TableStore\.freshFix\(/g)?.length, 3, "cached fast path, timeout, error");
  assert.match(once, /TableStore\.freshFix\(manager\.location, maxAge: 120\)/, "the no-wait path stays at two minutes");
});

test("distances round to 10 m before the unit is picked, as on the map", () => {
  assert.match(store, /let r = \(m \/ 10\)\.rounded\(\) \* 10\s+if r < 1000/);
});
