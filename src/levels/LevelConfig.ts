/**
 * LevelConfig — the per-level contract (LEVELS.md). Game logic reads ONLY from
 * the active LevelConfig; nothing about a level is hard-coded in the round /
 * target / scene code. Adding a level = adding a config file, no logic changes.
 *
 * [LEVELS-NOTE] The doc specifies PNG backdrop paths and per-species sprite
 * sheets. This codebase draws backdrops procedurally (Graphics from the locked
 * palette) and — until real species art lands — renders new species as the
 * duck sprite tinted/scaled (see SPECIES_ART). So `backdrop` here is a
 * procedural BackdropSpec rather than asset paths; the contract shape and the
 * "config-driven" rule are preserved.
 */

export type TargetSpecies =
  | "duck"
  | "teal"
  | "pheasant"
  | "eagle"
  | "bat"
  | "owl";

export type PathStyle = "sine" | "straight" | "sharp_turns" | "zigzag";

/** Where a target may enter from (perspective + variety, per the duck model). */
export type EntryWeights = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export interface SpawnEntry {
  species: TargetSpecies;
  weight: number; // probability weight when picking the next spawn
  speedRange: [number, number]; // px/sec horizontal speed band
  pathStyle: PathStyle;
  scale: number; // multiplier on the perspective scale
  scoreBase: number; // base points before any multiplier
}

/** Procedural biome backdrop (we don't use PNG backdrops — see note above). */
export interface BackdropSpec {
  sky: number; // full-screen sky fill (palette)
  horizon: number; // bright horizon line
  hillFar: number;
  hillNear: number;
  grass: number;
  grassHighlight: number;
  grassShadow: number;
  bush: number;
  clouds: boolean; // draw the drifting cloud layer
  stars: boolean; // draw a starfield (night)
  /** Occluding foreground layer drawn IN FRONT of targets. */
  foreground: "none" | "reeds" | "branches" | "peaks";
  foregroundColor: number;
  /** Optional accent tint overlaid on the whole scene (from the locked palette). */
  tintHex?: string;
}

export interface LevelConfig {
  id: string;
  name: string;
  order: number;
  backdrop: BackdropSpec;
  spawnTable: SpawnEntry[];
  targetsPerRound: number;
  passThreshold: number;
  atmosphere: {
    /** Global drift (px/sec) applied to every active target. */
    windVector?: { x: number; y: number };
    /** 0..1 — 1 = full visibility; lower dims the scene with a dark overlay. */
    visibility?: number;
    /** Looping ambient bed (no-op until audio beds exist; synth SFX only). */
    ambientSfx?: string;
  };
  /** Render every target as a flat-dark silhouette (Night). */
  silhouette?: boolean;
}

/** How a species is drawn. flyKey/hitKey are sprite-sheet (animation) keys.
 *  Until real art is generated, non-duck species reuse the duck sheets with a
 *  placeholder tint; swap flyKey/hitKey to the real sheets and drop the tint. */
export interface SpeciesArt {
  flyKey: string;
  hitKey: string;
  tint?: number;
}

export const SPECIES_ART: Record<TargetSpecies, SpeciesArt> = {
  duck: { flyKey: "duck_fly", hitKey: "duck_hit" },
  // Placeholders (tinted duck) until teal_/pheasant_/… sheets are generated.
  teal: { flyKey: "duck_fly", hitKey: "duck_hit", tint: 0x73eff7 },
  pheasant: { flyKey: "duck_fly", hitKey: "duck_hit", tint: 0xb13e53 },
  eagle: { flyKey: "duck_fly", hitKey: "duck_hit", tint: 0xffcd75 },
  bat: { flyKey: "duck_fly", hitKey: "duck_hit", tint: 0x5d275d },
  owl: { flyKey: "duck_fly", hitKey: "duck_hit", tint: 0x94b0c2 },
};
