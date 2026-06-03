import Phaser from "phaser";
import { DISPLAY } from "../config/tuning";
import type { InputSource, InputState } from "./InputSource";

/**
 * KeyboardInputSource — cursor follows the mouse pointer, SPACEBAR fires (V2).
 * Wired alongside the mouse as a permanent fallback for accessibility, headless
 * debugging, and players who can't or don't want to gesture.
 *
 * GameScene OR's this source's `isFiring` into whatever the active source
 * (mouse or hand) reports, so SPACE fires even while hand tracking is live. Its
 * x/y mirror the pointer so it remains a complete InputSource on its own.
 *
 * Fire is edge-triggered: keydown sets a one-shot flag the next poll() consumes
 * (ignoring auto-repeat), so one press == one shot.
 */
export class KeyboardInputSource implements InputSource {
  private x = DISPLAY.WIDTH / 2;
  private y = DISPLAY.HEIGHT / 2;
  private firedSinceLastPoll = false;
  private spaceKey: Phaser.Input.Keyboard.Key | undefined;

  private readonly onMove = (p: Phaser.Input.Pointer): void => {
    this.x = p.x;
    this.y = p.y;
  };
  private readonly onSpaceDown = (): void => {
    this.firedSinceLastPoll = true;
  };

  constructor(private readonly scene: Phaser.Scene) {}

  start(): Promise<void> {
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    const kb = this.scene.input.keyboard;
    if (kb) {
      // Capture SPACE so the browser doesn't scroll the page on press.
      kb.addCapture("SPACE");
      this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      // emitOnRepeat defaults to false → one event per physical press.
      this.spaceKey.on("down", this.onSpaceDown);
    }
    return Promise.resolve();
  }

  stop(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    if (this.spaceKey) {
      this.spaceKey.off("down", this.onSpaceDown);
      this.scene.input.keyboard?.removeKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.spaceKey = undefined;
    }
  }

  poll(): InputState {
    const isFiring = this.firedSinceLastPoll;
    this.firedSinceLastPoll = false;
    return { x: this.x, y: this.y, isFiring };
  }
}
