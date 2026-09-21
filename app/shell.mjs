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
// without the ?v= pin. Links to other pages (<a href>) are not resources, and
// an absolute URL is fetched from the network, not from the bundle.
// build-www.js checks the list against what it copies: until 2026-09-21 it
// only caught a listed file that was missing, never a file the page asks for
// that nobody listed, and manifest.webmanifest 404ed in the app that way.
const REF = /<(?:link|script|img)\b[^>]*?\s(?:href|src)="([^"]+)"/g;

export function localRefs(html) {
  const refs = new Set();
  for (const [, url] of html.matchAll(REF)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) continue;
    refs.add(url.split(/[?#]/)[0]);
  }
  return [...refs];
}

// The refs neither FILES nor a directory in DIRS covers.
export function unbundled(refs, files, dirs) {
  return refs.filter((r) => !files.includes(r) && !dirs.some((d) => r.startsWith(`${d}/`)));
}
