/**
 * tuning.ts — ALL gesture + difficulty + display constants live here.
 *
 * Per CLAUDE.md: nothing tunable is hard-coded inline anywhere else in the
 * codebase. This file is meant to be edited live (HMR) in Cursor to tune feel.
 *
 * Sections are added as phases land. Phase 0 only needs DISPLAY.
 */

/** Internal render resolution. The canvas is scaled up to fit the window
 *  with crisp (nearest-neighbour) pixels. 4:3 for an authentic arcade feel. */
export const DISPLAY = {
  WIDTH: 320,
  HEIGHT: 240,
  /** Background sky colour (PALETTE index 10, "#41a6f6"). Phase 4 replaces
   *  this with a real gradient/parallax; for now it just proves rendering. */
  BACKGROUND_COLOR: 0x41a6f6,
} as const;

/** The locked SWEETIE-16 palette (see CLAUDE.md). Numeric form for Phaser.
 *  Placeholder rectangles in Phases 1–3 must draw only from this set. */
export const PALETTE = [
  0x1a1c2c, 0x5d275d, 0xb13e53, 0xef7d57, 0xffcd75, 0xa7f070, 0x38b764,
  0x257179, 0x29366f, 0x3b5dc9, 0x41a6f6, 0x73eff7, 0xf4f4f4, 0x94b0c2,
  0x566c86, 0x333c57,
] as const;

/** Fraction of screen height where the ground strip starts (sky above). */
export const GROUND_Y_FRACTION = 0.75;

/** Sprite-sheet frame size (CLAUDE.md asset contract: 68x68 transparent). */
export const ASSET = {
  FRAME_SIZE: 68,
} as const;

/** Animation definitions (key + frame range + rate). Frame 0 of the v3 duck
 *  sheets is the static anchor pose, so looping anims start at frame 1 to avoid
 *  a stand-still hitch. Timing is a Cursor tweak per PLAN.md. */
export const ANIM = {
  DUCK_FLY: { key: "duck_fly", start: 1, end: 8, frameRate: 14, repeat: -1 },
  DUCK_GLIDE: { key: "duck_glide", start: 1, end: 6, frameRate: 8, repeat: -1 },
  DUCK_HIT: { key: "duck_hit", start: 0, end: 6, frameRate: 12, repeat: 0 },
  DOG_SNIFF: { key: "dog_sniff", start: 0, end: 8, frameRate: 10, repeat: -1 },
  DOG_LAUGH: { key: "dog_laugh", start: 0, end: 8, frameRate: 10, repeat: -1 },
  DOG_RETRIEVE: {
    key: "dog_retrieve",
    start: 0,
    end: 8,
    frameRate: 10,
    repeat: 0,
  },
} as const;

/** Typography. The retro heading face is the pixel font "Press Start 2P"
 *  (loaded in index.html); body/HUD numerics stay monospace. NOTE: Press Start
 *  2P has NO glyphs for ● × · — anything using those (the bag row) must stay on
 *  BODY, and heading-font copy must avoid them (use "-" not "—", " " not "·"). */
export const TYPO = {
  HEADING: '"Press Start 2P", monospace',
  BODY: "monospace",
} as const;

/** Layered playfield backdrop colours (PALETTE only — see CLAUDE.md lock).
 *  A retro three-band scene: bright sky, distant teal hill, near green hill,
 *  grass with a lit top edge and a shadowed base, plus bush clumps. */
export const SCENE = {
  HORIZON_HIGHLIGHT: 0x73eff7, // thin bright band at the skyline
  HILL_FAR: 0x257179, // distant hill silhouette
  HILL_NEAR: 0x38b764, // nearer rolling hill
  GRASS: 0x38b764, // main grass fill
  GRASS_SHADOW: 0x257179, // shadow under the lit edge / base
  GRASS_HIGHLIGHT: 0xa7f070, // sunlit top edge of the grass
  BUSH: 0x257179, // foreground bush clumps
  CLOUD: 0xf4f4f4, // puffy cloud body
  CLOUD_SHADOW: 0x94b0c2, // soft underside of the cloud
  /** Cloud render depth. Sits between a far duck (DUCK.DEPTH_BEHIND) and a near
   *  duck (DUCK.DEPTH_FRONT) so ducks pass behind/in front by altitude. */
  CLOUD_DEPTH: 8,
} as const;

/** Title-screen styling + ambient motion. Colours are hex strings (Phaser text
 *  styles); blink/bob respect prefers-reduced-motion at the call site. */
export const TITLE_FX = {
  LOGO_FILL: "#ffcd75", // PALETTE[4]
  LOGO_SHADOW: "#b13e53", // PALETTE[2]
  LOGO_STROKE: "#1a1c2c", // PALETTE[0]
  PROMPT_COLOR: "#f4f4f4", // PALETTE[12]
  PROMPT_BLINK_MS: 530, // on/off period of the "press to start" prompt
  LOGO_BOB_PX: 3, // gentle vertical bob of the logo
  LOGO_BOB_MS: 1400,
  AMBIENT_DUCKS: 2, // decorative ducks drifting across the title
  AMBIENT_DUCK_SPEED: 26, // px/s
} as const;

/** Crosshair drawn at the InputSource cursor position. */
export const CROSSHAIR = {
  RADIUS: 7,
  TICK: 4, // length of the line ticks past the ring
  COLOR: 0xf4f4f4, // PALETTE[12]
  THICKNESS: 1,
} as const;

/** Per-duck ammo. The 10-ducks-per-round rule arrives in Phase 2. */
export const SHOTS = {
  PER_DUCK: 3,
} as const;

/** Scoring. Per-hit value scales with the round number (CLAUDE.md): a hit in
 *  round N is worth PER_HIT_BASE * N. */
export const SCORE = {
  PER_HIT_BASE: 100,
} as const;

/** Audio. Chiptune SFX are synthesised at runtime (Web Audio) — no files. */
export const AUDIO = {
  MASTER_VOLUME: 0.25,
} as const;

/** Juice (PLAN.md "the juice the original couldn't do"). */
export const FX = {
  SHAKE_FIRE_MS: 60,
  SHAKE_FIRE_INTENSITY: 0.004,
  SHAKE_HIT_MS: 160,
  SHAKE_HIT_INTENSITY: 0.012,
  FEATHER_COUNT: 14,
  FEATHER_LIFESPAN_MS: 650,
  FEATHER_SPEED: 90,
  POPUP_RISE_PX: 22,
  POPUP_MS: 700,
  BANNER_POP_MS: 220, // scale/alpha pop-in for round + game-over banners
} as const;

/** Optional CRT-style scanline overlay. Subtle by default; toggle off to taste. */
export const CRT = {
  ENABLED: true,
  ALPHA: 0.08,
  LINE_GAP: 2, // px between scanlines
} as const;

/** The dog — sniff-walk intro, retrieve on hit, laugh on miss. Placeholder
 *  rect (in a container with a held-duck rect) until Phase 4 swaps the sprite.
 *  Distinct motions make the three behaviours readable even as rectangles. */
export const DOG = {
  WIDTH: 26,
  HEIGHT: 18,
  SPRITE_SCALE: 0.5, // 68px frame -> ~34px on the field
  COLOR: 0x566c86, // PALETTE[14] placeholder body (fallback tint)
  WALK_SPEED: 60, // px/s during the sniff-walk intro
  WALK_TO_X_FRACTION: 0.5, // walks to here, then dives in
  WALK_OFFSET_Y: 12, // how far below the ground line the dog stands (on grass)
  POP_OFFSET_Y: 2, // bottom offset when popped up (top rises above grass)
  POP_MS: 180, // rise/lower tween duration
  REACTION_HOLD_MS: 500, // hold at the top during retrieve / laugh
  SNIFF_BOB_PX: 3, // little vertical bob while sniff-walking
  LAUGH_BOBS: 3, // taunting bobs on a miss
  LAUGH_BOB_PX: 6,
  LAUGH_BOB_MS: 110,
  /** Held duck composited at the dog's mouth on a retrieve (the dog_retrieve
   *  sheet doesn't include the duck, so we overlay one from the duck art and
   *  keep it pinned to the dog as it pops up + drops). Offsets are in game px
   *  relative to the dog's bottom-centre origin; tweak to seat it in the mouth. */
  HELD_DUCK_SCALE: 0.42,
  HELD_DUCK_OFFSET_X: 0,
  HELD_DUCK_OFFSET_Y: -14, // seat the duck in the dog's mouth, not above its head
  HELD_DUCK_ANGLE: 165, // tilt so the bagged duck hangs limp
} as const;

/** Rounds & progression. Single-duck v1: difficulty ramps via duck speed only
 *  (double-duck is STRETCH per CLAUDE.md, deliberately not built). These tables
 *  are placeholders — tune freely, nothing else depends on the exact numbers. */
export const ROUND = {
  DUCKS_PER_ROUND: 10,
  /** Ducks you must bag to advance. Rises with round, capped. */
  PASS_THRESHOLD_BASE: 6,
  PASS_THRESHOLD_STEP_PER_ROUND: 0.5, // +1 every 2 rounds (floored)
  PASS_THRESHOLD_MAX: 9,
  /** Duck-speed multiplier ramps up each round, capped. Round 1 starts at
   *  SPEED_FACTOR_BASE (a gentle onboarding pace — slower ducks that linger on
   *  screen) and climbs by SPEED_FACTOR_STEP per round up to the cap. */
  SPEED_FACTOR_BASE: 0.6, // round-1 pace (was an implicit 1.0)
  SPEED_FACTOR_STEP: 0.12,
  SPEED_FACTOR_MAX: 2.2,
  /** How long the round-clear banner shows before the next round. */
  TRANSITION_MS: 1800,
} as const;

/** Hand tracking (Phase 6). Drives HandInputSource behind the InputSource
 *  interface; mouse stays the automatic fallback (no camera / denied / no model).
 *  Angle-based finger-gun fire and One Euro smoothing values were dialled in at
 *  the Phase 0.5 gesture-spike gate — these are the validated starting points.
 *
 *  WASM/model are pinned (CLAUDE.md: never @latest — a CDN bump can silently
 *  change tracking behaviour). MediaPipe tasks-vision has no LIVE_STREAM mode;
 *  we run VIDEO mode off the render path via requestVideoFrameCallback. */
export const HAND = {
  /** Pinned to the exact installed @mediapipe/tasks-vision version. */
  WASM_BASE: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
  MODEL_URL:
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  CAM_WIDTH: 640,
  CAM_HEIGHT: 480,
  /** Small hand move -> large cursor move (gorilla-arm fix, PLAN.md). */
  AIM_SENSITIVITY: 2.2,
  /** Fire gesture (V2): "pinch" is primary; "fingergun" kept as an alternate. */
  FIRE_GESTURE: "pinch" as "pinch" | "fingergun",
  /** Pinch fire = distance(thumb tip 4, index tip 8) normalized by hand size
   *  (distance 0<->9). Cross BELOW down = fire; must rise ABOVE up to re-arm
   *  (hysteresis). MIN_FRAMES_BETWEEN debounces consecutive shots. */
  PINCH_DOWN_THRESHOLD: 0.3,
  PINCH_UP_THRESHOLD: 0.4,
  PINCH_MIN_FRAMES_BETWEEN: 6,
  /** Tracking-quality dot thresholds on the HandLandmarker confidence score. */
  TRACKING_CONFIDENCE_GREEN: 0.7,
  TRACKING_CONFIDENCE_YELLOW: 0.4,
  /** Finger-gun fire (alternate) = angle (deg) at the index MCP between the index
   *  finger and the thumb. Wide = cocked/armed; closes past DOWN = fire; must
   *  re-open past UP before it can fire again (hysteresis kills double-shots). */
  THUMB_UP_DEG: 34,
  THUMB_DOWN_DEG: 22,
  /** Index must be extended (tip-to-MCP / hand-size) to count as aiming/firing. */
  INDEX_EXTENDED_RATIO: 0.55,
  /** One Euro filter: lower mincutoff = smoother but laggier at low speed;
   *  higher beta = less lag when moving fast. */
  ONE_EURO_MIN_CUTOFF: 2.0,
  ONE_EURO_BETA: 0.04,
  ONE_EURO_DCUTOFF: 1.0,
  /** Debounce frames the thumb must stay closed; re-arm hysteresis does the
   *  heavy lifting, so 1 is responsive without doubling. */
  FIRE_HOLD_FRAMES: 1,
  /** Auto-recentre the aim mapping the first time a hand is seen. */
  AUTO_RECENTER_ON_FIRST_HAND: true,
  /** Frames without a hand before tracking quality is reported as lost. */
  LOST_AFTER_MISSING_FRAMES: 8,
} as const;

/** Single-duck flight + lifecycle. Placeholder rect until Phase 4 sprites.
 *  Speeds are px/second (frame-rate independent — multiplied by dt). */
export const DUCK = {
  WIDTH: 22, // hitbox width at the NEAR scale (scaled down with perspective)
  HEIGHT: 16, // hitbox height at the NEAR scale
  SPRITE_SCALE: 0.5, // constant size used by the title-screen ambient ducks
  COLOR: 0xef7d57, // PALETTE[3] placeholder body — kept as a fallback tint
  HIT_COLOR: 0xffcd75, // PALETTE[4] flash when struck
  SPEED: 70, // base horizontal speed
  SPEED_MIN_FACTOR: 0.6, // each turn picks speed in [factor*SPEED, SPEED]
  VERTICAL_DRIFT: 18, // steady upward drift while flying
  TURN_INTERVAL_MS: 700, // how often horizontal direction is re-rolled (zig-zag)
  HITBOX_PADDING: 4, // flat fairness pad added on top of the scaled hitbox
  ESCAPE_TIMER_MS: 6000, // on-screen time flying before the duck flees upward
  FLEE_SPEED: 180, // upward speed once fleeing/escaping
  FALL_SPEED: 220, // downward speed after being hit
  FALL_SINK: 22, // keep falling this far PAST the grass line, sinking behind the
  // foreground foliage, before the target is gone (hides behind the bushes)
  FALL_SPIN_DPS: 360, // degrees/second spin while falling
  SPAWN_MARGIN: 30, // spawn inset from the screen edges
  /** Perspective: the duck shrinks as it climbs (flies into the distance) and
   *  grows as it descends (comes closer). Scale is interpolated from its Y —
   *  SCALE_NEAR at the ground line, SCALE_FAR at PERSPECTIVE_TOP_Y. */
  SCALE_NEAR: 0.62, // closest / biggest (at the ground line)
  SCALE_FAR: 0.3, // farthest / smallest (high in the sky)
  PERSPECTIVE_TOP_Y: 16, // Y at which the duck reaches SCALE_FAR
  /** Depth flip so high/far ducks pass BEHIND clouds, near ducks in front. */
  DEPTH_BEHIND: 6, // below SCENE.CLOUD_DEPTH
  DEPTH_FRONT: 12, // above SCENE.CLOUD_DEPTH
  DEPTH_FLIP_Y: 72, // above this Y (smaller Y) the duck renders behind clouds
  /** Entry variety — weighted spawn edge. Top entries swoop in from behind the
   *  clouds (descend, then climb away). */
  ENTRY_WEIGHT_BOTTOM: 45,
  ENTRY_WEIGHT_LEFT: 20,
  ENTRY_WEIGHT_RIGHT: 20,
  ENTRY_WEIGHT_TOP: 15,
  DIVE_SPEED: 80, // downward speed while swooping in from the top
  DIVE_TARGET_FRACTION: 0.5, // descend to this fraction of groundY, then climb
  EDGE_DRIFT_FACTOR: 0.5, // gentler upward drift for side/top entries
} as const;

/** Flight-path styles a SpawnEntry can request (LEVELS.md). These shape the
 *  horizontal motion on top of the shared upward drift + perspective. */
export const PATH = {
  SINE_SWAY: 38, // px/s horizontal sway amplitude (sine)
  SINE_HZ: 0.8, // sway oscillations per second (sine)
  SHARP_TURN_MS: 600, // re-roll interval for sharp_turns (sudden direction flips)
  ZIGZAG_MS: 260, // faster re-roll for zigzag
} as const;

/** Level-progression + atmospheric systems (LEVELS.md). Per-level specifics
 *  live in src/levels/*; these are the cross-level knobs. */
export const LEVEL = {
  /** Endless replay: each full loop through all levels adds this much speed. */
  CYCLE_SPEED_STEP: 0.15,
  /** Dark dim overlay for atmosphere.visibility (< 1). */
  VISIBILITY_COLOR: 0x1a1c2c, // PALETTE[0]
  VISIBILITY_DEPTH: 70, // above the playfield, below crosshair/HUD
  /** Night silhouette tint applied to every target. */
  SILHOUETTE_COLOR: 0x1a1c2c, // PALETTE[0]
  /** Occluding foreground (reeds / branches / peaks) drawn IN FRONT of targets. */
  FOREGROUND_DEPTH: 20,
  /** Starfield (night). */
  STAR_COUNT: 44,
  STAR_COLOR: 0xf4f4f4, // PALETTE[12]
} as const;

/** Player-tweakable settings (the in-game Settings menu). The runtime store
 *  (`src/config/settings.ts`) holds the live values, persisted to localStorage,
 *  and the gesture pipeline reads from it. These are the ranges + mappings; the
 *  HAND.* values above are the factory defaults the store seeds from. */
export const SETTINGS = {
  STORAGE_KEY: "fowlplay:settings",
  /** Aim sensitivity slider (raw multiplier). */
  AIM_MIN: 0.8,
  AIM_MAX: 4.0,
  AIM_STEP: 0.2,
  /** Smoothing slider 0..1 maps to the One Euro min cutoff: 0 = snappy (high
   *  cutoff), 1 = smooth (low cutoff). */
  SMOOTH_CUTOFF_SNAPPY: 4.0,
  SMOOTH_CUTOFF_SMOOTH: 0.6,
  /** Pinch-ease slider 0..1 maps to the pinch-down threshold: 0 = hard (fingers
   *  must nearly touch), 1 = easy. Up-threshold = down + GAP (hysteresis). */
  PINCH_DOWN_HARD: 0.2,
  PINCH_DOWN_EASY: 0.45,
  PINCH_GAP: 0.1,
  /** Step for the 0..1 sliders (smoothing, pinch ease). */
  NORM_STEP: 0.1,
} as const;
