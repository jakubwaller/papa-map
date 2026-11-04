# Walkthrough brief

Input for the exploratory walkthrough skill: an agent with a headless browser uses the live site
as a visitor would and reports what gets in the way. Keep the by-design list current, or the
walk re-reports the same intentional behaviour every time.

## Site

- Live: https://papamap.de (canonical; `www.` and `papamap.jakubwaller.eu` only redirect).
- Languages: follows the browser locale (German otherwise), `?lang=en` (and 30 more) for the rest; area pages under
  `/wickeltische/`, leaderboard at `/wickeltische/leaderboard.html`, methods at `/methods-en.html`.
- What it is: a map of baby changing tables, coloured by whether a dad can reach the room.

## Personas

1. **Trip planner, desktop.** A father in Munich takes his baby to Hamburg next weekend and
   wants to know where around the Alster and in St. Pauli he can change a nappy.
   He has never seen the site and reads it in English.
2. **Dad on the go, phone.** Standing in a German city centre with a crying baby, he needs the
   nearest table he can use, now. He is wary of sharing his location and blocks the prompt.
3. **Returning contributor, phone.** Has used the map before, wants to see how his area is doing
   (My PapaMap, the area page for his Bundesland, the leaderboard) and whether it is worth
   answering a few grey pins this week. He does not log in during the walk.

## Key flows

- Search a place or a station, read a pin's popup, open its route link.
- "Nearest changing table" (Nächster Wickeltisch), with and without location.
- Status chips and the Papa/Mama switch.
- My PapaMap dialog; the footer link to the area page; area pages and their country list.
- Leaderboard, methods page, language switch, share a pin.
- Offline after a first load.

Store app only, skip on a web walk: saving a city for offline use (the button stays hidden
on the website), the first-launch intro and what's new, home-screen widgets and shortcuts.

## By design — do not report

- **Status chips all start on, and a tap hides that status.** The chip bar doubles as the map's
  legend. The play-corner, wheelchair and High chair chips start off and narrow the map when
  switched on. The "Play area only" and "High chair only" ring chips start on, like the status
  chips, and a tap hides those rings.
- Grey pin = a table exists but nobody has recorded which room it is in, not "no table".
- Papa is the default reading; in it a women's-room-only table is orange. Mama is an opt-in.
- Tables behind a Euro (central) key are not pins, and area pages do not count them; they appear
  only under the wheelchair chip, with a key icon.
- Distances are straight-line ("Luftlinie"), rounded to 10 m; there is no walking route.
- "Nearest" ignores the chip filters and visibly switches back on a chip that would hide its
  answer. Its pill hides while a popup is open.
- A world search result (city, street) only moves the map: no marker, no popup. A failing
  world search shows one quiet line in the dropdown, never a toast.
- The footer area link names the area under the map view, not the UI language's country; an
  English reader over Hamburg gets the Germany page in English.
- The leaderboard ranks the change in answered share over a week, not absolute counts.
- My PapaMap's grey-pins-within-1-km clause appears only after locate or nearest was used; the
  dialog never asks for location itself.
- Route on desktop opens openstreetmap.org directions with the start empty; on an iPhone it asks
  which maps app.
- Offline shows pins without a basemap (the OSM tile policy forbids caching tiles).
- A returning browser may see the previous page version once; the service worker refreshes it.
- The website shows no first-launch intro; that is the store app only.

## Out of bounds

The walk must never write to OpenStreetMap or send anything on the visitor's behalf.

- No "Log in with OpenStreetMap", no OAuth redirect.
- No answer buttons in a popup (room, play area, wheelchair, "more" rooms). Opening the popup
  and reading the question is fine; tapping an answer is not.
- Add-a-place: open it and look, never submit.
- No edits in MapComplete or openstreetmap.org if a link leads there.
- Do not send the Feedback mail or complete a Ko-fi payment.
- Search is backed by komoot's free Photon server: type like a person, no bulk queries.
- `/ops.html` and `/private/` are not part of the product.
