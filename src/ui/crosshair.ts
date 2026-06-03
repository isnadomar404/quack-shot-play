import Phaser from "phaser";
import { CROSSHAIR } from "../config/tuning";

/**
 * Crosshair — the reticle at the InputSource cursor, with the three visible
 * states the V2 feedback spec requires:
 *   idle   — faint reticle (no/low tracking, or on the mouse fallback).
 *   armed  — brighter reticle (hand tracked, stable, high confidence).
 *   firing — a single-frame scale-pulse + expanding ring flash on every shot,
 *            then it reverts to the prior persistent state.
 *
 * Self-contained Phaser drawing; the scene drives state + position and calls
 * firePulse() on each fire. Audio is the scene's job (it owns the SFX module).
 */
export type CrosshairState = "idle" | "armed";

const IDLE_COLOR = 0xf4f4f4; // PALETTE[12]
const ARMED_COLOR = 0x73eff7; // PALETTE[11]
const FIRE_COLOR = 0xffcd75; // PALETTE[4]

export class Crosshair {
  private readonly g: Phaser.GameObjects.Graphics;
  private state: CrosshairState = "idle";
  private pulseScale = 1; // reticle scale, briefly bumped on fire

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(100);
  }

  setState(state: CrosshairState): void {
    this.state = state;
  }

  /** Redraw at the cursor position (call once per frame). */
  update(x: number, y: number): void {
    const { RADIUS, TICK, THICKNESS } = CROSSHAIR;
    const armed = this.state === "armed";
    const color = armed ? ARMED_COLOR : IDLE_COLOR;
    const alpha = armed ? 1 : 0.45;
    const r = RADIUS * this.pulseScale;

    this.g.clear();
    this.g.lineStyle(THICKNESS, color, alpha);
    this.g.strokeCircle(x, y, r);
    this.g.lineBetween(x - r - TICK, y, x - r, y);
    this.g.lineBetween(x + r, y, x + r + TICK, y);
    this.g.lineBetween(x, y - r - TICK, x, y - r);
    this.g.lineBetween(x, y + r, x, y + r + TICK);
    if (armed) {
      // A small filled centre dot reads as "locked on".
      this.g.fillStyle(color, alpha);
      this.g.fillCircle(x, y, THICKNESS);
    }
  }

  /** Fire flash: scale-pulse on the reticle + an expanding ring that fades. */
  firePulse(x: number, y: number): void {
    // Reticle scale-pulse (tween a plain number; update() reads pulseScale).
    this.pulseScale = 1.8;
    this.scene.tweens.add({
      targets: this,
      pulseScale: 1,
      duration: 160,
      ease: "Quad.easeOut",
    });

    // Expanding ring flash.
    const ring = this.scene.add
      .circle(x, y, CROSSHAIR.RADIUS)
      .setStrokeStyle(2, FIRE_COLOR, 1)
      .setDepth(99);
    this.scene.tweens.add({
      targets: ring,
      scale: 2.6,
      alpha: 0,
      duration: 220,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this);
    this.g.destroy();
  }
}
