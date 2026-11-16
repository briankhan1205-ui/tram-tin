// Âm thanh tổng hợp bằng WebAudio — không cần file asset.
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private thrustSrc: AudioBufferSourceNode | null = null;
  private thrustGain: GainNode | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, cutoff: number) {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(60, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  shoot() { this.tone("square", 880, 220, 0.09, 0.12); }
  explode(size: number) { this.burst(0.25 + size * 0.25, 0.5 + size * 0.3, 900 + size * 1200); }
  die() { this.burst(1.1, 1, 2400); this.tone("sawtooth", 300, 30, 0.9, 0.2); }
  levelUp() { [0, 0.1, 0.2].forEach((d, i) => setTimeout(() => this.tone("triangle", 440 * (i + 2), 440 * (i + 2), 0.15, 0.2), d * 1000)); }
  ufoShot() { this.tone("sawtooth", 600, 1400, 0.12, 0.08); }
  powerUp() { this.tone("sine", 500, 1600, 0.25, 0.25); }

  thrust(on: boolean) {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    if (on && !this.thrustSrc) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.08);
      src.connect(f).connect(g).connect(master);
      src.start();
      this.thrustSrc = src;
      this.thrustGain = g;
    } else if (!on && this.thrustSrc && this.thrustGain) {
      const src = this.thrustSrc;
      this.thrustGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      src.stop(ctx.currentTime + 0.12);
      this.thrustSrc = null;
      this.thrustGain = null;
    }
  }

  dispose() {
    this.thrust(false);
    void this.ctx?.close();
    this.ctx = null;
  }
}
