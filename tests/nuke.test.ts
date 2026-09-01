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
