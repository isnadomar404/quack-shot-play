import Phaser from "phaser";
import { DISPLAY, DUCK, GROUND_Y_FRACTION, LEVEL, PATH } from "../config/tuning";
import {
  SPECIES_ART,
  type PathStyle,
  type SpawnEntry,
} from "../levels/LevelConfig";

/** Resolved result once the target leaves play. */
export type TargetOutcome = "hit" | "miss";

type TargetState = "flying" | "fleeing" | "falling" | "gone";

/** Where the target enters from. Top entries swoop in from behind the clouds. */
type Entry = "bottom" | "left" | "right" | "top";

export interface TargetOptions {
  /** Endless-replay speed scaler (1 on the first pass). */
  speedMultiplier: number;
  /** Global wind drift (px/sec) applied every frame, if the level sets it. */
  wind?: { x: number; y: number };
  /** Render as a flat-dark silhouette (Night). */
  silhouette?: boolean;
}

/**
 * Target — any flying quarry (duck / teal / pheasant / eagle / bat / owl),
 * fully driven by a level's SpawnEntry. Species art, speed, scale, score, and
 * flight-path style all come from config — nothing is hard-coded per species.
 *
 * Shared feel (from the duck model): perspective scale by Y (small/far high up,
 * big/near low), depth flip around the cloud layer, and varied entry edges.
 * Per-spec: speedRange, scale multiplier, scoreBase, and pathStyle (which
 * shapes the horizontal motion). Level atmosphere adds wind + silhouette.
 *
 * Never reads input — hit-testing is the scene's job via contains().
 */
export class Target {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly groundY: number;
  private readonly diveTargetY: number;
  private state: TargetState = "flying";
  /** Directional base horizontal speed (sign = travel direction). */
  private baseVx: number;
  private vx: number;
  private vy: number;
  private sinceTurnMs = 0;
  private aliveMs = 0;
  private resolvedOutcome: TargetOutcome | null = null;
  private entered = false;
  private diving = false;
  private currentScale: number = DUCK.SCALE_NEAR;

  private readonly pathStyle: PathStyle;
  private readonly scaleMult: number;
  private readonly hitKey: string;
  private readonly wind: { x: number; y: number };
  /** Per-species base score (read by the scene on resolve). */
  readonly scoreBase: number;

  constructor(scene: Phaser.Scene, spec: SpawnEntry, opts: TargetOptions) {
    this.pathStyle = spec.pathStyle;
    this.scaleMult = spec.scale;
    this.scoreBase = spec.scoreBase;
    this.wind = opts.wind ?? { x: 0, y: 0 };
    this.groundY = Math.floor(DISPLAY.HEIGHT * GROUND_Y_FRACTION);
    this.diveTargetY = this.groundY * DUCK.DIVE_TARGET_FRACTION;

    const art = SPECIES_ART[spec.species];
    this.hitKey = art.hitKey;

    const speedMag =
      Phaser.Math.Between(spec.speedRange[0], spec.speedRange[1]) *
      opts.speedMultiplier;

    const spawn = this.chooseSpawn(speedMag);
    this.baseVx = spawn.vx;
    this.vx = spawn.vx;
    this.vy = spawn.vy;
    this.diving = spawn.diving;

    this.sprite = scene.add.sprite(spawn.x, spawn.y, art.flyKey);
    this.sprite.play(art.flyKey);
    if (opts.silhouette) this.sprite.setTintFill(LEVEL.SILHOUETTE_COLOR);
    else if (art.tint !== undefined) this.sprite.setTint(art.tint);

    this.entered = this.onScreen();
    this.applyPerspective();
    this.faceTravel();
  }

  /** Pick a weighted entry edge and return its spawn position + velocity. */
  private chooseSpawn(speedMag: number): {
    x: number;
    y: number;
    vx: number;
    vy: number;
    diving: boolean;
  } {
    const W = DISPLAY.WIDTH;
    const drift = DUCK.VERTICAL_DRIFT;
    const edgeDrift = drift * DUCK.EDGE_DRIFT_FACTOR;
    const randX = Phaser.Math.Between(DUCK.SPAWN_MARGIN, W - DUCK.SPAWN_MARGIN);
    const sideY = Phaser.Math.Between(
      Math.floor(this.groundY * 0.45),
      this.groundY - DUCK.HEIGHT,
    );
    const dir = Math.random() < 0.5 ? -1 : 1;

    switch (this.pickEntry()) {
      case "left":
        return { x: -DUCK.HEIGHT, y: sideY, vx: speedMag, vy: -edgeDrift, diving: false };
      case "right":
        return {
          x: W + DUCK.HEIGHT,
          y: sideY,
          vx: -speedMag,
          vy: -edgeDrift,
          diving: false,
        };
      case "top":
        return {
          x: randX,
          y: -DUCK.HEIGHT,
          vx: dir * speedMag,
          vy: DUCK.DIVE_SPEED,
          diving: true,
        };
      case "bottom":
      default:
        return {
          x: randX,
          y: this.groundY - DUCK.HEIGHT,
          vx: dir * speedMag,
          vy: -drift,
          diving: false,
        };
    }
  }

  private pickEntry(): Entry {
    const total =
      DUCK.ENTRY_WEIGHT_BOTTOM +
      DUCK.ENTRY_WEIGHT_LEFT +
      DUCK.ENTRY_WEIGHT_RIGHT +
      DUCK.ENTRY_WEIGHT_TOP;
    let r = Math.random() * total;
    if ((r -= DUCK.ENTRY_WEIGHT_BOTTOM) < 0) return "bottom";
    if ((r -= DUCK.ENTRY_WEIGHT_LEFT) < 0) return "left";
    if ((r -= DUCK.ENTRY_WEIGHT_RIGHT) < 0) return "right";
    return "top";
  }

  /** Recompute vx from the flight-path style (call once per frame). */
  private updatePath(): void {
    switch (this.pathStyle) {
      case "straight":
        this.vx = this.baseVx; // unwavering
        break;
      case "sine": {
        const sway =
          Math.sin((this.aliveMs / 1000) * 2 * Math.PI * PATH.SINE_HZ) *
          PATH.SINE_SWAY;
        this.vx = this.baseVx + sway;
        break;
      }
      case "sharp_turns":
        if (this.sinceTurnMs >= PATH.SHARP_TURN_MS) {
          this.sinceTurnMs = 0;
          this.baseVx = -this.baseVx; // hard reversal
        }
        this.vx = this.baseVx;
        break;
      case "zigzag":
        if (this.sinceTurnMs >= PATH.ZIGZAG_MS) {
          this.sinceTurnMs = 0;
          this.baseVx = (Math.random() < 0.5 ? -1 : 1) * Math.abs(this.baseVx);
        }
        this.vx = this.baseVx;
        break;
    }
  }

  /** Scale + depth from the current Y: small/behind clouds high up, big/in front
   *  near the ground. Multiplied by the species scale. */
  private applyPerspective(): void {
    const span = this.groundY - DUCK.PERSPECTIVE_TOP_Y;
    const t = Phaser.Math.Clamp(
      (this.sprite.y - DUCK.PERSPECTIVE_TOP_Y) / span,
      0,
      1,
    );
    const persp = DUCK.SCALE_FAR + (DUCK.SCALE_NEAR - DUCK.SCALE_FAR) * t;
    this.currentScale = persp * this.scaleMult;
    this.sprite.setScale(this.currentScale);
    this.sprite.setDepth(
      this.sprite.y < DUCK.DEPTH_FLIP_Y ? DUCK.DEPTH_BEHIND : DUCK.DEPTH_FRONT,
    );
  }

  /** Rotate the upright art to fly horizontally, head leading travel. */
  private faceTravel(): void {
    this.sprite.setAngle(90);
    this.sprite.setFlipY(this.vx < 0);
  }

  private onScreen(): boolean {
    const halfW = DUCK.WIDTH / 2;
    return (
      this.sprite.x >= halfW &&
      this.sprite.x <= DISPLAY.WIDTH - halfW &&
      this.sprite.y >= 0
    );
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  isFlying(): boolean {
    return this.state === "flying";
  }
  isGone(): boolean {
    return this.state === "gone";
  }
  get outcome(): TargetOutcome | null {
    return this.resolvedOutcome;
  }

  /** Axis-aligned hit test. The box scales with the target's perspective size
   *  (far/small targets are smaller, near/big species are larger) + flat pad. */
  contains(px: number, py: number): boolean {
    const ratio = this.currentScale / DUCK.SCALE_NEAR;
    const halfW = (DUCK.WIDTH / 2) * ratio + DUCK.HITBOX_PADDING;
    const halfH = (DUCK.HEIGHT / 2) * ratio + DUCK.HITBOX_PADDING;
    return (
      Math.abs(px - this.sprite.x) <= halfW &&
      Math.abs(py - this.sprite.y) <= halfH
    );
  }

  hit(): void {
    if (this.state !== "flying") return;
    this.state = "falling";
    this.resolvedOutcome = "hit";
    this.sprite.setAngle(0).setFlipY(false);
    this.sprite.setDepth(DUCK.DEPTH_FRONT);
    this.sprite.play(this.hitKey);
  }

  flee(): void {
    if (this.state !== "flying") return;
    this.state = "fleeing";
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    switch (this.state) {
      case "flying": {
        if (this.entered) {
          this.aliveMs += dtMs;
          this.sinceTurnMs += dtMs;
          this.updatePath();
        }
        this.sprite.x += (this.vx + this.wind.x) * dt;
        this.sprite.y += (this.vy + this.wind.y) * dt;

        if (this.diving && this.sprite.y >= this.diveTargetY) {
          this.diving = false;
          this.vy = -DUCK.VERTICAL_DRIFT;
        }

        this.applyPerspective();
        this.faceTravel();

        if (!this.entered && this.onScreen()) this.entered = true;
        if (this.entered) {
          this.bounceWalls();
          if (this.aliveMs >= DUCK.ESCAPE_TIMER_MS) this.flee();
          this.checkFlewOffTop();
        }
        break;
      }
      case "fleeing": {
        this.sprite.x += (this.vx + this.wind.x) * dt;
        this.sprite.y -= DUCK.FLEE_SPEED * dt;
        this.applyPerspective();
        this.faceTravel();
        this.bounceWalls();
        this.checkFlewOffTop();
        break;
      }
      case "falling": {
        // Drop past the grass line and sink behind the foreground foliage
        // (hides behind the bushes) before leaving play.
        this.sprite.y += DUCK.FALL_SPEED * dt;
        if (this.sprite.y >= this.groundY + DUCK.FALL_SINK) this.state = "gone";
        break;
      }
      case "gone":
        break;
    }
  }

  private bounceWalls(): void {
    const halfW = DUCK.WIDTH / 2;
    if (this.sprite.x < halfW) {
      this.sprite.x = halfW;
      this.baseVx = Math.abs(this.baseVx);
      this.vx = Math.abs(this.vx);
    } else if (this.sprite.x > DISPLAY.WIDTH - halfW) {
      this.sprite.x = DISPLAY.WIDTH - halfW;
      this.baseVx = -Math.abs(this.baseVx);
      this.vx = -Math.abs(this.vx);
    }
  }

  private checkFlewOffTop(): void {
    if (this.sprite.y < -DUCK.HEIGHT) {
      this.state = "gone";
      this.resolvedOutcome = "miss";
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
