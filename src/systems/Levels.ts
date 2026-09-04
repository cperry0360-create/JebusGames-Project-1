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
import wavesLevel1 from '../data/waves.json' with { type: 'json' }
import wavesLevel2 from '../data/waves.level2.json' with { type: 'json' }

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
}

/** A level with its data attached, which is what a scene actually wants. */
export interface Level extends LevelDef {
  map: MapDef
  waveTable: WavesDef
}

/**
 * Map data by level id.
 *
 * Level 2's cast is looser than level 1's because its map has no entrance,
 * exit, signs or Bailey spots — those fields are optional on `MapDef` now, and
 * a JSON import types them as absent rather than optional.
 */
const MAPS: Record<string, MapDef> = {
  level1: mapLevel1 as MapDef,
  level2: mapLevel2 as unknown as MapDef,
}

/** Wave tables by the filename levels.json names them with. */
const WAVE_TABLES: Record<string, WavesDef> = {
  'waves.json': wavesLevel1 as WavesDef,
  'waves.level2.json': wavesLevel2 as WavesDef,
}

export const LEVELS: LevelDef[] = (levelsData as { levels: LevelDef[] }).levels

/** The level a run plays when nothing has said otherwise. First in the file,
 *  not a hardcoded 'level1', so reordering levels.json cannot silently
 *  disagree with the code. */
export const DEFAULT_LEVEL_ID: string = LEVELS[0]!.id

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
