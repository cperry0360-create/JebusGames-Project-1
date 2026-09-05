import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Disabler, pickDisableTarget, type DisableCandidate } from '../src/systems/TowerDisable.ts'
import { investedIn } from '../src/systems/Upgrades.ts'
import enemies from '../src/data/enemies.json' with { type: 'json' }
import towers from '../src/data/towers.json' with { type: 'json' }

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const E = enemies as Record<string, any>
const DEF = E.unicornBoss.towerDisable

/** A tower on the board, as the picker sees one. */
const tower = (over: Partial<DisableCandidate> & { name?: string } = {}) => ({
  x: 0, y: 0, value: 100, distanceToExit: 1000, disabledFor: 0, name: 'a tower', ...over,
})

/* --------------------------------------------------------------- the data */

test('the Rainbow Reaper carries the ability, and nothing else does', () => {
  assert.deepEqual(DEF, { cooldown: 7, windup: 1, duration: 3.5, range: 260 })
  const casters = Object.entries(E).filter(([, v]) => v.towerDisable).map(([k]) => k)
  assert.deepEqual(casters, ['unicornBoss'],
    'something other than the Reaper gained a tower-disable; levels 1 and 2 would change')
  // The windup has to fit inside the cooldown, or casts would overlap.
  assert.ok(DEF.windup < DEF.cooldown)
  // And the disable has to end before the next one lands, or a single tower
  // could be held down forever with nothing the player could do.
  assert.ok(DEF.duration < DEF.cooldown, 'the board can be held off permanently')
})

/* ------------------------------------------------------------- who it takes */

test('it takes the most expensive tower in range', () => {
  const cheap = tower({ x: 10, value: 80, name: 'cheap' })
  const dear = tower({ x: 20, value: 340, name: 'dear' })
  const dearer = tower({ x: 900, value: 900, name: 'out of range' })
  const got = pickDisableTarget([cheap, dear, dearer], 0, 0, 260)
  assert.equal(got?.name, 'dear', 'it did not take the most expensive one it could reach')
})

test('value means peanuts spent, upgrades included', () => {
  // The property that makes the ability interesting: a cheap tower upgraded
  // twice outranks an expensive one left at tier 1, so the boss punishes
  // concentration rather than the price on the card.
  const T = towers as Record<string, any>
  const base = investedIn(T.withholding, 1, null)
  const upgraded = investedIn(T.withholding, 3, null)
  assert.ok(upgraded > base, 'upgrades do not count toward what a tower cost')
  assert.ok(upgraded > T.rounding.cost,
    'this test needs an upgraded cheap tower to out-cost a dearer base one')

  const got = pickDisableTarget(
    [tower({ x: 10, value: T.rounding.cost, name: 'dearer, tier 1' }),
     tower({ x: 20, value: upgraded, name: 'cheaper, tier 3' })], 0, 0, 260)
  assert.equal(got?.name, 'cheaper, tier 3')
})

test('a tie goes to the tower furthest along the lane', () => {
  // Furthest along means least road left, so whatever walks past it has the
  // least chance of being stopped afterwards.
  const early = tower({ x: 10, value: 200, distanceToExit: 900, name: 'early' })
  const late = tower({ x: 20, value: 200, distanceToExit: 120, name: 'late' })
  assert.equal(pickDisableTarget([early, late], 0, 0, 260)?.name, 'late')
  assert.equal(pickDisableTarget([late, early], 0, 0, 260)?.name, 'late',
    'the tie-break depends on the order the towers happen to be listed in')
})

test('a tower already switched off is not picked again', () => {
  // Otherwise every cast lands on the same tower and the rest of the board is
  // never touched: the ability would fire and appear to do nothing.
  const dark = tower({ x: 10, value: 900, disabledFor: 2, name: 'already off' })
  const lit = tower({ x: 20, value: 100, name: 'still on' })
  assert.equal(pickDisableTarget([dark, lit], 0, 0, 260)?.name, 'still on')
  assert.equal(pickDisableTarget([dark], 0, 0, 260), null)
})

test('nothing in range means no cast and no cooldown spent', () => {
  const d = new Disabler(DEF)
  const far = [tower({ x: 5000, value: 900 })]
  for (let t = 0; t < 200; t++) assert.equal(d.tick(0.1, true, 0, 0, far), null)
  // The moment something comes into reach it casts, rather than being caught
  // waiting out a cooldown it never used.
  const near = [tower({ x: 40, value: 900 })]
  assert.equal(d.tick(0.1, true, 0, 0, near)?.kind, 'windup')
})

/* ------------------------------------------------------------- the clock */

test('one cast disables exactly one tower, after a full windup', () => {
  const d = new Disabler(DEF)
  const board = [tower({ x: 10, value: 100, name: 'a' }), tower({ x: 20, value: 300, name: 'b' }),
                 tower({ x: 30, value: 200, name: 'c' })]
  const events: string[] = []
  const landed: string[] = []
  // The first burst waits a full cooldown, so the boss does not open with one.
  for (let t = 0; t < 69; t++) {
    assert.equal(d.tick(0.1, true, 0, 0, board), null, `cast at ${(t + 1) / 10}s, before 7s`)
  }
  for (let t = 0; t < 100; t++) {
    const ev = d.tick(0.1, true, 0, 0, board)
    if (!ev) continue
    events.push(ev.kind)
    if (ev.kind === 'land') { landed.push((ev.target as any).name); (ev.target as any).disabledFor = DEF.duration }
  }
  assert.deepEqual(events.slice(0, 2), ['windup', 'land'], 'the cast did not telegraph first')
  assert.equal(landed[0], 'b', 'the first cast did not take the dearest tower')
  // One land per cast, never two.
  assert.equal(events.filter((e) => e === 'land').length,
    events.filter((e) => e === 'windup').length,
    'a windup landed more than one disable, or a disable landed with no windup')
})

test('the windup is a full second, and nothing else casts during it', () => {
  const d = new Disabler(DEF)
  const board = [tower({ x: 10, value: 300 })]
  let ev = null
  for (let t = 0; t < 80 && !ev; t++) ev = d.tick(0.1, true, 0, 0, board)
  assert.equal(ev!.kind, 'windup')
  assert.equal(d.casting, true)

  // The rest of the telegraph, with not a single further event in it. Run to
  // the landing rather than to a fixed tick count: each countdown crosses zero
  // one frame late on floating point, so the windup takes 11 ticks of 0.1 and
  // not 10.
  let ticks = 0
  let land = null
  while (!land && ticks < 20) {
    ticks++
    const next = d.tick(0.1, true, 0, 0, board)
    if (next === null) {
      assert.equal(d.casting, true, 'the cast ended without landing')
      continue
    }
    assert.equal(next.kind, 'land', 'a second cast started during the windup')
    land = next
  }
  assert.ok(land, 'the telegraph never landed')
  assert.ok(ticks >= 10 && ticks <= 11, `the windup ran ${ticks / 10}s, not 1s`)
  assert.equal(d.casting, false)
})

test('the cooldown runs from the landing, so the windup is not free time', () => {
  const d = new Disabler(DEF)
  const board = [tower({ x: 10, value: 300 })]
  const at: number[] = []
  for (let t = 1; t <= 400; t++) {
    const ev = d.tick(0.1, true, 0, 0, board)
    if (ev?.kind === 'land') { at.push(t / 10); board[0]!.disabledFor = 0 }
  }
  assert.ok(at.length >= 3, `only ${at.length} casts in 40 seconds`)
  // 7s cooldown + 1s windup = one landing every 8s, the first at 8s.
  //
  // The tolerance is 0.3 rather than a tenth because each countdown crosses
  // zero one tick late: subtracting 0.1 from 7.0 seventy times leaves about
  // +4e-16, which is still `> 0`. That costs one frame per phase, twice per
  // cast. It is the same `> 0` the tower cooldowns use, and a frame at 60Hz is
  // not worth a different pattern here -- but it is why this is not exact.
  assert.ok(Math.abs(at[0]! - 8) < 0.3, `first disable landed at ${at[0]}s, not 8s`)
  for (let i = 1; i < at.length; i++) {
    assert.ok(Math.abs((at[i]! - at[i - 1]!) - 8) < 0.3,
      `disables landed ${(at[i]! - at[i - 1]!).toFixed(1)}s apart, not 8s`)
  }
})

/* ------------------------------------------------------ while the boss lives */

test('a dead boss casts nothing, and drops a cast it had started', () => {
  const d = new Disabler(DEF)
  const board = [tower({ x: 10, value: 300 })]
  let ev = null
  for (let t = 0; t < 80 && !ev; t++) ev = d.tick(0.1, true, 0, 0, board)
  assert.equal(ev!.kind, 'windup', 'the boss never started a cast to interrupt')

  // Killed mid-telegraph. The half-finished cast goes with it -- a tower going
  // dark after the boss is gone is the version a player would call unfair.
  for (let t = 0; t < 400; t++) {
    assert.equal(d.tick(0.1, false, 0, 0, board), null, 'a dead boss cast')
  }
  assert.equal(d.casting, false)
  assert.equal(board[0]!.disabledFor, 0, 'a tower was disabled after the boss died')
})

/* ---------------------------------------- what being switched off does to it */

test('a disabled tower deals no damage, then comes back with a full cooldown', () => {
  // The rule walked out against a firing loop, because "does not fire" and
  // "does not reload" are separate properties and only one of them is obvious.
  const FIRE_INTERVAL = 1.0
  const DMG = 10
  const run = (disableAt: number | null) => {
    const t = { cooldown: 0, disabledFor: 0 }
    let dealt = 0
    const shots: number[] = []
    for (let step = 1; step <= 120; step++) {
      const now = step * 0.1
      if (disableAt !== null && Math.abs(now - disableAt) < 1e-9) t.disabledFor = DEF.duration
      if (t.disabledFor > 0) {
        t.disabledFor -= 0.1
        if (t.disabledFor <= 0) { t.disabledFor = 0; t.cooldown = FIRE_INTERVAL }
        continue                       // no shot AND no reload
      }
      t.cooldown -= 0.1
      if (t.cooldown > 0) continue
      t.cooldown = FIRE_INTERVAL
      dealt += DMG
      shots.push(Number(now.toFixed(1)))
    }
    return { dealt, shots }
  }

  const undisturbed = run(null)
  const interrupted = run(3.0)
  assert.ok(undisturbed.dealt > 0)

  // Nothing at all lands in the three and a half seconds it is off.
  const during = interrupted.shots.filter((s) => s > 3.0 && s <= 6.5)
  assert.deepEqual(during, [], `it fired while disabled, at ${during.join(', ')}s`)

  // And it does not come back firing: a FULL interval passes after recovery.
  const after = interrupted.shots.find((s) => s > 6.5)!
  assert.ok(after >= 6.5 + FIRE_INTERVAL - 1e-6,
    `it fired ${(after - 6.5).toFixed(1)}s after recovering, without a full reload`)

  // Which is the whole cost of the ability: strictly less damage, and more than
  // the disable's own length because of the fresh cooldown on the way out.
  assert.ok(interrupted.dealt < undisturbed.dealt, 'being switched off cost it nothing')
})

/* --------------------------------------------------------------- the wiring */

test('the scene and the sim both drive the one rule module', () => {
  const scene = src('src/scenes/GameScene.ts')
  const sim = src('tools/soak/Sim.ts')
  const tower = src('src/entities/Tower.ts')

  assert.match(scene, /d\.tick\(dt, e\.alive, e\.x, e\.y, candidates\)/,
    'GameScene does not ask whether the caster is alive')
  assert.match(sim, /e\.disabler\.tick\(dt, e\.alive, e\.x, e\.y, towers\)/,
    'Sim does not ask whether the caster is alive')
  // The tower stops before it reloads, not after.
  const tick = tower.slice(tower.indexOf('  tick(dt: number'))
  const off = tick.indexOf('this.disabledFor > 0')
  const reload = tick.indexOf('this.cooldown -= dt')
  assert.ok(off >= 0 && reload >= 0 && off < reload,
    'a disabled tower still runs its reload down')
  assert.match(tick, /this\.cooldown = this\.fireInterval/,
    'the tower does not take a fresh cooldown when it recovers')
  // And the sim models it, or the level 3 win rate would be a fiction.
  assert.match(sim, /t\.disabledFor > 0/, 'the sim ignores a disabled tower')
  assert.match(sim, /ev\.target\.disabledFor = e\.def\.towerDisable\.duration/,
    'the sim never actually switches a tower off')
})

test('the art is registered as the sheets it actually is', () => {
  const art = JSON.parse(src('src/data/art.json'))
  assert.equal(art.files[art.fx.bossBolt], 'effects/boss_projectile.png')
  assert.equal(art.files[art.fx.stunned], 'effects/fx_stunned.png')
  assert.deepEqual(art.render[art.fx.bossBolt].sheet, { frameWidth: 482, frameHeight: 412, frames: 8 })
  assert.deepEqual(art.render[art.fx.stunned].sheet, { frameWidth: 617, frameHeight: 499, frames: 6 })

  // PLAYED STRAIGHT THROUGH, ONCE. Neither sheet loops seamlessly, so a
  // repeating animation would show a jump on every pass. Both go through the
  // shared registration in systems/Effects.ts, which creates every sheet's
  // animation with `repeat: 0`; the scene then plays each once at a fixed
  // duration and holds, rather than asking for a cycle.
  const effects = src('src/systems/Effects.ts')
  assert.match(effects, /repeat: 0,/, 'the shared effect animations are no longer one-shot')
  const scene = src('src/scenes/GameScene.ts')
  for (const key of ['bossBolt', 'stunned']) {
    assert.match(scene, new RegExp(`play\\(\\{ key: ART\\.fx\\.${key}, duration: `),
      `${key} is not played once at a fixed duration`)
  }
  // What runs for the rest of the disable is an ALPHA pulse on the finished
  // overlay, not the frames going round again.
  const land = scene.slice(scene.indexOf('private landDisable'))
  const pulse = land.slice(land.indexOf('repeat: -1'))
  assert.ok(land.indexOf('repeat: -1') >= 0 && /alpha/.test(land.slice(0, land.indexOf('repeat: -1'))),
    'the only looping thing in landDisable is not the alpha pulse')
  assert.ok(pulse.length > 0)
})
