// What the store app's copy of index.html must not carry. The website links
// to Ko-fi; the app may not: Apple wants a tip for the developer to go through
// in-app purchase (guideline 3.1.1), and the developer account is declared a
// non-trader on the ground that the app has no purchase and no donate button.
// The link is cut out of the bundled page rather than hidden, so it is not in
// the binary at all.
//
// The whole span goes, separator included — hiding or cutting the <a> alone
// would leave a dangling " · " in the attribution line. That span is also what
// the website's own pages hide when the app opens them in its in-app browser
// (web/in-app.js, issue #124); here there is nothing to hide, because there is
// nothing left.
const DONATE = /<span class="donate">[\s\S]*?<\/span>/;

export function appShell(html) {
  // A changed footer must fail the build, not ship the link quietly.
  const cut = DONATE.exec(html);
  if (!cut) throw new Error("index.html: no donate span found to remove");
  if (!/ko-fi\.com/i.test(cut[0]))
    throw new Error("index.html: the donate span holds no Ko-fi link");
  const out = html.replace(DONATE, "");
  if (/ko-fi\.com/i.test(out)) throw new Error("index.html: a Ko-fi link is left after the cut");
  if (/class="donate"/.test(out)) throw new Error("index.html: a second donate span is left after the cut");
  return out;
}

// Every file of its own the page loads: <link href>, <script src>, <img src>,
// <source src>, and srcset, without the ?v= pin and without a leading ./ or /
// (the bundle's root is the page's directory). Links to other pages (<a href>)
// are not resources, an absolute URL is fetched from the network, not from the
// bundle, and a tag inside a comment loads nothing.
// build-www.js checks the list against what it copies: until 2026-09-21 it
// only caught a listed file that was missing, never a file the page asks for
// that nobody listed, and manifest.webmanifest 404ed in the app that way.
const COMMENT = /<!--[\s\S]*?-->/g;
const TAG = /<(?:link|script|img|source)\b[^>]*>/gi;
const ATTR = /\s(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

const local = (url) => (REMOTE.test(url) ? null : url.split(/[?#]/)[0].replace(/^(?:\.\/|\/)+/, ""));

// srcset the way the HTML spec reads it: a URL runs to the next whitespace,
// its descriptor to the next comma. Splitting on commas first would tear a
// data: URI at the comma it carries.
function srcsetUrls(value) {
  const urls = [];
  for (const [, url] of value.matchAll(/[\s,]*(\S+)[^,]*/g)) urls.push(url.replace(/,+$/, ""));
  return urls;
}

export function localRefs(html) {
  const refs = new Set();
  for (const [tag] of html.replace(COMMENT, "").matchAll(TAG))
    for (const [, name, dq, sq] of tag.matchAll(ATTR)) {
      const value = dq ?? sq;
      const urls = name.toLowerCase() === "srcset" ? srcsetUrls(value) : [value];
      for (const url of urls) {
        const ref = url && local(url);
        if (ref) refs.add(ref);
      }
    }
  return [...refs];
}

// The other way a file gets loaded: a module importing its neighbour, which
// no tag in the page shows. Static, side-effect and dynamic imports of a
// relative or root-relative path; build-www.js runs it over every script it
// bundles. Comments go first, or prose that quotes a path after the word
// "from" would fail the build over a file nothing imports. A // counts as a
// comment at the start of a line or after whitespace, never inside "https://".
const JS_COMMENT = /\/\*[\s\S]*?\*\/|(?:^|\s)\/\/.*$/gm;
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)(?:"([./][^"]*)"|'([./][^']*)')/g;

export function moduleRefs(js) {
  const refs = new Set();
  for (const [, dq, sq] of js.replace(JS_COMMENT, "").matchAll(IMPORT)) {
    const ref = local(dq ?? sq);
    if (ref) refs.add(ref);
  }
  return [...refs];
}

// The refs neither FILES nor a directory in DIRS covers.
export function unbundled(refs, files, dirs) {
  return refs.filter((r) => !files.includes(r) && !dirs.some((d) => r.startsWith(`${d}/`)));
}
