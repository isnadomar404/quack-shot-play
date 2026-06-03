import { DISPLAY, HAND } from "../config/tuning";

/**
 * Aim calibration — maps the index fingertip in normalized hand-space (0..1, as
 * MediaPipe reports it) to game-space pixels (0..DISPLAY.WIDTH/HEIGHT).
 *
 * Two modes:
 *  - **recenter** (default, pre-calibration): a recentred, sensitivity-scaled
 *    mapping so the cursor is usable the instant a hand appears (the gorilla-arm
 *    fix). `recenter()` re-seats the centre on the current hand.
 *  - **rect** (after the calibration-as-tutorial corner trace): the four traced
 *    corners define a hand-space rectangle that maps linearly to the full
 *    screen. This is the V2 "trace the corners once" calibration.
 *
 * The camera preview is mirrored, so X is flipped for natural left/right feel.
 * Framework-free (no Phaser, no DOM) so it stays unit-testable.
 */
export interface Vec2 {
  x: number;
  y: number;
}

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class AimCalibration {
  /** Hand-space point (0..1) that maps to the centre of the screen (recenter mode). */
  private center: Vec2 = { x: 0.5, y: 0.5 };
  private pendingRecenter: boolean = HAND.AUTO_RECENTER_ON_FIRST_HAND;

  /** Corner-trace state. `rect` is non-null once 4 corners are captured. */
  private corners: Vec2[] = [];
  private rect: Rect | null = null;

  /** Queue a recentre; applied on the next mapped fingertip (recenter mode). */
  recenter(): void {
    this.pendingRecenter = true;
  }

  /** Start a fresh 4-corner trace (clears any existing rectangle). */
  beginCornerCapture(): void {
    this.corners = [];
    this.rect = null;
  }

  /** Capture the current fingertip as the next corner. Returns how many are
   *  captured so far (1..4); on the 4th, builds the calibration rectangle. */
  captureCorner(tip: Vec2): number {
    if (this.corners.length >= 4) return 4;
    this.corners.push({ x: tip.x, y: tip.y });
    if (this.corners.length === 4) this.buildRect();
    return this.corners.length;
  }

  cornerCount(): number {
    return this.corners.length;
  }

  isRectCalibrated(): boolean {
    return this.rect !== null;
  }

  private buildRect(): void {
    const xs = this.corners.map((c) => c.x);
    const ys = this.corners.map((c) => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    // Guard against a degenerate (zero-area) trace.
    const EPS = 1e-3;
    if (maxX - minX < EPS || maxY - minY < EPS) {
      this.rect = null;
      this.corners = [];
      return;
    }
    this.rect = { minX, maxX, minY, maxY };
  }

  /**
   * Map a normalized fingertip to game-space pixels using whichever mode is
   * active. If a recentre is pending (recenter mode), this fingertip becomes the
   * new centre.
   */
  map(tip: Vec2): Vec2 {
    if (this.rect) {
      const nx = clamp01((tip.x - this.rect.minX) / (this.rect.maxX - this.rect.minX));
      const ny = clamp01((tip.y - this.rect.minY) / (this.rect.maxY - this.rect.minY));
      // Mirror X (mirrored preview); the traced rect defines the full range.
      return {
        x: clamp((1 - nx) * DISPLAY.WIDTH, 0, DISPLAY.WIDTH),
        y: clamp(ny * DISPLAY.HEIGHT, 0, DISPLAY.HEIGHT),
      };
    }

    if (this.pendingRecenter) {
      this.center = { x: tip.x, y: tip.y };
      this.pendingRecenter = false;
    }
    const relX = (tip.x - this.center.x) * HAND.AIM_SENSITIVITY;
    const relY = (tip.y - this.center.y) * HAND.AIM_SENSITIVITY;
    // Mirror X (camera preview is mirrored); Y is not mirrored.
    const x = (0.5 - relX) * DISPLAY.WIDTH;
    const y = (0.5 + relY) * DISPLAY.HEIGHT;
    return {
      x: clamp(x, 0, DISPLAY.WIDTH),
      y: clamp(y, 0, DISPLAY.HEIGHT),
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
