import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clampToCastRange, distanceToSegment, hazardExpired, makeHazard, powerRefusal,
  rainPoints, tickHazard, withinCastRange, withinDash,
} from '../src/systems/HeroPowers.ts'
import { facesLeft, mirroredFor } from '../src/systems/Facing.ts'
import { isAreaSkill } from '../src/systems/HeroSkills.ts'
import { withinRadius } from '../src/systems/Targeting.ts'
import { Cooldowns } from '../src/systems/Cooldowns.ts'
import type { HeroPowerDef, HeroSkillDef } from '../src/types.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const code = (p: string) =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const HEROES = JSON.parse(readFileSync(url('../src/data/heroes.json'), 'utf8'))
const IDS = Object.keys(HEROES).filter((k) => !k.startsWith('_'))
const power = (id: string): HeroPowerDef => HEROES[id].slot2
const skill = (id: string): HeroSkillDef => HEROES[id].slot1

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
  // ALL FIVE FACE RIGHT NOW. Cory was the exception the bug was written
  // against; his new art faces right like everyone else's, so there is no
  // per-hero correction left to apply and the roster agrees with itself for
  // the first time. THE MECHANISM STAYS TESTED BELOW: the enemies still
  // disagree with each other -- five of the twenty are drawn facing left --
  // and they read the same `mirroredFor`, so the rule has to keep working for
  // an input no hero supplies today.
  for (const id of IDS) {
    assert.equal(HEROES[id].artFacing, 'right', `${id} is not drawn facing right`)
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
  // EVERY SPRITE SWAP GOES THROUGH ONE FUNCTION, which is a stronger statement
  // than the one this used to make. It counted `applyFacing()` call sites and
  // required at least five, on the reasoning that each swap needed its own --
  // and a count is a proxy that gets weaker every time the code improves: the
  // swaps were consolidated into `wearSprite` (so the powered form's height
  // override could not be forgotten by one of them), the count fell to three,
  // and the test failed on a change that removed the very risk it guarded.
  //
  // So ask the real question. Every `setTexture` on the body sprite is inside
  // `wearSprite`, and `wearSprite` re-applies the facing.
  const wear = /private wearSprite\([\s\S]*?\n  \}/.exec(hero)
  assert.ok(wear, 'there is no single place that changes the picture')
  assert.match(wear[0], /this\.applyFacing\(\)/, 'the one sprite swap does not re-apply the facing')
  const swaps = [...hero.matchAll(/this\.body_\.setTexture\(/g)]
  assert.equal(swaps.length, 1,
    `${swaps.length} places set the body texture; there must be exactly one, inside wearSprite`)
  assert.ok(wear[0].includes('this.body_.setTexture('),
    'the one texture swap is not the one inside wearSprite')
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
  // ELI'S SLOT 1 NOW, not his slot 2 -- so the def under test is the skill.
  // `rainPoints` takes the two fields it reads rather than a whole power def
  // for exactly this reason: the scatter is the same scatter either way.
  const p = skill('eli')
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
  const rain = game.slice(game.indexOf('private rainOver('))
  assert.match(rain.slice(0, rain.indexOf('\n  }')), /delayedCall\(p\.gapSeconds \* 1000 \* i/,
    'every strike lands on the same frame')
  // And it is centred on the hero when it is cast from slot 1, which is what
  // makes it a skill rather than a placed power.
  assert.match(game, /case 'rain': this\.rainOver\(this\.hero\.x, this\.hero\.y, k\)/,
    'the slot 1 rain is not dropped on the hero')
})

/* ------------------------------------------------------------ Eli's two */

test('Star Rain is Eli\'s slot 1, centred on him, on a slot 1 cooldown', () => {
  // It replaces Quick Cut, which is gone from the game entirely.
  const k = skill('eli')
  assert.equal(k.name, 'Star Rain')
  assert.equal(k.effect, 'rain')
  assert.ok(isAreaSkill(k), 'Star Rain is aimed at somebody rather than dropped around Eli')
  assert.equal(k.range, 0, 'an area skill declares a radius, not a range')
  assert.ok(k.radius > 0)
  assert.ok(k.hits > 1, 'a rain of one star is a punch')

  // A SLOT 1 COOLDOWN, which is what "short" means here: inside the band the
  // other four sit in, and nowhere near a slot 2's 12.5.
  const others = ['cory', 'courtland', 'han', 'bailey'].map((id) => skill(id).cooldown)
  assert.ok(k.cooldown >= Math.min(...others) && k.cooldown <= Math.max(...others),
    `Star Rain's ${k.cooldown}s is outside the ${Math.min(...others)}-${Math.max(...others)}s band the other slot 1s sit in`)
  assert.ok(k.cooldown < power('eli').cooldown, 'the slot 1 is slower than the slot 2')

  // And nothing anywhere still calls it Quick Cut.
  for (const [id, h] of Object.entries(HEROES)) {
    assert.notEqual(h.slot1?.name, 'Quick Cut', `${id} still carries Quick Cut`)
    assert.notEqual(h.slot2?.name, 'Quick Cut', `${id} still carries Quick Cut`)
  }
  assert.equal(skill('eli').effect === 'double', false, 'the double-hit effect is still in use')
})

test('Ice Beam is powered-form only and resets with the transformation', () => {
  const p = power('eli')
  assert.equal(p.name, 'Ice Beam')
  assert.equal(p.effect, 'beam')
  assert.equal(p.targeted, true, 'Ice Beam does not ask for a point')
  assert.equal(p.cooldown, 12.5, 'Ice Beam is not on the shared slot 2 cooldown')
  assert.ok(p.castRadius > 0, 'Ice Beam can be dropped anywhere on the board')

  assert.equal(powerRefusal(p, false, false, true), 'base-form', 'Ice Beam fires in base form')
  assert.equal(powerRefusal(p, true, false, true), null, 'Ice Beam is refused in powered form')

  // The transformation IS the recharge, the same as the other four.
  const cd = new Cooldowns()
  cd.register('heroSlot2', p.cooldown)
  cd.start('heroSlot2')
  assert.equal(powerRefusal(p, true, false, cd.ready('heroSlot2')), 'cooling')
  cd.reset('heroSlot2')
  assert.equal(powerRefusal(p, true, false, cd.ready('heroSlot2')), null)
})

test('Ice Beam hits the area it is aimed at, and nothing on the way there', () => {
  // THE BEAM IS SCENERY. This is the property that separates it from Zoomies,
  // which is the same shape on screen and a corridor underneath.
  const p = power('eli')
  const hero = { x: 100, y: 300 }
  const at = { x: 100 + p.castRadius, y: 300 }
  const mob = (x: number, y: number, name: string) =>
    ({ x, y, distance: 0, alive: true, name })

  const inArea = mob(at.x + p.radius - 4, at.y, 'in the area')
  const onEdge = mob(at.x, at.y + p.radius + 6, 'just outside the area')
  const between = mob((hero.x + at.x) / 2, hero.y, 'standing in the beam')
  const behindHero = mob(hero.x - 40, hero.y, 'behind Eli')

  const caught = withinRadius([inArea, onEdge, between, behindHero], at.x, at.y, p.radius)
  assert.deepEqual(caught.map((c) => c.name), ['in the area'],
    'Ice Beam caught something outside the area at the point it was aimed at')

  // And the scene resolves it that way: an area at the target, never a
  // corridor from the hero.
  const game = code('scenes/GameScene.ts')
  const beam = game.slice(game.indexOf('private powerBeam('))
  const body = beam.slice(0, beam.indexOf('\n  }'))
  assert.match(body, /this\.enemiesNear\(x, y, p\.radius\)/,
    'Ice Beam does not resolve on an area at the point tapped')
  assert.doesNotMatch(body, /withinDash|distanceToSegment/,
    'Ice Beam damages the line it is drawn along, which makes it a dash')
  assert.match(body, /alongLine\(this, p\.fx, \{ x: this\.hero\.x/,
    'nothing is drawn from Eli to the point, so it is not a beam at all')
  // AND THE PICTURE IS NOT THE POWER'S RADIUS WIDE. This is the same property
  // as "the beam is scenery", said in the drawing rather than in the damage: a
  // 192px-thick bolt down the middle of the board claims to have caught
  // everything it crossed, which is exactly the reading the rest of this test
  // exists to prevent. `beamHeight` is a fixed thickness that reads as a beam;
  // the ring at `p.radius` is what says how big the frozen area is.
  assert.match(body, /PRESENTATION\.heroFx\.beamHeight/,
    'the beam is drawn at some width other than the one chosen to read as a beam')
  assert.doesNotMatch(body, /alongLine\([^)]*p\.radius/,
    'the beam picture is drawn at the power\'s radius, so it claims the corridor')
  assert.match(body, /areaRing\(this, x, y, p\.radius/,
    'the area that actually freezes is not drawn at its real radius')
  assert.match(body, /applySlow\(p\.slowFactor, p\.slowSeconds/, 'Ice Beam does not slow')
})

test('Ice Beam\'s slow is an ultimate, and a boss that resists it still takes the hit', () => {
  const p = power('eli')
  const bramble = (JSON.parse(src('data/towers.json')) as Record<string, any>).extension
  assert.ok(bramble.slowFactor > 0, 'this test needs Bramble to be the tower that slows')

  // CONSIDERABLY STRONGER AND BRIEFER, both measured against the tower slow
  // the player already knows. Stronger: a smaller factor is a bigger slow.
  assert.ok(p.slowFactor < bramble.slowFactor * 0.6,
    `Ice Beam slows to ${p.slowFactor} against Bramble's ${bramble.slowFactor}, which is not considerably stronger`)
  // Briefer, in the way that matters: Bramble re-applies every shot for as
  // long as the enemy is in range, so its 1.6s is a condition rather than a
  // window. Ice Beam is one application and then it is over.
  assert.ok(p.slowSeconds > 0 && p.slowSeconds <= 4,
    `${p.slowSeconds}s is a state, not a window`)
  assert.ok(p.damage > 0, 'Ice Beam only slows, so it is a tower effect with a cutscene')

  // A boss that resists crowd control takes the damage and keeps walking. The
  // rule is Enemy.applySlow's and the scene does not know about it, which is
  // exactly why it cannot drift from the towers' version of the same rule.
  const enemies = JSON.parse(src('data/enemies.json')) as Record<string, any>
  const immune = Object.entries(enemies).filter(([, e]) => e.slowable === false).map(([id]) => id)
  assert.ok(immune.length > 0, 'nothing in the game resists crowd control any more')
  const enemyTs = code('entities/Enemy.ts')
  const applySlow = enemyTs.slice(enemyTs.indexOf('applySlow(factor: number'))
  assert.match(applySlow.slice(0, applySlow.indexOf('\n  }')), /if \(!this\.def\.slowable\) return/,
    'applySlow no longer refuses on the flag, so Ice Beam would freeze a boss')
  const game = code('scenes/GameScene.ts')
  const beam = game.slice(game.indexOf('private powerBeam('))
  const body = beam.slice(0, beam.indexOf('\n  }'))
  assert.doesNotMatch(body, /slowable/,
    'powerBeam checks the flag itself, which is a second copy of the rule')
  assert.match(body, /this\.damageEnemy\(e, p\.damage/,
    'the damage is conditional on something; a resisting boss must still take it')
})

test('Ice Beam can be backed out of without being spent', () => {
  // The cooldown starts in firePower and nowhere else, so every way out of the
  // targeting mode -- CANCEL, a second press, a tap outside the radius, the
  // wave ending -- is free by construction. This is that construction, checked
  // rather than assumed, and it is shared with the other four powers.
  const game = code('scenes/GameScene.ts')
  const fire = game.slice(game.indexOf('private firePower('))
  const body = fire.slice(0, fire.indexOf('\n  }'))
  assert.match(body, /this\.cooldowns\.start\(SLOT2\)/, 'firePower does not spend the cooldown')
  const armed = game.slice(game.indexOf("this.targeting.arm({ kind: 'power', id: SLOT2 })") - 900,
                           game.indexOf("this.targeting.arm({ kind: 'power', id: SLOT2 })"))
  assert.doesNotMatch(armed, /cooldowns\.start\(SLOT2\)/,
    'arming the targeting mode already spends the power')
  // And Ice Beam goes through that shared path rather than a private one.
  assert.match(game, /case 'beam': this\.powerBeam\(p, x, y\); break/,
    'Ice Beam is not dispatched from firePower')
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
  assert.match(howl, /burstAt\(this, k\.fx/, 'Bark draws no effect art')
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

test('every effect is real art, and it is still sized to the real radius', () => {
  // THE PICTURES REPLACED THE PLACEHOLDER SHAPES AND THE SIZING RULE SURVIVED,
  // which is the half of the placeholder worth keeping. The shapes existed so
  // the radii could be judged before the art did, and that only ever worked
  // because nothing invented a size: every effect took its extent from
  // heroes.json, so tuning a radius moved its picture with it. A picture drawn
  // at a fixed pixel size would break that the first time anything was tuned.
  const fx = code('systems/HeroFx.ts')
  assert.doesNotMatch(fx, /\b(radius|halfWidth|worldWidth|height) = \d/,
    'an effect invents its own size instead of taking the power\'s')
  for (const fn of ['burstAt', 'alongLine', 'groundStrip', 'statusMarker']) {
    assert.match(fx, new RegExp(`export function ${fn}\\(`), `${fn} is gone`)
  }
  // The procedural shapes are gone, all four of them.
  for (const fn of ['expandingRing', 'strike', 'lineSweep', 'hazardBand']) {
    assert.doesNotMatch(fx, new RegExp(`export function ${fn}\\(`),
      `${fn} is still here; the placeholder shapes were supposed to go`)
  }
  // ONE SURVIVOR, and it is named and explained: the Ice Beam's area cannot be
  // expressed by a picture stretched along a line, because that picture has
  // one thickness for its whole length.
  assert.match(fx, /export function areaRing\(/, 'the ice beam has no way to show its area')

  // EVERY CALL SITE PASSES A NUMBER OUT OF THE DATA. This is the assertion the
  // sizing rule actually rests on: `burstAt` takes a world width, and if a
  // caller passed a constant the picture would stop tracking the power.
  const game = code('scenes/GameScene.ts')
  const calls = [...game.matchAll(/burstAt\(this,[^;]*?\)\n/g)].map((m) => m[0])
  assert.ok(calls.length >= 4, `only ${calls.length} effects are drawn as art`)
  for (const c of calls) {
    assert.match(c, /\b[kp]\.(radius|range)\b|strikeLength/,
      `an effect is drawn at a size that comes from nowhere: ${c.trim()}`)
  }

  // The hero's colour is still a fact about the hero and is still used -- the
  // ice beam's area ring is drawn in it, and the tint is what tells two
  // heroes' powers apart on a busy board.
  assert.match(game, /this\.hero\.def\.colour/, 'the hero\'s own colour is no longer used at all')
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
