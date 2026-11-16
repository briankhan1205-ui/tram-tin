import raw from "@/data/shop-products.json";

export type Product = {
  id: number;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  brand: string | null;
  /** Giá niêm yết (VND). */
  price: number;
  discountPercent: number;
  rating: number;
  stock: number;
  sizes: string[];
  thumbnail: string;
  images: string[];
};

/** Bản rút gọn gửi xuống client cho giỏ hàng. */
export type CatalogEntry = Pick<Product, "id" | "title" | "thumbnail"> & { price: number };

export const products: Product[] = raw;

export const categories: { slug: string; label: string; count: number }[] = [
  ...products
    .reduce((m, p) => {
      const c = m.get(p.category) ?? { slug: p.category, label: p.categoryLabel, count: 0 };
      c.count++;
      return m.set(p.category, c);
    }, new Map<string, { slug: string; label: string; count: number }>())
    .values(),
];

export const getProduct = (id: number) => products.find((p) => p.id === id);

/** Giá sau giảm, làm tròn nghìn. */
export const salePrice = (p: Pick<Product, "price" | "discountPercent">) =>
  Math.round((p.price * (100 - p.discountPercent)) / 100_000) * 1000;

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
export const formatVnd = (n: number) => vnd.format(n);

export const catalog: CatalogEntry[] = products.map((p) => ({
  id: p.id,
  title: p.title,
  thumbnail: p.thumbnail,
  price: salePrice(p),
}));
