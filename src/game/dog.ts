import Phaser from "phaser";
import { ANIM, ASSET, DISPLAY, DOG, GROUND_Y_FRACTION } from "../config/tuning";

/**
 * Dog — the heart of the mockery (CLAUDE.md / PLAN.md, don't cut it). Three
 * behaviours, each ending by calling the supplied onDone so the scene can
 * sequence the loop:
 *   playIntro    — sniff-walks along the grass, then dives in (round start)
 *   playRetrieve — pops up holding the bagged duck (on a hit)
 *   playLaugh    — pops up and taunts (on a miss)
 *
 * Uses the real sprite sheets (dog_sniff / dog_retrieve / dog_laugh). The
 * dog_retrieve sheet shows only the dog, so the bagged duck is composited as a
 * separate overlay pinned to the dog's mouth (see heldDuck). The dog reads no
 * input.
 */
export class Dog {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  /** Bagged-duck overlay shown only during a retrieve, pinned to the mouth. */
  private readonly heldDuck: Phaser.GameObjects.Sprite;
  private readonly groundY: number;
  private readonly hiddenY: number;
  private readonly walkY: number;
  private readonly popY: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.groundY = Math.floor(DISPLAY.HEIGHT * GROUND_Y_FRACTION);
    // Fully off the bottom edge (account for the scaled sprite height).
    this.hiddenY = DISPLAY.HEIGHT + ASSET.FRAME_SIZE * DOG.SPRITE_SCALE;
    this.walkY = this.groundY + DOG.WALK_OFFSET_Y;
    this.popY = this.groundY + DOG.POP_OFFSET_Y;

    this.sprite = scene.add
      .sprite(DISPLAY.WIDTH / 2, this.hiddenY, ANIM.DOG_SNIFF.key)
      .setOrigin(0.5, 1)
      .setScale(DOG.SPRITE_SCALE)
      .setDepth(50)
      .setVisible(false);

    // Held duck: static last "hit" frame, tilted limp, drawn above the dog.
    this.heldDuck = scene.add
      .sprite(0, 0, ANIM.DUCK_HIT.key, ANIM.DUCK_HIT.end)
      .setOrigin(0.5, 0.5)
      .setScale(DOG.HELD_DUCK_SCALE)
      .setAngle(DOG.HELD_DUCK_ANGLE)
      .setDepth(51)
      .setVisible(false);
    // Keep the held duck pinned to the dog's mouth through every tween.
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.syncHeldDuck, this);
  }

  /** Pin the held duck to the dog's mouth while it's shown (runs each frame). */
  private syncHeldDuck(): void {
    if (!this.heldDuck.visible) return;
    this.heldDuck.setPosition(
      this.sprite.x + DOG.HELD_DUCK_OFFSET_X,
      this.sprite.y + DOG.HELD_DUCK_OFFSET_Y,
    );
  }

  /** Sniff-walk across the grass, then dive in. */
  playIntro(onDone: () => void): void {
    this.sprite.setVisible(true).setFlipX(false);
    this.sprite.play(ANIM.DOG_SNIFF.key);
    this.sprite.setPosition(-ASSET.FRAME_SIZE * DOG.SPRITE_SCALE, this.walkY);

    const targetX = DISPLAY.WIDTH * DOG.WALK_TO_X_FRACTION;
    const durationMs =
      (Math.abs(targetX - this.sprite.x) / DOG.WALK_SPEED) * 1000;

    const bob = this.scene.tweens.add({
      targets: this.sprite,
      y: this.walkY - DOG.SNIFF_BOB_PX,
      duration: 200,
      yoyo: true,
      repeat: -1,
    });

    this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      duration: durationMs,
      ease: "Linear",
      onComplete: () => {
        bob.stop();
        this.sprite.y = this.walkY;
        // little hop, then drop out of sight
        this.scene.tweens.add({
          targets: this.sprite,
          y: this.walkY - 14,
          duration: 150,
          onComplete: () => {
            this.scene.tweens.add({
              targets: this.sprite,
              y: this.hiddenY,
              duration: 200,
              onComplete: () => {
                this.sprite.setVisible(false);
                onDone();
              },
            });
          },
        });
      },
    });
  }

  /** Pop up at x holding the duck, hold, then drop. */
  playRetrieve(x: number, onDone: () => void): void {
    this.heldDuck.setVisible(true);
    this.syncHeldDuck(); // seat it before the first render to avoid a flash
    this.popUpAt(x, ANIM.DOG_RETRIEVE.key, () => {
      this.scene.time.delayedCall(DOG.REACTION_HOLD_MS, () => {
        this.dropDown(() => {
          this.heldDuck.setVisible(false);
          onDone();
        });
      });
    });
  }

  /** Pop up at x and taunt, then drop. */
  playLaugh(x: number, onDone: () => void): void {
    this.popUpAt(x, ANIM.DOG_LAUGH.key, () => {
      this.scene.tweens.add({
        targets: this.sprite,
        y: this.popY - DOG.LAUGH_BOB_PX,
        duration: DOG.LAUGH_BOB_MS,
        yoyo: true,
        repeat: DOG.LAUGH_BOBS - 1,
        onComplete: () => this.dropDown(onDone),
      });
    });
  }

  private popUpAt(x: number, animKey: string, onComplete: () => void): void {
    const half = (ASSET.FRAME_SIZE * DOG.SPRITE_SCALE) / 2;
    const px = Phaser.Math.Clamp(x, half, DISPLAY.WIDTH - half);
    this.sprite.setVisible(true).setFlipX(false);
    this.sprite.play(animKey);
    this.sprite.setPosition(px, this.hiddenY);
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.popY,
      duration: DOG.POP_MS,
      ease: "Back.easeOut",
      onComplete,
    });
  }

  private dropDown(onComplete: () => void): void {
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.hiddenY,
      duration: DOG.POP_MS,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.sprite.setVisible(false);
        onComplete();
      },
    });
  }
}
