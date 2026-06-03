import type { LevelConfig } from "./LevelConfig";

/** Level 5 — Twilight (v1.4). Atmospheric tension: reduced visibility, a warm
 *  dusk palette, and zig-zagging bats emerging as ducks head home. */
export const twilight: LevelConfig = {
  id: "twilight",
  name: "Twilight",
  order: 5,
  backdrop: {
    sky: 0x5d275d,
    horizon: 0xef7d57,
    hillFar: 0x29366f,
    hillNear: 0x333c57,
    grass: 0x1a1c2c,
    grassHighlight: 0x566c86,
    grassShadow: 0x1a1c2c,
    bush: 0x1a1c2c,
    clouds: false,
    stars: false,
    foreground: "none",
    foregroundColor: 0x1a1c2c,
    tintHex: "#ef7d57",
  },
  spawnTable: [
    {
      species: "duck",
      weight: 0.5,
      speedRange: [56, 84],
      pathStyle: "sine",
      scale: 1.0,
      scoreBase: 100,
    },
    {
      species: "bat",
      weight: 0.5,
      speedRange: [92, 130],
      pathStyle: "zigzag",
      scale: 0.6,
      scoreBase: 80,
    },
  ],
  targetsPerRound: 10,
  passThreshold: 7,
  atmosphere: {
    visibility: 0.7,
    ambientSfx: "assets/audio/ambient_twilight.ogg",
  },
};
