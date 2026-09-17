// LEVEL 10, AI OVERRIDE PART 2 -- the rules, asked directly.
//
// WHAT THIS FILE CAN AND CANNOT SAY. It imports systems/Vlaude.ts for real and
// executes it, the way levelart.test.ts imports LevelArt.ts, so every assertion
// below is about code that ran. It says NOTHING about a rendered frame: no test
// in tests/ imports Phaser, and the harness in tools/harness/ is the only thing
// that looks at a pixel. Where the brief asks for something to be verified from
// a frame, that verification is the harness's and this file only holds the rule
// the frame is supposed to show.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  POWERS, armedAt, berthSprite, buildable, combinationProblems, copyCount,
  copyTargets, defeatReachedFade, defeatSpriteFrames, effectSheetKeys,
  hasteMultiplier, hasteSeconds, HASTE_OFF, leakEndsRun, lockTargets,
  lockedPadStillFires, parked, phaseForWave, targetable, tickSchedule,
  vlaudeRules, wallLook, weaponPad, whiteWashMs,
  type Lockable, type PowerId,
} from '../src/systems/Vlaude.ts'
import { levelRules, loadLevel, LEVELS } from '../src/systems/Levels.ts'
import { levelArtKeys } from '../src/systems/LevelArt.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const art = read('art')
const enemies = read('enemies')
const waves10 = read('waves.level10')
const map10 = read('map_level10')

const RULES = vlaudeRules(levelRules('level10'))
const R = RULES!

test('level 10 has a rules block and the other nine do not', () => {
  assert.ok(RULES, 'level 10 has no vlaude rules; every system below is a no-op')
  for (const l of LEVELS) {
    if (l.id === 'level10') continue
    assert.equal(vlaudeRules(levelRules(l.id)), null,
      `${l.id} answers a vlaude rules block, so level 10's mechanics would run on it`)
  }
  // THE COLLISION THAT COST A BOARD, ASSERTED FROM BOTH SIDES.
  //
  // Level 10's wave thresholds were called `phases` for an hour. That is also
  // level 5's key for the day/night flip, and NightRules.from returned a live
  // object for any level carrying it -- so level 10 got a sky with no `day` in
  // it and threw on `phases.day.tint` before the board finished building. No
  // test could see it, because nothing in tests/ constructs a scene; the
  // harness said "level10: the level did not build".
  //
  // Level 10's block is `vlaudePhases` now. Both halves are held here: level 5
  // still owns `phases`, level 10 does not have one, and NightRules answers
  // null for level 10.
  assert.ok((levelRules('level5') as { phases?: unknown })?.phases,
    'level 5 lost its own phases block, so this test is no longer proving anything')
  assert.equal((levelRules('level10') as { phases?: unknown })?.phases, undefined,
    'level 10 has a `phases` block again, which NightRules will read as a sky')
  assert.ok((levelRules('level10') as { vlaudePhases?: unknown })?.vlaudePhases,
    'level 10 has no vlaudePhases block')
})

/* ------------------------------------------------ phases advance on waves */

test('the phases advance on WAVES SURVIVED, never on his health', () => {
  // The rule the level is built on: he cannot be damaged for two of the three
  // phases, so there is no health for a threshold to read.
  const p = R.phases
  assert.ok(p.chatFromWave < p.codeFromWave && p.codeFromWave < p.damagedFromWave,
    'the thresholds are not in order')
  assert.equal(phaseForWave(R, 1), 'chat')
  assert.equal(phaseForWave(R, p.codeFromWave - 1), 'chat')
  assert.equal(phaseForWave(R, p.codeFromWave), 'code')
  assert.equal(phaseForWave(R, p.damagedFromWave - 1), 'code')
  assert.equal(phaseForWave(R, p.damagedFromWave), 'damaged')
  assert.equal(phaseForWave(R, waves10.waves.length), 'damaged')
  // Monotonic: a phase never goes backwards however many waves are played.
  let seen = 0
  const rank = { chat: 0, code: 1, damaged: 2 }
  for (let w = 1; w <= waves10.waves.length + 5; w++) {
    const r = rank[phaseForWave(R, w)]
    assert.ok(r >= seen, `phase went backwards at wave ${w}`)
    seen = r
  }
  // AND NO THRESHOLD READS A HEALTH VALUE. Asserted against the source rather
  // than inferred: the whole point is that `phaseForWave` takes a wave and
  // nothing else, so a future change that reached for the boss's health would
  // have to change its signature.
  const src = readFileSync(url('../src/systems/Vlaude.ts'), 'utf8')
  const fn = /export function phaseForWave[\s\S]*?\n\}/.exec(src)![0]
  assert.ok(!/health/i.test(fn), 'phaseForWave reads a health value')
})

test('he is parked and untargetable in phases 1 and 2, and on the lane in 3', () => {
  assert.equal(parked('chat'), true)
  assert.equal(parked('code'), true)
  assert.equal(parked('damaged'), false)
  // NOTHING MAY DAMAGE HIM UNTIL HE TOUCHES THE LANE, and there are two ways
  // for that to be false: parked at the core, or mid-float. Both are checked.
  assert.equal(targetable('chat', false), false, 'the chat form can be damaged')
  assert.equal(targetable('code', false), false, 'the code form can be damaged')
  assert.equal(targetable('damaged', true), false, 'he can be damaged mid-float')
  assert.equal(targetable('damaged', false), true, 'he cannot be damaged on the lane')
  assert.equal(R.float.invulnerable, true, 'the float is not invulnerable')
})

test('each phase wears its own art, and the three are pinned to one height', () => {
  assert.equal(berthSprite(R, 'chat'), 'enemy-vlaude')
  assert.equal(berthSprite(R, 'code'), 'enemy-vlaude-code')
  assert.equal(berthSprite(R, 'damaged'), null, 'the damaged form is an enemy, not a berth sprite')
  assert.equal(enemies[R.laneEnemy].sprite, 'enemy-vlaude-damaged')
  // THE PIN. All three render entries carry the same displayHeight, so a form
  // swap cannot resize him. The sources are 1478, 1494 and 1489 px tall and a
  // swap that scaled from source would shrink him by 60% mid-fight.
  const heights = ['enemy-vlaude', 'enemy-vlaude-code', 'enemy-vlaude-damaged']
    .map((k) => art.render[k].displayHeight)
  assert.deepEqual(heights, [200, 200, 200], 'the three forms are not pinned to one height')
  assert.equal(R.displayHeight, 200, 'the rules file disagrees with art.json about his height')
})

test('he hovers, by level 5\'s rule and not a parallel one', () => {
  assert.equal(enemies[R.laneEnemy].glides, true, 'Vlaude does not hover')
  assert.equal(enemies[R.laneEnemy].layer, undefined,
    'Vlaude is on an air layer, so a ground-only tower could not shoot him')
  // THE TEST THE BRIEF ASKS FOR, in its own terms: everything that can hit a
  // Glider can hit him. A Glider carries `glides` and no `layer`, and those two
  // facts together are what "every tower may shoot it" means in this engine.
  assert.equal(enemies.glider.glides, true)
  assert.equal(enemies.glider.layer, undefined)
  const g = (levelRules('level10') as { gliding?: Record<string, unknown> }).gliding
  assert.ok(g, 'level 10 has no gliding block, so `glides` would do nothing')
  const five = (levelRules('level5') as { gliding?: Record<string, unknown> }).gliding!
  for (const k of ['ignoresGroundSlow', 'ignoresGroundHazards']) {
    assert.equal(g![k], five[k], `level 10's ${k} disagrees with level 5's`)
  }
})

/* --------------------------------------------------------- the six powers */

test('six powers, and the two that were cut are cut', () => {
  assert.equal(POWERS.length, 6)
  assert.deepEqual([...POWERS].sort(), [
    'buildLock', 'createEnemies', 'duplicateEnemy',
    'generateWall', 'generateWeapon', 'speedAlter',
  ])
  // ROUTE SWITCHING AND TOWER COST MANIPULATION ARE NOT POWERS, and the plate
  // is the reason for the first: tools/trace_level10.py reports zero enclosed
  // regions in the painted band, so there is one lane and no fork to switch
  // between. Asserted against the map rather than against a memory of it.
  assert.equal(map10.lanes, undefined, 'level 10 grew a second lane')
  assert.equal(map10.mainMerge, undefined, 'level 10 grew a merge')
  const rulesText = readFileSync(url('../src/data/level10.json'), 'utf8')
  assert.ok(!/"routeSwitch|"towerCost/.test(rulesText),
    'a cut power is back in the rules file')
  for (const id of POWERS) {
    assert.ok(R.powers[id], `${id} has no numbers in level10.json`)
  }
})

test('one power at a time, and a combination introduces neither half', () => {
  const first = new Map<PowerId, number>()
  for (const row of R.schedule) {
    if (!first.has(row.power)) first.set(row.power, row.fromWave)
  }
  // EVERY POWER IS INTRODUCED ALONE. The row that first switches a power on
  // must not also fire a second one.
  for (const row of R.schedule) {
    if (row.with && first.get(row.power) === row.fromWave) {
      assert.fail(`${row.power} is introduced on wave ${row.fromWave} in a combination`)
    }
  }
  // AND NO TWO POWERS ARRIVE ON THE SAME WAVE.
  const introWaves = [...first.values()]
  assert.equal(new Set(introWaves).size, introWaves.length,
    'two powers are introduced on the same wave')
  assert.deepEqual(combinationProblems(R), [])
  // All six are actually reached inside the level's wave count.
  const last = waves10.waves.length
  for (const id of POWERS) {
    assert.ok((first.get(id) ?? Infinity) <= last,
      `${id} is scheduled for wave ${first.get(id)}, past the level's ${last}`)
  }
})

test('the schedule is authored, cooled down and capped -- not free randomness', () => {
  const src = readFileSync(url('../src/systems/Vlaude.ts'), 'utf8')
  assert.ok(!/Math\.random/.test(src), 'the manipulation schedule rolls dice')
  assert.ok(R.globalCooldownSeconds > 0, 'there is no floor between two telegraphs')
  for (const row of R.schedule) assert.ok(row.everySeconds > 0, `${row.power} has no cooldown`)

  // THE GLOBAL COOLDOWN DELAYS A POWER, IT DOES NOT DROP ONE. A row that comes
  // up while the floor is still running keeps its readiness and fires as soon
  // as the floor lifts, which is the difference between pacing a mechanic and
  // losing it.
  const armed = armedAt(R, 99)
  assert.ok(armed.length >= 6, 'not every power is armed by the last wave')
  for (const a of armed) a.cooldownLeft = 0
  const step = tickSchedule(armed, 0, R.globalCooldownSeconds, R.globalCooldownSeconds)
  assert.equal(step.fired.length, 1, 'two powers fired inside the global cooldown')
  const still = armed.filter((a) => a.cooldownLeft <= 0)
  assert.ok(still.length >= 1, 'a blocked power lost its readiness instead of waiting')
})

test('every manipulation telegraphs, with the fx the design cut left over', () => {
  assert.equal(R.telegraph.fx, 'fx-vlaude-path-change')
  assert.ok(R.telegraph.leadSeconds > 0, 'the telegraph has no lead time')
  assert.ok(R.telegraph.size > 0)
  // IT WAS DRAWN FOR ROUTE SWITCHING, WHICH WAS CUT. The repurposing is the
  // brief's and is recorded in art.json and the asset report; what this asserts
  // is that the sheet is registered and is the level's, so the telegraph is a
  // real animation rather than a name.
  assert.ok(art.files[R.telegraph.fx], 'the telegraph fx is not in the manifest')
  assert.ok(levelArtKeys('level10').includes(R.telegraph.fx),
    'the telegraph sheet is not level 10 art, so it would not be loaded')
  assert.ok(art.render[R.telegraph.fx].sheet.frames > 1, 'the telegraph is one frame')
})

test('a tower on a locked pad survives and keeps firing', () => {
  // THE RULE THE WHOLE POWER TURNS ON. Locking never destroys a player's
  // investment; it takes away what they may do NEXT.
  assert.equal(lockedPadStillFires(), true)
  const pads: Lockable[] = [
    { index: 0, occupied: true, locked: false },
    { index: 1, occupied: false, locked: false },
    { index: 2, occupied: false, locked: false },
    { index: 3, occupied: true, locked: false },
    { index: 4, occupied: false, locked: false },
  ]
  const taken = lockTargets(R, pads)
  assert.equal(taken.length, (R.powers.buildLock as { count: number }).count)
  // EMPTY PADS FIRST: with three empty pads free, no occupied one is touched.
  assert.deepEqual(taken, [1, 2, 4], 'an occupied pad was locked while empty ones were free')
  for (const i of taken) pads[i]!.locked = true
  assert.equal(buildable(pads[1]!), false, 'a locked pad can still be built on')
  assert.equal(buildable(pads[0]!), false, 'an occupied pad reads as buildable')
  // The tower on pad 0 is untouched by the cast in every respect this module
  // can express: it is not locked, and locking cannot change `occupied`.
  assert.equal(pads[0]!.locked, false)
  assert.equal(pads[0]!.occupied, true)
  // AND WHEN THERE ARE NOT ENOUGH EMPTY ONES the rest come from the occupied
  // pads, which is legal and does nothing but draw the padlock.
  const tight: Lockable[] = [
    { index: 0, occupied: true, locked: false },
    { index: 1, occupied: true, locked: false },
    { index: 2, occupied: false, locked: false },
  ]
  assert.deepEqual(lockTargets(R, tight), [2, 0, 1])
})

test('a duplicate does not duplicate', () => {
  // THE ONE CORRECTNESS RULE IN THE POWER SET. Without it the board doubles
  // every cast; the failure is exponential, so it does not look like a balance
  // problem while it is happening.
  const field = [
    { id: 'corrupt', copyDepth: 0 },
    { id: 'corrupt', copyDepth: 1 },
    { id: 'packet', copyDepth: 0 },
    { id: 'vlaude', copyDepth: 0 },
    { id: 'callbackLich', copyDepth: 0 },
  ]
  const targets = copyTargets(R, field)
  assert.deepEqual(targets.map((t) => t.id), ['corrupt', 'packet'],
    'the copy set is wrong: a copy, a boss or a callback got in')
  assert.ok(!targets.some((t) => t.copyDepth >= 1), 'a duplicate was offered for duplication')
  // A SECOND ROUND ON THE RESULT COPIES NOTHING. The copies made below carry
  // depth 1, so the next cast has only the originals to work with -- it can
  // never compound.
  const copies = targets.map((t) => ({ id: t.id, copyDepth: t.copyDepth + 1 }))
  assert.deepEqual(copyTargets(R, copies), [], 'copies of copies are allowed')
  assert.equal(copyCount(R, 0), 0, 'a cast with nothing to copy still copies')
  assert.equal(copyCount(R, 99), (R.powers.duplicateEnemy as { maxPerCast: number }).maxPerCast)
})

test('speed is altered through a slot that is SET, so it restores exactly', () => {
  const m = hasteMultiplier(R)
  assert.ok(m > 1, 'the haste does not speed anything up')
  assert.ok(hasteSeconds(R) > 0, 'the haste never ends')
  assert.equal(HASTE_OFF, 1, 'the off value is not the identity')
  // EXACTLY, not nearly. The slot is assigned rather than multiplied into, so
  // the base speed comes back bit for bit however many times it is applied.
  const base = enemies.corrupt.speed
  let slot = HASTE_OFF
  for (let i = 0; i < 25; i++) {
    slot = m
    assert.equal(base * slot, base * m)
    slot = HASTE_OFF
    assert.equal(base * slot, base, 'the speed did not come back to base')
  }
  // AND IT IS THE PERFORMANCE REVIEW'S PATTERN, not a second movement system:
  // a named multiplier slot defaulting to 1, multiplied into the one line that
  // computes a walking speed.
  const enemy = readFileSync(url('../src/entities/Enemy.ts'), 'utf8')
  assert.match(enemy, /hasteSpeed = 1/, 'there is no haste slot on Enemy')
  assert.match(enemy, /this\.def\.speed \* this\.speedScale \* this\.reviewSpeed \* this\.hasteSpeed/,
    'the haste slot is not multiplied into the speed calculation beside the review')
})

test('a broken wall clears its collision on the frame the rubble is drawn', () => {
  const cfg = R.powers.generateWall as { health: number; art: { rubble: string[] } }
  const whole = wallLook(R, { health: cfg.health, maxHealth: cfg.health, broken: false })
  assert.equal(whole.art, 'prop-wall-intact')
  assert.equal(whole.blocks, true)
  const hurt = wallLook(R, { health: cfg.health * 0.3, maxHealth: cfg.health, broken: false })
  assert.equal(hurt.art, 'prop-wall-cracked')
  assert.equal(hurt.blocks, true, 'a cracked wall stopped blocking early')
  // THE ONE THAT MATTERS. Both rubble pieces are reachable and NEITHER blocks.
  for (const pick of [0, 1]) {
    const gone = wallLook(R, { health: 0, maxHealth: cfg.health, broken: true }, pick)
    assert.ok(cfg.art.rubble.includes(gone.art), 'the rubble is not one of the two pieces')
    assert.equal(gone.blocks, false, 'broken rubble still blocks; an invisible wall is on the board')
  }
  assert.equal(new Set([0, 1].map((p) =>
    wallLook(R, { health: 0, maxHealth: 1, broken: true }, p).art)).size, 2,
    'the two rubble pieces are not both used')
  // Health reaching zero is enough on its own; the caller does not have to set
  // `broken` as well for the collision to clear.
  assert.equal(wallLook(R, { health: 0, maxHealth: cfg.health, broken: false }).blocks, false)
})

test('the countermeasure is hostile, unbuildable, and goes on an empty pad', () => {
  const cfg = R.powers.generateWeapon as Record<string, unknown>
  const towers = read('towers')
  assert.equal(towers[cfg.sprite as string], undefined, 'the countermeasure is a buildable tower')
  assert.ok(!Object.values(towers).some((t) => (t as { sprite?: string }).sprite === cfg.sprite),
    'a player tower wears the countermeasure art')
  assert.equal(cfg.targetsTowers, true, 'it does not shoot the player')
  assert.ok((cfg.health as number) > 0 && (cfg.range as number) > 0)
  assert.equal(cfg.icon, 'icon-tower-boost')
  // AN EMPTY PAD, ALWAYS. Taking a pad the player has built on would destroy
  // investment, which `buildLock` is deliberately forbidden from doing and this
  // must not do either.
  assert.equal(weaponPad([
    { index: 0, occupied: true, locked: false },
    { index: 1, occupied: false, locked: false },
  ]), 1)
  assert.equal(weaponPad([{ index: 0, occupied: true, locked: false }]), null,
    'a countermeasure was placed on an occupied pad')
  assert.equal(weaponPad([{ index: 0, occupied: false, locked: true }]), null,
    'a countermeasure was placed on a locked pad')
})

test('the units Vlaude makes are real, and the player has met them first', () => {
  const cfg = R.powers.createEnemies as { pool: string[] }
  assert.equal(cfg.pool.length, 4)
  const introduced = new Map<string, number>()
  waves10.waves.forEach((w: { spawns: { enemy: string }[] }, i: number) => {
    for (const s of w.spawns) if (!introduced.has(s.enemy)) introduced.set(s.enemy, i + 1)
  })
  const powerFrom = Math.min(...R.schedule.filter((r) => r.power === 'createEnemies'
    || r.with === 'createEnemies').map((r) => r.fromWave))
  for (const id of cfg.pool) {
    const e = enemies[id]
    assert.ok(e, `${id} is not an enemy`)
    assert.ok(e.maxHealth > 0 && e.peanutReward > 0,
      `${id} is decoration: it has no health or pays nothing`)
    const seen = introduced.get(id)
    assert.ok(seen !== undefined, `${id} is never sent by the wave table`)
    assert.ok(seen < powerFrom,
      `${id} is first made by Vlaude on wave ${powerFrom} and first sent on wave ${seen}; `
      + 'a power must not introduce a unit as well as a rule')
  }
})

/* ------------------------------------------------------- the callbacks */

test('all four callbacks arrive, one per wave, in level order', () => {
  // THE WHOLE JOKE, asserted against the wave table rather than trusted.
  const order = R.callbackOrder
  assert.deepEqual(order,
    ['callbackPolitician', 'callbackDevil', 'callbackUnicorn', 'callbackLich'])
  const waveOf = new Map<string, number>()
  waves10.waves.forEach((w: { spawns: { enemy: string; count: number }[] }, i: number) => {
    for (const s of w.spawns) if (order.includes(s.enemy)) {
      assert.equal(s.count, 1, `${s.enemy} arrives ${s.count} at a time`)
      assert.ok(!waveOf.has(s.enemy), `${s.enemy} is recalled twice`)
      waveOf.set(s.enemy, i + 1)
    }
  })
  assert.equal(waveOf.size, 4, 'not every callback is in the wave table')
  const waveList = order.map((id) => waveOf.get(id)!)
  assert.deepEqual(waveList, [...waveList].sort((a, b) => a - b),
    'the callbacks do not arrive in level order')
  assert.equal(new Set(waveList).size, 4, 'two callbacks share a wave')
  // EVERY ONE IS IN PHASE 3, which is when the portal is open.
  for (const w of waveList) assert.equal(phaseForWave(R, w), 'damaged')
  // The portal is decoration: the unit that walks out of it wears its own art.
  assert.equal(R.callbackFx, 'fx-vlaude-recall-portal')
  const sprites = order.map((id) => enemies[id].sprite)
  assert.equal(new Set(sprites).size, 4, 'two callbacks share a sprite')
  for (const s of sprites) assert.ok(art.files[s], `${s} is not in the manifest`)
})

test('the callbacks are levels 1 to 4\'s bosses, facing the way this lane runs', () => {
  const originals = ['politician', 'theDevil', 'unicornBoss', 'glitchLich']
  R.callbackOrder.forEach((id, i) => {
    const o = enemies[originals[i]!]
    const c = enemies[id]
    assert.equal(c.name, o.name, `${id} is not ${originals[i]} by name`)
    // THE FIELD THE BRIEF WARNS ABOUT. A wrong value here walked five level 3
    // enemies backwards for a release. This lane runs west to east, the art is
    // drawn facing right, so `right` is correct -- and it is correct for the
    // originals too, which is the check that makes this more than a repetition.
    assert.equal(c.artFacing, 'right', `${id} faces the wrong way`)
    assert.equal(c.artFacing, o.artFacing, `${id} disagrees with ${originals[i]} about facing`)
  })
  // BEHAVIOUR KEPT, NUMBERS RESCALED.
  assert.ok(enemies.callbackPolitician.tax, 'the Politician lost the tax')
  assert.ok(enemies.callbackDevil.summons, 'the Devil summons nothing')
  assert.ok(enemies.callbackUnicorn.towerDisable, 'the Reaper switches nothing off')
  assert.ok(enemies.callbackLich.summons, 'the Lich King summons nothing')
  // AND THE ONE BEHAVIOUR THAT HAD TO CHANGE, flagged rather than hidden.
  // `glitchLich` on level 4 retreats at zero health and returns later in the
  // run as `glitchLichReturn`. There is no later on this level and nowhere to
  // retreat to, so here he dies.
  assert.equal(enemies.glitchLich.retreatsWhenDefeated, true)
  assert.equal(enemies.callbackLich.retreatsWhenDefeated, false,
    'the Lich King retreats on the last level of the game, to nowhere')
  // Every enemy a callback can put on the board is loaded by this level.
  const loaded = new Set(levelArtKeys('level10'))
  for (const child of ['directReport', 'tinyGlitch']) {
    assert.ok(loaded.has(enemies[child].sprite),
      `${child} can reach the board and its art is not loaded`)
  }
})

/* ----------------------------------------------------------- the ending */

test('the defeat draws seven of its eight frames, and the eighth is the cue', () => {
  const d = R.defeat
  assert.equal(d.totalFrames, 8)
  assert.equal(defeatSpriteFrames(R), 7)
  assert.equal(art.render[d.fx].sheet.frames, 8, 'the sheet is not eight frames')
  // FRAME 8 IS A HARD-EDGED WHITE RECTANGLE. Drawn as a sprite over the dark
  // core chamber it reads as a rendering bug, so reaching it is the cue for a
  // full-screen white fade and the sprite comes off on the same frame.
  assert.equal(defeatReachedFade(R, 6), false, 'the fade fires while frames are left')
  assert.equal(defeatReachedFade(R, 7), true, 'the fade does not fire on the eighth frame')
  assert.ok(whiteWashMs(R) > 0, 'the white wash takes no time')
  assert.ok(d.whiteFadeInMs > 0 && d.whiteHoldMs > 0 && d.whiteFadeOutMs > 0,
    'one of the three beats of the wash is missing')
})

test('reaching the exit ends the run, and it is not a life deduction', () => {
  assert.equal(R.exitEndsRun, true)
  const boss = enemies[R.laneEnemy]
  assert.equal(leakEndsRun(R, boss, boss), true)
  assert.equal(leakEndsRun(R, enemies.corrupt, boss), false,
    'an ordinary leak ends the run')
  assert.equal(leakEndsRun(R, enemies.callbackLich, boss), false,
    'a callback reaching the exit ends the run')
  assert.equal(leakEndsRun(null, boss, boss), false,
    'a level with no rules block ends its run on a leak')
  assert.equal(leakEndsRun(R, undefined, boss), false)
  assert.equal(leakEndsRun(R, boss, undefined), false)
  // BY DEF IDENTITY AND NOT BY NAME, which matters here more than anywhere
  // else in the game: the four callbacks deliberately carry their originals'
  // names, so a name comparison would be wrong for exactly the reason the
  // level is funny.
  assert.equal(enemies.callbackLich.name, enemies.glitchLich.name)
  // NOT A LIFE DEDUCTION. His livesCost is a backstop that is never charged,
  // and it is under the starting life count so that removing the flag would
  // leave the player alive rather than silently winning.
  const rules = read('rules')
  assert.ok(enemies.vlaude.livesCost < rules.startingLives,
    'Vlaude\'s leak is an instant loss through the life count, which hides the rule')
  assert.ok(enemies.vlaude.livesCost >= 5)

  // AND THE SCENE ASKS BEFORE IT CHARGES. Read as text, because GameScene
  // needs Phaser to construct and nothing in tests/ can build one -- so what
  // this can prove is the ORDER, which is the whole rule: the branch is above
  // the line that deducts lives, not below it.
  const game = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  const leak = game.slice(game.indexOf('private leak(enemy: Enemy)'))
  const body = leak.slice(0, leak.indexOf('\n  }'))
  assert.match(body, /leakEndsRun\(this\.vlaude, enemy\.def, this\.vlaudeBossDef\)/,
    'GameScene.leak never asks whether this leak ends the run')
  assert.ok(body.indexOf('leakEndsRun') < body.indexOf('this.status.lives -='),
    'the run-ending check is BELOW the life deduction, so a life is charged first')
  assert.match(body, /this\.endRun\('lost'\)\n      return/,
    'the run-ending branch does not return, so it charges lives as well')
})

test('the comics play on a win and the title card is not one of them', () => {
  const cut = read('cutscenes')
  // SIX PANELS SINCE 2026-09-17: the ending, and then the EPILOGUE. The three
  // `cutscene_L10_*` panels are what plays when Vlaude goes down and their
  // order is unchanged; `epilogue_01/02/03` follow them in the same list
  // because they play as one comic. `leaveWon` sends the last level's outro to
  // the Credits, so this list is exactly what sits between the last boss and
  // the roll -- an epilogue in a map of its own would need a second lookup in
  // the scene to land in the same place.
  assert.deepEqual(cut.outros.level10, [
    'cutscenes/cutscene_L10_01.webp',
    'cutscenes/cutscene_L10_02.webp',
    'cutscenes/cutscene_L10_03.webp',
    'cutscenes/epilogue_01.webp',
    'cutscenes/epilogue_02.webp',
    'cutscenes/epilogue_03.webp',
  ], 'the ending and the epilogue are not level 10\'s outro, in order')
  // The ending still comes first, stated as an order rather than left to the
  // deepEqual above to imply.
  const l10 = cut.outros.level10 as string[]
  assert.ok(l10.findIndex((p: string) => p.includes('epilogue'))
    > l10.findLastIndex((p: string) => p.includes('cutscene_L10')),
    'the epilogue plays before the ending it is an epilogue to')
  assert.equal(cut.levels.level10, undefined,
    'the ending comics are filed as level 10\'s OPENING, so they would play before the level')
  // A LOSS MUST NOT PLAY THEM. `outros` is reached from the win branch alone,
  // which is the mechanism level 9's panel already relies on; asserted here
  // against the scene so that level 10 inherits it rather than assuming it.
  const game = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  assert.match(game, /outroPanelsFor\(this\.level\.id\)/,
    'GameScene never reads the outro map, so no ending comic can play')
  // THE TITLE CARD IS NOT A PANEL. It plays full-screen before the level, so
  // filing it here would put it inside the comic reader with the ending.
  const panels: string[] = Object.values(cut.outros).flat() as string[]
  assert.ok(!panels.includes('cutscenes/titlecard_level10.webp'),
    'the title card is filed as a comic panel')
})

/* ------------------------------------------------------- the teardown */

test('every sheet this level cuts an animation from is forgotten on teardown', () => {
  // EFFECTS.TS'S DOCUMENTED HAZARD. An animation outlives the texture it was
  // cut from: `registerEffectAnims` skips a key `anims.exists` already knows,
  // so a level that frees its textures without dropping its animations leaves
  // the NEXT level reusing frames cut from a texture that is gone. The effect
  // plays, and plays nothing.
  // FIVE SHEETS, WHICH IS EVERY SHEET LEVEL 10 HAS. Eight fx roles resolve to
  // five files: the telegraph and the float's telegraph are both the
  // path-change sheet, and the wall, the weapon and the made units all play the
  // generation sheet. Derived and deduplicated rather than counted by hand.
  const keys = effectSheetKeys(R)
  assert.deepEqual(keys, [
    'fx-vlaude-defeat', 'fx-vlaude-duplication', 'fx-vlaude-generation',
    'fx-vlaude-path-change', 'fx-vlaude-recall-portal',
  ], 'the set of sheets level 10 registers animations for changed')
  // The list is exactly the level's own sheets, derived from the rules rather
  // than written down -- so adding a sheet to level10.json and forgetting the
  // teardown fails here rather than on level 1.
  const own = Object.keys(art.files)
    .filter((k) => k.startsWith('fx-vlaude-'))
  for (const k of own) {
    assert.ok(keys.includes(k), `${k} is a level 10 sheet and is never forgotten`)
  }
  for (const k of keys) {
    assert.ok(art.files[k], `${k} is queued for teardown and is not in the manifest`)
    assert.ok(art.render[k]?.sheet, `${k} is forgotten as a sheet and is not one`)
    assert.ok(levelArtKeys('level10').includes(k),
      `${k} is forgotten by level 10 and never loaded by it`)
  }
  assert.deepEqual(effectSheetKeys(null), [], 'a level with no rules forgets something')
  // AND THE LINK TO THE TEARDOWN IS THE ASSERTION THAT MATTERS. `freeLevelArt`
  // passes `levelArtKeys(level.id)` to `forgetEffectAnims` and then removes the
  // same textures, so a sheet inside that list is dropped with its animation by
  // construction. Every key above is in it -- asserted in the loop just above --
  // and this is the other half: that the call site really is the one that takes
  // the level's own art list. The hazard the brief names is therefore already
  // handled generically for level 10 rather than needing a second call, and
  // what could still break it is a level 10 sheet that is NOT level art, which
  // the loop above fails on.
  const game = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  const free = /private freeLevelArt\(\): void \{[\s\S]*?\n  \}/.exec(game)
  assert.ok(free, 'freeLevelArt has moved; this test is checking nothing')
  assert.match(free[0], /levelArtKeys\(/, 'the teardown no longer reads the level\'s art list')
  assert.match(free[0], /forgetEffectAnims\(this, keys\)/,
    'the teardown frees textures without dropping the animations cut from them')
})

/* ------------------------------------------------------- the board */

test('the board is the one the boss was tuned against', () => {
  const level = loadLevel('level10')
  assert.equal(level.id, 'level10', 'level 10 does not resolve; it fell back to the default')
  assert.equal(map10.buildSpots.length, 12, 'the pad count moved and the boss was tuned at 12')
  assert.equal(map10.hazardSpots.length, 5, 'the wall positions moved')
  for (const h of map10.hazardSpots) {
    assert.ok(h.atFraction > 0.1 && h.atFraction < 0.9,
      'a wall spot is on top of the spawn or past every tower on the board')
  }
  assert.ok(map10.vlaudeBerth, 'there is nowhere to park him')
  // HE IS OFF THE LANE, and further from it than any tower can reach -- which
  // is belt and braces, because nothing can target him there in any case.
  // HE IS OFF THE LANE. 127.9 px from the centreline, which is further than
  // any pad's standoff band allows a tower to be and further than the road is
  // wide -- so nothing walks past him and he is not standing in the road.
  //
  // IT IS NOT FURTHER THAN EVERY TOWER'S RANGE and it does not need to be: the
  // Escalation reaches 215 and would cover the berth geometrically. What keeps
  // him safe is that there is no Enemy there to target, not a distance. Stated
  // rather than asserted the other way round, because an assertion that he is
  // out of range would be measuring the wrong thing and would fail the day
  // somebody moved a pad.
  const berth = map10.vlaudeBerth
  const near = Math.min(...(map10.waypoints as number[][])
    .map(([x, y]) => Math.hypot(berth.x - x!, berth.y - y!)))
  assert.ok(near > map10.roadWidth,
    `the berth is ${near.toFixed(0)} px from the lane, which is inside the road`)
  assert.ok(near > 90, 'the berth is inside the pad standoff band, so he is in the play area')
})

test('NightRules answers null for level 10, and a sky for level 5', async () => {
  // THE GUARD, EXECUTED. `NightRules.from` asks for the day/night SHAPE rather
  // than for the key now, so a level whose rules carry a `phases` block that is
  // not a sky gets null instead of a half-built object that throws on its first
  // frame. Imported dynamically because this file's other imports are all
  // Phaser-free and NightRules is too -- but it is the one module here whose
  // whole point is a runtime object rather than a pure function.
  const { NightRules } = await import('../src/systems/NightRules.ts')
  assert.notEqual(NightRules.from(levelRules('level5')), null,
    'level 5 lost its sky')
  assert.equal(NightRules.from(levelRules('level10')), null,
    'level 10 gets a NightRules, which is the crash this guard exists for')
  // AND THE SHAPE IT REFUSES, spelled out: a block with the right key and the
  // wrong contents is exactly what level 10 handed it.
  assert.equal(NightRules.from({ phases: { chatFromWave: 1 } } as never), null,
    'a wave-threshold block is still read as a sky')
  assert.equal(NightRules.from({ phases: { day: {} } } as never), null,
    'a half a sky is accepted')
  assert.equal(NightRules.from(null), null)
})

/* ===================================================================== */
/* THE FIGHT — the scene half, 2026-09-14.                               */
/*                                                                       */
/* WHAT THESE CAN SAY AND WHAT THEY CANNOT, again, because the split gets */
/* wider here than anywhere else in the file. Everything below is either  */
/* a rule executed or a SOURCE-TEXT assertion about GameScene.ts, and a   */
/* source-text assertion catches a deleted line and nothing else. That a  */
/* padlock is drawn, that the float is invulnerable for every frame of    */
/* its traversal, that the defeat never paints frame 7 and that the white */
/* wash is really white are checked in `tools/harness/run.sh vlaude`,     */
/* which is the only thing in this repository that looks at a pixel.      */
/* ===================================================================== */

const scene = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')

test('the berthed form is drawn from the manifest and is never an Enemy', () => {
  const berth = scene.slice(scene.indexOf('private syncVlaudeBerth()'))
    .split('\n  }\n')[0]!
  assert.ok(berth.length > 0, 'GameScene does not draw the berth')
  assert.match(berth, /berthSprite\(v, phase\)/,
    'the scene picks the berth sprite itself instead of asking the module')
  assert.match(berth, /phaseForWave\(v, this\.status\.wave \+ 1\)/,
    'the phase is decided somewhere other than phaseForWave')
  assert.match(berth, /this\.add\.image\(/, 'the berthed form is not an Image')
  // THE WHOLE OF "HE CANNOT BE TARGETED" IS THAT THERE IS NOTHING TO TARGET.
  assert.doesNotMatch(berth, /new Enemy\(/, 'the berthed form is an Enemy')
  assert.doesNotMatch(berth, /setInteractive/, 'the berthed form takes pointer events')
  assert.doesNotMatch(berth, /health|maxHealth/, 'the berthed form has health')
  // And `parked` is what says which phases keep him at the core, so the scene
  // never compares a phase name to a string itself.
  assert.match(berth, /!parked\(phase\)/, 'the scene decides "parked" for itself')
})

test('the float hands `floating` to targetable and to nothing else', () => {
  const float = scene.slice(scene.indexOf('private beginVlaudeFloat()'))
    .split('\n  }\n')[0]!
  assert.ok(float.length > 0, 'GameScene does not play the float')
  assert.match(float, /this\.vlaudeFloating = true/, 'the float never sets `floating`')
  assert.match(float, /this\.vlaudeFloating = false/, 'the float never clears `floating`')
  assert.match(float, /targetable\(this\.vlaudePhase, true\)/,
    'the float does not ask targetable() whether he can be hit on the way')
  assert.match(float, /ease: f\.landingEase/, 'the ease is not read from the data')
  assert.match(float, /duration: f\.travelMs/, 'the travel time is not read from the data')
  assert.match(float, /shake\(f\.shakeMs/, 'the landing does not shake')
  assert.doesNotMatch(float, /new Enemy\(/,
    'the float creates an Enemy, so he is damageable before he lands')
  // THE FLOAT'S NUMBERS ARE ALL IN THE DATA, so it can be retimed without this
  // file. `landingEase` is a Phaser ease name and the module now carries it.
  assert.equal(typeof R.float.landingEase, 'string')
  assert.ok(R.float.holdMs > 0 && R.float.travelMs > 0 && R.float.shakeMs > 0)
  assert.ok(R.bobPixels > 0 && R.bobSeconds > 0, 'the berthed form does not bob')
})

test('the schedule is driven from the module, and holds a blocked cast', () => {
  assert.match(scene, /armedAt\(v, this\.status\.wave \+ 1\)/,
    'the scene arms the schedule itself')
  assert.match(scene, /tickSchedule\(this\.vlaudeArmed, dt, this\.vlaudeSinceCast, v\.globalCooldownSeconds\)/,
    'the scene paces the schedule itself')
  assert.match(scene, /combinationProblems\(v\)/,
    'nothing checks the schedule at level load')
  // The telegraph leads the effect rather than landing with it.
  const cast = scene.slice(scene.indexOf('private telegraphCast('))
    .split('\n  }\n')[0]!
  assert.match(cast, /durationMs: t\.leadSeconds \* 1000/,
    'the telegraph does not run for its own lead time')
  assert.match(cast, /left: t\.leadSeconds/, 'the effect does not wait for the telegraph')
  assert.match(cast, /row\.with \? \[row\.power, row\.with\]/,
    'a combination row fires only one of its halves')
})

test('a build lock touches nothing but the lock', () => {
  const lock = scene.slice(scene.indexOf('private castBuildLock()'))
    .split('\n  }\n')[0]!
  assert.ok(lock.length > 0, 'GameScene does not lock pads')
  assert.match(lock, /lockTargets\(v, this\.lockablePads\(\)\)/,
    'the scene picks the pads itself')
  // THE RULE THE WHOLE POWER TURNS ON: a tower already standing survives,
  // keeps firing and keeps its pad. Nothing in the cast may reach `occupied`,
  // sell, destroy, disable or release.
  for (const forbidden of ['build.occupy', 'build.release', 'destroyTower',
    'sellTower', 'landDisable', 'disabledFor']) {
    assert.ok(!lock.includes(forbidden),
      `the build lock calls ${forbidden}, which costs the player investment`)
  }
  assert.equal(lockedPadStillFires(), true)
  // And the gate for NEW placement is the module's `buildable`, asked in one
  // place that every build path goes through.
  const open = scene.slice(scene.indexOf('private padOpen(index: number)'))
    .split('\n  }\n')[0]!
  assert.match(open, /buildable\(\{/, 'padOpen does not ask buildable()')
  assert.ok(scene.split('this.padOpen(').length - 1 >= 6,
    'the build paths do not all go through padOpen')
})

test('the haste is assigned and restored, and never routed through review()', () => {
  const haste = scene.slice(scene.indexOf('private castSpeedAlter()'))
    .split('\n  }\n')[0]!
  assert.match(haste, /e\.hasteSpeed = m/, 'the haste is not assigned')
  assert.ok(!/\*=/.test(haste), 'the haste accumulates')
  assert.ok(!/review\(/.test(haste),
    'the haste goes through the Performance Review, which is permanent and grows the enemy')
  const tick = scene.slice(scene.indexOf('private tickHaste('))
    .split('\n  }\n')[0]!
  assert.match(tick, /e\.hasteSpeed = HASTE_OFF/, 'the haste never comes back off')
  assert.equal(HASTE_OFF, 1)
})

test('a wall gets its picture and its collision from one call', () => {
  const tick = scene.slice(scene.indexOf('private tickVlaudeWalls('))
    .split('\n  }\n')[0]!
  assert.ok(tick.length > 0, 'GameScene does not tick the walls')
  assert.match(tick, /const look = wallLook\(v, w\.state, w\.rubblePick\)/,
    'the scene decides what a wall looks like for itself')
  assert.match(tick, /w\.blocks = look\.blocks/,
    'the collision is set from something other than the call that picked the picture')
  // `blocksEnemies` IS FALSE and must stay false: a wall that stopped Vlaude's
  // own walkers would be a gift.
  assert.equal((R.powers.generateWall as { blocksEnemies: boolean }).blocksEnemies, false,
    'the wall blocks enemies, which turns the power into a present')
  // What it DOES deny is the ground, and both halves of that are refused out
  // loud rather than silently clamped.
  assert.match(scene, /private wallBlocks\(/, 'nothing asks whether a wall denies a point')
  // TWO CALL SITES, AND THEY ARE THE TWO THE POWER IS ABOUT: the hero's move
  // order and a garrison's rally. Both refuse OUT LOUD rather than clamping
  // the point somewhere else, because an order that silently landed elsewhere
  // is an order the player cannot trust.
  assert.equal(scene.split('this.wallBlocks(').length - 1, 2,
    'the wall denies the ground to something other than the hero and a garrison')
  for (const fn of ['private orderHero(', 'private orderRally(']) {
    const body = scene.slice(scene.indexOf(fn)).split('\n  }\n')[0]!
    assert.match(body, /this\.wallBlocks\(x, y\)/, `${fn} walks through a wall`)
  }
})

test('the countermeasure suppresses a tower and never destroys one', () => {
  const hit = scene.slice(scene.indexOf('private hitTowerWithCountermeasure('))
    .split('\n  }\n')[0]!
  assert.ok(hit.length > 0, 'nothing shoots a tower')
  assert.match(hit, /this\.landDisable\(tower,/,
    'the countermeasure does something other than switch the lights off')
  assert.ok(!/destroyTower|build\.release/.test(hit),
    'the countermeasure destroys a tower, which costs the player investment')
  // THE TWO NUMBERS THAT ARE NEW, and they are new because this game has no
  // tower health and this is the first thing that shoots one.
  const w = R.powers.generateWeapon as Record<string, number>
  assert.ok(w.towerHealth > 0, 'there is no damage pool for a tower to absorb')
  assert.ok(w.towerDownSeconds > 0, 'a suppressed tower never comes back')
  assert.ok(w.towerHealth / w.damage >= 8,
    'a tower goes dark in under eight shots, which is not a decision the player can answer')
  // It takes a pad and gives it back, which is the answer to it.
  assert.equal(w.occupiesPad as unknown as boolean, true)
  assert.ok(w.peanutReward > 0, 'killing it pays nothing')
  const kill = scene.slice(scene.indexOf('private killCountermeasure('))
    .split('\n  }\n')[0]!
  assert.match(kill, /this\.build\.release\(c\.pad\)/, 'the pad never comes back')
  assert.match(kill, /this\.earn\(reward\)/, 'it pays no peanuts')
})

test('the recall portal is decoration, and is paced off the wave table', () => {
  const portal = scene.slice(scene.indexOf('private recallPortal('))
    .split('\n  }\n')[0]!
  assert.ok(portal.length > 0, 'GameScene does not draw the portal')
  assert.ok(!/new Enemy\(|spawn\(/.test(portal), 'the portal spawns something')
  const queue = scene.slice(scene.indexOf('private queueRecallPortals()'))
    .split('\n  }\n')[0]!
  assert.match(queue, /v\.callbackOrder\.includes\(group\.enemy\)/,
    'the portal is not matched against the callbacks')
  assert.match(queue, /dueMs - v\.callbackLeadMs/,
    'the portal does not open ahead of the unit it belongs to')
  assert.ok(R.callbackLeadMs > 0, 'the portal has no lead time')
  assert.ok(R.callbackSize > 0 && R.callbackDurationMs > 0)
})

test('the defeat is played by hand, and the eighth frame is never a sprite', () => {
  const defeat = scene.slice(scene.indexOf('private playVlaudeDefeat('))
    .split('\n  }\n')[0]!
  assert.ok(defeat.length > 0, 'GameScene does not play the defeat')
  // NOT `playEffect`, which runs the clip to its end -- and the end is the one
  // frame that must never be drawn.
  assert.ok(!/playEffect\(/.test(defeat),
    'the defeat plays through playEffect, which would draw the white rectangle')
  assert.match(defeat, /defeatSpriteFrames\(v\)/, 'the frame count is not read from the module')
  assert.match(defeat, /defeatReachedFade\(v, frame\)/, 'the fade cue is decided elsewhere')
  assert.match(defeat, /art\.setFrame\(frame\)/, 'the frames are not advanced by hand')
  assert.equal(defeatSpriteFrames(R), 7)
  assert.equal(R.defeat.totalFrames, 8)
  assert.equal(defeatReachedFade(R, 6), false)
  assert.equal(defeatReachedFade(R, 7), true)
})

test('the white wash is screen space, and ends the run from inside itself', () => {
  const wash = scene.slice(scene.indexOf('private whiteWash()'))
    .split('\n  }\n')[0]!
  assert.ok(wash.length > 0, 'GameScene does not draw the wash')
  // CLAUDE.md HARD RULE 4. A rectangle covering the board is a WORLD object
  // unless it is registered, and a world object slides off a panned board.
  assert.match(wash, /this\.asScreenSpace\(\[wash\]\)/,
    'the white wash is a world object and would pan off the board')
  // AND IT IS OPAQUE. `add.rectangle`'s sixth argument is the FILL alpha, not
  // the object's; it was 0 here while the tween animated the object's, so the
  // wash reached alpha 1 painting nothing and the screen never went white.
  // Every number about it was correct and only the frame was wrong.
  assert.match(wash, /0xffffff, 1\)/, 'the wash is created with a transparent fill')
  assert.match(wash, /wash\.setAlpha\(0\)/, 'the wash starts opaque instead of fading in')
  assert.match(wash, /duration: d\.whiteFadeInMs/)
  assert.match(wash, /delay: d\.whiteHoldMs/)
  assert.match(wash, /duration: d\.whiteFadeOutMs/)
  assert.match(wash, /this\.endRun\('won'\)/, 'the run does not end inside the white')
  assert.ok(whiteWashMs(R) > 1000, 'the whole wash is over in under a second')
  // AND THE RESULTS DIALOG WAITS FOR IT. Level 9's rupture learned this from a
  // rendered frame: a scoreboard over the level's own ending is the ending
  // staged behind it.
  assert.match(scene, /if \(!this\.vlaudeDefeatPlaying\) this\.endRun\(runEnds\)/,
    'the results dialog opens over the top of the defeat')
})

test('the title card plays before the level, and its audio hook is silent', () => {
  const card = R.titleCard
  assert.ok(card, 'level 10 has no title card')
  assert.ok(card!.panel.startsWith('cutscenes/'),
    `the card names ${card!.panel}, which is outside the cutscenes folder`)
  assert.doesNotThrow(
    () => readFileSync(url(`../public/assets/${card!.panel}`)),
    `${card!.panel} is not in public/`)
  // HELD LONGER THAN FEELS COMFORTABLE. A comic panel waits for a tap; this
  // does not, and the length is the joke.
  assert.ok(card!.holdMs >= 3000,
    `the card holds for ${card!.holdMs}ms, which is a flash rather than a beat`)
  // AND IT IS NOT A COMIC. cutscenes.json's two maps mean "before" and
  // "after", and a card is neither -- naming it there would make
  // `cutsceneProblems` or `panelsFor` wrong about what a comic is.
  const cutscenes = read('cutscenes')
  assert.ok(!JSON.stringify(cutscenes.levels).includes('titlecard'),
    'the title card is filed as an opening comic')
  assert.ok(!JSON.stringify(cutscenes.outros).includes('titlecard'),
    'the title card is filed as an outro comic')

  // THE "OH BOY" CLIP DOES NOT EXIST AND NOTHING WAS SUBSTITUTED FOR IT.
  // The hook is named, it is wired, and it is deliberately NOT routed through
  // Audio.play -- whose `Cue` type is `keyof audio.json's cues`, so wiring it
  // would have needed a fake row for a file nobody recorded.
  assert.ok(card!.audioCue.length > 0, 'the beat has no name')
  const audio = read('audio')
  assert.equal(audio.cues[card!.audioCue], undefined,
    `audio.json has a row for ${card!.audioCue}; if a clip was recorded, wire it through play()`)
  const loadout = readFileSync(url('../src/scenes/LoadoutScene.ts'), 'utf8')
  assert.match(loadout, /private titleCardCue\(cue: string\): void \{\n\s*logEvent\(/,
    'the silent hook does something other than log')
  assert.match(loadout, /this\.titleCardCue\(card\.audioCue\)/, 'the beat is not wired')
})

test('the last level ends in the credits, and only on a win', () => {
  const leave = scene.slice(scene.indexOf('private leaveWon('))
    .split('\n  }\n')[0]!
  assert.match(leave, /nextLevelId\(this\.level\.id\) === null/,
    'the credits are gated on a level id rather than on the game being over')
  assert.match(leave, /const first = over \? 'Credits' : then/,
    'the last level\'s comic does not hand over to the credits')
  assert.match(leave, /thenData: over \? \{ then \} : undefined/,
    'the button the player pressed is thrown away at the end of the game')
  // ONLY ON A WIN. `leaveWon` is reached from the win branch alone, which is
  // what the outro map's own note says and what this holds it to.
  const end = scene.slice(scene.indexOf("endRun(phase: 'won' | 'lost')"))
  assert.ok(!/lost[\s\S]{0,400}leaveWon/.test(end.slice(0, 4000)),
    'a loss reaches leaveWon, so a loss would play the outro')
  // And level 10 really is the last: nothing is unlocked by it.
  const unlockedByTen = LEVELS.filter((l) => l.unlockedBy === 'level10')
  assert.deepEqual(unlockedByTen, [], 'something comes after level 10')
})

test('the gliding block is read off levelRules, not off the sky', () => {
  // THE BUG THIS CLOSES: `glides` cost two things on level 5 and both were
  // read off `NightRules.gliding`, which is null for any level without a
  // day/night block -- so on level 10, whose BOSS hovers, the flag did
  // nothing at all. Level 5 gets the same object out of the same file.
  assert.match(scene, /private gliding: GlidingRules \| null = null/,
    'the scene has no gliding field of its own')
  assert.match(scene, /this\.gliding = \(levelRules\(this\.level\.id\)\?\.gliding/,
    'the gliding rules are not read from levelRules')
  assert.match(scene, /const g = e\.def\.glides \? this\.gliding : null/,
    'the hazard check still reads the sky for the gliding rules')
  const g5 = (levelRules('level5') as { gliding?: unknown } | null)?.gliding
  const g10 = (levelRules('level10') as { gliding?: unknown } | null)?.gliding
  assert.ok(g5 && g10, 'a level lost its gliding block')
  assert.deepEqual(Object.keys(g10 as object).filter((k) => !k.startsWith('_')).sort(),
    Object.keys(g5 as object).filter((k) => !k.startsWith('_')).sort(),
    'the two gliding blocks are different shapes, so one of them is not level 5\'s')
})

test('the soak fires three of the six, and fakes none of the other three', () => {
  const sim = readFileSync(url('../tools/soak/Sim.ts'), 'utf8')
  // THE THREE THAT RUN go through the SAME module functions the scene calls,
  // so the pacing and the no-duplicate-of-a-duplicate rule are one
  // implementation rather than two.
  for (const fn of ['armedAt(', 'tickSchedule(', 'copyTargets(', 'copyCount(',
    'hasteMultiplier(', 'hasteSeconds(']) {
    assert.ok(sim.includes(fn), `the sim reimplements ${fn} instead of calling it`)
  }
  assert.match(sim, /e\.def\.speed \* e\.speedScale \* e\.reviewSpeed \* e\.hasteSpeed/,
    'the sim has no haste slot, so speedAlter does nothing in it')
  // THE THREE THAT DO NOT are counted rather than approximated. A sim that
  // guessed at a build lock would publish a win rate for a level nobody plays.
  assert.match(sim, /vUnmodelled\.set\(id/,
    'the sim does not record the casts it cannot answer')
  for (const forbidden of ['towerHealth', 'towerDownSeconds', 'padLocks', 'wallBlocks']) {
    assert.ok(!sim.includes(forbidden),
      `the sim reads ${forbidden}, so it is pretending to model a power it cannot`)
  }
})

test('the three powers the soak cannot express are the ones a FULL board is immune to', () => {
  /*
   * THE CLAIM THIS REPLACES, and it was in three places.
   *
   * `SOAK-REPORT.md`, `enemies.json`'s `_health` note and CLAUDE.md all said
   * the same thing: the soak fires three of Vlaude's six powers and "provably
   * cannot express buildLock, generateWall or generateWeapon", so 26,000 was
   * "measured against a board easier than the one the player gets". That
   * conclusion does not follow from the rules, and this is the check.
   *
   * Against a board with every pad built on — which is what the soak's own
   * median board is at the final wave, 12 of 12 pads — all three are inert or
   * nearly so:
   *
   *   buildLock      locks pads, and `lockedPadStillFires()` is true. On a full
   *                  board there is nothing left to build, so the power takes
   *                  away a choice the player has already spent.
   *   generateWeapon `weaponPad` needs a pad that is neither occupied nor
   *                  locked. A full board has none, so the cast is SKIPPED.
   *   generateWall   the hero is the only thing in the game that can damage a
   *                  wall — asserted below against GameScene's own source — so
   *                  it costs the board no fire at all. It denies ground to the
   *                  hero and to a garrison's rally, which is real and is not
   *                  tower DPS.
   *
   * What the soak understates is therefore the fight for an INCOMPLETE board,
   * where a countermeasure takes a pad for as long as it takes one hero to chew
   * through 1,400 hp at armour 8. That is a real gap and it is stated as that
   * one rather than as "the shipped fight is harder than the measured one".
   */
  const full: Lockable[] = Array.from({ length: 12 }, (_, index) => (
    { index, occupied: true, locked: false }))
  assert.equal(weaponPad(full), null,
    'a countermeasure can be placed on a board with no free pad, which is the whole '
    + 'premise of "the player gets a power the soak does not"')
  // And buildLock still fires, still locks, and still costs a built pad nothing.
  const locked = lockTargets(R, full)
  assert.equal(locked.length, (R.powers.buildLock as { count: number }).count,
    'buildLock refuses a full board; it is supposed to lock occupied pads')
  assert.equal(lockedPadStillFires(), true)
  for (const i of locked) {
    assert.equal(full[i]!.occupied, true, 'buildLock changed what is on a pad')
  }
  // A LOCKED FULL BOARD STILL REFUSES A COUNTERMEASURE, which is the case
  // `fromWave: 14` creates — buildLock and speedAlter together.
  for (const i of locked) full[i]!.locked = true
  assert.equal(weaponPad(full), null)

  // THE WALL'S DAMAGE SOURCES, off the scene's own source. A regex because no
  // test in this repository can construct a Phaser scene; see CLAUDE.md.
  const game = readFileSync(new URL('../src/scenes/GameScene.ts', import.meta.url), 'utf8')
  const tick = game.slice(game.indexOf('private tickVlaudeWalls('))
  const body = tick.slice(0, tick.indexOf('\n  private wallBlocks('))
  assert.ok(body.length > 200, 'tickVlaudeWalls was not found; this check is measuring nothing')
  const hits = body.match(/w\.state\.health -= /g) ?? []
  assert.equal(hits.length, 1,
    `a wall now has ${hits.length} damage sources; if a tower can shoot one, it is a `
    + 'damage sink and this test\'s conclusion about a full board no longer holds')
  assert.match(body, /this\.hero\.damage/,
    'the one thing that damages a wall is no longer the hero')
  assert.doesNotMatch(body, /for \(const t of this\.towers\)/,
    'towers now shoot walls')
})
