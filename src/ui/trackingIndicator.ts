import Phaser from "phaser";
import { DISPLAY, HAND } from "../config/tuning";

/**
 * TrackingIndicator — the always-visible corner dot that tells the player
 * whether the system can see their hand, without testing it on a duck (V2
 * mandatory feedback). Tinted from the HandLandmarker confidence score:
 *   green  — high confidence (>= TRACKING_CONFIDENCE_GREEN)
 *   yellow — partial / low    (>= TRACKING_CONFIDENCE_YELLOW)
 *   red    — lost / very low
 * Hidden entirely when there's no hand source (mouse / keyboard only).
 */
const GREEN = 0x38b764; // PALETTE[6]
const YELLOW = 0xffcd75; // PALETTE[4]
const RED = 0xb13e53; // PALETTE[2]

export class TrackingIndicator {
  private readonly dot: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene) {
    this.dot = scene.add
      .circle(DISPLAY.WIDTH - 8, 20, 3, RED)
      .setStrokeStyle(1, 0x1a1c2c, 1) // PALETTE[0] outline for contrast
      .setDepth(120)
      .setVisible(false);
  }

  /**
   * Update from the hand status. Pass `null` confidence when there is no active
   * hand source (the dot hides). `present` gates green/yellow off when the hand
   * is currently lost even if a stale confidence lingers.
   */
  set(confidence: number | null, present: boolean): void {
    if (confidence === null) {
      this.dot.setVisible(false);
      return;
    }
    this.dot.setVisible(true);
    const color = !present
      ? RED
      : confidence >= HAND.TRACKING_CONFIDENCE_GREEN
        ? GREEN
        : confidence >= HAND.TRACKING_CONFIDENCE_YELLOW
          ? YELLOW
          : RED;
    this.dot.setFillStyle(color, 1);
  }

  destroy(): void {
    this.dot.destroy();
  }
}
