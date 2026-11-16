import Link from "next/link";
import { AutoRefresh } from "./auto-refresh";
import { dayKey, dayLabel, formatFull, formatTime, safeHttpUrl, timeAgo } from "@/lib/format";
import { type Article, decodeCursor, lastCrawlAt, listArticles, listSources } from "@/lib/queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function href(params: { source?: string; q?: string; before?: string }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

function groupByDay(items: Article[]) {
  const groups: { key: string; label: string; items: Article[] }[] = [];
  for (const a of items) {
    const key = dayKey(a.publishedAt);
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      g = { key, label: dayLabel(a.publishedAt), items: [] };
      groups.push(g);
    }
    g.items.push(a);
  }
  return groups;
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q);
  const sourceParam = one(sp.source);
  const cursor = decodeCursor(one(sp.before));

  const [sources, crawledAt] = await Promise.all([listSources(), lastCrawlAt()]);
  const source = sources.some((s) => s.id === sourceParam) ? sourceParam : undefined;
  const { items, next } = await listArticles({ source, q, cursor });
  const groups = groupByDay(items);
  const total24h = sources.reduce((n, s) => n + s.last24h, 0);
  const broken = sources.filter((s) => s.consecutiveFailures > 0);

  return (
    <div className="shell">
      <AutoRefresh seconds={60} />

      <header className="top">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden />
          Trạm Tin
        </Link>
        <form className="search" action="/" method="get" role="search">
          {source && <input type="hidden" name="source" value={source} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Tìm tiêu đề, tóm tắt… (gõ không dấu được)"
            aria-label="Tìm kiếm"
            maxLength={200}
          />
        </form>
        <p className="meta" title={crawledAt ? formatFull(crawledAt) : undefined}>
          Quét lần cuối: {timeAgo(crawledAt)} · {total24h} tin/24h
        </p>
      </header>

      <nav className="chips" aria-label="Lọc theo nguồn">
        <Link href={href({ q })} className={!source ? "chip on" : "chip"}>
          Tất cả
        </Link>
        {sources.map((s) => (
          <Link key={s.id} href={href({ source: s.id, q })} className={source === s.id ? "chip on" : "chip"}>
            {s.name}
            <span className="count">{s.last24h}</span>
            {s.consecutiveFailures > 0 && <span className="dot-bad" title="Nguồn đang lỗi" />}
          </Link>
        ))}
      </nav>

      <div className="layout">
        <main>
          {(q || cursor) && (
            <p className="status-line">
              {q && (
                <>
                  Kết quả cho <strong>“{q}”</strong> ·{" "}
                </>
              )}
              {cursor && <>Đang xem tin cũ hơn · </>}
              <Link href={href({ source })}>Xóa lọc</Link>
            </p>
          )}

          {items.length === 0 ? (
            <div className="empty">
              {q ? "Không tìm thấy tin nào khớp." : "Chưa có tin. Chạy crawler: make crawl"}
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="day">
                <h2 className="day-label">{g.label}</h2>
                <ol className="list">
                  {g.items.map((a) => {
                    const url = safeHttpUrl(a.url) ?? "#";
                    const img = safeHttpUrl(a.imageUrl);
                    return (
                      <li key={a.id} className="item">
                        <div className="item-body">
                          <div className="item-meta">
                            <span className={`src src-${a.sourceId}`}>{a.sourceName}</span>
                            <time dateTime={a.publishedAt.toISOString()} title={formatFull(a.publishedAt)}>
                              {formatTime(a.publishedAt)}
                            </time>
                          </div>
                          <h3 className="item-title">
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {a.title}
                            </a>
                          </h3>
                          {a.summary && <p className="item-summary">{a.summary}</p>}
                        </div>
                        {img && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="thumb" src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))
          )}

          {next && (
            <div className="more">
              <Link href={href({ source, q, before: next })} className="btn">
                Xem tin cũ hơn
              </Link>
            </div>
          )}
        </main>

        <aside className="side">
          <h2 className="side-title">Tình trạng nguồn</h2>
          <ul className="health">
            {sources.map((s) => {
              const home = safeHttpUrl(s.homepage);
              return (
                <li key={s.id} className={s.consecutiveFailures ? "bad" : "ok"}>
                  <div className="health-row">
                    <span className="health-dot" aria-hidden />
                    {home ? (
                      <a href={home} target="_blank" rel="noopener noreferrer">
                        {s.name}
                      </a>
                    ) : (
                      s.name
                    )}
                  </div>
                  <div className="health-meta">
                    OK {timeAgo(s.lastSuccessAt)} · {s.total} tin
                  </div>
                  {s.consecutiveFailures > 0 && (
                    <div className="health-err" title={s.lastError ?? undefined}>
                      Lỗi {s.consecutiveFailures} lần: {(s.lastError ?? "").slice(0, 90)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {broken.length === 0 && <p className="side-note">Mọi nguồn đều ổn ✓</p>}
        </aside>
      </div>
    </div>
  );
}
