import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { HeroFrames, type FrameDef } from '../src/systems/HeroFrames.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const ART = read('art'), P = read('presentation')
const DEF = P.heroFrames as FrameDef

const run = (fr: HeroFrames, seconds: number, walking: boolean, step = 1 / 60) => {
  const seen: string[] = []
  let impacts = 0
  for (let t = 0; t < seconds; t += step) {
    const s = fr.advance(step, walking)
    seen.push(`${s.pose}${s.index}`)
    if (s.impact) impacts++
  }
  return { seen, impacts }
}

test('the swing clock outlived the art it was drawn for', () => {
  // THE FRAMES ARE GONE AND THE CLOCK IS NOT, and the distinction is the whole
  // reason this file still exists. Cory's walk and attack sheets were deleted
  // when his new art landed -- all five heroes are single pictures now -- so
  // nothing swaps a texture on frame 3 any more.
  //
  // What frame 3 still decides is WHEN THE DAMAGE LANDS. `HeroFrames` runs the
  // same clock, `applyPose` still fires `pendingHit` on the impact tick, and
  // 250ms after a swing starts is a tuned number that a player feels. Deleting
  // the clock with the pictures would have moved every hero's damage to the
  // instant of the button press.
  assert.equal(DEF.walkFrames, 4)
  assert.equal(DEF.attackFrames, 4)
  assert.equal(DEF.impactFrame, 3, 'the swing lands on the wrong frame')
  assert.equal(ART.hero.attackImpactFrame, 3, 'the manifest and the clock disagree')
  // And the manifest no longer carries frame lists for a hero that has none.
  assert.equal(ART.hero.walk, undefined, 'the deleted walk sheet is still in the manifest')
  assert.equal(ART.hero.attack, undefined, 'the deleted attack sheet is still in the manifest')
})

test('walk loops while moving and stops dead when it stops', () => {
  const fr = new HeroFrames(DEF)
  const { seen } = run(fr, 2, true)
  const idx = [...new Set(seen.filter((s) => s.startsWith('walk')))].sort()
  assert.deepEqual(idx, ['walk0', 'walk1', 'walk2', 'walk3'], 'the walk does not use all four frames')
  // It comes back round, which is what looping means.
  const first = seen.indexOf('walk0')
  assert.ok(seen.indexOf('walk0', first + 1) > first, 'the walk does not loop')
  // And standing still is one held frame, not a cycle.
  const still = run(new HeroFrames(DEF), 2, false)
  assert.deepEqual([...new Set(still.seen)], ['idle0'], 'the idle is not a single static pose')
})

test('the attack plays once, does not loop, and lands on frame 3', () => {
  const fr = new HeroFrames(DEF)
  fr.swing()
  const { seen, impacts } = run(fr, 2, false)
  assert.equal(impacts, 1, `the swing landed ${impacts} times`)

  const atk = seen.filter((s) => s.startsWith('attack'))
  assert.deepEqual([...new Set(atk)], ['attack0', 'attack1', 'attack2', 'attack3'],
    'the attack does not play all four frames in order')
  // Once only: the last attack frame is never followed by the first again.
  const last = seen.lastIndexOf('attack3')
  assert.equal(seen.indexOf('attack0', last), -1, 'the attack loops')
  // And it hands back to idle rather than holding the final frame.
  assert.equal(seen[seen.length - 1], 'idle0', 'the hero does not return to the static idle')
})

test('the damage fires on the impact frame, not when the swing starts', () => {
  const fr = new HeroFrames(DEF)
  fr.swing()
  const step = 1 / 240
  let firedAt = -1
  let frameAtFire = -1
  for (let i = 0; i < 2000; i++) {
    const s = fr.advance(step, false)
    if (s.impact) { firedAt = i * step; frameAtFire = s.index; break }
  }
  assert.notEqual(firedAt, -1, 'the swing never landed')
  assert.equal(frameAtFire, DEF.impactFrame - 1, 'the hit fired on the wrong frame')
  assert.ok(firedAt > 0, 'the hit fired on the first tick, before the axe moved')
  // Roughly two ATTACK frame-times in, at 12fps that is about 167ms. The walk
  // runs at half that rate and must not drag the swing out with it.
  const expected = (DEF.impactFrame - 1) / DEF.attackFps
  assert.ok(Math.abs(firedAt - expected) < 0.02,
    `landed at ${(firedAt * 1000).toFixed(0)}ms, expected about ${(expected * 1000).toFixed(0)}ms`)
})

test('a swing is never interrupted, and never lands twice', () => {
  const fr = new HeroFrames(DEF)
  fr.swing()
  // Walking during a swing must not cut it short: a swing chopped half way is
  // a hit with no follow-through.
  const { seen, impacts } = run(fr, 0.3, true)
  assert.equal(impacts, 1, 'walking during a swing changed how often it landed')
  assert.ok(seen.filter((s) => s.startsWith('attack')).length >= 3,
    'the walk interrupted the swing')
  // A long frame that steps straight past the impact frame still fires once.
  const fr2 = new HeroFrames(DEF)
  fr2.swing()
  let hits = 0
  for (let i = 0; i < 5; i++) if (fr2.advance(0.5, false).impact) hits++
  assert.equal(hits, 1, 'a long frame fired the hit twice or not at all')
})

test('the fake motion is gone from the hero that has real frames', () => {
  // HeroMotion existed to fake movement on a static sprite: an idle bob, a
  // walk bounce and an attack lunge, all layered UNDER real animation. It is
  // gone and stays gone.
  //
  // What came back with the roster is the opposite case rather than a relapse.
  // Four of the five heroes have no walk sheet at all, so they are a single
  // picture that would slide across the field, and Hero.ts bobs THOSE -- and
  // only those, because the condition is the sheet's absence rather than a
  // flag. Cory has frames, so Cory does not bob, which is what this test was
  // protecting in the first place.
  assert.equal(existsSync(new URL('../src/systems/HeroMotion.ts', import.meta.url)), false,
    'HeroMotion is still here, so something can still add a bounce')
  const hero = src('entities/Hero.ts')
  for (const gone of ['HeroMotion', 'swingAt', 'offsetY', 'shadowScale']) {
    assert.ok(!hero.includes(gone), `Hero still references ${gone}`)
  }
  assert.equal(P.heroMotion, undefined, 'the bob and bounce numbers are still in the data')

  const bob = /private bob\([\s\S]*?\n  \}/.exec(hero)
  assert.ok(bob, 'the heroes have nothing stopping them sliding')
  // NO SHEET EXEMPTION LEFT. It was conditioned on the walk sheet's presence
  // rather than on a flag, so that drawing four more sheets would turn the bob
  // off by itself; it went the other way instead, and the one sheet was
  // deleted. A branch that can only answer one way is a branch that misleads
  // the next reader about what the roster contains.
  assert.doesNotMatch(bob[0], /walkFramesFor/,
    'the bob still asks about a walk sheet no hero has')
  assert.match(bob[0], /this\.body_\.y = this\.restingBodyY/,
    'a hero standing still is not put back on its resting line')

  // The frame swap sets a texture and an anchor. It must not set y or
  // rotation: the bob owns the vertical, and two writers is how the double
  // motion happened the first time.
  const fn = /private applyPose\([\s\S]*?\n  \}/.exec(hero)
  assert.ok(fn, 'applyPose is gone')
  assert.ok(!/body_\.y\s*=/.test(fn[0]), 'the frame swap moves the sprite vertically')
  assert.ok(!/setRotation/.test(fn[0]), 'the frame swap rotates the sprite')
})

test('a pose change re-reads the anchor AND the height', () => {
  // WHAT THIS TEST USED TO BE. Cory's two clips did not share a canvas -- walk
  // was 557x704 and attack 787x720, with their feet at different fractions of
  // each -- so every frame carried its own anchor and this checked that the
  // anchor was re-read on each swap, or he stepped sideways when he swung.
  //
  // Both clips are deleted. What replaces the question is the same question
  // one level up: a hero still changes texture, on a POSE change rather than a
  // frame change and on transforming, and the two forms still do not share a
  // canvas or a foot fraction. So the swap still has to re-anchor -- and it
  // now has to re-SIZE as well, which is the new way to get this wrong.
  //
  // Cory's powered Rivian is sized from `heroes.json cory.poweredHeight`,
  // because how big that vehicle is drawn is a decision about the hero; its
  // art entry deliberately carries no `displayHeight`. `applyGroundRender`
  // called directly takes the height from the manifest and would therefore
  // apply NO scale at all, drawing the Rivian at its 700px source height.
  // Everything that changes his texture goes through `wearSprite`, which is
  // the one place that asks the roster.
  const hero = src('entities/Hero.ts')
  const wear = /private wearSprite\([\s\S]*?\n  \}/.exec(hero)
  assert.ok(wear, 'there is no single place that changes the hero\'s picture')
  assert.match(wear[0], /applyGroundRender\(this\.body_, key, heroHeight\(this\.heroId/,
    'the sprite swap does not ask the roster how tall this hero should be')

  // And nothing else calls the raw renderer on the body sprite. The
  // constructor is the one exception: it runs before `powered` can be true, so
  // there is no override to apply and the base art is sized by its own entry.
  const calls = [...hero.matchAll(/applyGroundRender\(this\.body_[^)]*\)/g)].map((m) => m[0])
  assert.equal(calls.length, 2,
    `applyGroundRender is called on the body in ${calls.length} places: ${calls.join(' | ')}`)

  // The two forms really do differ in shape, which is why re-anchoring matters
  // at all rather than being ceremony.
  const heroes = read('heroes')
  const base = ART.render[heroes.cory.bodySprite]
  const powered = ART.render[heroes.cory.poweredSprite]
  assert.notEqual(base.anchorX, powered.anchorX, 'the two forms share an anchorX')
  const ratio = (r: { contentWidth: number; contentHeight: number }) =>
    r.contentWidth / r.contentHeight
  assert.ok(ratio(powered) > ratio(base) * 1.5,
    'the powered form is not meaningfully wider than the man, so nothing here is being tested')
})

test('a missing frame falls back to the idle rather than blanking the hero', () => {
  const hero = src('entities/Hero.ts')
  const fn = /private frameKey\([\s\S]*?\n  \}/.exec(hero)
  assert.ok(fn, 'there is no frame resolver')
  assert.match(fn[0], /this\.scene\.textures\.exists\(key\)/, 'it does not check the texture loaded')
  // Through the roster now, so a hero with no sheet at all takes the same
  // path a missing frame does -- and a POWERED hero falls back to its powered
  // picture rather than reverting to base art for the length of one frame.
  assert.match(fn[0], /return heroSprite\(this\.heroId, this\.powered\)/,
    'it does not fall back to the hero\'s own static art')
  // AND THERE ARE NO CLIPS TO MISS. Every roster entry's `walk` and `attack`
  // are null, so `frameKey` takes the fallback path on every single call --
  // which means the path is exercised constantly rather than only when a file
  // is absent, and the roster still has somewhere to put a sheet drawn later.
  for (const id of Object.keys(ART.hero.roster)) {
    const entry = ART.hero.roster[id]
    assert.equal(entry.walk, null, `${id} has a walk clip that no art backs`)
    assert.equal(entry.attack, null, `${id} has an attack clip that no art backs`)
  }
})

test('the walk cycle matches the ground the hero actually covers', () => {
  // The slide, as arithmetic. A 4-frame cycle is two steps, so the stride is
  // (speed / (fps / frames)) / 2 world pixels, and a human stride is about
  // 0.4-0.45 of body height. At the shipped 12fps Cory took 0.22 body-height
  // steps while covering 104 px/s, which is exactly what sliding looks like.
  const cory = read('heroes').cory
  const bodyHeight = ART.render['hero-cory'].displayHeight
  const cycleSeconds = DEF.walkFrames / DEF.walkFps
  const stride = (cory.moveSpeed * cycleSeconds) / 2
  const ratio = stride / bodyHeight
  assert.ok(ratio > 0.36 && ratio < 0.52,
    `a ${stride.toFixed(1)}px step on a ${bodyHeight}px body is ${ratio.toFixed(2)} ` +
    'body-heights; a human stride is 0.40-0.45')
  // And the attack keeps its own, faster rate.
  assert.ok(DEF.attackFps > DEF.walkFps,
    'the attack runs no faster than the walk, so the swing telegraph got longer')
})
