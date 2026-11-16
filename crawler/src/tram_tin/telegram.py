"""Telegram Bot API tối giản (sendMessage + getUpdates)."""

from __future__ import annotations

import html
import time

import httpx

API = "https://api.telegram.org/bot{token}/{method}"
MAX_LEN = 4096


class TelegramError(RuntimeError):
    def __init__(self, message: str, *, fatal: bool = False) -> None:
        super().__init__(message)
        self.fatal = fatal  # lỗi cấu hình (token/chat sai) → đừng retry trong lần chạy này


def esc(text: str) -> str:
    return html.escape(text, quote=True)


class Telegram:
    def __init__(self, token: str, chat_id: str, client: httpx.Client | None = None) -> None:
        self.token = token
        self.chat_id = chat_id
        self.client = client or httpx.Client(timeout=20.0)
        self._last_sent = 0.0

    def _call(self, method: str, payload: dict) -> dict:
        url = API.format(token=self.token, method=method)
        for attempt in range(3):
            try:
                r = self.client.post(url, json=payload)
            except httpx.HTTPError as e:
                if attempt == 2:
                    raise TelegramError(f"network: {type(e).__name__}") from e
                time.sleep(2 ** (attempt + 1))
                continue
            try:
                data = r.json()
            except ValueError:
                data = {"ok": False, "description": f"HTTP {r.status_code}"}
            if data.get("ok"):
                return data["result"]
            desc = data.get("description", f"HTTP {r.status_code}")
            if r.status_code == 429:
                retry = int((data.get("parameters") or {}).get("retry_after", 5))
                time.sleep(min(retry, 60))
                continue
            if r.status_code >= 500 and attempt < 2:
                time.sleep(2 ** (attempt + 1))
                continue
            # 400 chat not found / 401 token sai / 403 bị chặn → lỗi cấu hình
            raise TelegramError(f"{method}: {desc}", fatal=r.status_code in (400, 401, 403, 404))
        raise TelegramError(f"{method}: hết lượt retry")

    def send(self, text_html: str) -> None:
        if len(text_html) > MAX_LEN:
            raise ValueError(f"tin nhắn dài {len(text_html)} > {MAX_LEN}")
        # Giới hạn ~1 tin/giây cho mỗi chat.
        wait = 1.1 - (time.monotonic() - self._last_sent)
        if wait > 0:
            time.sleep(wait)
        self._call(
            "sendMessage",
            {
                "chat_id": self.chat_id,
                "text": text_html,
                "parse_mode": "HTML",
                "link_preview_options": {"is_disabled": True},
            },
        )
        self._last_sent = time.monotonic()

    def get_me(self) -> dict:
        return self._call("getMe", {})


def recent_chats(token: str) -> list[dict]:
    """Liệt kê chat đã nhắn bot gần đây (để lấy TELEGRAM_CHAT_ID)."""
    r = httpx.post(API.format(token=token, method="getUpdates"), json={"limit": 100}, timeout=20.0)
    data = r.json()
    if not data.get("ok"):
        raise TelegramError(data.get("description", "getUpdates lỗi"), fatal=True)
    chats: dict[int, dict] = {}
    for upd in data["result"]:
        msg = upd.get("message") or upd.get("channel_post") or upd.get("my_chat_member") or {}
        chat = msg.get("chat")
        if chat:
            chats[chat["id"]] = chat
    return list(chats.values())
