// What the store app's copy of index.html must not carry. The website links
// to Ko-fi; the app may not: Apple wants a tip for the developer to go through
// in-app purchase (guideline 3.1.1), and the developer account is declared a
// non-trader on the ground that the app has no purchase and no donate button.
// The link is cut out of the bundled page rather than hidden, so it is not in
// the binary at all.
const DONATE = / · <a href="https:\/\/ko-fi\.com\/[^"]*"[^>]*>[^<]*<\/a>/;

export function appShell(html) {
  const out = html.replace(DONATE, "");
  // A changed footer must fail the build, not ship the link quietly.
  if (out === html) throw new Error("index.html: no Ko-fi link found to remove");
  if (/ko-fi\.com/i.test(out)) throw new Error("index.html: a Ko-fi link is left after the cut");
  return out;
}
