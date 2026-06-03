import { ROUND, SCORE } from "../config/tuning";

/**
 * RoundManager — owns the round/progression rules (CLAUDE.md game rules):
 * 10 ducks per round, a rising pass threshold, per-round speed ramp, and
 * round-scaled scoring. Pure logic; holds no Phaser objects.
 *
 * The scene reports each resolved duck via recordDuck(); when the round fills
 * up (isRoundComplete) the scene checks passed() to advance or end the game.
 */
export class RoundManager {
  private roundNumber = 1;
  private readonly hits: boolean[] = []; // per-duck results this round, in order

  get current(): number {
    return this.roundNumber;
  }

  /** Per-duck hit/miss results for the current round (length = ducks presented). */
  get results(): readonly boolean[] {
    return this.hits;
  }

  get baggedCount(): number {
    return this.hits.filter(Boolean).length;
  }

  /** Ducks needed to advance this round. */
  get passThreshold(): number {
    const raw =
      ROUND.PASS_THRESHOLD_BASE +
      Math.floor((this.roundNumber - 1) * ROUND.PASS_THRESHOLD_STEP_PER_ROUND);
    return Math.min(raw, ROUND.PASS_THRESHOLD_MAX);
  }

  /** Duck-speed multiplier for this round. Round 1 = SPEED_FACTOR_BASE (gentle),
   *  ramping up each round to the cap. */
  get speedFactor(): number {
    const raw =
      ROUND.SPEED_FACTOR_BASE + (this.roundNumber - 1) * ROUND.SPEED_FACTOR_STEP;
    return Math.min(raw, ROUND.SPEED_FACTOR_MAX);
  }

  /** Points a hit is worth this round. */
  get scorePerHit(): number {
    return SCORE.PER_HIT_BASE * this.roundNumber;
  }

  get isRoundComplete(): boolean {
    return this.hits.length >= ROUND.DUCKS_PER_ROUND;
  }

  get passed(): boolean {
    return this.baggedCount >= this.passThreshold;
  }

  /** Record a resolved duck. Returns the score awarded (0 on a miss). */
  recordDuck(hit: boolean): number {
    this.hits.push(hit);
    return hit ? this.scorePerHit : 0;
  }

  /** Advance to the next round and clear per-round results. */
  advance(): void {
    this.roundNumber++;
    this.hits.length = 0;
  }

  /** Reset to round 1 for a fresh game. */
  resetGame(): void {
    this.roundNumber = 1;
    this.hits.length = 0;
  }
}
