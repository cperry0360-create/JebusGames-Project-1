// Which art a LEVEL needs, as opposed to which art is level art at all.
//
// `Art.LEVEL_ART_KEYS` answers the boot-side question — may the loader skip
// this key — and the answer is the same for every level. This module answers
// the other one: given a level about to start, exactly which of those keys
// does it need on the board? The plate is its own, the enemies are its own,
// and the rest is shared.
//
// WHY THE ENEMIES ARE COMPUTED AND NOT LISTED. Every level's wave table
// already names the enemies it fields, and enemies.json already says which
// sprite each of them wears. A hand-written list per level would be a third
// copy of that, and the copy that drifts is the one that puts a magenta box on
// the board in wave nine. The cost of computing it is one pass over a wave
// table on the way into a level.
//
// AND WHY THE PASS IS TRANSITIVE. Not every enemy that walks the lane was
// spawned by a wave. The Devil summons Direct Reports, Batula calls in six
// Baby Franks below half health, the Vampire Lord splits into four Gliders,
// and level 5's dusk flip converts every Thrall into a Glider where it stands.
// Every one of those is an enemy the level can show without any wave naming
// it, so the seed set is closed under "what can this enemy put on the board"
// before the sprites are read off it.

// NO PHASER, AND NOT BY ACCIDENT. `npm install` does not work in the agent
// environment, so a test that imports anything reaching `phaser` cannot run at
// all — which is why the classification below lives here rather than beside
// the rest of the manifest in Art.ts. The split is worth 90.8 MB and has one
// failure mode that puts a magenta box on the title screen; it needs a test
// that actually executes it, not one that reads the source as text.
// `systems/Art.ts` imports what it needs from here.

import type { ArtDef, EnemyDef } from '../types.ts'
import type { Level } from './Levels.ts'
// With the import attribute, which Levels.ts also carries and Art.ts does not:
// Node's own type-stripping runner requires it, and needing it is the point —
// the test below imports this module for real rather than reading it as text.
import artData from '../data/art.json' with { type: 'json' }
import enemyData from '../data/enemies.json' with { type: 'json' }
import { levelRules, loadLevel } from './Levels.ts'

const art = artData as ArtDef
const ENEMIES = enemyData as unknown as Record<string, EnemyDef>

/**
 * The map plates, by manifest key. One per level, and only ever one resident.
 *
 * `Object.values` rather than a hand-written list, so a sixth level is one row
 * in `art.map` and nothing here.
 */
export const PLATE_KEYS: string[] = [...new Set(Object.values(art.map))]

/**
 * Every manifest key an enemy wears, from enemies.json and nowhere else.
 *
 * Several enemies share a picture — the tourists, the two vampire ranks — so
 * this is deduplicated and is shorter than the roster. Derived rather than
 * written down: enemies.json already says which sprite every enemy wears, and
 * a second copy of that list is a list that drifts.
 */
export const ENEMY_SPRITE_KEYS: string[] = [...new Set(
  Object.values(ENEMIES)
    .map((e) => e.sprite)
    .filter((k): k is string => typeof k === 'string' && k in art.files),
)]

/**
 * Art that only exists inside a level: the plates, the enemies, and the
 * effects, props, soldiers and in-play panels in art.json's `levelArt.shared`.
 *
 * BOOT DOES NOT LOAD ANY OF IT. It arrives with the level that needs it and is
 * given back when that level ends, which is the same trade the plates made and
 * for the same reason — 169.8 MB was resident before the title screen drew a
 * frame, and 124.7 MB of that never reached the glass on any pre-level screen.
 * See reports/2026-09-08-the-memory-numbers.md.
 *
 * This is the boot-side question — "may the loader skip this key" — and the
 * answer is the same for every level. `levelArtKeys` below answers the other.
 */
export const LEVEL_ART_KEYS: string[] = [...new Set([
  ...PLATE_KEYS,
  ...ENEMY_SPRITE_KEYS,
  ...art.levelArt.shared,
])]

/** Whether this key arrives with a level rather than at boot. */
export function isLevelArtKey(key: string): boolean {
  return LEVEL_ART_KEYS.includes(key)
}

/** Whether this key is a map plate specifically. */
export function isPlateKey(key: string): boolean {
  return PLATE_KEYS.includes(key)
}

/**
 * Every enemy id named anywhere inside a value.
 *
 * A SEARCH RATHER THAN A LIST OF FIELDS, and that is the whole point of it.
 * Writing `summons.enemy`, `splitsOnDeath.enemy`, `onHealthThreshold.summon
 * .enemy` and level 5's `conversions` out by name works exactly until the next
 * mechanic adds a sixth place an id can sit — and the failure is silent, six
 * waves into a level, on a phone. Anything that IS an id in enemies.json is
 * treated as one wherever it appears.
 *
 * Keys beginning with an underscore are skipped: those are the design notes,
 * and a note is prose that can mention an enemy by name without spawning one.
 */
function enemyIdsIn(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    if (value in ENEMIES) out.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const v of value) enemyIdsIn(v, out)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('_')) continue
      enemyIdsIn(v, out)
    }
  }
}

/** Every enemy this level can put on the board, spawned or spawned-by. */
export function enemyIdsForLevel(level: Level): string[] {
  const seed = new Set<string>()
  enemyIdsIn(level.waveTable.waves, seed)
  enemyIdsIn(levelRules(level.id), seed)

  const closed = new Set<string>()
  const frontier = [...seed]
  while (frontier.length > 0) {
    const id = frontier.pop()!
    if (closed.has(id)) continue
    closed.add(id)
    const next = new Set<string>()
    enemyIdsIn(ENEMIES[id], next)
    for (const n of next) if (!closed.has(n)) frontier.push(n)
  }
  return [...closed]
}

/** The manifest keys the enemies of this level wear. */
export function enemyArtForLevel(level: Level): string[] {
  return [...new Set(
    enemyIdsForLevel(level)
      .map((id) => ENEMIES[id]?.sprite)
      .filter((k): k is string => typeof k === 'string' && k in art.files),
  )]
}

/**
 * Everything this level loads on the way in and gives back on the way out.
 *
 * Takes an id rather than a Level so the caller does not have to have built
 * one — `preload` runs before `create`, and `loadLevel` is a pure lookup that
 * falls back to the default level rather than throwing on an unknown id.
 */
export function levelArtKeys(levelId: string | null | undefined): string[] {
  const level = loadLevel(levelId)
  const plate = art.map[level.map.plate]
  return [...new Set([
    ...(plate === undefined ? [] : [plate]),
    ...enemyArtForLevel(level),
    ...art.levelArt.shared,
  ])]
}

/**
 * Level art that is never loaded by anybody.
 *
 * Not used by the game; used by the test that keeps this file honest. A key
 * classified as level art that no level asks for is either art for a level
 * that has not shipped yet or a key that was moved off boot by mistake, and
 * the difference is worth knowing rather than guessing.
 */
export function orphanedLevelArt(levelIds: readonly string[]): string[] {
  const wanted = new Set(levelIds.flatMap((id) => levelArtKeys(id)))
  return LEVEL_ART_KEYS.filter((k) => !wanted.has(k))
}
