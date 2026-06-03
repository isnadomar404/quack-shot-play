# CLAUDE.md — Duck Hunt remake (working title)

Project conventions and contracts. Read this before editing anything. Keep in sync with `PLAN.md`.

> **V2 (2026-05-31).** This supersedes V1. Fire is now a **pinch** (primary); a
> `KeyboardInputSource` (SPACEBAR) joins the mouse as a permanent fallback; the
> player-feedback layer (tracking dot, 3-state crosshair, calibration-as-tutorial)
> is mandatory. Deviations from the V2 source doc, kept deliberately because they
> reflect shipped reality, are flagged inline as **[V2-NOTE]**.

## What this is
A gesture-controlled, neo-retro remake of the Duck Hunt arcade formula. The player aims with a webcam-tracked hand and fires with a **pinch** (thumb tip touches index tip). Retro **feel**, fully **original** assets — this is NOT a copy of Nintendo's game. No Nintendo sprites, audio, fonts, or names anywhere in the repo. (Working title on the title screen: **QUACK SHOT**.)

## Stack
- **Vite + Phaser 3 + TypeScript** (strict mode).
- Hand tracking: `@mediapipe/tasks-vision` — the **HandLandmarker** task.
  - **[V2-NOTE]** tasks-vision has **no LIVE_STREAM mode**; we run **VIDEO mode** and drive synchronous `detectForVideo()` from `requestVideoFrameCallback`, off the render-blocking path. Same architectural intent (inference off the render path), correct API.
- **Pin the MediaPipe version** (`@mediapipe/tasks-vision@0.10.35`). Never `@latest` — a CDN bump can silently break gesture tuning.
- No other runtime deps without a reason. Pin everything.

## Non-negotiable architecture: input is abstracted
Game logic reads **only** an `InputSource`. It never touches the mouse or camera directly.

```ts
interface InputSource {
  start(): Promise<void>;
  stop(): void;
  poll(): { x: number; y: number; isFiring: boolean }; // called once per frame
}
```

Three implementations:
- `MouseInputSource` — **built first**. Click = fire. The entire game is developed and completed against this.
- `KeyboardInputSource` — cursor follows the mouse, `SPACEBAR` = fire. Wired alongside the mouse for accessibility, headless debugging, and players who can't or don't want to gesture. Its fire is OR'd into whatever the active source reports, so SPACE works even while hand tracking is live.
- `HandInputSource` — **built last**, swapped in behind the same interface. Mouse + spacebar stay as permanent fallbacks (no camera / permission denied / debugging).

Do not leak pointer or camera specifics into scenes or game logic.

## Hand input rules (`HandInputSource`)
- **Aim** = index fingertip (landmark 8), mapped hand-space → screen-space via a calibration rectangle (user traces the corners once).
- **Smooth** the cursor with a **One Euro filter** — not a moving average.
- **Fire = pinch.** Detect via the distance between landmark 4 (thumb tip) and landmark 8 (index tip), **normalized by hand size** (distance between landmarks 0 and 9) so the threshold works at any camera distance. Lives in `pinchDetector.ts`.
- **Position latch.** On the pinch-down edge (distance crosses below the down-threshold), snapshot the smoothed cursor position from that frame and emit it as the shot location. The brief finger curl that follows must not affect where the shot lands; the reported cursor stays latched until the pinch-up edge resets state.
- **Hysteresis + debounce.** Down-threshold below up-threshold (`PINCH_DOWN_THRESHOLD` `0.3` vs `PINCH_UP_THRESHOLD` `0.4`, normalized) so a noisy boundary doesn't double-fire. Enforce `PINCH_MIN_FRAMES_BETWEEN` between consecutive shots.
- **Sensitivity scaling** (`AIM_SENSITIVITY`): small hand moves → large cursor moves (fixes fatigue + calibration range).
- Run inference **off the render-blocking path**.
- **[V2-NOTE]** The legacy **finger-gun** detector is retained behind `HAND.FIRE_GESTURE` (`"pinch"` default | `"fingergun"`). Pinch is primary; finger-gun is an alternate, not deleted.

## Player feedback (mandatory)
The shooting mechanism's playability depends as much on feedback as on the gesture. Every phase must keep all four working:

1. **Tracking-quality indicator.** Small dot, top corner, visible whenever hand tracking is active. Green = high confidence; yellow = partial / low; red = lost. Sourced from the HandLandmarker confidence score (`TRACKING_CONFIDENCE_GREEN` / `_YELLOW`). `src/ui/trackingIndicator.ts`.
2. **Crosshair with three visible states** (`src/ui/crosshair.ts`):
   - `idle` — faint reticle, no fill.
   - `armed` — brighter outlined reticle. Shown when the hand is detected, stable, and tracking confidence is high.
   - `firing` — single-frame scale-pulse + particle flash + sound on every fire. Returns to its prior state immediately.
3. **Audio on every fire.** Synthesised chiptune click/shot — silent shots feel broken.
4. **Calibration-as-tutorial.** First-run flow (hand path only): (a) show your hand (indicator going green confirms it), (b) trace the four screen corners with the index finger to calibrate, (c) 3 practice pinches against test targets with full feedback. Only then does the game start. A recalibrate action is accessible from the title screen (`[C]`).

## Game rules (config-driven)
- One target at a time. 3 shots per target. Per-target escape timer (flies off the top = miss).
- **Levels (LEVELS.md).** Game logic reads only from the active `LevelConfig` (`src/levels/`) — `targetsPerRound`, `passThreshold`, the weighted `spawnTable` (species + speed + path style + scale + score), backdrop, and atmosphere (wind / visibility / silhouette). Never hard-code these. The 6-level progression Meadow→Marsh→Forest→Mountain→Twilight→Night loops endlessly at a rising pace (`RoundManager.speedMultiplier`, `LEVEL.CYCLE_SPEED_STEP`).
- **[V2-NOTE]** LEVELS.md specifies PNG backdrops + per-species sheets. We draw backdrops **procedurally** (`BackdropSpec`, Graphics from the locked palette) and, until real species art lands, render new species as the **duck sprite tinted/scaled** (`SPECIES_ART`). Contract shape + the config-driven rule are preserved.
- Dog: sniff-walk intro, retrieve on hit (with the bagged target shown at its mouth), laugh on miss.
- Double-target and clay-pigeon modes are **STRETCH**.

## Asset contract (sprites are produced separately — match this exactly)
- Hero **character** size: ~48 px visible figure.
- **[V2-NOTE] Hero frame size: 68×68 px**, transparent background. The generator expands the canvas ~40% beyond character size for animation headroom; the Phaser loader reads frames at **68×68**. (V2's template said 48×48 — the shipped sheets are 68×68; do not change the loader without regenerating every sheet.)
- Sprite sheets: horizontal strips, one animation per file, constant frame size within a sheet.
- Naming: `duck_fly.png`, `duck_glide.png`, `duck_hit.png`, `dog_sniff.png`, `dog_laugh.png`, `dog_retrieve.png`, etc.
- **Crosshair states** and the **tracking dot** are implemented as runtime Graphics (tints/scales), not separate sprite files.
- **Palette: LOCKED.** Only colors from the set below ship. No anti-aliasing, no gradients — flat fills + dithering only.
  ```
  PALETTE = [
    "#1a1c2c", "#5d275d", "#b13e53", "#ef7d57",
    "#ffcd75", "#a7f070", "#38b764", "#257179",
    "#29366f", "#3b5dc9", "#41a6f6", "#73eff7",
    "#f4f4f4", "#94b0c2", "#566c86", "#333c57"
  ]
  # LOCKED 2026-05-27. SWEETIE-16 by GrafxKid. Do not change without regenerating the full asset set.
  ```

## File layout
```
src/
  scenes/    Boot.ts, Game.ts, UI.ts
  input/     InputSource.ts, MouseInputSource.ts, KeyboardInputSource.ts, HandInputSource.ts,
             oneEuro.ts, calibration.ts, pinchDetector.ts
  game/      target.ts, dog.ts, round.ts, score.ts, highscore.ts
  levels/    LevelConfig.ts, meadow.ts, marsh.ts, forest.ts, mountain.ts,
             twilight.ts, night.ts, index.ts   # per-level config (LEVELS.md)
  ui/        crosshair.ts, trackingIndicator.ts
  config/    tuning.ts   # all gesture + difficulty + cross-level constants
  audio/     sfx.ts
assets/
  sprites/   audio/
```

## Conventions
- TS strict, no `any`.
- All gesture and difficulty constants live in `src/config/tuning.ts`. Key pinch-system constants: `PINCH_DOWN_THRESHOLD`, `PINCH_UP_THRESHOLD`, `PINCH_MIN_FRAMES_BETWEEN`, `AIM_SENSITIVITY`, `ONE_EURO_MIN_CUTOFF`, `ONE_EURO_BETA`, `TRACKING_CONFIDENCE_GREEN`, `TRACKING_CONFIDENCE_YELLOW`, `FIRE_GESTURE`.
- Scenes stay exactly **Boot / Game / UI**. Title and transition "screens" are modes/overlays inside Game, not new scenes.
- Commit per phase (see `PLAN.md`).
- Define the sprite-sheet format and naming **before** generating assets, so the Phaser loader expects exactly what's produced.
