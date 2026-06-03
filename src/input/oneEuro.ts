/**
 * One Euro filter (Casiez et al. 2012) — low-latency cursor smoothing.
 *
 * Chosen over a moving average because it adapts: it smooths hard when the hand
 * is nearly still (kills jitter) and relaxes when the hand moves fast (kills
 * lag). A moving average can only trade one for the other. PLAN.md calls this
 * out as the right tool for the gesture layer's jitter problem.
 *
 * Lives in src/input/ as a shared, framework-free module so HandInputSource and
 * any calibration tooling use exactly one implementation. No Phaser, no DOM.
 */

/** Single exponential smoothing stage. */
class LowPass {
  private y: number | null = null;
  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  reset(): void {
    this.y = null;
  }
}

/** One Euro filter over a single scalar signal, timestamped in ms. */
export class OneEuro {
  private xPrev: number | null = null;
  private readonly xf = new LowPass();
  private readonly dxf = new LowPass();
  private tPrev = 0;

  constructor(
    private readonly getMinCutoff: () => number,
    private readonly getBeta: () => number,
    private readonly dcutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tNowMs: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tNowMs;
      return this.xf.filter(x, 1);
    }
    const dt = Math.max((tNowMs - this.tPrev) / 1000, 1e-3);
    this.tPrev = tNowMs;
    const dx = (x - this.xPrev) / dt;
    this.xPrev = x;
    const edx = this.dxf.filter(dx, this.alpha(this.dcutoff, dt));
    const cutoff = this.getMinCutoff() + this.getBeta() * Math.abs(edx);
    return this.xf.filter(x, this.alpha(cutoff, dt));
  }

  reset(): void {
    this.xPrev = null;
    this.xf.reset();
    this.dxf.reset();
  }
}

/** Convenience: a 2-D One Euro filter (independent X/Y One Euro filters). */
export class OneEuro2D {
  private readonly fx: OneEuro;
  private readonly fy: OneEuro;

  constructor(
    getMinCutoff: () => number,
    getBeta: () => number,
    dcutoff = 1.0,
  ) {
    this.fx = new OneEuro(getMinCutoff, getBeta, dcutoff);
    this.fy = new OneEuro(getMinCutoff, getBeta, dcutoff);
  }

  filter(
    x: number,
    y: number,
    tNowMs: number,
  ): { x: number; y: number } {
    return { x: this.fx.filter(x, tNowMs), y: this.fy.filter(y, tNowMs) };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
