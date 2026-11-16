"""Chuẩn hóa URL để chống trùng: cùng một bài → cùng một hash."""

from __future__ import annotations

import hashlib
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_TRACKING_PREFIXES = ("utm_", "at_", "mc_", "pk_")
_TRACKING_KEYS = {
    "fbclid", "gclid", "dclid", "msclkid", "igshid", "yclid",
    "ocid", "cmpid", "ref", "ref_src", "rss", "src", "via",
}


def _keep(k: str) -> bool:
    k = k.lower()
    return k not in _TRACKING_KEYS and not k.startswith(_TRACKING_PREFIXES)


def clean_url(url: str) -> str:
    """URL để lưu/hiển thị: chỉ bỏ tham số tracking + fragment, giữ nguyên phần còn lại."""
    parts = urlsplit(url.strip())
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if _keep(k)]
    return urlunsplit(parts._replace(query=urlencode(query), fragment=""))


def normalize_url(url: str) -> str:
    parts = urlsplit(url.strip())
    scheme = "https" if parts.scheme in ("http", "https") else parts.scheme
    host = (parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    port = parts.port
    netloc = host if port in (None, 80, 443) else f"{host}:{port}"

    path = parts.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")

    query = sorted((k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if _keep(k))
    return urlunsplit((scheme, netloc, path, urlencode(query), ""))


def url_hash(url: str) -> str:
    return hashlib.sha256(normalize_url(url).encode("utf-8")).hexdigest()
