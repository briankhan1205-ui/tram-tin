import "server-only";
import { db } from "./db";

export const PAGE_SIZE = 40;

export type Article = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  summary: string | null;
  url: string;
  imageUrl: string | null;
  publishedAt: Date;
};

export type SourceStat = {
  id: string;
  name: string;
  homepage: string | null;
  lastSuccessAt: Date | null;
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorAt: Date | null;
  total: number;
  last24h: number;
};

export type Cursor = { ts: Date; id: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.ts.toISOString()}|${c.id}`).toString("base64url");
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const [iso, id] = Buffer.from(raw, "base64url").toString().split("|");
    const ts = new Date(iso ?? "");
    if (Number.isNaN(ts.getTime()) || !/^\d{1,18}$/.test(id ?? "")) return null;
    return { ts, id: id! };
  } catch {
    return null;
  }
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function listArticles(opts: {
  source?: string;
  q?: string;
  cursor?: Cursor | null;
  limit?: number;
}): Promise<{ items: Article[]; next: string | null }> {
  const sql = db();
  const limit = opts.limit ?? PAGE_SIZE;
  const q = opts.q?.trim().slice(0, 200) || null;

  const rows = await sql<
    {
      id: string;
      source_id: string;
      source_name: string;
      title: string;
      summary: string | null;
      url: string;
      image_url: string | null;
      published_at: Date;
    }[]
  >`
    SELECT a.id::text, a.source_id, s.name AS source_name, a.title, a.summary,
           a.url, a.image_url, a.published_at
    FROM articles a
    JOIN sources s ON s.id = a.source_id
    WHERE s.enabled
      ${opts.source ? sql`AND a.source_id = ${opts.source}` : sql``}
      ${
        q
          ? sql`AND (a.search @@ websearch_to_tsquery('simple', f_unaccent(${q}))
                 OR f_unaccent(lower(a.title)) LIKE '%' || f_unaccent(lower(${likeEscape(q)})) || '%')`
          : sql``
      }
      ${
        opts.cursor
          ? sql`AND (a.published_at, a.id) < (${opts.cursor.ts}, ${opts.cursor.id}::bigint)`
          : sql``
      }
    ORDER BY a.published_at DESC, a.id DESC
    LIMIT ${limit + 1}
  `;

  const items: Article[] = rows.slice(0, limit).map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceName: r.source_name,
    title: r.title,
    summary: r.summary,
    url: r.url,
    imageUrl: r.image_url,
    publishedAt: r.published_at,
  }));
  const last = items.at(-1);
  return { items, next: rows.length > limit && last ? encodeCursor({ ts: last.publishedAt, id: last.id }) : null };
}

export async function listSources(): Promise<SourceStat[]> {
  const sql = db();
  const rows = await sql<
    {
      id: string;
      name: string;
      homepage: string | null;
      last_success_at: Date | null;
      consecutive_failures: number;
      last_error: string | null;
      last_error_at: Date | null;
      total: number;
      last24h: number;
    }[]
  >`
    SELECT s.id, s.name, s.homepage, s.last_success_at, s.consecutive_failures,
           s.last_error, s.last_error_at,
           count(a.id)::int AS total,
           count(a.id) FILTER (WHERE a.published_at > now() - interval '24 hours')::int AS last24h
    FROM sources s
    LEFT JOIN articles a ON a.source_id = s.id
    WHERE s.enabled
    GROUP BY s.id
    ORDER BY s.name
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    homepage: r.homepage,
    lastSuccessAt: r.last_success_at,
    consecutiveFailures: r.consecutive_failures,
    lastError: r.last_error,
    lastErrorAt: r.last_error_at,
    total: r.total,
    last24h: r.last24h,
  }));
}

export async function lastCrawlAt(): Promise<Date | null> {
  const sql = db();
  const [row] = await sql<{ at: Date | null }[]>`SELECT max(finished_at) AS at FROM crawl_runs`;
  return row?.at ?? null;
}
