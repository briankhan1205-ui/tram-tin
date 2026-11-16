"""Parse RSS/Atom → danh sách ParsedArticle sạch sẽ."""

from __future__ import annotations

import calendar
import html
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from html.parser import HTMLParser

import feedparser

SUMMARY_MAX = 600
CONTENT_MAX = 50_000

_WS_RE = re.compile(r"[ \t\r\f\v]+")
_NL_RE = re.compile(r"\n{3,}")
_IMG_RE = re.compile(r"""<img[^>]+src=["']([^"']+)["']""", re.I)
# WordPress hay chèn "The post X appeared first on Y." vào cuối description.
_WP_FOOTER_RE = re.compile(r"\s*(The post .+ appeared first on .+\.|Bài viết .+ xuất hiện đầu tiên tại .+\.)\s*$", re.S)

_BLOCK_TAGS = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr", "figure"}
_SKIP_TAGS = {"script", "style", "noscript", "iframe", "figcaption"}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP_TAGS:
            self._skip += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _SKIP_TAGS and self._skip:
            self._skip -= 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def html_to_text(raw: str | None) -> str:
    if not raw:
        return ""
    p = _TextExtractor()
    try:
        p.feed(raw)
        p.close()
        text = "".join(p.parts)
    except Exception:  # HTML hỏng: fallback thô
        text = re.sub(r"<[^>]+>", " ", html.unescape(raw))
    lines = [_WS_RE.sub(" ", ln).strip() for ln in text.replace("\xa0", " ").split("\n")]
    return _NL_RE.sub("\n\n", "\n".join(lines)).strip()


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:-") + "…"


@dataclass(slots=True)
class ParsedArticle:
    url: str
    guid: str | None
    title: str
    summary: str | None
    content: str | None
    image_url: str | None
    author: str | None
    published_at: datetime


@dataclass(slots=True)
class ParsedFeed:
    articles: list[ParsedArticle]
    bozo_error: str | None


def _entry_time(entry, fallback: datetime) -> datetime:
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        st = entry.get(key)
        if st:
            try:
                dt = datetime.fromtimestamp(calendar.timegm(st), tz=UTC)
            except (OverflowError, ValueError):
                continue
            # Ngày tương lai (feed sai múi giờ) → kẹp về thời điểm lấy tin.
            return min(dt, fallback)
    return fallback


def _entry_image(entry, raw_html: str) -> str | None:
    for key in ("media_thumbnail", "media_content"):
        for m in entry.get(key) or []:
            url = m.get("url")
            if url and (key == "media_thumbnail" or str(m.get("medium", "image")) == "image"):
                return url
    for enc in entry.get("enclosures") or []:
        if str(enc.get("type", "")).startswith("image/") and enc.get("href"):
            return enc["href"]
    for link in entry.get("links") or []:
        if link.get("rel") == "enclosure" and str(link.get("type", "")).startswith("image/"):
            return link.get("href")
    m = _IMG_RE.search(raw_html or "")
    return html.unescape(m.group(1)) if m else None


def parse_feed(body: bytes, base_url: str, now: datetime | None = None) -> ParsedFeed:
    now = now or datetime.now(UTC)
    feed = feedparser.parse(body, response_headers={"content-location": base_url})
    bozo = None
    if feed.get("bozo") and not feed.entries:
        bozo = str(feed.get("bozo_exception") or "feed không hợp lệ")

    articles: list[ParsedArticle] = []
    for e in feed.entries:
        link = (e.get("link") or "").strip()
        title = html_to_text(e.get("title") or "")
        if not link.startswith(("http://", "https://")) or not title:
            continue

        content_html = ""
        if e.get("content"):
            content_html = max((c.get("value") or "" for c in e["content"]), key=len)
        summary_html = e.get("summary") or ""

        summary = _WP_FOOTER_RE.sub("", html_to_text(summary_html))
        content = html_to_text(content_html)
        if not summary and content:
            summary = content
        summary = _truncate(summary, SUMMARY_MAX) if summary else None
        # Không lưu content trùng y summary để đỡ tốn chỗ.
        content_out = _truncate(content, CONTENT_MAX) if content and content != summary else None

        articles.append(
            ParsedArticle(
                url=link,
                guid=(e.get("id") or None),
                title=_truncate(title, 500),
                summary=summary,
                content=content_out,
                image_url=_entry_image(e, content_html or summary_html),
                author=(e.get("author") or None),
                published_at=_entry_time(e, now),
            )
        )
    return ParsedFeed(articles=articles, bozo_error=bozo)
