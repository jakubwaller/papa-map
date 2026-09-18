// Copies the map's shell from ../web into www/, which is what Capacitor
// bundles into the native app. Only the shell: the dataset is fetched from
// papamap.de at run time (and kept on the phone by native.js), the country
// pages and the legal pages stay on the website and open in the in-app
// browser, and sw.js is left out on purpose — a service worker does not run
// under the app's own scheme, and the app keeps its offline copy itself.
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appShell } from "./shell.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const www = join(here, "www");

// in-app.js comes along although the bundled page has nothing left for it to
// hide (shell.mjs cuts the span out): index.html loads it from the head, and a
// bundled page that 404s on its own script is a worse trade than a kilobyte.
const FILES = [
  "index.html", "app.js", "datasource.js", "i18n.js", "osm.js", "native.js",
  "in-app.js", "style.css", "icon.svg", "taginfo.json",
];
const DIRS = ["vendor", "icons"];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of FILES) {
  const src = join(web, f);
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  // The page itself is the one file that differs from the website (shell.mjs).
  // It is never copied as it is: a build that fails there leaves no page
  // behind for a later `cap sync` to bundle.
  if (f === "index.html") writeFileSync(join(www, f), appShell(readFileSync(src, "utf8")));
  else cpSync(src, join(www, f));
}
for (const d of DIRS) cpSync(join(web, d), join(www, d), { recursive: true });
console.log(`www/ built from ${web}`);
