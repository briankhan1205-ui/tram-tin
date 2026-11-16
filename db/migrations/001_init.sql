-- Trạm Tin: schema khởi tạo.
-- Nguồn chân lý duy nhất của schema; crawler (`tram-tin migrate`) áp dụng theo thứ tự tên file.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() là STABLE nên không dùng được trong generated column/index.
-- Bọc lại bằng hàm IMMUTABLE với dictionary chỉ định cứng.
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE TABLE sources (
    id                   text PRIMARY KEY,
    name                 text        NOT NULL,
    type                 text        NOT NULL CHECK (type IN ('rss')),
    url                  text        NOT NULL,
    homepage             text,
    max_pages            int         NOT NULL DEFAULT 1 CHECK (max_pages BETWEEN 1 AND 20),
    enabled              boolean     NOT NULL DEFAULT true,
    last_success_at      timestamptz,
    last_error           text,
    last_error_at        timestamptz,
    consecutive_failures int         NOT NULL DEFAULT 0,
    alerted_at           timestamptz,           -- đã cảnh báo Telegram cho chuỗi lỗi hiện tại
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE articles (
    id           bigserial PRIMARY KEY,
    source_id    text        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    url          text        NOT NULL,
    url_hash     char(64)    NOT NULL UNIQUE,   -- sha256(url đã chuẩn hóa)
    guid         text,
    title        text        NOT NULL,
    summary      text,
    content      text,                          -- plain text, chỉ dùng nội bộ (tìm kiếm)
    image_url    text,
    author       text,
    published_at timestamptz NOT NULL,
    fetched_at   timestamptz NOT NULL DEFAULT now(),
    search       tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', f_unaccent(coalesce(title, ''))), 'A') ||
        setweight(to_tsvector('simple', f_unaccent(coalesce(summary, ''))), 'B')
    ) STORED
);

CREATE INDEX articles_published_idx        ON articles (published_at DESC, id DESC);
CREATE INDEX articles_source_published_idx ON articles (source_id, published_at DESC, id DESC);
CREATE INDEX articles_search_idx           ON articles USING gin (search);
CREATE INDEX articles_title_trgm_idx       ON articles USING gin (f_unaccent(lower(title)) gin_trgm_ops);

-- Mỗi nguồn trong mỗi lần quét = 1 dòng.
CREATE TABLE crawl_runs (
    id          bigserial PRIMARY KEY,
    run_id      uuid        NOT NULL,
    source_id   text        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    started_at  timestamptz NOT NULL,
    finished_at timestamptz NOT NULL,
    ok          boolean     NOT NULL,
    pages       int         NOT NULL DEFAULT 0,
    fetched     int         NOT NULL DEFAULT 0,
    inserted    int         NOT NULL DEFAULT 0,
    error       text
);

CREATE INDEX crawl_runs_source_idx ON crawl_runs (source_id, started_at DESC);

-- Outbox: insert cùng transaction với article, worker gửi Telegram sau.
CREATE TABLE notifications (
    id          bigserial PRIMARY KEY,
    article_id  bigint      NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
    status      text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'sent', 'skipped')),
    attempts    int         NOT NULL DEFAULT 0,
    last_error  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    sent_at     timestamptz
);

CREATE INDEX notifications_pending_idx ON notifications (created_at) WHERE status = 'pending';
