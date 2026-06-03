import type { LevelConfig } from "./LevelConfig";
import { meadow } from "./meadow";
import { marsh } from "./marsh";
import { forest } from "./forest";
import { mountain } from "./mountain";
import { twilight } from "./twilight";
import { night } from "./night";

/** Ordered level progression (LEVELS.md). The game advances through these and,
 *  on an endless replay, loops back to the start at a higher pace. */
export const LEVELS: readonly LevelConfig[] = [
  meadow,
  marsh,
  forest,
  mountain,
  twilight,
  night,
];

export type { LevelConfig };
