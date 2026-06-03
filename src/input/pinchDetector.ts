import { HAND } from "../config/tuning";
import { settings } from "../config/settings";
import type { Vec2 } from "./calibration";

/**
 * PinchDetector — edge-triggered pinch fire (V2 primary gesture). Fire = the
 * thumb tip (landmark 4) closing onto the index tip (landmark 8). The distance
 * is normalized by hand size (landmark 0 <-> 9) so one threshold works at any
 * camera distance.
 *
 * Reliability rules (CLAUDE.md):
 *  - **Hysteresis**: arm only after the fingers separate past UP; fire when they
 *    close past DOWN (DOWN < UP), so a noisy boundary can't double-fire.
 *  - **Debounce**: at least PINCH_MIN_FRAMES_BETWEEN inference frames between
 *    shots.
 *
 * Pure logic (no Phaser/DOM) so it's unit-testable. The position latch lives in
 * HandInputSource (it owns the smoothed cursor); this only decides *when* to fire.
 */
export class PinchDetector {
  private armed = true;
  private framesSinceFire: number = HAND.PINCH_MIN_FRAMES_BETWEEN;

  /** Normalized pinch distance for the current frame. */
  static normalizedDistance(thumbTip: Vec2, indexTip: Vec2, handSize: number): number {
    return Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y) / handSize;
  }

  /**
   * Feed the current normalized distance; returns true exactly on the
   * pinch-down edge (a fire). Call once per inference frame.
   */
  update(normDist: number): boolean {
    this.framesSinceFire++;

    // Re-arm once the fingers are clearly apart.
    if (normDist > settings.pinchUp()) {
      this.armed = true;
    }

    if (
      this.armed &&
      normDist < settings.pinchDown() &&
      this.framesSinceFire >= HAND.PINCH_MIN_FRAMES_BETWEEN
    ) {
      this.armed = false; // one shot per pinch; must re-open to re-arm
      this.framesSinceFire = 0;
      return true;
    }
    return false;
  }

  /** True while the fingers are open enough to be considered un-pinched. */
  isOpen(normDist: number): boolean {
    return normDist > settings.pinchUp();
  }

  reset(): void {
    this.armed = true;
    this.framesSinceFire = HAND.PINCH_MIN_FRAMES_BETWEEN;
  }
}
