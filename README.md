# Trạm Tin

Đọc RSS của các trang tin (BBC Tiếng Việt, RFA, Người Việt…), lưu vào Postgres, hiển thị trên bảng tin nội bộ (Next.js) và gửi tin mới lên Telegram mỗi giờ.

```
launchd (mỗi giờ) ─► crawler (Python) ─► Postgres 18 ◄─ web (Next.js, :3100)
                         │                    │
                         └─ outbox notifications ─► Telegram digest
```

## Cài đặt (máy Mac này)

```bash
make setup      # bật Postgres 18, tạo DB + .env, cài deps, migrate, build web
make crawl      # quét lần đầu (lần đầu của mỗi nguồn chỉ seed, không gửi Telegram)
make install    # LaunchAgent: crawler mỗi giờ, web luôn chạy, backup 03:00
```

Bảng tin: http://127.0.0.1:3100

### Telegram

1. Nhắn `@BotFather` → `/newbot` → chép token vào `TELEGRAM_BOT_TOKEN` trong `.env`.
2. Mở chat với bot vừa tạo, gõ `/start`.
3. `make telegram-chat-id` → chép id vào `TELEGRAM_CHAT_ID`.
4. `make telegram-test` để kiểm tra.

Không cần restart: crawler đọc `.env` mỗi lần chạy.

## Thêm / bớt nguồn

Sửa [config/sources.json](config/sources.json) (schema: [config/sources.schema.json](config/sources.schema.json)). Lần quét sau sẽ tự đồng bộ. Nguồn bị xóa khỏi file thì bị tắt nhưng vẫn giữ bài cũ.

| Trường | Ý nghĩa |
|---|---|
| `id` | `a-z0-9-`, cố định (khóa trong DB) |
| `type` | hiện chỉ có `rss` |
| `pagination` | `wordpress` → lật `?paged=N` tới khi gặp tin đã có (feed WP chỉ trả 10 tin) |
| `max_pages` | trần số trang mỗi lần quét (1..20) |

## Lệnh hay dùng

```bash
make help        # mọi lệnh
make status      # LaunchAgent + tình trạng từng nguồn
make logs        # tail log crawler
make run         # quét + gửi Telegram ngay
make test        # pytest + typecheck
make backup      # pg_dump → backups/ (giữ 14 bản)
```

CLI đầy đủ: `uv --directory crawler run tram-tin --help`. Các tùy chọn: `--source ID`, `--no-notify`, `--dry-run`.

## Hành vi đáng biết

- **Chống trùng**: `sha256` của URL đã chuẩn hóa (bỏ `utm_*`/`www`/`#`, sắp xếp query), đặt `UNIQUE` → chạy lại bao nhiêu lần cũng không trùng.
- **Outbox**: bài mới và dòng `notifications` được ghi trong cùng một transaction. Gửi Telegram lỗi thì tin giữ trạng thái `pending` và được gửi lại ở lần quét sau. Tin quá `NOTIFY_MAX_AGE_HOURS` (24h) thì bỏ, tránh dội bom.
- **Digest**: mỗi giờ gửi 1 tin, gom theo nguồn, tự cắt khi quá 4096 ký tự. Quá 60 tin thì phần dư chỉ hiển thị số lượng.
- **Cảnh báo**: nguồn lỗi `ALERT_AFTER_FAILURES` (3) lần liên tiếp thì bot báo ⚠️. Khi nguồn hồi phục thì báo ✅.
- **Khóa**: `pg_try_advisory_lock` ngăn 2 lần quét chạy chồng nhau (launchd và chạy tay).
- **Máy ngủ**: `StartInterval` của launchd chạy bù khi máy thức dậy.
- **Web**: kết nối DB ở chế độ read-only. Basic auth bật khi đặt `WEB_BASIC_AUTH_USER/PASSWORD`. Mặc định chỉ bind `127.0.0.1`; muốn mở cho mạng LAN thì đặt `WEB_HOST=0.0.0.0` **và** bật Basic auth.

## Cấu trúc

```
config/            sources.json + JSON schema
db/migrations/     SQL thuần, áp dụng theo tên file (bảng schema_migrations)
crawler/           Python 3.12+ (uv): feedparser, httpx, psycopg 3
web/               Next.js 16 App Router, postgres.js, không ORM
ops/               setup-db.sh, backup.sh, launchd.sh + plist templates
```

Khôi phục backup:

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" backups/tram_tin-YYYYMMDD-HHMMSS.dump
```

Thay đổi số 1. 