"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { TouchInput } from "./asteroids";
import css from "./game.module.css";

type Flag = keyof TouchInput;

export function GameClient({ font, fontClass }: { font: string; fontClass: string }) {
  const host = useRef<HTMLDivElement>(null);
  const touch = useRef<TouchInput>({ left: false, right: false, thrust: false, fire: false, hyper: false });

  useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;
    (async () => {
      const [mod, { createGame }] = await Promise.all([import("phaser"), import("./asteroids")]);
      const PH = ((mod as { default?: unknown }).default ?? mod) as typeof import("phaser");
      try {
        await document.fonts.load(`700 20px ${font}`);
      } catch {
        /* font lỗi → dùng fallback */
      }
      if (disposed || !host.current) return;
      dispose = createGame(PH, host.current, touch.current, font);
    })();
    return () => {
      disposed = true;
      dispose?.();
    };
  }, [font]);

  const btn = (flag: Flag, label: string, cls = "") => (
    <button
      type="button"
      aria-label={flag}
      className={`${css.btn} ${cls}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        touch.current[flag] = true;
      }}
      onPointerUp={() => (touch.current[flag] = false)}
      onPointerCancel={() => (touch.current[flag] = false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );

  return (
    <div className={`${css.root} ${fontClass}`}>
      <div ref={host} className={css.stage} />
      <Link href="/" className={css.back}>
        ← Bảng tin
      </Link>
      <div className={css.pad}>
        <div className={css.group}>
          {btn("left", "⟲")}
          {btn("right", "⟳")}
        </div>
        <div className={css.group}>
          {btn("hyper", "✦", css.small)}
          {btn("thrust", "▲")}
          {btn("fire", "●", css.fire)}
        </div>
      </div>
    </div>
  );
}
