import type { LevelConfig } from "./LevelConfig";

/** Level 2 — Marsh (v1.1). Visual unpredictability: tall reeds occlude targets;
 *  teal joins as the quick, low-scoring reward. */
export const marsh: LevelConfig = {
  id: "marsh",
  name: "Marsh",
  order: 2,
  backdrop: {
    sky: 0x3b5dc9,
    horizon: 0x73eff7,
    hillFar: 0x29366f,
    hillNear: 0x257179,
    grass: 0x257179,
    grassHighlight: 0x38b764,
    grassShadow: 0x29366f,
    bush: 0x1a1c2c,
    clouds: true,
    stars: false,
    foreground: "reeds",
    foregroundColor: 0x38b764,
  },
  spawnTable: [
    {
      species: "duck",
      weight: 0.6,
      speedRange: [52, 80],
      pathStyle: "sine",
      scale: 1.0,
      scoreBase: 100,
    },
    {
      species: "teal",
      weight: 0.4,
      speedRange: [88, 124],
      pathStyle: "sine",
      scale: 0.7,
      scoreBase: 60,
    },
  ],
  targetsPerRound: 10,
  passThreshold: 6,
  atmosphere: {
    ambientSfx: "assets/audio/ambient_marsh.ogg",
  },
};
