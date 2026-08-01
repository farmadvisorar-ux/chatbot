"""Maps archived URLs to local file paths, mirroring the layout a browser
would expect if it served the site from disk (index.html for directories,
sanitized query strings, no illegal filesystem characters)."""

import re
from urllib.parse import urlsplit, unquote

_ILLEGAL_CHARS = re.compile(r'[<>:"\\|?*\x00-\x1f]')
_MAX_SEGMENT_LEN = 200


def sanitize_segment(segment: str) -> str:
    """Make a single path segment safe to use as a file/directory name."""
    try:
        segment = unquote(segment)
    except Exception:
        pass
    segment = _ILLEGAL_CHARS.sub("_", segment).strip()
    segment = segment.rstrip(". ")
    if not segment:
        return "_"
    if len(segment) > _MAX_SEGMENT_LEN:
        segment = segment[:_MAX_SEGMENT_LEN]
    return segment


def url_to_filepath(url: str) -> str:
    """Convert an archived URL into a relative file path (posix-style,
    always starting with the host name)."""
    parts = urlsplit(url)
    host = sanitize_segment(parts.netloc or "site")
    raw_segments = [s for s in parts.path.split("/") if s != ""]
    segments = [sanitize_segment(s) for s in raw_segments]

    if not segments:
        segments = ["index.html"]
    elif "." not in segments[-1]:
        segments.append("index.html")

    if parts.query:
        query = sanitize_segment(parts.query)
        last = segments[-1]
        if "." in last:
            name, ext = last.rsplit(".", 1)
            segments[-1] = f"{name}@{query}.{ext}"
        else:
            segments[-1] = f"{last}@{query}"

    return "/".join([host, *segments])
