/**
 * Everything that outlives a run.
 *
 * Only settings so far. It is deliberately tiny and deliberately total: read
 * once, write on change, and never throw. localStorage is unavailable in a
 * private window and in some embedded contexts, and a game that will not boot
 * because it could not remember a volume slider is a worse game than one that
 * forgets it.
 */

const KEY = 'courjahan.save.v1'

export interface SaveData {
  /** Master volume, 0 to 1. */
  volume: number
  muted: boolean
  /**
   * How many runs have been cleared, ever.
   *
   * The Server Nuke is meant to be a reward for finishing the game once, and
   * this is the only thing standing between a first-time player and it. Kept
   * as a count rather than a flag so a later unlock can ask for more than one.
   */
  runsCleared: number
}

export const DEFAULT_SAVE: SaveData = { volume: 0.7, muted: false, runsCleared: 0 }

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.max(0, Math.min(1, v))
    : fallback
}

export function loadSave(): SaveData {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return { ...DEFAULT_SAVE }
    const parsed = JSON.parse(raw) as Partial<SaveData>
    return {
      volume: clamp01(parsed.volume, DEFAULT_SAVE.volume),
      muted: parsed.muted === true,
      runsCleared: count(parsed.runsCleared),
    }
  } catch {
    // Unreadable, unparseable or unavailable: start fresh rather than fail.
    return { ...DEFAULT_SAVE }
  }
}

export function writeSave(data: SaveData): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage full, blocked, or absent. The setting still applies this session.
  }
}

/** True once the player has finished a run, which is what unlocks the nuke. */
export function hasClearedARun(): boolean {
  return loadSave().runsCleared > 0
}

/** Called when a run is won. Every other field is preserved. */
export function recordRunCleared(): void {
  const save = loadSave()
  writeSave({ ...save, runsCleared: save.runsCleared + 1 })
}
