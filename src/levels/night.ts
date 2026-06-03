import type { LevelConfig } from "./LevelConfig";

/** Level 6 — Night (v1.5, the skill ceiling). Flat-dark silhouettes against a
 *  starfield; bats dominate, the owl is the rare bonus. */
export const night: LevelConfig = {
  id: "night",
  name: "Night",
  order: 6,
  backdrop: {
    // Deep-blue sky (lighter than the 0x1a1c2c silhouette tint) so the
    // flat-dark targets read as shapes against it + the stars.
    sky: 0x29366f,
    horizon: 0x3b5dc9,
    hillFar: 0x1a1c2c,
    hillNear: 0x333c57,
    grass: 0x1a1c2c,
    grassHighlight: 0x333c57,
    grassShadow: 0x1a1c2c,
    bush: 0x1a1c2c,
    clouds: false,
    stars: true,
    foreground: "none",
    foregroundColor: 0x1a1c2c,
  },
  spawnTable: [
    {
      species: "bat",
      weight: 0.85,
      speedRange: [96, 136],
      pathStyle: "zigzag",
      scale: 0.6,
      scoreBase: 80,
    },
    {
      species: "owl",
      weight: 0.15,
      speedRange: [70, 96],
      pathStyle: "straight",
      scale: 1.1,
      scoreBase: 400,
    },
  ],
  targetsPerRound: 10,
  passThreshold: 7,
  atmosphere: {
    visibility: 0.5,
    ambientSfx: "assets/audio/ambient_night.ogg",
  },
  silhouette: true,
};
