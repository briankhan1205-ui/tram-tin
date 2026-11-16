"""CLI: tram-tin {run,crawl,notify,migrate,sources,telegram-test,telegram-chat-id}."""

from __future__ import annotations

import argparse
import logging
import os
import sys
from contextlib import contextmanager

import psycopg

from . import __version__, db
from .config import MIGRATIONS_DIR, ConfigError, load_settings, load_sources
from .crawl import run_crawl
from .notify import send_pending
from .telegram import Telegram, TelegramError, recent_chats

log = logging.getLogger("tram_tin")


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-5s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stderr,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)


@contextmanager
def _locked(conn: psycopg.Connection):
    got = conn.execute("SELECT pg_try_advisory_lock(%s) AS ok", (db.CRAWL_LOCK_KEY,)).fetchone()["ok"]
    conn.commit()
    if not got:
        log.warning("một lần quét khác đang chạy → bỏ qua")
        yield False
        return
    try:
        yield True
    finally:
        conn.execute("SELECT pg_advisory_unlock(%s)", (db.CRAWL_LOCK_KEY,))
        conn.commit()


def _web_url() -> str | None:
    return os.environ.get("WEB_PUBLIC_URL", "").strip() or None


def cmd_migrate(args, settings) -> int:
    with db.connect(settings.database_url) as conn:
        done = db.migrate(conn, MIGRATIONS_DIR)
    log.info("migrations: %s", ", ".join(done) or "đã mới nhất")
    return 0


def cmd_crawl(args, settings, *, then_notify: bool = False) -> int:
    sources = load_sources(settings.sources_file)
    with db.connect(settings.database_url) as conn:
        if args.migrate:
            db.migrate(conn, MIGRATIONS_DIR)
        with _locked(conn) as ok:
            if not ok:
                return 0
            if not args.dry_run:
                db.sync_sources(conn, sources)
            results = run_crawl(
                conn, settings, sources,
                only=set(args.source) if args.source else None,
                notify=not args.no_notify, dry_run=args.dry_run,
            )
            if then_notify and not args.dry_run and not args.no_notify:
                send_pending(conn, settings, _web_url())
            db.prune_runs(conn)
    new = sum(r.inserted for r in results)
    failed = [r.source_id for r in results if not r.ok]
    log.info("xong: %d nguồn, %d tin mới%s", len(results), new, f", lỗi: {', '.join(failed)}" if failed else "")
    # Exit 0 khi còn ít nhất 1 nguồn OK — launchd không cần biết lỗi lẻ tẻ.
    return 1 if results and len(failed) == len(results) else 0


def cmd_notify(args, settings) -> int:
    with db.connect(settings.database_url) as conn, _locked(conn) as ok:
        if ok:
            send_pending(conn, settings, _web_url())
    return 0


def cmd_sources(args, settings) -> int:
    with db.connect(settings.database_url) as conn:
        rows = conn.execute(
            """SELECT s.id, s.enabled, s.last_success_at, s.consecutive_failures, s.last_error,
                      (SELECT count(*) FROM articles a WHERE a.source_id = s.id) AS total,
                      (SELECT count(*) FROM articles a WHERE a.source_id = s.id
                         AND a.fetched_at > now() - interval '24 hours') AS day
               FROM sources s ORDER BY s.id"""
        ).fetchall()
    print(f"{'id':<14}{'on':<4}{'tổng':>7}{'24h':>6}{'lỗi':>5}  lần OK cuối")
    for r in rows:
        last = r["last_success_at"].astimezone().strftime("%Y-%m-%d %H:%M") if r["last_success_at"] else "—"
        print(f"{r['id']:<14}{'✓' if r['enabled'] else '·':<4}{r['total']:>7}{r['day']:>6}{r['consecutive_failures']:>5}  {last}")
        if r["consecutive_failures"] and r["last_error"]:
            print(f"{'':<14}└ {r['last_error'][:120]}")
    return 0


def cmd_telegram_test(args, settings) -> int:
    if not settings.telegram_enabled:
        log.error("thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID trong .env")
        return 2
    tg = Telegram(settings.telegram_bot_token, settings.telegram_chat_id)  # type: ignore[arg-type]
    me = tg.get_me()
    tg.send(f"👋 Trạm Tin đã kết nối với bot <b>@{me.get('username')}</b>.")
    log.info("đã gửi tin thử qua @%s", me.get("username"))
    return 0


def cmd_telegram_chat_id(args, settings) -> int:
    if not settings.telegram_bot_token:
        log.error("thiếu TELEGRAM_BOT_TOKEN trong .env")
        return 2
    chats = recent_chats(settings.telegram_bot_token)
    if not chats:
        print("Chưa thấy chat nào. Mở Telegram, nhắn /start cho bot rồi chạy lại.")
        return 1
    for c in chats:
        name = c.get("title") or " ".join(x for x in (c.get("first_name"), c.get("last_name")) if x)
        print(f"{c['id']}\t{c.get('type')}\t{name}\t@{c.get('username', '')}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="tram-tin", description="Trạm Tin crawler")
    p.add_argument("--version", action="version", version=__version__)
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    def crawl_args(sp):
        sp.add_argument("--source", action="append", metavar="ID", help="chỉ quét nguồn này (lặp được)")
        sp.add_argument("--no-notify", action="store_true", help="lưu tin nhưng không xếp hàng thông báo")
        sp.add_argument("--dry-run", action="store_true", help="chỉ fetch/parse, không ghi DB")
        sp.add_argument("--no-migrate", dest="migrate", action="store_false", help="bỏ bước migrate")

    crawl_args(sub.add_parser("run", help="migrate + quét + gửi Telegram (dùng cho launchd)"))
    crawl_args(sub.add_parser("crawl", help="chỉ quét"))
    sub.add_parser("notify", help="gửi thông báo đang chờ")
    sub.add_parser("migrate", help="áp dụng migration")
    sub.add_parser("sources", help="trạng thái các nguồn")
    sub.add_parser("telegram-test", help="gửi tin thử")
    sub.add_parser("telegram-chat-id", help="liệt kê chat id đã nhắn bot")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _setup_logging(args.verbose)
    try:
        settings = load_settings()
        match args.cmd:
            case "run":
                return cmd_crawl(args, settings, then_notify=True)
            case "crawl":
                return cmd_crawl(args, settings)
            case "notify":
                return cmd_notify(args, settings)
            case "migrate":
                return cmd_migrate(args, settings)
            case "sources":
                return cmd_sources(args, settings)
            case "telegram-test":
                return cmd_telegram_test(args, settings)
            case "telegram-chat-id":
                return cmd_telegram_chat_id(args, settings)
    except ConfigError as e:
        log.error("cấu hình: %s", e)
        return 2
    except TelegramError as e:
        log.error("telegram: %s", e)
        return 3
    except psycopg.OperationalError as e:
        log.error("không kết nối được Postgres: %s", str(e).strip().splitlines()[0])
        return 4
    return 0


if __name__ == "__main__":
    sys.exit(main())
