import Phaser from "phaser";
import {
  ANIM,
  DISPLAY,
  DOG,
  DUCK,
  FX,
  GROUND_Y_FRACTION,
  HAND,
  INTERLUDE,
  LEVEL,
  SCENE,
  SHOTS,
  TITLE_FX,
  TYPO,
} from "../config/tuning";
import type { InputSource, InputState } from "../input/InputSource";
import { MouseInputSource } from "../input/MouseInputSource";
import { KeyboardInputSource } from "../input/KeyboardInputSource";
import { HandInputSource } from "../input/HandInputSource";
import { Target } from "../game/target";
import { Dog } from "../game/dog";
import { Score } from "../game/score";
import { RoundManager } from "../game/round";
import { loadHiScore, saveHiScore } from "../game/highscore";
import type { LevelConfig, SpawnEntry } from "../levels/LevelConfig";
import { Crosshair } from "../ui/crosshair";
import { TrackingIndicator } from "../ui/trackingIndicator";
import { SettingsMenu } from "../ui/settingsMenu";
import { sfx } from "../audio/sfx";

/** HUD payload broadcast to the UI scene. */
export interface HudState {
  score: number;
  shots: number;
  /** Overall level number (1-based, counts up across endless cycles). */
  round: number;
  levelName: string;
  threshold: number;
  targetsPerRound: number;
  results: readonly boolean[];
}
export const HUD_EVENT = "hud:update";

/** Original working title — NOT a Nintendo name (CLAUDE.md). */
const TITLE = "QUACK SHOT";

type Mode =
  | "title"
  | "settings"
  | "calibrate"
  | "intro"
  | "playing"
  | "reaction"
  | "transition"
  | "interlude"
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
  private target!: Target;
  private dog!: Dog;
  private feathers!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** All backdrop/atmosphere objects for the active level — rebuilt on advance. */
  private sceneLayers: Phaser.GameObjects.GameObject[] = [];
  /** Between-level campfire interlude objects + its flame-flicker timer. */
  private interludeObjects: Phaser.GameObjects.GameObject[] = [];
  private flameTimer: Phaser.Time.TimerEvent | undefined;
  private readonly score = new Score();
  private readonly round = new RoundManager();
  private shotsLeft = SHOTS.PER_DUCK;
  private mode: Mode = "title";
  private crosshair!: Crosshair;
  private tracking!: TrackingIndicator;
  private settingsMenu!: SettingsMenu;
  /** Clickable SETTINGS button region on the title screen (cursor/pinch). */
  private titleSettingsBtn: { x: number; y: number; w: number; h: number } | undefined;
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
    this.buildScene(this.round.level);

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
    // [S] opens the settings menu from the title; [Esc] closes it.
    this.input.keyboard?.on("keydown-S", () => {
      if (this.mode === "title") this.openSettings();
    });
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.mode === "settings") this.closeSettings();
    });
    // Settings menu: arrow-key navigation + Enter to activate.
    const kb = this.input.keyboard;
    if (kb) {
      kb.addCapture("UP,DOWN,LEFT,RIGHT"); // don't let arrows scroll the page
      kb.on("keydown-UP", () => {
        if (this.mode === "settings") this.settingsMenu.moveFocus(-1);
      });
      kb.on("keydown-DOWN", () => {
        if (this.mode === "settings") this.settingsMenu.moveFocus(1);
      });
      kb.on("keydown-LEFT", () => {
        if (this.mode === "settings") this.settingsMenu.adjustFocus(-1);
      });
      kb.on("keydown-RIGHT", () => {
        if (this.mode === "settings") this.settingsMenu.adjustFocus(1);
      });
      kb.on("keydown-ENTER", () => {
        if (this.mode === "settings") this.settingsMenu.activateFocus();
      });
    }

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
    this.settingsMenu = new SettingsMenu(this);
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
      this.clearScene();
      this.clearInterlude();
      this.settingsMenu.close();
      sfx.stopMusic();
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

  /** Round opens with the dog's sniff-walk; first target spawns when it dives in. */
  private startRound(): void {
    this.mode = "intro";
    sfx.stopMusic(); // leave the front-end music behind for gameplay
    sfx.dogIntro(); // playful cue as the dog trots on
    this.emitHud();
    this.dog.playIntro(() => this.beginNextTarget());
  }

  private beginNextTarget(): void {
    this.mode = "playing";
    const level = this.round.level;
    const entry = this.pickSpawnEntry(level.spawnTable);
    this.target = new Target(this, entry, {
      speedMultiplier: this.round.speedMultiplier,
      ...(level.atmosphere.windVector
        ? { wind: level.atmosphere.windVector }
        : {}),
      ...(level.silhouette ? { silhouette: true } : {}),
    });
    this.shotsLeft = SHOTS.PER_DUCK;
    sfx.quack();
    this.emitHud();
  }

  /** Weighted random pick from the level's spawn table. */
  private pickSpawnEntry(table: readonly SpawnEntry[]): SpawnEntry {
    const total = table.reduce((sum, e) => sum + e.weight, 0);
    let r = Math.random() * total;
    for (const entry of table) {
      if ((r -= entry.weight) < 0) return entry;
    }
    return table[table.length - 1];
  }

  private emitHud(): void {
    const state: HudState = {
      score: this.score.total,
      shots: this.shotsLeft,
      round: this.round.current,
      levelName: this.round.levelName,
      threshold: this.round.passThreshold,
      targetsPerRound: this.round.targetsPerRound,
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

    if (this.mode === "settings") {
      if (input.isFiring) this.settingsMenu.fire(input.x, input.y);
    } else if (this.mode === "calibrate") {
      this.updateCalibration(input);
    } else if (this.mode === "title" && input.isFiring) {
      // Firing over the SETTINGS button opens settings; anywhere else starts.
      if (this.titleSettingsBtn && this.inRegion(input, this.titleSettingsBtn)) {
        this.openSettings();
      } else {
        sfx.unlock();
        this.clearTitle();
        this.startRound();
      }
    } else if (this.mode === "playing") {
      if (input.isFiring && this.target.isFlying() && this.shotsLeft > 0) {
        this.shotsLeft--;
        sfx.shot();
        this.cameras.main.shake(FX.SHAKE_FIRE_MS, FX.SHAKE_FIRE_INTENSITY);
        if (this.target.contains(input.x, input.y)) {
          this.onHit(input.x, input.y);
        } else if (this.shotsLeft === 0) {
          this.target.flee();
        }
        this.emitHud();
      }

      this.target.update(deltaMs);
      if (this.target.isGone()) this.resolveTarget();
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
    this.target.hit();
    sfx.fallWhistle();
    this.feathers.explode(FX.FEATHER_COUNT, this.target.x, this.target.y);
    this.cameras.main.shake(FX.SHAKE_HIT_MS, FX.SHAKE_HIT_INTENSITY);
    this.showPopup(x, y, `+${this.target.scoreBase}`);
  }

  private resolveTarget(): void {
    const hit = this.target.outcome === "hit";
    const x = this.target.x;
    const awarded = this.round.recordTarget(hit, this.target.scoreBase);
    if (awarded > 0) this.score.add(awarded);
    this.target.destroy();
    this.emitHud();

    // Dog reacts before the loop continues — retrieve on hit, mockery on miss.
    this.mode = "reaction";
    const next = (): void => {
      // Fail-fast: end the run the moment the milestone can't be reached, even
      // before all targets are presented.
      if (!this.round.canStillPass) this.triggerGameOver();
      else if (this.round.isRoundComplete) this.endRound();
      else this.beginNextTarget();
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
      sfx.levelClear();
      // Celebrate with the campfire interlude (on this biome), then advance.
      this.playInterlude(bagged, threshold, () => {
        this.round.advance();
        this.buildScene(this.round.level); // swap to the next biome
        this.startRound();
      });
    } else {
      this.triggerGameOver();
    }
  }

  /** Between-level interlude: a man grilling by a campfire with the dog licking
   *  a bone, on the just-cleared biome backdrop, for a few seconds. */
  private playInterlude(
    bagged: number,
    threshold: number,
    onDone: () => void,
  ): void {
    this.mode = "interlude";
    this.clearInterlude();
    const groundY = Math.floor(DISPLAY.HEIGHT * GROUND_Y_FRACTION);
    const fireX = 162;
    const fireBaseY = groundY + 24;

    // Static elements (logs, the man, the bone) — above the visibility dim so
    // the campfire scene reads bright even on the dark levels.
    const g = this.add.graphics().setDepth(75);
    g.fillStyle(0x333c57, 1); // crossed logs
    g.fillRect(fireX - 13, fireBaseY - 2, 26, 4);
    g.fillRect(fireX - 9, fireBaseY - 5, 7, 6);
    g.fillRect(fireX + 4, fireBaseY - 5, 7, 6);
    // Bone at the dog's snout (just in front of its lowered head) so it reads
    // as the dog licking it — see the dog placement below.
    this.drawBone(g, 196, groundY + 8);
    this.interludeObjects.push(g);

    // The camper (PixelLab sprite), standing right by the fire, facing it.
    const man = this.add
      .image(139, groundY + 20, "man")
      .setOrigin(0.5, 1)
      .setScale(0.62)
      .setDepth(76);
    this.interludeObjects.push(man);

    // A roasting stick from the camper out over the flames, with food on the end.
    const skewer = this.add.graphics().setDepth(79);
    skewer.lineStyle(2, 0x566c86, 1);
    skewer.lineBetween(150, groundY + 1, fireX - 4, fireBaseY - 16);
    skewer.fillStyle(0xb13e53, 1);
    skewer.fillRect(fireX - 8, fireBaseY - 19, 5, 5);
    this.interludeObjects.push(skewer);

    // The dog, head down right at the bone (sniff anim reads as licking it).
    const dog = this.add
      .sprite(208, groundY + 12, ANIM.DOG_SNIFF.key)
      .setOrigin(0.5, 1)
      .setScale(DOG.SPRITE_SCALE)
      .setDepth(80)
      .setFlipX(true); // face left toward the bone + fire
    dog.play(ANIM.DOG_SNIFF.key);
    this.interludeObjects.push(dog);

    // Flickering flames, redrawn on a timer.
    const flames = this.add.graphics().setDepth(78);
    this.interludeObjects.push(flames);
    const flicker = (): void => this.drawFlames(flames, fireX, fireBaseY);
    flicker();
    this.flameTimer = this.time.addEvent({
      delay: INTERLUDE.FLAME_TICK_MS,
      loop: true,
      callback: flicker,
    });

    // Header + subtitle.
    const header = this.add
      .text(DISPLAY.WIDTH / 2, 34, `${this.round.levelName.toUpperCase()} CLEAR`, {
        fontFamily: TYPO.HEADING,
        fontSize: "12px",
        color: TITLE_FX.LOGO_FILL,
      })
      .setOrigin(0.5)
      .setDepth(92);
    header.setStroke(TITLE_FX.LOGO_STROKE, 3);
    header.setShadow(0, 2, TITLE_FX.LOGO_SHADOW, 0, true, true);
    const sub = this.add
      .text(
        DISPLAY.WIDTH / 2,
        52,
        `bagged ${bagged}/${threshold} · next: ${this.round.nextLevelName}`,
        { fontFamily: TYPO.BODY, fontSize: "8px", color: "#f4f4f4" },
      )
      .setOrigin(0.5)
      .setDepth(92);
    this.interludeObjects.push(header, sub);

    this.time.delayedCall(INTERLUDE.DURATION_MS, () => {
      this.clearInterlude();
      onDone();
    });
  }

  private clearInterlude(): void {
    if (this.flameTimer) {
      this.flameTimer.remove();
      this.flameTimer = undefined;
    }
    this.interludeObjects.forEach((o) => {
      this.tweens.killTweensOf(o);
      o.destroy();
    });
    this.interludeObjects = [];
  }

  /** Redraw the campfire flames with a little random flicker. */
  private drawFlames(
    g: Phaser.GameObjects.Graphics,
    x: number,
    baseY: number,
  ): void {
    const j = (a: number): number => (Math.random() * 2 - 1) * a;
    g.clear();
    g.fillStyle(0xb13e53, 1); // red outer
    g.fillTriangle(x - 9, baseY, x + j(3), baseY - 22 + j(4), x + 9, baseY);
    g.fillStyle(0xef7d57, 1); // orange mid
    g.fillTriangle(x - 6, baseY, x + j(2), baseY - 16 + j(4), x + 6, baseY);
    g.fillStyle(0xffcd75, 1); // yellow core
    g.fillTriangle(x - 3, baseY, x + j(1), baseY - 9 + j(3), x + 3, baseY);
    // A couple of rising sparks.
    g.fillStyle(0xffcd75, 1);
    g.fillRect(x + j(8), baseY - 24 + j(6), 1, 1);
    g.fillRect(x + j(8), baseY - 28 + j(6), 1, 1);
  }

  /** A small white bone for the dog. */
  private drawBone(
    g: Phaser.GameObjects.Graphics,
    bx: number,
    by: number,
  ): void {
    g.fillStyle(0xf4f4f4, 1);
    g.fillRect(bx - 4, by - 1, 9, 2);
    g.fillCircle(bx - 4, by - 1.5, 1.6);
    g.fillCircle(bx - 4, by + 1.5, 1.6);
    g.fillCircle(bx + 5, by - 1.5, 1.6);
    g.fillCircle(bx + 5, by + 1.5, 1.6);
  }

  /** End the run — the player missed the level's pass threshold (milestone).
   *  Saves the hi-score and shows the missed milestone + retry prompt. */
  private triggerGameOver(): void {
    this.mode = "gameover";
    const bagged = this.round.baggedCount;
    const threshold = this.round.passThreshold;
    const beaten = this.score.total > this.hiScore;
    this.hiScore = saveHiScore(this.score.total);
    const hiTag = beaten ? `NEW HI ${this.hiScore}!` : `HI ${this.hiScore}`;
    sfx.gameOverTune();
    this.showBanner(
      "GAME OVER",
      `missed ${bagged}/${threshold} · ${hiTag} · fire to retry`,
    );
  }

  /** Open the settings overlay from the title. */
  private openSettings(): void {
    sfx.unlock();
    this.clearTitle();
    this.mode = "settings";
    this.settingsMenu.open({
      hasHand: !!this.hand,
      onRecalibrate: () => {
        this.settingsMenu.close();
        this.startCalibration();
      },
      onClose: () => this.closeSettings(),
    });
  }

  private closeSettings(): void {
    this.settingsMenu.close();
    this.mode = "title";
    this.showTitle();
  }

  private inRegion(
    p: { x: number; y: number },
    r: { x: number; y: number; w: number; h: number },
  ): boolean {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
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

  /** Build the procedural backdrop + atmosphere for a level (LEVELS.md). All
   *  objects go in sceneLayers so advancing to the next biome can tear them down
   *  and rebuild. Depth bands: sky -20, stars -19, hills/grass -10, mood tint
   *  -5, clouds CLOUD_DEPTH, targets 6/12, foreground occluders FOREGROUND_DEPTH,
   *  visibility dim VISIBILITY_DEPTH. PALETTE only (CLAUDE.md lock). */
  private buildScene(level: LevelConfig): void {
    this.clearScene();
    const spec = level.backdrop;
    const W = DISPLAY.WIDTH;
    const H = DISPLAY.HEIGHT;
    const groundY = Math.floor(H * GROUND_Y_FRACTION);

    // Sky fill behind everything.
    const sky = this.add.graphics().setDepth(-20);
    sky.fillStyle(spec.sky, 1);
    sky.fillRect(0, 0, W, H);
    this.sceneLayers.push(sky);

    if (spec.stars) this.drawStars(groundY);

    const g = this.add.graphics().setDepth(-10);
    if (spec.foreground === "peaks") this.drawPeaks(g, groundY, spec.foregroundColor);
    // Distant hills (only their tops show above the grass line).
    g.fillStyle(spec.hillFar, 1);
    for (const [cx, r] of [
      [60, 46],
      [150, 60],
      [250, 50],
      [312, 40],
    ] as const) {
      g.fillCircle(cx, groundY + 6, r);
    }
    g.fillStyle(spec.hillNear, 1);
    for (const [cx, r] of [
      [16, 34],
      [110, 40],
      [210, 36],
      [292, 44],
    ] as const) {
      g.fillCircle(cx, groundY + 10, r);
    }
    g.fillStyle(spec.horizon, 1);
    g.fillRect(0, groundY - 2, W, 1);
    g.fillStyle(spec.grass, 1);
    g.fillRect(0, groundY, W, H - groundY);
    g.fillStyle(spec.grassHighlight, 1);
    g.fillRect(0, groundY, W, 2);
    g.fillStyle(spec.grassShadow, 1);
    g.fillRect(0, groundY + 4, W, 2);
    g.fillStyle(spec.bush, 1);
    for (const [cx, r] of [
      [36, 9],
      [96, 7],
      [176, 10],
      [244, 8],
      [300, 9],
    ] as const) {
      g.fillCircle(cx, groundY + 2, r);
    }
    this.sceneLayers.push(g);

    if (spec.clouds) {
      const cloudG = this.add.graphics().setDepth(SCENE.CLOUD_DEPTH);
      this.drawCloud(cloudG, 50, 40, 1);
      this.drawCloud(cloudG, 210, 26, 1.25);
      this.drawCloud(cloudG, 275, 64, 0.8);
      this.sceneLayers.push(cloudG);
    }

    // Mood tint over the backdrop (still below targets), from the locked palette.
    if (spec.tintHex) {
      const tint = this.add.graphics().setDepth(-5);
      tint.fillStyle(Phaser.Display.Color.HexStringToColor(spec.tintHex).color, 0.2);
      tint.fillRect(0, 0, W, H);
      this.sceneLayers.push(tint);
    }

    // Near grass + bush hedge IN FRONT of targets — a shot target sinks behind
    // this when it falls (hides behind the bushes), and ducks rise out of it.
    this.drawFrontFoliage(spec, groundY);

    // Occluding foreground IN FRONT of targets.
    if (spec.foreground === "reeds") this.drawReeds(spec.foregroundColor);
    else if (spec.foreground === "branches") this.drawBranches(spec.foregroundColor);

    // Reduced-visibility dim overlay (above the playfield, below crosshair/HUD).
    const vis = level.atmosphere.visibility;
    if (vis !== undefined && vis < 1) {
      const dim = this.add.graphics().setDepth(LEVEL.VISIBILITY_DEPTH);
      dim.fillStyle(LEVEL.VISIBILITY_COLOR, 1 - vis);
      dim.fillRect(0, 0, W, H);
      this.sceneLayers.push(dim);
    }
  }

  private clearScene(): void {
    this.sceneLayers.forEach((o) => o.destroy());
    this.sceneLayers = [];
  }

  /** Near grass + bush hedge drawn IN FRONT of targets (FOREGROUND_DEPTH). A
   *  hit target sinks behind this as it falls; flying targets rise out of it. */
  private drawFrontFoliage(
    spec: LevelConfig["backdrop"],
    groundY: number,
  ): void {
    const W = DISPLAY.WIDTH;
    const H = DISPLAY.HEIGHT;
    const f = this.add.graphics().setDepth(LEVEL.FOREGROUND_DEPTH);
    // Grass body from the horizon down, with a lit top edge + shadow strip.
    f.fillStyle(spec.grass, 1);
    f.fillRect(0, groundY, W, H - groundY);
    f.fillStyle(spec.grassHighlight, 1);
    f.fillRect(0, groundY, W, 2);
    f.fillStyle(spec.grassShadow, 1);
    f.fillRect(0, groundY + 4, W, 2);
    // A low bush hedge cresting the grass line, so targets tuck behind it.
    f.fillStyle(spec.bush, 1);
    for (const [cx, r] of [
      [24, 11],
      [72, 9],
      [130, 12],
      [190, 10],
      [248, 12],
      [300, 10],
    ] as const) {
      f.fillCircle(cx, groundY + 3, r);
    }
    this.sceneLayers.push(f);
  }

  /** Night starfield in the sky band. */
  private drawStars(groundY: number): void {
    const s = this.add.graphics().setDepth(-19);
    s.fillStyle(LEVEL.STAR_COLOR, 1);
    for (let i = 0; i < LEVEL.STAR_COUNT; i++) {
      const x = Math.floor(Math.random() * DISPLAY.WIDTH);
      const y = Math.floor(Math.random() * (groundY - 12)) + 2;
      s.fillRect(x, y, 1, 1);
    }
    this.sceneLayers.push(s);
  }

  /** Occluding marsh reeds rising from the bottom edge. */
  private drawReeds(color: number): void {
    const r = this.add.graphics().setDepth(LEVEL.FOREGROUND_DEPTH);
    r.fillStyle(color, 1);
    const H = DISPLAY.HEIGHT;
    for (let x = 3; x < DISPLAY.WIDTH; x += 13) {
      const h = 34 + Math.floor(Math.random() * 44);
      const w = 2 + Math.floor(Math.random() * 2);
      r.fillRect(x, H - h, w, h);
      r.fillRect(x - 2, H - h, 6, 3); // a small frond near the tip
    }
    this.sceneLayers.push(r);
  }

  /** Occluding forest branches hanging from the top edge. */
  private drawBranches(color: number): void {
    const b = this.add.graphics().setDepth(LEVEL.FOREGROUND_DEPTH);
    b.fillStyle(color, 1);
    const W = DISPLAY.WIDTH;
    b.fillRect(0, 0, W, 7); // canopy bar across the top
    for (const [x, w, h] of [
      [26, 7, 26],
      [70, 6, 16],
      [150, 8, 30],
      [210, 6, 18],
      [W - 40, 7, 24],
    ] as ReadonlyArray<readonly [number, number, number]>) {
      b.fillRect(x, 7, w, h); // twigs hanging down
    }
    this.sceneLayers.push(b);
  }

  /** Midground mountain peaks (drawn behind the hills, not occluding). */
  private drawPeaks(
    g: Phaser.GameObjects.Graphics,
    groundY: number,
    color: number,
  ): void {
    g.fillStyle(color, 1);
    for (const [cx, h] of [
      [44, 78],
      [120, 96],
      [196, 84],
      [270, 100],
    ] as const) {
      g.fillTriangle(cx - 44, groundY, cx, groundY - h, cx + 44, groundY);
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
    sfx.titleMusic(); // front-end loop (plays once audio is unlocked)
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

    // SETTINGS button — clickable / pinchable (also opens via the [S] key).
    const settingsBtn = this.add
      .text(cx, 174, "[ SETTINGS ]", {
        fontFamily: TYPO.BODY,
        fontSize: "9px",
        color: "#73eff7",
      })
      .setOrigin(0.5)
      .setDepth(90);
    this.titleObjects.push(settingsBtn);
    const b = settingsBtn.getBounds();
    this.titleSettingsBtn = {
      x: b.x - 6,
      y: b.y - 4,
      w: b.width + 12,
      h: b.height + 8,
    };

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
    this.titleSettingsBtn = undefined;
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
