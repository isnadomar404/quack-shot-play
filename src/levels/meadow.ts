import type { LevelConfig } from "./LevelConfig";

/** Level 1 — Meadow (v1.0). Calm mastery: slow lone ducks, bright day. */
export const meadow: LevelConfig = {
  id: "meadow",
  name: "Meadow",
  order: 1,
  backdrop: {
    sky: 0x41a6f6,
    horizon: 0x73eff7,
    hillFar: 0x257179,
    hillNear: 0x38b764,
    grass: 0x38b764,
    grassHighlight: 0xa7f070,
    grassShadow: 0x257179,
    bush: 0x257179,
    clouds: true,
    stars: false,
    foreground: "none",
    foregroundColor: 0x257179,
  },
  spawnTable: [
    {
      species: "duck",
      weight: 1.0,
      speedRange: [42, 66],
      pathStyle: "sine",
      scale: 1.0,
      scoreBase: 100,
    },
  ],
  targetsPerRound: 10,
  passThreshold: 6,
  atmosphere: {
    ambientSfx: "assets/audio/ambient_meadow.ogg",
  },
};
