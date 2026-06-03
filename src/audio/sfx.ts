import { AUDIO } from "../config/tuning";

/**
 * Tiny chiptune SFX synthesised with the Web Audio API — no asset files, in the
 * spirit of jsfxr/bfxr (PLAN.md). The AudioContext is created lazily and must
 * be unlocked from a user gesture (browser autoplay policy); GameScene calls
 * unlock() on the first click (the title screen's "click to start").
 *
 * Not game logic and reads no input — just a fire-and-forget sound bank.
 */
type Wave = OscillatorType;

interface ToneOpts {
  freq: number;
  toFreq?: number; // optional exponential glide target
  dur: number; // seconds
  type?: Wave;
  vol?: number;
  delay?: number; // seconds from now
}

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Resume the context from a user gesture so sound can play. */
  unlock(): void {
    this.ensure();
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  private ensure(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = AUDIO.MASTER_VOLUME;
    this.master.connect(this.ctx.destination);
  }

  private tone(opts: ToneOpts): void {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? "square";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.toFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, opts.toFreq),
        t0 + opts.dur,
      );
    }
    const vol = opts.vol ?? 0.6;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  /** Gunshot — a sharp downward thump plus a noisy crack. */
  shot(): void {
    this.tone({ freq: 320, toFreq: 70, dur: 0.12, type: "square", vol: 0.5 });
    this.tone({ freq: 1300, toFreq: 200, dur: 0.06, type: "sawtooth", vol: 0.22 });
  }

  /** Duck quack on spawn. */
  quack(): void {
    this.tone({ freq: 220, toFreq: 320, dur: 0.08, type: "sawtooth", vol: 0.35 });
    this.tone({
      freq: 300,
      toFreq: 170,
      dur: 0.09,
      type: "sawtooth",
      vol: 0.35,
      delay: 0.08,
    });
  }

  /** Falling-duck whistle. */
  fallWhistle(): void {
    this.tone({ freq: 1500, toFreq: 200, dur: 0.5, type: "triangle", vol: 0.4 });
  }

  /** Dog's taunting laugh — a few low staccato barks. */
  dogLaugh(): void {
    for (let i = 0; i < 4; i++) {
      this.tone({
        freq: 170 + (i % 2) * 70,
        dur: 0.08,
        type: "square",
        vol: 0.4,
        delay: i * 0.1,
      });
    }
  }

  /** Round-clear jingle — a rising arpeggio. */
  roundClear(): void {
    [392, 523, 659, 784].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.18, type: "square", vol: 0.4, delay: i * 0.12 });
    });
  }
}

export const sfx = new Sfx();
