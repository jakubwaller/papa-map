import json
from pathlib import Path
import re

from pipeline import leaderboard, pages
from pipeline.config import BUNDESLAENDER, PAGES_BASE_PATH


def feat(osm_id, name=None, status="unknown", amenity="toilets", lon=8.8, lat=53.1,
         osm_type="node"):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"osm_type": osm_type, "osm_id": osm_id, "name": name,
                       "amenity": amenity, "status": status},
    }


# ---- Slugs: these are public URLs, so they are pinned, not derived in the test.

def test_every_bundesland_gets_the_expected_slug():
    assert [pages.slugify(n) for n in BUNDESLAENDER] == [
        "baden-wuerttemberg", "bayern", "berlin", "brandenburg", "bremen",
        "hamburg", "hessen", "mecklenburg-vorpommern", "niedersachsen",
        "nordrhein-westfalen", "rheinland-pfalz", "saarland", "sachsen",
        "sachsen-anhalt", "schleswig-holstein", "thueringen",
    ]


def test_slugs_are_unique():
    assert len({pages.slugify(n) for n in BUNDESLAENDER}) == len(BUNDESLAENDER)


def test_umlaut_sorts_with_its_base_letter():
    # A raw codepoint sort strands Ärztehaus after Zoo, which is not the order
    # a German reader scans a 300-row table in.
    names = ["Zoo", "Ärztehaus", "Apotheke", "Öl-Mühle", "Obstladen"]
    assert sorted(names, key=pages.sort_key) == [
        "Apotheke", "Ärztehaus", "Obstladen", "Öl-Mühle", "Zoo"]


def test_german_number_and_date_formatting():
    assert pages.de_num(5962) == "5.962"
    assert pages.de_num(0) == "0"
    assert pages.de_date("2026-08-04T21:10:40+00:00") == "4. August 2026"
    # A missing/malformed generated_at must not take the whole build down over
    # a date line.
    assert pages.de_date(None) == ""
    assert pages.de_date("nonsense") == ""


# ---- Area attribution

def test_group_by_area_keeps_the_sweep_that_found_it_first():
    # An object on a Länder boundary comes back from two sweeps; run.py records
    # the first and dedup_elements() keeps that same copy for the map, so the
    # page and the pin must agree on which Land it belongs to.
    features = [feat(1), feat(2), feat(3)]
    area_by_key = {("node", 1): "Bremen", ("node", 2): "Niedersachsen",
                   ("node", 3): "Bremen"}
    grouped = pages.group_by_area(features, area_by_key)
    assert sorted(grouped) == ["Bremen", "Niedersachsen"]
    assert [f["properties"]["osm_id"] for f in grouped["Bremen"]] == [1, 3]


def test_group_by_area_drops_features_from_areas_it_has_no_record_of():
    # Danish features are in the same geojson but must never land on a
    # Bundesland page.
    grouped = pages.group_by_area([feat(1), feat(9)], {("node", 1): "Bremen"})
    assert list(grouped) == ["Bremen"]
    assert len(grouped["Bremen"]) == 1


# ---- Summaries

def test_summarize_counts_statuses_and_groups_chains():
    features = [
        feat(1, "dm", "unknown", amenity=None),
        feat(2, "dm", "accessible", amenity=None),
        feat(3, "dm", "unknown", amenity="pharmacy"),   # minority amenity value
        feat(4, "Café Mitte", "female_only", amenity="cafe"),
        feat(5, None, "unknown"),
        feat(6, "   ", "unknown"),                       # whitespace name = unnamed
    ]
    s = pages.summarize("Bremen", features, toilets_total=443)
    assert s["slug"] == "bremen"
    assert s["tables"] == 6
    assert (s["accessible"], s["female_only"], s["unknown"]) == (1, 1, 4)
    assert s["toilets_total"] == 443
    assert s["unnamed"] == 2 and s["named_places"] == 4
    # 181 identical "dm" rows would read as generated filler; the count says the
    # same thing in one row.
    assert [g["name"] for g in s["named"]] == ["Café Mitte", "dm"]
    dm = s["named"][1]
    assert dm["count"] == 3
    assert dm["amenity"] is None          # the majority value across branches
    assert dm["statuses"] == {"accessible": 1, "female_only": 0, "unknown": 2}


def test_summarize_handles_a_land_with_no_features():
    s = pages.summarize("Bremen", [], toilets_total=0)
    assert s["tables"] == 0 and s["named"] == [] and s["bbox"] is None
    # The percentage line divides by tables — a zero must not raise.
    html = pages.render_land(s, [s], "2026-08-04T00:00:00+00:00")
    assert "keinen einzigen" in html


def test_bbox_refuses_to_span_the_antimeridian(capsys):
    # New Zealand's relation reaches the Chatham Islands at 176°W. A plain
    # min/max over such features is a box the wrong way round the planet,
    # which parseBbox accepts and fitBounds renders as the whole world; the
    # page must rather have no map link at all — and say so in the build
    # log, because a page that quietly lost its button looks intentional.
    nz = [feat(1, "Wellington", "accessible", lon=174.78, lat=-41.29),
          feat(2, "Waitangi", "unknown", lon=-176.56, lat=-43.95)]
    assert pages.summarize("New Zealand", nz, 0)["bbox"] is None
    err = capsys.readouterr().err
    assert "WARN New Zealand" in err and "antimeridian" in err
    assert pages._bbox(nz[:1]) is not None
    assert capsys.readouterr().err == ""


def test_bbox_pads_and_never_collapses_to_a_point():
    single = pages.summarize("Bremen", [feat(1, lon=8.8, lat=53.1)], 0)
    west, south, east, north = single["bbox"]
    assert west < 8.8 < east and south < 53.1 < north
    spread = pages.summarize(
        "Bremen", [feat(1, lon=8.5, lat=53.0), feat(2, lon=8.9, lat=53.2)], 0)
    assert spread["bbox"][0] < 8.5 and spread["bbox"][2] > 8.9


# ---- Rendering

GEN = "2026-08-04T21:10:40+00:00"


def render_one(features, name="Bremen", toilets=443):
    s = pages.summarize(name, features, toilets)
    return s, pages.render_land(s, [s], GEN)


def test_land_page_carries_one_h1_a_canonical_and_the_counts():
    s, html = render_one([feat(1, "Café Mitte", "accessible", amenity="cafe"),
                          feat(2, None, "unknown")])
    assert html.count("<h1") == 1
    assert f'<link rel="canonical" href="https://papamap.de{PAGES_BASE_PATH}bremen.html">' in html
    assert "<title>Wickeltische in Bremen — PapaMap</title>" in html
    assert 'lang="de"' in html
    # The one number the whole site is about has to be on the page as text.
    assert "Wickeltische in Bremen" in html
    assert "Café Mitte" in html
    # No icon means the browser asks for /favicon.ico, which this site does not
    # serve — a 404 in the console of every generated page.
    assert pages.ICON in html


def test_pages_carry_a_social_card_in_their_own_language():
    """Until 2026-08-25 the generated pages had no og:* at all, so Mastodon and
    Discourse fell back to title + description and unfurled a text-only card.
    Everything but the picture is the page's own metadata; the picture is per
    language because the app's chrome is baked into the screenshot."""
    _, de = render_one([feat(1, "Café Mitte", "accessible", amenity="cafe")])
    assert '<meta property="og:title" content="Wickeltische in Bremen — PapaMap">' in de
    assert (f'<meta property="og:url" content="https://papamap.de'
            f'{PAGES_BASE_PATH}bremen.html">') in de
    assert '<meta property="og:image" content="https://papamap.de/og-image.jpg?v=' in de
    assert '<meta name="twitter:card" content="summary_large_image">' in de

    from pipeline.config import COUNTRY_PAGES
    from pipeline.pages_l10n import L
    lang, name, name_in, name_for = COUNTRY_PAGES["gb"]
    en = pages.render_area({
        "lang": lang, "summary": pages.summarize(name, [feat(1, "Legoland")], 7),
        "name_in": name_in, "name_for": name_for,
        "back": [(L[lang]["back_map"], "../")],
    }, GEN)
    # A German picture under an English page is the mismatch the apex already
    # has, so every non-German language takes the English render instead.
    assert '<meta property="og:image" content="https://papamap.de/og-image-en.jpg?v=' in en
    assert "/og-image.jpg" not in en
    assert f'<meta property="og:title" content="{pages.esc(L[lang]["title"].format(name_in=name_in))}">' in en


def test_social_card_image_exists_for_every_page_language():
    """A card that points at a missing file unfurls worse than no card: the
    scraper shows a broken image rather than falling back to text."""
    from pipeline.config import COUNTRY_PAGES
    web = Path(__file__).resolve().parent.parent / "web"
    langs = {lang for lang, *_ in COUNTRY_PAGES.values()} | {"de"}
    wanted = {pages.OG_IMAGE.get(lang, pages.OG_IMAGE_FALLBACK) for lang in langs}
    for f in sorted(wanted):
        assert (web / f).is_file(), f


def test_land_page_deep_links_into_the_map_at_its_own_extent():
    s, html = render_one([feat(1, lon=8.5, lat=53.0), feat(2, lon=8.9, lat=53.2)])
    m = re.search(r'href="\.\./\?bbox=([-\d.,]+)"', html)
    assert m, "no bbox map link on the page"
    assert [float(v) for v in m.group(1).split(",")] == s["bbox"]


def test_land_page_links_the_other_laender_but_not_itself():
    summaries = [pages.summarize(n, [feat(i)], 0)
                 for i, n in enumerate(("Bremen", "Hamburg", "Berlin"))]
    html = pages.render_land(summaries[0], summaries, GEN)
    assert 'href="hamburg.html"' in html and 'href="berlin.html"' in html
    assert 'href="bremen.html"' not in html


def test_osm_names_are_escaped():
    # Place names come from OpenStreetMap, which anyone can edit.
    hostile = '<script>alert(1)</script>'
    s, html = render_one([feat(1, hostile, "unknown", amenity='" onload="x')])
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert ' onload="x' not in html


def test_jsonld_block_is_valid_json_and_cannot_break_out():
    s, html = render_one([feat(1, "Café Mitte")])
    block = re.search(r'<script type="application/ld\+json">(.*?)</script>',
                      html, re.S).group(1)
    data = json.loads(block.replace("<\\/", "</"))
    assert data["@type"] == "BreadcrumbList"
    assert data["itemListElement"][-1]["name"] == "Bremen"


def test_index_page_lists_every_land_it_was_given():
    summaries = [pages.summarize(n, [feat(i)], 10 * i)
                 for i, n in enumerate(BUNDESLAENDER)]
    html = pages.render_index(summaries, GEN)
    for s in summaries:
        assert f'href="{s["slug"]}.html"' in html
        assert f">{s['name']}</a>" in html
    assert html.count("<h1") == 1


def test_write_pages_writes_an_index_plus_one_file_per_land(tmp_path):
    summaries = [pages.summarize(n, [feat(i)], 0) for i, n in enumerate(BUNDESLAENDER)]
    written = pages.write_pages(summaries, str(tmp_path), GEN)
    assert len(written) == len(BUNDESLAENDER) + 1
    assert (tmp_path / "index.html").exists()
    assert (tmp_path / "baden-wuerttemberg.html").exists()
    assert (tmp_path / "thueringen.html").exists()
    # Rewritten nightly, so a second run must produce byte-identical files
    # rather than reshuffling dict order into a pointless diff.
    before = (tmp_path / "bayern.html").read_bytes()
    pages.write_pages(summaries, str(tmp_path), GEN)
    assert (tmp_path / "bayern.html").read_bytes() == before


def test_sitemap_lists_exactly_the_generated_pages():
    # The sitemap is hand-maintained (the 16 names are a fixed list) while the
    # pages are generated — this is what keeps the two from drifting into
    # sitemap entries that 404.
    from pathlib import Path
    xml = (Path(__file__).resolve().parents[1] / "web" / "sitemap.xml").read_text(
        encoding="utf-8")
    listed = set(re.findall(
        rf"<loc>https://papamap\.de{re.escape(PAGES_BASE_PATH)}([a-z-]+)\.html</loc>", xml))
    from pipeline.config import COUNTRY_PAGES, FRANCE_REGIONS
    generated = ({pages.slugify(n) for n in BUNDESLAENDER}
                 | {pages.slugify(n) for _, n, _, _ in COUNTRY_PAGES.values()}
                 | {pages.slugify(r) for r in FRANCE_REGIONS}
                 | {tab["file"].removesuffix(".html")
                    for tab in leaderboard.L.values()})
    assert listed == generated
    assert f"<loc>https://papamap.de{PAGES_BASE_PATH}</loc>" in xml


# ---- Country and région pages (21 Aug 2026): every swept country gets a page
# in its own language, France a hub plus 13 région pages in French.

def test_country_and_region_slugs_are_pinned():
    # Public URLs, so pinned, not derived. The slug comes from the LOCAL name
    # ("België" → belgie), never from the English sweep selector.
    from pipeline.config import COUNTRY_PAGES, FRANCE_REGIONS
    assert {pages.slugify(name) for _, name, _, _ in COUNTRY_PAGES.values()} == {
        "danmark", "belgie", "nederland", "oesterreich", "schweiz", "cesko",
        "polska", "sverige", "united-kingdom", "france",
        # The Europe-complete ring (23 Aug 2026). The non-Latin script names
        # take their slug from config.COUNTRY_SLUGS — the romanization their
        # own readers type, not an English exonym.
        "norge", "suomi", "island", "ireland", "eesti", "latvija", "lietuva",
        "luxembourg", "liechtenstein", "andorra", "monaco", "san-marino",
        "malta", "espana", "portugal", "italia", "ellada", "kypros",
        "slovenija", "slovensko", "magyarorszag", "hrvatska", "romania",
        "balgariya", "srbija", "bosna-i-hercegovina", "crna-gora",
        "shqiperia", "severna-makedonija", "kosova", "moldova", "ukrayina",
        "bielarus",
        # The first non-European wave (2026-09-04), English pages.
        "australia", "new-zealand"}
    assert [pages.slugify(r) for r in FRANCE_REGIONS] == [
        "auvergne-rhone-alpes", "bourgogne-franche-comte", "bretagne",
        "centre-val-de-loire", "corse", "grand-est", "hauts-de-france",
        "ile-de-france", "normandie", "nouvelle-aquitaine", "occitanie",
        "pays-de-la-loire", "provence-alpes-cote-d-azur"]
    # No collision with the Bundesland slugs or each other.
    from pipeline.config import BUNDESLAENDER as BL
    all_slugs = ([pages.slugify(n) for n in BL]
                 + [pages.slugify(n) for _, n, _, _ in COUNTRY_PAGES.values()]
                 + [pages.slugify(r) for r in FRANCE_REGIONS])
    assert len(all_slugs) == len(set(all_slugs))


def test_french_region_forms_cover_exactly_the_regions():
    from pipeline.config import FRANCE_REGIONS
    from pipeline.pages_l10n import FRANCE_REGION_FORMS
    assert set(FRANCE_REGION_FORMS) == set(FRANCE_REGIONS)


def test_write_all_pages_writes_each_country_in_its_own_language(tmp_path):
    from pipeline.config import FRANCE_REGIONS
    areas = ([(n, "4") for n in BUNDESLAENDER]
             + [("Danmark", "2"), ("Switzerland", "2"),
                ("United Kingdom", "2")]
             + [(r, "4") for r in FRANCE_REGIONS])
    features = [feat(1), feat(2, "Legoland", "accessible", amenity="cafe"),
                feat(3, "Pub & Co", "unknown", amenity="pub"),
                feat(4, "Crêperie", "female_only", amenity="cafe")]
    area_by_key = {("node", 1): "Bremen", ("node", 2): "Danmark",
                   ("node", 3): "United Kingdom", ("node", 4): "Bretagne"}
    toilets = {name: 7 for name, _ in areas}
    written = pages.write_all_pages(areas, features, area_by_key, toilets,
                                    str(tmp_path), GEN)
    names = sorted(Path(p).name for p in written)
    # 16 Länder + index + 3 countries + france.html + 13 régions.
    assert len(names) == len(set(names)) == 16 + 1 + 3 + 1 + 13

    da = (tmp_path / "danmark.html").read_text(encoding="utf-8")
    assert 'lang="da"' in da
    assert "<h1>Pusleborde i Danmark</h1>" in da
    assert "Legoland" in da
    assert 'href="../methods-da.html"' in da  # Danish footer + methods link
    # The shared country list links the other pages, never itself.
    assert 'href="united-kingdom.html"' in da and 'href="schweiz.html"' in da
    assert 'href="danmark.html"' not in da
    assert 'href="./"' in da  # Deutschland row in the country list

    en = (tmp_path / "united-kingdom.html").read_text(encoding="utf-8")
    assert 'lang="en"' in en
    assert "<h1>Changing tables in the United Kingdom</h1>" in en
    assert "The numbers for the United Kingdom" in en
    assert "Pub &amp; Co" in en

    de = (tmp_path / "schweiz.html").read_text(encoding="utf-8")
    assert "<h1>Wickeltische in der Schweiz</h1>" in de   # dative article
    assert "Die Zahlen für die Schweiz" in de             # accusative article

    fr = (tmp_path / "bretagne.html").read_text(encoding="utf-8")
    assert 'lang="fr"' in fr
    assert "<h1>Tables à langer en Bretagne</h1>" in fr
    assert "Les chiffres pour la Bretagne" in fr
    assert 'href="france.html"' in fr                     # back to the hub
    assert "Crêperie" in fr

    hub = (tmp_path / "france.html").read_text(encoding="utf-8")
    assert "Tables à langer en France, par région" in hub
    for r in FRANCE_REGIONS:
        assert f'href="{pages.slugify(r)}.html"' in hub

    land = (tmp_path / "bremen.html").read_text(encoding="utf-8")
    assert "PapaMap in anderen Ländern" in land
    assert 'href="danmark.html"' in land
    index = (tmp_path / "index.html").read_text(encoding="utf-8")
    assert 'href="france.html"' in index

    # Rewritten nightly: a second run must be byte-identical.
    before = (tmp_path / "danmark.html").read_bytes()
    pages.write_all_pages(areas, features, area_by_key, toilets,
                          str(tmp_path), GEN)
    assert (tmp_path / "danmark.html").read_bytes() == before


def test_write_all_pages_without_germany_writes_no_german_pages(tmp_path):
    written = pages.write_all_pages([("Danmark", "2")], [feat(1)],
                                    {("node", 1): "Danmark"},
                                    {"Danmark": 3}, str(tmp_path), GEN)
    assert [Path(p).name for p in written] == ["danmark.html"]
    da = (tmp_path / "danmark.html").read_text(encoding="utf-8")
    # Alone in the build, the page has no other countries to link.
    assert "PapaMap i andre lande" not in da

# ---- 44 countries, 31 page languages (23 Aug 2026) --------------------------

def test_every_page_language_defines_the_country_template_keys():
    # The 28 keys a country page renders from — the "en" entry is the
    # template. de and fr carry extra hub-only keys on top; nobody may carry
    # fewer, or render_area KeyErrors at night in cron.
    from pipeline.pages_l10n import AMENITY, BOARD_LABEL, L
    en_keys = set(L["en"])
    for lang, t in L.items():
        assert en_keys <= set(t), f"missing keys in {lang}: {en_keys - set(t)}"
        assert set(t["statuses"]) == {"accessible", "female_only", "unknown"}, lang
        assert len(t["months"]) == 12, lang
        assert t["methods"] == ("methods.html" if lang == "de"
                                else f"methods-{lang}.html"), lang
        assert set(AMENITY[lang]) == set(AMENITY["en"]), lang
        assert lang in BOARD_LABEL, lang


def test_every_country_page_renders_in_its_own_language(tmp_path):
    # Renders every template of every language with real-shaped data — a bad
    # placeholder in any of the 31 translations fails here, not in the night
    # build. Also the empty state, which formats a different template.
    from pipeline.config import COUNTRY_PAGES
    from pipeline.pages_l10n import L
    for cc, (lang, name, name_in, name_for) in COUNTRY_PAGES.items():
        summary = pages.summarize(name, [
            feat(1, "Legoland", "accessible", amenity="cafe"),
            feat(2, None, "unknown"),
        ], 7)
        html = pages.render_area({
            "lang": lang, "summary": summary,
            "name_in": name_in, "name_for": name_for,
            "back": [(L[lang]["back_map"], "../")],
        }, GEN)
        assert f'lang="{lang}"' in html, cc
        assert "<h1>" in html and "Legoland" in html, cc
        assert "{" not in html.split("<style>")[0], cc  # unformatted leftover
        empty = pages.render_area({
            "lang": lang, "summary": pages.summarize(name, [], 0),
            "name_in": name_in, "name_for": name_for,
            "back": [(L[lang]["back_map"], "../")],
        }, GEN)
        assert f'lang="{lang}"' in empty, cc


def test_area_pages_link_their_own_leaderboard():
    from pipeline.pages_l10n import BOARD_LABEL
    summary = pages.summarize("Danmark", [feat(1)], 3)
    da = pages.render_area({"lang": "da", "summary": summary,
                            "name_in": "i Danmark", "name_for": None,
                            "back": [("Til kortet", "../")]}, GEN)
    assert f'<a href="leaderboard-da.html">{BOARD_LABEL["da"]}</a>' in da
    land = pages.render_land(pages.summarize("Bremen", [feat(1)], 3), [], GEN)
    assert '<a href="rangliste.html">Rangliste</a>' in land


def test_help_and_nav_come_before_the_named_places_table():
    # The named table runs to hundreds of rows in a big Land; everything
    # after it was unreachable (flagged 2026-08-23). Order is content.
    summary = pages.summarize("Bremen", [feat(1, "Legoland", "accessible")], 3)
    html = pages.render_land(summary, [summary], GEN,
                             countries=[{"label": "Danmark",
                                         "href": "danmark.html", "tables": 9}])
    help_pos = html.index("Wie du hier hilfst")
    countries_pos = html.index("PapaMap in anderen Ländern")
    table_pos = html.index("Orte mit Namen")
    assert help_pos < countries_pos < table_pos
