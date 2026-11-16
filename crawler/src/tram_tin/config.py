"""Cấu hình: .env ở gốc dự án + config/sources.json."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SOURCES_FILE = PROJECT_ROOT / "config" / "sources.json"
MIGRATIONS_DIR = PROJECT_ROOT / "db" / "migrations"

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")


class ConfigError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Source:
    id: str
    name: str
    type: str
    url: str
    homepage: str | None = None
    max_pages: int = 1
    pagination: str = "none"
    enabled: bool = True


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    telegram_bot_token: str | None
    telegram_chat_id: str | None
    notify_max_age_hours: int
    alert_after_failures: int
    http_timeout: float
    user_agent: str
    sources_file: Path

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.telegram_bot_token and self.telegram_chat_id)


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as e:
        raise ConfigError(f"{name} phải là số nguyên, nhận '{raw}'") from e


def load_settings(env_file: Path | None = None) -> Settings:
    load_dotenv(env_file or PROJECT_ROOT / ".env", override=False)
    db = os.environ.get("DATABASE_URL", "").strip()
    if not db:
        raise ConfigError("Thiếu DATABASE_URL (chạy ops/setup-db.sh để sinh .env)")
    return Settings(
        database_url=db,
        telegram_bot_token=os.environ.get("TELEGRAM_BOT_TOKEN", "").strip() or None,
        telegram_chat_id=os.environ.get("TELEGRAM_CHAT_ID", "").strip() or None,
        notify_max_age_hours=_env_int("NOTIFY_MAX_AGE_HOURS", 24),
        alert_after_failures=max(1, _env_int("ALERT_AFTER_FAILURES", 3)),
        http_timeout=float(_env_int("HTTP_TIMEOUT_SECONDS", 20)),
        user_agent=os.environ.get("HTTP_USER_AGENT", "").strip()
        or "Mozilla/5.0 TramTin/0.1 (personal RSS reader)",
        sources_file=Path(os.environ.get("SOURCES_FILE", DEFAULT_SOURCES_FILE)),
    )


def load_sources(path: Path) -> list[Source]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise ConfigError(f"Không thấy file nguồn: {path}") from e
    except json.JSONDecodeError as e:
        raise ConfigError(f"{path}: JSON lỗi dòng {e.lineno}: {e.msg}") from e

    items = data.get("sources") if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise ConfigError(f"{path}: cần object có mảng 'sources'")

    out: list[Source] = []
    seen: set[str] = set()
    for i, raw in enumerate(items):
        where = f"{path.name}: sources[{i}]"
        if not isinstance(raw, dict):
            raise ConfigError(f"{where} phải là object")
        for key in ("id", "name", "type", "url"):
            if not isinstance(raw.get(key), str) or not raw[key].strip():
                raise ConfigError(f"{where}: thiếu '{key}'")
        sid = raw["id"].strip()
        if not _ID_RE.match(sid):
            raise ConfigError(f"{where}: id '{sid}' chỉ gồm a-z, 0-9, '-'")
        if sid in seen:
            raise ConfigError(f"{where}: trùng id '{sid}'")
        seen.add(sid)
        if raw["type"] != "rss":
            raise ConfigError(f"{where}: type '{raw['type']}' chưa hỗ trợ (chỉ 'rss')")
        if not raw["url"].startswith(("http://", "https://")):
            raise ConfigError(f"{where}: url phải là http(s)")
        max_pages = raw.get("max_pages", 1)
        if not isinstance(max_pages, int) or not 1 <= max_pages <= 20:
            raise ConfigError(f"{where}: max_pages trong khoảng 1..20")
        pagination = raw.get("pagination", "none")
        if pagination not in ("none", "wordpress"):
            raise ConfigError(f"{where}: pagination '{pagination}' không hợp lệ")
        out.append(
            Source(
                id=sid,
                name=raw["name"].strip(),
                type="rss",
                url=raw["url"].strip(),
                homepage=(raw.get("homepage") or None),
                max_pages=max_pages,
                pagination=pagination,
                enabled=bool(raw.get("enabled", True)),
            )
        )
    return out
