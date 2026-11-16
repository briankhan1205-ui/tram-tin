import type Phaser from "phaser";
import { Sfx } from "./sfx";
import { RADII, VARIANTS, generateTextures } from "./textures";

export type TouchInput = { left: boolean; right: boolean; thrust: boolean; fire: boolean; hyper: boolean };

type Spr = Phaser.Physics.Arcade.Sprite;
type Body = Phaser.Physics.Arcade.Body;
type Key = Phaser.Input.Keyboard.Key;
type Keys = Record<"LEFT" | "RIGHT" | "UP" | "A" | "D" | "W" | "SPACE" | "ENTER" | "H" | "SHIFT", Key>;
type State = "menu" | "play" | "dead" | "over";

const TAU = Math.PI * 2;
const POINTS = [20, 50, 100];
const UFO_POINTS = 500;
const EXTRA_LIFE_EVERY = 10000;
const HI_KEY = "asteroid-storm-hi";
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function createGame(PH: typeof Phaser, parent: HTMLElement, touch: TouchInput, font: string): () => void {
  const sfx = new Sfx();
  const ADD = PH.BlendModes.ADD;

  class Main extends PH.Scene {
    ship!: Spr;
    shieldImg!: Phaser.GameObjects.Image;
    asteroids!: Phaser.Physics.Arcade.Group;
    bullets!: Phaser.Physics.Arcade.Group;
    ebullets!: Phaser.Physics.Arcade.Group;
    ufos!: Phaser.Physics.Arcade.Group;
    powerups!: Phaser.Physics.Arcade.Group;
    thrustFx!: Phaser.GameObjects.Particles.ParticleEmitter;
    boomFx!: Phaser.GameObjects.Particles.ParticleEmitter;
    chipFx!: Phaser.GameObjects.Particles.ParticleEmitter;
    sparkFx!: Phaser.GameObjects.Particles.ParticleEmitter;
    nebula!: Phaser.GameObjects.Image;
    planet!: Phaser.GameObjects.Image;
    stars: Phaser.GameObjects.TileSprite[] = [];
    keys!: Keys;
    txt!: Record<"score" | "hi" | "level" | "power" | "center" | "sub" | "toast", Phaser.GameObjects.Text>;
    lifeIcons: Phaser.GameObjects.Image[] = [];

    state: State = "menu";
    score = 0;
    hi = 0;
    level = 0;
    lives = 3;
    nextLife = EXTRA_LIFE_EVERY;
    invulnUntil = 0;
    lastShot = 0;
    lastHyper = 0;
    tripleUntil = 0;
    shield = false;
    nextUfoAt = Infinity;
    paused = false;
    clearing = false;
    readyAt = 0;
    prevTouch = { fire: false, hyper: false };

    constructor() {
      super("main");
    }

    create() {
      generateTextures(this);
      const { width: W, height: H } = this.scale;
      this.cameras.main.setBackgroundColor("#04050c");
      this.physics.world.setBounds(0, 0, W, H);
      try {
        this.hi = Number(localStorage.getItem(HI_KEY)) || 0;
      } catch {
        this.hi = 0;
      }

      // Nền
      this.nebula = this.add.image(0, 0, "nebula").setDepth(-20);
      this.planet = this.add.image(0, 0, "planet").setDepth(-15).setAlpha(0.9);
      this.stars = [0, 1, 2].map((i) => this.add.tileSprite(0, 0, W, H, `stars${i}`).setOrigin(0).setDepth(-12 + i));

      // Nhóm vật thể
      this.asteroids = this.physics.add.group();
      this.bullets = this.physics.add.group();
      this.ebullets = this.physics.add.group();
      this.ufos = this.physics.add.group();
      this.powerups = this.physics.add.group();

      this.ship = this.physics.add.sprite(W / 2, H / 2, "ship").setDepth(5);
      const sb = this.ship.body as Body;
      sb.setCircle(14, 18, 18);
      sb.useDamping = true;
      this.ship.setDrag(0.32).setMaxVelocity(480);
      this.ship.disableBody(true, true);
      this.shieldImg = this.add.image(0, 0, "shield").setDepth(6).setBlendMode(ADD).setVisible(false);

      // Hiệu ứng hạt
      this.thrustFx = this.add
        .particles(0, 0, "spark", {
          speed: { min: 80, max: 190 },
          angle: { onEmit: () => PH.Math.RadToDeg(this.ship.rotation) + 180 + PH.Math.Between(-14, 14) },
          lifespan: { min: 200, max: 420 },
          scale: { start: 0.9, end: 0 },
          alpha: { start: 1, end: 0 },
          color: [0xffffff, 0xfff07a, 0xff7a3d, 0x9a2bff],
          colorEase: "quad.out",
          blendMode: ADD,
          frequency: 14,
          quantity: 2,
          emitting: false,
        })
        .setDepth(4);
      this.boomFx = this.add
        .particles(0, 0, "spark", {
          speed: { min: 30, max: 340 },
          lifespan: { min: 350, max: 1000 },
          scale: { start: 1.1, end: 0 },
          alpha: { start: 1, end: 0 },
          color: [0xffffff, 0xffe08a, 0xff7a3d, 0xa02060],
          colorEase: "quad.out",
          blendMode: ADD,
          emitting: false,
        })
        .setDepth(4);
      this.chipFx = this.add
        .particles(0, 0, "chip", {
          speed: { min: 30, max: 200 },
          lifespan: { min: 500, max: 1100 },
          rotate: { min: 0, max: 360 },
          scale: { start: 1.2, end: 0.3 },
          alpha: { start: 1, end: 0 },
          tint: [0xb39b86, 0x9fb4c9, 0xb08ac0, 0x7a6a60],
          emitting: false,
        })
        .setDepth(3);
      this.sparkFx = this.add
        .particles(0, 0, "spark", {
          speed: { min: 60, max: 260 },
          lifespan: { min: 300, max: 700 },
          scale: { start: 0.8, end: 0 },
          alpha: { start: 1, end: 0 },
          color: [0xffffff, 0x66ffff, 0xff4fd8],
          blendMode: ADD,
          emitting: false,
        })
        .setDepth(4);

      // Va chạm
      const P = this.physics;
      P.add.overlap(this.bullets, this.asteroids, (b, a) => {
        const bb = b as Spr;
        const aa = a as Spr;
        if (!bb.active || !aa.active) return;
        bb.destroy();
        this.breakAsteroid(aa, true);
      });
      P.add.overlap(this.bullets, this.ufos, (b, u) => {
        const bb = b as Spr;
        if (!bb.active || !(u as Spr).active) return;
        bb.destroy();
        this.killUfo(u as Spr, true);
      });
      P.add.overlap(this.ship, this.asteroids, (_s, a) => this.shipHit(a as Spr));
      P.add.overlap(this.ship, this.ebullets, (_s, b) => {
        if (this.time.now < this.invulnUntil) return;
        (b as Spr).destroy();
        this.shipHit(null);
      });
      P.add.overlap(this.ship, this.ufos, (_s, u) => {
        if (this.time.now < this.invulnUntil) return;
        this.killUfo(u as Spr, true);
        this.shipHit(null);
      });
      P.add.overlap(this.ship, this.powerups, (_s, p) => this.pickup(p as Spr));

      // HUD
      const style = (size: number, color = "#e8fbff"): Phaser.Types.GameObjects.Text.TextStyle => ({
        fontFamily: font,
        fontSize: `${size}px`,
        fontStyle: "700",
        color,
        align: "center",
      });
      const glowTxt = (t: Phaser.GameObjects.Text, col = "#38f6ff") => t.setShadow(0, 0, col, 12, false, true).setDepth(20);
      this.txt = {
        score: glowTxt(this.add.text(20, 14, "", style(24)).setOrigin(0, 0)),
        hi: glowTxt(this.add.text(0, 14, "", style(16, "#ffe9a8")).setOrigin(0.5, 0), "#ffb84a"),
        level: glowTxt(this.add.text(0, 14, "", style(18)).setOrigin(1, 0)),
        power: glowTxt(this.add.text(20, 84, "", style(14, "#ffe66b")).setOrigin(0, 0), "#ffb84a"),
        center: glowTxt(this.add.text(0, 0, "", style(64)).setOrigin(0.5), "#ff4fd8"),
        sub: glowTxt(this.add.text(0, 0, "", style(17, "#cfefff")).setOrigin(0.5, 0).setLineSpacing(8)),
        toast: glowTxt(this.add.text(0, 0, "", style(20, "#ffffff")).setOrigin(0.5).setAlpha(0), "#ff4fd8"),
      };

      // Bàn phím
      const kb = this.input.keyboard!;
      this.keys = kb.addKeys("LEFT,RIGHT,UP,A,D,W,SPACE,ENTER,H,SHIFT") as Keys;
      kb.on("keydown", () => sfx.unlock());
      kb.on("keydown-M", () => this.toast(sfx.toggleMute() ? "ÂM THANH: TẮT" : "ÂM THANH: BẬT"));
      kb.on("keydown-P", () => this.togglePause());
      kb.on("keydown-ESC", () => this.togglePause());
      this.input.on("pointerdown", () => {
        sfx.unlock();
        if (this.state === "menu" || this.state === "over") this.startGame();
      });

      this.scale.on("resize", (s: Phaser.Structs.Size) => this.layout(s.width, s.height));
      this.layout(W, H);
      this.renderHud();
      this.showMenu();
    }

    // ---------- Bố cục & HUD ----------
    layout(W: number, H: number) {
      this.physics.world.setBounds(0, 0, W, H);
      const big = Math.max(W, H) * 1.35;
      this.nebula.setPosition(W / 2, H / 2).setDisplaySize(big, big);
      this.planet.setPosition(W * 0.84, H * 0.78).setScale(Math.min(1.2, Math.max(0.6, Math.min(W, H) / 700)));
      this.stars.forEach((s) => s.setSize(W, H));
      this.txt.hi.setPosition(W / 2, 16);
      this.txt.level.setPosition(W - 20, 16);
      this.txt.center.setPosition(W / 2, H / 2 - 50).setFontSize(Math.round(Math.min(78, W / 8.5)));
      this.txt.sub.setPosition(W / 2, H / 2 + 8).setWordWrapWidth(W - 40);
      this.txt.toast.setPosition(W / 2, H * 0.72);
      this.paintTitle();
    }

    paintTitle() {
      const t = this.txt.center;
      const g = t.context.createLinearGradient(0, 0, 0, t.height || 80);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.45, "#7ff6ff");
      g.addColorStop(1, "#ff5fdc");
      t.setFill(g);
    }

    showCenter(title: string, sub: string) {
      this.txt.center.setText(title).setAlpha(1).setScale(1);
      this.paintTitle();
      this.txt.sub.setText(sub).setAlpha(1);
      this.tweens.killTweensOf(this.txt.sub);
      this.tweens.add({ targets: this.txt.sub, alpha: 0.45, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }

    hideCenter() {
      this.tweens.killTweensOf([this.txt.sub, this.txt.center]);
      this.txt.center.setAlpha(0);
      this.txt.sub.setAlpha(0);
    }

    banner(text: string) {
      const t = this.txt.center;
      this.tweens.killTweensOf(t);
      t.setText(text).setAlpha(1).setScale(0.5);
      this.paintTitle();
      this.tweens.add({ targets: t, scale: 1, duration: 450, ease: "back.out" });
      this.tweens.add({ targets: t, alpha: 0, delay: 1300, duration: 500 });
    }

    toast(text: string) {
      const t = this.txt.toast;
      this.tweens.killTweensOf(t);
      t.setText(text).setAlpha(1).setY(this.scale.height * 0.72);
      this.tweens.add({ targets: t, alpha: 0, y: t.y - 20, delay: 900, duration: 600 });
    }

    renderHud() {
      this.txt.score.setText(this.score.toString().padStart(6, "0"));
      this.txt.hi.setText(`KỶ LỤC ${this.hi.toString().padStart(6, "0")}`);
      this.txt.level.setText(this.level ? `MÀN ${this.level}` : "");
      this.lifeIcons.forEach((i) => i.destroy());
      this.lifeIcons = [];
      if (this.state === "menu") return;
      for (let i = 0; i < this.lives; i++) {
        this.lifeIcons.push(this.add.image(32 + i * 26, 62, "ship").setScale(0.4).setRotation(-Math.PI / 2).setDepth(20));
      }
    }

    popup(n: number, x: number, y: number) {
      const t = this.add
        .text(x, y, `+${n}`, { fontFamily: font, fontSize: "15px", fontStyle: "700", color: "#fff3b0" })
        .setOrigin(0.5)
        .setDepth(15)
        .setShadow(0, 0, "#ffb84a", 8, false, true);
      this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 750, ease: "cubic.out", onComplete: () => t.destroy() });
    }

    ring(x: number, y: number, scale: number, color: number) {
      const r = this.add.image(x, y, "ring").setTint(color).setBlendMode(ADD).setScale(0.1).setDepth(4);
      this.tweens.add({ targets: r, scale, alpha: 0, duration: 520, ease: "cubic.out", onComplete: () => r.destroy() });
    }

    // ---------- Vòng đời trò chơi ----------
    showMenu() {
      this.state = "menu";
      this.level = 0;
      for (let i = 0; i < 7; i++) this.spawnAsteroid(rnd(0, this.scale.width), rnd(0, this.scale.height), i % 3);
      this.showCenter(
        "ASTEROID STORM",
        "SPACE / chạm màn hình để bắt đầu\n← → xoay · ↑ đẩy · SPACE bắn · H dịch chuyển · P tạm dừng · M âm thanh",
      );
    }

    startGame() {
      if (this.time.now < this.readyAt) return;
      sfx.unlock();
      for (const g of [this.asteroids, this.bullets, this.ebullets, this.ufos, this.powerups]) g.clear(true, true);
      this.score = 0;
      this.lives = 3;
      this.level = 0;
      this.nextLife = EXTRA_LIFE_EVERY;
      this.tripleUntil = 0;
      this.shield = false;
      this.clearing = false;
      this.hideCenter();
      this.respawn();
      this.nextLevel();
    }

    nextLevel() {
      this.level++;
      const n = Math.min(3 + this.level, 11);
      const { width: W, height: H } = this.scale;
      for (let i = 0; i < n; i++) {
        let x = 0;
        let y = 0;
        do {
          x = rnd(0, W);
          y = rnd(0, H);
        } while (PH.Math.Distance.Between(x, y, this.ship.x, this.ship.y) < 230);
        this.spawnAsteroid(x, y, 0);
      }
      this.nextUfoAt = this.level >= 2 ? this.time.now + rnd(9000, 18000) : Infinity;
      if (this.level > 1) sfx.levelUp();
      this.banner(`MÀN ${this.level}`);
      this.renderHud();
    }

    respawn() {
      const { width: W, height: H } = this.scale;
      this.ship.enableBody(true, W / 2, H / 2, true, true);
      this.ship.setVelocity(0).setAcceleration(0).setAngularVelocity(0).setRotation(-Math.PI / 2).setAlpha(1);
      this.invulnUntil = this.time.now + 2200;
      this.state = "play";
      this.ring(W / 2, H / 2, 1.2, 0x66ffff);
      this.sparkFx.explode(24, W / 2, H / 2);
      this.renderHud();
    }

    tryRespawn() {
      if (this.state !== "dead") return;
      const { width: W, height: H } = this.scale;
      const blocked = [...this.asteroids.getChildren(), ...this.ufos.getChildren()].some(
        (o) => PH.Math.Distance.Between((o as Spr).x, (o as Spr).y, W / 2, H / 2) < 140,
      );
      if (blocked) this.time.delayedCall(250, () => this.tryRespawn());
      else this.respawn();
    }

    gameOver() {
      this.state = "over";
      this.readyAt = this.time.now + 1200;
      const newHi = this.score > this.hi;
      if (newHi) {
        this.hi = this.score;
        try {
          localStorage.setItem(HI_KEY, String(this.hi));
        } catch {
          /* storage bị chặn — bỏ qua */
        }
      }
      this.nextUfoAt = Infinity;
      this.time.delayedCall(900, () => {
        this.showCenter(
          "GAME OVER",
          `Điểm: ${this.score.toLocaleString("vi-VN")}${newHi ? "  ★ KỶ LỤC MỚI ★" : ""}\nSPACE / chạm để chơi lại`,
        );
        this.renderHud();
      });
    }

    togglePause() {
      if (this.state !== "play" && this.state !== "dead") return;
      this.paused = !this.paused;
      if (this.paused) {
        this.physics.pause();
        this.tweens.pauseAll();
        this.time.paused = true;
        sfx.thrust(false);
        this.thrustFx.emitting = false;
        this.txt.center.setText("TẠM DỪNG").setAlpha(1).setScale(1);
        this.paintTitle();
        this.txt.sub.setText("Nhấn P để chơi tiếp").setAlpha(1);
      } else {
        this.physics.resume();
        this.tweens.resumeAll();
        this.time.paused = false;
        this.hideCenter();
      }
    }

    // ---------- Thực thể ----------
    spawnAsteroid(x: number, y: number, size: number, vx?: number, vy?: number) {
      const a = this.asteroids.create(x, y, `ast${size}_${PH.Math.Between(0, VARIANTS - 1)}`) as Spr;
      const r = RADII[size] ?? 15;
      const S = r * 2 + 16;
      const br = r * 0.82;
      (a.body as Body).setCircle(br, S / 2 - br, S / 2 - br);
      if (vx === undefined || vy === undefined) {
        const sp = rnd(30, 70) * (1 + size * 0.5) * (1 + this.level * 0.07);
        const ang = rnd(0, TAU);
        vx = Math.cos(ang) * sp;
        vy = Math.sin(ang) * sp;
      }
      a.setVelocity(vx, vy).setAngularVelocity(rnd(-70, 70)).setRotation(rnd(0, TAU)).setFlipX(Math.random() < 0.5).setDepth(1);
      a.setData("size", size);
      return a;
    }

    breakAsteroid(a: Spr, scored: boolean) {
      if (!a.active) return;
      const size = a.getData("size") as number;
      const { x, y } = a;
      const v = (a.body as Body).velocity.clone();
      this.boomFx.explode([42, 24, 14][size], x, y);
      this.chipFx.explode([16, 10, 6][size], x, y);
      this.ring(x, y, [1.2, 0.75, 0.45][size] ?? 0.5, 0xffc080);
      if (size === 0) this.cameras.main.shake(180, 0.007);
      sfx.explode(1 - size / 2);
      if (scored) this.addScore(POINTS[size] ?? 0, x, y);
      a.destroy();
      if (size < 2) {
        for (const s of [-1, 1]) {
          const nv = v.clone().rotate(s * rnd(0.3, 0.8)).scale(rnd(1.2, 1.6));
          if (nv.length() < 50) nv.setLength(rnd(60, 100));
          this.spawnAsteroid(x + s * 6, y, size + 1, nv.x, nv.y);
        }
      }
      if (scored && this.state === "play" && Math.random() < 0.07) this.spawnPowerup(x, y);
      this.checkClear();
    }

    checkClear() {
      if (this.state === "menu" || this.state === "over" || this.clearing) return;
      if (this.asteroids.countActive(true) > 0) return;
      this.clearing = true;
      this.time.delayedCall(1600, () => {
        this.clearing = false;
        if (this.state === "play" || this.state === "dead") this.nextLevel();
      });
    }

    addScore(n: number, x: number, y: number) {
      if (this.state !== "play" && this.state !== "dead") return;
      this.score += n;
      this.popup(n, x, y);
      if (this.score >= this.nextLife) {
        this.nextLife += EXTRA_LIFE_EVERY;
        this.lives++;
        this.toast("+1 MẠNG!");
        sfx.powerUp();
      }
      this.renderHud();
    }

    fire(time: number) {
      const s = this.ship;
      const sv = (s.body as Body).velocity;
      const triple = time < this.tripleUntil;
      if (!triple && this.bullets.countActive(true) >= 10) return;
      for (const off of triple ? [-0.16, 0, 0.16] : [0]) {
        const r = s.rotation + off;
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        const b = this.bullets.create(s.x + cos * 24, s.y + sin * 24, "bullet") as Spr;
        (b.body as Body).setCircle(4, 6, 6);
        b.setBlendMode(ADD).setDepth(3).setRotation(r).setScale(1.5, 0.85);
        b.setVelocity(cos * 700 + sv.x * 0.5, sin * 700 + sv.y * 0.5);
        b.setData("die", time + 800);
      }
      this.sparkFx.explode(2, s.x + Math.cos(s.rotation) * 24, s.y + Math.sin(s.rotation) * 24);
      sfx.shoot();
      this.lastShot = time;
    }

    hyperspace(time: number) {
      if (time < this.lastHyper + 1200) return;
      this.lastHyper = time;
      const s = this.ship;
      this.sparkFx.explode(26, s.x, s.y);
      this.ring(s.x, s.y, 0.8, 0xff4fd8);
      s.setPosition(rnd(60, this.scale.width - 60), rnd(60, this.scale.height - 60)).setVelocity(0);
      this.sparkFx.explode(26, s.x, s.y);
      this.ring(s.x, s.y, 0.8, 0x66ffff);
      this.invulnUntil = Math.max(this.invulnUntil, time + 400);
      sfx.powerUp();
    }

    shipHit(a: Spr | null) {
      if (this.state !== "play" || !this.ship.active || this.time.now < this.invulnUntil) return;
      if (a) this.breakAsteroid(a, true);
      if (this.shield) {
        this.shield = false;
        this.shieldImg.setVisible(false);
        this.invulnUntil = this.time.now + 1200;
        this.sparkFx.explode(36, this.ship.x, this.ship.y);
        this.ring(this.ship.x, this.ship.y, 1.4, 0x66ffff);
        this.cameras.main.shake(150, 0.006);
        this.toast("KHIÊN ĐÃ VỠ!");
        return;
      }
      const { x, y } = this.ship;
      this.boomFx.explode(90, x, y);
      this.sparkFx.explode(50, x, y);
      this.ring(x, y, 1.8, 0x66ffff);
      this.cameras.main.shake(420, 0.018);
      this.cameras.main.flash(160, 255, 110, 170);
      sfx.thrust(false);
      sfx.die();
      this.thrustFx.emitting = false;
      this.ship.disableBody(true, true);
      this.shieldImg.setVisible(false);
      this.tripleUntil = 0;
      this.lives--;
      this.renderHud();
      if (this.lives > 0) {
        this.state = "dead";
        this.time.delayedCall(1800, () => this.tryRespawn());
      } else {
        this.gameOver();
      }
    }

    spawnUfo() {
      const { width: W, height: H } = this.scale;
      const fromLeft = Math.random() < 0.5;
      const u = this.ufos.create(fromLeft ? -40 : W + 40, rnd(H * 0.15, H * 0.85), "ufo") as Spr;
      (u.body as Body).setCircle(18, 18, 4);
      u.setVelocityX((fromLeft ? 1 : -1) * rnd(110, 150)).setDepth(2);
      u.setData("phase", rnd(0, TAU));
      u.setData("shotAt", this.time.now + 900);
      this.nextUfoAt = Infinity;
    }

    killUfo(u: Spr, scored: boolean) {
      if (!u.active) return;
      this.boomFx.explode(50, u.x, u.y);
      this.sparkFx.explode(40, u.x, u.y);
      this.ring(u.x, u.y, 1.3, 0xff4fd8);
      this.cameras.main.shake(200, 0.008);
      sfx.explode(0.8);
      if (scored) this.addScore(UFO_POINTS, u.x, u.y);
      u.destroy();
      this.nextUfoAt = this.time.now + rnd(14000, 24000);
    }

    updateUfos(time: number) {
      const W = this.scale.width;
      for (const o of this.ufos.getChildren().slice()) {
        const u = o as Spr;
        const body = u.body as Body;
        body.velocity.y = Math.sin(time / 520 + (u.getData("phase") as number)) * 90;
        if ((body.velocity.x > 0 && u.x > W + 60) || (body.velocity.x < 0 && u.x < -60)) {
          u.destroy();
          this.nextUfoAt = time + rnd(12000, 22000);
          continue;
        }
        if (this.ship.active && this.state === "play" && time > (u.getData("shotAt") as number)) {
          u.setData("shotAt", time + Math.max(650, 1400 - this.level * 70));
          const spread = Math.max(0.06, 0.35 - this.level * 0.03);
          const ang = PH.Math.Angle.Between(u.x, u.y, this.ship.x, this.ship.y) + rnd(-spread, spread);
          const b = this.ebullets.create(u.x, u.y, "ebullet") as Spr;
          (b.body as Body).setCircle(4, 6, 6);
          b.setBlendMode(ADD).setDepth(3);
          b.setVelocity(Math.cos(ang) * 270, Math.sin(ang) * 270);
          b.setData("die", time + 2200);
          sfx.ufoShot();
        }
      }
    }

    spawnPowerup(x: number, y: number) {
      const type = Math.random() < 0.5 ? "triple" : "shield";
      const p = this.powerups.create(x, y, `pu_${type}`) as Spr;
      (p.body as Body).setCircle(12, 4, 4);
      p.setVelocity(rnd(-40, 40), rnd(-40, 40)).setDepth(2);
      p.setData("type", type);
      p.setData("die", this.time.now + 9000);
      this.tweens.add({ targets: p, scale: 1.18, duration: 450, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }

    pickup(p: Spr) {
      if (!p.active || this.state !== "play") return;
      const type = p.getData("type") as string;
      this.sparkFx.explode(24, p.x, p.y);
      this.ring(p.x, p.y, 0.7, type === "triple" ? 0xffd84a : 0x66ffff);
      p.destroy();
      sfx.powerUp();
      if (type === "triple") {
        this.tripleUntil = this.time.now + 10000;
        this.toast("BẮN BA TIA!");
      } else {
        this.shield = true;
        this.shieldImg.setVisible(true);
        this.toast("KHIÊN NĂNG LƯỢNG!");
      }
    }

    expire(group: Phaser.Physics.Arcade.Group, time: number, blink = false) {
      for (const o of group.getChildren().slice()) {
        const s = o as Spr;
        const die = s.getData("die") as number;
        if (time > die) s.destroy();
        else if (blink && die - time < 2000) s.setAlpha(Math.sin(time / 60) > 0 ? 1 : 0.25);
      }
    }

    // ---------- Vòng lặp ----------
    update(time: number, delta: number) {
      const dt = delta / 1000;
      const v = this.ship.active ? (this.ship.body as Body).velocity : { x: 0, y: 0 };
      this.stars.forEach((s, i) => {
        const f = [0.015, 0.05, 0.12][i] ?? 0.05;
        s.tilePositionX += (v.x * f + 3 * (i + 1)) * dt;
        s.tilePositionY += v.y * f * dt;
      });
      this.nebula.rotation += 0.004 * dt;

      if (this.paused) return;

      const wrap = this.physics.world.wrap.bind(this.physics.world);
      wrap(this.asteroids, 40);
      wrap(this.bullets, 6);
      wrap(this.ebullets, 6);
      wrap(this.powerups, 16);
      wrap(this.ship, 24);
      this.expire(this.bullets, time);
      this.expire(this.ebullets, time);
      this.expire(this.powerups, time, true);

      const k = this.keys;
      const tFire = touch.fire && !this.prevTouch.fire;
      const tHyper = touch.hyper && !this.prevTouch.hyper;
      this.prevTouch = { fire: touch.fire, hyper: touch.hyper };

      if (this.state === "menu" || this.state === "over") {
        if (PH.Input.Keyboard.JustDown(k.SPACE) || PH.Input.Keyboard.JustDown(k.ENTER) || tFire) this.startGame();
        return;
      }

      const s = this.ship;
      if (this.state === "play" && s.active) {
        const left = k.LEFT.isDown || k.A.isDown || touch.left;
        const right = k.RIGHT.isDown || k.D.isDown || touch.right;
        const thrust = k.UP.isDown || k.W.isDown || touch.thrust;
        const body = s.body as Body;
        s.setAngularVelocity(left ? -280 : right ? 280 : 0);
        if (thrust) this.physics.velocityFromRotation(s.rotation, 380, body.acceleration);
        else body.setAcceleration(0, 0);
        this.thrustFx.setPosition(s.x - Math.cos(s.rotation) * 16, s.y - Math.sin(s.rotation) * 16);
        this.thrustFx.emitting = thrust;
        sfx.thrust(thrust);

        if ((k.SPACE.isDown || touch.fire) && time > this.lastShot + (time < this.tripleUntil ? 210 : 170)) this.fire(time);
        if (PH.Input.Keyboard.JustDown(k.H) || PH.Input.Keyboard.JustDown(k.SHIFT) || tHyper) this.hyperspace(time);

        s.setAlpha(time < this.invulnUntil ? (Math.sin(time / 45) > 0 ? 1 : 0.3) : 1);
        this.shieldImg.setPosition(s.x, s.y).setRotation(time / 400).setScale(1 + Math.sin(time / 150) * 0.04);
      } else {
        this.thrustFx.emitting = false;
        sfx.thrust(false);
      }

      if (time > this.nextUfoAt && this.ufos.countActive(true) === 0) this.spawnUfo();
      this.updateUfos(time);

      const left = this.tripleUntil - time;
      this.txt.power.setText(left > 0 ? `▲ BA TIA ${Math.ceil(left / 1000)}s` : this.shield ? "◆ KHIÊN" : "");
      this.txt.power.setColor(left > 0 ? "#ffe66b" : "#7ff6ff");
    }
  }

  const game = new PH.Game({
    type: PH.AUTO,
    parent,
    backgroundColor: "#04050c",
    scale: { mode: PH.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    physics: { default: "arcade", arcade: { debug: false } },
    input: { activePointers: 4 },
    scene: Main,
  });

  return () => {
    sfx.dispose();
    game.destroy(true);
  };
}
