import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AIR, GROUND, GROUND_ONLY, canHit, layerOf, pickFirst, withinRadius,
} from '../src/systems/Targeting.ts'
import { airCoverProblems, hitsAir } from '../src/systems/AirCover.ts'
import towers from '../src/data/towers.json' with { type: 'json' }
import enemies from '../src/data/enemies.json' with { type: 'json' }
import draft from '../src/data/draft.json' with { type: 'json' }
import waves1 from '../src/data/waves.json' with { type: 'json' }
import waves2 from '../src/data/waves.level2.json' with { type: 'json' }

const T = towers as Record<string, { targets?: string[]; range?: number; supportRadius?: number }>
const E = enemies as Record<string, { layer?: string }>

/** A thing to shoot at, `distance` doubling as how far along it is. */
const mob = (x: number, y: number, layer: string, distance = 0) =>
  ({ x, y, layer, distance, alive: true })

/* --------------------------------------------------------------- the default */

test('absent means ground, in both directions', () => {
  // The two defaults are not symmetrical and that is deliberate. An enemy that
  // says nothing is on the ground; a TOWER that says nothing shoots ground
  // only — the safe direction for each to fail in.
  assert.equal(layerOf({}), GROUND)
  assert.equal(layerOf({ layer: AIR }), AIR)
  assert.deepEqual(GROUND_ONLY, [GROUND])
  assert.equal(hitsAir({ } as never), false, 'a tower with no targets gained air')

  // And undefined targets means NO filter, which is what the hero, the
  // fighters and every ability pass — they hit whatever is in reach, exactly
  // as they did before layers existed.
  assert.equal(canHit(undefined, AIR), true)
  assert.equal(canHit(undefined, GROUND), true)
  assert.equal(canHit([GROUND], AIR), false)
  assert.equal(canHit([GROUND, AIR], AIR), true)
})

test('every existing enemy is on the ground, so levels 1 to 3 are unchanged', () => {
  for (const [id, def] of Object.entries(E)) {
    assert.equal(layerOf(def), GROUND, `${id} is no longer a ground enemy`)
  }
})

test('every tower that shoots can hit air; the one that does not shoot cannot', () => {
  for (const [id, def] of Object.entries(T)) {
    if (!def || typeof def !== 'object' || !('targets' in def)) continue
    const shoots = (def.range ?? 0) > 0 && !(def.supportRadius ?? 0)
    assert.equal(hitsAir(def as never), shoots,
      `${id} ${shoots ? 'shoots but cannot hit air' : 'does not shoot but claims air'}`)
  }
})

/* ------------------------------------------------------- what a tower sees */

test('a ground-only tower ignores an air enemy standing right on top of it', () => {
  const air = mob(10, 0, AIR)
  const ground = mob(60, 0, GROUND)

  // In range, closer, and further along — and still not picked.
  assert.equal(pickFirst([air], 0, 0, 200, [GROUND]), null,
    'a ground-only tower targeted something in the air')
  assert.equal(pickFirst([air, ground], 0, 0, 200, [GROUND]), ground,
    'the ground-only tower did not fall through to the enemy it CAN hit')
  assert.deepEqual(withinRadius([air, ground], 0, 0, 200, [GROUND]), [ground])
})

test('an air-capable tower hits the air enemy, and still prefers the furthest along', () => {
  const air = mob(10, 0, AIR, 500)
  const ground = mob(20, 0, GROUND, 100)
  assert.equal(pickFirst([air, ground], 0, 0, 200, [GROUND, AIR]), air,
    'the air-capable tower did not take the flyer that was furthest along')
  assert.equal(withinRadius([air, ground], 0, 0, 200, [GROUND, AIR]).length, 2)
})

test('a tower with nothing it can hit does not fire and does not spend its cooldown', () => {
  // The property, stated as the code states it: `tick` returns BEFORE it
  // assigns the cooldown, so a tower that spent the wave looking at a flyer it
  // cannot touch is ready the instant something walkable arrives — rather than
  // caught reloading, which is the bug this ordering avoids.
  const code = readFileSync(new URL('../src/entities/Tower.ts', import.meta.url), 'utf8')
  const tick = code.slice(code.indexOf('  tick(dt: number'), code.indexOf('this.rampTarget !== target'))
  const pick = tick.indexOf('pickFirst(')
  const noTarget = tick.indexOf('if (!target) return')
  const setCooldown = tick.indexOf('this.cooldown = this.fireInterval')
  assert.ok(pick >= 0 && noTarget >= 0 && setCooldown >= 0, 'tick no longer has the shape this describes')
  assert.ok(noTarget < setCooldown,
    'the cooldown is spent before the tower knows whether it had a target')
  assert.match(tick, /pickFirst\(enemies, this\.x, this\.y, this\.range, this\.targets\)/,
    'the tower no longer passes what it can shoot to the target picker')
})

/* ------------------------------- a board that cannot answer what it is sent */

test('a board of ground-only towers cannot stop an air enemy', () => {
  // The whole point of the layer, walked out: three ground-only towers spread
  // along the lane, an air enemy walking past every one of them, and not a
  // single shot fired at it. The same walk with an air-capable tower kills it,
  // so the test is measuring the layer and not a broken loop.
  const LANE_LEN = 600
  const walk = (targets: readonly string[], layer: string) => {
    const towerLine = [150, 300, 450].map((x) => ({ x, y: 0, range: 120, cooldown: 0 }))
    const e = { x: 0, y: 0, layer, distance: 0, alive: true, health: 100 }
    let shots = 0
    for (let t = 0; t < LANE_LEN && e.alive; t++) {
      e.x = t
      e.distance = t
      for (const tw of towerLine) {
        tw.cooldown -= 1
        if (tw.cooldown > 0) continue
        const target = pickFirst([e], tw.x, tw.y, tw.range, targets)
        if (!target) continue          // no target: no shot AND no cooldown spent
        tw.cooldown = 10
        shots++
        target.health -= 20
        if (target.health <= 0) target.alive = false
      }
    }
    return { shots, reachedExit: e.alive }
  }

  const groundOnly = walk([GROUND], AIR)
  assert.equal(groundOnly.shots, 0, 'a ground-only board fired at an air enemy')
  assert.equal(groundOnly.reachedExit, true, 'the air enemy died to towers that cannot hit air')

  // The control: the identical board that CAN hit air stops it.
  const airCapable = walk([GROUND, AIR], AIR)
  assert.ok(airCapable.shots > 0, 'the air-capable board never fired')
  assert.equal(airCapable.reachedExit, false, 'the air-capable board failed to stop it')

  // And the same ground-only board still stops a ground enemy, so it is the
  // layer doing the work rather than the towers being broken.
  const onGround = walk([GROUND], GROUND)
  assert.ok(onGround.shots > 0)
  assert.equal(onGround.reachedExit, false)
})

/* ------------------------------------------------------------- the checker */

const check = (levelId: string, waves: unknown) => airCoverProblems({
  levelId, waves: waves as never, enemies: enemies as never,
  towers: towers as never, draft: draft as never,
})

test('the shipped levels have air cover for everything they send', () => {
  assert.deepEqual(check('level1', waves1), [])
  assert.deepEqual(check('level2', waves2), [])
})

test('the checker fails a level that sends air with no way to answer it', () => {
  const flyer = { ...(E.lateFiler as object), layer: AIR }
  const airWave = { waves: [{ name: 'Flypast', spawns: [{ enemy: 'flyer', count: 3, interval: 1, delay: 0 }] }] }

  // No air-capable tower in the pool at all.
  const allGround = Object.fromEntries(
    Object.entries(T).map(([k, v]) => [k, { ...(v as object), targets: [GROUND] }]))
  const none = airCoverProblems({
    levelId: 'level9', waves: airWave as never,
    enemies: { flyer } as never, towers: allGround as never, draft: draft as never,
  })
  assert.equal(none.length, 1)
  assert.match(none[0]!, /no tower in the draft pool can shoot air at all/)

  // And the subtler one: air cover EXISTS, but the draft can still deal a hand
  // without it, so the wave is unwinnable through no fault of play.
  const oneFlyer = Object.fromEntries(
    Object.entries(T).map(([k, v], i) => [k, { ...(v as object), targets: i === 0 ? [GROUND, AIR] : [GROUND] }]))
  const unlucky = airCoverProblems({
    levelId: 'level9', waves: airWave as never,
    enemies: { flyer } as never, towers: oneFlyer as never, draft: draft as never,
  })
  assert.equal(unlucky.length, 1)
  assert.match(unlucky[0]!, /drawn entirely from the \d+ ground-only ones/)
})

test('the checker is satisfied once air cover cannot be drafted around', () => {
  const flyer = { ...(E.lateFiler as object), layer: AIR }
  const airWave = { waves: [{ name: 'Flypast', spawns: [{ enemy: 'flyer', count: 3, interval: 1, delay: 0 }] }] }
  // The real roster: five of the six shoot air, so a two-tower opening hand
  // cannot be all ground.
  assert.deepEqual(airCoverProblems({
    levelId: 'level9', waves: airWave as never, enemies: { flyer } as never,
    towers: towers as never, draft: draft as never,
  }), [])
})
