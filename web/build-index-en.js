// Generates index-en.html: index.html with an English head, everything else
// byte-identical. The container Caddy serves it for /?lang=en
// (deploy/papamap.Caddyfile) because link unfurlers never run the JS that
// swaps the head at load — without this, the English URL cards in German
// (Mastodon/Discord, 2026-08-27).
//
// The English strings come from i18n.js, the same ones app.js renders, so
// there is no second copy to drift. Every substitution below must match
// exactly once or this throws: when the head of index.html changes shape,
// the build fails loudly instead of shipping a half-German card.
//
// Run `node web/build-index-en.js` after editing index.html's head;
// index-en.test.js fails until the committed output matches.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { STRINGS } from "./i18n.js";

// Attribute/text escaping, same minimal set as pages.py's esc. The i18n
// strings are plain prose today; this keeps a future apostrophe-or-ampersand
// edit from producing broken markup.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function subOnce(html, from, to) {
  const i = html.indexOf(from);
  if (i === -1)
    throw new Error(`index.html no longer contains: ${from}`);
  if (html.indexOf(from, i + from.length) !== -1)
    throw new Error(`expected exactly one occurrence of: ${from}`);
  return html.slice(0, i) + to + html.slice(i + from.length);
}

export function buildIndexEn(html) {
  const de = { title: esc(STRINGS.de.title), desc: esc(STRINGS.de.metaDescription) };
  const en = { title: esc(STRINGS.en.title), desc: esc(STRINGS.en.metaDescription) };

  let out = html;
  out = subOnce(out, '<html lang="de">', '<html lang="en">');
  out = subOnce(out, `<title>${de.title}</title>`, `<title>${en.title}</title>`);
  out = subOnce(out,
    `<meta name="description" content="${de.desc}" />`,
    `<meta name="description" content="${en.desc}" />`);
  out = subOnce(out,
    `<meta property="og:title" content="${de.title}" />`,
    `<meta property="og:title" content="${en.title}" />`);
  out = subOnce(out,
    `<meta property="og:description" content="${de.desc}" />`,
    `<meta property="og:description" content="${en.desc}" />`);
  // og:url and canonical name the address this file is served at. app.js
  // rewrites the canonical again at load like on every ?lang= view; the
  // static value is for the crawlers that never run it.
  out = subOnce(out,
    '<meta property="og:url" content="https://papamap.de/" />',
    '<meta property="og:url" content="https://papamap.de/?lang=en" />');
  out = subOnce(out, 'content="https://papamap.de/og-image.jpg?v=',
    'content="https://papamap.de/og-image-en.jpg?v=');
  // Swap the locale with its alternate: en_GB leads, de_DE joins the list.
  out = subOnce(out, '<meta property="og:locale" content="de_DE" />',
    '<meta property="og:locale" content="en_GB" />');
  out = subOnce(out, '<meta property="og:locale:alternate" content="en_GB" />',
    '<meta property="og:locale:alternate" content="de_DE" />');
  out = subOnce(out,
    '<link rel="canonical" href="https://papamap.de/" />',
    '<link rel="canonical" href="https://papamap.de/?lang=en" />');

  // The long explanatory comment describes index.html's own situation;
  // in the generated file the useful thing to say is "generated".
  const commentStart = "<!-- The og:* block above is German:";
  const start = out.indexOf(commentStart);
  const end = out.indexOf("-->", start);
  if (start === -1 || end === -1)
    throw new Error("the og:* comment in index.html moved; update build-index-en.js");
  out = out.slice(0, start) +
    `<!-- GENERATED FILE — do not edit. Built from index.html by
       build-index-en.js; the container Caddy serves it for /?lang=en so link
       unfurlers see an English card. index-en.test.js pins it to its source. -->` +
    out.slice(end + "-->".length);

  return out;
}

// CLI entry point: node web/build-index-en.js
if (process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = new URL(".", import.meta.url);
  const src = readFileSync(new URL("index.html", dir), "utf8");
  writeFileSync(new URL("index-en.html", dir), buildIndexEn(src));
  console.log("wrote web/index-en.html");
}
