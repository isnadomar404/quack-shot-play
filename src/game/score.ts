/**
 * Score — raw running total for the MVP. Round-scaled scoring and the
 * pass/fail threshold arrive in Phase 2; this stays the single source of truth
 * for the accumulated points.
 */
export class Score {
  private value = 0;

  get total(): number {
    return this.value;
  }

  add(points: number): number {
    this.value += points;
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}
