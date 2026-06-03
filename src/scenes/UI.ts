import Phaser from "phaser";
import { CRT, DISPLAY, TYPO } from "../config/tuning";
import { sfx } from "../audio/sfx";
import { HUD_EVENT, type HudState } from "./Game";

/**
 * UIScene — HUD layer above the Game scene, driven by HUD events. Shows score,
 * shots-left, the active level name, and the targets-bagged row (hit / miss /
 * pending) with the level's pass threshold. Decoupled from gameplay via events.
 */
export class UIScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private shotsText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private bagText!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;

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
      .text(DISPLAY.WIDTH / 2, 3, "MEADOW", label)
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
      this.roundText.setText(state.levelName.toUpperCase());
      this.bagText.setText(this.buildBagRow(state));
    };
    this.game.events.on(HUD_EVENT, onHud);

    // Mute toggle + corner hint (bottom-left). [M] flips it; persisted in sfx.
    this.muteText = this.add
      .text(6, DISPLAY.HEIGHT - 11, "", {
        fontFamily: TYPO.BODY,
        fontSize: "8px",
        color: "#94b0c2",
      })
      .setOrigin(0, 0)
      .setDepth(10);
    this.refreshMute();
    this.input.keyboard?.on("keydown-M", () => {
      sfx.toggleMute();
      this.refreshMute();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(HUD_EVENT, onHud);
    });

    this.drawScanlines();
  }

  /** Update the mute hint to reflect the current state. */
  private refreshMute(): void {
    const muted = sfx.isMuted();
    this.muteText.setText(muted ? "[M] MUTED" : "[M] MUTE");
    this.muteText.setColor(muted ? "#b13e53" : "#94b0c2"); // red when muted
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
    for (let i = 0; i < state.targetsPerRound; i++) {
      const result = state.results[i];
      row += result === undefined ? "·" : result ? "●" : "×";
    }
    return `${row}  PASS ${state.threshold}`;
  }
}
