/**
 * InputSource — the ONLY way game logic learns about pointing and firing.
 *
 * Non-negotiable architecture (CLAUDE.md / PLAN.md): scenes and game logic read
 * from this interface and never touch the mouse or camera directly. The game is
 * built entirely on MouseInputSource; HandInputSource is swapped in behind the
 * same interface at Phase 6, with mouse remaining a permanent fallback.
 */

/** A single frame's input snapshot, in game-space coordinates. */
export interface InputState {
  /** Cursor X in internal render coordinates (0..DISPLAY.WIDTH). */
  x: number;
  /** Cursor Y in internal render coordinates (0..DISPLAY.HEIGHT). */
  y: number;
  /** True only on the frame a discrete fire occurs (edge-triggered, not held). */
  isFiring: boolean;
}

export interface InputSource {
  /** Acquire resources (camera permission, listeners). Resolves when ready. */
  start(): Promise<void>;
  /** Release resources / listeners. */
  stop(): void;
  /** Read the current input. Called once per frame. */
  poll(): InputState;
}
