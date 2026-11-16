"""HTTP client dùng chung: timeout, retry lỗi mạng/5xx, header lịch sự."""

from __future__ import annotations

import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

RETRY_STATUS = {429, 500, 502, 503, 504}


class FetchError(RuntimeError):
    pass


def make_client(user_agent: str, timeout: float) -> httpx.Client:
    return httpx.Client(
        headers={
            "User-Agent": user_agent,
            "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
            "Accept-Language": "vi,en;q=0.8",
        },
        timeout=httpx.Timeout(timeout, connect=10.0),
        follow_redirects=True,
        transport=httpx.HTTPTransport(retries=2),  # retry lỗi kết nối
        http2=False,
    )


def fetch_bytes(client: httpx.Client, url: str, attempts: int = 3) -> tuple[bytes, str]:
    """Trả (body, final_url). Retry 429/5xx với backoff."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            r = client.get(url)
            if r.status_code in RETRY_STATUS and i < attempts - 1:
                wait = float(r.headers.get("Retry-After", "") or 2 ** (i + 1))
                time.sleep(min(wait, 30))
                continue
            if r.status_code == 404:
                raise FetchError(f"HTTP 404 {url}")
            r.raise_for_status()
            return r.content, str(r.url)
        except FetchError:
            raise
        except (httpx.HTTPError, ValueError) as e:
            last = e
            if i < attempts - 1:
                time.sleep(2 ** (i + 1))
    raise FetchError(f"{type(last).__name__}: {last}") from last


def page_url(url: str, page: int, pagination: str) -> str:
    if page <= 1 or pagination != "wordpress":
        return url
    parts = urlsplit(url)
    q = [(k, v) for k, v in parse_qsl(parts.query) if k != "paged"] + [("paged", str(page))]
    return urlunsplit(parts._replace(query=urlencode(q)))
