import Phaser from "phaser";
import { CRT, DISPLAY, TYPO } from "../config/tuning";
import { HUD_EVENT, type HudState } from "./Game";

/**
 * UIScene — HUD layer above the Game scene, driven by HUD events. Shows score,
 * shots-left, round number, and the ducks-bagged row (hit / miss / pending) with
 * the round's pass threshold. Decoupled from gameplay via game-level events.
 */
export class UIScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private shotsText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private bagText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "UI" });
  }

  create(): void {
    // Arcade HUD bars top + bottom for legibility over the playfield.
    const bar = this.add.graphics().setDepth(0);
    bar.fillStyle(0x1a1c2c, 0.55); // PALETTE[0]
    bar.fillRect(0, 0, DISPLAY.WIDTH, 13);
    bar.fillRect(0, DISPLAY.HEIGHT - 13, DISPLAY.WIDTH, 13);

    // Labels use the pixel heading font at a tiny size for that cabinet look.
    const label: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: TYPO.HEADING,
      fontSize: "8px",
      color: "#ffcd75", // PALETTE[4]
    };
    this.scoreText = this.add.text(6, 3, "SCORE 000000", label).setDepth(10);
    this.roundText = this.add
      .text(DISPLAY.WIDTH / 2, 3, "ROUND 1", label)
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.shotsText = this.add
      .text(DISPLAY.WIDTH - 6, 3, "SHOTS 3", label)
      .setOrigin(1, 0)
      .setDepth(10);
    // Bag row keeps the monospace font (● × · glyphs the pixel font lacks).
    this.bagText = this.add
      .text(DISPLAY.WIDTH / 2, DISPLAY.HEIGHT - 11, "", {
        fontFamily: TYPO.BODY,
        fontSize: "10px",
        color: "#f4f4f4",
      })
      .setOrigin(0.5, 0)
      .setDepth(10);

    const onHud = (state: HudState): void => {
      this.scoreText.setText(`SCORE ${String(state.score).padStart(6, "0")}`);
      this.shotsText.setText(`SHOTS ${state.shots}`);
      this.roundText.setText(`ROUND ${state.round}`);
      this.bagText.setText(this.buildBagRow(state));
    };
    this.game.events.on(HUD_EVENT, onHud);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(HUD_EVENT, onHud);
    });

    this.drawScanlines();
  }

  /** Optional subtle CRT scanline overlay drawn above everything. */
  private drawScanlines(): void {
    if (!CRT.ENABLED) return;
    const g = this.add.graphics().setDepth(1000);
    g.fillStyle(0x000000, CRT.ALPHA);
    for (let y = 0; y < DISPLAY.HEIGHT; y += CRT.LINE_GAP) {
      g.fillRect(0, y, DISPLAY.WIDTH, 1);
    }
  }

  /** hit = ●, miss = ×, not-yet-presented = ·  (+ pass threshold). */
  private buildBagRow(state: HudState): string {
    let row = "";
    for (let i = 0; i < state.ducksPerRound; i++) {
      const result = state.results[i];
      row += result === undefined ? "·" : result ? "●" : "×";
    }
    return `${row}  PASS ${state.threshold}`;
  }
}
