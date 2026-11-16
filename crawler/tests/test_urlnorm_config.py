import json

import pytest

from tram_tin.config import ConfigError, load_sources
from tram_tin.fetch import page_url
from tram_tin.urlnorm import clean_url, normalize_url, url_hash


@pytest.mark.parametrize(
    "a,b",
    [
        ("http://www.BBC.com/vietnamese/x/?utm_source=rss&at_medium=feed#top", "https://bbc.com/vietnamese/x"),
        ("https://rfa.org/a?b=2&a=1&fbclid=z", "https://rfa.org/a?a=1&b=2"),
        ("https://nguoi-viet.com:443/", "https://nguoi-viet.com/"),
    ],
)
def test_normalize(a, b):
    assert normalize_url(a) == b
    assert url_hash(a) == url_hash(b)


def test_normalize_keeps_meaningful_query():
    assert url_hash("https://x.test/?p=1") != url_hash("https://x.test/?p=2")


def test_page_url():
    assert page_url("https://x.test/feed/", 1, "wordpress") == "https://x.test/feed/"
    assert page_url("https://x.test/feed/", 3, "wordpress") == "https://x.test/feed/?paged=3"
    assert page_url("https://x.test/feed/", 3, "none") == "https://x.test/feed/"


def _write(tmp_path, data):
    p = tmp_path / "sources.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


def test_load_sources_ok(tmp_path):
    p = _write(tmp_path, {"sources": [{"id": "bbc", "name": "BBC", "type": "rss", "url": "https://b.test/rss"}]})
    [s] = load_sources(p)
    assert (s.id, s.max_pages, s.pagination, s.enabled) == ("bbc", 1, "none", True)


@pytest.mark.parametrize(
    "src,msg",
    [
        ({"id": "BBC", "name": "x", "type": "rss", "url": "https://b"}, "id"),
        ({"id": "a", "name": "x", "type": "html", "url": "https://b"}, "type"),
        ({"id": "a", "name": "x", "type": "rss", "url": "ftp://b"}, "url"),
        ({"id": "a", "name": "x", "type": "rss", "url": "https://b", "max_pages": 99}, "max_pages"),
        ({"id": "a", "type": "rss", "url": "https://b"}, "name"),
    ],
)
def test_load_sources_invalid(tmp_path, src, msg):
    with pytest.raises(ConfigError, match=msg):
        load_sources(_write(tmp_path, {"sources": [src]}))


def test_load_sources_duplicate(tmp_path):
    s = {"id": "a", "name": "x", "type": "rss", "url": "https://b"}
    with pytest.raises(ConfigError, match="trùng"):
        load_sources(_write(tmp_path, {"sources": [s, s]}))


def test_real_config_is_valid():
    from tram_tin.config import DEFAULT_SOURCES_FILE

    ids = [s.id for s in load_sources(DEFAULT_SOURCES_FILE)]
    assert ids == ["bbc", "rfa", "nguoi-viet"]


def test_clean_url_keeps_host_and_meaningful_params():
    u = "http://www.nguoi-viet.com/a/b/?utm_source=rss&utm_medium=rss&p=3#x"
    assert clean_url(u) == "http://www.nguoi-viet.com/a/b/?p=3"
    assert url_hash(clean_url(u)) == url_hash(u)
