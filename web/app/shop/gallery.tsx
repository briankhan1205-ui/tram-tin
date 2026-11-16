"use client";

import { useState } from "react";

export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const main = images[i] ?? images[0];
  if (!main) return null;

  return (
    <div className="gallery">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gallery-main" src={main} alt={alt} referrerPolicy="no-referrer" />
      {images.length > 1 && (
        <div className="gallery-thumbs">
          {images.map((src, n) => (
            <button
              key={src}
              type="button"
              className={n === i ? "on" : undefined}
              onClick={() => setI(n)}
              aria-label={`Ảnh ${n + 1}`}
              aria-pressed={n === i}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
