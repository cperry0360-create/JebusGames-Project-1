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

test('the clips are four frames each and the impact is frame 3', () => {
  assert.equal(DEF.walkFrames, 4)
  assert.equal(DEF.attackFrames, 4)
  assert.equal(DEF.impactFrame, 3, 'the swing lands on the wrong frame')
  assert.equal(ART.hero.attackImpactFrame, 3, 'the manifest and the clock disagree')
  assert.equal(ART.hero.walk.length, 4)
  assert.equal(ART.hero.attack.length, 4)
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
  assert.ok(bob, 'the sheetless heroes have nothing stopping them sliding')
  assert.match(bob[0], /if \(walkFramesFor\(this\.heroId\)\)/,
    'the bob is not conditioned on the walk sheet, so an animated hero can be bobbed too')
  assert.match(bob[0], /this\.body_\.y = this\.restingBodyY/,
    'an animated hero is not put back on its resting line')

  // The frame swap sets a texture and an anchor. It must not set y or
  // rotation: the bob owns the vertical, and two writers is how the double
  // motion happened the first time.
  const fn = /private applyPose\([\s\S]*?\n  \}/.exec(hero)
  assert.ok(fn, 'applyPose is gone')
  assert.ok(!/body_\.y\s*=/.test(fn[0]), 'the frame swap moves the sprite vertically')
  assert.ok(!/setRotation/.test(fn[0]), 'the frame swap rotates the sprite')
})

test('each clip carries its own anchor, because they do not share a canvas', () => {
  // Measured off the files: walk is 557x704 and attack 787x720, their feet sit
  // at different fractions of their canvases, and their figures are 677 and
  // 690 source px tall. One shared anchor would step the hero sideways on
  // every swing, which is the thing this was asked to avoid.
  const walk = ART.hero.walk.map((k: string) => ART.render[k])
  const attack = ART.hero.attack.map((k: string) => ART.render[k])
  for (const set of [walk, attack]) {
    assert.ok(set.every((r: unknown) => r), 'a frame has no render entry, so it has no anchor')
    const xs = new Set(set.map((r: { anchorX: number }) => r.anchorX))
    const ys = new Set(set.map((r: { anchorY: number }) => r.anchorY))
    assert.equal(xs.size, 1, 'frames within one clip disagree on the anchor')
    assert.equal(ys.size, 1, 'frames within one clip disagree on the anchor')
  }
  assert.notEqual(walk[0].anchorX, attack[0].anchorX,
    'both clips share an anchorX; they are different canvases and cannot')

  // Same rendered figure height, so he does not resize between clips. Figure
  // heights are 677 and 690 source px on 704 and 720 canvases.
  const onScreen = (r: { displayHeight: number }, canvas: number, figure: number) =>
    (r.displayHeight / canvas) * figure
  const w = onScreen(walk[0], 704, 677)
  const a = onScreen(attack[0], 720, 690)
  assert.ok(Math.abs(w - a) < 1.5, `walk renders ${w.toFixed(1)}px and attack ${a.toFixed(1)}px`)
  assert.ok(Math.abs(w - 75.8) < 1.5, `the clips render ${w.toFixed(1)}px; the idle is 75.8`)

  // Re-anchored on every swap, or the per-clip anchors do nothing.
  assert.match(src('entities/Hero.ts'), /this\.artOffset = applyGroundRender\(this\.body_, key\)/,
    'the anchor is not re-read when the frame changes')
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
  for (const k of [...ART.hero.walk, ...ART.hero.attack]) {
    assert.ok(ART.optional.includes(k), `${k} is not optional, so a miss would fail loudly`)
    assert.ok(ART.files[k], `${k} is not in the manifest`)
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
