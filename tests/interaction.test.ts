import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  BASE_TIER, isMaxed, maxTier, nextStep, sellValue, statAt,
} from '../src/systems/Upgrades.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const towers = read('towers'), rules = read('rules')

test('no interaction anywhere in the game is keyboard-only', () => {
  // A key is allowed as a *shortcut*. It may never be the only way to do
  // something: on a touch device the run-end screen used to be a dead end with
  // no way back to the title at all.
  const scenes = readdirSync(url('../src/scenes')).filter((f) => f.endsWith('.ts'))
  const keyed: string[] = []
  for (const f of scenes) {
    const body = src(`scenes/${f}`)
    for (const m of body.matchAll(/keyboard\?\.(?:on|once)\('(keydown[^']*)'/g)) keyed.push(`${f}:${m[1]}`)
  }
  assert.ok(keyed.length > 0, 'expected the game to have keyboard shortcuts')

  // Each keyed action needs a pointer route too. These are the pairs.
  const game = src('scenes/GameScene.ts')
  const hud = src('scenes/HudScene.ts')
  const credits = src('scenes/CreditsScene.ts')
  const splash = src('scenes/SplashScene.ts')

  assert.match(game, /plateButton\([^)]*'BACK TO TITLE'/s,
    'the run-end screen has no button, so a touch player cannot leave it')
  assert.match(game, /'CANCEL'/,
    'an armed ability can only be cancelled with a key')
  assert.match(hud, /plateButton\(/, 'the HUD start-wave button is not a button')
  assert.match(credits, /plateButton\(/, 'the credits screen has no back button')
  assert.match(splash, /pointerdown/, 'the splash can only be skipped with a key')
})

test('the run-end button is on the screen it appears on', () => {
  const display = read('display')
  const game = src('scenes/GameScene.ts')
  const m = /plateButton\(this, displayData\.width \/ 2, displayData\.height \/ 2 \+ (\d+),\s*(\d+), (\d+)/s.exec(game)
  assert.ok(m, 'could not find the run-end button')
  const [, dy, w, h] = m.map(Number)
  assert.ok(display.height / 2 + dy + h / 2 < display.height, 'the button runs off the bottom')
  assert.ok(w > 120 && h > 40, 'a run-end button should be a big, obvious target')
})

test('nothing spends peanuts without asking first', () => {
  const game = src('scenes/GameScene.ts')
  // The sign used to take the peanuts on the tap itself.
  const sign = src('ui/SignBribe.ts')
  assert.doesNotMatch(sign, /peanuts\s*-=/, 'SignBribe should not spend anything itself')
  assert.match(game, /openDialog\(\{[\s\S]*?confirmTitle/,
    'the sign bribe does not put up a confirm dialog')
  const rulesCfg = rules.signBribe
  for (const k of ['confirmTitle', 'confirmBody', 'confirmLabel'] as const) {
    assert.ok(rulesCfg[k]?.length > 0, `signBribe.${k} is missing`)
  }
})

test('a dialog can always be dismissed by tapping away from it', () => {
  // A panel that only its own button can close is a trap over a live
  // battlefield: the wave keeps coming while the player hunts for the way out.
  const dialog = src('ui/Dialog.ts')
  assert.match(dialog, /this\.blocker\.on\('pointerdown', \(\) => this\.close\(\)\)/,
    'tapping outside a dialog should dismiss it')
})

test('a build menu pick does not also act on the map underneath', () => {
  const menu = src('ui/BuildMenu.ts')
  assert.doesNotMatch(menu, /this\.hitAreas = \[\]\s*\n\s*onPreview/,
    'BuildMenu.close should keep its hit areas so ownsAny catches the closing tap')
  const game = src('scenes/GameScene.ts')
  assert.doesNotMatch(game, /this\.menu\.isOpen && this\.menu\.ownsAny/,
    'the menu guard should ask the hit list, not whether the menu is still open')
})

test('a dialog swallows the tap that closes it', () => {
  // Phaser hit-tests before it dispatches and is topOnly by default, so the
  // press on a dialog button reaches the scene handler after the dialog has
  // already closed. Testing "is a dialog open" there let one click confirm a
  // purchase and then order the hero on the map behind it.
  const dialog = src('ui/Dialog.ts')
  assert.match(dialog, /this\.layer\.list\?\.includes\(o\)/,
    'Dialog.owns should catch the closing tap via its own layer')
  const game = src('scenes/GameScene.ts')
  assert.match(game, /this\.dialog\?\.owns\(over\)/,
    'the scene should ask the dialog about the hit list, not about its state')
})

/* ---------------------------------------------------------------- upgrades */

const towerList = Object.entries(towers) as [string, any][]

test('tier 1 is what you build and every tier above it costs time', () => {
  for (const [id, def] of towerList) {
    assert.equal(BASE_TIER, 1)
    assert.equal(maxTier(def), 3, `${id} should top out at tier 3`)
    assert.equal(nextStep(def, maxTier(def)), null, `${id} offers an upgrade past its top tier`)
    assert.ok(isMaxed(def, maxTier(def)))
    assert.ok(!isMaxed(def, BASE_TIER))
    for (let t = BASE_TIER; t < maxTier(def); t++) {
      assert.ok(nextStep(def, t)!.buildSeconds > 0, `${id} tier ${t + 1} would be instant`)
    }
  }
})

test('a tier actually makes the tower better', () => {
  for (const [id, def] of towerList) {
    if (def.supportRadius > 0) {
      assert.ok(statAt(def, 3, 'supportDamageBonus') > statAt(def, 1, 'supportDamageBonus'),
        `${id} tier 3 does not buff harder`)
      continue
    }
    assert.ok(statAt(def, 2, 'damage') > statAt(def, 1, 'damage'), `${id} tier 2 is not stronger`)
    assert.ok(statAt(def, 3, 'damage') > statAt(def, 2, 'damage'), `${id} tier 3 is not stronger`)
    assert.ok(statAt(def, 3, 'fireInterval') < statAt(def, 1, 'fireInterval'),
      `${id} does not fire faster at tier 3`)
    assert.ok(statAt(def, 3, 'range') > statAt(def, 1, 'range'), `${id} does not reach further`)
  }
})

test('a stat the tower does not have stays at zero through every tier', () => {
  // Multipliers on a base of zero are still zero, which is what keeps a
  // support tower from quietly growing a gun at tier 2.
  const shelter = towers.shelter
  for (let t = 1; t <= 3; t++) {
    assert.equal(statAt(shelter, t, 'damage'), 0, `the Tax Shelter has a gun at tier ${t}`)
  }
})

test('selling always loses money', () => {
  const refund = rules.towerUpgrades.sellRefund
  for (const [id, def] of towerList) {
    for (let t = 1; t <= maxTier(def); t++) {
      let paid = def.cost
      for (let k = 1; k < t; k++) paid += def.tiers[k - 1].cost
      const back = sellValue(def, t, refund)
      assert.ok(back < paid, `${id} at tier ${t} sells for ${back} against ${paid} paid`)
      assert.ok(back > 0, `${id} at tier ${t} sells for nothing`)
    }
  }
})

test('a tower under construction fires slower and keeps its old stats', () => {
  const tower = src('entities/Tower.ts')
  assert.match(tower, /this\.upgrading \? base \/ UPGRADES\.buildFireRate : base/,
    'fireInterval should be lengthened while a tier goes up')
  // The tier must increment when the work finishes, not when it starts, or the
  // player gets the new stats for free during the build.
  const finish = /this\.buildLeft = 0\s*\n\s*this\.tier\+\+/
  assert.match(tower, finish, 'the tier should go up when the build completes')
})
