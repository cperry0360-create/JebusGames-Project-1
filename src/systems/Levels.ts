// Which map, which wave table, which plate — resolved from levels.json.
//
// GameScene used to import map.json and waves.json at module scope, which made
// "the level" a fact about the bundle rather than a choice the run makes. This
// is that choice: a level id in, a map and a wave table out.
//
// Every level's data is imported STATICALLY here rather than fetched by name.
// levels.json still decides which table belongs to which level — the strings
// in it are the keys into these tables, and a test holds the two in step — but
// the files themselves are named at build time so Vite bundles them and a
// missing one is a build error rather than a 404 halfway through a run.
//
// Phaser-free on purpose, like the other systems modules: which levels exist
// and which are unlocked is arithmetic over JSON, and tests read it directly.

// The `with { type: 'json' }` attributes are what let the test runner import
// this module directly — node refuses a bare JSON import — and Vite honours
// them too. Music.ts and AbilityText.ts carry them for the same reason.
import type { MapDef, WavesDef } from '../types.ts'
import levelsData from '../data/levels.json' with { type: 'json' }
import mapLevel1 from '../data/map.json' with { type: 'json' }
import mapLevel2 from '../data/map_level2.json' with { type: 'json' }
import mapLevel3 from '../data/map_level3.json' with { type: 'json' }
import mapLevel4 from '../data/map_level4.json' with { type: 'json' }
import wavesLevel1 from '../data/waves.json' with { type: 'json' }
import wavesLevel2 from '../data/waves.level2.json' with { type: 'json' }
import wavesLevel3 from '../data/waves.level3.json' with { type: 'json' }
import wavesLevel4 from '../data/waves.level4.json' with { type: 'json' }

/** A row of levels.json: what the registry records about a level. */
export interface LevelDef {
  id: string
  name: string
  /** Filename of the wave table, resolved through `WAVE_TABLES`. */
  waves: string
  /** The walked length of the painted road. Not read at runtime; it exists so
   *  wave spacing can be compared between levels, and a test checks it against
   *  the map's own waypoints. */
  laneLengthPx: number
  /**
   * The level that opens this one, by id, or null for the level that is open
   * from the start.
   *
   * It replaces `runsClearedToUnlock`, a count of cleared runs, and the reason
   * is in levels.json's `_unlockedBy`: a count cannot say WHICH levels, so
   * clearing level 1 three times opened level 4 and START RUN would have sent
   * that player straight to it.
   */
  unlockedBy: string | null
  /**
   * Towers this level can draw that the shared pool does not offer, with their
   * draft weights. Absent on every level that draws only the shared pool.
   *
   * Additive rather than a replacement so a new tower is one line on one level
   * -- and so levels 2 and 3 keep drawing exactly what they were tuned against.
   */
  extraTowerWeights?: Record<string, number>
}

/** A level with its data attached, which is what a scene actually wants. */
export interface Level extends LevelDef {
  map: MapDef
  waveTable: WavesDef
}

/**
 * Map data by level id.
 *
 * Levels 2 and 3 cast looser than level 1 because their maps have no
 * entrance, exit or signs — those fields are optional on `MapDef` now, and
 * a JSON import types them as absent rather than optional. Level 3 adds a
 * second reason: it is the first map with `lanes`, and a JSON import types
 * a merge's `into` as `string` rather than the lane id it is.
 */
const MAPS: Record<string, MapDef> = {
  level1: mapLevel1 as MapDef,
  level2: mapLevel2 as unknown as MapDef,
  level3: mapLevel3 as unknown as MapDef,
  level4: mapLevel4 as unknown as MapDef,
}

/** Wave tables by the filename levels.json names them with. */
const WAVE_TABLES: Record<string, WavesDef> = {
  'waves.json': wavesLevel1 as WavesDef,
  'waves.level2.json': wavesLevel2 as WavesDef,
  'waves.level3.json': wavesLevel3 as unknown as WavesDef,
  'waves.level4.json': wavesLevel4 as unknown as WavesDef,
}

export const LEVELS: LevelDef[] = (levelsData as unknown as { levels: LevelDef[] }).levels

/**
 * How many slots the world map's road has, the unbuilt stretch included.
 *
 * A LEVEL'S PLACE ON THAT ROAD IS ITS PLACE IN `LEVELS`, and there is no
 * second opinion about it any more. Every level used to carry a hand-authored
 * `mapPosition`, and the four of them had drifted out of level order -- level
 * 4 was parked at the far left because the old full-size cards had run out of
 * room anywhere else -- so the path drawn between them in order ran backwards
 * across the screen and read as though it skipped a level. Order IS the
 * position now, so the two cannot disagree.
 *
 * Never fewer slots than there are levels: a level that exists always has
 * somewhere to be drawn, whatever the file says.
 */
export const ROAD_SLOTS: number = Math.max(
  LEVELS.length,
  (levelsData as unknown as { plannedLevels?: number }).plannedLevels ?? 0,
)

/** The level a run plays when nothing has said otherwise. First in the file,
 *  not a hardcoded 'level1', so reordering levels.json cannot silently
 *  disagree with the code. */
export const DEFAULT_LEVEL_ID: string = LEVELS[0]!.id

/**
 * The draft weights for a run on this level: the shared pool plus whatever the
 * level adds. The one place the two are combined, so the loadout screen and the
 * soak cannot disagree about what a level can draw.
 */
export function towerWeightsFor(id: string, shared: Record<string, number>): Record<string, number> {
  return { ...shared, ...(levelDef(id)?.extraTowerWeights ?? {}) }
}

export function levelDef(id: string): LevelDef | null {
  return LEVELS.find((l) => l.id === id) ?? null
}

/**
 * A level id that certainly exists.
 *
 * A saved run carries its level as a string, and a save written by an older
 * build — or edited by hand, or left over from a level that was renamed — can
 * name one that is gone. Resuming onto the default map is wrong, but it is a
 * playable kind of wrong; throwing on the first frame of a resumed run is not.
 */
export function resolveLevelId(id: string | null | undefined): string {
  return id != null && levelDef(id) !== null ? id : DEFAULT_LEVEL_ID
}

/** Everything a scene needs to build a level, by id. Falls back to the default
 *  level rather than throwing — see `resolveLevelId`. */
export function loadLevel(id: string | null | undefined): Level {
  const def = levelDef(resolveLevelId(id))!
  const map = MAPS[def.id]
  const waveTable = WAVE_TABLES[def.waves]
  // These two are the build-time contract: levels.json named something this
  // module does not import. A test catches it, and so does this, loudly,
  // because a half-built level is worse than no level.
  if (!map) throw new Error(`level ${def.id} has no map registered in Levels.ts`)
  if (!waveTable) throw new Error(`level ${def.id} names wave table ${def.waves}, which Levels.ts does not import`)
  return { ...def, map, waveTable }
}

/**
 * Whether this level may be picked, given the levels already beaten.
 *
 * A LOOKUP, NOT A COMPARISON. It used to be `runsCleared >= threshold`, and
 * `runsCleared` counts runs rather than naming levels -- so three runs on
 * level 1 satisfied level 4's threshold of 3 and opened it. There is nothing
 * to satisfy now: the level names the level that opens it, and either that
 * one has been beaten or it has not.
 *
 * A level naming a prerequisite that does not exist stays LOCKED. That is the
 * safer of the two failure modes by a distance: a typo makes a level
 * unreachable, which is loud and is caught by a test, where treating an
 * unknown prerequisite as satisfied would silently open the whole campaign.
 */
export function isLevelUnlocked(id: string, cleared: readonly string[]): boolean {
  const def = levelDef(id)
  if (def === null) return false
  return def.unlockedBy === null || cleared.includes(def.unlockedBy)
}

/** The levels this player may pick, in file order. */
export function unlockedLevels(cleared: readonly string[]): LevelDef[] {
  return LEVELS.filter((l) => isLevelUnlocked(l.id, cleared))
}

/** The furthest level open to this player: what START RUN begins, and the one
 *  the map screen marks as the current objective. Never null — the first level
 *  costs nothing, so there is always at least one. */
export function furthestUnlocked(cleared: readonly string[]): LevelDef {
  const open = unlockedLevels(cleared)
  return open[open.length - 1] ?? LEVELS[0]!
}

/**
 * Whether this level has been beaten.
 *
 * RECORDED, NOT DERIVED, which is the whole of the change. This used to infer
 * an answer from the run counter -- a level counted as beaten once enough runs
 * had been cleared to open the one after it -- and carried its own note
 * admitting that clearing level 1 twice therefore marked level 2 beaten. The
 * save lists the levels now, so there is nothing to infer and nothing to be
 * wrong about.
 */
export function isLevelCleared(id: string, cleared: readonly string[]): boolean {
  return cleared.includes(id)
}

/**
 * The level this one opens, or null when nothing follows it yet.
 *
 * READ OFF THE PREREQUISITES rather than off file order, and the difference is
 * the point: "the level after this one" and "the level this one unlocks" have
 * to be the same fact, and a second field saying so would eventually disagree
 * with the first. If a branching campaign ever names two levels after one, the
 * first in file order is offered and the rest are reached from the map -- which
 * is a real answer rather than a crash, and the map is the right screen for a
 * choice anyway.
 *
 * NULL IS THE CASE THAT MATTERS. Four levels exist and the road has twenty
 * slots, so after level 4 there is no next level -- and the victory screen has
 * to offer LEVEL SELECT instead of pointing NEXT LEVEL at a COMING SOON slot.
 */
export function nextLevelId(id: string): string | null {
  return LEVELS.find((l) => l.unlockedBy === id)?.id ?? null
}
