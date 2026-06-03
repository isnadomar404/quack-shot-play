/**
 * Hi-score persistence (Phase 5 — Ship). A single best score kept in
 * localStorage so it survives reloads. Every access is guarded: localStorage
 * throws in private-browsing / disabled-storage contexts, and a corrupted value
 * must never crash the game — both degrade gracefully to "no hi-score".
 */
const KEY = "fowlplay:hiscore";

/** Read the stored best score; 0 if absent, unreadable, or invalid. */
export function loadHiScore(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Persist `score` if it beats the stored best. Returns the resulting best score
 * (so callers can display it without a second read). Never throws.
 */
export function saveHiScore(score: number): number {
  const best = Math.max(score, loadHiScore());
  try {
    localStorage.setItem(KEY, String(best));
  } catch {
    // Storage unavailable (private mode / quota) — keep playing without it.
  }
  return best;
}
