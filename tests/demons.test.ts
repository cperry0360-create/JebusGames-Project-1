import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const enemies = read('enemies'), art = read('art')

/**
 * The three demons, as handed over.
 *
 * Every number here came with the brief. They are repeated rather than read
 * back out of enemies.json, so a stray edit to a stat has to argue with a
 * test instead of passing silently — which is the whole reason balance lives
 * in JSON in the first place.
 */
const BRIEF = {
  directReport: {
    name: 'Underling', role: 'fast', tier: 'basic', sprite: 'enemy-demon-junior',
    maxHealth: 52, armor: 0, speed: 104, peanutReward: 8,
    livesCost: 1, damage: 5, attackInterval: 0.8, blockable: true,
  },
  middleManager: {
    name: 'Middle Manager', role: 'armored', tier: 'elite', sprite: 'enemy-demon-manager',
    maxHealth: 185, armor: 5, speed: 38, peanutReward: 21,
    livesCost: 2, damage: 14, attackInterval: 1.4, blockable: true,
  },
  theDevil: {
    name: 'The Devil', role: 'boss', tier: 'boss', sprite: 'enemy-devil',
    maxHealth: 6200, armor: 4, speed: 26, peanutReward: 1200,
    livesCost: 12, damage: 0, attackInterval: 99, blockable: false,
  },
} as const

test('the three demons are in enemies.json exactly as they were specified', () => {
  for (const [id, spec] of Object.entries(BRIEF)) {
    const e = enemies[id]
    assert.ok(e, `${id} is not in enemies.json`)
    for (const [field, value] of Object.entries(spec)) {
      assert.equal(e[field], value, `${id}.${field} is ${e[field]}, not ${value}`)
    }
    assert.ok(e.flavor && e.flavor.length > 0, `${id} has no flavor line`)
  }
})

test('each demon is registered under the sprite key it was asked for', () => {
  const EXPECTED: Record<string, string> = {
    'enemy-demon-junior': 'enemies/demon_direct_report.webp',
    'enemy-demon-manager': 'enemies/demon_middle_manager.webp',
    'enemy-devil': 'enemies/demon_the_devil.webp',
  }
  for (const [key, path] of Object.entries(EXPECTED)) {
    assert.equal(art.files[key], path, `${key} does not point at ${path}`)
    assert.ok(existsSync(url(`../public/${art.assetRoot}${path}`)), `${path} is missing from public/assets`)
    const cfg = art.render[key]
    assert.ok(cfg, `${key} has no render entry, so it would draw at its raw source size`)
    assert.equal(cfg.anchorY, 1.0, `${key} does not stand on the ground line`)
  }
})

test('a demon is measured against its own source art, not a shared canvas size', () => {
  // The sizes were derived by tools/measure_art.py from these three files, and
  // contentWidth/contentHeight are SOURCE extents: fitInBox divides by them, so
  // a re-export that changes the canvas silently invalidates every box that
  // reads them. This is the check that catches a stale pair.
  const SOURCE: Record<string, [number, number]> = {
    'enemy-demon-junior': [509, 550],
    'enemy-demon-manager': [734, 698],
    'enemy-devil': [434, 697],
  }
  for (const [key, [w, h]] of Object.entries(SOURCE)) {
    const cfg = art.render[key]
    assert.equal(cfg.contentWidth, w, `${key} contentWidth is stale`)
    assert.equal(cfg.contentHeight, h, `${key} contentHeight is stale`)
    // Three near-identical canvases, three different on-screen heights: proof
    // that the canvas is not what is deciding how big any of them looks.
    assert.notEqual(cfg.displayHeight / cfg.contentHeight, art.render['enemy-notice'].displayHeight / 226)
  }
  const manager = art.render['enemy-demon-manager'], devil = art.render['enemy-devil']
  assert.ok(Math.abs(manager.contentHeight - devil.contentHeight) <= 1,
    'this test assumes the manager and the devil were drawn on canvases of the same height')
  assert.notEqual(manager.displayHeight, devil.displayHeight,
    'two demons drawn on the same canvas height came out the same size on screen, which means the canvas placed them')
})

test('the demons carry enough source pixels for the zoom they are drawn at', () => {
  // CLAUDE.md rule 7: source height >= world height x maxZoom x devicePixelRatio.
  // maxZoom 2.37, dpr capped at 3 by Resolution.ts, so the multiplier is 7.11.
  const NEED = 2.37 * 3
  for (const key of ['enemy-demon-junior', 'enemy-demon-manager', 'enemy-devil']) {
    const cfg = art.render[key]
    assert.ok(cfg.contentHeight >= cfg.displayHeight * NEED,
      `${key} has ${cfg.contentHeight}px of source for ${cfg.displayHeight} world px; ` +
      `rule 7 wants ${Math.ceil(cfg.displayHeight * NEED)}px or the GPU magnifies it`)
  }
})

test('The Devil summons, and has grown nothing else', () => {
  // This used to assert he had NO mechanic at all, because "no new mechanics"
  // was the brief when he was added. Summoning was asked for later and
  // explicitly — cap 6, one directReport every 5 seconds — so the assertion
  // that survives is the one still worth making: he has the mechanic he was
  // given and none he was not.
  const d = enemies.theDevil as any
  assert.equal(d.tax, undefined, 'The Devil has grown a tax')
  for (const field of ['spawns', 'summon', 'ability', 'phases', 'aura', 'shield']) {
    assert.equal(d[field], undefined, `The Devil has grown a "${field}" mechanic`)
  }
  assert.deepEqual(d.summons, { enemy: 'directReport', count: 1, interval: 5, cap: 6 },
    'The Devil no longer summons what he was asked to')
  assert.ok(enemies[d.summons.enemy], 'The Devil summons an enemy that does not exist')

  // The field list, plus the two that were added on purpose. `artFacing` is
  // one of them: every enemy declares which way its art is drawn now, because
  // Enemy.ts used to assume "right" for all of them and level 3's five are all
  // drawn facing left.
  assert.deepEqual(Object.keys(d).sort(),
    [...Object.keys(BRIEF.theDevil), 'flavor', 'summons', 'artFacing'].sort(),
    'The Devil carries fields nobody asked for')
})
