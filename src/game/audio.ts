import { settings } from '../storage';
export class Sound {
  ctx?: AudioContext;
  master?: GainNode;
  music?: GainNode;
  timer?: ReturnType<typeof setInterval>;
  lastShot = 0;
  lastImpact = 0;
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = settings.volume;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = settings.music ? 0.16 : 0;
      this.music.connect(this.master);
      this.ambient();
      this.timer = setInterval(() => this.ambient(), 7000);
    } catch {
      /* audio is optional */
    }
  }
  update() {
    if (this.ctx && this.master && this.music) {
      this.master.gain.setTargetAtTime(settings.volume, this.ctx.currentTime, 0.1);
      this.music.gain.setTargetAtTime(settings.music ? 0.16 : 0, this.ctx.currentTime, 0.4);
    }
  }
  tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gain = 0.1,
    slide = 0,
    music = false,
  ) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), now + duration);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    o.connect(g);
    g.connect(music ? this.music! : this.master);
    o.start();
    o.stop(now + duration + 0.02);
  }
  /** The ambient bed. Each biome carries its own chord; the world sets it on entry. */
  chord = [130.81, 196, 261.63, 329.63];
  setAmbient(chord: number[]) {
    if (chord.join() === this.chord.join()) return;
    this.chord = chord;
    this.ambient();
  }
  ambient() {
    if (this.ctx?.state !== 'running' || !settings.music) return;
    this.chord.forEach((n, i) => this.tone(n, 6.8, 'sine', 0.12 / (i + 1), 0, true));
  }
  play(kind: string) {
    if (kind === 'shot') {
      if (performance.now() - this.lastShot < 100) return;
      this.lastShot = performance.now();
      this.tone(550, 0.09, 'triangle', 0.05, -250);
    }
    if (kind === 'arrow') {
      this.tone(980, 0.055, 'triangle', 0.045, -700);
      this.tone(260, 0.07, 'sine', 0.06, -110);
    }
    if (kind === 'blade') {
      this.tone(180, 0.11, 'triangle', 0.08, 300);
      this.tone(730, 0.08, 'sine', 0.035, -500);
    }
    if (kind === 'impact' && performance.now() - this.lastImpact > 70) {
      this.lastImpact = performance.now();
      this.tone(230, 0.055, 'triangle', 0.07, -140);
    }
    if (kind === 'loot') {
      this.tone(880, 0.18, 'sine', 0.08);
      setTimeout(() => this.tone(1320, 0.25, 'sine', 0.06), 65);
    }
    if (kind === 'relic') {
      [659, 880, 1175, 1760].forEach((n, i) =>
        setTimeout(() => this.tone(n, 0.9, 'sine', 0.11), i * 95),
      );
      this.tone(220, 1.5, 'sine', 0.08, 110);
    }
    if (kind === 'hit') this.tone(125, 0.14, 'triangle', 0.2, -80);
    if (kind === 'kill') {
      this.tone(310, 0.2, 'sine', 0.12, 300);
    }
    if (kind === 'dash') this.tone(190, 0.18, 'sine', 0.1, 500);
    if (kind === 'ability') {
      this.tone(180, 0.45, 'triangle', 0.13, 600);
      this.tone(370, 0.6, 'sine', 0.12);
    }
    if (['level', 'heal', 'portal', 'good'].includes(kind))
      [440, 554, 659].forEach((n, i) => setTimeout(() => this.tone(n, 0.5, 'sine', 0.1), i * 80));
    if (kind === 'death') {
      this.tone(220, 2, 'sine', 0.15, -160);
      this.tone(261, 2.5, 'sine', 0.1, -200);
    }
    if (kind === 'perfect') {
      // A clean two-note chime, distinct from anything else in the mix.
      this.tone(1320, 0.14, 'sine', 0.09);
      setTimeout(() => this.tone(1976, 0.22, 'sine', 0.07), 55);
    }
    if (kind === 'click') this.tone(660, 0.05, 'sine', 0.07);
  }
}
export const sound = new Sound();
