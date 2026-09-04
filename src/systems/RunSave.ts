/**
 * The run that is still going, kept across closing the app.
 *
 * `Save.ts` holds what outlives every run — volume, the cleared-run count, the
 * Banner total. This holds the opposite: one run, in progress, and nothing
 * that should survive it finishing. They are deliberately two keys rather than
 * two fields of one object, so a half-written run snapshot cannot take the
 * settings and the Server Nuke unlock down with it. The run is the volatile
 * half; it should not be able to cost the player anything permanent.
 *
 * Written on wave completion and when the board changes — a tower built, sold,
 * moved or upgraded — and never per frame. A run is only ever resumed from the
 * START of the wave it was saved on: the enemies on the field, their health
 * and their positions are not saved, and a wave replayed from its first spawn
 * is a far better outcome than a wave restored halfway with nothing in it.
 *
 * Like Save.ts, it is total: it never throws, and anything it cannot make
 * sense of is treated as no saved run at all. A game that will not start
 * because a save is malformed is worse than one that forgot a run.
 */

const KEY = 'courjahan.run'

/**
 * The shape's version, IN THE RECORD rather than in the key.
 *
 * Save.ts puts its version in the key (`courjahan.save.v1`), which means a
 * shape change there orphans the old record and silently starts fresh. That is
 * survivable for a volume slider. It is not survivable for a run in progress:
 * a player mid-run when an update ships would lose it with no way back. With
 * the version inside, `loadRun` can see "this is a v1 record" and migrate it
 * forward. Nothing needs migrating yet — v1 is the first shape — and the point
 * is that the day something does, the field is already there.
 */
export const RUN_SAVE_VERSION = 1

/** A tower as it stood: which one, where, and how far up. */
export interface SavedTower {
  /** Tower id from towers.json. */
  id: string
  /** Build-spot index on the map. */
  spot: number
  /** 1 when built; 2 and 3 are bought. A tier part-way through being raised is
   *  saved at the tier it currently HAS, so the peanuts are lost rather than
   *  the tower arriving free at a tier it had not finished paying for. */
  tier: number
  /** The tier-3 specialization, or null. */
  spec: string | null
}

export interface SavedRun {
  version: number
  /**
   * Which level is being played.
   *
   * Always 'level1' today, because GameScene loads one map and one wave table
   * and making it level-aware is a separate, unapproved refactor. It is stored
   * anyway: a resumed run has to know what it is resuming INTO, and adding the
   * field later would mean every run saved before the change resumes onto the
   * wrong map.
   */
  level: string
  /** Waves cleared so far, which is also the index of the wave about to run. */
  wave: number
  lives: number
  peanuts: number
  towers: SavedTower[]
  /** What the loadout dealt. Without it a resumed run has a hero it did not
   *  pick and an empty build menu, so the draft is part of the run's state
   *  even though nothing about it changes after wave one. */
  heroId: string
  abilities: string[]
  openingTowers: string[]
  reserveTowers: string[]
  /** Which of them are actually buildable now — the 3rd and 4th unlock at
   *  waves 4 and 8, and a resume must not take that back. */
  unlockedTowers: string[]
  seed: number
}

/** A board cannot hold more than a handful of towers; this is a sanity bound
 *  on a hand-edited file, not a game rule. */
const MAX_TOWERS = 64
/** Nothing has thirteen hundred waves. Same purpose. */
const MAX_WAVES = 999

function int(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const n = Math.floor(v)
  return n >= min && n <= max ? n : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null
}

function strList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > 32) return null
  const out: string[] = []
  for (const item of v) {
    const s = str(item)
    if (s === null) return null
    out.push(s)
  }
  return out
}

function tower(v: unknown): SavedTower | null {
  if (!v || typeof v !== 'object') return null
  const t = v as Partial<SavedTower>
  const id = str(t.id)
  const spot = int(t.spot, 0, 999)
  const tier = int(t.tier, 1, 9)
  if (id === null || spot === null || tier === null) return null
  // A missing spec and an explicit null are the same thing: no specialization.
  const spec = t.spec === null || t.spec === undefined ? null : str(t.spec)
  if (spec === null && t.spec !== null && t.spec !== undefined) return null
  return { id, spot, tier, spec }
}

/**
 * The saved run, or null if there is not one that makes sense.
 *
 * Every field is checked. A record that fails anywhere is discarded whole
 * rather than patched with defaults: half a run — the towers of one game and
 * the peanuts of another — is a worse thing to hand a player than a fresh
 * start, and it is the kind of state that produces bug reports nobody can
 * reproduce.
 */
export function loadRun(): SavedRun | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<SavedRun>

    // The version gate. An unknown version is a record written by a build
    // newer than this one, or by one older than any migration covers; either
    // way this build cannot be trusted to read it. When a v2 arrives, the
    // migration from v1 goes HERE, before the field checks below.
    if (p.version !== RUN_SAVE_VERSION) return null

    const level = str(p.level)
    const wave = int(p.wave, 0, MAX_WAVES)
    // Zero lives is not a run in progress, it is a run that was lost.
    const lives = int(p.lives, 1, 9999)
    const peanuts = int(p.peanuts, 0, 9_999_999)
    const heroId = str(p.heroId)
    const seed = int(p.seed, 0, 0xffffffff)
    const abilities = strList(p.abilities)
    const openingTowers = strList(p.openingTowers)
    const reserveTowers = strList(p.reserveTowers)
    const unlockedTowers = strList(p.unlockedTowers)
    if (level === null || wave === null || lives === null || peanuts === null) return null
    if (heroId === null || seed === null) return null
    if (!abilities || !openingTowers || !reserveTowers || !unlockedTowers) return null

    if (!Array.isArray(p.towers) || p.towers.length > MAX_TOWERS) return null
    const towers: SavedTower[] = []
    const spots = new Set<number>()
    for (const raw of p.towers) {
      const t = tower(raw)
      // Two towers on one pad is impossible on a real board, so a record
      // claiming it was not written by this game.
      if (!t || spots.has(t.spot)) return null
      spots.add(t.spot)
      towers.push(t)
    }

    return {
      version: RUN_SAVE_VERSION, level, wave, lives, peanuts, towers,
      heroId, abilities, openingTowers, reserveTowers, unlockedTowers, seed,
    }
  } catch {
    // Unparseable, or localStorage is unavailable in this context.
    return null
  }
}

/** True when there is a run worth offering to resume. */
export function hasSavedRun(): boolean {
  return loadRun() !== null
}

export function saveRun(run: Omit<SavedRun, 'version'>): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...run, version: RUN_SAVE_VERSION }))
  } catch {
    // Storage full, blocked or absent. The run continues; it just will not
    // survive the app closing, which is exactly where it stood before.
  }
}

/** Called when a run ends, won or lost, and when a new one is started over the
 *  top of it. A finished run must never be offered for resuming. */
export function clearRun(): void {
  try {
    globalThis.localStorage?.removeItem(KEY)
  } catch {
    // Nothing to do, and nothing worth failing a scene transition over.
  }
}
