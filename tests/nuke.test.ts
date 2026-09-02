import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const pres = read('presentation'), art = read('art'), rules = read('rules')

test('every word in both nuke sequences is copy, not art', () => {
  // Asked for explicitly: the text has to be editable without touching code.
  const earned = pres.serverNuke.earned
  const launch = pres.serverNuke.launch
  for (const [k, v] of Object.entries({ ...earned, ...launch })) {
    if (typeof v !== 'string') continue
    assert.ok(v.length > 0, `serverNuke copy "${k}" is empty`)
  }
  assert.equal(typeof earned.headline, 'string')
  assert.equal(typeof earned.subhead, 'string')
  assert.equal(typeof launch.heading, 'string')

  // And nothing in the overlay hardcodes a line of it.
  const body = src('ui/NukeOverlays.ts')
  for (const line of [earned.headline, earned.subhead, launch.heading]) {
    assert.ok(!body.includes(`'${line}'`) && !body.includes(`"${line}"`),
      `"${line}" is written into NukeOverlays.ts instead of read from presentation.json`)
  }
})

test('the earned sequence runs about two and a half seconds', () => {
  const e = pres.serverNuke.earned
  const total = e.bounceMs + e.slamMs + e.holdMs + e.flyMs
  assert.ok(total >= 1600 && total <= 3200,
    `the sequence runs ${total}ms; it was asked to be roughly 2.5 seconds`)
  // The blast has to land with the text rather than after it.
  assert.ok(e.shakeMs <= e.holdMs, 'the shake outlasts the hold it belongs to')
  assert.ok(e.flashMs <= e.shakeMs, 'the flash should be the shortest part of the impact')
})

test('the launch button dominates and the way out is nowhere near it', () => {
  const l = pres.serverNuke.launch
  // "Significantly larger than any button in the game."
  const plate = pres.hud.layout.plateHeight ?? 44
  assert.ok(l.buttonHeight >= plate * 4,
    `the launch button is ${l.buttonHeight}px against a ${plate}px HUD plate; that is not dominating`)

  // The X has to be a bigger target than it looks, and in a corner.
  assert.ok(l.closeSize >= 44, `a ${l.closeSize}px close button is under the 44px touch minimum`)
  assert.ok(l.closeMargin > 0, 'the close button is flush against the edge')

  // A slow pulse, not an alarm, and a press that is felt.
  assert.ok(l.pulseMs >= 900, `a ${l.pulseMs}ms pulse reads as a warning light`)
  assert.ok(l.pulseScale > 1 && l.pulseScale < 1.15,
    `a pulse to ${l.pulseScale}x is a throb rather than a pulse`)
  assert.ok(l.pressHoldMs >= 200,
    'the press needs a beat before the nuke fires, or the press is not felt')
})

test('both button states are in the manifest and are the same box', () => {
  // "Cropped to the same box with the chrome ring in the identical position
  // so swapping reads as the dome depressing" — which only holds if the
  // manifest agrees they are the same size.
  const up = art.render[art.ui.nukeButton.up]
  const down = art.render[art.ui.nukeButton.down]
  assert.ok(up && down, 'a nuke button state is missing from the manifest')
  assert.equal(up.contentWidth, down.contentWidth, 'the two states are different widths')
  assert.equal(up.contentHeight, down.contentHeight, 'the two states are different heights')
  for (const key of [art.ui.nukeButton.up, art.ui.nukeButton.down]) {
    assert.ok(art.files[key], `${key} has no file`)
  }
})

test('the nuke cannot be fired by a single tap', () => {
  // Once per run, and a misfire is unrecoverable. Arming has to open the
  // confirmation rather than cast.
  const game = src('scenes/GameScene.ts')
  const arm = game.slice(game.indexOf('armAbility(id'))
  const body = arm.slice(0, arm.indexOf('\n  }'))
  assert.match(body, /openNukeLaunch\(\)/,
    'tapping the Server Nuke icon still reaches the cast directly')
  // And the panel's launch path is the only thing that fires it.
  assert.match(game, /openNukeLaunch\(\)[\s\S]{0,900}fireAbility\(RULES\.serverNuke\.abilityId/,
    'the launch panel does not fire the nuke')
})

test('the announcement fires when the nuke is earned, once, and never mid-cast', () => {
  const game = src('scenes/GameScene.ts')
  // Earned, not used: the call sits in the drop path.
  const drop = game.slice(game.indexOf('dropChance'), game.indexOf('announceRareDrop(') + 400)
  assert.match(drop, /rareAbility = cfg\.abilityId[\s\S]{0,200}announceRareDrop/,
    'the announcement is not tied to the moment the drop is granted')

  // Once per run is structural: the drop is refused if one is already held or
  // one has been used.
  assert.match(game, /if \(this\.nukeUsed \|\| this\.status\.rareAbility !== null\) return/,
    'nothing stops the drop happening twice')

  // And it stands aside for a cast or a dialog.
  const ann = game.slice(game.indexOf('announceRareDrop(name: string)'))
  const body = ann.slice(0, ann.indexOf('\n  /**', 10))
  assert.match(body, /this\.casting \|\| this\.modalOpen/,
    'the announcement will freeze the board on top of a cast or a dialog')
})

test('both overlays are modals under the layering rules', () => {
  const body = src('ui/NukeOverlays.ts')
  // Blocker below, content above, both from the table.
  assert.match(body, /LAYER\.modalDim/, 'an overlay draws its blocker at a hand-picked depth')
  assert.match(body, /LAYER\.modal\b/, 'an overlay draws its content at a hand-picked depth')
  assert.ok(!/setDepth\(\s*\d{4,}\s*\)/.test(body), 'a raw depth is hardcoded')

  // And GameScene knows they are modals, or the HUD stays live over them.
  const game = src('scenes/GameScene.ts')
  const modal = game.slice(game.indexOf('get modalOpen()'))
  const decl = modal.slice(0, modal.indexOf('\n  }'))
  for (const f of ['nukeEarned', 'nukeLaunch']) {
    assert.match(decl, new RegExp(`this\\.${f}\\?\\.active`),
      `${f} is not in modalOpen, so the HUD will draw over it`)
  }
})

test('the drop is still rare', () => {
  // A loud announcement is only loud if it is uncommon.
  const n = rules.serverNuke
  assert.ok(n.dropChance <= 0.05, `a ${(n.dropChance * 100).toFixed(0)}% drop is not rare`)
  assert.ok(n.dropChance > 0, 'the drop can never happen')
  assert.deepEqual(n.dropFromTiers, ['elite', 'boss'], 'the drop comes off ordinary enemies')
})

/**
 * THE NUKE BUTTON IS A HUD ELEMENT, NOT A THING ON THE MAP.
 *
 * Reported as a giant red disc off the left edge that could not be tapped —
 * the signature of something drawn by the world camera and scaled by its zoom.
 * It is not: the harness `nuke` scenario measures the world camera ignoring
 * the panel, the panel holding position and size across the whole zoom band,
 * and the button firing at both ends of it. These lock the properties that
 * make that true, so the class cannot come back silently.
 */
test('both nuke panels are screen space, and nothing draws them on the map', () => {
  const game = src('scenes/GameScene.ts')
  const ov = src('ui/NukeOverlays.ts')

  // Registered with the camera split. Without this a panel is drawn by BOTH
  // cameras: once pinned correctly and once on the map at world scale.
  assert.match(game, /this\.asScreenSpace\(this\.nukeLaunch\.objects\)/,
    'the launch panel is not registered as screen space')
  assert.match(game, /this\.asScreenSpace\(this\.nukeEarned\.objects\)/,
    'the earned panel is not registered as screen space')
  // Everything visible must be inside one of the two objects the split is
  // given, or the stragglers are world-drawn.
  assert.equal((ov.match(/get objects\(\)/g) ?? []).length, 2, 'a panel exposes no objects to split')
  assert.match(ov, /return \[this\.blocker, this\.layer\]/, 'the split is given something else')
  assert.equal((ov.match(/this\.layer\.add\(\[/g) ?? []).length, 2,
    'a panel does not put its content in the layer, so the split misses it')
  // Pinned, and pinned by the camera split ALONE.
  //
  // This used to require `setScrollFactor(0)` on both layers and both
  // blockers, on the reasoning that a pinned thing must ignore camera scroll.
  // It must not: `asScreenSpace` takes these objects off the world camera
  // entirely, so panning cannot move them whatever their scroll factor, while
  // the UI camera they ARE drawn by has a scroll of its own — -844, -390 at
  // devicePixelRatio 3 on an 844x390 viewport. An object that ignores it is
  // drawn a whole canvas up and to the left. Measured at dpr 3: the launch
  // panel was entirely off screen, leaving a dark board with the once-per-run
  // ability behind it. See tests/scrim.test.ts and the harness scenario.
  assert.equal((ov.match(/this\.layer = scene\.add\.container\(0, 0\)/g) ?? []).length, 2,
    'a panel layer is not built at the origin the UI camera measures from')
  // The leading dot matters: the file's comment names the call it must not
  // make, and a pattern that matched prose would fail on the explanation.
  assert.doesNotMatch(ov, /\.setScrollFactor\(0\)/,
    'setScrollFactor(0) mis-draws on the UI camera at dpr > 1')

  // The launch button's hit area is derived from the button it draws, so the
  // two cannot drift apart.
  assert.match(ov, /const bw = this\.button\.displayWidth \* 0\.62/,
    'the hit box is no longer measured from the button')
  assert.match(ov, /this\.hit = scene\.add\.rectangle\(W \/ 2, cy, bw, bh/,
    'the hit box is not on the button')
})

test('a panel re-centres when the viewport changes under it', () => {
  const ov = src('ui/NukeOverlays.ts')
  const game = src('scenes/GameScene.ts')
  // Composed once against the viewport it opened on. The UI camera IS
  // re-centred on a resize, so a panel that is not moves off-centre by half
  // the difference — a phone rotating, or iOS collapsing the URL bar, with a
  // panel open.
  assert.equal((ov.match(/recentre\(w: number, h: number\)/g) ?? []).length, 2,
    'a panel cannot be re-centred')
  assert.match(ov, /this\.layer\.setPosition\(\(w - this\.builtW\) \/ 2/,
    'the re-centre does not use the size it was built against')
  assert.equal((ov.match(/this\.builtW = W/g) ?? []).length, 2,
    'a panel does not record the viewport it was composed for')
  assert.match(game, /this\.nukeLaunch\?\.recentre\(viewW\(this\), viewH\(this\)\)/,
    'nothing re-centres the launch panel on a resize')
  assert.match(game, /this\.nukeEarned\?\.recentre\(viewW\(this\), viewH\(this\)\)/,
    'nothing re-centres the earned panel on a resize')
})

test('the nuke sits in the ability bar like any other ability', () => {
  const hud = src('scenes/HudScene.ts')
  const bar = src('systems/AbilityBar.ts')
  const abilities = read('abilities')
  // It goes through the same slot list as the drafted actives — not a special
  // case with its own placement, which is how it would end up somewhere else.
  assert.match(hud, /s\.rareAbility,/, 'the rare drop is not fed into the slot list')
  assert.match(bar, /export function slotDefs\(/, 'the one place slots are described is gone')
  // Same icon family, same box. A slot rendering the 600x495 button art
  // instead of the 256px icon is the "giant red disc" shape of failure.
  assert.equal(abilities.serverNuke.icon, 'ability-servernuke',
    'the bar slot would draw the launch button art rather than the ability icon')
  const render = read('art').render['ability-servernuke']
  assert.ok(render && render.contentWidth && render.contentHeight,
    'without content extents fitInBox cannot size the icon and draws it native')
})
