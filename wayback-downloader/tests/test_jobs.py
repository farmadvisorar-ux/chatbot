import zipfile
from unittest.mock import MagicMock, patch

from wayback_downloader.cdx import Snapshot
from wayback_downloader.jobs import Job


def _fake_response(content=b"<html>hi</html>"):
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.content = content
    return resp


def _run_job(params, snapshots):
    job = Job("test123", params)
    with patch("wayback_downloader.jobs.cdx.fetch_snapshots", return_value=snapshots):
        with patch("requests.Session.get", return_value=_fake_response()):
            job.start()
            job._thread.join(timeout=10)
    return job


def test_job_downloads_and_zips_site():
    snapshots = [
        Snapshot(timestamp="20200101000000", original="http://example.com/"),
        Snapshot(timestamp="20200101000000", original="http://example.com/about.html"),
    ]
    params = {"domain": "example.com", "concurrency": 4}

    job = _run_job(params, snapshots)

    assert job.status == "done"
    assert job.total == 2
    assert job.completed == 2
    assert job.zip_path is not None

    with zipfile.ZipFile(job.zip_path) as zf:
        names = zf.namelist()
        assert any(name.endswith("index.html") for name in names)
        assert any(name.endswith("about.html") for name in names)

    job.cleanup()


def test_job_handles_no_matching_snapshots():
    params = {"domain": "example.com", "concurrency": 4}
    job = _run_job(params, [])

    assert job.status == "done"
    assert job.total == 0
    assert job.zip_path is not None
    job.cleanup()


def test_job_applies_extension_filter():
    snapshots = [
        Snapshot(timestamp="20200101000000", original="http://example.com/style.css"),
        Snapshot(timestamp="20200101000000", original="http://example.com/index.html"),
    ]
    params = {"domain": "example.com", "concurrency": 4, "extensions": ["html"]}

    job = _run_job(params, snapshots)

    assert job.total == 1
    assert job.completed == 1
    job.cleanup()


def test_job_can_be_cancelled():
    snapshots = [Snapshot(timestamp="20200101000000", original=f"http://example.com/{i}.html") for i in range(5)]
    params = {"domain": "example.com", "concurrency": 1}

    job = Job("cancel-me", params)
    job.cancel()  # cancel before it even starts pulling snapshots
    with patch("wayback_downloader.jobs.cdx.fetch_snapshots", return_value=snapshots):
        job.start()
        job._thread.join(timeout=10)

    assert job.status == "cancelled"
    job.cleanup()
