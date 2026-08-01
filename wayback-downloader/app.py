"""Flask app: a user-friendly web UI around the Wayback Machine CDX API,
letting anyone download an archived snapshot of a website as a zip file
without installing anything."""

import json
import os
import re
import time

from flask import Flask, Response, jsonify, request, send_file, render_template

from wayback_downloader import cdx
from wayback_downloader.jobs import Job, job_manager, MAX_FILES_DEFAULT

app = Flask(__name__)

MAX_CONCURRENT_JOBS = int(os.environ.get("WMD_MAX_CONCURRENT_JOBS", "5"))
_active_jobs_lock = __import__("threading").Lock()
_active_job_ids: set[str] = set()

TERMINAL_STATUSES = {"done", "error", "cancelled"}


class BadRequest(ValueError):
    pass


def parse_params(payload: dict) -> dict:
    """Validate and normalize the request body shared by /preview and /jobs."""
    domain = (payload.get("domain") or "").strip()
    if not domain:
        raise BadRequest("Please enter a domain or URL, e.g. example.com")
    if len(domain) > 500:
        raise BadRequest("That URL is too long.")

    def opt_str(name, max_len=200):
        val = payload.get(name)
        if val is None:
            return None
        val = str(val).strip()
        if not val:
            return None
        if len(val) > max_len:
            raise BadRequest(f"'{name}' is too long.")
        return val

    from_ts = opt_str("from_ts", 14)
    to_ts = opt_str("to_ts", 14)
    if from_ts and not re.fullmatch(r"\d{4,14}", from_ts):
        raise BadRequest("'From' date must look like YYYYMMDD.")
    if to_ts and not re.fullmatch(r"\d{4,14}", to_ts):
        raise BadRequest("'To' date must look like YYYYMMDD.")

    only_pattern = opt_str("only_pattern", 300)
    exclude_pattern = opt_str("exclude_pattern", 300)
    for pattern in (only_pattern, exclude_pattern):
        if pattern:
            try:
                re.compile(pattern)
            except re.error as exc:
                raise BadRequest(f"Invalid regular expression: {exc}") from exc

    extensions = payload.get("extensions") or []
    if not isinstance(extensions, list) or not all(isinstance(e, str) for e in extensions):
        raise BadRequest("'extensions' must be a list of strings.")
    extensions = [re.sub(r"[^a-zA-Z0-9]", "", e)[:10] for e in extensions if e]

    concurrency = payload.get("concurrency", 8)
    try:
        concurrency = int(concurrency)
    except (TypeError, ValueError):
        raise BadRequest("'concurrency' must be a number.")
    concurrency = max(1, min(concurrency, 20))

    max_files = payload.get("max_files", MAX_FILES_DEFAULT)
    try:
        max_files = int(max_files)
    except (TypeError, ValueError):
        raise BadRequest("'max_files' must be a number.")
    max_files = max(1, min(max_files, MAX_FILES_DEFAULT))

    return {
        "domain": domain,
        "from_ts": from_ts,
        "to_ts": to_ts,
        "exact_url": bool(payload.get("exact_url", False)),
        "only_status_200": bool(payload.get("only_status_200", True)),
        "all_snapshots": bool(payload.get("all_snapshots", False)),
        "extensions": extensions,
        "only_pattern": only_pattern,
        "exclude_pattern": exclude_pattern,
        "concurrency": concurrency,
        "max_files": max_files,
    }


@app.get("/")
def index():
    return render_template("index.html", max_files_default=MAX_FILES_DEFAULT)


@app.post("/api/preview")
def preview():
    try:
        params = parse_params(request.get_json(force=True, silent=True) or {})
    except BadRequest as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        snapshots = cdx.fetch_snapshots(
            params["domain"],
            from_ts=params["from_ts"],
            to_ts=params["to_ts"],
            exact_url=params["exact_url"],
            only_status_200=params["only_status_200"],
            all_snapshots=params["all_snapshots"],
        )
    except cdx.CdxError as exc:
        return jsonify({"error": str(exc)}), 502

    snapshots = cdx.filter_snapshots(
        snapshots,
        extensions=params["extensions"] or None,
        only_pattern=params["only_pattern"],
        exclude_pattern=params["exclude_pattern"],
    )

    sample = [
        {"url": s.original, "timestamp": s.timestamp, "mimetype": s.mimetype}
        for s in snapshots[:25]
    ]
    return jsonify({
        "count": len(snapshots),
        "sample": sample,
        "truncated_at": params["max_files"] if len(snapshots) > params["max_files"] else None,
    })


@app.post("/api/jobs")
def create_job():
    try:
        params = parse_params(request.get_json(force=True, silent=True) or {})
    except BadRequest as exc:
        return jsonify({"error": str(exc)}), 400

    with _active_jobs_lock:
        active = {jid for jid in _active_job_ids if _is_active(jid)}
        _active_job_ids.clear()
        _active_job_ids.update(active)
        if len(active) >= MAX_CONCURRENT_JOBS:
            return jsonify({"error": "The server is busy. Please try again in a moment."}), 429

    job = job_manager.create(params)

    with _active_jobs_lock:
        _active_job_ids.add(job.id)

    return jsonify(job.snapshot_dict()), 201


def _is_active(job_id: str) -> bool:
    job = job_manager.get(job_id)
    return bool(job and job.status not in TERMINAL_STATUSES)


@app.get("/api/jobs/<job_id>")
def get_job(job_id):
    job = job_manager.get(job_id)
    if not job:
        return jsonify({"error": "Job not found."}), 404
    return jsonify(job.snapshot_dict())


@app.post("/api/jobs/<job_id>/cancel")
def cancel_job(job_id):
    job = job_manager.get(job_id)
    if not job:
        return jsonify({"error": "Job not found."}), 404
    job.cancel()
    return jsonify(job.snapshot_dict())


@app.get("/api/jobs/<job_id>/stream")
def stream_job(job_id):
    job = job_manager.get(job_id)
    if not job:
        return jsonify({"error": "Job not found."}), 404

    def generate():
        yield f"data: {json.dumps(job.snapshot_dict())}\n\n"
        last_beat = time.time()
        while True:
            try:
                event = job.events.get(timeout=1.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("status") in TERMINAL_STATUSES:
                    break
            except Exception:
                if job.status in TERMINAL_STATUSES:
                    yield f"data: {json.dumps(job.snapshot_dict())}\n\n"
                    break
                if time.time() - last_beat > 15:
                    yield ": keep-alive\n\n"
                    last_beat = time.time()

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/jobs/<job_id>/download")
def download_job(job_id):
    job = job_manager.get(job_id)
    if not job:
        return jsonify({"error": "Job not found."}), 404
    if job.status != "done" or not job.zip_path or not os.path.exists(job.zip_path):
        return jsonify({"error": "This download isn't ready yet."}), 409

    safe_name = re.sub(r"[^a-zA-Z0-9.-]", "_", job.params["domain"].split("//")[-1].rstrip("/"))
    return send_file(
        job.zip_path,
        as_attachment=True,
        download_name=f"{safe_name or 'site'}.zip",
        mimetype="application/zip",
    )


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug, threaded=True)
