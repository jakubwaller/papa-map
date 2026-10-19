// Tags the commit behind whatever each store has live, so the release tracker
// (fleet-ops/releases.py) can read "newest ios/* / android/* tag" instead of a
// tag someone set by hand. Shared by `asc.mjs live-tags` and `play.mjs live-tags`,
// which only ask their store what is live; everything else is here.
//
//   ios/<version>      App Store 1.3.2, build 472 (CI run 472), live 2026-10-13
//   android/<version>  Google Play 1.3.4, version code 525 (CI run 525), live 2026-10-19
//
// Build number and version code are both app-build.yml's github.run_number, so
// "CI run N" is the run that built it and its head_sha is the commit. Dry run
// unless --push. Only creates tags that are not on origin yet; never moves one.
import { execFileSync } from "node:child_process";

const REPO = process.env.GITHUB_REPOSITORY || "jakubwaller/papa-map";
const WORKFLOW = "app-build.yml";

const KINDS = {
  ios: { store: "App Store", number: "build" },
  android: { store: "Google Play", number: "version code" },
};

// live: [{ version, build }] as the store reports it. Pure: no network, no clock.
export function tagsToCreate(platform, live, existing, today) {
  const { store, number } = KINDS[platform];
  const have = new Set(existing);
  const best = new Map();   // one tag per version: the highest build wins
  for (const l of live) {
    if (!l.version || !/^\d+$/.test(String(l.build))) continue;   // no attached build: nothing to resolve
    if (!best.has(l.version) || Number(l.build) > Number(best.get(l.version).build)) best.set(l.version, l);
  }
  return [...best.values()]
    .map(({ version, build }) => ({
      tag: `${platform}/${version}`, build: String(build),
      message: `${store} ${version}, ${number} ${build} (CI run ${build}), live ${today}`,
    }))
    .filter((t) => !have.has(t.tag));
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

export const remoteTags = () =>
  git("ls-remote", "--tags", "origin").split("\n").map((l) => /refs\/tags\/(.+?)(\^\{\})?$/.exec(l)?.[1]).filter(Boolean);

// run_number → head_sha. The API cannot filter by run number, but the list is
// newest first and numbers only fall, so stop once past it.
export async function runSha(n, { fetch: f = fetch, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN } = {}) {
  for (let page = 1; ; page++) {
    const res = await f(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=100&page=${page}`, {
      headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) throw new Error(`runs page ${page}: ${res.status} ${await res.text()}`);
    const { workflow_runs: runs } = await res.json();
    const hit = runs.find((r) => r.run_number === Number(n));
    if (hit) return hit.head_sha;
    if (!runs.length || runs.at(-1).run_number < Number(n)) return null;
  }
}

export async function liveTags(platform, live, argv) {
  const push = argv.includes("--push");
  const today = new Date().toISOString().slice(0, 10);
  console.log(`${platform} live: ${live.map((l) => `${l.version} (${l.build ?? "no build"})`).join(", ") || "nothing"}`);
  const todo = tagsToCreate(platform, live, remoteTags(), today);
  if (!todo.length) return console.log("no new tags");
  let skipped = 0;
  for (const t of todo) {
    const sha = await runSha(t.build);
    if (!sha) { console.log(`${t.tag}: CI run ${t.build} not found, skipped`); skipped++; continue; }
    console.log(`${push ? "tagging" : "would tag"} ${t.tag} at ${sha.slice(0, 9)}: ${t.message}`);
    if (!push) continue;
    try {
      git("fetch", "origin", sha);   // a PR-label build's branch head may be gone after a squash merge
      git("tag", "-a", t.tag, sha, "-m", t.message);
      git("push", "origin", `refs/tags/${t.tag}`);   // no force: an existing tag is refused, never moved
    } catch (e) {   // a commit this clone does not have, say: log it, the next hour tries again
      console.log(`${t.tag}: ${String(e.message).split("\n")[0]}, skipped`);
      skipped++;
    }
  }
  if (skipped) process.exitCode = 1;   // a permanent skip shows red instead of retrying silently
}
