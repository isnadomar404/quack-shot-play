import Phaser from "phaser";
import { ANIM, ASSET } from "../config/tuning";
// Asset URLs imported so Vite fingerprints + copies them (dev and build).
import duckFlyUrl from "../../assets/sprites/duck_fly.png";
import duckGlideUrl from "../../assets/sprites/duck_glide.png";
import duckHitUrl from "../../assets/sprites/duck_hit.png";
import dogSniffUrl from "../../assets/sprites/dog_sniff.png";
import dogLaughUrl from "../../assets/sprites/dog_laugh.png";
import dogRetrieveUrl from "../../assets/sprites/dog_retrieve.png";
import manUrl from "../../assets/sprites/man.png";

/**
 * BootScene — preloads the sprite sheets (68x68 frames per the CLAUDE.md asset
 * contract), registers the animations once (the anim manager is global), then
 * hands off to Game with UI layered on top.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "Boot" });
  }

  preload(): void {
    const frame = {
      frameWidth: ASSET.FRAME_SIZE,
      frameHeight: ASSET.FRAME_SIZE,
    };
    this.load.spritesheet("duck_fly", duckFlyUrl, frame);
    this.load.spritesheet("duck_glide", duckGlideUrl, frame);
    this.load.spritesheet("duck_hit", duckHitUrl, frame);
    this.load.spritesheet("dog_sniff", dogSniffUrl, frame);
    this.load.spritesheet("dog_laugh", dogLaughUrl, frame);
    this.load.spritesheet("dog_retrieve", dogRetrieveUrl, frame);
    // Single 68x68 still image (the campfire interlude man — PixelLab).
    this.load.image("man", manUrl);
  }

  create(): void {
    // Small generated texture for the feather-burst particles (tinted later).
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 3, 3);
    g.generateTexture("feather", 3, 3);
    g.destroy();

    for (const a of Object.values(ANIM)) {
      this.anims.create({
        key: a.key,
        frames: this.anims.generateFrameNumbers(a.key, {
          start: a.start,
          end: a.end,
        }),
        frameRate: a.frameRate,
        repeat: a.repeat,
      });
    }

    // Wait for the pixel heading font so the title isn't drawn in a fallback
    // face and then reflowed. Race it against a short timeout so a slow/blocked
    // CDN never stalls the boot — the game starts regardless.
    void this.waitForFont().then(() => {
      this.scene.start("Game");
      this.scene.launch("UI"); // UI runs in parallel, layered above Game
    });
  }

  /** Resolve once "Press Start 2P" is ready, or after a timeout — whichever
   *  comes first. Degrades gracefully where the Font Loading API is absent. */
  private waitForFont(): Promise<void> {
    const TIMEOUT_MS = 1500;
    const ready =
      typeof document !== "undefined" && "fonts" in document
        ? document.fonts.load('10px "Press Start 2P"').then(() => undefined)
        : Promise.resolve();
    const timeout = new Promise<void>((resolve) =>
      window.setTimeout(resolve, TIMEOUT_MS),
    );
    return Promise.race([ready, timeout]);
  }
}
