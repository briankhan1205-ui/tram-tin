"""Một lần quét: mọi nguồn enabled, mỗi nguồn cô lập lỗi."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
import psycopg

from . import db
from .config import Settings, Source
from .fetch import FetchError, fetch_bytes, make_client, page_url
from .notify import send_alert
from .parse import ParsedArticle, parse_feed
from .telegram import esc
from .urlnorm import url_hash

log = logging.getLogger(__name__)


@dataclass(slots=True)
class SourceResult:
    source_id: str
    ok: bool
    pages: int = 0
    fetched: int = 0
    inserted: int = 0
    error: str | None = None


def _dedupe(articles: list[ParsedArticle]) -> list[ParsedArticle]:
    seen: set[str] = set()
    out = []
    for a in articles:
        h = url_hash(a.url)
        if h not in seen:
            seen.add(h)
            out.append(a)
    return out


def crawl_source(
    conn: psycopg.Connection,
    client: httpx.Client,
    source: Source,
    *,
    notify: bool,
    dry_run: bool = False,
) -> SourceResult:
    res = SourceResult(source.id, ok=True)
    first = db.is_first_crawl(conn, source.id)
    # Lần đầu của một nguồn: chỉ seed, không bắn thông báo cả trăm tin cũ.
    status = "pending" if notify and not first else "skipped"
    max_pages = source.max_pages if source.pagination == "wordpress" else 1

    for page in range(1, max_pages + 1):
        url = page_url(source.url, page, source.pagination)
        try:
            body, _ = fetch_bytes(client, url)
        except FetchError as e:
            if page > 1:  # hết trang (404) hoặc trang sau lỗi: dừng êm, giữ kết quả trang trước
                log.info("[%s] dừng ở trang %d: %s", source.id, page, e)
                break
            raise
        parsed = parse_feed(body, url, now=datetime.now(UTC))
        if parsed.bozo_error and not parsed.articles:
            if page > 1:
                break
            raise FetchError(f"feed không đọc được: {parsed.bozo_error}")
        res.pages = page
        articles = _dedupe(parsed.articles)
        res.fetched += len(articles)
        if not articles:
            break

        known = db.existing_hashes(conn, (url_hash(a.url) for a in articles))
        fresh = [a for a in articles if url_hash(a.url) not in known]
        if fresh and not dry_run:
            res.inserted += db.insert_articles(conn, source.id, fresh, status)
        elif dry_run:
            res.inserted += len(fresh)
        # Đã chạm vùng tin cũ → khỏi lật trang tiếp. Lần đầu chỉ lấy trang 1.
        if known or first:
            break
    return res


def _handle_health(conn: psycopg.Connection, settings: Settings, source: Source, res: SourceResult, health: db.SourceHealth) -> None:
    if res.ok:
        if health.alerted:
            send_alert(settings, f"✅ <b>{esc(source.name)}</b> đã quét lại bình thường.")
            db.mark_alerted(conn, source.id, False)
        return
    if health.consecutive_failures >= settings.alert_after_failures and not health.alerted:
        ok = send_alert(
            settings,
            f"⚠️ <b>{esc(source.name)}</b> lỗi {health.consecutive_failures} lần liên tiếp\n"
            f"<code>{esc((res.error or '')[:500])}</code>",
        )
        if ok:
            db.mark_alerted(conn, source.id, True)


def run_crawl(
    conn: psycopg.Connection,
    settings: Settings,
    sources: list[Source],
    *,
    only: set[str] | None = None,
    notify: bool = True,
    dry_run: bool = False,
    run_id: UUID | None = None,
) -> list[SourceResult]:
    run_id = run_id or uuid4()
    targets = [s for s in sources if s.enabled and (not only or s.id in only)]
    if only and (missing := only - {s.id for s in sources}):
        log.warning("không có nguồn: %s", ", ".join(sorted(missing)))

    results: list[SourceResult] = []
    with make_client(settings.user_agent, settings.http_timeout) as client:
        for source in targets:
            started = datetime.now(UTC)
            try:
                res = crawl_source(conn, client, source, notify=notify, dry_run=dry_run)
            except Exception as e:  # cô lập lỗi từng nguồn
                conn.rollback()
                if isinstance(e, FetchError):
                    log.error("[%s] %s", source.id, e)
                else:
                    log.exception("[%s] lỗi không lường trước", source.id)
                res = SourceResult(source.id, ok=False, error=f"{type(e).__name__}: {e}"[:1000])
            finished = datetime.now(UTC)
            log.info(
                "[%s] %s pages=%d fetched=%d new=%d%s",
                source.id, "OK" if res.ok else "FAIL", res.pages, res.fetched, res.inserted,
                f" error={res.error}" if res.error else "",
            )
            results.append(res)
            if dry_run:
                continue
            health = db.record_run(
                conn, run_id=run_id, source_id=source.id, started_at=started, finished_at=finished,
                ok=res.ok, pages=res.pages, fetched=res.fetched, inserted=res.inserted, error=res.error,
            )
            _handle_health(conn, settings, source, res, health)
    return results
