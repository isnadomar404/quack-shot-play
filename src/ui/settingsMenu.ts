import Phaser from "phaser";
import { PALETTE, SETTINGS, TYPO } from "../config/tuning";
import { settings } from "../config/settings";

/**
 * SettingsMenu — an in-game overlay (Game-scene mode, not a new scene) for
 * tweaking the aim + hand-tracking feel. Pointer-driven so it works with every
 * input source: aim with mouse/hand, fire (click / SPACE / pinch) on a button.
 * Values persist via the settings store and apply live to the gesture pipeline.
 */
interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  on: () => void;
}

/** A keyboard-navigable item (row or button) with its focus rectangle. */
interface NavItem {
  bounds: { x: number; y: number; w: number; h: number };
  onLeft?: () => void;
  onRight?: () => void;
  onActivate?: () => void;
}

export interface SettingsMenuOptions {
  hasHand: boolean;
  onRecalibrate: () => void;
  onClose: () => void;
}

const PANEL = { x: 26, y: 24, w: 268, h: 192 } as const;
const COL = {
  fill: PALETTE[0], // 0x1a1c2c
  border: PALETTE[14], // 0x566c86
  btn: PALETTE[8], // 0x29366f
  done: PALETTE[6], // 0x38b764
  label: "#94b0c2",
  text: "#f4f4f4",
  accent: "#ffcd75",
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampStep = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number(v.toFixed(3))));
const fireName = (): string =>
  settings.get().fireGesture === "pinch" ? "PINCH" : "FINGER-GUN";

export class SettingsMenu {
  private readonly scene: Phaser.Scene;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private regions: Region[] = [];
  private refreshers: Array<() => void> = [];
  private nav: NavItem[] = [];
  private selected = 0;
  private highlight: Phaser.GameObjects.Graphics | undefined;
  private open_ = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  isOpen(): boolean {
    return this.open_;
  }

  open(opts: SettingsMenuOptions): void {
    this.close();
    this.open_ = true;

    const panel = this.scene.add.graphics().setDepth(86);
    panel.fillStyle(COL.fill, 0.96);
    panel.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    panel.lineStyle(1, COL.border, 1);
    panel.strokeRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    this.objs.push(panel);

    this.heading(PANEL.x + PANEL.w / 2, PANEL.y + 6, "SETTINGS");

    let y = PANEL.y + 38;
    const step = 23;
    this.sliderRow(
      y,
      "AIM SPEED",
      () => settings.get().aimSensitivity,
      (d) =>
        settings.set({
          aimSensitivity: clampStep(
            settings.get().aimSensitivity + d * SETTINGS.AIM_STEP,
            SETTINGS.AIM_MIN,
            SETTINGS.AIM_MAX,
          ),
        }),
      (v) => v.toFixed(1),
    );
    y += step;
    this.sliderRow(
      y,
      "SMOOTHING",
      () => settings.get().smoothing,
      (d) => settings.set({ smoothing: clamp01(settings.get().smoothing + d * SETTINGS.NORM_STEP) }),
      (v) => `${Math.round(v * 100)}%`,
    );
    y += step;
    this.sliderRow(
      y,
      "PINCH EASE",
      () => settings.get().pinchEase,
      (d) => settings.set({ pinchEase: clamp01(settings.get().pinchEase + d * SETTINGS.NORM_STEP) }),
      (v) => `${Math.round(v * 100)}%`,
    );
    y += step;

    // Fire-gesture toggle.
    this.label(PANEL.x + 14, y, "FIRE");
    const toggleFire = (): void => {
      settings.set({
        fireGesture: settings.get().fireGesture === "pinch" ? "fingergun" : "pinch",
      });
      this.refreshAll();
    };
    const fireBtn = this.button(PANEL.x + 120, y - 8, 134, 16, fireName(), toggleFire);
    this.refreshers.push(() => fireBtn.setText(fireName()));
    this.nav.push({
      bounds: { x: PANEL.x + 120, y: y - 8, w: 134, h: 16 },
      onLeft: toggleFire,
      onRight: toggleFire,
      onActivate: toggleFire,
    });

    // Hint.
    const hint = this.scene.add
      .text(
        PANEL.x + PANEL.w / 2,
        PANEL.y + PANEL.h - 30,
        "tweaks apply live · saved automatically",
        { fontFamily: TYPO.BODY, fontSize: "7px", color: COL.label },
      )
      .setOrigin(0.5)
      .setDepth(89);
    this.objs.push(hint);

    // Action buttons row.
    const ay = PANEL.y + PANEL.h - 20;
    const actions: Array<[string, () => void, boolean]> = [];
    if (opts.hasHand) actions.push(["RECALIBRATE", opts.onRecalibrate, false]);
    actions.push(["RESET", () => { settings.reset(); this.refreshAll(); }, false]);
    actions.push(["DONE", opts.onClose, true]);
    const gap = 6;
    const bw = Math.floor((PANEL.w - 28 - gap * (actions.length - 1)) / actions.length);
    actions.forEach(([label, on, accent], i) => {
      const bx = PANEL.x + 14 + i * (bw + gap);
      this.button(bx, ay, bw, 16, label, on, accent);
      this.nav.push({ bounds: { x: bx, y: ay, w: bw, h: 16 }, onActivate: on });
    });

    // Keyboard focus highlight (arrow keys move it; left/right + enter act).
    this.highlight = this.scene.add.graphics().setDepth(91);
    this.objs.push(this.highlight);
    this.selected = 0;
    this.drawHighlight();

    this.refreshAll();
  }

  close(): void {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.regions = [];
    this.refreshers = [];
    this.nav = [];
    this.highlight = undefined;
    this.selected = 0;
    this.open_ = false;
  }

  /** Run the first button under the cursor (called on a fire while open). Also
   *  moves the keyboard focus to whatever the pointer interacted with. */
  fire(x: number, y: number): void {
    for (const r of this.regions) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        r.on();
        this.focusAt(x, y);
        return;
      }
    }
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  /** Move the focus up/down through the rows/buttons (wraps). */
  moveFocus(dir: number): void {
    if (!this.nav.length) return;
    const n = this.nav.length;
    this.selected = (this.selected + dir + n) % n;
    this.drawHighlight();
  }

  /** Adjust the focused slider / toggle (left = down, right = up). */
  adjustFocus(dir: number): void {
    const it = this.nav[this.selected];
    if (!it) return;
    if (dir < 0) it.onLeft?.();
    else it.onRight?.();
    this.drawHighlight();
  }

  /** Activate the focused item (toggle / button). */
  activateFocus(): void {
    this.nav[this.selected]?.onActivate?.();
    this.drawHighlight();
  }

  /** Sync keyboard focus to the nav item under a pointer position. */
  private focusAt(x: number, y: number): void {
    const i = this.nav.findIndex(
      (it) =>
        x >= it.bounds.x &&
        x <= it.bounds.x + it.bounds.w &&
        y >= it.bounds.y &&
        y <= it.bounds.y + it.bounds.h,
    );
    if (i >= 0) {
      this.selected = i;
      this.drawHighlight();
    }
  }

  private drawHighlight(): void {
    if (!this.highlight) return;
    const b = this.nav[this.selected]?.bounds;
    this.highlight.clear();
    if (!b) return;
    this.highlight.lineStyle(1, 0x73eff7, 1); // PALETTE[11] cyan focus ring
    this.highlight.strokeRect(b.x, b.y, b.w, b.h);
  }

  private heading(cx: number, y: number, str: string): void {
    const t = this.scene.add
      .text(cx, y, str, { fontFamily: TYPO.HEADING, fontSize: "11px", color: COL.accent })
      .setOrigin(0.5, 0)
      .setDepth(90);
    this.objs.push(t);
  }

  private label(x: number, y: number, str: string): void {
    const t = this.scene.add
      .text(x, y, str, { fontFamily: TYPO.BODY, fontSize: "9px", color: COL.label })
      .setOrigin(0, 0.5)
      .setDepth(89);
    this.objs.push(t);
  }

  private sliderRow(
    y: number,
    label: string,
    get: () => number,
    adjust: (dir: number) => void,
    fmt: (v: number) => string,
  ): void {
    this.label(PANEL.x + 14, y, label);
    this.button(PANEL.x + 150, y - 8, 16, 16, "-", () => {
      adjust(-1);
      this.refreshAll();
    });
    const val = this.scene.add
      .text(PANEL.x + 198, y, fmt(get()), {
        fontFamily: TYPO.BODY,
        fontSize: "9px",
        color: COL.text,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(89);
    this.objs.push(val);
    this.button(PANEL.x + 226, y - 8, 16, 16, "+", () => {
      adjust(1);
      this.refreshAll();
    });
    this.refreshers.push(() => val.setText(fmt(get())));
    // Keyboard: focus the whole row, left/right adjust.
    this.nav.push({
      bounds: { x: PANEL.x + 10, y: y - 10, w: PANEL.w - 20, h: 20 },
      onLeft: () => {
        adjust(-1);
        this.refreshAll();
      },
      onRight: () => {
        adjust(1);
        this.refreshAll();
      },
    });
  }

  private button(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    on: () => void,
    accent = false,
  ): Phaser.GameObjects.Text {
    const g = this.scene.add.graphics().setDepth(88);
    g.fillStyle(accent ? COL.done : COL.btn, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, COL.border, 1);
    g.strokeRect(x, y, w, h);
    const t = this.scene.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: TYPO.BODY,
        fontSize: "9px",
        color: COL.text,
      })
      .setOrigin(0.5)
      .setDepth(89);
    this.objs.push(g, t);
    this.regions.push({ x, y, w, h, on });
    return t;
  }

  private refreshAll(): void {
    this.refreshers.forEach((r) => r());
  }
}
