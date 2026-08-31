import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bandsFor, rowRegions } from '../src/systems/Bands.ts'
import presentation from '../src/data/presentation.json' with { type: 'json' }

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

const CFG = presentation.hud.bands
/** Landscape viewports the game is expected to survive: iPhone SE, iPhone 14,
 *  iPad, desktop. */
const VIEWPORTS: Array<[string, number, number]> = [
  ['iPhone SE', 568, 320],
  ['iPhone 14', 844, 390],
  ['iPad', 1080, 810],
  ['desktop', 1440, 900],
]

test('the bands leave a usable board at every viewport', () => {
  for (const [name, , h] of VIEWPORTS) {
    const b = bandsFor(h, CFG)
    assert.ok(b.worldHeight >= CFG.minWorldHeight - 1,
      `${name}: ${b.worldHeight}px of board is below the floor of ${CFG.minWorldHeight}`)
    assert.equal(b.top + b.worldHeight + b.bottom, h,
      `${name}: the bands and the board do not add up to the screen`)
    assert.ok(b.top > 0 && b.bottom > 0, `${name}: a band vanished`)
  }
})

test('a short screen takes it out of both bands, not one', () => {
  // A HUD with its bottom row cut off is worse than a slightly cramped one.
  const roomy = bandsFor(900, CFG)
  const tiny = bandsFor(240, CFG)
  assert.ok(tiny.top < roomy.top && tiny.bottom < roomy.bottom,
    'a viewport too short for both bands did not shrink them')
  const ratio = tiny.top / tiny.bottom
  const want = roomy.top / roomy.bottom
  assert.ok(Math.abs(ratio - want) < 0.25,
    'one band gave up more than its share of the shortfall')
})

test('the top band is tall enough for what is laid into it', () => {
  const b = bandsFor(390, CFG)
  // Row one is the counter plates and the start button; row two is the boss
  // bar, the wave message and the hero's health.
  const needed = CFG.marginY + CFG.plateHeight + CFG.rowGap + CFG.rowHeight
  assert.ok(b.top >= needed,
    `the top band is ${b.top}px but its two rows need ${needed}px`)
})

test('the second row is split into regions that cannot overlap', () => {
  for (const [name, w] of VIEWPORTS) {
    const r = rowRegions(w as number, presentation.hud.marginX)
    assert.ok(r.left.x + r.left.width <= r.right.x,
      `${name}: the message region runs into the hero region`)
    assert.ok(r.left.width > 60 && r.right.width >= 96,
      `${name}: a region is too narrow to hold anything`)
    assert.ok(r.right.x + r.right.width <= (w as number) - presentation.hud.marginX + 1,
      `${name}: the hero region runs off the right edge`)
  }
})

test('the world camera is given the band-free strip as its viewport', () => {
  // This is the whole mechanism. Clipping to the camera viewport is what makes
  // "no game object can render into a band" a property rather than a habit:
  // no depth value escapes it and no sprite is tall enough to reach past it.
  const game = src('scenes/GameScene.ts')
  const apply = /private applyBands\([\s\S]*?\n  \}/.exec(game)
  assert.ok(apply, 'applyBands is gone')
  assert.match(apply[0], /cameras\.main\.setViewport\(0, this\.bands\.worldTop, W, this\.bands\.worldHeight\)/,
    'the world camera is not confined to the strip between the bands')
  assert.match(apply[0], /bandsFor\(H, /, 'the bands are not computed from the viewport height')
  // And recomputed when the viewport changes, or a rotate leaves them stale.
  assert.match(game, /resize[\s\S]{0,200}this\.applyBands\(\)/,
    'a resize does not re-apply the bands')
})

test('the HUD lays out against the same bands the camera is clipped by', () => {
  const hud = src('scenes/HudScene.ts')
  assert.match(hud, /bandsFor\(H, HUD\.bands\)/,
    'the HUD computes its own layout from something other than the band function')
  assert.match(hud, /rowRegions\(W, HUD\.marginX\)/, 'the second row is not split into regions')
  // The boss bar and the wave message share the left region, so exactly one of
  // them may be visible.
  const boss = /private drawBossBar\([\s\S]*?\n  \}/.exec(hud)
  assert.ok(boss, 'drawBossBar is gone')
  assert.match(boss[0], /this\.message\.setVisible\(!boss\)/,
    'the boss bar and the wave message can be up at the same time, in the same region')
  assert.match(boss[0], /this\.regions\.left/, 'the boss bar is not placed in its region')
  const hero = /private drawHeroBar\([\s\S]*?\n  \}/.exec(hud)
  assert.ok(hero && /this\.regions\.right/.test(hero[0]),
    'the hero readout is not placed in its region')
})

test('nothing on the play screen is drawn from the height of the screen', () => {
  // A transient overlay centred on the *screen* lands in a band on a phone.
  // Every one of them is measured from the board instead.
  const game = src('scenes/GameScene.ts')
  for (const [name, re] of [
    ['the boss card', /private announceBoss\([\s\S]*?\n  \}/],
    ['the wave announcement', /private announce\([\s\S]*?\n  \}/],
    ['the rare-drop banner', /private announceRareDrop\([\s\S]*?\n  \}/],
  ] as Array<[string, RegExp]>) {
    const body = re.exec(game)
    assert.ok(body, `${name} is gone`)
    assert.doesNotMatch(body[0], /this\.scale\.height \* |H \/ 2/,
      `${name} is positioned from the height of the screen, so it reaches into a band`)
  }
  // The cancel button sits above the bottom band rather than on it.
  assert.match(game, /this\.scale\.height - this\.bands\.bottom - \d+,\s*\n?\s*190, 44, 'CANCEL'/,
    'the cancel button is not placed relative to the bottom band')
})

test('the build menu is confined to the board and keeps the pad visible', () => {
  const menu = src('ui/BuildMenu.ts')
  assert.match(menu, /band\?: \{ top: number; height: number \}/,
    'the build menu is not told where the board is')
  assert.match(menu, /const bottom = band \? band\.top \+ band\.height : view\.height/,
    'the menu is still clamped to the whole viewport')
  // Above the pad when there is room, beside it when there is not — a panel on
  // top of the pad hides the ghost and the range ring it exists to show.
  assert.match(menu, /screenY - h - gap >= top \+ 4/,
    'the menu no longer prefers to sit above the pad')
  assert.match(menu, /const left = screenX - w - gap/,
    'the menu has no sideways placement, so on a short board it covers the pad')
})

test('the build preview is a translucent tower on the pad, or nothing', () => {
  const game = src('scenes/GameScene.ts')
  const ghost = /private showGhost\([\s\S]*?\n  \}/.exec(game)
  assert.ok(ghost, 'there is no build preview')
  assert.match(ghost[0], /setAlpha\(0\.5\)/, 'the preview is not half transparent')
  assert.match(ghost[0], /this\.add\.image\(spot\.x, spot\.y/,
    'the preview is not snapped to the pad')
  assert.match(ghost[0], /applyRender\(g, def\.sprite\)/,
    'the preview is not scaled and anchored like the tower it previews')
  // It is a world object, so the camera viewport clips it out of the bands.
  assert.doesNotMatch(ghost[0], /asScreenSpace/,
    'the preview is screen space, so it can be drawn over the HUD')
  // No pad, no preview: it is only ever created from a spot.
  assert.doesNotMatch(game, /showGhost\((?!.*spot)/, 'a preview is drawn without a pad')

  // And a touch device has no hover, so the press is what reveals it.
  const menu = src('ui/BuildMenu.ts')
  assert.match(menu, /pointerdown'[^)]*\)?, \(\) => \{\s*\n\s*this\.pressed = opt\.id/,
    'pressing a build option does not preview it')
  assert.match(menu, /pointerup'[\s\S]{0,140}onPick\(opt\.id\)/,
    'the tower is bought on the press, so the preview is never seen on a phone')
})
