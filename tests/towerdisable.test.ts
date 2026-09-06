import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Disabler, pickDisableTarget, type DisableCandidate } from '../src/systems/TowerDisable.ts'
import { BuildSystem } from '../src/systems/BuildSystem.ts'
import { investedIn } from '../src/systems/Upgrades.ts'
import enemies from '../src/data/enemies.json' with { type: 'json' }
import towers from '../src/data/towers.json' with { type: 'json' }

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const E = enemies as Record<string, any>
const DEF = E.unicornBoss.towerDisable
const KILL = E.glitchBug.towerDisable

/** A tower on the board, as the picker sees one. */
const tower = (over: Partial<DisableCandidate> & { name?: string } = {}) => ({
  x: 0, y: 0, value: 100, distanceToExit: 1000, disabledFor: 0, name: 'a tower', ...over,
})

/* --------------------------------------------------------------- the data */

test('two enemies carry the ability, and they differ by one field', () => {
  assert.deepEqual(DEF, { cooldown: 7, windup: 1, duration: 3.5, range: 260 })
  const casters = Object.entries(E).filter(([, v]) => v.towerDisable).map(([k]) => k)
  assert.deepEqual(casters, ['unicornBoss', 'glitchBug'],
    'the set of tower-attackers changed; levels 1 and 2 must not gain one')
  // The Reaper switches a tower off. The Glitch Bug takes it away. Everything
  // before the cast lands is the same rule and is not written twice.
  assert.ok(!DEF.destroys, 'the Reaper started destroying towers')
  assert.equal(KILL.destroys, true, 'the Glitch Bug only switches towers off')
  assert.equal(KILL.duration, 0, 'a destroyed tower has a duration, which means nothing')
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

/* ------------------------------------------- the Glitch Bug, which destroys */

test('the bug takes exactly one tower per cycle, after a full windup', () => {
  const a = tower({ x: 10, value: 300, name: 'a' })
  const b = tower({ x: 20, value: 100, name: 'b' })
  const d = new Disabler(KILL)
  const landed: string[] = []
  const wound: string[] = []
  // Twenty seconds at 60fps: two full 8-second cycles and change.
  for (let i = 0; i < 1200; i++) {
    const ev = d.tick(1 / 60, true, 0, 0, [a, b])
    if (ev?.kind === 'windup') wound.push(ev.target.name!)
    if (ev?.kind === 'land') landed.push(ev.target.name!)
  }
  assert.equal(landed.length, 2, `${landed.length} towers taken in 20s at an 8s cooldown`)
  assert.equal(wound.length, 2, 'a windup started that never landed, or one landed unannounced')
  // And every landing was announced first, pointing at the tower it took.
  assert.deepEqual(landed, wound, 'the telegraph pointed at a tower the cast did not take')
})

test('the bug takes the most valuable tower in range, upgrades counted', () => {
  const T = towers as Record<string, any>
  const cheapButUpgraded = investedIn(T.withholding, 3, null)   // 80 -> 192
  const dearButBase = T.writeoff.cost                          // 150
  assert.ok(cheapButUpgraded > dearButBase, 'this test needs the upgraded one to cost more')

  const got = pickDisableTarget([
    tower({ x: 10, value: dearButBase, name: 'dear, tier 1' }),
    tower({ x: 20, value: cheapButUpgraded, name: 'cheap, tier 3' }),
    tower({ x: 900, value: 100000, name: 'out of range' }),
  ], 0, 0, KILL.range)
  assert.equal(got?.name, 'cheap, tier 3',
    'the bug does not measure a tower by the peanuts sunk into it')
})

test('killing the bug during the windup saves the tower', () => {
  // THE ANSWER THE FIGHT IS ASKING FOR. The cast cannot be interrupted once it
  // starts -- but the caster can, and a second and a half is enough time to do
  // something about it if the board can reach the air at all.
  const t = tower({ x: 10, value: 400, name: 'the good one' })
  const d = new Disabler(KILL)
  let started = false
  for (let i = 0; i < 600 && !started; i++) {
    started = d.tick(1 / 60, true, 0, 0, [t])?.kind === 'windup'
  }
  assert.ok(started, 'the bug never began a cast')
  assert.ok(d.casting, 'the telegraph is not running')

  // Shot down half a second into the windup.
  for (let i = 0; i < 30; i++) {
    const ev = d.tick(1 / 60, false, 0, 0, [t])
    assert.equal(ev, null, 'a dead bug landed a cast it had started')
  }
  assert.ok(!d.casting, 'the telegraph is still pointing at a tower after the bug died')
})

test('no windup starts once the bug is dead, however long the board waits', () => {
  const t = tower({ x: 10, value: 400, name: 'the good one' })
  const d = new Disabler(KILL)
  for (let i = 0; i < 3600; i++) {
    assert.equal(d.tick(1 / 60, false, 0, 0, [t]), null, 'a dead bug cast something')
  }
  assert.ok(!d.casting)
})

test('a dark tower is still worth taking, unlike one worth disabling', () => {
  // The two casts want different things from the same picker. Re-disabling a
  // tower that is already off is a wasted cast and the Reaper skips it; taking
  // it away is not wasted at all, and cannot loop -- it is gone afterwards.
  const dark = tower({ x: 10, value: 500, disabledFor: 2, name: 'dark but dear' })
  const lit = tower({ x: 20, value: 200, name: 'lit and cheap' })
  assert.equal(pickDisableTarget([dark, lit], 0, 0, 260)?.name, 'lit and cheap',
    'the Reaper re-picked a tower that was already off')
  assert.equal(pickDisableTarget([dark, lit], 0, 0, 260, false)?.name, 'dark but dear',
    'the bug passed over the most expensive tower on the board because it was off')
})

test('the pad a destroyed tower stood on goes free, and can be built on again', () => {
  // The scene and the sim both have to release it, or the loss is permanent in
  // a way nothing in the design says it should be: what the player gets back
  // is the pad, and the peanuts to rebuild are the price of not killing the
  // bug in time.
  const build = new BuildSystem([[100, 100], [400, 400]], 34)
  build.occupy(0)
  assert.equal(build.isFree(0), false)
  build.release(0)
  assert.equal(build.isFree(0), true, 'a released pad is not free')
  assert.equal(build.freeSpots().length, 2)

  const scene = src('src/scenes/GameScene.ts')
  const destroy = scene.slice(scene.indexOf('private destroyTower(tower: Tower, by: Enemy)'),
                              scene.indexOf('/** The lights go out. */'))
  assert.ok(destroy.length > 0, 'GameScene has no destroyTower')
  assert.match(destroy, /this\.build\.release\(tower\.spot\)/,
    'the destroyed tower keeps its pad, so nothing can ever be built there again')
  assert.match(destroy, /this\.towers = this\.towers\.filter\(\(t\) => t !== tower\)/,
    'the destroyed tower is still on the board')
  assert.match(destroy, /tower\.destroy\(\)/, 'the sprite outlives the tower')
  assert.match(destroy, /this\.refreshSupport\(\)/,
    'a destroyed Shelter goes on lifting its neighbours')
  assert.doesNotMatch(destroy, /setPeanuts|earn\(/,
    'a destroyed tower is refunded, which is not what destroyed means')
})

test('the scene and the sim both branch on destroys, and only there', () => {
  const scene = src('src/scenes/GameScene.ts')
  const sim = src('tools/soak/Sim.ts')
  // One branch each. Everything before the cast lands is the shared rule.
  assert.match(scene, /\} else if \(d\.destroys\) \{\n\s*this\.destroyTower\(/,
    'GameScene does not destroy on a destroying cast')
  assert.match(sim, /if \(e\.disabler\.destroys\) \{/, 'the sim does not model the destroy')
  assert.match(sim, /towers\.splice\(i, 1\)/, 'the sim leaves the destroyed tower shooting')
  assert.match(sim, /build\.release\(ev\.target\.spot\)/,
    'the sim never gives the pad back, so a soaked run cannot rebuild')
  // And the telegraph tells the two casts apart, since they cost very
  // different things.
  assert.match(scene, /destroys \? 0xff3b30 : 0xff5ce0/,
    'the kill and the stun telegraph identically')
})

test('the art is registered as the sheets it actually is', () => {
  const art = JSON.parse(src('src/data/art.json'))
  assert.equal(art.files[art.fx.bossBolt], 'effects/boss_projectile.webp')
  assert.equal(art.files[art.fx.stunned], 'effects/fx_stunned.webp')
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
