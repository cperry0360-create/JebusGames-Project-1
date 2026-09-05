import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clampToCastRange, distanceToSegment, hazardExpired, makeHazard, powerRefusal,
  rainPoints, tickHazard, withinCastRange, withinDash,
} from '../src/systems/HeroPowers.ts'
import { facesLeft, mirroredFor } from '../src/systems/Facing.ts'
import { Cooldowns } from '../src/systems/Cooldowns.ts'
import type { HeroPowerDef } from '../src/types.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const code = (p: string) =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const HEROES = JSON.parse(readFileSync(url('../src/data/heroes.json'), 'utf8'))
const IDS = Object.keys(HEROES).filter((k) => !k.startsWith('_'))
const power = (id: string): HeroPowerDef => HEROES[id].slot2

/* --------------------------------------------------------------- facing */

test('every hero faces the way it is going, in both forms', () => {
  /*
   * THE BUG. The hero renderer carried "both hero sprites are drawn facing
   * LEFT" as a blanket rule, with the shared facing test asked about the
   * REVERSED heading to match. That was true of Cory, who was the only hero
   * when it was written — and every frame of him, walk, attack and the SUV,
   * does face left. The four heroes added afterwards are all drawn facing
   * right, so all four walked backwards everywhere they went.
   *
   * Fixed as data: which way the art points is a property of the hero.
   */
  for (const id of IDS) {
    assert.ok(['left', 'right'].includes(HEROES[id].artFacing),
      `${id} does not declare which way its art is drawn`)
  }
  assert.equal(HEROES.cory.artFacing, 'left', 'Cory is drawn facing left')
  for (const id of IDS.filter((i) => i !== 'cory')) {
    assert.equal(HEROES[id].artFacing, 'right', `${id} is drawn facing right`)
  }

  // The rule itself: mirrored exactly when the heading disagrees with the art.
  assert.equal(mirroredFor(false, 'right'), false, 'right-facing art walking right is flipped')
  assert.equal(mirroredFor(true, 'right'), true, 'right-facing art walking left is not flipped')
  assert.equal(mirroredFor(false, 'left'), true, 'left-facing art walking right is not flipped')
  assert.equal(mirroredFor(true, 'left'), false, 'left-facing art walking left is flipped')

  // Driven end to end, the way the entity does it: a heading from an angle,
  // then the mirror from the heading. East, west and both diagonals.
  const dead = 0.2
  for (const [name, angle, goingLeft] of [
    ['east', 0, false], ['west', Math.PI, true],
    ['north-east', -Math.PI / 4, false], ['south-west', (Math.PI * 3) / 4, true],
  ] as const) {
    const heading = facesLeft(angle, false, dead)
    assert.equal(heading, goingLeft, `${name} was read as the wrong heading`)
    for (const id of IDS) {
      const flipped = mirroredFor(heading, HEROES[id].artFacing)
      // The character's own left is the direction it ends up pointing: art
      // facing right, unflipped, points right.
      const pointsLeft = HEROES[id].artFacing === 'left' ? !flipped : flipped
      assert.equal(pointsLeft, goingLeft,
        `${id} walks ${name} facing the other way`)
    }
  }
})

test('the renderer asks the hero which way its art faces, and nothing else does', () => {
  const hero = code('entities/Hero.ts')
  assert.match(hero, /mirroredFor\(this\.headingLeft, this\.def\.artFacing\)/,
    'the mirror is not derived from the hero and the heading')
  // The blanket inversion is gone.
  assert.doesNotMatch(hero, /angle \+ Math\.PI/,
    'the facing test is still asked about a reversed heading')
  assert.doesNotMatch(hero, /facingRight/, 'the inverted flag is back')
  // The flip and the ground-anchor correction move together, in one place:
  // they are the same decision and five call sites did it by hand.
  assert.match(hero, /private applyFacing\(\): void \{/, 'the flip is applied ad hoc again')
  const apply = hero.slice(hero.indexOf('private applyFacing'))
  const body = apply.slice(0, apply.indexOf('\n  }'))
  assert.match(body, /setFlipX\(this\.mirrored\)/)
  assert.match(body, /this\.mirrored \? -this\.artOffset : this\.artOffset/,
    'the anchor correction does not follow the mirror')
  // Both forms go through it — the base sprite, the powered swap and the SUV.
  assert.ok((hero.match(/this\.applyFacing\(\)/g) ?? []).length >= 5,
    'some sprite swap sets the texture without re-applying the facing')
  // And nothing hardcodes a hero's side.
  assert.doesNotMatch(hero, /'left'|'right'/, 'a facing side is hardcoded in the renderer')
})

/* ---------------------------------------------------------- the slot 2 gate */

test('a hero power is blocked in base form and works in powered form', () => {
  for (const id of IDS) {
    const p = power(id)
    assert.equal(powerRefusal(p, false, false, true), 'base-form',
      `${id}'s power fires in base form`)
    assert.equal(powerRefusal(p, true, false, true), null,
      `${id}'s power is refused in powered form`)
    assert.equal(powerRefusal(p, true, true, true), 'down',
      `${id}'s power fires while the hero is down`)
    assert.equal(powerRefusal(p, true, false, false), 'cooling',
      `${id}'s power ignores its cooldown`)
    // The order matters: a hero who is down is not "in base form", and a power
    // that does not exist is not "on cooldown".
    assert.equal(powerRefusal({ ...p, effect: null }, true, false, true), 'unbuilt')
  }
})

test('the transformation hands the power straight back', () => {
  // Slot 2 is gated on the powered form, so a hero who changes with the clock
  // half-run has a button that has just become usable and is not usable yet —
  // which reads as the gate being broken rather than as a cooldown. Changing
  // IS the recharge.
  const p = power('bailey')
  const cd = new Cooldowns()
  cd.register('heroSlot2', p.cooldown)
  cd.start('heroSlot2')
  assert.equal(cd.ready('heroSlot2'), false)
  assert.equal(powerRefusal(p, true, false, cd.ready('heroSlot2')), 'cooling')

  cd.reset('heroSlot2')                       // what the 'powered' handler does
  assert.equal(cd.ready('heroSlot2'), true)
  assert.equal(powerRefusal(p, true, false, cd.ready('heroSlot2')), null)

  // And the scene actually wires it to the transformation.
  const game = code('scenes/GameScene.ts')
  assert.match(game, /this\.hero\.on\('powered', \(\) => \{[\s\S]{0,200}?this\.cooldowns\.reset\(SLOT2\)/,
    'the cooldown is not reset when the hero powers up')
  assert.match(game, /this\.cooldowns\.register\(SLOT2, heroDef\.slot2\.cooldown\)/,
    'the power cooldown is a constant in the scene again')
})

/* ------------------------------------------------------------ the targeting */

test('a targeted power is refused outside its radius and cancels for free', () => {
  const p = power('han')
  const hero = { x: 400, y: 300 }
  assert.equal(withinCastRange(p, hero, 400, 300), true, 'the hero cannot cast on himself')
  assert.equal(withinCastRange(p, hero, 400 + p.castRadius - 1, 300), true)
  assert.equal(withinCastRange(p, hero, 400 + p.castRadius + 1, 300), false,
    'a tap past the radius is legal')
  // Refused, never quietly moved: the clamp exists for the harness, and the
  // scene does not use it on a tap.
  const far = clampToCastRange(p, hero, 4000, 300)
  assert.ok(Math.abs(Math.hypot(far.x - hero.x, far.y - hero.y) - p.castRadius) < 0.001)
  assert.doesNotMatch(code('scenes/GameScene.ts'), /clampToCastRange/,
    'a tap outside the radius is being clamped instead of refused')

  // The scene resolves the tap through the shared targeting mode, so a power
  // gets the same four ways out that an ability does.
  const game = code('scenes/GameScene.ts')
  assert.match(game, /this\.targeting\.arm\(\{ kind: 'power', id: SLOT2 \}\)/,
    'the hero power does not go through the shared targeting mode')
  assert.match(game, /pending\?\.kind === 'power'/, 'a tap is not resolved for a power')
  assert.match(game, /withinCastRange\(p, \{ x: this\.hero\.x, y: this\.hero\.y \}, w\.x, w\.y\)/,
    'the legality of the tap is not the cast radius')
})

/* --------------------------------------------------------------- the effects */

test('Zoomies hurts what she runs through, not what is at the end', () => {
  const p = power('bailey')
  const from = { x: 0, y: 0 }
  const to = { x: 300, y: 0 }
  // Halfway along, inside the corridor.
  assert.equal(withinDash({ x: 150, y: p.radius - 1 }, from, to, p.radius), true,
    'something she runs straight through is missed')
  assert.equal(withinDash({ x: 150, y: p.radius + 1 }, from, to, p.radius), false)
  // Behind her, and past the far end.
  assert.equal(withinDash({ x: -60, y: 0 }, from, to, p.radius), false,
    'the dash hits things behind her')
  assert.equal(withinDash({ x: 380, y: 0 }, from, to, p.radius), false,
    'the dash reaches past where it stopped')
  // A degenerate dash is a circle, not a crash.
  assert.equal(distanceToSegment({ x: 3, y: 4 }, from, from), 5)

  // And she MOVES: the power is the run, so the hero is sent to the point.
  const game = code('scenes/GameScene.ts')
  const dash = game.slice(game.indexOf('private powerDash('))
  const body = dash.slice(0, dash.indexOf('\n  }'))
  assert.match(body, /this\.hero\.setRally\(x, y\)/, 'Zoomies does not move Bailey')
  assert.match(body, /knockBack\(p\.knockbackPixels\)/, 'Zoomies knocks nothing back')
  assert.match(body, /withinDash/, 'the dash damages a circle rather than its corridor')
})

test('Star Rain scatters evenly over its area, and lands over time', () => {
  const p = power('eli')
  // A known scatter: the rng is passed in, so the test drives it.
  let n = 0
  const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
  const points = rainPoints(p, { x: 100, y: 100 }, () => seq[n++ % seq.length]!)
  assert.equal(points.length, p.hits, 'the rain does not land the hits it declares')
  for (const q of points) {
    assert.ok(Math.hypot(q.x - 100, q.y - 100) <= p.radius + 0.001,
      'a strike landed outside the area')
  }
  // Even across the AREA, not across the radius: without the sqrt the strikes
  // bunch in the middle, because a disc has more area further out. Half the
  // radius holds a quarter of the area, so about a quarter of the strikes.
  let inner = 0
  const many = rainPoints({ ...p, hits: 4000 }, { x: 0, y: 0 }, () => Math.random())
  for (const q of many) if (Math.hypot(q.x, q.y) <= p.radius / 2) inner++
  assert.ok(Math.abs(inner / many.length - 0.25) < 0.04,
    `${((inner / many.length) * 100).toFixed(0)}% of strikes fell in the inner quarter, not ~25%`)

  // Spread over time, and resolved where each one lands rather than all at once.
  const game = code('scenes/GameScene.ts')
  const rain = game.slice(game.indexOf('private powerRain('))
  assert.match(rain.slice(0, rain.indexOf('\n  }')), /delayedCall\(p\.gapSeconds \* 1000 \* i/,
    'every strike lands on the same frame')
})

test('a Spike Strip persists, charges on a clock, and expires', () => {
  const p = power('cory')
  const h = makeHazard(p, 100, 100)
  assert.equal(hazardExpired(h), false, 'the strip is finished before it starts')
  // It charges immediately: something already standing on it should not get a
  // free tick before it notices.
  assert.equal(tickHazard(h, 0), 1, 'the strip does not charge what is already on it')

  // Then on its own clock, and a long frame charges twice rather than dropping
  // one — a hazard whose damage depends on the frame rate cannot be balanced.
  assert.equal(tickHazard(h, p.tickSeconds * 0.5), 0)
  assert.equal(tickHazard(h, p.tickSeconds * 0.5), 1)
  assert.equal(tickHazard(h, p.tickSeconds * 2), 2, 'a long frame dropped a tick')

  // And it runs out, once, at the duration it declares.
  const fresh = makeHazard(p, 0, 0)
  let elapsed = 0
  while (!hazardExpired(fresh) && elapsed < 60) {
    tickHazard(fresh, 0.1)
    elapsed += 0.1
  }
  assert.ok(Math.abs(elapsed - p.durationSeconds) < 0.15,
    `the strip lasted ${elapsed.toFixed(1)}s against a declared ${p.durationSeconds}s`)
  assert.equal(hazardExpired(fresh), true)

  // The scene ticks it on the SCALED clock with the rest of the simulation,
  // and takes every strip off the board when the run ends.
  const game = code('scenes/GameScene.ts')
  assert.match(game, /this\.tickHazards\(dt\)/, 'the strips are ticked on real time, or not at all')
  assert.match(game, /this\.clearHazards\(\)/, 'a strip outlives the run that made it')
})

/* ------------------------------------------------------- every one is visible */

test('every hero button lands something the player can see', () => {
  /*
   * Bark was reported as doing nothing. It was working — a slow, correctly
   * applied — and it was the one skill with no damage number, no spark and no
   * blast: its whole output was a 3px cream ring at 0.8 alpha, over a painted
   * map, gone in 420ms. Shockwave dealt damage and printed no number, and
   * Ember's burn, which is most of its damage, ticked silently.
   */
  const game = code('scenes/GameScene.ts')
  const between = (from: string, to: string): string =>
    game.slice(game.indexOf(from), game.indexOf(to))

  const howl = between('private skillHowl(', 'private tickReadyCountdown(')
  assert.match(howl, /expandingRing\(/, 'Bark still draws its own thin ring')
  assert.match(howl, /'SLOW'/, 'nothing marks the enemies Bark caught')

  const burst = between('private skillBurst(', 'private skillHowl(')
  assert.match(burst, /floatingDamage\(/, 'Shockwave deals damage and prints no number')

  const burn = between('private skillBurn(', 'private skillBurst(')
  assert.ok((burn.match(/floatingDamage\(/g) ?? []).length >= 2,
    'Ember prints the first hit and then burns silently')

  // And all five run through one switch with one case each, so a new hero
  // cannot arrive with an effect nothing dispatches.
  const cast = between('castHeroSlot1(): void {', 'private skillPunch(')
  for (const effect of ['punch', 'double', 'burn', 'burst', 'howl']) {
    assert.match(cast, new RegExp(`case '${effect}':`), `slot 1 does not dispatch ${effect}`)
  }
  const fire = between('private firePower(', 'private powerBurst(')
  for (const effect of ['hazard', 'burst', 'bomb', 'rain', 'dash']) {
    assert.match(fire, new RegExp(`case '${effect}':`), `slot 2 does not dispatch ${effect}`)
  }
})

test('every effect the placeholder art draws is sized to the real radius', () => {
  // The whole point of drawing them procedurally: the shapes exist so the
  // radii can be judged before the art does, which only works if the picture
  // is the rule. Nothing in HeroFx invents a size.
  const fx = code('systems/HeroFx.ts')
  assert.doesNotMatch(fx, /\b(radius|halfWidth) = \d/, 'a placeholder invents its own size')
  for (const fn of ['expandingRing', 'strike', 'lineSweep', 'hazardBand']) {
    assert.match(fx, new RegExp(`export function ${fn}\\(`), `${fn} is gone`)
  }
  // Tinted to the hero, and the tint is the hero's rather than the power's.
  const game = code('scenes/GameScene.ts')
  assert.match(game, /this\.hero\.def\.colour/, 'the effects are not tinted to the hero')
  for (const id of IDS) {
    assert.equal(typeof HEROES[id].colour, 'number', `${id} has no colour`)
  }
  assert.equal(new Set(IDS.map((i) => HEROES[i].colour)).size, IDS.length,
    'two heroes share a tint, so their powers cannot be told apart')
})

test('every number a hero power uses is in heroes.json', () => {
  // The project rule. A balance pass on five powers that lived in the scene
  // would be a code change per number.
  const game = code('scenes/GameScene.ts')
  const start = game.indexOf('private firePower(')
  const end = game.indexOf('private tickHazards(')
  const body = game.slice(start, end)
  // Every magic number in the power bodies must come off `p.` or the config.
  // The seconds-to-milliseconds conversion is not a balance number and is
  // allowed by name: the tunable is the seconds, which is in the data.
  const scanned = body.replace(/\* 1000/g, '')
  const literals = [...scanned.matchAll(/[^.\w](\d{2,})(?![\w.])/g)].map((m) => m[1])
  assert.deepEqual(literals, [], `hardcoded numbers in the hero powers: ${literals.join(', ')}`)
  for (const id of IDS) {
    const p = power(id)
    for (const field of ['cooldown', 'castRadius', 'radius', 'damage']) {
      assert.equal(typeof (p as unknown as Record<string, unknown>)[field], 'number',
        `${id}'s power has no ${field}`)
    }
  }
})
