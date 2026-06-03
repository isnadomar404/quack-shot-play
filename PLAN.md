# Duck Hunt Remake — Build & Asset Plan

Gesture-controlled, neo-retro remake. Aim with a webcam-tracked hand, fire with a **pinch**. Retro feel, original everything. Companion file: `CLAUDE.md` (conventions + contracts).

> **V2 (2026-05-31).** Fire mechanic is now **pinch** (was finger-gun, retained
> as an alternate behind `HAND.FIRE_GESTURE`). `KeyboardInputSource` (SPACEBAR)
> is a permanent fallback alongside the mouse. The player-feedback layer
> (tracking dot, 3-state crosshair, calibration-as-tutorial) is mandatory.

## The one mechanic that isn't 1:1
The original used an NES Zapper light gun reading CRT screen flashes — impossible on a modern LCD. Substitution: **webcam hand-tracking + pinch fire**. Index fingertip aims; thumb-to-index pinch fires, with the shot location **latched at the moment the pinch begins** so the brief finger-curl doesn't pull the shot off target. Everything else (duck flight, the dog, rounds, scoring, ammo) translates cleanly. Mouse and `SPACEBAR` stay wired as permanent fallbacks for accessibility, debugging, and players without a camera.

## Build order / status
- **0 — Scaffold.** ✅ Vite + Phaser + TS. Boot/Game/UI scenes, loop ticking.
- **0.5 — Gesture spike (throwaway).** ✅ proved the loop; superseded by the real input layer.
- **1 — Core loop (on mouse).** ✅ duck flight, hit-test, ammo, score.
- **2 — Rules & progression.** ✅ rounds, 3 shots/duck, pass threshold, speed ramp (round 1 eased).
- **3 — The dog.** ✅ sniff-walk, retrieve (with bagged-duck overlay), laugh.
- **4 — Retro feel.** ✅ sprites, SFX, popups, title/game-over, CRT scanlines, shake, feathers. Pixel-font arcade UI + layered backdrop.
- **5 — Ship.** ✅ hi-score (localStorage), responsive scaling, static deploy.
- **6 — Hand integration.** ✅ `HandInputSource` behind the interface, mouse fallback.
- **V2 — Pinch + feedback overhaul.** Pinch fire + position latch, `KeyboardInputSource`, tracking-quality dot, 3-state crosshair component, calibration-as-tutorial first-run flow. Tune in `src/config/tuning.ts`.
- **Levels (LEVELS.md).** Round system reads from a per-level `LevelConfig` (`src/levels/`) instead of hard-coded constants. Six biomes Meadow→Night with weighted spawn tables, flight-path styles (sine/straight/sharp_turns/zigzag), procedural backdrops, and atmospheric systems (foreground occlusion, wind drift, visibility dim, night silhouettes), looping endlessly at a rising pace. New species art is a drop-in behind `SPECIES_ART`.

## Key architectural move
Abstract input behind `InputSource { poll(): {x, y, isFiring} }`. The whole game runs on `MouseInputSource`; `HandInputSource` swaps in behind the same interface. `KeyboardInputSource` (`SPACEBAR` = fire) is wired alongside the mouse. This buys four things: develop without a camera in your face; the gesture layer is an isolated, de-riskable module; the game stays playable without a camera or for players who can't gesture; and you get a hardware-independent debugging input.

## Gesture layer — the hard problems
- **Jitter** → One Euro filter on the cursor (`oneEuro.ts`).
- **Latency** → inference off the render path (VIDEO mode + `requestVideoFrameCallback`); escape timers generous.
- **Pinch precision** → the brief finger curl pulls the cursor; **position-latch on the pinch-down edge** (`pinchDetector.ts` + latch in `HandInputSource`).
- **Pinch reliability** → hysteresis (down-threshold below up-threshold) + minimum-frames-between-shots debounce.
- **Gorilla arm** → sensitivity scaling (`AIM_SENSITIVITY`).
- **Lighting / background** → tracking-quality dot + recalibrate instead of silently feeling broken.
- **Permissions** → needs a camera prompt; declines/no-camera → mouse / spacebar always available.

## Player feedback — non-optional
1. **Tracking-quality indicator** (`src/ui/trackingIndicator.ts`) — corner dot, green/yellow/red from the confidence score.
2. **Crosshair with three states** (`src/ui/crosshair.ts`) — idle / armed / firing.
3. **Audio on every fire** — synthesised chiptune (`audio/sfx.ts`).
4. **Calibration-as-tutorial** — first-run flow doubles as onboarding; recalibrate from the title (`[C]`).

## Art direction — retro feel, new game
Retro feel lives in **constraints, not the specific duck**. Lock: hard-limited palette (SWEETIE-16), visible chunky pixels, no anti-aliasing, flat + dithered shading, clean silhouettes, chiptune audio. Modernize: curated palette values, higher resolution tier, more frames, modern UI layout + typography (Press Start 2P), post-processing. Biggest "feels new" lever: resolution + frame count.

## Asset manifest
- **Characters:** duck (flap, glide, hit/fall, feather puff), dog (sniff-walk, laugh, retrieve + bagged-duck overlay).
- **Environment:** sky, foreground grass strip, bush/hill silhouettes, distant hills (layered backdrop, runtime Graphics from the locked palette).
- **UI:** score, shots-left, round indicator, ducks-bagged row, pass/fail, title / transition / game-over screens, **crosshair (idle / armed / firing)**, **tracking-quality dot**.
- **Effects:** hit flash, feather particles, crosshair fire-pulse.
- **Audio:** quack, shot, fall whistle, dog laugh, round-clear jingle.
- **Type:** one pixel font (Press Start 2P), modern restraint.

## Asset pipeline
- Hero sprites (duck/dog) hand-finished from PixelLab generations, palette-matched to SWEETIE-16.
- Backgrounds / UI / effects: runtime Graphics or palette-matched generation.
- Audio: jsfxr/bfxr-style synthesis at runtime (`audio/sfx.ts`) — no audio files.
- **[V2-NOTE]** Frame size is **68×68** (not 48×48): the generator pads the canvas for animation headroom; the loader reads 68×68. Keep the hex palette immutable across every asset.

## Tooling split (Claude Code vs Cursor)
- **Claude Code** (multi-file): scaffold, deps, the `InputSource` architecture (mouse + keyboard), MediaPipe wiring, calibration system, pinch detector, round progression, the mouse→hand swap, git.
- **Cursor** (see-and-tweak + HMR): all gesture tuning (`PINCH_DOWN_THRESHOLD`, `PINCH_UP_THRESHOLD`, debounce, sensitivity, One Euro constants), duck flight curves, hitbox sizes, animation timing — anything you have to *see* to get right.
