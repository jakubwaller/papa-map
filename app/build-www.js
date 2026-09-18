// Copies the map's shell from ../web into www/, which is what Capacitor
// bundles into the native app. Only the shell: the dataset is fetched from
// papamap.de at run time (and kept on the phone by native.js), the country
// pages and the legal pages stay on the website and open in the system
// browser, and sw.js is left out on purpose — a service worker does not run
// under the app's own scheme, and the app keeps its offline copy itself.
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appShell } from "./shell.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const www = join(here, "www");

const FILES = [
  "index.html", "app.js", "datasource.js", "i18n.js", "osm.js", "native.js",
  "style.css", "icon.svg", "taginfo.json",
];
const DIRS = ["vendor", "icons"];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of FILES) {
  const src = join(web, f);
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  cpSync(src, join(www, f));
}
for (const d of DIRS) cpSync(join(web, d), join(www, d), { recursive: true });
// The page itself is the one file that differs from the website: shell.mjs.
writeFileSync(join(www, "index.html"), appShell(readFileSync(join(web, "index.html"), "utf8")));
console.log(`www/ built from ${web}`);
