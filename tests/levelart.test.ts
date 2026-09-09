// WHICH ART IS LEVEL ART, and whether the split can be trusted.
//
// The split is worth 90.8 MB off the title screen and it has exactly two ways
// to go wrong. One is cheap: a key that belongs with a level stays in the boot
// manifest, and the game is correct and fatter than it needs to be. The other
// is not: a key a MENU draws is classified as level art, boot stops loading it
// and the first screen of the game has a magenta box on it.
//
// `art.json`'s `levelArt.shared` is a hand-written list, so both are possible.
// These tests police the cheap direction where the data can answer for itself
// — every enemy's sprite, every ability's effect — and the expensive one by
// reading the menu scenes and asking what they name.
//
// The decor is why the second half exists. `decor-bush` and its five siblings
// look exactly like board furniture and are 24 KB between them, and
// TitleScene scatters twenty-six of them behind the title.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// NOT THROUGH Art.ts. It imports Phaser, `npm install` does not work here, and
// a test that cannot import the module it is testing is a test that reads
// source as text. LevelArt.ts is deliberately free of Phaser so this can run.
import {
  ENEMY_SPRITE_KEYS, LEVEL_ART_KEYS, PLATE_KEYS, enemyArtForLevel,
  enemyIdsForLevel, isLevelArtKey, levelArtKeys, orphanedLevelArt,
} from '../src/systems/LevelArt.ts'
import { LEVELS, loadLevel } from '../src/systems/Levels.ts'

const url = (p: string) => new URL(p, import.meta.url)
const art = JSON.parse(readFileSync(url('../src/data/art.json'), 'utf8'))
const enemies = JSON.parse(readFileSync(url('../src/data/enemies.json'), 'utf8'))
const heroes = JSON.parse(readFileSync(url('../src/data/heroes.json'), 'utf8'))

test('every key in levelArt.shared is a real manifest key', () => {
  const unknown = art.levelArt.shared.filter((k: string) => !(k in art.files))
  assert.deepEqual(unknown, [], 'levelArt.shared names art that does not exist')
})

test('every enemy sprite is level art', () => {
  // The list is COMPUTED from enemies.json rather than written down, so this
  // cannot fail today — which is the point of asserting it. A future enemy
  // whose picture somebody adds to a menu section would fail here rather than
  // quietly costing 4 MB on the title screen for the rest of the game's life.
  const stragglers = ENEMY_SPRITE_KEYS.filter((k) => !isLevelArtKey(k))
  assert.deepEqual(stragglers, [], 'an enemy picture is loaded at boot')
})

test('every ability effect is level art', () => {
  // heroes.json names an `fx` per ability; those play on the board and nowhere
  // else. A new hero's effect that nobody adds to levelArt.shared is the most
  // likely way for this split to rot, and it rots quietly: the art works, it
  // just loads on the title screen forever.
  const fx = new Set<string>()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (v === null || typeof v !== 'object') return
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k.startsWith('_')) continue
      if (k === 'fx' && typeof val === 'string') fx.add(val)
      else walk(val)
    }
  }
  walk(heroes)
  assert.ok(fx.size > 0, 'no ability effects found — the walk is broken, not the data')
  const stragglers = [...fx].filter((k) => k in art.files && !isLevelArtKey(k))
  assert.deepEqual(stragglers, [], 'an ability effect is loaded at boot')
})

test('every effect named in the manifest fx section is level art', () => {
  const stragglers = Object.values(art.fx as Record<string, string>).filter((k) => !isLevelArtKey(k))
  assert.deepEqual(stragglers, [], 'a shared effect is loaded at boot')
})

test('no art a pre-level scene draws is level art', () => {
  // THE EXPENSIVE DIRECTION. Read from the scenes rather than from a list:
  // every one of them resolves keys through Art.ts, so what a menu draws is
  // the manifest SECTION it reaches for. A scene naming `ART.decor` is the
  // reason this test exists — six Kenney tiles that look like board furniture
  // and are scattered behind the title screen.
  const menuScenes = [
    '../src/scenes/SplashScene.ts', '../src/scenes/TitleScene.ts',
    '../src/scenes/WorldMapScene.ts', '../src/scenes/LoadoutScene.ts',
    '../src/scenes/CutsceneScene.ts', '../src/scenes/CreditsScene.ts',
  ]
  // EVERY PATH THROUGH THE MANIFEST AND THE KEYS AT THE END OF IT. Matched by
  // the dotted path a scene actually writes rather than by the top-level
  // section, because `ART.ui` is a tree with the in-play nuke button and
  // scratch card in it: every menu in the game names `ART.ui.something`, and
  // treating that as "draws all of ART.ui" makes this test cry wolf on four
  // keys no menu has ever touched.
  const paths: Record<string, string[]> = {}
  const walk = (prefix: string, v: unknown): void => {
    if (typeof v === 'string') {
      if (v in art.files) (paths[prefix] ??= []).push(v)
      return
    }
    if (Array.isArray(v)) { v.forEach((x) => walk(prefix, x)); return }
    if (v === null || typeof v !== 'object') return
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (!k.startsWith('_')) walk(`${prefix}.${k}`, val)
    }
  }
  for (const section of ['decor', 'fx', 'prop', 'brand', 'worldMap', 'ui', 'generated', 'hero', 'towerTiers', 'soldierTiers']) {
    walk(`ART.${section}`, (art as Record<string, unknown>)[section])
  }
  const offenders: string[] = []
  for (const f of menuScenes) {
    const src = readFileSync(url(f), 'utf8').split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
    for (const [path, keys] of Object.entries(paths)) {
      // Word boundary at the end, so `ART.ui.nukeButton` does not match
      // `ART.ui.nuke` and `ART.fx` does not match every leaf under it: a scene
      // that names the parent is charged for every key beneath it, which is
      // the conservative direction.
      if (!new RegExp(`${path.replace(/\./g, '\\.')}(\\b|$)`).test(src)) continue
      for (const key of keys) {
        if (isLevelArtKey(key)) {
          offenders.push(`${f.replace('../', '')} draws ${path}, which is level-art key "${key}"`)
        }
      }
    }
  }
  assert.deepEqual(offenders, [], 'a pre-level scene draws art that boot no longer loads')
})

test('boot loads the whole manifest except the level art', () => {
  // Art.REQUIRED_SPRITE_KEYS is `everything minus optional minus level art`,
  // so the thing worth asserting is that the subtraction leaves the menus
  // whole: every key that is neither optional nor level art is still boot's.
  const optional = new Set(art.optional as string[])
  const required = Object.keys(art.files)
    .filter((k) => !optional.has(k) && !isLevelArtKey(k))
  const overlap = required.filter((k) => LEVEL_ART_KEYS.includes(k))
  assert.deepEqual(overlap, [], 'boot would report level art missing on every boot')
  assert.equal(
    required.length + optional.size + LEVEL_ART_KEYS.length,
    Object.keys(art.files).length,
    'the three sets do not partition the manifest',
  )
})

test('a level asks for its own enemies and nobody else\'s', () => {
  for (const def of LEVELS) {
    const level = loadLevel(def.id)
    const wanted = new Set(enemyArtForLevel(level))
    assert.ok(wanted.size > 0, `${def.id} fields no enemies at all`)
    const foreign = ENEMY_SPRITE_KEYS.filter((k) => !wanted.has(k))
    assert.ok(foreign.length > 0, `${def.id} loads every enemy in the game`)
    for (const k of wanted) assert.ok(isLevelArtKey(k), `${def.id} wants non-level art ${k}`)
  }
})

test('the enemy set is closed under summoning, splitting and conversion', () => {
  // The transitive half. An enemy that only ever reaches the board because
  // another one put it there is the case a wave table cannot answer for, and
  // it is the case that shows up six waves in rather than at the start.
  for (const def of LEVELS) {
    const ids = new Set(enemyIdsForLevel(loadLevel(def.id)))
    for (const id of ids) {
      const e = enemies[id] as Record<string, unknown>
      const named = new Set<string>()
      const walk = (v: unknown): void => {
        if (typeof v === 'string') { if (v in enemies) named.add(v); return }
        if (Array.isArray(v)) { v.forEach(walk); return }
        if (v !== null && typeof v === 'object') {
          for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            if (!k.startsWith('_')) walk(val)
          }
        }
      }
      walk(e)
      for (const n of named) {
        assert.ok(ids.has(n), `${def.id}: ${id} can put ${n} on the board and ${n} is not loaded`)
      }
    }
  }
})

test('every level asks for its own plate and the shared in-play art', () => {
  for (const def of LEVELS) {
    const keys = new Set(levelArtKeys(def.id))
    assert.ok(keys.has(art.map[loadLevel(def.id).map.plate]), `${def.id} does not load its plate`)
    for (const k of art.levelArt.shared as string[]) assert.ok(keys.has(k), `${def.id} does not load ${k}`)
    // Only one plate, ever. Loading a second is the fault the whole per-level
    // split exists to prevent.
    const plates = [...keys].filter((k) => PLATE_KEYS.includes(k))
    assert.equal(plates.length, 1, `${def.id} loads ${plates.length} plates`)
  }
})

test('the only level art no level loads is level 6\'s', () => {
  // Level art that no shipped level asks for is never loaded by anything, and
  // it is either art for a level that has not shipped or a key moved off boot
  // by mistake. Both are worth knowing; only one is a bug.
  //
  // These four are the first kind. `waves.level6.json` and `level6.json` are
  // in the repository and level 6 is NOT on levels.json's list, so its roster
  // — Scrapper, Sprinter, the level-6 Bruiser and the Rooster boss — has no
  // level to arrive with. That is 15.1 MB that used to sit on the title screen
  // for a level nobody can reach.
  //
  // WHEN LEVEL 6 SHIPS THIS TEST FAILS, which is the intent: add level 6 to
  // levels.json and the list here empties on its own.
  assert.deepEqual(orphanedLevelArt(LEVELS.map((l) => l.id)).sort(), [
    'enemy-bruiser', 'enemy-rooster', 'enemy-scrapper', 'enemy-sprinter',
  ], 'level art that no shipped level loads')
})
