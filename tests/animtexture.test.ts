// AN ANIMATION MUST NOT OUTLIVE THE TEXTURE IT WAS CUT FROM.
//
// The crash this polices, from a phone, build ec91739, in-game on level 3:
//
//   TypeError: null is not an object (evaluating 'this.data.sourceSize')
//     get (Frame.data.sourceSize) <- setSizeToFrame <- setCurrentFrame
//     <- handleStart <- startAnimation <- endHeldAbility
//     <- releaseHeldAbility <- onGameOut <- onTouchMove
//
// Level art is loaded per level and freed on scene shutdown; Phaser's
// animation manager is global and is not. `Frame.destroy()` sets `data` to
// null and `Frame.realWidth` is `this.data.sourceSize.w`, so an animation that
// survives its texture throws on the next play.
//
// `forgetEffectAnims` was written for exactly this and dropped the animation
// whose KEY equalled the texture key — which the Mind Laser's three clips,
// named `<key>-charge`, `<key>-sustain` and `<key>-fade`, are not. All three
// outlived every level change.
//
// It now asks `AnimationManager.getAnimsFromTexture`, which is Phaser's own
// walk of every registered animation matching `frame.textureKey` — the engine's
// answer rather than a second copy of the rule that could drift from what the
// frames actually say.
//
// WHICH IS WHY THESE ARE SOURCE-TEXT TESTS. `Effects.ts` imports Phaser,
// `npm install` returns 403 in the agent environment, and no test in `tests/`
// can construct a scene — so the behaviour is proven by the harness's
// `nullframe` scenario, which arms the Mind Laser, changes level, arms it
// again and releases it through `gameout`, and which failed against the
// unfixed tree with the same getter and the same guard chain the device
// reported. What is asserted HERE is that the wiring cannot quietly go back to
// deciding by name. See reports/2026-09-10-the-null-frame.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (p: string) => readFileSync(url(`../${p}`), 'utf8')

const EFFECTS = read('src/systems/Effects.ts')
const GAMESCENE = read('src/scenes/GameScene.ts')
const HARNESS = read('tools/harness/index.html')

const anim = (key: string, ...textures: string[]) => ({
  key,
  frames: textures.map((textureKey) => ({ textureKey })),
})

/* ----------------------------------------------------------------- the wiring */

test('forgetEffectAnims decides by texture, not by animation key', () => {
  // The old body was `if (renderFor(key).sheet && scene.anims.exists(key))`.
  // A rule keyed on the ANIMATION key is the bug, so its shape is asserted
  // gone rather than the new shape merely asserted present.
  const body = EFFECTS.slice(EFFECTS.indexOf('export function forgetEffectAnims'))
    .slice(0, 900)
  assert.match(body, /getAnimsFromTexture\(key\)/,
    'forgetEffectAnims no longer asks the texture which animations are cut from it')
  assert.ok(!/anims\.exists\(key\)/.test(body),
    'forgetEffectAnims is deciding by animation key again')
  // A key the level never loaded must not be asked about: the texture manager
  // answers with the __MISSING placeholder, whose animations are not ours.
  assert.match(body, /if \(!scene\.textures\.exists\(key\)\) continue/,
    'an unloaded key would take the __MISSING placeholder\'s animations with it')
})

test('freeLevelArt hands the arch crop to forgetEffectAnims too', () => {
  // It used to be removed on a line of its own AFTER the loop, so an animation
  // cut from it would have been left holding destroyed frames — the same bug
  // in a second place.
  assert.match(GAMESCENE, /const keys = \[\.\.\.levelArtKeys\(.*\), ARCH_NEAR_KEY\]/,
    'the arch crop is freed outside the list forgetEffectAnims is given')
  assert.match(GAMESCENE, /const keys = \[[\s\S]{0,120}\n\s*forgetEffectAnims\(this, keys\)/,
    'forgetEffectAnims is not given the same list that is freed')
})

test('the laser clips are still the derived names this fix exists for', () => {
  // If somebody renames them to the bare texture key the fix is still correct,
  // but the reason for it stops being visible — and the comment in
  // AnimLifetime.ts would be describing code that no longer exists.
  assert.match(GAMESCENE, /`\$\{key\}-\$\{name\}`/,
    'ensureLaserAnims no longer builds clips under a derived key')
  for (const name of ['charge', 'sustain', 'fade']) {
    assert.match(GAMESCENE, new RegExp(`make\\('${name}'`), `the ${name} clip is gone`)
  }
})

/* --------------------------------------------------- the end-to-end coverage */

test('the harness covers arming and releasing a held ability after a level change', () => {
  // That specific sequence had no coverage anywhere, which is how a crash on
  // the second level of a session shipped. `courtland` drives the same beam
  // and never changes level, so it passed throughout.
  assert.match(HARNESS, /if \(scenario === 'nullframe'\) \{/,
    'the nullframe scenario is gone')
  assert.match(HARNESS, /await playLevel\('level1'\)[\s\S]{0,4000}await playLevel\('level3'\)/,
    'nullframe no longer changes level between the two presses')
  assert.match(HARNESS, /new MouseEvent\('mouseout'/,
    'nullframe no longer releases through the pointer leaving the canvas')
  assert.match(HARNESS, /holding destroyed frames/,
    'nullframe no longer asks the animation manager for dangling frames')
})
