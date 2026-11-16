import type { Metadata } from "next";
import Link from "next/link";
import { catalog } from "@/lib/shop";
import { CartButton, CartProvider } from "./cart";
import "./shop.css";

export const metadata: Metadata = {
  title: { default: "Tiệm Đồ Xóm Trọ", template: "%s · Tiệm Đồ Xóm Trọ" },
  description: "Quần áo mẫu: xem hàng, xem chi tiết, bỏ vào giỏ tạm",
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider catalog={catalog}>
      <div className="shell">
        <header className="top shop-top">
          <Link href="/shop" className="brand">
            <span className="brand-mark" aria-hidden />
            Tiệm Đồ Xóm Trọ
          </Link>
          <Link href="/" className="back-link">
            ← Bảng tin
          </Link>
          <CartButton />
        </header>
        {children}
      </div>
    </CartProvider>
  );
}
