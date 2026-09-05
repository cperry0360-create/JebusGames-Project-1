import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TargetingMode, sameRequest, spends, type ExitReason,
} from '../src/systems/TargetingMode.ts'
import { Cooldowns } from '../src/systems/Cooldowns.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

/**
 * A stand-in for the scene: the mode, plus the two ledgers a cast would touch.
 *
 * The point of the whole change is that leaving targeting cannot touch either
 * of these, so the test drives the real `Cooldowns` and counts real casts
 * rather than asserting on a flag that says a cast did not happen.
 */
function board(cooldownSeconds = 20) {
  const mode = new TargetingMode()
  const cooldowns = new Cooldowns()
  cooldowns.register('gnomes', cooldownSeconds)
  const cast: string[] = []
  /** What `GameScene.onClick` does with a tap while an ability is armed. */
  const tap = (valid: boolean): ExitReason | null => {
    const out = mode.resolveTap(valid)
    if (out?.reason === 'commit') {
      cooldowns.start(out.request.id)
      cast.push(out.request.id)
    }
    return out?.reason ?? null
  }
  return { mode, cooldowns, cast, tap }
}

/* ----------------------------------------------------------- the escapes */

test('every way out of targeting leaves the ability unspent and ready', () => {
  // THE BUG THIS FILE EXISTS FOR. Targeting had one exit and it was dead, so
  // the only thing a player who armed an ability by accident could do was cast
  // it. Each of these is a way out, and none of them may cost anything.
  const exits: Array<Exclude<ExitReason, 'commit'>> =
    ['button', 'toggle', 'key', 'outside', 'replaced']
  for (const reason of exits) {
    const b = board()
    b.mode.arm({ kind: 'ability', id: 'gnomes' })
    assert.equal(b.mode.active, true, `${reason}: the mode never armed`)

    const dropped = b.mode.cancel(reason)
    assert.deepEqual(dropped?.request, { kind: 'ability', id: 'gnomes' },
      `${reason}: the cancelled request was not reported back`)
    assert.equal(dropped?.reason, reason)

    // Input is back to normal...
    assert.equal(b.mode.active, false, `${reason}: still in targeting mode`)
    assert.equal(b.mode.request, null)
    assert.equal(b.mode.pendingAbility, null)
    // ...and nothing was spent.
    assert.equal(b.cooldowns.ready('gnomes'), true,
      `${reason}: cancelling started the cooldown`)
    assert.equal(b.cooldowns.secondsLeft('gnomes'), 0)
    assert.deepEqual(b.cast, [], `${reason}: cancelling cast the ability`)
    assert.equal(spends(reason), false, `${reason} is marked as spending the ability`)
  }
})

test('cancelling with nothing armed is a no-op, so an escape need never ask first', () => {
  // Every escape is wired straight to `clearSelection`, including the ESC key,
  // which fires whether or not anything is armed. An exit that has to check
  // before it may run is an exit somebody forgets to check for.
  const b = board()
  assert.equal(b.mode.cancel('key'), null)
  assert.equal(b.mode.active, false)
  assert.equal(b.mode.resolveTap(true), null, 'a tap resolved with nothing armed')
  assert.deepEqual(b.cast, [])
})

test('pressing the armed ability a second time backs out of targeting', () => {
  const b = board()
  assert.equal(b.mode.arm({ kind: 'ability', id: 'gnomes' }), 'armed')
  assert.equal(b.mode.arm({ kind: 'ability', id: 'gnomes' }), 'toggled',
    'the second press of the same button did not toggle')
  assert.equal(b.mode.active, false, 'the toggle did not leave the mode')
  assert.equal(b.cooldowns.ready('gnomes'), true, 'toggling off started the cooldown')
  assert.deepEqual(b.cast, [])

  // A THIRD press arms it again. The toggle is a toggle, not a one-way exit.
  assert.equal(b.mode.arm({ kind: 'ability', id: 'gnomes' }), 'armed')
  assert.equal(b.mode.pendingAbility, 'gnomes')
})

test('a different button replaces rather than toggles, and still spends nothing', () => {
  const b = board()
  b.mode.arm({ kind: 'ability', id: 'gnomes' })
  assert.equal(b.mode.arm({ kind: 'ability', id: 'scratch' }), 'replaced')
  assert.equal(b.mode.pendingAbility, 'scratch')
  assert.equal(b.cooldowns.ready('gnomes'), true, 'the replaced ability was spent')

  // And the kinds do not collide: an ability and a tower may share a key, and
  // the second press must not silently mean the other one.
  assert.equal(sameRequest({ kind: 'ability', id: 'x' }, { kind: 'rally', id: 'x' }), false)
  assert.equal(sameRequest({ kind: 'rally', id: 'x' }, { kind: 'rally', id: 'x' }), true)
  assert.equal(sameRequest(null, { kind: 'rally', id: 'x' }), false)
})

/* -------------------------------------------------------------- the taps */

test('exactly one exit spends the ability, and it is the tap that lands', () => {
  const b = board()
  b.mode.arm({ kind: 'ability', id: 'gnomes' })
  assert.equal(b.tap(true), 'commit')
  assert.deepEqual(b.cast, ['gnomes'])
  assert.equal(b.cooldowns.ready('gnomes'), false, 'a cast did not start the cooldown')
  assert.equal(b.mode.active, false, 'the mode outlived the cast')
  assert.equal(spends('commit'), true)
})

test('a tap outside the legal area leaves the mode instead of trapping the player', () => {
  // It used to refuse and stay armed, which is right about the ability and
  // wrong about the mode: it meant the only thing any tap could do was keep
  // the player where they were, which is the soft-lock as felt.
  const b = board()
  b.mode.arm({ kind: 'ability', id: 'gnomes' })
  assert.equal(b.tap(false), 'outside')
  assert.equal(b.mode.active, false, 'an illegal tap left the player in targeting')
  assert.deepEqual(b.cast, [], 'an illegal tap cast the ability anyway')
  assert.equal(b.cooldowns.ready('gnomes'), true, 'an illegal tap started the cooldown')
})

/* ------------------------------------------------------- the wiring, in the scene */

test('the scene wires all four pointer routes out, plus the key', () => {
  const game = src('scenes/GameScene.ts')
  // 1. the control itself
  assert.match(game, /this\.clearSelection\('button'\)/,
    'the CANCEL control does not cancel')
  // 2. the same button again
  assert.match(game, /armed === 'toggled'/,
    'the ability button does not toggle targeting off')
  // 3. a tap outside the legal area
  assert.match(game, /this\.clearSelection\('outside'\)/,
    'a tap outside the legal area does not leave targeting')
  // 4. Escape, which is a shortcut and never the only route
  assert.match(game, /keydown-ESC', \(\) => this\.clearSelection\('key'\)/,
    'ESC no longer cancels')
})

test("CANCEL's hit rectangle is shown, because Phaser will not hit-test a hidden one", () => {
  /*
   * THE ACTUAL CAUSE OF THE DEAD BUTTON, pinned so it cannot come back.
   *
   * `PlateButton.parts` is every piece INCLUDING the hit rectangle. The scene
   * wanted CANCEL without its painted plate — it is drawn on a docked slab —
   * and hid `parts` wholesale. Phaser's `inputCandidate` runs `willRender`,
   * so an invisible object is not a hit-test candidate: the handler was wired,
   * the rectangle was in the input list, `input.enabled` was being set
   * correctly, and the tap could never reach it.
   */
  const game = src('scenes/GameScene.ts')
  const plate = src('ui/Plate.ts')

  assert.match(plate, /plates: Phaser\.GameObjects\.GameObject\[\]/,
    'PlateButton no longer names the plate art separately from the hit target')
  assert.match(plate, /plates: \[\.\.\.on, \.\.\.off\]/,
    'the plates list is not just the two painted states')

  // The scene hides the PLATES, and cannot reach the rectangle by accident.
  assert.match(game, /for \(const plate of this\.cancelBtn\.plates\)/,
    'the cancel button is back to hiding parts, which includes its hit rectangle')
  assert.doesNotMatch(game, /for \(const part of this\.cancelBtn\.parts\) \{\s*\n\s*\(part[^\n]*setVisible/,
    'the loop over parts is hiding things again')

  // And the rectangle is explicitly shown with the button rather than left to
  // whatever the plate art happened to do to it.
  assert.match(game, /this\.cancelBtn\.hit\.setVisible\(on\)/,
    'the hit rectangle is not shown with the button')
  assert.match(game, /this\.cancelBtn\.hit\.input!\.enabled = on/,
    'the input flag is no longer set: a hidden button needs both reasons')
})

test('the Ima Dummy rally point uses the same mode, so it gets the same escapes', () => {
  // It was two booleans and a comment: a tower was selected and a tap on bare
  // ground was an order. No CANCEL, no key, no highlight, and nothing to
  // press twice.
  const game = src('scenes/GameScene.ts')
  assert.match(game, /this\.targeting\.arm\(\{ kind: 'rally', id: this\.towerKey\(tower\) \}\)/,
    'selecting an Ima Dummy Tower does not arm the shared targeting mode')
  // The same toggle: tapping the tower again backs out.
  const select = game.slice(game.indexOf('private selectTower('))
  const body = select.slice(0, select.indexOf('\n  }'))
  assert.match(body, /armed === 'toggled'/,
    'tapping the selected Ima Dummy Tower again does not deselect it')
  // CANCEL is computed from the mode, so it lights for a rally order too.
  const rc = game.indexOf('private refreshCancel(')
  const refresh = game.slice(rc, game.indexOf('\n  }', rc))
  assert.match(refresh, /this\.targeting\.active/,
    'CANCEL is not computed from the targeting mode')
})

test('the mode says out loud that it is waiting, and where a tap is legal', () => {
  // On a touch device there is no hover, so a targeting mode that draws only
  // under the pointer draws nothing at all until the player has committed.
  const game = src('scenes/GameScene.ts')
  assert.match(game, /private drawTargetArea\(\): void/,
    'nothing paints the legal area when the mode is entered')
  assert.match(game, /private pulseTargetArea\(\): void/,
    'the highlight does not move, so it is invisible in peripheral vision')
  assert.match(game, /this\.pulseTargetArea\(\)/, 'the pulse is never run')
  // Drawn on a transition, not rebuilt per frame: the pulse is alpha only.
  const pulse = game.slice(game.indexOf('private pulseTargetArea('))
  assert.match(pulse.slice(0, pulse.indexOf('\n  }')), /setAlpha/,
    'the pulse redraws geometry every frame')

  // Every number in it is data, per the project rule.
  const P = JSON.parse(readFileSync(url('../src/data/presentation.json'), 'utf8'))
  for (const k of ['pulseMs', 'washAlpha', 'edgeAlpha', 'edgeWidth', 'laneRadius', 'step']) {
    assert.equal(typeof P.targeting[k], 'number', `targeting.${k} is not in presentation.json`)
  }
})

test('the mirrors have exactly one writer', () => {
  // `status.mode` and `status.pendingAbility` are read by the HUD and by the
  // save format. They used to be assigned by every method that entered or left
  // a mode, and the pair drifting apart is the whole failure.
  const game = src('scenes/GameScene.ts')
  const writes = [...game.matchAll(/this\.status\.mode = /g)].length
  assert.equal(writes, 1, `status.mode is assigned in ${writes} places, not one`)
  const sync = game.slice(game.indexOf('private syncTargeting('))
  assert.match(sync.slice(0, sync.indexOf('\n  }')), /this\.status\.pendingAbility = /,
    'the pending ability is not mirrored beside the mode')
})
