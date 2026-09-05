import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  hudBlocksGesture, hudLayout, hudTakesPress, NO_INSETS, type Insets, type Rect,
} from '../src/systems/HudLayout.ts'
import { drawerLayout, inRect } from '../src/systems/DrawerLayout.ts'
import presentation from '../src/data/presentation.json' with { type: 'json' }

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
/** Source with its comments stripped, for rules about what the code DOES
 *  rather than about what it says about itself. */
const code = (p: string) =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const LAYOUT = presentation.hud.layout
const DRAWER = presentation.drawer as unknown as Parameters<typeof drawerLayout>[4]

const VIEWPORTS: Array<[string, number, number]> = [
  ['iPhone SE', 568, 320],
  ['iPhone 14', 844, 390],
  ['iPad', 1080, 810],
  ['desktop', 1440, 900],
]
const NOTCH: Insets = { top: 0, right: 44, bottom: 21, left: 44 }
const WIDEST = { countersWidth: 350, abilitiesWidth: 370 }

const centre = (r: Rect) => [r.x + r.width / 2, r.y + r.height / 2] as const

/* -------------------------------------------------- the leak, at the geometry */

test('every solid piece of HUD chrome claims the gesture that starts on it', () => {
  /*
   * BUG 2, AT ITS ROOT. The camera rig listens at the SCENE level, so an
   * interactive object on top of the board does not stop it hearing a drag —
   * and the HUD is a different scene entirely, so its objects are not even in
   * GameScene's hit list to be on top of anything. Geometry is the only handle
   * there is on it.
   */
  for (const [name, width, height] of VIEWPORTS) {
    for (const insets of [NO_INSETS, NOTCH]) {
      const l = hudLayout({ width, height, insets, ...WIDEST }, LAYOUT)
      for (const [what, r] of Object.entries({
        abilities: l.abilities, startButton: l.startButton, settings: l.settings,
        cancel: l.cancel, counters: l.counters, heroRow: l.heroRow,
      })) {
        if (r.width <= 0 || r.height <= 0) continue
        const [x, y] = centre(r)
        assert.ok(hudBlocksGesture(l, x, y),
          `${name}: a drag starting on ${what} would pan the map`)
      }
    }
  }
})

test('the two questions are different, and the narrow one stays narrow', () => {
  // A TAP on a counter plate is not a control being pressed, so the board must
  // still get it: the plates sit over the lane and a build pad can be under
  // one. A DRAG on the same plate is chrome being dragged, and the map must
  // hold still. Conflating the two would have made the counters eat taps.
  const l = hudLayout({ width: 844, height: 390, insets: NO_INSETS, ...WIDEST }, LAYOUT)
  const [cx, cy] = centre(l.counters)
  assert.equal(hudTakesPress(l, cx, cy), false, 'the counters are eating taps now')
  assert.equal(hudBlocksGesture(l, cx, cy), true, 'a drag on the counters still pans')

  // And bare board is neither.
  const bx = l.panelArea.x + l.panelArea.width / 2
  const by = l.panelArea.y + l.panelArea.height / 2
  assert.equal(hudTakesPress(l, bx, by), false)
  assert.equal(hudBlocksGesture(l, bx, by), false,
    'the middle of the board counts as chrome, so the map can never be panned')

  // `messageRow` is stroked text with nothing behind it. Neither question.
  const [mx, my] = centre(l.messageRow)
  assert.equal(hudBlocksGesture(l, mx, my), false,
    'the message line is claiming gestures, so the board cannot be panned under it')
})

test('a gesture starting anywhere on the drawer belongs to the drawer', () => {
  // Tab and panel alike, open and shut. The tab moves to the panel's outside
  // edge when it opens, so both states have to be checked.
  for (const [name, w, h] of VIEWPORTS) {
    const hud = hudLayout({ width: w, height: h, insets: NO_INSETS, ...WIDEST }, LAYOUT)
    for (const open of [false, true]) {
      const l = drawerLayout(w, hud.panelArea, 6, 0, DRAWER, open, w)
      const [tx, ty] = centre(l.tab)
      assert.ok(inRect(l.tab, tx, ty), `${name}: the tab does not contain its own centre`)
      if (!open) continue
      const [px, py] = centre(l.panel)
      assert.ok(inRect(l.panel, px, py), `${name}: the panel does not contain its own centre`)
      // The grid is the part a drag is most likely to start on, since it is
      // the part that scrolls.
      const [gx, gy] = centre(l.grid)
      assert.ok(inRect(l.panel, gx, gy), `${name}: the grid is outside the panel`)
    }
  }
})

/* ------------------------------------------------ the gate, in the camera rig */

test('the rig asks who owns a pointer, once, at the press', () => {
  const rig = code('systems/CameraRig.ts')
  assert.match(rig, /claims\?: \(p: Phaser\.Input\.Pointer, over:/,
    'the rig takes no ownership predicate, so it hears every drag')
  // Asked in onDown, and the pointer is then NOT tracked. Not tracking it is
  // what makes a drag, a pinch and a release all impossible in one stroke.
  const down = rig.slice(rig.indexOf('private onDown ='))
  const body = down.slice(0, down.indexOf('\n  }'))
  assert.match(body, /this\.limits\.claims\?\.\(p, over\)/,
    'onDown does not ask who owns the pointer')
  const asked = body.indexOf('this.limits.claims')
  const tracked = body.indexOf('this.pointers.push')
  assert.ok(asked >= 0 && tracked > asked,
    'the pointer is tracked before the gate runs, so a claimed one can still pan')
  assert.match(body, /this\.ignored\.add\(p\.id\)/,
    'a claimed pointer is not recorded, so its release cannot be told apart')

  // The gate is asked ONCE. Asking again on every move would kill a legitimate
  // pan the moment the finger crossed a piece of chrome on its way past.
  const move = rig.slice(rig.indexOf('private onMove ='))
  assert.doesNotMatch(move.slice(0, move.indexOf('\n  }')), /this\.limits\.claims/,
    'the gate is re-asked mid-gesture, so a pan dies when it crosses the HUD')
})

test('a claimed pointer cannot pan, cannot pinch, and cannot disturb one that can', () => {
  const rig = code('systems/CameraRig.ts')
  // Drag: onMove only acts on a pointer the rig is tracking.
  const move = rig.slice(rig.indexOf('private onMove ='))
  assert.match(move.slice(0, move.indexOf('\n  }')), /const live = this\.find\(p\.id\)\s*\n\s*if \(!live\) return/,
    'onMove acts on pointers the rig never took')

  // Pinch: the rig arms one from `pointers`, which a claimed finger is not in.
  assert.match(rig, /if \(this\.pointers\.length === 2\) \{\s*\n\s*this\.beginPinch\(\)/s,
    'a pinch is armed from something other than the tracked pointer list')

  // Release: a finger the rig never had must not run the transitions, or
  // lifting it re-anchors the pan of a finger that is legitimately dragging.
  const up = rig.slice(rig.indexOf('private onUp ='))
  assert.match(up.slice(0, up.indexOf('\n  }')), /if \(this\.ignored\.delete\(p\.id\)\) return/,
    'releasing a claimed pointer falls into the gesture transitions')

  // Wheel: a scroll over a panel must not zoom the map out from under it.
  const wheel = rig.slice(rig.indexOf('private onWheel ='))
  assert.match(wheel.slice(0, wheel.indexOf('\n  }')), /this\.limits\.claims\?\./,
    'the wheel is ungated, so scrolling over a panel zooms the board')
})

/* -------------------------------------------------- one question, one place */

test('the board and the rig ask the SAME question, in one place', () => {
  /*
   * WHY THE EARLIER FIX DID NOT HOLD. The scratch card leaking drags to the
   * camera was fixed by gating the rig on `cameraAcceptsGestures(modalOpen)` —
   * "is a MODAL up?". The card is a modal, so it held for the card and for
   * nothing else. The drawer is not a modal. Neither is the ability bar, the
   * gear, the counters or a tower ring.
   *
   * There is one predicate now and both callers use it.
   */
  const game = code('scenes/GameScene.ts')
  assert.match(game, /chromeUnderPointer\(p: Phaser\.Input\.Pointer, over/,
    'there is no single ownership question')
  assert.match(game, /claims: \(p, over\) => this\.chromeUnderPointer\(p, over\)/,
    'the camera rig is not wired to the ownership question')
  assert.match(game, /this\.chromeUnderPointer\(p, over\)/,
    'the board does not ask the ownership question at press time')

  // And the question covers all three sources between them.
  const at = game.indexOf('chromeUnderPointer(p: Phaser.Input.Pointer')
  const fn = game.slice(at, game.indexOf('\n  }', at))
  assert.match(fn, /this\.modalOpen \|\| this\.hudModalOpen/, 'modals are not covered')
  assert.match(fn, /hudBlocksGesture\(this\.layout, ui\.x, ui\.y\)/, 'HudScene is not covered')
  assert.match(fn, /this\.drawer\?\.ownsPress\(ui\.x, ui\.y\)/, 'the drawer is not covered')
  assert.match(fn, /this\.screenSpace\.includes\(o\)/,
    "this scene's own overlays are not covered")
})

test("registration is automatic: an overlay is covered by the thing it must already do", () => {
  // The reason this is central rather than per-overlay. `asScreenSpace` is not
  // optional — an overlay that skips it pans and zooms with the map, which is
  // instantly visible — so a NEW overlay is gesture-safe the day it is written
  // and there is no second list to remember to add it to.
  const game = code('scenes/GameScene.ts')
  const registrations = [...game.matchAll(/this\.asScreenSpace\(/g)].length
  assert.ok(registrations >= 10,
    `only ${registrations} overlays register as screen space; the list looks incomplete`)
  const sync = game.slice(game.indexOf('private asScreenSpace('))
  assert.match(sync.slice(0, sync.indexOf('\n  }')), /this\.screenSpace\.push\(\.\.\.objects\)/,
    'asScreenSpace no longer records what it was given, so the gate cannot read it')
})

test('the drawer has two readers of its press record and exactly one consumes', () => {
  // The rig asks first — Phaser delivers scene-level handlers in registration
  // order and the rig is constructed before `setupInput` runs — so if the rig
  // used `claimsPress` it would eat the record and the board would then be
  // told the press was not the drawer's.
  const drawer = src('ui/ControlDrawer.ts')
  assert.match(drawer, /ownsPress\(x: number, y: number\): boolean \{\s*\n\s*return this\.tookPress \|\| this\.owns\(x, y\)\s*\n\s*\}/,
    'the non-consuming reader is gone, so the rig must consume to ask')
  const claims = drawer.slice(drawer.indexOf('claimsPress('))
  assert.match(claims.slice(0, claims.indexOf('\n  }')), /this\.tookPress = false/,
    'claimsPress no longer consumes, so a stale claim can outlive its press')

  // And the scene still uses the consuming one, once.
  const game = code('scenes/GameScene.ts')
  assert.equal([...game.matchAll(/this\.drawer\.claimsPress\(/g)].length, 1,
    'the consuming reader is called more or less than once per press')
})

test('the modal gate is kept as well, because a modal owns the whole screen', () => {
  // Not a replacement for the per-pointer gate — it is the case the per-pointer
  // gate cannot express, which is "everywhere, including the parts of the
  // screen nothing is drawn on".
  const game = code('scenes/GameScene.ts')
  assert.match(game, /this\.rig\.setEnabled\(cameraAcceptsGestures\(this\.modalOpen\)\)/,
    'the modal gate is gone; a dialog can be dragged through to the board again')
  const layers = src('systems/Layers.ts')
  assert.match(layers, /export function cameraAcceptsGestures/)
})
