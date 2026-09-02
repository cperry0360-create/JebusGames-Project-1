import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { onBoard } from '../src/systems/Liveness.ts'
import { HeroFrames, type FrameDef } from '../src/systems/HeroFrames.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))

/*
 * The wave-5 crash, as arithmetic.
 *
 * Two independent holes had to line up for it: liveness that meant only "not
 * dead", and a hero who kept a committed swing across his own death. Each is
 * tested on its own, because closing one and leaving the other would still be
 * a crash waiting for a slightly different run.
 */

test('a live enemy is on the board', () => {
  assert.equal(onBoard({ status: 'walking', active: true, scene: {} }), true)
  assert.equal(onBoard({ status: 'fighting', active: true, scene: {} }), true)
})

test('a dead enemy is not on the board', () => {
  assert.equal(onBoard({ status: 'dead', active: true, scene: {} }), false)
})

test('THE HOLE: a LEAKED enemy is destroyed while its status is still walking', () => {
  // This is the exact object the crash probe read back:
  //   status=walking alive=true active=false scene=GONE
  // The old predicate — status !== 'dead' — called it alive.
  const leaked = { status: 'walking', active: false, scene: undefined }
  assert.equal(leaked.status !== 'dead', true, 'the old rule still says alive')
  assert.equal(onBoard(leaked), false, 'the new rule says gone')
})

test('either destruction marker alone is enough', () => {
  assert.equal(onBoard({ status: 'walking', active: false, scene: {} }), false)
  assert.equal(onBoard({ status: 'walking', active: true, scene: undefined }), false)
  assert.equal(onBoard({ status: 'walking', active: true, scene: null }), false)
})

test('nothing is not on the board', () => {
  assert.equal(onBoard(null), false)
  assert.equal(onBoard(undefined), false)
})

test('an object with no Phaser markers is judged on status alone', () => {
  // Pure-arithmetic targets in the test suite and in Targeting.ts have neither
  // field. Absence of a destruction mark is not a destruction mark.
  assert.equal(onBoard({ status: 'walking' }), true)
  assert.equal(onBoard({}), true)
  assert.equal(onBoard({ status: 'dead' }), false)
})

test('all three guards on the damage path go through one definition', () => {
  const enemy = src('entities/Enemy.ts')
  const hero = src('entities/Hero.ts')
  const scene = src('scenes/GameScene.ts')

  // Enemy.alive IS the definition.
  assert.match(enemy, /get alive\(\): boolean \{\s*return onBoard\(this\)/,
    'Enemy.alive must be onBoard(this)')
  // And nothing may go back to asking about status directly.
  assert.equal(/if \(this\.status === 'dead'\) return/.test(enemy), false,
    'Enemy must not guard on status alone any more')

  assert.match(enemy, /hurt\([^)]*\): boolean \{[\s\S]{0,400}?if \(!this\.alive\) return false/,
    'Enemy.hurt guards on alive')
  assert.match(scene, /damageEnemy[\s\S]{0,300}?if \(!enemy\.alive\) return/,
    'GameScene.damageEnemy guards on alive')
  assert.match(hero, /this\.pendingHit = \(\): void => \{\s*for \(const v of victims\) if \(v\.alive\)/,
    'the committed-swing closure guards on alive')
})

test('the redundant active checks are folded in rather than left beside alive', () => {
  // Three call sites used to carry `!x.active || !x.alive`, which is the shape
  // of a definition being patched where it is used. If they come back, the
  // definition has stopped being trusted again.
  for (const p of ['scenes/GameScene.ts', 'entities/Hero.ts', 'entities/Projectile.ts']) {
    assert.equal(/\.active \|\| !\w+(\.\w+)*\.alive/.test(src(p)), false,
      `${p} should not re-check active beside alive`)
  }
})

/* ------------------------------------------------- the hero's committed swing */

const DEF = read('presentation').heroFrames as FrameDef

test('a swing survives being interrupted by walking, which is the rule', () => {
  const fr = new HeroFrames(DEF)
  fr.swing()
  fr.advance(1 / 60, true)
  assert.equal(fr.attacking, true, 'walking does not cut a swing short')
})

test('reset abandons a swing so its impact frame never arrives', () => {
  const fr = new HeroFrames(DEF)
  fr.swing()
  fr.advance(1 / 60, false)
  fr.reset()
  assert.equal(fr.attacking, false)

  // Run well past where the impact frame would have been.
  let impacts = 0
  for (let t = 0; t < 2; t += 1 / 60) if (fr.advance(1 / 60, false).impact) impacts++
  assert.equal(impacts, 0, 'a reset clip must not deliver the swing it abandoned')
})

test('a swing NOT reset does deliver its impact, so the test above can fail', () => {
  const fr = new HeroFrames(DEF)
  fr.swing()
  let impacts = 0
  for (let t = 0; t < 2; t += 1 / 60) if (fr.advance(1 / 60, false).impact) impacts++
  assert.equal(impacts, 1, 'the control: an untouched swing lands exactly once')
})

test('goDown and revive both drop the pending swing and reset the clip', () => {
  const hero = src('entities/Hero.ts')
  const goDown = hero.slice(hero.indexOf('private goDown('), hero.indexOf('private revive('))
  const revive = hero.slice(hero.indexOf('private revive('))

  for (const [name, body] of [['goDown', goDown], ['revive', revive]] as const) {
    assert.match(body, /this\.pendingHit = null/, `${name} must clear pendingHit`)
    assert.match(body, /this\.frames\.reset\(\)/, `${name} must reset the frame clock`)
  }
})

test('the crash report prints the device ratio beside the raw zoom', () => {
  // "zoom 4.825 against a 2.37 ceiling" was a units mismatch that read as a
  // camera bug. The report has to carry enough to tell the two apart.
  const scene = src('scenes/GameScene.ts')
  assert.match(scene, /dpr: deviceScale\(\)/)
  assert.match(scene, /zoomDesign:/)
  assert.match(scene, /zoomCeilingDesign: displayData\.camera\.maxZoom/)
})
