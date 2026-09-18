import test from "node:test";
import assert from "node:assert/strict";
import { locateNative, loadJSONNative } from "./native.js";

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

// ---- citiesToMount ----
import { citiesToMount } from "./native.js";
const HH = { slug: "hamburg", bbox: [9.7, 53.4, 10.3, 53.75] };
const HB = { slug: "bremen", bbox: [8.5, 53.0, 9.0, 53.2] };
const KI = { slug: "kiel", bbox: [10.0, 54.25, 10.25, 54.45] };
const MUC = { slug: "muenchen", bbox: [11.35, 48.05, 11.75, 48.25] };

test("only the cities the view touches are mounted", () => {
  const view = [9.9, 53.5, 10.1, 53.6];
  assert.deepEqual(citiesToMount([HH, HB, MUC], view, { lat: 53.55, lon: 10.0 }, 13).map((c) => c.slug), ["hamburg"]);
  assert.deepEqual(citiesToMount([HB, MUC], view, { lat: 53.55, lon: 10.0 }, 13), []);
});

test("a view over several cities keeps the two nearest its centre", () => {
  const view = [8.0, 52.8, 10.5, 54.6];
  assert.deepEqual(citiesToMount([HB, KI, HH, MUC], view, { lat: 53.6, lon: 10.0 }, 9).map((c) => c.slug),
                   ["hamburg", "kiel"]);
});

test("zoomed out there is no opinion, so nothing is unmounted or read", () => {
  assert.equal(citiesToMount([HH, MUC], [-10, 35, 30, 60], { lat: 50, lon: 10 }, 5), null);
});

// The phone's files and the network, played back: `net` is whether papamap.de
// answers, `files` what is on the phone. Every call is logged.
function fakeIO({ net = true, downloader = true, files = {}, body = { n: 1 }, replaceFails = false } = {}) {
  const io = {
    log: [], files,
    download: async (url, path) => {
      io.log.push(`download ${path}`);
      if (!net || !downloader) throw new Error("download failed");
      files[path] = body;
    },
    read: async (path) => {
      io.log.push(`read ${path}`);
      if (!(path in files)) throw new Error("no such file");
      if (files[path] === "garbage") throw new SyntaxError("not JSON");
      return files[path];
    },
    replace: async (from, to) => {
      io.log.push(`replace ${to}`);
      if (replaceFails) throw new Error("rename failed");
      files[to] = files[from]; delete files[from];
    },
    get: async () => { io.log.push("get"); if (!net) throw new Error("offline"); return body; },
  };
  return io;
}
const COPY = "papamap/data/changing_tables.geojson";

test("online: the download becomes the copy, and the map is drawn from that very file", async () => {
  const io = fakeIO();
  const r = await loadJSONNative("data/changing_tables.geojson?v=1", io);
  assert.deepEqual(r, { json: { n: 1 }, fromStore: false });
  assert.deepEqual(io.files, { [COPY]: { n: 1 } });
  assert.deepEqual(io.log, [`download ${COPY}.new`, `read ${COPY}.new`, `replace ${COPY}`]);
});

test("offline: the stored copy, and it says so", async () => {
  const io = fakeIO({ net: false, files: { [COPY]: { n: 0 } } });
  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io), { json: { n: 0 }, fromStore: true });
});

test("offline with nothing stored is null, not a throw", async () => {
  assert.equal(await loadJSONNative("data/stats.json", fakeIO({ net: false })), null);
});

test("a download that does not parse never replaces the good copy", async () => {
  const io = fakeIO({ body: "garbage", files: { [COPY]: { n: 0 } } });
  io.get = async () => { throw new Error("same garbage"); };
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual(r, { json: { n: 0 }, fromStore: true });
  assert.deepEqual(io.files[COPY], { n: 0 });
  assert.ok(!io.log.includes(`replace ${COPY}`));
});

test("a failing downloader with a network there still draws the live map", async () => {
  const io = fakeIO({ downloader: false, files: { [COPY]: { n: 0 } } });
  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io), { json: { n: 1 }, fromStore: false });
});
