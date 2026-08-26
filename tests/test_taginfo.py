import json
from pathlib import Path

from pipeline.config import SITE_BASE_URL

WEB = Path(__file__).resolve().parent.parent / "web"

# The taginfo project file is how mappers looking at changing_table:location on
# taginfo.openstreetmap.org find out that something consumes their answers.
# taginfo fetches it from the live site, so a broken file is only visible there
# — hence these checks run here.


def _project():
    return json.loads((WEB / "taginfo.json").read_text())


def test_taginfo_file_has_what_the_schema_requires():
    d = _project()
    assert d["data_format"] == 1
    assert d["data_url"] == f"{SITE_BASE_URL}/taginfo.json"
    for field in ("name", "description", "project_url", "contact_name",
                  "contact_email"):
        assert d["project"][field], field


def test_taginfo_links_point_at_files_that_exist():
    d = _project()
    for url in (d["project"]["doc_url"], d["project"]["icon_url"]):
        assert url.startswith(SITE_BASE_URL), url
        assert (WEB / url[len(SITE_BASE_URL):].lstrip("/")).is_file(), url


def test_taginfo_lists_the_keys_the_map_is_actually_built_on():
    """These four decide what is shown and how it is coloured. Dropping one
    from the file would leave the project listed against the wrong tags."""
    tags = {(t["key"], t.get("value")) for t in _project()["tags"]}
    for wanted in (("changing_table", None), ("changing_table:location", None),
                   ("amenity", "toilets"), ("centralkey", None)):
        assert wanted in tags, wanted
    assert len(tags) == len(_project()["tags"]), "duplicate key/value entry"
