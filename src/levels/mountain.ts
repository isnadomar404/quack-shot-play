import type { LevelConfig } from "./LevelConfig";

/** Level 4 — Mountain Pass (v1.3). Environmental physics: a steady wind drifts
 *  every target; the eagle is fast, rare, and worth big points. */
export const mountain: LevelConfig = {
  id: "mountain",
  name: "Mountain Pass",
  order: 4,
  backdrop: {
    sky: 0x73eff7,
    horizon: 0xf4f4f4,
    hillFar: 0x566c86,
    hillNear: 0x94b0c2,
    grass: 0x38b764,
    grassHighlight: 0xa7f070,
    grassShadow: 0x257179,
    bush: 0x566c86,
    clouds: true,
    stars: false,
    foreground: "peaks",
    foregroundColor: 0x566c86,
  },
  spawnTable: [
    {
      species: "duck",
      weight: 0.7,
      speedRange: [58, 86],
      pathStyle: "sine",
      scale: 1.0,
      scoreBase: 100,
    },
    {
      species: "pheasant",
      weight: 0.2,
      speedRange: [44, 70],
      pathStyle: "sharp_turns",
      scale: 1.2,
      scoreBase: 150,
    },
    {
      species: "eagle",
      weight: 0.1,
      speedRange: [120, 170],
      pathStyle: "straight",
      scale: 1.4,
      scoreBase: 500,
    },
  ],
  targetsPerRound: 10,
  passThreshold: 7,
  atmosphere: {
    windVector: { x: 24, y: 0 },
    ambientSfx: "assets/audio/ambient_mountain.ogg",
  },
};
