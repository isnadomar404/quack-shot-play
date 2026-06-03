import type { LevelConfig } from "./LevelConfig";

/** Level 3 — Forest Edge (v1.2). Target variety: branches occlude; the pheasant
 *  is slower but changes direction sharply. */
export const forest: LevelConfig = {
  id: "forest",
  name: "Forest Edge",
  order: 3,
  backdrop: {
    sky: 0x41a6f6,
    horizon: 0xa7f070,
    hillFar: 0x257179,
    hillNear: 0x38b764,
    grass: 0x38b764,
    grassHighlight: 0xa7f070,
    grassShadow: 0x257179,
    bush: 0x1a1c2c,
    clouds: false,
    stars: false,
    foreground: "branches",
    foregroundColor: 0x333c57,
  },
  spawnTable: [
    {
      species: "duck",
      weight: 0.5,
      speedRange: [54, 82],
      pathStyle: "sine",
      scale: 1.0,
      scoreBase: 100,
    },
    {
      species: "pheasant",
      weight: 0.5,
      speedRange: [40, 64],
      pathStyle: "sharp_turns",
      scale: 1.2,
      scoreBase: 150,
    },
  ],
  targetsPerRound: 10,
  passThreshold: 6,
  atmosphere: {
    ambientSfx: "assets/audio/ambient_forest.ogg",
  },
};
