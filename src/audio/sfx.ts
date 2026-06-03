import { AUDIO } from "../config/tuning";

/**
 * Tiny chiptune audio synthesised with the Web Audio API — no asset files, in
 * the spirit of jsfxr/bfxr (PLAN.md). Covers one-shot SFX and short melodies
 * (looping title/menu music + dog / level-clear / game-over jingles).
 *
 * The AudioContext is created lazily and must be unlocked from a user gesture
 * (browser autoplay policy); GameScene calls unlock() on the first click/keypress.
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

/** A melody note: [scientific-pitch name | "R" for rest, length in beats]. */
type Note = readonly [string, number];

interface MelodyOpts {
  type: Wave;
  vol: number;
  step?: number; // seconds per beat (defaults to AUDIO.MUSIC_STEP)
}

const SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Scientific pitch (e.g. "C4", "G#5", "Eb3") → frequency in Hz. */
function noteFreq(name: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) return 0;
  let semis = SEMITONE[m[1]];
  if (m[2] === "#") semis++;
  else if (m[2] === "b") semis--;
  const midi = (Number(m[3]) + 1) * 12 + semis; // C4 = 60
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Melodies (beats are multiples of AUDIO.MUSIC_STEP) ──────────────────────
const TITLE_LEAD: readonly Note[] = [
  ["E5", 1], ["G5", 1], ["C6", 2], ["B5", 1], ["G5", 1], ["E5", 2],
  ["F5", 1], ["A5", 1], ["C6", 2], ["G5", 1], ["E5", 1], ["C5", 2],
  ["D5", 1], ["F5", 1], ["A5", 2], ["G5", 1], ["F5", 1], ["D5", 2],
  ["C5", 1], ["E5", 1], ["G5", 2], ["E5", 1], ["G5", 1], ["C6", 2],
];
const TITLE_BASS: readonly Note[] = [
  ["C3", 4], ["G3", 4], ["F3", 4], ["C3", 4],
  ["D3", 4], ["G3", 4], ["C3", 4], ["G3", 4],
];
const DOG_INTRO: readonly Note[] = [
  ["G4", 1], ["C5", 1], ["E5", 1], ["G5", 1], ["E5", 1], ["G5", 3],
];
const LEVEL_CLEAR: readonly Note[] = [
  ["C5", 1], ["E5", 1], ["G5", 1], ["C6", 1], ["G5", 1], ["C6", 3],
  ["R", 1], ["E6", 1], ["C6", 1], ["G5", 1], ["C6", 4],
];
const GAME_OVER: readonly Note[] = [
  ["G5", 2], ["E5", 2], ["Eb5", 2], ["D5", 2],
  ["C5", 2], ["G4", 2], ["Ab4", 2], ["G4", 5],
];

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicOn = false;
  private musicTimer: number | null = null;

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

  /** Schedule a melody at precise audio-clock times. Returns its length (s). */
  private playMelody(notes: readonly Note[], opts: MelodyOpts): number {
    this.ensure();
    if (!this.ctx) return 0;
    const step = opts.step ?? AUDIO.MUSIC_STEP;
    let t = 0;
    for (const [name, beats] of notes) {
      const dur = beats * step;
      if (name !== "R") {
        this.tone({
          freq: noteFreq(name),
          dur: dur * 0.9, // small gap so repeated notes articulate
          type: opts.type,
          vol: opts.vol,
          delay: t,
        });
      }
      t += dur;
    }
    return t;
  }

  // ── Music ────────────────────────────────────────────────────────────────

  /** Start the looping title/menu music (idempotent). Waits for the audio
   *  unlock if the context is still suspended. */
  titleMusic(): void {
    if (this.musicOn) return;
    this.musicOn = true;
    this.scheduleTitleLoop();
  }

  private scheduleTitleLoop(): void {
    if (!this.musicOn) return;
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state !== "running") {
      // Not unlocked yet — re-check shortly so the loop starts cleanly on resume.
      this.musicTimer = window.setTimeout(() => this.scheduleTitleLoop(), 250);
      return;
    }
    const len = this.playMelody(TITLE_LEAD, { type: "square", vol: 0.14 });
    this.playMelody(TITLE_BASS, { type: "triangle", vol: 0.13 });
    this.musicTimer = window.setTimeout(() => this.scheduleTitleLoop(), len * 1000);
  }

  /** Stop the looping music (in-flight scheduled notes finish naturally). */
  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer !== null) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** Playful cue when the dog trots onto the field at round start. */
  dogIntro(): void {
    this.playMelody(DOG_INTRO, { type: "square", vol: 0.3 });
  }

  /** Triumphant fanfare when a level is cleared. */
  levelClear(): void {
    this.playMelody(LEVEL_CLEAR, { type: "square", vol: 0.36, step: 0.13 });
  }

  /** Descending dirge when the run ends. */
  gameOverTune(): void {
    this.playMelody(GAME_OVER, { type: "square", vol: 0.34, step: 0.18 });
  }

  // ── One-shot SFX ───────────────────────────────────────────────────────────

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
}

export const sfx = new Sfx();
