import test from "node:test";
import assert from "node:assert/strict";
import { tagsToCreate, runSha } from "./live-tags.mjs";

test("only tags that are missing, with the message the tracker's tags carry", () => {
  const live = [{ version: "1.3.2", build: "472" }, { version: "1.3.3", build: "500" }, { version: "1.4", build: undefined }];
  assert.deepEqual(tagsToCreate("ios", live, ["ios/1.3.2"], "2026-10-19"), [
    { tag: "ios/1.3.3", build: "500", message: "App Store 1.3.3, build 500 (CI run 500), live 2026-10-19" },
  ]);
  assert.equal(tagsToCreate("android", [{ version: "1.3.4", build: "525" }], ["android/1.3.4"], "2026-10-19").length, 0);
  assert.equal(tagsToCreate("android", [{ version: "1.3.5", build: "530" }], [], "2026-10-20")[0].message,
               "Google Play 1.3.5, version code 530 (CI run 530), live 2026-10-20");
});

test("a version with two builds is tagged once, at the highest", () => {
  const t = tagsToCreate("ios", [{ version: "1.3", build: "300" }, { version: "1.3", build: "356" }], [], "d");
  assert.deepEqual(t.map((x) => x.build), ["356"]);
});

test("runSha pages until the run number appears, and gives null past it", async () => {
  const page = (nums) => ({ ok: true, json: async () => ({ workflow_runs: nums.map((n) => ({ run_number: n, head_sha: `sha${n}` })) }) });
  const pages = [page([9, 8]), page([7, 6])];
  assert.equal(await runSha(7, { fetch: async () => pages.shift(), token: "t" }), "sha7");
  const more = [page([9, 8]), page([7, 6]), page([])];
  assert.equal(await runSha(5, { fetch: async () => more.shift(), token: "t" }), null);
});
