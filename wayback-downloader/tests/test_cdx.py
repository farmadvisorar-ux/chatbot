import pytest

from wayback_downloader.cdx import (
    Snapshot,
    build_cdx_params,
    filter_snapshots,
    parse_cdx_json,
)


def test_parse_cdx_json_empty():
    assert parse_cdx_json([]) == []
    assert parse_cdx_json([["timestamp", "original"]]) == []


def test_parse_cdx_json_basic():
    data = [
        ["timestamp", "original", "statuscode", "digest", "mimetype"],
        ["20200101000000", "http://example.com/", "200", "ABC123", "text/html"],
        ["20200102000000", "http://example.com/about.html", "200", "DEF456", "text/html"],
    ]
    snapshots = parse_cdx_json(data)
    assert len(snapshots) == 2
    assert snapshots[0] == Snapshot(
        timestamp="20200101000000",
        original="http://example.com/",
        statuscode="200",
        digest="ABC123",
        mimetype="text/html",
    )
    assert snapshots[0].archive_url == (
        "https://web.archive.org/web/20200101000000id_/http://example.com/"
    )


def test_parse_cdx_json_skips_incomplete_rows():
    data = [
        ["timestamp", "original"],
        ["20200101000000", ""],
        ["", "http://example.com/"],
        ["20200101000000", "http://example.com/"],
    ]
    snapshots = parse_cdx_json(data)
    assert len(snapshots) == 1


def test_build_cdx_params_defaults():
    params = build_cdx_params("example.com")
    assert params["url"] == "example.com"
    assert params["matchType"] == "domain"
    assert params["filter"] == "statuscode:200"
    assert params["collapse"] == "urlkey"
    assert "from" not in params
    assert "to" not in params


def test_build_cdx_params_exact_and_all_snapshots():
    params = build_cdx_params(
        "example.com/page",
        exact_url=True,
        all_snapshots=True,
        only_status_200=False,
        from_ts="20200101",
        to_ts="20201231",
    )
    assert params["matchType"] == "exact"
    assert "collapse" not in params
    assert "filter" not in params
    assert params["from"] == "20200101"
    assert params["to"] == "20201231"


def _snap(url, **kw):
    return Snapshot(timestamp="20200101000000", original=url, **kw)


def test_filter_snapshots_by_extension():
    snaps = [_snap("http://example.com/a.html"), _snap("http://example.com/b.css"), _snap("http://example.com/c.js")]
    result = filter_snapshots(snaps, extensions=["html", "css"])
    urls = {s.original for s in result}
    assert urls == {"http://example.com/a.html", "http://example.com/b.css"}


def test_filter_snapshots_only_and_exclude_pattern():
    snaps = [
        _snap("http://example.com/blog/post-1"),
        _snap("http://example.com/blog/post-2"),
        _snap("http://example.com/wp-admin/login"),
    ]
    result = filter_snapshots(snaps, only_pattern=r"/blog/")
    assert len(result) == 2

    result = filter_snapshots(snaps, exclude_pattern=r"wp-admin")
    urls = {s.original for s in result}
    assert "http://example.com/wp-admin/login" not in urls
