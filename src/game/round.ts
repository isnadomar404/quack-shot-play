import { LEVEL } from "../config/tuning";
import { LEVELS, type LevelConfig } from "../levels";

/**
 * RoundManager — owns level progression (LEVELS.md). The game advances through
 * the ordered LEVELS array; each level is one round of `targetsPerRound`
 * targets with its own `passThreshold`. Clearing a level advances to the next;
 * after the last level it loops (endless) at a higher pace via `speedMultiplier`.
 *
 * Pure logic — reads only from the active LevelConfig, holds no Phaser objects.
 */
export class RoundManager {
  private levelIndex = 0;
  private cycle = 0; // how many full loops through all levels (endless ramp)
  private readonly hits: boolean[] = []; // per-target results this level, in order

  /** The active level's config. */
  get level(): LevelConfig {
    return LEVELS[this.levelIndex];
  }

  /** 1-based overall level number across endless cycles (for the HUD). */
  get current(): number {
    return this.cycle * LEVELS.length + this.levelIndex + 1;
  }

  get levelName(): string {
    return this.level.name;
  }

  /** Per-target hit/miss results for the current level (length = presented). */
  get results(): readonly boolean[] {
    return this.hits;
  }

  get baggedCount(): number {
    return this.hits.filter(Boolean).length;
  }

  get targetsPerRound(): number {
    return this.level.targetsPerRound;
  }

  /** Targets you must bag to advance this level. */
  get passThreshold(): number {
    return this.level.passThreshold;
  }

  /** Global speed scaler — 1 on the first pass, rising each endless loop. */
  get speedMultiplier(): number {
    return 1 + this.cycle * LEVEL.CYCLE_SPEED_STEP;
  }

  get isRoundComplete(): boolean {
    return this.hits.length >= this.targetsPerRound;
  }

  get passed(): boolean {
    return this.baggedCount >= this.passThreshold;
  }

  /** Targets still to be presented this level. */
  get remaining(): number {
    return Math.max(0, this.targetsPerRound - this.hits.length);
  }

  /** True while the pass threshold is still mathematically reachable — i.e.
   *  even bagging every remaining target could meet it. Once false, the level
   *  is lost (fail-fast game over). */
  get canStillPass(): boolean {
    return this.baggedCount + this.remaining >= this.passThreshold;
  }

  /** True when the just-cleared level was the last in the progression. */
  get isFinalLevel(): boolean {
    return this.levelIndex === LEVELS.length - 1;
  }

  /** Record a resolved target. Returns the score awarded (0 on a miss) — the
   *  per-species base from the spawn entry. */
  recordTarget(hit: boolean, scoreBase: number): number {
    this.hits.push(hit);
    return hit ? scoreBase : 0;
  }

  /** Advance to the next level (looping to the start at a higher cycle). */
  advance(): void {
    this.levelIndex++;
    if (this.levelIndex >= LEVELS.length) {
      this.levelIndex = 0;
      this.cycle++;
    }
    this.hits.length = 0;
  }

  /** Reset to the first level for a fresh game. */
  resetGame(): void {
    this.levelIndex = 0;
    this.cycle = 0;
    this.hits.length = 0;
  }
}
