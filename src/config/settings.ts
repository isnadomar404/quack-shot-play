import { HAND, SETTINGS } from "./tuning";

/**
 * Runtime player settings for the gesture/aim pipeline (the in-game Settings
 * menu). Held here, persisted to localStorage, and read live by calibration,
 * the pinch detector, and HandInputSource — so tweaks apply without a restart.
 *
 * Stored as intuitive values: aim sensitivity (raw), and 0..1 sliders for
 * smoothing and pinch-ease that map to the actual One Euro / pinch thresholds.
 * Factory defaults are seeded from the HAND.* constants in tuning.ts.
 */
export type FireGesture = "pinch" | "fingergun";

export interface GameSettings {
  aimSensitivity: number; // raw multiplier, SETTINGS.AIM_MIN..AIM_MAX
  smoothing: number; // 0..1 (0 = snappy, 1 = smooth)
  pinchEase: number; // 0..1 (0 = hard, 1 = easy)
  fireGesture: FireGesture;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : (v - a) / (b - a);

const DEFAULTS: GameSettings = {
  aimSensitivity: HAND.AIM_SENSITIVITY,
  smoothing: clamp01(
    invLerp(
      SETTINGS.SMOOTH_CUTOFF_SNAPPY,
      SETTINGS.SMOOTH_CUTOFF_SMOOTH,
      HAND.ONE_EURO_MIN_CUTOFF,
    ),
  ),
  pinchEase: clamp01(
    invLerp(
      SETTINGS.PINCH_DOWN_HARD,
      SETTINGS.PINCH_DOWN_EASY,
      HAND.PINCH_DOWN_THRESHOLD,
    ),
  ),
  fireGesture: HAND.FIRE_GESTURE,
};

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS.STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<GameSettings>;
    return {
      aimSensitivity:
        typeof p.aimSensitivity === "number"
          ? Math.min(SETTINGS.AIM_MAX, Math.max(SETTINGS.AIM_MIN, p.aimSensitivity))
          : DEFAULTS.aimSensitivity,
      smoothing:
        typeof p.smoothing === "number" ? clamp01(p.smoothing) : DEFAULTS.smoothing,
      pinchEase:
        typeof p.pinchEase === "number" ? clamp01(p.pinchEase) : DEFAULTS.pinchEase,
      fireGesture: p.fireGesture === "fingergun" ? "fingergun" : "pinch",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: GameSettings = load();

function persist(): void {
  try {
    localStorage.setItem(SETTINGS.STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable (private mode / quota) — keep the in-memory values.
  }
}

export const settings = {
  /** Current persisted values (read-only snapshot). */
  get(): Readonly<GameSettings> {
    return current;
  },
  /** Patch + persist. */
  set(patch: Partial<GameSettings>): void {
    current = { ...current, ...patch };
    persist();
  },
  /** Restore factory defaults. */
  reset(): void {
    current = { ...DEFAULTS };
    persist();
  },

  // ── Derived values consumed by the gesture pipeline ──────────────────────
  aimSensitivity(): number {
    return current.aimSensitivity;
  },
  /** One Euro min cutoff (lower = smoother). */
  minCutoff(): number {
    return lerp(
      SETTINGS.SMOOTH_CUTOFF_SNAPPY,
      SETTINGS.SMOOTH_CUTOFF_SMOOTH,
      current.smoothing,
    );
  },
  pinchDown(): number {
    return lerp(SETTINGS.PINCH_DOWN_HARD, SETTINGS.PINCH_DOWN_EASY, current.pinchEase);
  },
  pinchUp(): number {
    return this.pinchDown() + SETTINGS.PINCH_GAP;
  },
  fireGesture(): FireGesture {
    return current.fireGesture;
  },
} as const;
