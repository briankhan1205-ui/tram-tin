#!/usr/bin/env node
// Lấy dữ liệu quần áo mẫu từ dummyjson.com → web/data/shop-products.json
//   node web/scripts/seed-shop.mjs
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATEGORIES = {
  "mens-shirts": "Áo sơ mi nam",
  "womens-dresses": "Đầm nữ",
  tops: "Áo kiểu nữ",
};
const USD_VND = 25_000;
const SIZES = ["S", "M", "L", "XL"];
const IMG_HOST = "cdn.dummyjson.com";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/shop-products.json");

const img = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname === IMG_HOST ? url.href : null;
  } catch {
    return null;
  }
};

const products = [];
for (const [slug, label] of Object.entries(CATEGORIES)) {
  const res = await fetch(`https://dummyjson.com/products/category/${slug}?limit=30`, {
    headers: { "user-agent": "seed-script" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const { products: rows } = await res.json();
  for (const p of rows) {
    const images = [p.thumbnail, ...(p.images ?? [])].map(img).filter(Boolean);
    if (!images.length) continue;
    products.push({
      id: Number(p.id),
      title: String(p.title),
      description: String(p.description ?? ""),
      category: slug,
      categoryLabel: label,
      brand: p.brand ? String(p.brand) : null,
      price: Math.round((Number(p.price) * USD_VND) / 1000) * 1000,
      discountPercent: Math.round(Number(p.discountPercentage) || 0),
      rating: Number(p.rating) || 0,
      stock: Number(p.stock) || 0,
      sizes: SIZES,
      thumbnail: images[0],
      images: [...new Set(images.slice(1).length ? images.slice(1) : images)],
    });
  }
}

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(products, null, 2) + "\n");
console.log(`✓ ${products.length} sản phẩm → ${path.relative(process.cwd(), out)}`);
