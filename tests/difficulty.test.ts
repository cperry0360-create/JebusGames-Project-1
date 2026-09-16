import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  abilityCooldown, DEFAULT_DIFFICULTY_ID, DIFFICULTIES, difficultyDef, difficultyName,
  enemyHealth, heroRespawnSeconds, peanutIncome, resolveDifficultyId,
  startingLives, startingPeanuts, waveInterval,
} from '../src/systems/Difficulty.ts'

/**
 * EVERY KNOB, and the list is the contract rather than a convenience.
 *
 * `lives` and `peanuts` were the whole list until Lazy Dad Mode was made
 * genuinely easy. The five that follow are the ones that mode needed, and the
 * rule that keeps the rest of the repository true is that ALL FIVE ARE 1 ON
 * `normal` AND ON `try-hard` -- see the no-op test below, which is what
 * actually enforces it.
 */
const KNOBS = [
  'livesMultiplier', 'peanutsMultiplier', 'peanutIncomeMultiplier',
  'waveIntervalMultiplier', 'heroRespawnMultiplier', 'abilityCooldownMultiplier',
  'enemyHealthMultiplier',
] as const

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

  /*
   * AND THE FIVE KNOBS LAZY DAD MODE ADDED, on normal AND on try-hard.
   *
   * Try Hard is in here with normal deliberately. Its published behaviour is
   * "half the lives, a thin purse, and the same enemies"; it has never been
   * soaked for anything else, so a knob that moved on it would invalidate a
   * mode nobody re-measured.
   *
   * The values are chosen to catch a rounding rather than only a multiplier:
   * 32.5 seconds and 7 peanuts do not survive a `Math.round(x * 1.0)` that was
   * written for the wrong unit, and 0.5 of a second is what an ability
   * cooldown actually looks like.
   */
  for (const id of ['normal', 'try-hard'] as const) {
    const def = difficultyDef(id)
    for (const k of KNOBS.slice(2)) {
      assert.equal(def[k], 1, `${id}'s ${k} is not exactly 1`)
    }
    assert.equal(peanutIncome(7, id), 7, `${id} moved the kill bounty`)
    assert.equal(waveInterval(RULES.pacing.readySeconds, id), RULES.pacing.readySeconds,
      `${id} moved the gap between waves`)
    assert.equal(heroRespawnSeconds(32.5, id), 32.5, `${id} moved the hero's revive`)
    assert.equal(abilityCooldown(0.5, id), 0.5, `${id} moved an ability cooldown`)
    assert.equal(enemyHealth(26000, id), 26000, `${id} moved Vlaude's health`)
    assert.equal(enemyHealth(7, id), 7, `${id} moved a small enemy's health`)
  }
})

/* ------------------------------------------------------------- the data shape */

test('the three modes are declared whole, in order, and nothing is hardcoded', () => {
  assert.deepEqual(DIFFICULTIES.map((d) => d.id), ['lazy-dad', 'normal', 'try-hard'],
    'the modes changed; the selector draws this order, easiest first')
  for (const d of DIFFICULTIES) {
    assert.ok(d.name && d.name.length > 0, `${d.id} has no name`)
    assert.ok(d.blurb && d.blurb.length > 0, `${d.id} has no description`)
    for (const k of KNOBS) {
      assert.ok(typeof d[k] === 'number' && d[k] > 0, `${d.id}'s ${k} is not a positive number`)
    }
  }
  // ORDERED, EASIEST FIRST, ON THE TWO AXES ALL THREE MODES USE. The other
  // five are 1 on two of the three modes, so a strict ordering is not
  // available on them and asking for one would be asking for a tie to fail.
  // What holds them is the no-op test above.
  for (let i = 1; i < DIFFICULTIES.length; i++) {
    assert.ok(DIFFICULTIES[i]!.livesMultiplier < DIFFICULTIES[i - 1]!.livesMultiplier,
      `${DIFFICULTIES[i]!.id} is not harder than ${DIFFICULTIES[i - 1]!.id} on lives`)
    assert.ok(DIFFICULTIES[i]!.peanutsMultiplier < DIFFICULTIES[i - 1]!.peanutsMultiplier,
      `${DIFFICULTIES[i]!.id} is not harder than ${DIFFICULTIES[i - 1]!.id} on peanuts`)
  }
})

test('the knob list is exactly the seven, and the three forbidden ones are absent', () => {
  /*
   * THE DELIBERATE LIMIT, ENFORCED — AND IT MOVED ONCE, ON PURPOSE.
   *
   * This used to assert that a mode carried lives and peanuts and nothing
   * else, on the reasoning that any other scalar would change WHICH TOWERS ARE
   * VIABLE rather than how hard a level is, and would force every level to be
   * tuned three times.
   *
   * HALF OF THAT SURVIVES AND IS ASSERTED BELOW. There is no armour scalar, no
   * enemy damage scalar and no enemy speed scalar. Those are the three the
   * objection is actually about: the Grinder ignores armour and the Slingshot
   * cuts it, so scaling armour makes one tower better and another nearly
   * useless and the draft decides the run before the player does.
   *
   * THE OTHER HALF DID NOT. "Every level would have to be tuned three times"
   * is a statement about a target band, and only `normal` has one. Lazy Dad
   * Mode is for a young child; it was soaked once to find where it lands and
   * then left. So the list is seven, it is closed, and an eighth still has to
   * come through here.
   */
  const raw = read('difficulty')
  for (const m of raw.modes) {
    assert.deepEqual(Object.keys(m).sort(), ['blurb', 'id', 'name', ...KNOBS].sort(),
      `${m.id} does not carry exactly the seven knobs`)
  }
  // THE THREE THAT MUST NEVER EXIST, checked on the data rather than on the
  // module's prose — a comment explaining why there is no armour scalar would
  // otherwise fail a test looking for the word.
  for (const m of raw.modes) {
    for (const k of Object.keys(m)) {
      assert.ok(!/armou?r|damage|speed/i.test(k),
        `${m.id} carries ${k}; armour, enemy damage and enemy speed are the three that change `
        + 'which towers are viable rather than how hard a level is')
    }
  }
  // And the module still reaches for no tower and no wave table.
  const mod = code('systems/Difficulty.ts')
  for (const forbidden of ['towers.json', 'enemies.json', 'waves.json', 'levelRules']) {
    assert.ok(!mod.includes(forbidden),
      `Difficulty.ts reads ${forbidden}; it is meant to be arithmetic on a multiplier`)
  }
})

/* ------------------------------------------------------------- the arithmetic */

test('the multipliers do what they say, and lives never reach zero', () => {
  // TRY HARD'S TWO ARE LITERALS because they are published in its blurb --
  // "half the lives, a thin purse" -- and a retune of that mode should have to
  // come through here. LAZY DAD'S ARE READ OFF THE DATA, because that mode is
  // tuned against a soak rather than against a sentence, and pinning its
  // numbers here would mean every retune edited a test to say what it already
  // said. What is fixed for it is the direction, asserted below.
  assert.equal(startingLives(20, 'try-hard'), 10)
  assert.equal(startingPeanuts(100, 'try-hard'), 75)
  const lazy = difficultyDef('lazy-dad')
  assert.equal(startingLives(20, 'lazy-dad'), Math.round(20 * lazy.livesMultiplier))
  assert.equal(startingPeanuts(100, 'lazy-dad'), Math.round(100 * lazy.peanutsMultiplier))
  assert.ok(lazy.livesMultiplier > 1 && lazy.peanutsMultiplier > 1,
    'Lazy Dad Mode is not easier than normal on lives and purse')

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

test('the five Lazy Dad knobs do what they say', () => {
  // The shipped values, asserted against the data rather than against a copy,
  // so a retune moves the expectation with the number. What is fixed here is
  // the DIRECTION of each one and the rounding rule.
  const lazy = difficultyDef('lazy-dad')
  assert.ok(lazy.peanutIncomeMultiplier > 1, 'Lazy Dad pays no more for a kill')
  assert.ok(lazy.waveIntervalMultiplier > 1, 'Lazy Dad gives no longer to think between waves')
  assert.ok(lazy.heroRespawnMultiplier < 1, 'Lazy Dad does not bring the hero back sooner')
  assert.ok(lazy.abilityCooldownMultiplier < 1, 'Lazy Dad does not recharge abilities sooner')
  assert.ok(lazy.enemyHealthMultiplier < 1, 'Lazy Dad does not make anything softer')

  // ROUNDED, because a peanut and a hit point are counted.
  assert.equal(peanutIncome(10, 'lazy-dad'), Math.round(10 * lazy.peanutIncomeMultiplier))
  assert.equal(enemyHealth(26000, 'lazy-dad'), Math.round(26000 * lazy.enemyHealthMultiplier))
  // NOT ROUNDED, because seconds are not.
  assert.equal(waveInterval(15, 'lazy-dad'), 15 * lazy.waveIntervalMultiplier)
  assert.equal(heroRespawnSeconds(25, 'lazy-dad'), 25 * lazy.heroRespawnMultiplier)
  assert.equal(abilityCooldown(32.5, 'lazy-dad'), 32.5 * lazy.abilityCooldownMultiplier)

  // UNIFORM, bosses included. The two levels this mode exists for both fail on
  // a boss DPS check, so a scalar that spared bosses would leave them exactly
  // as they were.
  assert.ok(enemyHealth(26000, 'lazy-dad') < 26000, 'Vlaude is not softened')
  assert.ok(enemyHealth(40, 'lazy-dad') < 40, 'a small enemy is not softened')

  // FLOORED AT ONE, so no multiplier can produce an enemy that is already dead.
  assert.equal(enemyHealth(1, 'lazy-dad'), 1)
  // EXCEPT FOR A DEF WITH NO HEALTH AT ALL, which stays 0. `EnemyDef.maxHealth`
  // is nullable so an unfinished level's boss can exist as data before its
  // number does, and a 0 quietly becoming a 1 would hide it.
  assert.equal(enemyHealth(0, 'lazy-dad'), 0)
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

  // THE FIVE NEW KNOBS, EACH AT ITS ONE SITE. A knob in the data that nothing
  // reads is a blurb that lies, and this file is where that gets caught.
  assert.match(game, /waveInterval\(RULES\.pacing\.readySeconds, this\.status\.difficultyId\)/,
    'the gap between waves is not scaled by the difficulty')
  assert.match(game, /peanutIncome\(enemy\.def\.peanutReward, this\.status\.difficultyId\)/,
    'the kill bounty is not scaled by the difficulty')
  assert.match(game, /abilityCooldown\(seconds, this\.status\.difficultyId\)/,
    'ability cooldowns are not scaled by the difficulty')
  assert.match(game, /enemyHealFor|enemyHealthFor = \(base: number\): number => enemyHealth\(base, this\.status\.difficultyId\)/,
    'enemy health is not scaled by the difficulty')
  assert.match(game, /this\.hero\.reviveSecondsFor = /,
    'the hero\'s revive is not scaled by the difficulty')

  // THE WAVE-CLEAR BOUNTY IS NOT SCALED, and that is a decision rather than an
  // oversight: it is paid for surviving rather than for shooting.
  assert.ok(!/peanutIncome\(RULES\.peanutsPerWaveCleared/.test(game),
    'the wave-clear bounty is being scaled by the difficulty')

  // ENEMY HEALTH IS FIXED IN THE CONSTRUCTOR AND READ OFF THE SCENE, which is
  // what makes it impossible for one of the seven `new Enemy(` sites to forget
  // it. If that ever becomes an option bag, this is the test that should be
  // rewritten rather than deleted.
  const enemy = code('entities/Enemy.ts')
  assert.match(enemy, /enemyHealthFor/, 'Enemy does not ask the scene what health is worth')
  assert.ok(!/difficulty/i.test(enemy),
    'Enemy reads the difficulty itself rather than being handed a function')

  // THE GAME SCREEN DOES NOT SHOW IT AT ALL ANY MORE, and that is the point of
  // this pair rather than a gap in it. It printed the mode name in dim text at
  // the left end of the second row, over the map, for the whole run -- the
  // same class of thing as the hero's name and the DAD MODE badge, both taken
  // off this screen earlier for the same reason: a fact chosen BEFORE the
  // level and unable to change during it does not need a permanent readout on
  // the board. It is on the level select screen, where it is chosen, and on
  // the results dialog, where the run is being scored.
  //
  // The save rule still holds and is the half that would be a bug: whatever
  // does show it must read the RUN.
  const hud = code('scenes/HudScene.ts')
  assert.ok(!/difficultyName/.test(hud),
    'the difficulty label is back on the game screen')
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

  // THE FOUR OF THE FIVE THE SIMULATOR CAN SEE.
  assert.match(sim, /enemyHealth\(def\?\.maxHealth \?\? 0, difficultyId\)/,
    'the simulator does not scale enemy health')
  assert.match(sim, /peanutIncome\(e\.def\.peanutReward, difficultyId\)/,
    'the simulator does not scale the kill bounty')
  assert.match(sim, /abilityCooldown\(ABILITIES\[id\]\.cooldown, difficultyId\)/,
    'the simulator does not scale ability cooldowns')
  assert.match(sim, /heroRespawnSeconds\(hero\.reviveSeconds, difficultyId\)/,
    'the simulator does not scale the hero\'s revive')

  // AND THE FIFTH, WHICH IT CANNOT. There is no ready phase in the simulator
  // at all -- its builder spends at the wave boundary and the next wave begins
  // on the next line -- so `waveIntervalMultiplier` is invisible to every win
  // rate it reports. That is a modelling gap and it is documented as one; this
  // asserts the documentation is still there, because a Lazy Dad figure quoted
  // without it is a figure quoted without its biggest missing term.
  assert.ok(!/waveInterval\(/.test(sim),
    'the simulator now scales the wave interval, which means it grew a ready phase')
  assert.match(sim, /AND THEREFORE NEITHER DOES `waveIntervalMultiplier`/,
    'the simulator no longer says that it cannot see the wave interval knob')
})
