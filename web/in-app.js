// The website, read inside the store app.
//
// The app bundles the map itself and nothing else, so every other page —
// a country page, the leaderboard, the methods, the legal pages — is the
// website's, opened in an in-app browser (SFSafariViewController on iOS, a
// Custom Tab on Android; web/native.js, openExternal). Those pages carry the
// Ko-fi link in their footer, and the app may not show one: Apple wants a tip
// for the developer to go through in-app purchase (guideline 3.1.1), and the
// developer account is declared a non-trader on the ground that the app has
// no purchase and no donate link anywhere. Two taps from the map was still
// inside the app (issue #124).
//
// openExternal flags the first URL with ?app=1 — on this site's own origin
// only. From there the reader navigates on ("back to the map", the next
// country) inside the same in-app browser, without the flag, so the answer is
// remembered in sessionStorage: that is exactly session-shaped, because the
// in-app browser's session ends when the reader dismisses it, and a tab in
// their own browser never sees it. Storage can throw outright (private mode,
// site data blocked), hence the try/catch around every access; a page that
// cannot remember still hides the link on the flagged load.
//
// Loaded from <head> as a classic script, so the class is on <html> before
// the first paint and the link is never shown and then taken away. The CSS
// that does the hiding is web/style.css here and pipeline/pages.py's STYLE on
// the generated pages; the app's own bundled page has the markup cut out
// instead (app/shell.mjs). With JavaScript off nothing happens at all and
// the page is the website's, link and all.
(function () {
  var KEY = "papamap-in-app";

  function inApp(search, storage) {
    var seen = false;
    try {
      seen = !!storage && storage.getItem(KEY) === "1";
    } catch (e) { /* no storage to read: treat as not seen */ }
    if (new URLSearchParams(search).get("app") !== "1" && !seen) return false;
    try {
      if (storage) storage.setItem(KEY, "1");
    } catch (e) { /* nothing to remember it with; this load still hides it */ }
    return true;
  }

  var store = null;
  try { store = window.sessionStorage; } catch (e) { /* blocked */ }
  if (inApp(window.location.search, store)) {
    document.documentElement.classList.add("in-app");
  }
})();
