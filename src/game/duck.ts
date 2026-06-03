import Phaser from "phaser";
import { ANIM, DISPLAY, DUCK, GROUND_Y_FRACTION } from "../config/tuning";

/** Resolved result once the duck leaves play. */
export type DuckOutcome = "hit" | "miss";

type DuckState = "flying" | "fleeing" | "falling" | "gone";

/** Where the duck enters from. Top entries swoop in from behind the clouds. */
type Entry = "bottom" | "left" | "right" | "top";

/**
 * A single duck. Lifecycle:
 *   flying  — zig-zag horizontally, drift upward; escape timer ticking
 *   fleeing — shot missed / timer expired: bolt straight up and off the top
 *   falling — struck: drop to the ground
 *   gone    — left play; `outcome` tells the scene to score it (hit) or not
 *
 * Two feel features:
 *  - **Perspective.** The sprite scales with its Y — big/close near the ground,
 *    small/far high in the sky — so climbing reads as flying into the distance.
 *    Its render depth flips around the cloud layer, so high ducks pass BEHIND
 *    the clouds and low ducks in front.
 *  - **Varied entry.** It can enter from the bottom, either side, or the top
 *    (diving in from behind the clouds before climbing away).
 *
 * The duck never reads input — hit-testing is the scene's job via contains().
 */
export class Duck {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly groundY: number;
  private readonly diveTargetY: number;
  private state: DuckState = "flying";
  private vx: number;
  private vy: number;
  private sinceTurnMs = 0;
  private aliveMs = 0;
  private resolvedOutcome: DuckOutcome | null = null;
  private readonly speedFactor: number;
  /** True once the duck has flown fully into the play area (gates wall-bounce
   *  + escape so it can enter from off-screen edges/top first). */
  private entered = false;
  /** Top entries descend until they reach diveTargetY, then start climbing. */
  private diving = false;
  /** Current perspective scale (drives the visual + the hitbox size). */
  private currentScale: number = DUCK.SCALE_NEAR;

  /** speedFactor scales horizontal speed + drift for the round ramp. */
  constructor(scene: Phaser.Scene, speedFactor = 1) {
    this.speedFactor = speedFactor;
    this.groundY = Math.floor(DISPLAY.HEIGHT * GROUND_Y_FRACTION);
    this.diveTargetY = this.groundY * DUCK.DIVE_TARGET_FRACTION;

    const spawn = this.chooseSpawn();
    this.vx = spawn.vx;
    this.vy = spawn.vy;
    this.diving = spawn.diving;

    this.sprite = scene.add.sprite(spawn.x, spawn.y, ANIM.DUCK_FLY.key);
    this.sprite.play(ANIM.DUCK_FLY.key);
    this.entered = this.onScreen();
    this.applyPerspective();
    this.faceTravel();
  }

  /** Pick a weighted entry edge and return its spawn position + velocity. */
  private chooseSpawn(): { x: number; y: number; vx: number; vy: number; diving: boolean } {
    const W = DISPLAY.WIDTH;
    const drift = DUCK.VERTICAL_DRIFT * this.speedFactor;
    const edgeDrift = drift * DUCK.EDGE_DRIFT_FACTOR;
    const mag = this.rollSpeedMagnitude();
    const randX = Phaser.Math.Between(DUCK.SPAWN_MARGIN, W - DUCK.SPAWN_MARGIN);
    // A random Y in the lower-middle band for side entries.
    const sideY = Phaser.Math.Between(
      Math.floor(this.groundY * 0.45),
      this.groundY - DUCK.HEIGHT,
    );

    switch (this.pickEntry()) {
      case "left":
        return { x: -DUCK.HEIGHT, y: sideY, vx: mag, vy: -edgeDrift, diving: false };
      case "right":
        return { x: W + DUCK.HEIGHT, y: sideY, vx: -mag, vy: -edgeDrift, diving: false };
      case "top":
        // Swoop in from behind the clouds: start above, descending.
        return {
          x: randX,
          y: -DUCK.HEIGHT,
          vx: Math.random() < 0.5 ? -mag : mag,
          vy: DUCK.DIVE_SPEED * this.speedFactor,
          diving: true,
        };
      case "bottom":
      default:
        return {
          x: randX,
          y: this.groundY - DUCK.HEIGHT,
          vx: Math.random() < 0.5 ? -mag : mag,
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

  /** A positive horizontal speed magnitude for this round's pace. */
  private rollSpeedMagnitude(): number {
    return (
      Phaser.Math.Between(DUCK.SPEED * DUCK.SPEED_MIN_FACTOR, DUCK.SPEED) *
      this.speedFactor
    );
  }

  private rollHorizontalSpeed(): number {
    const dir = Math.random() < 0.5 ? -1 : 1;
    return dir * this.rollSpeedMagnitude();
  }

  /** Scale + depth from the current Y: small/behind clouds high up, big/in front
   *  near the ground. */
  private applyPerspective(): void {
    const span = this.groundY - DUCK.PERSPECTIVE_TOP_Y;
    const t = Phaser.Math.Clamp(
      (this.sprite.y - DUCK.PERSPECTIVE_TOP_Y) / span,
      0,
      1,
    );
    this.currentScale = DUCK.SCALE_FAR + (DUCK.SCALE_NEAR - DUCK.SCALE_FAR) * t;
    this.sprite.setScale(this.currentScale);
    this.sprite.setDepth(
      this.sprite.y < DUCK.DEPTH_FLIP_Y ? DUCK.DEPTH_BEHIND : DUCK.DEPTH_FRONT,
    );
  }

  /** The sprite art stands upright (head up); rotate +90° to fly horizontally
   *  (head leads to the right, belly down), then flip vertically when travelling
   *  left so the head leads left while the belly stays down (not upside-down). */
  private faceTravel(): void {
    this.sprite.setAngle(90);
    this.sprite.setFlipY(this.vx < 0);
  }

  /** True once the duck's centre is within the screen bounds. */
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
  /** Only meaningful once isGone() is true. */
  get outcome(): DuckOutcome | null {
    return this.resolvedOutcome;
  }

  /** Axis-aligned hit test in game coordinates. The box scales with the duck's
   *  perspective size (far ducks are smaller targets), plus flat fairness pad. */
  contains(px: number, py: number): boolean {
    const ratio = this.currentScale / DUCK.SCALE_NEAR;
    const halfW = (DUCK.WIDTH / 2) * ratio + DUCK.HITBOX_PADDING;
    const halfH = (DUCK.HEIGHT / 2) * ratio + DUCK.HITBOX_PADDING;
    return (
      Math.abs(px - this.sprite.x) <= halfW &&
      Math.abs(py - this.sprite.y) <= halfH
    );
  }

  /** Mark struck — begins the fall. Scoring is the scene's call. */
  hit(): void {
    if (this.state !== "flying") return;
    this.state = "falling";
    this.resolvedOutcome = "hit";
    this.sprite.setAngle(0).setFlipY(false); // upright for the shot/fall pose
    this.sprite.setDepth(DUCK.DEPTH_FRONT); // always in front while falling
    this.sprite.play(ANIM.DUCK_HIT.key);
  }

  /** Send the duck packing (out of ammo / escape timer). */
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
          if (this.sinceTurnMs >= DUCK.TURN_INTERVAL_MS) {
            this.sinceTurnMs = 0;
            this.vx = this.rollHorizontalSpeed();
          }
        }
        this.sprite.x += this.vx * dt;
        this.sprite.y += this.vy * dt;

        // Top entries dive in, then switch to the normal upward climb.
        if (this.diving && this.sprite.y >= this.diveTargetY) {
          this.diving = false;
          this.vy = -DUCK.VERTICAL_DRIFT * this.speedFactor;
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
        this.sprite.x += this.vx * dt;
        this.sprite.y -= DUCK.FLEE_SPEED * dt;
        this.applyPerspective();
        this.faceTravel();
        this.bounceWalls();
        this.checkFlewOffTop();
        break;
      }
      case "falling": {
        this.sprite.y += DUCK.FALL_SPEED * dt;
        if (this.sprite.y >= this.groundY) this.state = "gone";
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
      this.vx = Math.abs(this.vx);
    } else if (this.sprite.x > DISPLAY.WIDTH - halfW) {
      this.sprite.x = DISPLAY.WIDTH - halfW;
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
