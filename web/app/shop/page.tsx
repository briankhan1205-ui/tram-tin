import Link from "next/link";
import { categories, formatVnd, products, salePrice } from "@/lib/shop";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Shop({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).cat;
  const param = Array.isArray(raw) ? raw[0] : raw;
  const cat = categories.find((c) => c.slug === param)?.slug;
  const items = cat ? products.filter((p) => p.category === cat) : products;

  return (
    <main>
      <nav className="chips" aria-label="Danh mục">
        <Link href="/shop" className={!cat ? "chip on" : "chip"}>
          Tất cả
          <span className="count">{products.length}</span>
        </Link>
        {categories.map((c) => (
          <Link key={c.slug} href={`/shop?cat=${c.slug}`} className={cat === c.slug ? "chip on" : "chip"}>
            {c.label}
            <span className="count">{c.count}</span>
          </Link>
        ))}
      </nav>

      <ul className="grid">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/shop/${p.id}`} className="card">
              <div className="card-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbnail} alt={p.title} loading="lazy" referrerPolicy="no-referrer" />
                {p.discountPercent > 0 && <span className="tag">−{p.discountPercent}%</span>}
              </div>
              <div className="card-cat">{p.categoryLabel}</div>
              <h2 className="card-title">{p.title}</h2>
              <div className="price">
                <strong>{formatVnd(salePrice(p))}</strong>
                {p.discountPercent > 0 && <s>{formatVnd(p.price)}</s>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
