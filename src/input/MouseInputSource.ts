import Phaser from "phaser";
import { DISPLAY } from "../config/tuning";
import type { InputSource, InputState } from "./InputSource";

/**
 * Mouse implementation of InputSource — the permanent fallback and the source
 * the whole game is developed against. This is the ONLY place Phaser pointer
 * specifics are allowed to live; nothing leaks into scenes or game logic.
 *
 * Fire is edge-triggered: a pointer-down sets a one-shot flag that the next
 * poll() consumes, so one click == one shot (mirrors the discrete fire event a
 * finger-gun gesture will produce).
 */
export class MouseInputSource implements InputSource {
  private x = DISPLAY.WIDTH / 2;
  private y = DISPLAY.HEIGHT / 2;
  private firedSinceLastPoll = false;

  private readonly onMove = (p: Phaser.Input.Pointer): void => {
    this.x = p.x;
    this.y = p.y;
  };
  private readonly onDown = (p: Phaser.Input.Pointer): void => {
    this.x = p.x;
    this.y = p.y;
    this.firedSinceLastPoll = true;
  };

  constructor(private readonly scene: Phaser.Scene) {}

  start(): Promise<void> {
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown);
    return Promise.resolve();
  }

  stop(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown);
  }

  poll(): InputState {
    const isFiring = this.firedSinceLastPoll;
    this.firedSinceLastPoll = false;
    return { x: this.x, y: this.y, isFiring };
  }
}
