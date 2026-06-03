import Phaser from "phaser";
import { DISPLAY } from "./config/tuning";
import { BootScene } from "./scenes/Boot";
import { GameScene } from "./scenes/Game";
import { UIScene } from "./scenes/UI";

/**
 * Game entry point. Wires up Phaser with the three (and only three) scenes:
 * Boot, Game, UI — per CLAUDE.md. No game logic lives here.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: DISPLAY.WIDTH,
  height: DISPLAY.HEIGHT,
  backgroundColor: DISPLAY.BACKGROUND_COLOR,
  pixelArt: true, // nearest-neighbour scaling, no smoothing — retro crispness
  roundPixels: true,
  scale: {
    parent: "app",
    // FIT keeps the retro 4:3 internal resolution and scales it up/down to fill
    // the window, letterboxing on non-4:3 screens. Responsive to any window
    // size; the internal resolution (and thus all layout) stays fixed.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true, // let the canvas drive the parent's size if needed
    autoRound: true, // integer canvas dimensions — avoids half-pixel blur
  },
  scene: [BootScene, GameScene, UIScene],
};

const game = new Phaser.Game(config);

// Phaser's FIT scaler refreshes on window resize, but some cases (orientation
// flips, the browser restoring a collapsed viewport, mobile URL-bar show/hide)
// don't always fire a clean resize — nudge the scale manager on both events.
// Phaser's FIT scaler already self-handles window resize/orientation; this is
// belt-and-suspenders for cases where a clean resize event doesn't fire (a
// restored collapsed viewport, mobile URL-bar show/hide). The resize event
// fires after layout, so reading the parent bounds here is up to date.
const refreshScale = (): void => {
  game.scale.refresh();
};
window.addEventListener("resize", refreshScale);
window.addEventListener("orientationchange", refreshScale);

// Vite HMR: destroy the running game before a hot update creates a new one,
// otherwise instances stack up (duplicate canvases / stale scenes). This keeps
// the live-tuning workflow in Cursor (edit tuning.ts, see it instantly) clean.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener("resize", refreshScale);
    window.removeEventListener("orientationchange", refreshScale);
    game.destroy(true);
  });
}
