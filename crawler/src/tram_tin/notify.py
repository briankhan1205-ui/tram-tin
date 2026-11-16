"""Gửi digest tin mới từ outbox `notifications` lên Telegram."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime

import psycopg

from .config import Settings
from .telegram import MAX_LEN, Telegram, TelegramError, esc

log = logging.getLogger(__name__)

MAX_ITEMS_PER_DIGEST = 60   # quá số này thì chỉ đếm, không liệt kê hết
MAX_PER_SOURCE = 20
_SAFETY = 96                # chừa chỗ cho header/footer mỗi tin


@dataclass(slots=True)
class Item:
    notification_id: int
    source_id: str
    source_name: str
    title: str
    url: str
    published_at: datetime


@dataclass(slots=True)
class Message:
    text: str
    ids: list[int] = field(default_factory=list)


def _fmt_time(dt: datetime) -> str:
    local = dt.astimezone()
    today = datetime.now(local.tzinfo).date()
    return local.strftime("%H:%M") if local.date() == today else local.strftime("%d/%m %H:%M")


def build_messages(items: list[Item], web_url: str | None = None) -> list[Message]:
    """Gom theo nguồn, cắt thành nhiều tin ≤ 4096 ký tự. Mỗi Message mang theo id
    các notification nó 'phủ' (kể cả tin chỉ được đếm), để đánh dấu sent sau khi gửi."""
    if not items:
        return []

    by_source: dict[str, list[Item]] = {}
    for it in items:
        by_source.setdefault(it.source_id, []).append(it)

    total = len(items)
    header = f"📰 <b>Trạm Tin</b> · {total} tin mới"
    footer = f'\n\n<a href="{esc(web_url)}">Mở bảng tin</a>' if web_url else ""

    blocks: list[tuple[str, list[int], str]] = []  # (text, ids, tên nguồn)
    listed = 0
    for items_src in sorted(by_source.values(), key=lambda xs: -len(xs)):
        items_src.sort(key=lambda x: x.published_at, reverse=True)
        name = items_src[0].source_name
        budget = max(0, min(MAX_PER_SOURCE, MAX_ITEMS_PER_DIGEST - listed))
        shown, hidden = items_src[:budget], items_src[budget:]
        # Tiêu đề nguồn dính với dòng đầu tiên → không bao giờ bị tách mồ côi khi cắt tin.
        prefix = f"\n\n<b>{esc(name)}</b> ({len(items_src)})"
        for it in shown:
            line = f'\n• <a href="{esc(it.url)}">{esc(it.title)}</a> <i>{_fmt_time(it.published_at)}</i>'
            blocks.append((prefix + line, [it.notification_id], name))
            prefix = ""
        listed += len(shown)
        if hidden:
            blocks.append((prefix + f"\n<i>… và {len(hidden)} tin khác</i>", [x.notification_id for x in hidden], name))

    # Cắt thành nhiều tin; header chèn sau khi biết tổng số phần.
    room = MAX_LEN - len(header) - len(footer) - _SAFETY
    chunks: list[Message] = [Message("")]
    for text, ids, name in blocks:
        cur = chunks[-1]
        if cur.text and len(cur.text) + len(text) > room:
            cur = Message("")
            chunks.append(cur)
            if not text.startswith("\n\n<b>"):  # nguồn bị cắt giữa chừng → nhắc lại tên
                text = f"\n\n<b>{esc(name)}</b> (tiếp)" + text
        cur.text += text
        cur.ids.extend(ids)
    chunks = [c for c in chunks if c.ids]

    n = len(chunks)
    for i, c in enumerate(chunks, 1):
        c.text = (header if n == 1 else f"{header} · {i}/{n}") + c.text
    chunks[-1].text += footer
    return chunks


def expire_old(conn: psycopg.Connection, max_age_hours: int) -> int:
    cur = conn.execute(
        """UPDATE notifications n SET status = 'skipped', last_error = 'quá hạn'
           FROM articles a
           WHERE n.article_id = a.id AND n.status = 'pending'
             AND n.created_at < now() - make_interval(hours => %s)""",
        (max_age_hours,),
    )
    conn.commit()
    return cur.rowcount


def load_pending(conn: psycopg.Connection) -> list[Item]:
    rows = conn.execute(
        """SELECT n.id, a.source_id, s.name, a.title, a.url, a.published_at
           FROM notifications n
           JOIN articles a ON a.id = n.article_id
           JOIN sources s  ON s.id = a.source_id
           WHERE n.status = 'pending'
           ORDER BY a.published_at DESC
           LIMIT 1000"""
    ).fetchall()
    return [Item(r["id"], r["source_id"], r["name"], r["title"], r["url"], r["published_at"]) for r in rows]


def send_pending(conn: psycopg.Connection, settings: Settings, web_url: str | None = None) -> int:
    """Trả số notification đã gửi. Không cấu hình Telegram → để pending (sẽ hết hạn sau N giờ)."""
    expired = expire_old(conn, settings.notify_max_age_hours)
    if expired:
        log.info("bỏ %d thông báo quá %dh", expired, settings.notify_max_age_hours)
    items = load_pending(conn)
    if not items:
        return 0
    if not settings.telegram_enabled:
        log.warning("chưa cấu hình TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID → %d tin đang chờ", len(items))
        return 0

    tg = Telegram(settings.telegram_bot_token, settings.telegram_chat_id)  # type: ignore[arg-type]
    sent = 0
    for msg in build_messages(items, web_url):
        try:
            tg.send(msg.text)
        except TelegramError as e:
            conn.execute(
                "UPDATE notifications SET attempts = attempts + 1, last_error = %s WHERE id = ANY(%s)",
                (str(e)[:500], msg.ids),
            )
            conn.commit()
            log.error("gửi Telegram lỗi: %s", e)
            if e.fatal:
                break
            continue
        conn.execute(
            "UPDATE notifications SET status = 'sent', sent_at = now(), attempts = attempts + 1, "
            "last_error = NULL WHERE id = ANY(%s)",
            (msg.ids,),
        )
        conn.commit()
        sent += len(msg.ids)
    log.info("đã gửi %d/%d tin lên Telegram", sent, len(items))
    return sent


def send_alert(settings: Settings, text_html: str) -> bool:
    if not settings.telegram_enabled:
        log.warning("cảnh báo (không gửi được vì chưa cấu hình Telegram): %s", text_html)
        return False
    try:
        Telegram(settings.telegram_bot_token, settings.telegram_chat_id).send(text_html)  # type: ignore[arg-type]
        return True
    except TelegramError as e:
        log.error("gửi cảnh báo lỗi: %s", e)
        return False
