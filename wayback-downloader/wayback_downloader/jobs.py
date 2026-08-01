"""Orchestrates a full download job: list snapshots from the CDX API,
filter them, download them to a temp directory, then zip the result.
Runs in a background thread and exposes progress through a queue so the
Flask app can stream it to the browser over SSE."""

import os
import queue
import shutil
import tempfile
import threading
import time
import uuid
import zipfile
from typing import Optional

from . import cdx
from .downloader import DownloadJob

MAX_FILES_DEFAULT = int(os.environ.get("WMD_MAX_FILES", "4000"))
JOB_TTL_SECONDS = int(os.environ.get("WMD_JOB_TTL_SECONDS", str(60 * 60)))  # 1 hour


class Job:
    def __init__(self, job_id: str, params: dict):
        self.id = job_id
        self.params = params
        self.created_at = time.time()

        self.status = "queued"  # queued -> listing -> downloading -> zipping -> done|error|cancelled
        self.message = ""
        self.error: Optional[str] = None

        self.total = 0
        self.completed = 0
        self.failed = 0
        self.skipped = 0

        self.work_dir = tempfile.mkdtemp(prefix=f"wmd-{job_id}-")
        self.output_dir = os.path.join(self.work_dir, "site")
        self.zip_path: Optional[str] = None

        self.events: "queue.Queue[dict]" = queue.Queue()
        self._download_job: Optional[DownloadJob] = None
        self._cancel_requested = threading.Event()
        self._thread: Optional[threading.Thread] = None

    # -- lifecycle ---------------------------------------------------
    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def cancel(self):
        self._cancel_requested.set()
        if self._download_job:
            self._download_job.cancel()

    def _emit(self, event_type: str, **extra):
        payload = {
            "type": event_type,
            "status": self.status,
            "message": self.message,
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "skipped": self.skipped,
            "error": self.error,
        }
        payload.update(extra)
        self.events.put(payload)

    def snapshot_dict(self) -> dict:
        return {
            "id": self.id,
            "status": self.status,
            "message": self.message,
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "skipped": self.skipped,
            "error": self.error,
            "download_ready": self.status == "done" and bool(self.zip_path),
        }

    # -- main pipeline -------------------------------------------------
    def _run(self):
        try:
            self._set_status("listing", "Looking up archived snapshots...")

            snapshots = cdx.fetch_snapshots(
                self.params["domain"],
                from_ts=self.params.get("from_ts") or None,
                to_ts=self.params.get("to_ts") or None,
                exact_url=self.params.get("exact_url", False),
                only_status_200=self.params.get("only_status_200", True),
                all_snapshots=self.params.get("all_snapshots", False),
            )

            snapshots = cdx.filter_snapshots(
                snapshots,
                extensions=self.params.get("extensions") or None,
                only_pattern=self.params.get("only_pattern") or None,
                exclude_pattern=self.params.get("exclude_pattern") or None,
            )

            max_files = self.params.get("max_files") or MAX_FILES_DEFAULT
            truncated = len(snapshots) > max_files
            if truncated:
                snapshots = snapshots[:max_files]

            self.total = len(snapshots)

            if self._cancel_requested.is_set():
                self._set_status("cancelled", "Cancelled before download started.")
                return

            if self.total == 0:
                self._set_status("done", "No matching snapshots were found.")
                self._make_empty_zip()
                return

            note = f" (capped at {max_files} files)" if truncated else ""
            self._set_status("downloading", f"Downloading {self.total} file(s){note}...")

            self._download_job = DownloadJob(
                snapshots,
                self.output_dir,
                concurrency=self.params.get("concurrency", 8),
                all_snapshots=self.params.get("all_snapshots", False),
            )
            self._pump_download_events()

            if self._cancel_requested.is_set():
                self._set_status("cancelled", "Download cancelled.")
                return

            if self._download_job.status == "error":
                self._set_status("error", "Download failed.", error=self._download_job.error)
                return

            self._set_status("zipping", "Packaging your site into a zip file...")
            self._make_zip()

            self._set_status(
                "done",
                f"Done! {self.completed} file(s) downloaded"
                + (f", {self.skipped} skipped" if self.skipped else "")
                + (f", {self.failed} failed" if self.failed else "")
                + ".",
            )
        except cdx.CdxError as exc:
            self._set_status("error", "Could not list snapshots.", error=str(exc))
        except Exception as exc:  # noqa: BLE001
            self._set_status("error", "Something went wrong.", error=str(exc))

    def _pump_download_events(self):
        dj = self._download_job
        t = threading.Thread(target=dj.run, daemon=True)
        t.start()
        while t.is_alive() or not dj.events.empty():
            try:
                ev = dj.events.get(timeout=0.5)
            except queue.Empty:
                continue
            self.completed = ev.get("completed", self.completed)
            self.failed = ev.get("failed", self.failed)
            self.skipped = ev.get("skipped", self.skipped)
            self._emit("progress", file_event=ev)
        t.join()

    def _make_zip(self):
        zip_path = os.path.join(self.work_dir, "site.zip")
        base = self.params["domain"].strip().rstrip("/").split("//")[-1]
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(self.output_dir):
                for name in files:
                    full = os.path.join(root, name)
                    arcname = os.path.relpath(full, self.output_dir)
                    zf.write(full, arcname=os.path.join(base, arcname))
        self.zip_path = zip_path

    def _make_empty_zip(self):
        zip_path = os.path.join(self.work_dir, "site.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED):
            pass
        self.zip_path = zip_path

    def _set_status(self, status: str, message: str, error: Optional[str] = None):
        self.status = status
        self.message = message
        if error is not None:
            self.error = error
        self._emit("status")

    def cleanup(self):
        shutil.rmtree(self.work_dir, ignore_errors=True)


class JobManager:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._start_janitor()

    def create(self, params: dict) -> Job:
        job_id = uuid.uuid4().hex[:12]
        job = Job(job_id, params)
        with self._lock:
            self._jobs[job_id] = job
        job.start()
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def _start_janitor(self):
        def sweep():
            while True:
                time.sleep(300)
                cutoff = time.time() - JOB_TTL_SECONDS
                with self._lock:
                    stale = [jid for jid, j in self._jobs.items() if j.created_at < cutoff]
                    for jid in stale:
                        self._jobs.pop(jid).cleanup()

        threading.Thread(target=sweep, daemon=True).start()


job_manager = JobManager()
