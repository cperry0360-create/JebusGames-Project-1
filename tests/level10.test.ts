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
  assert.equal(leakEndsRun(R, enemies.vlaude, 'vlaude'), true)
  assert.equal(leakEndsRun(R, enemies.corrupt, 'corrupt'), false,
    'an ordinary leak ends the run')
  assert.equal(leakEndsRun(R, enemies.callbackLich, 'callbackLich'), false,
    'a callback reaching the exit ends the run')
  assert.equal(leakEndsRun(null, enemies.vlaude, 'vlaude'), false,
    'a level with no rules block ends its run on a leak')
  // NOT A LIFE DEDUCTION. His livesCost is a backstop that is never charged,
  // and it is under the starting life count so that removing the flag would
  // leave the player alive rather than silently winning.
  const rules = read('rules')
  assert.ok(enemies.vlaude.livesCost < rules.startingLives,
    'Vlaude\'s leak is an instant loss through the life count, which hides the rule')
  assert.ok(enemies.vlaude.livesCost >= 5)
})

test('the comics play on a win and the title card is not one of them', () => {
  const cut = read('cutscenes')
  assert.deepEqual(cut.outros.level10, [
    'cutscenes/cutscene_L10_01.webp',
    'cutscenes/cutscene_L10_02.webp',
    'cutscenes/cutscene_L10_03.webp',
  ], 'the three comics are not level 10\'s outro, in order')
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
