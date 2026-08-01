"""Threaded downloader that fetches archived snapshots to disk and reports
progress through a thread-safe queue of events."""

import os
import queue
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

import requests

from .cdx import Snapshot
from .urlmap import url_to_filepath

USER_AGENT = "wayback-downloader-web/1.0 (+https://github.com/hartator/wayback-machine-downloader)"


class DownloadJob:
    """Downloads a list of snapshots to `output_dir`, emitting progress
    events onto `self.events` (a queue.Queue) as it goes."""

    def __init__(
        self,
        snapshots: List[Snapshot],
        output_dir: str,
        *,
        concurrency: int = 8,
        all_snapshots: bool = False,
        timeout: int = 30,
    ):
        self.snapshots = snapshots
        self.output_dir = output_dir
        self.concurrency = max(1, min(int(concurrency or 8), 20))
        self.all_snapshots = all_snapshots
        self.timeout = timeout

        self.total = len(snapshots)
        self.completed = 0
        self.failed = 0
        self.skipped = 0

        self.status = "pending"  # pending -> running -> done|cancelled|error
        self.error: Optional[str] = None

        self.events: "queue.Queue[dict]" = queue.Queue()
        self._cancel_event = threading.Event()
        self._lock = threading.Lock()

    def cancel(self):
        self._cancel_event.set()

    def snapshot_dict(self) -> dict:
        with self._lock:
            return {
                "status": self.status,
                "total": self.total,
                "completed": self.completed,
                "failed": self.failed,
                "skipped": self.skipped,
                "error": self.error,
            }

    def _emit(self, event_type: str, **extra):
        payload = {"type": event_type, **self.snapshot_dict()}
        payload.update(extra)
        self.events.put(payload)

    def _target_path(self, snap: Snapshot) -> str:
        rel = url_to_filepath(snap.original)
        if self.all_snapshots:
            host, _, rest = rel.partition("/")
            rel = f"{host}/{snap.timestamp}/{rest or 'index.html'}"
        # Normalize to the host OS separator and keep everything inside output_dir.
        return os.path.normpath(os.path.join(self.output_dir, *rel.split("/")))

    def _download_one(self, session: requests.Session, snap: Snapshot):
        if self._cancel_event.is_set():
            return

        target = self._target_path(snap)
        os.makedirs(os.path.dirname(target), exist_ok=True)

        if os.path.exists(target):
            with self._lock:
                self.skipped += 1
            self._emit("skip", url=snap.original)
            return

        try:
            resp = session.get(snap.archive_url, timeout=self.timeout)
            resp.raise_for_status()
            with open(target, "wb") as fh:
                fh.write(resp.content)
            with self._lock:
                self.completed += 1
            self._emit("ok", url=snap.original, size=len(resp.content))
        except Exception as exc:  # noqa: BLE001 - report every failure, keep going
            with self._lock:
                self.failed += 1
            self._emit("error", url=snap.original, message=str(exc))

    def run(self):
        self.status = "running"
        self._emit("status")

        if not self.snapshots:
            self.status = "done"
            self._emit("status")
            return

        os.makedirs(self.output_dir, exist_ok=True)
        session = requests.Session()
        session.headers["User-Agent"] = USER_AGENT

        try:
            with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
                futures = [pool.submit(self._download_one, session, s) for s in self.snapshots]
                for fut in futures:
                    fut.result()
                    if self._cancel_event.is_set():
                        break
        except Exception as exc:  # noqa: BLE001
            self.status = "error"
            self.error = str(exc)
            self._emit("status")
            return
        finally:
            session.close()

        if self._cancel_event.is_set():
            self.status = "cancelled"
        else:
            self.status = "done"
        self._emit("status")
