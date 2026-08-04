import json
import re

from pipeline import pages
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
    assert listed == {pages.slugify(n) for n in BUNDESLAENDER}
    assert f"<loc>https://papamap.de{PAGES_BASE_PATH}</loc>" in xml
