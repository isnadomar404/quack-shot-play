import Phaser from "phaser";
import {
  ANIM,
  DISPLAY,
  DUCK,
  FX,
  GROUND_Y_FRACTION,
  HAND,
  ROUND,
  SCENE,
  SHOTS,
  TITLE_FX,
  TYPO,
} from "../config/tuning";
import type { InputSource, InputState } from "../input/InputSource";
import { MouseInputSource } from "../input/MouseInputSource";
import { KeyboardInputSource } from "../input/KeyboardInputSource";
import { HandInputSource } from "../input/HandInputSource";
import { Duck } from "../game/duck";
import { Dog } from "../game/dog";
import { Score } from "../game/score";
import { RoundManager } from "../game/round";
import { loadHiScore, saveHiScore } from "../game/highscore";
import { Crosshair } from "../ui/crosshair";
import { TrackingIndicator } from "../ui/trackingIndicator";
import { sfx } from "../audio/sfx";

/** HUD payload broadcast to the UI scene. */
export interface HudState {
  score: number;
  shots: number;
  round: number;
  threshold: number;
  ducksPerRound: number;
  results: readonly boolean[];
}
export const HUD_EVENT = "hud:update";

/** Original working title — NOT a Nintendo name (CLAUDE.md). */
const TITLE = "QUACK SHOT";

type Mode =
  | "title"
  | "calibrate"
  | "intro"
  | "playing"
  | "reaction"
  | "transition"
  | "gameover";

/** Steps of the calibration-as-tutorial first-run flow (hand path only). */
type CalibStep = "hand" | "corners" | "practice";

/** Screen corners the player traces, in order: TL, TR, BR, BL. */
const CORNER_TARGETS: ReadonlyArray<readonly [number, number]> = [
  [12, 28],
  [DISPLAY.WIDTH - 12, 28],
  [DISPLAY.WIDTH - 12, DISPLAY.HEIGHT - 12],
  [12, DISPLAY.HEIGHT - 12],
];

/**
 * GameScene — playfield, the core loop, rounds/progression, the dog, and the
 * Phase 4 juice (SFX, score popups, screen shake, feather bursts, title +
 * game-over screens). Scenes stay exactly Boot/Game/UI, so the title and
 * transition "screens" are modes/overlays here rather than separate scenes.
 *
 * Reads input ONLY through an InputSource — never the Phaser pointer directly.
 */
export class GameScene extends Phaser.Scene {
  private inputSource!: InputSource;
  private duck!: Duck;
  private dog!: Dog;
  private feathers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly score = new Score();
  private readonly round = new RoundManager();
  private shotsLeft = SHOTS.PER_DUCK;
  private mode: Mode = "title";
  private crosshair!: Crosshair;
  private tracking!: TrackingIndicator;
  /** SPACEBAR-fire source, OR'd into the active source every frame (permanent). */
  private keyboard!: KeyboardInputSource;
  private banner: Phaser.GameObjects.Text[] = [];
  /** Set once webcam tracking is live; null while on the mouse fallback. */
  private hand: HandInputSource | null = null;
  private audioUnlock: (() => void) | undefined;
  // Calibration-as-tutorial state (only used while mode === "calibrate").
  private calibStep: CalibStep = "hand";
  private calibObjects: Phaser.GameObjects.GameObject[] = [];
  private calibText: Phaser.GameObjects.Text | undefined;
  private cornerMarker: Phaser.GameObjects.Arc | undefined;
  private handStableFrames = 0;
  private practiceTargets: Phaser.GameObjects.Arc[] = [];
  private practiceHits = 0;
  private hiScore = loadHiScore();
  /** Title-screen display list (logo, prompt, footer, ambient sprites) — torn
   *  down together when play begins. */
  private titleObjects: Phaser.GameObjects.GameObject[] = [];
  /** Honour the OS "reduce motion" setting for the title bob/blink. */
  private reducedMotion = false;

  constructor() {
    super({ key: "Game" });
  }

  create(): void {
    this.reducedMotion =
      typeof window !== "undefined" && "matchMedia" in window
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
    this.drawBackdrop();

    // Mouse is the instant, permanent baseline so the game is playable while the
    // hand model downloads — and stays the fallback if there's no camera. We then
    // attempt to upgrade to webcam hand-tracking behind the same interface.
    this.inputSource = new MouseInputSource(this);
    void this.inputSource.start();
    this.input.setDefaultCursor("none");
    // SPACEBAR fire is wired alongside the mouse from the start (permanent).
    this.keyboard = new KeyboardInputSource(this);
    void this.keyboard.start();
    this.tryHandInput();

    // Audio must be unlocked from a TRUSTED user gesture (a camera-detected
    // pinch isn't one), so unlock on the first real click/keypress.
    this.unlockAudioOnFirstGesture();
    // [C] recalibrates: re-runs the corner tutorial when hand tracking is live.
    this.input.keyboard?.on("keydown-C", () => {
      if (this.hand) this.startCalibration();
    });

    // Tracking-quality dot (top-right); hidden until hand tracking is up.
    this.tracking = new TrackingIndicator(this);

    this.feathers = this.add
      .particles(0, 0, "feather", {
        lifespan: FX.FEATHER_LIFESPAN_MS,
        speed: { min: FX.FEATHER_SPEED * 0.4, max: FX.FEATHER_SPEED },
        angle: { min: 0, max: 360 },
        gravityY: 140,
        scale: { start: 1.3, end: 0 },
        tint: [0xf4f4f4, 0xffcd75, 0x94b0c2, 0xef7d57],
        emitting: false,
      })
      .setDepth(60);

    this.crosshair = new Crosshair(this);
    this.dog = new Dog(this);

    // Start on the title screen; first fire (finger-gun or click) begins play.
    this.mode = "title";
    this.showTitle();
    this.emitHud();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputSource.stop();
      this.keyboard.stop();
      this.clearTitle();
      this.clearCalib();
      if (this.audioUnlock) {
        window.removeEventListener("pointerdown", this.audioUnlock);
        window.removeEventListener("keydown", this.audioUnlock);
      }
    });
  }

  /** Try to upgrade from mouse to webcam tracking. On success, swap the source
   *  behind the interface; on failure (no camera / denied / model error), stay
   *  on the mouse — the game never blocks on the camera. */
  private tryHandInput(): void {
    const hand = new HandInputSource();
    hand
      .start()
      .then(() => {
        this.inputSource.stop(); // detach the mouse baseline
        this.inputSource = hand;
        this.hand = hand;
        // Hand just came online: run the calibration-as-tutorial before play.
        // Only interrupt the title screen; never yank an in-progress round.
        if (this.mode === "title") this.startCalibration();
      })
      .catch((err: unknown) => {
        hand.stop(); // tear down any partial camera/model
        console.info("[hand] tracking unavailable — using mouse:", err);
      });
  }

  private unlockAudioOnFirstGesture(): void {
    const unlock = (): void => {
      sfx.unlock();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      this.audioUnlock = undefined;
    };
    this.audioUnlock = unlock;
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  /** Per-frame crosshair state + tracking dot, from the hand status (if any). */
  private updateFeedback(input: InputState): void {
    const hs = this.hand?.getStatus();
    const armed =
      !!hs && hs.handPresent && hs.confidence >= HAND.TRACKING_CONFIDENCE_GREEN;
    this.crosshair.setState(armed ? "armed" : "idle");
    this.crosshair.update(input.x, input.y);
    this.tracking.set(hs ? hs.confidence : null, hs ? hs.handPresent : false);
  }

  /** Round opens with the dog's sniff-walk; first duck spawns when it dives in. */
  private startRound(): void {
    this.mode = "intro";
    this.emitHud();
    this.dog.playIntro(() => this.beginNextDuck());
  }

  private beginNextDuck(): void {
    this.mode = "playing";
    this.duck = new Duck(this, this.round.speedFactor);
    this.shotsLeft = SHOTS.PER_DUCK;
    sfx.quack();
    this.emitHud();
  }

  private emitHud(): void {
    const state: HudState = {
      score: this.score.total,
      shots: this.shotsLeft,
      round: this.round.current,
      threshold: this.round.passThreshold,
      ducksPerRound: ROUND.DUCKS_PER_ROUND,
      results: this.round.results,
    };
    this.game.events.emit(HUD_EVENT, state);
  }

  update(_time: number, deltaMs: number): void {
    // The active source (mouse or hand) provides position + its own fire; the
    // keyboard's SPACEBAR fire is OR'd in as a permanent fallback.
    const primary = this.inputSource.poll();
    const kb = this.keyboard.poll();
    const input: InputState = {
      x: primary.x,
      y: primary.y,
      isFiring: primary.isFiring || kb.isFiring,
    };

    if (this.mode === "calibrate") {
      this.updateCalibration(input);
    } else if (this.mode === "title" && input.isFiring) {
      sfx.unlock();
      this.clearTitle();
      this.startRound();
    } else if (this.mode === "playing") {
      if (input.isFiring && this.duck.isFlying() && this.shotsLeft > 0) {
        this.shotsLeft--;
        sfx.shot();
        this.cameras.main.shake(FX.SHAKE_FIRE_MS, FX.SHAKE_FIRE_INTENSITY);
        if (this.duck.contains(input.x, input.y)) {
          this.onHit(input.x, input.y);
        } else if (this.shotsLeft === 0) {
          this.duck.flee();
        }
        this.emitHud();
      }

      this.duck.update(deltaMs);
      if (this.duck.isGone()) this.resolveDuck();
    } else if (this.mode === "gameover" && input.isFiring) {
      this.restartGame();
    }

    // Crosshair fire-pulse on every shot (the "firing" feedback state).
    if (input.isFiring) this.crosshair.firePulse(input.x, input.y);
    this.updateFeedback(input);
  }

  // ── Calibration-as-tutorial (hand path only) ──────────────────────────────

  /** Enter the first-run tutorial: show hand → trace 4 corners → 3 practice
   *  pinches → start. Re-runnable via [C]. No-op safety if there's no hand. */
  private startCalibration(): void {
    this.clearTitle();
    this.clearBanner();
    this.clearCalib();
    this.mode = "calibrate";
    this.calibStep = "hand";
    this.handStableFrames = 0;
    this.practiceHits = 0;
    this.hand?.beginCalibration();
    this.calibText = this.add
      .text(DISPLAY.WIDTH / 2, 36, "", {
        fontFamily: TYPO.BODY,
        fontSize: "9px",
        color: "#f4f4f4",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(110);
    this.calibObjects.push(this.calibText);
    this.calibText.setText("Show your hand to the camera");
  }

  private updateCalibration(input: InputState): void {
    const hs = this.hand?.getStatus();
    if (!hs) {
      // Hand source vanished — abandon the tutorial back to the title.
      this.finishCalibration();
      return;
    }

    if (this.calibStep === "hand") {
      const good =
        hs.handPresent && hs.confidence >= HAND.TRACKING_CONFIDENCE_GREEN;
      this.handStableFrames = good ? this.handStableFrames + 1 : 0;
      if (this.handStableFrames >= 20) {
        this.calibStep = "corners";
        this.hand?.beginCalibration();
        this.showCornerMarker();
        this.calibText?.setText("Pinch at each glowing corner  (0/4)");
      }
      return;
    }

    if (this.calibStep === "corners") {
      if (input.isFiring) {
        const n = this.hand?.captureCorner() ?? 0;
        sfx.shot();
        if (n >= 4) {
          this.beginPractice();
        } else {
          this.showCornerMarker();
          this.calibText?.setText(`Pinch at each glowing corner  (${n}/4)`);
        }
      }
      return;
    }

    // practice
    if (input.isFiring) {
      const idx = this.practiceTargets.findIndex(
        (t) =>
          t.active &&
          Phaser.Math.Distance.Between(t.x, t.y, input.x, input.y) <= 12,
      );
      if (idx >= 0) {
        this.practiceTargets[idx].destroy();
        this.practiceTargets.splice(idx, 1);
        this.practiceHits++;
        sfx.shot();
        this.calibText?.setText(`Practice: pop the targets  (${this.practiceHits}/3)`);
        if (this.practiceTargets.length === 0) this.finishCalibration();
      }
    }
  }

  /** Place/move the pulsing marker on the next corner to trace. */
  private showCornerMarker(): void {
    const idx = Math.min(this.hand?.getStatus().corners ?? 0, 3);
    const [cxp, cyp] = CORNER_TARGETS[idx];
    if (!this.cornerMarker) {
      this.cornerMarker = this.add
        .circle(cxp, cyp, 6)
        .setStrokeStyle(2, 0xffcd75, 1)
        .setDepth(110);
      this.calibObjects.push(this.cornerMarker);
      this.tweens.add({
        targets: this.cornerMarker,
        scale: 1.7,
        yoyo: true,
        repeat: -1,
        duration: 480,
        ease: "Sine.easeInOut",
      });
    } else {
      this.cornerMarker.setPosition(cxp, cyp);
    }
  }

  private beginPractice(): void {
    this.calibStep = "practice";
    this.practiceHits = 0;
    if (this.cornerMarker) {
      this.tweens.killTweensOf(this.cornerMarker);
      this.cornerMarker.destroy();
      this.cornerMarker = undefined;
    }
    const spots: ReadonlyArray<readonly [number, number]> = [
      [90, 95],
      [230, 80],
      [160, 130],
    ];
    for (const [tx, ty] of spots) {
      const t = this.add
        .circle(tx, ty, 10, 0xb13e53)
        .setStrokeStyle(2, 0xffcd75, 1)
        .setDepth(110);
      this.practiceTargets.push(t);
      this.calibObjects.push(t);
    }
    this.calibText?.setText("Practice: pinch to pop the targets  (0/3)");
  }

  private finishCalibration(): void {
    this.clearCalib();
    this.mode = "title";
    this.showTitle();
  }

  private clearCalib(): void {
    this.calibObjects.forEach((o) => {
      this.tweens.killTweensOf(o);
      o.destroy();
    });
    this.calibObjects = [];
    this.practiceTargets = [];
    this.cornerMarker = undefined;
    this.calibText = undefined;
  }

  private onHit(x: number, y: number): void {
    this.duck.hit();
    sfx.fallWhistle();
    this.feathers.explode(FX.FEATHER_COUNT, this.duck.x, this.duck.y);
    this.cameras.main.shake(FX.SHAKE_HIT_MS, FX.SHAKE_HIT_INTENSITY);
    this.showPopup(x, y, `+${this.round.scorePerHit}`);
  }

  private resolveDuck(): void {
    const hit = this.duck.outcome === "hit";
    const x = this.duck.x;
    const awarded = this.round.recordDuck(hit);
    if (awarded > 0) this.score.add(awarded);
    this.duck.destroy();
    this.emitHud();

    // Dog reacts before the loop continues — retrieve on hit, mockery on miss.
    this.mode = "reaction";
    const next = (): void => {
      if (this.round.isRoundComplete) this.endRound();
      else this.beginNextDuck();
    };
    if (hit) {
      this.dog.playRetrieve(x, next);
    } else {
      sfx.dogLaugh();
      this.dog.playLaugh(x, next);
    }
  }

  private endRound(): void {
    const bagged = this.round.baggedCount;
    const threshold = this.round.passThreshold;

    if (this.round.passed) {
      this.mode = "transition";
      sfx.roundClear();
      this.showBanner(
        `ROUND ${this.round.current} CLEAR`,
        `bagged ${bagged}/${threshold}`,
      );
      this.time.delayedCall(ROUND.TRANSITION_MS, () => {
        this.round.advance();
        this.clearBanner();
        this.startRound();
      });
    } else {
      this.mode = "gameover";
      const beaten = this.score.total > this.hiScore;
      this.hiScore = saveHiScore(this.score.total);
      const tag = beaten ? `NEW HI ${this.hiScore}!` : `HI ${this.hiScore}`;
      this.showBanner("GAME OVER", `${tag} — fire to retry`);
    }
  }

  /** Title subtitle: include the stored hi-score once one exists. */
  private titlePrompt(): string {
    return this.hiScore > 0
      ? `HI ${this.hiScore} · fire to start`
      : "point & fire to start";
  }

  private restartGame(): void {
    this.round.resetGame();
    this.score.reset();
    this.clearBanner();
    this.startRound();
  }

  private showPopup(x: number, y: number, text: string): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#ffcd75",
      })
      .setOrigin(0.5)
      .setDepth(80);
    this.tweens.add({
      targets: label,
      y: y - FX.POPUP_RISE_PX,
      alpha: 0,
      duration: FX.POPUP_MS,
      ease: "Quad.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  /** Layered, parallax-style playfield backdrop — drawn once, behind everything.
   *  Sky comes from the canvas clear colour; here we stack distant hills, a
   *  bright horizon line, the grass with a sunlit top edge + shadow, and a row
   *  of foreground bushes. PALETTE only (CLAUDE.md lock). */
  private drawBackdrop(): void {
    const W = DISPLAY.WIDTH;
    const H = DISPLAY.HEIGHT;
    const groundY = Math.floor(H * GROUND_Y_FRACTION);
    const g = this.add.graphics().setDepth(-10);

    // Clouds live on their own layer (between far and near ducks) so a duck can
    // pass behind them when high/far and in front when low/near.
    const cloudG = this.add.graphics().setDepth(SCENE.CLOUD_DEPTH);
    this.drawCloud(cloudG, 50, 40, 1);
    this.drawCloud(cloudG, 210, 26, 1.25);
    this.drawCloud(cloudG, 275, 64, 0.8);

    // Distant teal hills (only their tops show above the grass line).
    g.fillStyle(SCENE.HILL_FAR, 1);
    for (const [cx, r] of [
      [60, 46],
      [150, 60],
      [250, 50],
      [312, 40],
    ] as const) {
      g.fillCircle(cx, groundY + 6, r);
    }
    // Nearer green hills.
    g.fillStyle(SCENE.HILL_NEAR, 1);
    for (const [cx, r] of [
      [16, 34],
      [110, 40],
      [210, 36],
      [292, 44],
    ] as const) {
      g.fillCircle(cx, groundY + 10, r);
    }
    // Bright horizon line.
    g.fillStyle(SCENE.HORIZON_HIGHLIGHT, 1);
    g.fillRect(0, groundY - 2, W, 1);
    // Grass body + sunlit top edge + shadow strip.
    g.fillStyle(SCENE.GRASS, 1);
    g.fillRect(0, groundY, W, H - groundY);
    g.fillStyle(SCENE.GRASS_HIGHLIGHT, 1);
    g.fillRect(0, groundY, W, 2);
    g.fillStyle(SCENE.GRASS_SHADOW, 1);
    g.fillRect(0, groundY + 4, W, 2);
    // Foreground bush clumps on the horizon.
    g.fillStyle(SCENE.BUSH, 1);
    for (const [cx, r] of [
      [36, 9],
      [96, 7],
      [176, 10],
      [244, 8],
      [300, 9],
    ] as const) {
      g.fillCircle(cx, groundY + 2, r);
    }
  }

  /** A single puffy cloud: a soft underside, then overlapping white lobes. */
  private drawCloud(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    s: number,
  ): void {
    const lobes: ReadonlyArray<readonly [number, number, number]> = [
      [0, 2, 7],
      [9, 3, 9],
      [20, 2, 8],
      [10, -3, 8],
    ];
    // Soft underside, offset down a touch.
    g.fillStyle(SCENE.CLOUD_SHADOW, 1);
    for (const [dx, dy, r] of lobes) {
      g.fillCircle(x + dx * s, y + (dy + 2) * s, r * s);
    }
    // White body on top.
    g.fillStyle(SCENE.CLOUD, 1);
    for (const [dx, dy, r] of lobes) {
      g.fillCircle(x + dx * s, y + dy * s, r * s);
    }
  }

  /** Arcade title screen: a pixel-font logo (bobbing), a blinking start prompt,
   *  ambient ducks drifting through the sky, and a footer. Replaces the old
   *  generic banner. Motion is suppressed under prefers-reduced-motion. */
  private showTitle(): void {
    this.clearTitle();
    const cx = DISPLAY.WIDTH / 2;

    for (let i = 0; i < TITLE_FX.AMBIENT_DUCKS; i++) this.spawnAmbientDuck(i);

    const logoY = 74;
    const logo = this.add
      .text(cx, logoY, TITLE, {
        fontFamily: TYPO.HEADING,
        fontSize: "20px",
        color: TITLE_FX.LOGO_FILL,
      })
      .setOrigin(0.5)
      .setDepth(90);
    logo.setStroke(TITLE_FX.LOGO_STROKE, 4);
    logo.setShadow(0, 3, TITLE_FX.LOGO_SHADOW, 0, true, true);
    this.titleObjects.push(logo);
    if (!this.reducedMotion) {
      this.tweens.add({
        targets: logo,
        y: logoY - TITLE_FX.LOGO_BOB_PX,
        duration: TITLE_FX.LOGO_BOB_MS,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Prompt stays on the BODY font — Press Start 2P has no middle-dot glyph.
    const prompt = this.add
      .text(cx, 150, this.titlePrompt(), {
        fontFamily: TYPO.BODY,
        fontSize: "10px",
        color: TITLE_FX.PROMPT_COLOR,
      })
      .setOrigin(0.5)
      .setDepth(90);
    this.titleObjects.push(prompt);
    if (!this.reducedMotion) {
      this.tweens.add({
        targets: prompt,
        alpha: 0,
        duration: TITLE_FX.PROMPT_BLINK_MS,
        yoyo: true,
        repeat: -1,
        ease: "Steps(1)", // hard blink, not a fade
      });
    }

    const footer = this.add
      .text(cx, DISPLAY.HEIGHT - 16, "ORIGINAL ARCADE REMAKE", {
        fontFamily: TYPO.HEADING,
        fontSize: "6px",
        color: "#94b0c2",
      })
      .setOrigin(0.5)
      .setDepth(90);
    this.titleObjects.push(footer);
  }

  /** One decorative duck gliding across the title sky (uses the real fly anim). */
  private spawnAmbientDuck(i: number): void {
    const y = 30 + i * 24;
    const fromLeft = i % 2 === 0;
    const startX = fromLeft ? -20 : DISPLAY.WIDTH + 20;
    const endX = fromLeft ? DISPLAY.WIDTH + 20 : -20;
    const duck = this.add
      .sprite(startX, y, ANIM.DUCK_FLY.key)
      .setScale(DUCK.SPRITE_SCALE)
      .setDepth(5);
    duck.play(ANIM.DUCK_FLY.key);
    // Art stands upright; rotate to fly horizontally (belly down), flipping
    // vertically when travelling left so the head leads without going upside-down.
    duck.setAngle(90).setFlipY(!fromLeft);
    this.titleObjects.push(duck);

    if (this.reducedMotion) {
      // No drift: park it somewhere visible instead of off-screen.
      duck.x = DISPLAY.WIDTH * (0.3 + i * 0.3);
      return;
    }
    const duration = (Math.abs(endX - startX) / TITLE_FX.AMBIENT_DUCK_SPEED) * 1000;
    this.tweens.add({
      targets: duck,
      x: endX,
      duration,
      repeat: -1,
      delay: i * 1200,
    });
  }

  private clearTitle(): void {
    this.titleObjects.forEach((o) => {
      this.tweens.killTweensOf(o);
      o.destroy();
    });
    this.titleObjects = [];
  }

  private showBanner(title: string, sub: string): void {
    this.clearBanner();
    const cx = DISPLAY.WIDTH / 2;
    const cy = DISPLAY.HEIGHT / 2;
    const heading = this.add
      .text(cx, cy - 10, title, {
        fontFamily: TYPO.HEADING,
        fontSize: "14px",
        color: TITLE_FX.LOGO_FILL,
      })
      .setOrigin(0.5)
      .setDepth(90);
    heading.setStroke(TITLE_FX.LOGO_STROKE, 3);
    heading.setShadow(0, 2, TITLE_FX.LOGO_SHADOW, 0, true, true);
    this.banner = [
      heading,
      // Sub stays monospace (may contain glyphs the pixel font lacks).
      this.add
        .text(cx, cy + 12, sub, {
          fontFamily: TYPO.BODY,
          fontSize: "9px",
          color: "#f4f4f4",
        })
        .setOrigin(0.5)
        .setDepth(90),
    ];
    // Tweened pop-in.
    this.banner.forEach((t) => {
      t.setScale(0.6).setAlpha(0);
      this.tweens.add({
        targets: t,
        scale: 1,
        alpha: 1,
        duration: FX.BANNER_POP_MS,
        ease: "Back.easeOut",
      });
    });
  }

  private clearBanner(): void {
    this.banner.forEach((t) => t.destroy());
    this.banner = [];
  }
}
