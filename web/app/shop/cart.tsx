"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type CatalogEntry, formatVnd } from "@/lib/shop";

/* ── store: giỏ tạm trong localStorage, đồng bộ giữa các tab ── */

type Line = { id: number; size: string; qty: number };

const KEY = "tram-tin:cart:v1";
const MAX_QTY = 99;
const EMPTY: Line[] = [];
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: Line[] = EMPTY;
let memory: string | null = null; // dự phòng khi localStorage bị chặn

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memory;
  }
}

function parse(raw: string | null): Line[] {
  if (!raw) return EMPTY;
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return EMPTY;
    return v.filter(
      (l): l is Line =>
        !!l && Number.isInteger(l.id) && typeof l.size === "string" && Number.isInteger(l.qty) && l.qty > 0,
    );
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): Line[] {
  const raw = readRaw();
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = parse(raw);
  }
  return cache;
}

function write(next: Line[]) {
  const raw = JSON.stringify(next);
  memory = raw;
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* private mode / quota: giữ trong bộ nhớ */
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && fn();
  listeners.add(fn);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

const clamp = (n: number) => Math.max(1, Math.min(MAX_QTY, n));

const actions = {
  add(id: number, size: string, qty = 1) {
    const lines = getSnapshot();
    const hit = lines.find((l) => l.id === id && l.size === size);
    write(
      hit
        ? lines.map((l) => (l === hit ? { ...l, qty: clamp(l.qty + qty) } : l))
        : [...lines, { id, size, qty: clamp(qty) }],
    );
  },
  setQty(id: number, size: string, qty: number) {
    write(
      qty < 1
        ? getSnapshot().filter((l) => !(l.id === id && l.size === size))
        : getSnapshot().map((l) => (l.id === id && l.size === size ? { ...l, qty: clamp(qty) } : l)),
    );
  },
  clear: () => write([]),
};

/* ── context ── */

type Ctx = { open: () => void };
const CartCtx = createContext<Ctx | null>(null);

const useCartCtx = () => {
  const c = useContext(CartCtx);
  if (!c) throw new Error("Thiếu <CartProvider>");
  return c;
};

const useLines = () => useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

export function CartProvider({ catalog, children }: { catalog: CatalogEntry[]; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const ctx = useMemo<Ctx>(() => ({ open: () => ref.current?.showModal() }), []);
  return (
    <CartCtx.Provider value={ctx}>
      {children}
      <CartDrawer ref={ref} catalog={catalog} />
    </CartCtx.Provider>
  );
}

export function CartButton() {
  const { open } = useCartCtx();
  const count = useLines().reduce((n, l) => n + l.qty, 0);
  return (
    <button type="button" className="cart-btn" onClick={open} aria-label={`Giỏ hàng, ${count} món`}>
      Giỏ hàng
      <span className="cart-badge" data-empty={count === 0}>
        {count}
      </span>
    </button>
  );
}

export function AddToCart({ id, sizes, disabled }: { id: number; sizes: string[]; disabled?: boolean }) {
  const { open } = useCartCtx();
  const [size, setSize] = useState(sizes[0] ?? "");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 1800);
    return () => clearTimeout(t);
  }, [added]);

  return (
    <div className="buy">
      <fieldset className="sizes">
        <legend>Size</legend>
        {sizes.map((s) => (
          <label key={s} className={s === size ? "size on" : "size"}>
            <input type="radio" name="size" value={s} checked={s === size} onChange={() => setSize(s)} />
            {s}
          </label>
        ))}
      </fieldset>

      <div className="buy-row">
        <Stepper value={qty} onChange={(n) => setQty(clamp(n))} min={1} />
        <button
          type="button"
          className="btn-primary"
          disabled={disabled || !size}
          onClick={() => {
            actions.add(id, size, qty);
            setAdded(true);
          }}
        >
          {disabled ? "Hết hàng" : added ? "Đã thêm ✓" : "Bỏ vào giỏ"}
        </button>
      </div>

      <p className="buy-note" role="status">
        {added && (
          <>
            Đã bỏ vào giỏ.{" "}
            <button type="button" className="linklike" onClick={open}>
              Xem giỏ
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function Stepper({ value, onChange, min }: { value: number; onChange: (n: number) => void; min: number }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Giảm">
        −
      </button>
      <output aria-label="Số lượng">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= MAX_QTY} aria-label="Tăng">
        +
      </button>
    </div>
  );
}

function CartDrawer({ ref, catalog }: { ref: React.RefObject<HTMLDialogElement | null>; catalog: CatalogEntry[] }) {
  const lines = useLines();
  const byId = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);
  const rows = lines.flatMap((l) => {
    const p = byId.get(l.id);
    return p ? [{ ...l, p }] : [];
  });
  const total = rows.reduce((n, r) => n + r.p.price * r.qty, 0);
  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      className="cart"
      aria-labelledby="cart-title"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="cart-inner">
        <header className="cart-head">
          <h2 id="cart-title">Giỏ hàng tạm</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Đóng giỏ hàng">
            ✕
          </button>
        </header>

        {rows.length === 0 ? (
          <p className="cart-empty">Giỏ đang trống. Lựa đồ đi nào!</p>
        ) : (
          <ul className="cart-list">
            {rows.map(({ id, size, qty, p }) => (
              <li key={`${id}:${size}`} className="cart-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbnail} alt="" width={64} height={64} loading="lazy" referrerPolicy="no-referrer" />
                <div className="cart-line-body">
                  <Link href={`/shop/${id}`} onClick={close} className="cart-line-title">
                    {p.title}
                  </Link>
                  <div className="cart-line-meta">
                    Size {size} · {formatVnd(p.price)}
                  </div>
                  <div className="cart-line-ctl">
                    <Stepper value={qty} onChange={(n) => actions.setQty(id, size, n)} min={0} />
                    <button type="button" className="linklike" onClick={() => actions.setQty(id, size, 0)}>
                      Xóa
                    </button>
                  </div>
                </div>
                <div className="cart-line-sum">{formatVnd(p.price * qty)}</div>
              </li>
            ))}
          </ul>
        )}

        <footer className="cart-foot">
          <div className="cart-total">
            <span>Tạm tính</span>
            <strong>{formatVnd(total)}</strong>
          </div>
          <p className="cart-hint">Giỏ tạm, chỉ lưu trên trình duyệt này. Chưa có thanh toán.</p>
          {rows.length > 0 && (
            <button type="button" className="btn" onClick={actions.clear}>
              Xóa hết giỏ
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
