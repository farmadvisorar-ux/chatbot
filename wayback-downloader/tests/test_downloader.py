import os
import tempfile
from unittest.mock import MagicMock, patch

from wayback_downloader.cdx import Snapshot
from wayback_downloader.downloader import DownloadJob


def _fake_response(content=b"hello world", status=200):
    resp = MagicMock()
    resp.status_code = status
    resp.content = content
    resp.raise_for_status = MagicMock()
    return resp


def test_download_job_writes_files_and_reports_progress():
    snapshots = [
        Snapshot(timestamp="20200101000000", original="http://example.com/"),
        Snapshot(timestamp="20200101000000", original="http://example.com/about.html"),
    ]

    with tempfile.TemporaryDirectory() as tmp:
        job = DownloadJob(snapshots, tmp, concurrency=2)
        with patch("requests.Session.get", return_value=_fake_response()) as mock_get:
            job.run()

        assert mock_get.call_count == 2
        assert job.status == "done"
        assert job.completed == 2
        assert job.failed == 0
        assert os.path.exists(os.path.join(tmp, "example.com", "index.html"))
        assert os.path.exists(os.path.join(tmp, "example.com", "about.html"))

        events = []
        while not job.events.empty():
            events.append(job.events.get())
        assert any(e["type"] == "ok" for e in events)
        assert events[-1]["type"] == "status"
        assert events[-1]["status"] == "done"


def test_download_job_records_failures_without_stopping():
    snapshots = [
        Snapshot(timestamp="20200101000000", original="http://example.com/ok.html"),
        Snapshot(timestamp="20200101000000", original="http://example.com/broken.html"),
    ]

    def fake_get(url, timeout=None):
        if "broken" in url:
            raise ConnectionError("boom")
        return _fake_response()

    with tempfile.TemporaryDirectory() as tmp:
        job = DownloadJob(snapshots, tmp, concurrency=2)
        with patch("requests.Session.get", side_effect=fake_get):
            job.run()

        assert job.status == "done"
        assert job.completed == 1
        assert job.failed == 1


def test_download_job_skips_existing_files():
    snapshots = [Snapshot(timestamp="20200101000000", original="http://example.com/")]

    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "example.com"))
        with open(os.path.join(tmp, "example.com", "index.html"), "w") as fh:
            fh.write("already here")

        job = DownloadJob(snapshots, tmp, concurrency=1)
        with patch("requests.Session.get", return_value=_fake_response()) as mock_get:
            job.run()

        assert mock_get.call_count == 0
        assert job.skipped == 1
        assert job.status == "done"


def test_all_snapshots_mode_keeps_each_timestamp():
    snapshots = [
        Snapshot(timestamp="20200101000000", original="http://example.com/"),
        Snapshot(timestamp="20210101000000", original="http://example.com/"),
    ]

    with tempfile.TemporaryDirectory() as tmp:
        job = DownloadJob(snapshots, tmp, concurrency=2, all_snapshots=True)
        with patch("requests.Session.get", return_value=_fake_response()):
            job.run()

        assert job.completed == 2
        assert os.path.exists(os.path.join(tmp, "example.com", "20200101000000", "index.html"))
        assert os.path.exists(os.path.join(tmp, "example.com", "20210101000000", "index.html"))
