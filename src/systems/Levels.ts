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
  /** Cleared runs needed before this level can be picked. 0 = open always. */
  runsClearedToUnlock: number
  /** Where this level sits on the world map, normalised 0-1 against the
   *  world's bounds. The ONLY place a level's position lives: the cards are
   *  placed from it and the trail between them is generated from it, so
   *  moving a level is one edit in levels.json. */
  mapPosition: [number, number]
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

// `as unknown as` because a JSON import types mapPosition as number[], and the
// interface wants the [x, y] pair it actually is. The shape is held by tests,
// not by this cast.
export const LEVELS: LevelDef[] = (levelsData as unknown as { levels: LevelDef[] }).levels

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

/** True when the player has cleared enough runs to pick this level. */
export function isLevelUnlocked(id: string, runsCleared: number): boolean {
  const def = levelDef(id)
  return def !== null && runsCleared >= def.runsClearedToUnlock
}

/** The levels a player with this many cleared runs may pick, in file order. */
export function unlockedLevels(runsCleared: number): LevelDef[] {
  return LEVELS.filter((l) => runsCleared >= l.runsClearedToUnlock)
}

/** The furthest level open to this player: what START RUN begins, and the one
 *  the map screen marks as the current objective. Never null — the first level
 *  costs nothing, so there is always at least one. */
export function furthestUnlocked(runsCleared: number): LevelDef {
  const open = unlockedLevels(runsCleared)
  return open[open.length - 1] ?? LEVELS[0]!
}

/**
 * Whether this level has been beaten, as far as the save can tell.
 *
 * DERIVED, NOT RECORDED, and that is a real limitation rather than a detail.
 * The save counts cleared RUNS, not which levels they were on, and this reuses
 * that count rather than adding a second thing to keep in step: a level counts
 * as cleared once the player has cleared enough runs to have opened the level
 * AFTER it, since opening the next one is what beating this one does.
 *
 * Where that is wrong: clearing level 1 twice also marks level 2 cleared,
 * because two cleared runs is two cleared runs however they were spent. Fixing
 * it properly means recording beaten levels in the save, which is a new field
 * and a migration, and is not this change.
 */
export function isLevelCleared(id: string, runsCleared: number): boolean {
  const i = LEVELS.findIndex((l) => l.id === id)
  if (i < 0) return false
  const next = LEVELS[i + 1]
  // The last level has nothing after it to have opened, so it needs one more
  // cleared run than it cost to reach.
  const needed = next ? next.runsClearedToUnlock : LEVELS[i]!.runsClearedToUnlock + 1
  return runsCleared >= needed
}
