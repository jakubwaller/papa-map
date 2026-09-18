import test from "node:test";
import assert from "node:assert/strict";
import { locateNative } from "./native.js";

// A Geolocation plugin that plays back fixes: [ms, accuracy in metres].
function fakeGeo(fixes, { permission = "granted" } = {}) {
  const geo = {
    cleared: [],
    checkPermissions: async () => ({ location: permission }),
    requestPermissions: async () => ({ location: permission === "prompt" ? "granted" : permission }),
    watchPosition: async (_opts, cb) => {
      for (const [ms, accuracy] of fixes) {
        setTimeout(() => cb({ coords: { latitude: 53.55, longitude: 9.99, accuracy } }), ms);
      }
      return "watch-1";
    },
    clearWatch: async ({ id }) => { geo.cleared.push(id); },
  };
  return geo;
}
const FAST = { good: 100, soft: 60, hard: 200 };

test("the first fix good to 100 m wins without waiting for a better one", async () => {
  const geo = fakeGeo([[5, 1500], [15, 65], [40, 5]]);
  const c = await locateNative(geo, FAST);
  assert.equal(c.accuracy, 65);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(geo.cleared, ["watch-1"]);
});

test("after the soft limit the best coarse fix is taken", async () => {
  const c = await locateNative(fakeGeo([[5, 1500], [20, 400], [150, 10]]), FAST);
  assert.equal(c.accuracy, 400);
});

test("no fix before the soft limit: the next one to arrive, however coarse", async () => {
  const c = await locateNative(fakeGeo([[90, 800]]), FAST);
  assert.equal(c.accuracy, 800);
});

test("nothing at all fails at the hard limit, and the watch is cleared", async () => {
  const geo = fakeGeo([]);
  await assert.rejects(locateNative(geo, FAST), /timeout/);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(geo.cleared, ["watch-1"]);
});

test("a first-run prompt is asked, a refusal fails without starting a watch", async () => {
  const c = await locateNative(fakeGeo([[5, 20]], { permission: "prompt" }), FAST);
  assert.equal(c.accuracy, 20);
  const denied = fakeGeo([[5, 20]], { permission: "denied" });
  denied.watchPosition = () => { throw new Error("must not watch"); };
  await assert.rejects(locateNative(denied, FAST), /denied/);
});
