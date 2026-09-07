import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  tabLabelFits,
  type DrawerConfig, drawerLayout, drawerWidth, inRect, scrollToShow, tileVisible,
} from '../src/systems/DrawerLayout.ts'
import { cornerRadii } from '../src/ui/EdgeDock.ts'
import {
  hudLayout, NO_INSETS, resolveInsets, type Insets, type Rect,
} from '../src/systems/HudLayout.ts'
import { DEFAULT_SAVE } from '../src/systems/Save.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

const P = read('presentation')
const CFG = P.drawer as DrawerConfig
const LAYOUT = P.hud.layout
const TOWERS = Object.keys(read('towers'))
const WIDEST = { countersWidth: 333, abilitiesWidth: 322 }
const VIEWPORTS: Array<[string, number, number]> = [
  ['844x390', 844, 390],
  ['568x320', 568, 320],
  ['1280x720', 1280, 720],
  ['390x844', 390, 844],
]

const area = (w: number, h: number): Rect =>
  hudLayout({ width: w, height: h, insets: NO_INSETS, ...WIDEST }, LAYOUT).panelArea
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/* --------------------------------------------------------------- the flag */

test('the drawer is OFF by default', () => {
  // It is opt-in scaffolding. A player who never opens settings gets the ring.
  assert.equal(DEFAULT_SAVE.controlDrawer, false)
})

test('a save written before the flag existed reads as off', () => {
  const save = src('systems/Save.ts')
  assert.match(save, /controlDrawer: parsed\.controlDrawer === true/,
    'an absent flag must read false, not undefined-as-truthy')
})

test('the flag is read at the point of use, not cached at boot', () => {
  // The whole point of a runtime flag is comparing the two minutes apart on
  // the same board. A value captured in create() cannot do that.
  const save = src('systems/Save.ts')
  assert.match(save, /export function controlDrawerOn\(\): boolean \{\s*return loadSave\(\)\.controlDrawer/)
})

/* ------------------------------------------------------- sizes from data */

test('the panel width comes from the data, at the sizes asked for', () => {
  assert.equal(drawerWidth(844, CFG), 152)
  assert.equal(drawerWidth(568, CFG), 118)
  // A rule with a shape, not two constants: anything wide takes the wide one.
  assert.equal(drawerWidth(1280, CFG), 152)
  assert.equal(drawerWidth(320, CFG), 118)
})

test('the breakpoint list always has an answer', () => {
  const last = CFG.widths[CFG.widths.length - 1]!
  assert.equal(last.minViewW, 0, 'the last breakpoint must catch every viewport')
  for (let i = 1; i < CFG.widths.length; i++) {
    assert.ok(CFG.widths[i - 1]!.minViewW > CFG.widths[i]!.minViewW,
      'breakpoints must be widest first')
  }
})

test('the tab is the size asked for and nothing in code decides it', () => {
  assert.equal(CFG.tabWidth, 34)
  assert.equal(CFG.tabHeight, 88)
  assert.equal(CFG.tileHeight, 62)
  assert.equal(CFG.columns, 2)
  // CODE ONLY. The comments cite the measured sizes on purpose — a note that
  // says "the panel holds 118 to 152 pixels" is why the reader believes the
  // rest of it — and a regex over the whole file matched the explanation.
  const drawer = src('ui/ControlDrawer.ts').split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
  // Not preceded or followed by a digit or a point, so `w * 0.88` — a
  // fraction of a size that DOES come from the data — is not a dimension.
  assert.doesNotMatch(drawer, /(?<![\d.])(34|88|152|118|62)(?![\d.])/,
    'a drawer dimension is hardcoded in the component')
})

/* ------------------------------------------------ clear of the HUD, always */

test('the tab never covers the ability strip, the wave chip or the gear', () => {
  for (const [name, w, h] of VIEWPORTS) {
    const hud = hudLayout({ width: w, height: h, insets: NO_INSETS, ...WIDEST }, LAYOUT)
    const { tab } = drawerLayout(w, hud.panelArea, TOWERS.length, 0, CFG)
    for (const [k, r] of Object.entries({
      counters: hud.counters, startButton: hud.startButton, settings: hud.settings,
      abilities: hud.abilities, cancel: hud.cancel, heroChip: hud.heroChip,
    })) {
      assert.ok(!overlaps(tab, r), `${name}: the tab overlaps ${k}`)
    }
    assert.ok(tab.x >= 0 && tab.x + tab.width <= w, `${name}: the tab is off screen`)
    assert.ok(tab.y >= 0 && tab.y + tab.height <= h, `${name}: the tab is off the bottom`)
  }
})

test('the expanded panel never covers the ability strip or the wave chip', () => {
  for (const [name, w, h] of VIEWPORTS) {
    const hud = hudLayout({ width: w, height: h, insets: NO_INSETS, ...WIDEST }, LAYOUT)
    const { panel } = drawerLayout(w, hud.panelArea, TOWERS.length, 0, CFG)
    for (const [k, r] of Object.entries({
      counters: hud.counters, startButton: hud.startButton, settings: hud.settings,
      abilities: hud.abilities, cancel: hud.cancel, heroChip: hud.heroChip,
      messageRow: hud.messageRow,
    })) {
      assert.ok(!overlaps(panel, r), `${name}: the panel overlaps ${k}`)
    }
    assert.ok(panel.x + panel.width <= w + 0.5, `${name}: the panel runs off the right`)
    assert.ok(panel.y >= 0 && panel.y + panel.height <= h, `${name}: the panel is off screen`)
  }
})

test('the tab sits at the same right edge as the panel while it is closed', () => {
  for (const [, w, h] of VIEWPORTS) {
    const { tab, panel } = drawerLayout(w, area(w, h), TOWERS.length, 0, CFG, false, w)
    assert.equal(Math.round(tab.x + tab.width), Math.round(panel.x + panel.width),
      'the tab must read as the panel’s handle, not float beside it')
  }
})

test('the handle is FLUSH with the screen edge, exactly, at every viewport', () => {
  /*
   * IT FLOATED SIX PIXELS SHORT, and the six were worth chasing before
   * changing anything: an off-by-a-few in this codebase has meant a
   * canvas-versus-CSS-pixel error six times, and that class of bug scales with
   * the device ratio. This one did not — measured 6px at devicePixelRatio 1
   * and 6px at 3, at both viewports — so it was arithmetic in the right space
   * against the wrong rectangle. `panelArea` insets six pixels on each side
   * for chrome that floats inside it, and a drawer is not that: its whole
   * claim is to be attached to the edge.
   *
   * Exactly equal, not within a pixel. A gap is either zero or it is visible.
   */
  for (const [name, w, h] of VIEWPORTS) {
    for (const open of [false, true]) {
      const l = drawerLayout(w, area(w, h), TOWERS.length, 0, CFG, open, w)
      const edge = open ? l.panel : l.tab
      assert.equal(edge.x + edge.width, w,
        `${name}${open ? ' open' : ' closed'}: the drawer stops ` +
        `${(w - (edge.x + edge.width)).toFixed(1)}px short of the screen`)
    }
  }
})

test('the handle docks to the SCREEN on the edge with no notch behind it', () => {
  /*
   * THE TEST ABOVE PASSED WHILE THE HANDLE FLOATED 64px IN, and this is why:
   * it chose its own `dockRight` — the viewport width — and then asserted the
   * panel reached it. That proves `drawerLayout` and nothing about the value
   * GameScene actually hands it, which is
   *
   *     dockRight: () => viewW(this) - safeAreaInsets().right
   *
   * A notched phone in landscape reports the housing inset on BOTH horizontal
   * edges, so `right` came back as 64 on an edge with live map behind it. The
   * assertion could not see that because the inset never entered it.
   *
   * So this one runs the real formula against a resolved inset pair.
   */
  const dockRight = (viewW: number, insets: Insets) => viewW - insets.right
  const raw = { top: 0, right: 64, bottom: 0, left: 64 }
  for (const [name, w, h] of VIEWPORTS) {
    for (const [side, gap] of [['left', 0], ['right', 64]] as const) {
      const insets = resolveInsets(raw, side)
      const l = drawerLayout(w, area(w, h), TOWERS.length, 0, CFG, false,
        dockRight(w, insets))
      const short = w - (l.tab.x + l.tab.width)
      assert.equal(short, gap,
        `${name}, housing on the ${side}: the handle stops ${short}px short of ` +
        `the screen and it should stop ${gap}`)
    }
  }
})

test('a docked edge has square corners and no outline along it', () => {
  // There is nothing behind the display's edge, so a rounded corner and a
  // stroke there both describe a shape floating in front of something.
  const r = cornerRadii('right', 9)
  assert.deepEqual(r, { tl: 9, tr: 0, bl: 9, br: 0 }, 'the docked corners are not square')
  assert.deepEqual(cornerRadii('left', 9), { tl: 0, tr: 9, bl: 0, br: 9 })
  const dock = src('ui/EdgeDock.ts')
  assert.doesNotMatch(dock, /strokeRoundedRect|strokeRect/,
    'the outline is a stroked rectangle, so it runs down the docked edge too')
  assert.match(dock, /strokePath\(\)/, 'the outline is not an open path')
})

test('the handle wears the drawer’s own material, not a plate of its own', () => {
  // It was a flat orange rounded rectangle with a black chevron and no
  // relationship to the panel it opens.
  const drawer = src('ui/ControlDrawer.ts')
  assert.match(drawer, /dockedSlab\(this\.tabG, tab, 'right', \{\s*\n?\s*fill: CFG\.slab/,
    'the closed handle is not the drawer’s slab, docked')
  assert.match(drawer, /CFG\.chevron/, 'the chevron is still drawn in the outline colour')
  const code = drawer.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
  // Anchored: `tabFillActive` and `tabFillIdle` are the TAB BAR's colours,
  // which are a different thing from the handle's old orange plate.
  assert.doesNotMatch(code, /CFG\.tabFill\b/, 'the orange plate fill is back')
})

test('CANCEL is docked by the same rule', () => {
  for (const [name, w, h] of VIEWPORTS) {
    const l = hudLayout({ width: w, height: h, insets: NO_INSETS, ...WIDEST }, LAYOUT)
    assert.equal(l.cancel.x + l.cancel.width, w,
      `${name}: CANCEL stops ${(w - (l.cancel.x + l.cancel.width)).toFixed(1)}px short`)
  }
  const game = src('scenes/GameScene.ts')
  assert.match(game, /dockedSlab\(this\.cancelSlab, cb, 'right'/,
    'CANCEL is still drawn on the painted plate, which has four rounded corners')
})

test('the tab never sits over a tile, at any viewport', () => {
  /*
   * A TILE UNDER THE TAB IS A TILE THAT CANNOT BE PICKED. `press` tests the
   * tab first — it has to, two rectangles cannot share a point and both be
   * right — so a tap on that tile closes the drawer instead of choosing a
   * tower. At 568x320 the tab covered the whole right-hand column's first two
   * rows and Writeoff was unbuyable; at 844x390 the same overlap was a
   * five-pixel sliver the tile's centre happened to miss, which is why it
   * needed the narrow viewport to show up at all.
   */
  for (const [name, w, h] of VIEWPORTS) {
    const l = drawerLayout(w, area(w, h), TOWERS.length, 0, CFG, true)
    for (const [i, t] of l.tiles.entries()) {
      assert.ok(!overlaps(l.tab, t), `${name}: the tab covers tile ${i}`)
    }
    // And it is outside the panel entirely, not merely off the tiles: the gap
    // between tiles is not a place a handle may hide.
    assert.ok(!overlaps(l.tab, l.panel), `${name}: the open tab overlaps the panel`)
    assert.equal(Math.round(l.tab.x + l.tab.width), Math.round(l.panel.x),
      `${name}: the open tab is not against the panel's outside edge`)
  }
})

test('the open tab is still on screen at every viewport', () => {
  // Moving the tab outward is only correct while there is an outward to move
  // to. A drawer wider than the free space would push its own handle off the
  // left of the HUD area.
  for (const [name, w, h] of VIEWPORTS) {
    const a = area(w, h)
    const l = drawerLayout(w, a, TOWERS.length, 0, CFG, true)
    assert.ok(l.tab.x >= a.x, `${name}: the open tab is left of the usable area`)
    assert.ok(l.tab.x >= 0, `${name}: the open tab is off the left of the screen`)
  }
})

/* ------------------------------------------------------------- the grid */

test('every tile is inside the grid horizontally, at every viewport', () => {
  for (const [name, w, h] of VIEWPORTS) {
    const l = drawerLayout(w, area(w, h), TOWERS.length, 0, CFG)
    for (const [i, t] of l.tiles.entries()) {
      assert.ok(t.x >= l.grid.x - 0.5, `${name}: tile ${i} starts left of the grid`)
      assert.ok(t.x + t.width <= l.grid.x + l.grid.width + 0.5,
        `${name}: tile ${i} runs past the grid`)
      assert.ok(t.width > 0 && t.height > 0, `${name}: tile ${i} has no area`)
    }
  }
})

test('six towers make three rows of two', () => {
  const l = drawerLayout(844, area(844, 390), 6, 0, CFG)
  assert.equal(l.tiles.length, 6)
  // Two columns: tiles 0 and 1 share a row, 0 and 2 do not.
  assert.equal(l.tiles[0]!.y, l.tiles[1]!.y)
  assert.notEqual(l.tiles[0]!.y, l.tiles[2]!.y)
  assert.ok(l.tiles[1]!.x > l.tiles[0]!.x)
})

test('how far each viewport has to scroll, measured', () => {
  /*
   * MEASURED, AND IT HAS MOVED THREE TIMES. 198px of tiles is the content at
   * every size; what varies is the grid it is seen through.
   *
   * First: moving CANCEL out of the bottom-right corner into the HUD band
   * cost `panelArea` eighteen pixels, so the 844x390 grid went from 202 to
   * 184 and the last row fell fourteen pixels short of fitting.
   *
   * Second, and much larger: the panel now stacks four sections rather than
   * one. A header for the peanut count, a TOWERS/ACTIVE/PASSIVE bar, the
   * grid, and a pinned detail strip. The chrome costs 96px at 844x390 and
   * 75px at 568x320, and every one of those pixels comes out of the grid.
   *
   * Third, and it goes the other way for once: CANCEL went BACK to the bottom
   * corner, because a player who taps an ability by accident has to be able to
   * find the way out and could not. So `panelArea` gets the eighteen pixels
   * back at the top — and, at 568x320, twenty-seven more at the bottom, where
   * the bound is now `min(abilities.y, cancel.y)` and CANCEL is the taller of
   * the two once the icons have shrunk.
   *
   * Fourth, and it is the peanut counter leaving. The panel had its own
   * wallet in a header row, and a level 3 playtest screenshot caught it
   * reading 404 while the HUD read 408. WHY THEY DISAGREED: the drawer is
   * only redrawn by `refreshAffordability`, which fires when a tile's
   * affordable flag FLIPS, so earning four peanuts redrew nothing and the
   * drawer's number stayed at whatever the last rebuild read. One number in
   * two places is one too many, so the header went and the grid got its
   * height back.
   *
   *   844x390   inner 202 -> grid 118  content 198   maxScroll 80
   *   568x320   inner 133 -> grid 73   content 198   maxScroll 125
   *
   * THE NARROW CASE IS THE ONE TO LOOK AT, and it has finally crossed the
   * line that mattered. A 62px tile now FITS in the 73px grid, so 568x320
   * shows a whole tile for the first time — it was 55px and 89% of one. The
   * counter was costing the smallest screen the ability to see any tile
   * completely.
   */
  const wide = drawerLayout(844, area(844, 390), 6, 0, CFG)
  const narrow = drawerLayout(568, area(568, 320), 6, 0, CFG)
  const desk = drawerLayout(1280, area(1280, 720), 6, 0, CFG)
  assert.equal(Math.round(wide.grid.height), 118, '844x390 grid height moved')
  assert.equal(Math.round(narrow.grid.height), 73, '568x320 grid height moved')
  assert.equal(Math.round(wide.maxScroll), 80, '844x390 no longer scrolls by 80')
  assert.equal(Math.round(narrow.maxScroll), 125, '568x320 no longer scrolls by 125')
  // THE MARGIN, pinned. A grid under half a tile makes every tile untappable.
  // The narrow screen now clears a WHOLE tile, which it never did before.
  assert.ok(narrow.grid.height >= CFG.tileHeight,
    `568x320's grid is ${narrow.grid.height}px against a ${CFG.tileHeight}px tile; ` +
    'it used to fit none of one and must not go back')
  assert.equal(desk.maxScroll, 0, 'a 720-tall screen should never need to scroll')
  assert.ok(narrow.maxScroll > wide.maxScroll,
    'the narrow screen must be the worse case, or the widths are the wrong way round')
})

test('the panel chrome takes exactly what the breakpoint says, and no more', () => {
  // The arithmetic above, as an assertion, so a height nudged in the data
  // cannot quietly eat the grid.
  for (const [name, w, h] of VIEWPORTS) {
    const l = drawerLayout(w, area(w, h), 6, 0, CFG)
    const step = l.step
    const inner = l.panel.height - CFG.pad * 2
    // Three sections, so two gaps between them plus one under the grid: the
    // header that carried the peanut count is gone, and with it one gap.
    const chrome = step.tabBarHeight + step.detailHeight + step.sectionGap * 2
    assert.ok(Math.abs(inner - chrome - l.grid.height) < 0.001,
      `${name}: inner ${inner} minus chrome ${chrome} is not the grid's ${l.grid.height}`)
    assert.ok(l.grid.height > 0, `${name}: the chrome has eaten the whole grid`)
  }
})

test('scrolling moves the tiles and nothing else', () => {
  const at0 = drawerLayout(568, area(568, 320), 6, 0, CFG)
  const at30 = drawerLayout(568, area(568, 320), 6, 30, CFG)
  assert.deepEqual(at30.grid, at0.grid, 'the grid viewport must not move with the content')
  assert.deepEqual(at30.panel, at0.panel, 'the panel must not move with the content')
  assert.equal(at30.tiles[0]!.y, at0.tiles[0]!.y - 30)
})

test('scroll is clamped at both ends', () => {
  const a = area(568, 320)
  const under = drawerLayout(568, a, 6, -500, CFG)
  const over = drawerLayout(568, a, 6, 9999, CFG)
  const top = drawerLayout(568, a, 6, 0, CFG)
  const bottom = drawerLayout(568, a, 6, top.maxScroll, CFG)
  assert.deepEqual(under.tiles[0], top.tiles[0], 'scrolling up past the top must stop')
  assert.deepEqual(over.tiles[0], bottom.tiles[0], 'scrolling down past the end must stop')
})

test('EVERY tile is reachable by scrolling, at every viewport', () => {
  /*
   * The claim the slice rests on. A grid that scrolls is a grid where a tile
   * can be permanently off screen, and six is enough for that to happen.
   *
   * THE GUARANTEE IS NOW TWO GUARANTEES, and the split is a real cost rather
   * than a relaxed assertion. Where the grid is at least a tile tall, every
   * tile can still be brought FULLY into view. Where it is not, nothing can
   * bring a whole tile into view because there is nowhere to put it; what must
   * still hold there is that scrolling brings every tile to the most the grid
   * can show, and that this clears the half a tile the pick path requires.
   *
   * NO VIEWPORT IS IN THE SECOND CASE ANY MORE. 568x320 was, at 39 and then at
   * 55px against a 62px tile; removing the peanut header took it to 73. The
   * branch stays because the second case is one height nudge away from being
   * real again, and 'which viewports can show a whole tile, recorded' below is
   * what fails when a viewport crosses back.
   */
  for (const [name, w, h] of VIEWPORTS) {
    const a = area(w, h)
    const base = drawerLayout(w, a, TOWERS.length, 0, CFG)
    const fits = base.grid.height >= CFG.tileHeight
    for (let i = 0; i < TOWERS.length; i++) {
      const to = scrollToShow(i, 0, CFG, base.grid, TOWERS.length)
      const l = drawerLayout(w, a, TOWERS.length, to, CFG)
      if (fits) {
        assert.ok(tileVisible(l.tiles[i]!, l.grid, 0.99),
          `${name}: tile ${i} cannot be brought fully into view (scroll ${to})`)
      } else {
        const shown = l.grid.height / CFG.tileHeight
        assert.ok(tileVisible(l.tiles[i]!, l.grid, shown - 0.001),
          `${name}: tile ${i} is not brought to the most the ${l.grid.height}px ` +
          `grid can show (scroll ${to})`)
        assert.ok(tileVisible(l.tiles[i]!, l.grid, 0.5),
          `${name}: tile ${i} cannot be tapped even at its best scroll`)
      }
    }
  }
})

test('which viewports can show a whole tile, recorded', () => {
  // Stated rather than left implicit in the branch above, so that a change
  // which quietly moves a viewport from one case to the other fails here.
  const canShowWhole: Record<string, boolean> = {}
  for (const [name, w, h] of VIEWPORTS) {
    canShowWhole[name] = drawerLayout(w, area(w, h), 6, 0, CFG).grid.height >= CFG.tileHeight
  }
  // 568x320 crossed this line when the drawer's duplicate peanut counter was
  // removed: its grid went from 55px to 73px against a 62px tile, and that
  // header row was the last thing keeping the smallest screen from ever
  // showing a tile whole. Every viewport can now, so the two-guarantee split
  // above has no case left to exercise -- it is kept because it is one height
  // nudge away from mattering again, and this record is what says so.
  assert.deepEqual(canShowWhole, {
    '844x390': true,
    '568x320': true,
    '1280x720': true,
    '390x844': true,
  }, 'a viewport has crossed the line between showing a whole tile and not')
})

test('scrollToShow does not move a tile that is already visible', () => {
  const a = area(844, 390)
  const l = drawerLayout(844, a, 6, 0, CFG)
  assert.equal(scrollToShow(0, 0, CFG, l.grid, 6), 0)
})

test('a tile scrolled fully out of view is not counted as reachable', () => {
  // The control for the test above: tileVisible has to be capable of false.
  const l = drawerLayout(568, area(568, 320), 6, 0, CFG)
  const gone = { ...l.tiles[0]!, y: l.grid.y - 1000 }
  assert.equal(tileVisible(gone, l.grid), false)
})

/* ------------------------------------------------------------ hit testing */

test('a point in a tile is in that tile and no other', () => {
  const l = drawerLayout(844, area(844, 390), 6, 0, CFG)
  for (const [i, t] of l.tiles.entries()) {
    const cx = t.x + t.width / 2
    const cy = t.y + t.height / 2
    const hits = l.tiles.filter((o) => inRect(o, cx, cy))
    assert.equal(hits.length, 1, `tile ${i}'s centre lands in ${hits.length} tiles`)
    assert.ok(inRect(t, cx, cy))
  }
})

test('tiles do not overlap each other', () => {
  for (const [name, w, h] of VIEWPORTS) {
    const l = drawerLayout(w, area(w, h), TOWERS.length, 0, CFG)
    for (let i = 0; i < l.tiles.length; i++) {
      for (let j = i + 1; j < l.tiles.length; j++) {
        assert.ok(!overlaps(l.tiles[i]!, l.tiles[j]!), `${name}: tiles ${i} and ${j} overlap`)
      }
    }
  }
})

/* ---------------------------------------------------- the placement flow */

test('the drawer path never opens the build ring on an empty node', () => {
  /*
   * The drawer scheme and the ring scheme must not both answer one tap. This
   * used to look for `openPadRing` within 600 characters of the branch, which
   * measured a comment's length rather than the code's shape and broke the
   * moment the comment grew. It reads the branch BODY now.
   */
  const game = src('scenes/GameScene.ts')
  const at = game.indexOf('if (this.drawerOn()) {')
  assert.ok(at > 0, 'the empty-node branch does not check the flag')
  const body = game.slice(at, game.indexOf('\n      }', at))
  const code = body.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
  assert.doesNotMatch(code, /openPadRing/,
    'the drawer branch falls through to the build ring')
  assert.match(code, /placeFromDrawer/, 'there is no drawer placement path')
  assert.match(code, /chooseSpotFirst/,
    'an empty node with nothing picked does nothing again')
  // And the ring path is still there for the OTHER scheme.
  assert.match(game, /this\.openPadRing\(spot\)/, 'the build ring is gone entirely')
})

test('an empty node with nothing picked opens the drawer on TOWERS', () => {
  /*
   * THE FAULT: tapping an empty node with the drawer shut did nothing at all,
   * which reads as a dead control rather than as a rule.
   *
   * Asserted on the code because the flow crosses Phaser — the scene calls
   * `setOpen(true)` and sets the tab, and both of those are the whole
   * behaviour. `toggle()` here would be the bug: a second node tapped while
   * the panel is out has to move the selection, not shut the panel.
   */
  const game = src('scenes/GameScene.ts')
  const at = game.indexOf('private chooseSpotFirst(')
  assert.ok(at > 0, 'there is no node-first path')
  const fn = game.slice(at, game.indexOf('\n  }', at))
  const code = fn.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
  assert.match(code, /activeTab\s*=\s*0/, 'it does not switch to the TOWERS tab')
  assert.match(code, /setOpen\(true\)/, 'it does not open the drawer')
  assert.doesNotMatch(code, /toggle\(\)/,
    'it toggles, so tapping a second node while the panel is out would shut it')
  assert.match(code, /pendingSpot = spot/, 'the node is not held')
  assert.match(code, /status\.alert/, 'there is no placement instruction')
})

test('TOWERS is the tab a node asks for, at every viewport', () => {
  // The tab bar is the same three tabs at both sizes, and TOWERS is index 0 in
  // the data — which is what `chooseSpotFirst` sets. If the labels are ever
  // reordered, the node would open the drawer on the wrong group.
  assert.equal(CFG.tabLabels[0], 'TOWERS', 'TOWERS is no longer the first tab')
  for (const [name, w, h] of VIEWPORTS) {
    const l = drawerLayout(w, area(w, h), 6, 0, CFG, true, w)
    assert.equal(l.tabs.length, 3, `${name}: the tab bar is not three tabs`)
    // The tab a node opens onto has to be a real rectangle on screen at both
    // sizes, or "open on TOWERS" is a state with nothing to show for it.
    const t = l.tabs[0]!
    assert.ok(t.width > 20 && t.height > 10,
      `${name}: the TOWERS tab is ${t.width}x${t.height}`)
    assert.ok(t.x >= l.panel.x && t.x + t.width <= l.panel.x + l.panel.width,
      `${name}: the TOWERS tab is outside the panel`)
    assert.ok(l.panel.width > 0 && l.grid.height > 0,
      `${name}: the panel the node opens has no grid in it`)
  }
})

test('a waiting node is cancelled by everything that cancels a pick', () => {
  // There must be no state in which a ring is pulsing and the drawer is shut,
  // and a node held with nothing to answer it is exactly that state.
  const game = src('scenes/GameScene.ts')
  const at = game.indexOf('private clearSelection(')
  const clear = game.slice(at, game.indexOf('\n  }', at))
  assert.match(clear, /pendingSpot = null/, 'CANCEL does not drop a waiting node')
  const rc = game.indexOf('private refreshCancel(')
  const cancel = game.slice(rc, game.indexOf('\n  }', rc))
  assert.match(cancel, /pendingSpot/, 'CANCEL does not light for a waiting node')
  // And the ring only draws for one of the two reasons.
  const de = game.indexOf('private drawEligibleNodes(')
  const draw = game.slice(de, game.indexOf('\n  }', de))
  assert.match(draw, /!this\.drawerPick && !this\.pendingSpot/,
    'the ring does not account for a waiting node')
})

test('placement from the drawer asks for no confirmation', () => {
  // Deliberate: a confirm on every build is friction on the most common
  // action in the game. If mis-taps prove costly the answer is an undo
  // window, not a dialog.
  const game = src('scenes/GameScene.ts')
  // The METHOD BODY, bounded by its own closing brace. Slicing to the next
  // `private place(` reached ten thousand characters into the ring's own
  // construction and reported its confirm button as this path's — a test
  // failing on code it was never looking at.
  const at = game.indexOf('private placeFromDrawer(')
  const fn = game.slice(at, game.indexOf('\n  }', at))
  // The CODE, not the prose: the method's own comment explains why there is
  // no confirmation, and a regex over the whole body matched that comment.
  const code = fn.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
  assert.doesNotMatch(code, /new Dialog|showPanel|openRing|confirmLabel/,
    'a confirmation step crept into the placement path')
  assert.match(code, /this\.place\(id, spot\)/, 'placement does not actually place')
})

test('the drawer reads pointers through the pointer-space helper', () => {
  // Five bugs have come from comparing canvas pixels with a CSS-pixel layout.
  // Every tap target in this slice is a pointer against a laid-out box.
  const drawer = src('ui/ControlDrawer.ts')
  // Through the camera that DRAWS the drawer, which is handed in. This
  // assertion used to name `scene.cameras.main` and so enshrined the bug: the
  // main camera on GameScene is the WORLD camera, and converting through it
  // gives a point on the map for a rectangle laid out in CSS pixels.
  assert.match(drawer, /pointerToScreen\(this\.scene, p, this\.opts\.camera\(\)\)/,
    'the drawer converts the pointer through the wrong camera')
  assert.doesNotMatch(drawer, /pointerToScreen\([^)]*cameras\.main/,
    'the drawer is back on the world camera')
  assert.match(src('scenes/GameScene.ts'), /camera: \(\) => this\.uiCam/,
    'the scene does not hand the drawer its UI camera')
  // Code only. The comment above that call names `p.x` to explain what it is
  // NOT doing, and a regex over the file matched the explanation.
  const code = drawer.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
  assert.doesNotMatch(code, /\bp\.x\b|\bp\.y\b|pointer\.x|pointer\.y/,
    'a raw pointer coordinate is read somewhere in the drawer')
})

/* ------------------------------------------ the press the drawer already ate */

test('the board asks who took the press, not who is under it now', () => {
  /*
   * THE DRAWER ACTS ON A PRESS BEFORE THE SCENE ASKS ABOUT IT.
   *
   * A game object's own pointerdown runs before the scene-level one, and
   * picking a tile collapses the panel — so `owns()` asked afterwards answers
   * about a panel that is no longer out, returns false, and the board scores
   * a tap on a tile as a tap on bare ground. The bare-ground branch cancels
   * the pick. The drawer selected a tower and unselected it within the same
   * tap, and the probe reported "the scene did not learn the pick" for four
   * runs while the pointer maths was innocent throughout.
   */
  const game = src('scenes/GameScene.ts').split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
  assert.match(game, /this\.drawer\.claimsPress\(ui\.x, ui\.y\)/,
    'the scene does not ask the drawer whether it took the press')
  assert.doesNotMatch(game, /this\.drawer\.owns\(/,
    'the scene is back on owns(), which answers about the panel it just closed')
})

test('the drawer records the press before anything it does can move', () => {
  const drawer = src('ui/ControlDrawer.ts')
  const body = drawer.slice(drawer.indexOf('private press('))
  const fn = body.slice(0, body.indexOf('\n  }'))
  const took = fn.indexOf('this.tookPress = this.owns(')
  assert.ok(took > 0, 'press does not record that it took the press')
  assert.ok(took < fn.indexOf('this.toggle()'),
    'the record is written after the toggle that moves the rectangles')
  // The other mover is `select`, which collapses the panel. It lives in
  // `release` now, and the record still has to be written before the gesture
  // that ends there begins.
  const rat = drawer.indexOf('private release(')
  assert.ok(rat > drawer.indexOf('private press('), 'release comes before press')
})

test('claiming a press consumes the record, so it cannot outlive one press', () => {
  // A flag set on pointerdown and cleared on pointerup leaks whenever the
  // pointerup never arrives — a finger dragged off the canvas, a lost pointer
  // capture. Reading it is what clears it.
  const drawer = src('ui/ControlDrawer.ts')
  const at = drawer.indexOf('claimsPress(')
  const fn = drawer.slice(at, drawer.indexOf('\n  }', at))
  assert.match(fn, /const took = this\.tookPress/)
  assert.match(fn, /this\.tookPress = false/)
})

/* ------------------------------------------------------- the grid scrolls */

test('the grid is scrolled by a drag, not only by the harness', () => {
  /*
   * `scrollToTile` is a lever the probe has and a player does not. Reaching
   * every tile with it and calling the grid reachable is precisely the
   * mistake the old build menu made: at 568x320 the content is 202 tall in a
   * 132-tall grid, so two of the six towers were off the bottom of a panel
   * that looked complete, with no gesture that could bring them up.
   */
  const drawer = src('ui/ControlDrawer.ts')
  assert.match(drawer, /this\.hit\.on\('pointermove'/, 'nothing listens for a drag')
  assert.match(drawer, /this\.scrollBy\(-step\)/,
    'the grid does not move against the finger')
  assert.match(drawer, /dragSlop/, 'a press and a drag are not told apart')
})

test('a drag that starts on a tile does not also buy it', () => {
  // The pick happens on RELEASE and only when the finger never travelled.
  const drawer = src('ui/ControlDrawer.ts')
  const at = drawer.indexOf('private release(')
  assert.ok(at > 0, 'there is no release handler, so the pick is still on press')
  const fn = drawer.slice(at, drawer.indexOf('\n  }', at))
  assert.match(fn, /if \(!this\.enabled \|\| !this\.open \|\| scrolled \|\| on === null\) return/,
    'release does not refuse a gesture that scrolled')
  assert.match(fn, /this\.select\(/, 'release never picks anything')
  // And press must NOT select: that is what release is for.
  const pat = drawer.indexOf('private press(')
  const press = drawer.slice(pat, drawer.indexOf('\n  }', pat))
  assert.doesNotMatch(press, /this\.select\(/, 'press still selects, so a drag buys')
})

test('the scroll indicator appears only when the grid actually scrolls', () => {
  // At 844x390 all six tiles fit, and a bar hinting at content that is not
  // there is worse than no bar.
  for (const [name, w, h] of VIEWPORTS) {
    const l = drawerLayout(w, area(w, h), TOWERS.length, 0, CFG, true)
    const fits = l.contentHeight <= l.grid.height
    assert.equal(l.maxScroll === 0, fits, `${name}: maxScroll disagrees with the content`)
  }
  const drawer = src('ui/ControlDrawer.ts')
  const at = drawer.indexOf('private scrollbar(')
  const fn = drawer.slice(at, drawer.indexOf('\n  }', at))
  assert.match(fn, /if \(max <= 0\) return/, 'the bar is drawn when there is nothing to scroll')
})

test('the drawer takes every colour it draws from the data', () => {
  /*
   * The padlock was drawn in `COLOR.panelEdge` — 0x3d4a59, from the bevelled
   * plate palette this drawer explicitly does not use — on a 0x4a3a2a tile.
   * It rendered every frame at both ratios and was invisible in every
   * screenshot, which is the failure mode a colour constant borrowed from
   * another vocabulary always has.
   */
  const drawer = src('ui/ControlDrawer.ts')
  const code = drawer.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
  for (const call of code.match(/(fillStyle|lineStyle)\([^)]*\)/g) ?? []) {
    assert.doesNotMatch(call, /COLOR\./, `a Graphics colour comes from the theme: ${call}`)
  }
  const D = read('presentation').drawer
  for (const k of ['lockFill', 'lockEdge', 'scrollbarFill', 'scrollbarWidth', 'dragSlop']) {
    assert.equal(typeof D[k], 'number', `presentation.json has no drawer.${k}`)
  }
})

/* ------------------------------------------------- the three new sections */

test('the panel stacks tabs, grid and strip in that order', () => {
  for (const [name, w, h] of VIEWPORTS) {
    const l = drawerLayout(w, area(w, h), 6, 0, CFG)
    const order = [l.tabBar, l.grid, l.detail]
    for (let i = 1; i < order.length; i++) {
      assert.ok(order[i]!.y >= order[i - 1]!.y + order[i - 1]!.height - 0.001,
        `${name}: section ${i} starts above the one before it`)
    }
    // The strip is PINNED: its bottom is the panel's inner bottom, whatever
    // the grid does above it.
    assert.ok(Math.abs((l.detail.y + l.detail.height) - (l.panel.y + l.panel.height - CFG.pad)) < 0.001,
      `${name}: the strip is not pinned to the bottom of the panel`)
    // Everything inside the panel's inner width, and nothing hanging out.
    for (const r of [l.tabBar, l.grid, l.detail, ...l.tabs]) {
      assert.ok(r.x >= l.panel.x + CFG.pad - 0.001, `${name}: a section starts left of the panel`)
      assert.ok(r.x + r.width <= l.panel.x + l.panel.width - CFG.pad + 0.001,
        `${name}: a section runs past the panel`)
    }
  }
})

test('three tabs, evenly across the inner width', () => {
  for (const [name, w, h] of VIEWPORTS) {
    const l = drawerLayout(w, area(w, h), 6, 0, CFG)
    assert.equal(l.tabs.length, CFG.tabLabels.length, `${name}: wrong number of tabs`)
    assert.equal(l.tabs.length, 3, 'TOWERS, ACTIVE and PASSIVE')
    const widths = new Set(l.tabs.map((t) => Math.round(t.width * 100)))
    assert.equal(widths.size, 1, `${name}: the tabs are not the same width`)
    const total = l.tabs.reduce((a, t) => a + t.width, 0) + l.step.tabGap * 2
    assert.ok(Math.abs(total - l.tabBar.width) < 0.001,
      `${name}: the tabs plus their gaps are not the bar's width`)
    for (let i = 1; i < l.tabs.length; i++) {
      const gap = l.tabs[i]!.x - (l.tabs[i - 1]!.x + l.tabs[i - 1]!.width)
      assert.ok(Math.abs(gap - l.step.tabGap) < 0.001, `${name}: uneven tab gap`)
    }
  }
})

test('the strip is an icon on the left and a text column on the right', () => {
  for (const [name, w, h] of VIEWPORTS) {
    const l = drawerLayout(w, area(w, h), 6, 0, CFG)
    assert.equal(l.detailIcon.width, l.step.detailIcon, `${name}: the icon is not its step's size`)
    assert.equal(l.detailIcon.width, l.detailIcon.height, `${name}: the icon is not square`)
    assert.ok(l.detailIcon.height <= l.detail.height, `${name}: the icon is taller than the strip`)
    assert.ok(l.detailText.x >= l.detailIcon.x + l.detailIcon.width,
      `${name}: the text column overlaps the icon`)
    // PADDED ON BOTH SIDES. It ran flush into the strip's outline on the right
    // for one build, because the column was given everything to the edge.
    assert.ok(l.detailText.x + l.detailText.width < l.detail.x + l.detail.width - 1,
      `${name}: the text column runs into the strip's right edge`)
    assert.ok(l.detailText.width > 40, `${name}: a ${l.detailText.width}px column holds nothing`)
  }
})

test('a label that does not fit becomes a glyph, and the rule is the rule', () => {
  // The measurement is Phaser's; the DECISION is this, and it is testable.
  assert.equal(tabLabelFits(20, 44), true)
  assert.equal(tabLabelFits(32, 44), true, 'exactly filling the padded width still fits')
  assert.equal(tabLabelFits(33, 44), false)
  assert.equal(tabLabelFits(71, 32.7), false, 'the real 568x320 case')
  // AND THE REAL ANSWER, which is that none of them fit: `uiSize` clamps every
  // screen-space size up to typography.minUiSize, so a tab label renders at
  // 15px however small a number the data asks for, and "TOWERS" at 15px bold
  // is 71px against a widest-case 44px tab. The glyph fallback the brief
  // specified for the narrow screen therefore runs on both.
  const P2 = read('presentation')
  assert.equal(P2.typography.minUiSize, 15,
    'the type floor moved; re-measure whether the tab labels fit now')
  assert.ok(P2.drawer.tabLabelSize <= P2.typography.minUiSize,
    'the requested tab label size is above the floor, so it is no longer clamped')
})

test('every tower has a trait short enough for the strip', () => {
  // 18 characters, and it never wraps because there is no second line.
  const towers = read('towers') as Record<string, { trait: string }>
  for (const [id, def] of Object.entries(towers)) {
    assert.ok(def.trait.length > 0, `${id} has no trait phrase`)
    assert.ok(def.trait.length <= 18,
      `${id}'s trait "${def.trait}" is ${def.trait.length} characters; the strip allows 18`)
  }
})

test('the tab bar and the strip take their own presses', () => {
  // A tap on PASSIVE must not fall through and start a scroll of the grid.
  const drawer = src('ui/ControlDrawer.ts')
  assert.match(drawer, /inRect\(this\.layout\.tabBar, x, y\)\)\s*return/,
    'the tab bar does not consume its own presses')
  assert.match(drawer, /inRect\(this\.layout\.detail, x, y\)\)\s*return/,
    'the pinned strip does not consume its own presses')
  assert.match(drawer, /if \(!inRect\(this\.layout\.grid, x, y\)\) return/,
    'a drag can still start outside the grid, which is the only thing that scrolls')
})

test('tiles carry artwork and a price, and still no name', () => {
  // The strip is what carries the name now. A name on a 66px tile does not
  // survive 568x320, which is why it was never there.
  const drawer = src('ui/ControlDrawer.ts')
  const draw = drawer.slice(drawer.indexOf('private drawTile'))
    .slice(0, drawer.slice(drawer.indexOf('private drawTile')).indexOf('\n  destroy('))
  assert.match(draw, /String\(tile\.price\)/, 'the price is gone from the tile')
  assert.doesNotMatch(draw, /tile\.name|detail\.name/, 'a name has appeared on the tile')
})
