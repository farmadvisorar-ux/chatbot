"""Client for the Wayback Machine CDX Server API.

See https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md
"""

from dataclasses import dataclass
from typing import Iterable, List, Optional

import requests

CDX_API_URL = "https://web.archive.org/cdx/search/cdx"

FIELDS = ["timestamp", "original", "statuscode", "digest", "mimetype"]


class CdxError(RuntimeError):
    """Raised when the CDX API cannot be reached or returns bad data."""


@dataclass(frozen=True)
class Snapshot:
    timestamp: str
    original: str
    statuscode: str = ""
    digest: str = ""
    mimetype: str = ""

    @property
    def archive_url(self) -> str:
        return f"https://web.archive.org/web/{self.timestamp}id_/{self.original}"


def build_cdx_params(
    domain: str,
    *,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    exact_url: bool = False,
    only_status_200: bool = True,
    all_snapshots: bool = False,
    limit: Optional[int] = None,
) -> dict:
    """Build the query parameters for a CDX API request."""
    domain = domain.strip()
    params = {
        "url": domain,
        "output": "json",
        "fl": ",".join(FIELDS),
        "matchType": "exact" if exact_url else "domain",
    }
    if from_ts:
        params["from"] = from_ts
    if to_ts:
        params["to"] = to_ts
    if only_status_200:
        params["filter"] = "statuscode:200"
    if not all_snapshots:
        # Keep only the most recent capture of each unique URL.
        params["collapse"] = "urlkey"
    if limit:
        params["limit"] = str(limit)
    return params


def parse_cdx_json(data) -> List[Snapshot]:
    """Parse the JSON payload returned by the CDX API (a list of lists,
    the first row being the column header) into Snapshot objects."""
    if not data or len(data) < 2:
        return []
    header, *rows = data
    index = {name: i for i, name in enumerate(header)}

    def get(row, name, default=""):
        i = index.get(name)
        if i is None or i >= len(row):
            return default
        return row[i]

    return [
        Snapshot(
            timestamp=get(row, "timestamp"),
            original=get(row, "original"),
            statuscode=get(row, "statuscode"),
            digest=get(row, "digest"),
            mimetype=get(row, "mimetype"),
        )
        for row in rows
        if get(row, "timestamp") and get(row, "original")
    ]


def fetch_snapshots(
    domain: str,
    session: Optional[requests.Session] = None,
    timeout: int = 30,
    **kwargs,
) -> List[Snapshot]:
    """Query the CDX API for every archived snapshot of a domain/URL."""
    if not domain or not domain.strip():
        raise CdxError("Please provide a domain or URL to look up.")

    session = session or requests.Session()
    params = build_cdx_params(domain, **kwargs)
    try:
        resp = session.get(CDX_API_URL, params=params, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise CdxError(f"Could not reach the Wayback Machine CDX API: {exc}") from exc

    try:
        data = resp.json()
    except ValueError as exc:
        raise CdxError("The CDX API returned an unexpected response.") from exc

    return parse_cdx_json(data)


def filter_snapshots(
    snapshots: Iterable[Snapshot],
    *,
    extensions: Optional[Iterable[str]] = None,
    only_pattern: Optional[str] = None,
    exclude_pattern: Optional[str] = None,
) -> List[Snapshot]:
    """Apply optional extension/regex filters to a list of snapshots."""
    import re as _re

    result = list(snapshots)

    if extensions:
        exts = tuple(f".{e.lstrip('.').lower()}" for e in extensions)
        result = [s for s in result if s.original.lower().split("?", 1)[0].endswith(exts)]

    if only_pattern:
        rx = _re.compile(only_pattern)
        result = [s for s in result if rx.search(s.original)]

    if exclude_pattern:
        rx = _re.compile(exclude_pattern)
        result = [s for s in result if not rx.search(s.original)]

    return result
