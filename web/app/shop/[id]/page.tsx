import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatVnd, getProduct, products, salePrice } from "@/lib/shop";
import { AddToCart } from "../cart";
import { Gallery } from "../gallery";

type Params = Promise<{ id: string }>;

export const dynamicParams = false;
export const generateStaticParams = () => products.map((p) => ({ id: String(p.id) }));

const find = (id: string) => (/^\d+$/.test(id) ? getProduct(Number(id)) : undefined);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = find((await params).id);
  return p ? { title: p.title, description: p.description } : {};
}

export default async function ProductPage({ params }: { params: Params }) {
  const p = find((await params).id);
  if (!p) notFound();
  const related = products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);

  return (
    <main>
      <nav className="crumbs" aria-label="Đường dẫn">
        <Link href="/shop">Tất cả</Link> / <Link href={`/shop?cat=${p.category}`}>{p.categoryLabel}</Link>
      </nav>

      <article className="detail">
        <Gallery images={p.images} alt={p.title} />

        <div className="detail-info">
          {p.brand && <div className="card-cat">{p.brand}</div>}
          <h1 className="detail-title">{p.title}</h1>
          <div className="detail-meta">
            ★ {p.rating.toFixed(1)} · {p.stock > 0 ? `Còn ${p.stock} cái` : "Hết hàng"}
          </div>
          <div className="price price-lg">
            <strong>{formatVnd(salePrice(p))}</strong>
            {p.discountPercent > 0 && (
              <>
                <s>{formatVnd(p.price)}</s>
                <span className="tag tag-inline">−{p.discountPercent}%</span>
              </>
            )}
          </div>
          <p className="detail-desc">{p.description}</p>
          <AddToCart id={p.id} sizes={p.sizes} disabled={p.stock <= 0} />
        </div>
      </article>

      {related.length > 0 && (
        <section className="related">
          <h2 className="side-title">Cùng danh mục</h2>
          <ul className="grid grid-sm">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/shop/${r.id}`} className="card">
                  <div className="card-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumbnail} alt={r.title} loading="lazy" referrerPolicy="no-referrer" />
                  </div>
                  <h3 className="card-title">{r.title}</h3>
                  <div className="price">
                    <strong>{formatVnd(salePrice(r))}</strong>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
