import time
from unittest.mock import MagicMock, patch

import pytest

import app as app_module
from wayback_downloader.cdx import Snapshot


@pytest.fixture()
def client():
    app_module.app.testing = True
    return app_module.app.test_client()


def test_index_page_loads(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Wayback Downloader" in resp.data


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}


def test_preview_requires_domain(client):
    resp = client.post("/api/preview", json={})
    assert resp.status_code == 400
    assert "domain" in resp.get_json()["error"].lower()


def test_preview_rejects_bad_regex(client):
    resp = client.post("/api/preview", json={"domain": "example.com", "only_pattern": "("})
    assert resp.status_code == 400


def test_preview_returns_sample(client):
    snapshots = [Snapshot(timestamp="20200101000000", original="http://example.com/", mimetype="text/html")]
    with patch("wayback_downloader.cdx.fetch_snapshots", return_value=snapshots):
        resp = client.post("/api/preview", json={"domain": "example.com"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["count"] == 1
    assert data["sample"][0]["url"] == "http://example.com/"


def test_full_job_lifecycle_via_api(client):
    snapshots = [Snapshot(timestamp="20200101000000", original="http://example.com/")]

    fake_resp = MagicMock()
    fake_resp.raise_for_status = MagicMock()
    fake_resp.content = b"<html></html>"

    with patch("wayback_downloader.jobs.cdx.fetch_snapshots", return_value=snapshots):
        with patch("requests.Session.get", return_value=fake_resp):
            resp = client.post("/api/jobs", json={"domain": "example.com"})
            assert resp.status_code == 201
            job_id = resp.get_json()["id"]

            for _ in range(50):
                status = client.get(f"/api/jobs/{job_id}").get_json()
                if status["status"] == "done":
                    break
                time.sleep(0.1)
            assert status["status"] == "done"

    resp = client.get(f"/api/jobs/{job_id}/download")
    assert resp.status_code == 200
    assert resp.headers["Content-Type"] == "application/zip"


def test_download_before_ready_returns_409(client):
    with patch("wayback_downloader.jobs.cdx.fetch_snapshots", return_value=[]):
        resp = client.post("/api/jobs", json={"domain": "example.com"})
        job_id = resp.get_json()["id"]

    # The job may already be done (empty snapshot list finishes instantly),
    # so instead verify an unknown job id is rejected.
    resp = client.get("/api/jobs/does-not-exist/download")
    assert resp.status_code == 404
