import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_DIFFICULTY_ID, DIFFICULTIES, difficultyDef, difficultyName,
  resolveDifficultyId, startingLives, startingPeanuts,
} from '../src/systems/Difficulty.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const code = (p: string): string => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const RULES = read('rules')

/* ------------------------------------------------ the one that must not move */

test('normal is a literal no-op against the values the game shipped with', () => {
  /*
   * THE LOAD-BEARING TEST IN THIS FILE.
   *
   * Every win rate in SOAK-REPORT.md, every per-level number and the whole
   * 35-45% target band were measured against rules.json's values. They stay
   * valid only while the default difficulty changes NOTHING — not "changes
   * almost nothing", not "rounds to the same number today". A 1.05 lives
   * multiplier would round 20 to 21 and quietly invalidate four levels' worth
   * of tuning without failing anything else in this suite.
   *
   * Asserted against rules.json directly rather than against a copy of its
   * values, so a change to EITHER file breaks the identity and fails here.
   */
  assert.equal(DEFAULT_DIFFICULTY_ID, 'normal')
  const normal = difficultyDef('normal')
  assert.equal(normal.livesMultiplier, 1, 'normal no longer multiplies lives by exactly 1')
  assert.equal(normal.peanutsMultiplier, 1, 'normal no longer multiplies peanuts by exactly 1')

  // And the functions the game and the soak both call return the shipped
  // numbers unchanged, which is the property that actually matters — a
  // multiplier of 1 with a floor or a rounding step in the wrong place would
  // still move them.
  assert.equal(startingLives(RULES.startingLives, 'normal'), RULES.startingLives)
  assert.equal(startingPeanuts(RULES.startingPeanuts, 'normal'), RULES.startingPeanuts)

  // A player who has never chosen gets normal, so a save from before
  // difficulty existed plays exactly the game it always did.
  assert.equal(startingLives(RULES.startingLives, ''), RULES.startingLives)
  assert.equal(startingPeanuts(RULES.startingPeanuts, undefined), RULES.startingPeanuts)
  assert.equal(startingLives(RULES.startingLives, 'no-such-mode'), RULES.startingLives)
})

/* ------------------------------------------------------------- the data shape */

test('the three modes are declared whole, in order, and nothing is hardcoded', () => {
  assert.deepEqual(DIFFICULTIES.map((d) => d.id), ['lazy-dad', 'normal', 'try-hard'],
    'the modes changed; the selector draws this order, easiest first')
  for (const d of DIFFICULTIES) {
    assert.ok(d.name && d.name.length > 0, `${d.id} has no name`)
    assert.ok(d.blurb && d.blurb.length > 0, `${d.id} has no description`)
    for (const k of ['livesMultiplier', 'peanutsMultiplier'] as const) {
      assert.ok(typeof d[k] === 'number' && d[k] > 0, `${d.id}'s ${k} is not a positive number`)
    }
  }
  // ORDERED, EASIEST FIRST, on both axes. A "harder" mode that handed out more
  // lives than the one above it would be a selector that lies about itself.
  for (let i = 1; i < DIFFICULTIES.length; i++) {
    assert.ok(DIFFICULTIES[i]!.livesMultiplier < DIFFICULTIES[i - 1]!.livesMultiplier,
      `${DIFFICULTIES[i]!.id} is not harder than ${DIFFICULTIES[i - 1]!.id} on lives`)
    assert.ok(DIFFICULTIES[i]!.peanutsMultiplier < DIFFICULTIES[i - 1]!.peanutsMultiplier,
      `${DIFFICULTIES[i]!.id} is not harder than ${DIFFICULTIES[i - 1]!.id} on peanuts`)
  }
})

test('difficulty changes lives and peanuts and touches nothing else', () => {
  /*
   * THE DELIBERATE LIMIT, ENFORCED.
   *
   * Scaling enemy HP, damage, armour or wave timing would change WHICH TOWERS
   * ARE VIABLE rather than how hard a level is — the Grinder ignores armour
   * and the Slingshot cuts it, so a 30% armour bump makes one tower better and
   * another nearly useless — and it would mean soaking and tuning every level
   * three times instead of once.
   *
   * So the data may only carry these two knobs. A third would be caught here
   * before it reached a level's tuning.
   */
  const raw = read('difficulty')
  for (const m of raw.modes) {
    assert.deepEqual(Object.keys(m).sort(),
      ['blurb', 'id', 'livesMultiplier', 'name', 'peanutsMultiplier'],
      `${m.id} carries a knob that is not lives or peanuts`)
  }
  // And nothing in the module reaches for an enemy, a wave or a tower.
  const mod = code('systems/Difficulty.ts')
  for (const forbidden of ['enemies', 'waves', 'towers', 'armor', 'armour', 'health']) {
    assert.ok(!mod.includes(forbidden),
      `Difficulty.ts mentions ${forbidden}; it is meant to know about lives and money only`)
  }
})

/* ------------------------------------------------------------- the arithmetic */

test('the multipliers do what they say, and lives never reach zero', () => {
  assert.equal(startingLives(20, 'lazy-dad'), 40)
  assert.equal(startingLives(20, 'try-hard'), 10)
  assert.equal(startingPeanuts(100, 'lazy-dad'), 150)
  assert.equal(startingPeanuts(100, 'try-hard'), 75)

  // ROUNDED, not truncated: 0.5x of 25 is 12.5 and a run does not start with
  // half a life.
  assert.equal(startingLives(25, 'try-hard'), 13)

  // AND FLOORED AT ONE. A difficulty that could hand out zero lives would end
  // the run on the first leak before the player had done anything, which is
  // not a difficulty setting — it is a broken level.
  assert.equal(startingLives(1, 'try-hard'), 1)
  assert.equal(startingLives(0, 'lazy-dad'), 1)
  // Peanuts may legitimately reach zero; the opening-purse floor in
  // Economy.openingPurse is what guarantees the first tower is affordable, and
  // it is applied afterwards.
  assert.equal(startingPeanuts(0, 'try-hard'), 0)
})

test('an unknown id resolves to the default rather than throwing', () => {
  for (const bad of ['', null, undefined, 'LAZY-DAD', 'hardcore']) {
    assert.equal(resolveDifficultyId(bad), DEFAULT_DIFFICULTY_ID, `${String(bad)} did not resolve`)
  }
  assert.equal(difficultyName('try-hard'), 'Try Hard')
  assert.equal(difficultyName('nonsense'), difficultyName(DEFAULT_DIFFICULTY_ID))
})

/* ----------------------------------------------------------------- the wiring */

test('the run captures its difficulty once and never asks again', () => {
  /*
   * WHAT MAKES "IT CANNOT BE CHANGED ONCE A LEVEL HAS STARTED" TRUE.
   *
   * Not a flag anybody has to check: the value is read from the save on the
   * frame the level is created and stored on the run. Everything that shows it
   * or derives from it reads the RUN. A HUD that asked the save would show
   * whatever the setting is now, which is a different thing the moment
   * somebody changes it on the level select screen.
   */
  const game = code('scenes/GameScene.ts')
  assert.match(game, /this\.status\.difficultyId = resolveDifficultyId\(savedDifficulty\(\)\)/,
    'the run does not capture its difficulty')
  assert.equal((game.match(/savedDifficulty\(\)/g) ?? []).length, 1,
    'the game reads the saved difficulty more than once, so a mid-run change could reach it')
  assert.match(game, /startingLives\(RULES\.startingLives, this\.status\.difficultyId\)/,
    'starting lives are not scaled by the run\'s difficulty')
  assert.match(game, /startingPeanuts\(RULES\.startingPeanuts, this\.status\.difficultyId\)/,
    'starting peanuts are not scaled by the run\'s difficulty')

  // The HUD and the end screens read the RUN, never the save.
  const hud = code('scenes/HudScene.ts')
  assert.match(hud, /difficultyName\(s\.difficultyId\)/, 'the HUD does not show the difficulty')
  assert.ok(!/savedDifficulty|loadSave/.test(hud),
    'the HUD reads the save, so it would show a setting the run is not being played on')
  assert.match(game, /label: 'Difficulty', value: difficultyName\(this\.status\.difficultyId\)/,
    'the end screens do not say which difficulty the run was played on')
})

test('the run remembers how many lives it started with', () => {
  // `RULES.startingLives` stopped being the answer the moment a difficulty
  // could scale it. The results screen shows "17 of N" and the cake thresholds
  // are a fraction of it, so the run has to carry its own N — reading the
  // constant would tell a Lazy Dad player they had 17 of 20 when they had 17
  // of 40.
  const game = code('scenes/GameScene.ts')
  assert.match(game, /startingLives: number/, 'the run does not record its own starting lives')
  assert.match(game, /maxLives: this\.status\.startingLives/,
    'the run outcome is measured against the un-scaled constant')
  assert.ok(!/of \$\{RULES\.startingLives\}/.test(game),
    'the results screen still shows lives out of the un-scaled constant')
})

test('the setting is global, saved, and changed on the level select screen only', () => {
  const save = code('systems/Save.ts')
  assert.match(save, /difficultyId: string/, 'the save cannot remember a difficulty')
  assert.match(save, /export function setDifficulty/, 'nothing can change the difficulty')
  // GLOBAL, NOT PER LEVEL: one field, not a map keyed by level.
  assert.ok(!/difficultyByLevel|difficulties:/.test(save),
    'the difficulty is stored per level, which is not what global means')

  // Changed on the level select screen. Nowhere else may write it — a
  // mid-level settings dialog that could would break the capture-once rule.
  const map = code('scenes/WorldMapScene.ts')
  assert.match(map, /setDifficulty\(d\.id\)/, 'the level select screen cannot change the difficulty')
  for (const f of ['scenes/GameScene.ts', 'scenes/HudScene.ts', 'ui/SettingsPanel.ts']) {
    assert.ok(!/setDifficulty/.test(code(f)), `${f} can change the difficulty mid-level`)
  }
})

test('the harness drives the setting rather than only photographing it', () => {
  // The rule this checks is a WIRING rule — the run captures the difficulty
  // once — and a screenshot cannot see wiring. The scenario changes the save
  // under a live run and asserts the HUD does not move, which is the only
  // honest way to test "it cannot be changed once a level has started".
  //
  // Cited here for the same reason `screenspace.test.ts` cites the scrim
  // scenario: a source assertion is only worth making while the thing that
  // actually measures it is still there to run.
  const harness = readFileSync(url('../tools/harness/index.html'), 'utf8')
  assert.match(harness, /scenario === 'difficulty'/, 'the difficulty scenario is gone')
  assert.match(harness, /SAVE\.setDifficulty\('lazy-dad'\)/,
    'the scenario no longer changes the save mid-run, so it proves nothing about capture-once')
  assert.match(harness, /a mid-run change to the save reached the run/,
    'the scenario no longer fails when a mid-run change reaches the run')
})

test('the soak takes a difficulty and defaults to normal', () => {
  const sim = readFileSync(url('../tools/soak/Sim.ts'), 'utf8')
  assert.match(sim, /difficultyId: string = DEFAULT_DIFFICULTY_ID/,
    'the simulator cannot be pointed at a difficulty')
  assert.match(sim, /startingLives\(RULES\.startingLives, difficultyId\)/,
    'the simulator does not scale its lives')
  assert.match(sim, /startingPeanuts\(RULES\.startingPeanuts, difficultyId\)/,
    'the simulator does not scale its purse')
  // IT IMPORTS THE GAME'S OWN MODULE. A soak with its own copy of the
  // multipliers is a soak that can report on a game that does not exist.
  assert.match(sim, /from '\.\.\/\.\.\/src\/systems\/Difficulty\.ts'/,
    'the simulator has its own copy of the difficulty numbers')
})
