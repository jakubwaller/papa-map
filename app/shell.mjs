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
