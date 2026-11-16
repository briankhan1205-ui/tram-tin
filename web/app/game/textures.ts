import type Phaser from "phaser";

// Toàn bộ đồ hoạ được vẽ thủ tục bằng Canvas 2D lúc khởi động — không có file ảnh.
export const RADII = [48, 28, 15] as const;
export const VARIANTS = 6;
const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const PALETTES: [string, string, string, string][] = [
  ["#c2a68c", "#6b5548", "#211719", "#f0cfa8"], // đá nâu
  ["#a9c0d6", "#4d5f78", "#121827", "#d8ecff"], // băng xanh xám
  ["#b996c9", "#5c4170", "#1a1124", "#ecd0ff"], // tinh thể tím
];

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  draw(t.getContext());
  t.refresh();
}

function glow(scene: Phaser.Scene, key: string, size: number, stops: [number, string][]) {
  make(scene, key, size, size, (c) => {
    const h = size / 2;
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    for (const [o, col] of stops) g.addColorStop(o, col);
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  });
}

function drawRock(c: CanvasRenderingContext2D, S: number, r: number, pal: [string, string, string, string]) {
  const cx = S / 2;
  const n = 12 + Math.floor(Math.random() * 7);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd(-0.15, 0.15);
    const rr = r * rnd(0.74, 1);
    pts.push([cx + Math.cos(a) * rr, cx + Math.sin(a) * rr]);
  }
  const path = () => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  };

  // Thân + quầng sáng mép
  c.save();
  path();
  c.shadowColor = pal[3] + "55";
  c.shadowBlur = 10;
  const g = c.createRadialGradient(cx - r * 0.35, cx - r * 0.4, r * 0.1, cx, cx, r * 1.15);
  g.addColorStop(0, pal[0]);
  g.addColorStop(0.55, pal[1]);
  g.addColorStop(1, pal[2]);
  c.fillStyle = g;
  c.fill();
  c.restore();

  c.save();
  path();
  c.clip();
  // Hố va chạm
  const nc = Math.max(2, Math.round(r / 7));
  for (let k = 0; k < nc; k++) {
    const cr = r * rnd(0.08, 0.24);
    const a = rnd(0, TAU);
    const d = r * rnd(0, 0.62);
    const x = cx + Math.cos(a) * d;
    const y = cx + Math.sin(a) * d;
    const cg = c.createRadialGradient(x - cr * 0.3, y - cr * 0.3, cr * 0.1, x, y, cr);
    cg.addColorStop(0, "rgba(0,0,0,0.5)");
    cg.addColorStop(1, "rgba(0,0,0,0.06)");
    c.fillStyle = cg;
    c.beginPath();
    c.arc(x, y, cr, 0, TAU);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.16)";
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x, y, cr * 0.95, -0.3, 1.9);
    c.stroke();
  }
  // Hạt bụi lấp lánh
  for (let k = 0; k < r * 1.2; k++) {
    c.fillStyle = `rgba(255,255,255,${rnd(0.03, 0.12)})`;
    c.fillRect(cx + rnd(-r, r), cx + rnd(-r, r), 1, 1);
  }
  // Vùng tối phía sau (ánh sáng từ góc trên trái)
  const sh = c.createRadialGradient(cx + r * 0.7, cx + r * 0.7, 0, cx + r * 0.7, cx + r * 0.7, r * 1.4);
  sh.addColorStop(0, "rgba(0,0,0,0.55)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = sh;
  c.fillRect(0, 0, S, S);
  c.restore();

  path();
  c.lineWidth = 1.5;
  c.strokeStyle = pal[3] + "99";
  c.stroke();
}

export function generateTextures(scene: Phaser.Scene) {
  // Phi thuyền (mũi hướng sang phải = rotation 0)
  make(scene, "ship", 64, 64, (c) => {
    c.translate(32, 32);
    c.lineJoin = "round";
    c.shadowColor = "#38f6ff";
    c.shadowBlur = 12;
    const g = c.createLinearGradient(-18, 0, 24, 0);
    g.addColorStop(0, "#0b2d44");
    g.addColorStop(0.6, "#1fa6c9");
    g.addColorStop(1, "#c8fbff");
    c.beginPath();
    c.moveTo(24, 0);
    c.lineTo(-14, -19);
    c.lineTo(-8, -7);
    c.lineTo(-13, 0);
    c.lineTo(-8, 7);
    c.lineTo(-14, 19);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = "#d4feff";
    c.stroke();
    c.shadowColor = "#ff4fd8";
    c.strokeStyle = "#ff7ae4";
    c.beginPath();
    c.moveTo(-12, -16);
    c.lineTo(3, -9);
    c.moveTo(-12, 16);
    c.lineTo(3, 9);
    c.stroke();
    c.shadowColor = "#ffffff";
    c.shadowBlur = 8;
    const k = c.createRadialGradient(6, -1, 0, 4, 0, 7);
    k.addColorStop(0, "#ffffff");
    k.addColorStop(0.5, "#9af7ff");
    k.addColorStop(1, "#1b5a7a");
    c.fillStyle = k;
    c.beginPath();
    c.ellipse(4, 0, 7, 3.6, 0, 0, TAU);
    c.fill();
  });

  // Thiên thạch: 3 cỡ × nhiều biến thể
  RADII.forEach((r, size) => {
    const S = r * 2 + 16;
    for (let v = 0; v < VARIANTS; v++) make(scene, `ast${size}_${v}`, S, S, (c) => drawRock(c, S, r, PALETTES[v % PALETTES.length]!));
  });

  glow(scene, "spark", 16, [[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,0.6)"], [1, "rgba(255,255,255,0)"]]);
  glow(scene, "bullet", 20, [[0, "#ffffff"], [0.25, "rgba(160,255,255,0.95)"], [0.6, "rgba(40,220,255,0.35)"], [1, "rgba(0,180,255,0)"]]);
  glow(scene, "ebullet", 20, [[0, "#ffffff"], [0.25, "rgba(255,170,210,0.95)"], [0.6, "rgba(255,40,120,0.4)"], [1, "rgba(255,0,80,0)"]]);

  make(scene, "chip", 10, 10, (c) => {
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(1, 4);
    c.lineTo(6, 1);
    c.lineTo(9, 6);
    c.lineTo(4, 9);
    c.closePath();
    c.fill();
  });

  make(scene, "ring", 128, 128, (c) => {
    c.shadowColor = "#ffffff";
    c.shadowBlur = 12;
    c.strokeStyle = "#ffffff";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(64, 64, 52, 0, TAU);
    c.stroke();
  });

  make(scene, "shield", 88, 88, (c) => {
    const g = c.createRadialGradient(44, 44, 20, 44, 44, 40);
    g.addColorStop(0, "rgba(80,240,255,0)");
    g.addColorStop(0.8, "rgba(80,240,255,0.18)");
    g.addColorStop(1, "rgba(80,240,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 88, 88);
    c.shadowColor = "#5ff4ff";
    c.shadowBlur = 10;
    c.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
      c.strokeStyle = i % 2 ? "rgba(255,120,230,0.85)" : "rgba(120,250,255,0.95)";
      c.beginPath();
      c.arc(44, 44, 34, (i / 6) * TAU + 0.12, ((i + 1) / 6) * TAU - 0.12);
      c.stroke();
    }
  });

  make(scene, "ufo", 72, 40, (c) => {
    c.translate(36, 22);
    c.shadowColor = "#7fffd4";
    c.shadowBlur = 10;
    const d = c.createRadialGradient(-4, -12, 1, 0, -6, 14);
    d.addColorStop(0, "rgba(230,255,245,0.95)");
    d.addColorStop(1, "rgba(40,140,130,0.7)");
    c.fillStyle = d;
    c.beginPath();
    c.ellipse(0, -4, 13, 12, 0, Math.PI, TAU);
    c.fill();
    c.shadowColor = "#ff4fd8";
    const b = c.createLinearGradient(0, -6, 0, 12);
    b.addColorStop(0, "#eef2fb");
    b.addColorStop(0.5, "#6a7190");
    b.addColorStop(1, "#1c1f2c");
    c.fillStyle = b;
    c.beginPath();
    c.ellipse(0, 2, 32, 9, 0, 0, TAU);
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = "#ff7ae4";
    c.stroke();
    const lights = ["#ffe66b", "#ff4fd8", "#7ffff0", "#ff4fd8", "#ffe66b"];
    c.shadowBlur = 8;
    lights.forEach((col, i) => {
      c.shadowColor = col;
      c.fillStyle = col;
      c.beginPath();
      c.arc(-20 + i * 10, 4, 2.2, 0, TAU);
      c.fill();
    });
  });

  const powerFrame = (c: CanvasRenderingContext2D, col: string) => {
    c.translate(16, 16);
    c.shadowColor = col;
    c.shadowBlur = 10;
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.fillStyle = "rgba(10,20,40,0.75)";
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      c.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
    }
    c.closePath();
    c.fill();
    c.stroke();
  };
  make(scene, "pu_triple", 32, 32, (c) => {
    powerFrame(c, "#ffd84a");
    c.strokeStyle = "#fff4b8";
    c.lineCap = "round";
    for (const a of [-0.5, 0, 0.5]) {
      c.beginPath();
      c.moveTo(0, 6);
      c.lineTo(Math.sin(a) * 9, 6 - Math.cos(a) * 12);
      c.stroke();
    }
  });
  make(scene, "pu_shield", 32, 32, (c) => {
    powerFrame(c, "#5ff4ff");
    c.strokeStyle = "#c8fdff";
    c.beginPath();
    c.arc(0, 0, 6.5, 0, TAU);
    c.stroke();
  });

  // Tinh vân nền
  make(scene, "nebula", 512, 512, (c) => {
    c.globalCompositeOperation = "lighter";
    const cols = ["120,60,210", "20,150,210", "220,60,170", "40,70,200", "90,30,150"];
    for (let i = 0; i < 9; i++) {
      const x = rnd(40, 472);
      const y = rnd(40, 472);
      const r = rnd(90, 230);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${cols[i % cols.length]},${rnd(0.12, 0.28)})`);
      g.addColorStop(1, `rgba(${cols[i % cols.length]},0)`);
      c.fillStyle = g;
      c.fillRect(0, 0, 512, 512);
    }
  });

  // Hành tinh xa xa
  make(scene, "planet", 240, 240, (c) => {
    const cx = 120;
    const r = 78;
    const atm = c.createRadialGradient(cx, cx, r * 0.9, cx, cx, r * 1.45);
    atm.addColorStop(0, "rgba(120,200,255,0.35)");
    atm.addColorStop(1, "rgba(120,200,255,0)");
    c.fillStyle = atm;
    c.fillRect(0, 0, 240, 240);
    c.save();
    c.beginPath();
    c.arc(cx, cx, r, 0, TAU);
    c.clip();
    const g = c.createLinearGradient(cx - r, cx - r, cx + r, cx + r);
    g.addColorStop(0, "#5fb6e8");
    g.addColorStop(0.5, "#2c4f9a");
    g.addColorStop(1, "#140f33");
    c.fillStyle = g;
    c.fillRect(0, 0, 240, 240);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = `rgba(255,255,255,${rnd(0.03, 0.09)})`;
      c.fillRect(0, cx - r + rnd(0, r * 2), 240, rnd(3, 12));
    }
    const sh = c.createRadialGradient(cx + r * 0.7, cx + r * 0.7, r * 0.2, cx + r * 0.5, cx + r * 0.5, r * 1.5);
    sh.addColorStop(0, "rgba(2,3,12,0.95)");
    sh.addColorStop(1, "rgba(2,3,12,0)");
    c.fillStyle = sh;
    c.fillRect(0, 0, 240, 240);
    c.restore();
    // Vành đai
    c.strokeStyle = "rgba(200,180,255,0.45)";
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(cx, cx, r * 1.55, r * 0.32, -0.35, 0, TAU);
    c.stroke();
  });

  // Ba lớp sao parallax
  const layers: [number, number, number][] = [
    [260, 0.6, 0.55],
    [80, 1.1, 0.8],
    [26, 1.7, 1],
  ];
  layers.forEach(([count, size, alpha], i) => {
    make(scene, `stars${i}`, 512, 512, (c) => {
      for (let k = 0; k < count; k++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const tint = Math.random();
        const col = tint < 0.15 ? "255,220,170" : tint < 0.35 ? "170,210,255" : "255,255,255";
        const s = size * rnd(0.6, 1.2);
        c.fillStyle = `rgba(${col},${alpha * rnd(0.4, 1)})`;
        if (i === 2) {
          c.shadowColor = `rgba(${col},1)`;
          c.shadowBlur = 6;
        }
        c.beginPath();
        c.arc(x, y, s, 0, TAU);
        c.fill();
        if (i === 2 && Math.random() < 0.5) {
          c.strokeStyle = `rgba(${col},0.5)`;
          c.lineWidth = 0.7;
          c.beginPath();
          c.moveTo(x - 5, y);
          c.lineTo(x + 5, y);
          c.moveTo(x, y - 5);
          c.lineTo(x, y + 5);
          c.stroke();
        }
      }
    });
  });
}
