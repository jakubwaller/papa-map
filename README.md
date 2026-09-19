# papa-map

**PapaMap — Wickeltische, die ein Vater erreicht.**

A map of baby changing tables in 49 countries, colored by whether a dad can get to them.

- **green** — in a men's, unisex, accessible or separate room
- **red** — in the women's room only
- **grey** — the table is mapped, but nobody has recorded which room

The grey pins are the point. Each one links to the same object on MapComplete, or can be
answered right on the map with an OpenStreetMap login, so the missing answer becomes an OSM
edit. OSM is the only data source and the only place anything is written. This repo owns no
data.

Why: Google Maps, Apple Maps and Yelp have no changing-table attribute at all. OSM's
`changing_table:location` is the only open vocabulary anywhere that records which room a table
is in, and globally it records about seven women's-room-only tables for every men's-room-only
one. The full story, with the exact classification rule, is in
[`web/methods.html`](web/methods.html). The idea came from
[*Invisible Women*](https://en.wikipedia.org/wiki/Invisible_Women:_Exposing_Data_Bias_in_a_World_Designed_for_Men)
by Caroline Criado Perez.

Live at [papamap.de](https://papamap.de).

## What else is on the map

- A `Papa` / `Mama` switch. Same data, read from the other side: red becomes green for a mother.
- A "nearest usable table" button. Works in the browser, sends your position nowhere.
- Play corners and places to play, as blue rings. A café with a ball pit is worth a visit anyway.
- A wheelchair filter, which also brings back the Euro-key toilets hidden by default.
- One static page per Bundesland, country and région, in the language people search in.
- A leaderboard that ranks regions by how much their share of answered pins grew in the last week.
- Works offline, except the basemap: the OSM tile policy forbids caching tiles.
- A store app (`app/`, in TestFlight): the same map with a whole city's basemap offline, a Siri shortcut, a home-screen widget and a Control Center button.

How each of these works and why it was built that way: [`docs/FEATURES.md`](docs/FEATURES.md).

## Quickstart

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pipeline.run                 # ~5 min: Overpass -> web/data/*.json + web/wickeltische/
python3 -m http.server -d web 8000     # http://127.0.0.1:8000
```

Python 3.9+. The default build sweeps Germany and Denmark. `PAPAMAP_COUNTRIES=de,dk,at,ch`
picks other countries (ISO codes, the UK is `gb`); papamap.de sets the full list in
`docker-compose.yml`. Use `127.0.0.1`, not `localhost`, if you want to test the OSM login
against the sandbox.

## Tests

```bash
pip install -r requirements-dev.txt
pytest -v                  # pipeline, offline
node --test web/*.test.js  # frontend
```

## Deploy

Static files, no API, no database. A `caddy:2-alpine` container serves `web/`, so `git pull`
is the deploy, and a nightly cron rebuilds the data:

```cron
0 2 * * * cd /path/to/papa-map && docker compose run --build --rm pipeline >> pipeline.log 2>&1
```

Everything else, including the optional ops mail, is in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Licences

Code: MIT (see `LICENSE`). Data: © OpenStreetMap contributors,
[ODbL](https://opendatacommons.org/licenses/odbl/).
