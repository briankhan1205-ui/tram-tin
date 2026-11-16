"""Truy cập Postgres: migration, đồng bộ nguồn, ghi bài + outbox."""

from __future__ import annotations

import logging
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from .config import Source
from .parse import ParsedArticle
from .urlnorm import clean_url, url_hash

log = logging.getLogger(__name__)

# Khóa advisory để 2 lần quét (launchd + chạy tay) không giẫm nhau.
CRAWL_LOCK_KEY = 0x7472616D74696E  # "tramtin"


def connect(database_url: str) -> psycopg.Connection:
    return psycopg.connect(database_url, row_factory=dict_row, application_name="tram-tin")


# ---------- migrations ----------

def migrate(conn: psycopg.Connection, migrations_dir: Path) -> list[str]:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
               version text PRIMARY KEY,
               applied_at timestamptz NOT NULL DEFAULT now())"""
    )
    conn.commit()
    applied = {r["version"] for r in conn.execute("SELECT version FROM schema_migrations")}
    done: list[str] = []
    for f in sorted(migrations_dir.glob("*.sql")):
        if f.name in applied:
            continue
        log.info("apply migration %s", f.name)
        with conn.transaction():
            conn.execute(f.read_text(encoding="utf-8"))
            conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (f.name,))
        done.append(f.name)
    return done


# ---------- sources ----------

def sync_sources(conn: psycopg.Connection, sources: Sequence[Source]) -> None:
    """sources.json là nguồn chân lý: upsert, nguồn bị xóa khỏi file thì disable (giữ bài cũ)."""
    with conn.transaction():
        for s in sources:
            conn.execute(
                """INSERT INTO sources (id, name, type, url, homepage, max_pages, enabled)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (id) DO UPDATE SET
                       name = EXCLUDED.name, type = EXCLUDED.type, url = EXCLUDED.url,
                       homepage = EXCLUDED.homepage, max_pages = EXCLUDED.max_pages,
                       enabled = EXCLUDED.enabled, updated_at = now()
                   WHERE (sources.name, sources.type, sources.url, sources.homepage,
                          sources.max_pages, sources.enabled)
                     IS DISTINCT FROM
                         (EXCLUDED.name, EXCLUDED.type, EXCLUDED.url, EXCLUDED.homepage,
                          EXCLUDED.max_pages, EXCLUDED.enabled)""",
                (s.id, s.name, s.type, s.url, s.homepage, s.max_pages, s.enabled),
            )
        conn.execute(
            "UPDATE sources SET enabled = false, updated_at = now() "
            "WHERE enabled AND NOT (id = ANY(%s))",
            ([s.id for s in sources],),
        )


def is_first_crawl(conn: psycopg.Connection, source_id: str) -> bool:
    row = conn.execute(
        "SELECT last_success_at IS NULL AS first FROM sources WHERE id = %s", (source_id,)
    ).fetchone()
    return bool(row and row["first"])


# ---------- articles ----------

def existing_hashes(conn: psycopg.Connection, hashes: Iterable[str]) -> set[str]:
    hs = list(set(hashes))
    if not hs:
        return set()
    rows = conn.execute("SELECT url_hash FROM articles WHERE url_hash = ANY(%s)", (hs,))
    return {r["url_hash"].strip() for r in rows}


def insert_articles(
    conn: psycopg.Connection,
    source_id: str,
    articles: Sequence[ParsedArticle],
    notify_status: str,
) -> int:
    """Insert bài mới + dòng outbox trong cùng 1 transaction. Trả số bài mới."""
    inserted = 0
    with conn.transaction():
        for a in articles:
            row = conn.execute(
                """INSERT INTO articles
                       (source_id, url, url_hash, guid, title, summary, content,
                        image_url, author, published_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (url_hash) DO NOTHING
                   RETURNING id""",
                (source_id, clean_url(a.url), url_hash(a.url), a.guid, a.title, a.summary,
                 a.content, a.image_url, a.author, a.published_at),
            ).fetchone()
            if row is None:
                continue
            inserted += 1
            conn.execute(
                "INSERT INTO notifications (article_id, status) VALUES (%s, %s)",
                (row["id"], notify_status),
            )
    return inserted


# ---------- run bookkeeping ----------

@dataclass(slots=True)
class SourceHealth:
    consecutive_failures: int
    alerted: bool


def record_run(
    conn: psycopg.Connection,
    *,
    run_id: UUID,
    source_id: str,
    started_at: datetime,
    finished_at: datetime,
    ok: bool,
    pages: int,
    fetched: int,
    inserted: int,
    error: str | None,
) -> SourceHealth:
    with conn.transaction():
        conn.execute(
            """INSERT INTO crawl_runs
                   (run_id, source_id, started_at, finished_at, ok, pages, fetched, inserted, error)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (run_id, source_id, started_at, finished_at, ok, pages, fetched, inserted, error),
        )
        if ok:
            # Giữ alerted_at: caller gửi tin "đã hồi phục" rồi mới xóa cờ.
            row = conn.execute(
                """UPDATE sources SET last_success_at = %s, consecutive_failures = 0,
                       updated_at = now()
                   WHERE id = %s
                   RETURNING consecutive_failures, (alerted_at IS NOT NULL) AS alerted""",
                (finished_at, source_id),
            ).fetchone()
        else:
            row = conn.execute(
                """UPDATE sources SET consecutive_failures = consecutive_failures + 1,
                       last_error = %s, last_error_at = %s, updated_at = now()
                   WHERE id = %s
                   RETURNING consecutive_failures, (alerted_at IS NOT NULL) AS alerted""",
                (error, finished_at, source_id),
            ).fetchone()
    return SourceHealth(row["consecutive_failures"], row["alerted"])


def mark_alerted(conn: psycopg.Connection, source_id: str, alerted: bool) -> None:
    conn.execute(
        "UPDATE sources SET alerted_at = CASE WHEN %s THEN now() END WHERE id = %s",
        (alerted, source_id),
    )
    conn.commit()


def prune_runs(conn: psycopg.Connection, keep_days: int = 30) -> None:
    conn.execute("DELETE FROM crawl_runs WHERE started_at < now() - make_interval(days => %s)", (keep_days,))
    conn.commit()
