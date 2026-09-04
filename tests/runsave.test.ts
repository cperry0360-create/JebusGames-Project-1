import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clearRun, hasSavedRun, loadRun, RUN_SAVE_VERSION, saveRun, type SavedRun,
} from '../src/systems/RunSave.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

/**
 * A localStorage that behaves like the real one: string in, string out, and
 * nothing else. Node has none, and RunSave reads `globalThis.localStorage`
 * precisely so it can be given one here.
 */
class FakeStorage {
  private map = new Map<string, string>()
  getItem(k: string): string | null { return this.map.has(k) ? this.map.get(k)! : null }
  setItem(k: string, v: string): void { this.map.set(k, String(v)) }
  removeItem(k: string): void { this.map.delete(k) }
  get raw(): Map<string, string> { return this.map }
}

let store: FakeStorage
beforeEach(() => {
  store = new FakeStorage()
  ;(globalThis as any).localStorage = store
})

const RUN: Omit<SavedRun, 'version'> = {
  level: 'level1',
  wave: 6,
  lives: 17,
  peanuts: 240,
  towers: [
    { id: 'withholding', spot: 0, tier: 2, spec: null },
    { id: 'writeoff', spot: 3, tier: 3, spec: 'shear' },
  ],
  heroId: 'cory',
  abilities: ['scratchTicket'],
  openingTowers: ['withholding', 'writeoff'],
  reserveTowers: ['rounding', 'escalation'],
  unlockedTowers: ['withholding', 'writeoff', 'rounding'],
  seed: 12345,
}

/* --------------------------------------------------------------- round trip */

test('a run comes back the way it went in', () => {
  saveRun(RUN)
  assert.deepEqual(loadRun(), { ...RUN, version: RUN_SAVE_VERSION })
})

test('the things the brief named are all in the record', () => {
  saveRun(RUN)
  const back = loadRun()!
  assert.equal(back.level, 'level1', 'which level')
  assert.equal(back.wave, 6, 'wave number')
  assert.equal(back.lives, 17, 'lives')
  assert.equal(back.peanuts, 240, 'peanuts')
  assert.deepEqual(back.towers.map((t) => [t.id, t.spot, t.tier]),
    [['withholding', 0, 2], ['writeoff', 3, 3]], 'towers, their positions and their tiers')
})

test('there is a saved run only when there is a saved run', () => {
  assert.equal(hasSavedRun(), false)
  assert.equal(loadRun(), null)
  saveRun(RUN)
  assert.equal(hasSavedRun(), true)
  clearRun()
  assert.equal(hasSavedRun(), false)
  assert.equal(loadRun(), null)
})

test('the run lives under its own key, away from the permanent save', () => {
  saveRun(RUN)
  const keys = [...store.raw.keys()]
  assert.equal(keys.length, 1)
  assert.ok(!keys[0].includes('save'),
    `the run is stored at "${keys[0]}", which is the settings and unlocks key; a bad run record must not be able to take them with it`)
})

/* ----------------------------------------------------------------- versions */

test('the record carries a schema version, so a later shape can migrate', () => {
  saveRun(RUN)
  const written = JSON.parse(store.raw.get([...store.raw.keys()][0])!)
  assert.equal(written.version, RUN_SAVE_VERSION, 'the version is not written into the record')
  assert.equal(typeof written.version, 'number')
})

test('a record from an unknown version is declined, not misread', () => {
  saveRun(RUN)
  const key = [...store.raw.keys()][0]
  const rec = JSON.parse(store.raw.get(key)!)
  for (const version of [RUN_SAVE_VERSION + 1, RUN_SAVE_VERSION - 1, 'one', null, undefined]) {
    store.setItem(key, JSON.stringify({ ...rec, version }))
    assert.equal(loadRun(), null, `version ${String(version)} should not be read as v${RUN_SAVE_VERSION}`)
  }
})

/* ---------------------------------------------------------------- validation */

test('a malformed record is a fresh run, never a throw', () => {
  const key = 'courjahan.run'
  const junk = [
    'not json at all',
    '{',
    'null',
    '[]',
    '"a string"',
    '{"version":1}',
    JSON.stringify({ ...RUN, version: 1, wave: 'seven' }),
    JSON.stringify({ ...RUN, version: 1, wave: -1 }),
    JSON.stringify({ ...RUN, version: 1, lives: 0 }),
    JSON.stringify({ ...RUN, version: 1, lives: Number.NaN }),
    JSON.stringify({ ...RUN, version: 1, peanuts: -5 }),
    JSON.stringify({ ...RUN, version: 1, heroId: '' }),
    JSON.stringify({ ...RUN, version: 1, towers: 'none' }),
    JSON.stringify({ ...RUN, version: 1, towers: [{ id: 'withholding' }] }),
    JSON.stringify({ ...RUN, version: 1, towers: [{ id: 'withholding', spot: 1, tier: 0, spec: null }] }),
    JSON.stringify({ ...RUN, version: 1, abilities: [1, 2] }),
    JSON.stringify({ ...RUN, version: 1, openingTowers: 'withholding' }),
  ]
  for (const raw of junk) {
    store.setItem(key, raw)
    assert.doesNotThrow(() => loadRun(), `loadRun threw on ${raw.slice(0, 40)}`)
    assert.equal(loadRun(), null, `this should not have loaded: ${raw.slice(0, 60)}`)
  }
})

test('a record is taken whole or not at all', () => {
  // Half a run — one game's towers and another's peanuts — is worse than none.
  // Nothing is defaulted in: a field that fails takes the record with it.
  store.setItem('courjahan.run', JSON.stringify({ ...RUN, version: 1, peanuts: 'lots' }))
  assert.equal(loadRun(), null, 'a bad field was patched with a default instead of rejecting the record')
})

test('two towers on one pad is a record this game never wrote', () => {
  store.setItem('courjahan.run', JSON.stringify({
    ...RUN, version: 1,
    towers: [{ id: 'withholding', spot: 2, tier: 1, spec: null },
      { id: 'writeoff', spot: 2, tier: 1, spec: null }],
  }))
  assert.equal(loadRun(), null)
})

test('a run cannot be resumed with no lives left', () => {
  // Zero lives is a run that was lost, not one in progress.
  saveRun({ ...RUN, lives: 1 })
  assert.ok(loadRun(), 'one life is still a run')
  saveRun({ ...RUN, lives: 0 })
  assert.equal(loadRun(), null)
})

test('a hand-edited record cannot conjure an unbounded board', () => {
  const towers = Array.from({ length: 200 }, (_, i) => ({ id: 'withholding', spot: i, tier: 3, spec: null }))
  store.setItem('courjahan.run', JSON.stringify({ ...RUN, version: 1, towers }))
  assert.equal(loadRun(), null, 'two hundred towers is not a board this game can produce')
})

test('storage that is absent or refuses to write costs nothing', () => {
  // A private window, an embedded context, or a full quota. The game keeps
  // going; it simply does not remember.
  ;(globalThis as any).localStorage = undefined
  assert.doesNotThrow(() => saveRun(RUN))
  assert.equal(loadRun(), null)
  assert.equal(hasSavedRun(), false)
  assert.doesNotThrow(() => clearRun())
  ;(globalThis as any).localStorage = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') },
    removeItem() { throw new Error('blocked') },
  }
  assert.doesNotThrow(() => saveRun(RUN))
  assert.equal(loadRun(), null)
  assert.doesNotThrow(() => clearRun())
})

/* -------------------------------------------------------------- the wiring */

test('the run is written on discrete events and never per frame', () => {
  const game = src('scenes/GameScene.ts')
  // The three the brief named, plus the two other ways the board changes.
  const waveEnd = /private checkWaveOver\([\s\S]*?\n  \}/.exec(game)!
  assert.match(waveEnd[0], /this\.saveProgress\(\)/, 'a completed wave is not saved')
  const place = /private place\([\s\S]*?\n  \}/.exec(game)!
  assert.match(place[0], /this\.onBoardChanged\(\)/, 'a built tower is not saved')
  const upgrade = /private upgradeTower\([\s\S]*?\n  \}/.exec(game)!
  assert.match(upgrade[0], /this\.saveProgress\(\)/, 'a bought upgrade is not saved')
  const sell = /private sellTower\([\s\S]*?\n  \}/.exec(game)!
  assert.match(sell[0], /this\.onBoardChanged\(\)/, 'a sold tower is not saved')

  // And NOT from the frame loop. A synchronous localStorage write per frame is
  // the failure mode this rule exists to prevent.
  const update = /\n  update\(([\s\S]*?)\n  \}/.exec(game)!
  assert.ok(!/saveProgress|onBoardChanged|saveRun\(/.test(update[1]),
    'the run is being written from update(); that is a JSON.stringify every frame')
})

test('a finished run is cleared, won or lost', () => {
  const game = src('scenes/GameScene.ts')
  const end = /endRun\(phase: 'won' \| 'lost'\): void \{[\s\S]*?\n  \}/.exec(game)!
  assert.match(end[0], /clearRun\(\)/, 'a finished run stays on offer at the title screen')
  // Before the win is recorded, and unconditionally: both endings clear it.
  assert.ok(end[0].indexOf('clearRun()') < end[0].indexOf('if (won)'),
    'the record is cleared only on one of the two endings')
  // And a snapshot cannot be written back after the run is over.
  const save = /private saveProgress\(\): void \{[\s\S]*?\n  \}/.exec(game)!
  assert.match(save[0], /phase === 'won' \|\| this\.status\.phase === 'lost'/,
    'saveProgress would happily write a finished run back')
})

test('the title screen offers the run rather than resuming it behind the player', () => {
  const title = src('scenes/TitleScene.ts')
  assert.match(title, /loadRun\(\)/, 'the title screen never looks for a saved run')
  assert.match(title, /RESUME/, 'nothing offers the run back')
  // Starting a new one throws the old one away, or the offer outlives the run.
  const start = /private start\(\): void \{[\s\S]*?\n  \}/.exec(title)!
  assert.match(start[0], /clearRun\(\)/, 'starting a new run leaves the old one on offer')
  assert.match(start[0], /resumeFrom: null/, 'a new run could inherit the last resume')

  // GameScene must not decide this for itself: it would resume a run the
  // player declined by pressing NEW RUN.
  const game = src('scenes/GameScene.ts')
  assert.ok(!/\bloadRun\(/.test(game.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')),
    'GameScene reads the saved run directly instead of being handed it')
  assert.match(game, /run\.resumeFrom/, 'GameScene never picks up a handed-over run')
})

test('a resume is consumed once, and clamped to a wave that exists', () => {
  const game = src('scenes/GameScene.ts')
  const restore = /private restoreRun\(saved: SavedRun\): void \{[\s\S]*?\n  \}/.exec(game)!
  assert.match(game, /setRunState\(\{ resumeFrom: null \}\)/,
    'restarting the scene would restore the same board again')
  assert.match(restore[0], /Math\.min\(saved\.wave, this\.level\.waveTable\.waves\.length - 1\)/,
    'a wave index past the end of the table would read an undefined wave')
  assert.match(restore[0], /restoreTier/, 'towers come back at tier 1 whatever they were')
  assert.match(restore[0], /this\.build\.occupy/, 'restored towers do not claim their pads')

  // A tower whose id or pad no longer exists is skipped, not thrown on.
  assert.match(restore[0], /if \(!def \|\| !this\.build\.isFree\(t\.spot\)\) continue/,
    'a stale tower id would take the scene down on create')
})

test('a restored tier costs nothing and takes no time', () => {
  const tower = src('entities/Tower.ts')
  const restore = /restoreTier\(tier: number, spec: string \| null\): void \{[\s\S]*?\n  \}/.exec(tower)!
  assert.ok(!/buildLeft|beginUpgrade|popIn/.test(restore[0]),
    'a restored tower is re-running the build it already paid for')
  assert.match(restore[0], /wearTier\(false\)/, 'a restored tower does not wear its tier')
  assert.match(restore[0], /maxTier/, 'a hand-edited tier could go past the top of the tree')
})
