import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  atSpecChoice, BASE_TIER, isMaxed, maxTier, nextStep, sellValue, statAt,
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

  // The run-end screen is a panel now, so its way out is a dialog button.
  assert.match(game, /'TRY AGAIN'/,
    'the run-end screen offers no way to start another run')
  assert.match(game, /cancelLabel: 'QUIT TO TITLE'/,
    'the run-end screen has no way out, so a touch player cannot leave it')
  assert.match(game, /'CANCEL'/,
    'an armed ability can only be cancelled with a key')
  assert.match(hud, /plateButton\(/, 'the HUD start-wave button is not a button')
  // The credits are a scroll, not a page, so the pointer route is the whole
  // screen rather than a button in a corner of a roll that is moving.
  assert.match(credits, /setInteractive[\s\S]{0,120}pointerdown/,
    'the credits roll can only be left with a key')
  assert.match(splash, /pointerdown/, 'the splash can only be skipped with a key')
})

test('the run-end screen is on the screen it appears on, and cannot be left behind', () => {
  const game = src('scenes/GameScene.ts')
  const dialog = src('ui/Dialog.ts')
  // It used to be placed against the 1280x720 design box in *world* space,
  // which put it at the centre of the map rather than the centre of the view.
  // Panned to a corner at gameplay zoom, the player reached the end of a run
  // with no banner and no button — exactly the dead end the panel exists to
  // prevent. It has to be positioned against the live viewport and drawn by
  // the camera that does not move.
  const open = /private openDialog\([\s\S]*?\n  \}/.exec(game)
  assert.ok(open, 'openDialog is gone')
  assert.match(open[0], /viewW\(this\) \/ 2, viewH\(this\) \/ 2/,
    'the dialog is not centred on the live viewport')
  assert.match(open[0], /this\.asScreenSpace\(this\.dialog\.objects\)/,
    'the dialog is drawn by the world camera, so panning moves it off view')

  // And the run-end panel goes through it rather than drawing its own.
  const end = /\n  (?:private )?endRun\(phase[\s\S]*?\n  \}/.exec(game)
  assert.ok(end, 'endRun is gone')
  assert.match(end[0], /this\.openDialog\(\{/, 'the run-end screen is hand-drawn again')

  // A phone in landscape can be 320px tall and a results panel is taller than
  // that. A panel that runs off the screen takes its buttons with it.
  assert.match(dialog, /Math\.min\(1, \(viewH\(scene\) - MARGIN\) \/ h/,
    'a dialog taller than the viewport is not scaled to fit')
  const btn = /plateButton\(scene, bx, btnY, bw, (\d+),/.exec(dialog)
  assert.ok(btn && Number(btn[1]) >= 44,
    'dialog buttons are below the 44px touch target floor')
})

test('every full-screen overlay is drawn by the camera that does not move', () => {
  // Same fault as the run-end screen, in every other overlay: laid out against
  // the design box, drawn in world space, and therefore centred on the map
  // instead of on whatever the player is looking at. The scratch ticket is the
  // worst of them — it is a drag target, so off-view it is a soft lock.
  const game = src('scenes/GameScene.ts')
  // `showNextBanner` rather than `announce`: announce only queues now — five
  // things announce themselves and three of them can fire on the same frame,
  // so there is one slot and a queue behind it — and the object that has to
  // reach the UI camera is made where it is drawn.
  assert.match(game, /private announce\([\s\S]{0,300}?this\.showNextBanner\(\)/,
    'announce no longer goes through the one banner slot')
  for (const fn of ['windUp', 'showTicket', 'announceBoss', 'showNextBanner']) {
    // Matched with or without `private`: a method made public so the harness
    // can drive it must not fall out of an invariant it is still subject to.
    const from = Math.max(game.indexOf(`private ${fn}(`), game.indexOf(`\n  ${fn}(`))
    assert.ok(from > 0, `${fn} has moved; this test is checking nothing`)
    const nextPrivate = game.indexOf('\n  private ', from + 10)
    const nextPublic = game.indexOf('\n\n  /**', from + 10)
    const end = Math.min(...[nextPrivate, nextPublic].filter((n) => n > 0))
    const body = game.slice(from, end)
    assert.doesNotMatch(body, /displayData\.(width|height)/,
      `${fn} positions against the design box rather than the viewport`)
    assert.match(body, /asScreenSpace\(/, `${fn} never hands its overlay to the UI camera`)
  }
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

test('a ring pick does not also act on the map underneath', () => {
  // Phaser hit-tests before it dispatches, so a button's own handler can have
  // closed the menu by the time the scene's handler runs. Whether the press
  // belonged to the UI has to be answered at PRESS time, off the hit list —
  // never by asking "is the menu still open", which is false by then.
  const game = src('scenes/GameScene.ts')
  assert.match(game, /this\.ring\?\.active === true && this\.ring\.owns\(over\)/,
    'the ring guard does not ask the hit list at press time')
  const ring = src('ui/TowerRing.ts')
  // Both layers, or a press on the description panel falls through to the map.
  assert.match(ring, /this\.ringLayer\.list\?\.includes\(o\) \|\| this\.panelLayer\.list\?\.includes\(o\)/,
    'owns() checks only one of the two layers')
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
    // Tier 3 is a choice, so nextStep runs out one tier early by design.
    assert.ok(atSpecChoice(def, 2), `${id} tier 3 should be a specialization choice`)
    assert.equal(nextStep(def, maxTier(def)), null, `${id} offers an upgrade past its top tier`)
    assert.ok(isMaxed(def, maxTier(def)))
    assert.ok(!isMaxed(def, BASE_TIER))
    assert.ok(nextStep(def, BASE_TIER)!.buildSeconds > 0, `${id} tier 2 would be instant`)
    for (const spec of def.specializations) {
      assert.ok(spec.buildSeconds > 0, `${id}'s ${spec.name} would be instant`)
    }
  }
})

test('a tier actually makes the tower better', () => {
  for (const [id, def] of towerList) {
    // Every specialization has to be a real step up on the tier it comes from.
    for (const spec of def.specializations) {
      const gains = def.supportRadius > 0
        ? [['supportDamageBonus', 'supportRadius']]
        : [['damage', 'range', 'fireInterval', 'splashRadius', 'slowSeconds', 'armorPierce']]
      const better = gains[0].some((k) => {
        const at2 = statAt(def, 2, k as never)
        const at3 = statAt(def, 3, k as never, spec.id)
        return k === 'fireInterval' ? at3 < at2 : at3 > at2
      })
      assert.ok(better, `${id}'s ${spec.name} is not better than tier 2 at anything`)
    }
    if (def.supportRadius > 0) continue
    assert.ok(statAt(def, 2, 'damage') > statAt(def, 1, 'damage'), `${id} tier 2 is not stronger`)
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
      const spec = t === 3 ? def.specializations[0].id : null
      let paid = def.cost
      for (let k = 1; k < Math.min(t, 3); k++) paid += def.tiers[k - 1]?.cost ?? 0
      if (spec) paid += def.specializations[0].cost
      const back = sellValue(def, t, refund, spec)
      assert.ok(back < paid, `${id} at tier ${t} sells for ${back} against ${paid} paid`)
      assert.ok(back > 0, `${id} at tier ${t} sells for nothing`)
    }
  }
})

test('selling mid-upgrade refunds the tier already paid for', () => {
  const game = src('scenes/GameScene.ts')
  assert.match(game, /tower\.tier \+ \(tower\.upgrading \? 1 : 0\)/,
    'a tier still going up has been paid for and should count towards the refund')
  // And the panel must quote the same number the sell will actually pay.
  const quotes = [...game.matchAll(/sellValue\(/g)]
  assert.equal(quotes.length, 2, 'the quoted refund and the paid refund should be the one rule')
})

test('finishing a tier recomputes support', () => {
  // Support is only recalculated when the tower set changes. A Tax Shelter
  // that upgrades grows its radius without the set changing, so its new reach
  // would not have reached anything.
  const tower = src('entities/Tower.ts')
  assert.match(tower, /this\.emit\('tierup'/, 'a completed tier should announce itself')
  const game = src('scenes/GameScene.ts')
  assert.match(game, /on\('tierup', \(\) => this\.refreshSupport\(\)\)/,
    'the scene should recompute support when a tier finishes')
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

test('a wind-up cannot outlive the run it belongs to', () => {
  // The reported bug: "I could not use any ability, including the server
  // nuke, on the Politician." Every ability is refused while a cast runs, and
  // Phaser reuses the scene object across a restart — so a run abandoned
  // during the 2.2s wind-up left `casting` true for the rest of the session
  // and silently refused everything, on every enemy, forever.
  const game = src('scenes/GameScene.ts')
  const create = game.slice(game.indexOf('  create(): void {'), game.indexOf('  // ------'))
  assert.match(create, /this\.casting = false/,
    'create() does not clear the cast flag, so it survives a restart')
  // And a backstop, for a tween that goes away some other way.
  assert.match(game, /this\.casting && this\.time\.now > this\.castUntil/,
    'nothing recovers a cast whose tween never completed')
  assert.match(game, /this\.castUntil = this\.time\.now \+ seconds \* 1000/,
    'the wind-up sets no deadline for the backstop to check')
})

test('a refused ability says so', () => {
  // Silence is what made this unreportable: the player taps, nothing happens,
  // and there is nothing to describe afterwards.
  const game = src('scenes/GameScene.ts')
  const arm = game.slice(game.indexOf('armAbility(id: string | undefined)'),
    game.indexOf('/** True where this ability may be cast'))
  assert.match(arm, /if \(this\.casting\) \{/, 'the cast check is still a silent early return')
  assert.match(arm, /this\.status\.message =/, 'a refusal during a cast says nothing')
})

test('nothing exempts the boss from abilities', () => {
  // The other half of the same report. If any of these filtered on tier the
  // player would be right that the boss was immune.
  const game = src('scenes/GameScene.ts')
  for (const fn of ['fireAbility', 'damageEnemy']) {
    const start = game.indexOf(`${fn}(`)
    assert.ok(start > 0, `${fn} not found`)
    const body = game.slice(start, start + 2200)
    assert.ok(!/tier === 'boss'/.test(body), `${fn} treats the boss as a special case`)
  }
})

test('a 3/4 gnome faces its target rather than rotating toward it', () => {
  // The placeholder was a top-down tile and was rotated to point at whatever
  // it was hitting. Rotating art drawn from the side lays the gnome down.
  const f = src('entities/Fighter.ts')
  assert.ok(!/setRotation/.test(f), 'the gnome still rotates toward its target')
  assert.match(f, /facesLeft\(/, 'the gnome does not use the shared facing rule')
  assert.match(f, /setFlipX\(left\)/, 'the gnome never mirrors')
  // Drawn facing right, like the enemies: the flag it keeps is "facing left".
  assert.match(f, /facingLeft = false/, 'the gnome does not start facing right')
  // On its feet, with a shadow, sorted like everything else on the board.
  assert.match(f, /applyGroundRender\(/, 'the gnome is not placed on its feet')
  assert.match(f, /makeShadow\(/, 'the gnome casts no shadow')
  assert.match(f, /ySort\(this\)/, 'the gnome is not depth-sorted')
})

test('a downed hero comes back, and says where and when', () => {
  // The tester asked whether the hero revives. He did not, and there was
  // nothing on screen to say so either way.
  const hero = src('entities/Hero.ts')
  assert.match(hero, /this\.reviveIn = this\.def\.reviveSeconds/,
    'going down does not start a revive timer')
  assert.match(hero, /private revive\(\)/, 'nothing brings him back')
  // WHERE HE FELL, not at the entrance. The entrance rule discarded a walk
  // the player had already paid for — and it came with a second, unannounced
  // cost: `rallyX/rallyY` were reset with it, so his death silently cancelled
  // a standing order the player had not withdrawn.
  assert.match(hero, /this\.setPosition\(this\.fellX, this\.fellY\)/,
    'he still teleports to the entrance on a revive')
  const revive = hero.slice(hero.indexOf('private revive()'))
  assert.doesNotMatch(revive, /this\.rallyX = /, 'the revive still discards the standing order')
  assert.doesNotMatch(hero, /this\.homeX/, 'the home point is back')
  assert.match(hero, /this\.health = this\.def\.maxHealth/, 'he returns hurt')
  // Last Stand is once per encounter, revive or no revive.
  const body = hero.slice(hero.indexOf('private revive(): void {'), hero.indexOf('get returnPoint'))
  assert.ok(body.length > 0, 'revive() not found')
  assert.ok(!/lastStandUsed/.test(body),
    'the revive re-arms Last Stand, which makes it a cooldown rather than a climax')

  const game = src('scenes/GameScene.ts')
  assert.match(game, /reviveLabel/, 'nothing marks the spot he returns to')
  assert.match(game, /BACK IN \$\{secs\}s/, 'the ground marker carries no countdown')
  const hud = src('scenes/HudScene.ts')
  // In REAL seconds, both places. reviveIn is in game seconds and gameSpeed is
  // 1.4, so a 25 in the data is 17.9 on the player's watch — and a countdown
  // that disagrees with a stopwatch reads as broken.
  assert.match(hud,
    /BACK IN \$\{Math\.max\(0, Math\.ceil\(realSeconds\(s\.heroReviveIn, 1\)\)\)\}s/,
    'the hero bar does not count him down in real seconds')
  assert.match(game, /realSeconds\(this\.hero\.reviveIn, 1\)/,
    'the ground marker counts down in game seconds')
})

test('the revive timer is data, not a number typed into a scene', () => {
  const heroes = JSON.parse(readFileSync(url('../src/data/heroes.json'), 'utf8'))
  for (const [id, h] of Object.entries(heroes) as [string, any][]) {
    assert.equal(typeof h.reviveSeconds, 'number', `${id} has no revive timer`)
    // Long enough that losing him still costs most of a wave.
    assert.ok(h.reviveSeconds >= 15, `${id} is back in ${h.reviveSeconds}s, which costs nothing`)
  }
})

test('Meteor lands where it is aimed, and says so first', () => {
  const runner = src('systems/AbilityRunner.ts')
  // The spread used to be the ability's whole radius.
  assert.ok(!/const r = Math\.random\(\) \* def\.radius/.test(runner),
    'a meteor can still stray the full radius from the tap')
  assert.match(runner, /def\.impactSpread/, 'the spread is not its own number')
  assert.match(runner, /i === 0 \? 0 :/, 'no impact is guaranteed to land on the tap')
  assert.match(runner, /function telegraph/, 'impacts arrive with no warning')

  const abilities = JSON.parse(readFileSync(url('../src/data/abilities.json'), 'utf8'))
  const m = abilities.meteor
  assert.ok(m.impactSpread < m.radius, 'the spread is not tighter than the ring')
  // The ring the player is shown has to be what the barrage can actually
  // reach, or the preview is a lie in one direction or the other.
  assert.equal(m.radius, m.impactSpread + m.impactRadius,
    `the ring says ${m.radius} but the barrage reaches ${m.impactSpread + m.impactRadius}`)
  assert.ok(m.telegraphSeconds >= 0.25, 'the warning is too short to read')
})

test('a new rally point overrides combat', () => {
  // The tester: "once Cory is engaged, setting a new rally point does
  // nothing." He only moved when nothing was in range, which on a lane full
  // of enemies meant never — the player tapped, got no answer, and the rally
  // point looked broken.
  const hero = src('entities/Hero.ts')
  assert.ok(!/Standing and fighting beats walking/.test(hero),
    'the old "only move when nothing is in range" rule is still there')
  assert.ok(!/if \(!target\) \{/.test(hero),
    'movement is still gated on having no target')
  // Walking is decided by distance to the rally point and nothing else.
  assert.match(hero, /if \(dist > 0\.5\) \{/, 'movement is not driven by the rally point alone')
  // The tap has to produce an answer on the frame it lands.
  const setRally = hero.slice(hero.indexOf('setRally(x: number, y: number)'),
    hero.indexOf('get engaged()'))
  assert.match(setRally, /this\.faceTowards\(x, y\)/,
    'he does not turn until his first step, so a tap looks ignored')
})

test('breaking off a fight costs something, from JSON', () => {
  const heroes = JSON.parse(readFileSync(url('../src/data/heroes.json'), 'utf8'))
  for (const [id, h] of Object.entries(heroes) as [string, any][]) {
    const r = h.retreat
    assert.ok(r, `${id} can retreat for free`)
    assert.ok(r.vulnerableSeconds > 0, `${id}'s retreat opens no window`)
    assert.ok(r.damageTakenMultiplier > 1, `${id} takes no extra damage while pulling out`)
    assert.ok(r.readySeconds > 0, `${id} can swing the instant he arrives`)
    // A cost, not a punishment: it must not be most of a wave.
    assert.ok(r.vulnerableSeconds <= 5, `${id} is exposed for ${r.vulnerableSeconds}s, which is a trap`)
  }
  const hero = src('entities/Hero.ts')
  assert.match(hero, /this\.def\.retreat\.damageTakenMultiplier/,
    'the vulnerability window is declared but never applied')
  assert.match(hero, /this\.attackTimer = Math\.max\(this\.attackTimer, this\.arrivalDelay\)/,
    'the arrival delay is never applied')
})

test('the ring never covers the tower it is asking about, and never leaves the screen', () => {
  // PROTOTYPE-GAP item 11, and the clearest UX regression against the
  // prototype: the panel asking "should I upgrade this?" was a centred modal
  // over a dimmed screen, hiding the range circle that answers it.
  //
  // The geometry that guarantees it is proved exhaustively in
  // ringlayout.test.ts — every pad, every tower, both zoom ends, both
  // viewports. What is checked here is that the component is wired to that
  // geometry rather than doing its own arithmetic at the call site, which is
  // how the old build menu ended up with a clamping story that only worked
  // above the pad and put its buy buttons 194px below the screen at spot 3.
  const ring = src('ui/TowerRing.ts')
  assert.doesNotMatch(ring, /opts\.dim/, 'the ring dims the board behind it')
  // Both placed together by the tested geometry, not by arithmetic at the call
  // site: they constrain each other, and a ring in the middle of a narrow
  // strip has to move aside before the panel has anywhere to go.
  // `slotCount`, not `buttons.length`: the tower panel reserves three slots so
  // its geometry is identical at every tier, and SELL cannot arrive in a place
  // UPGRADE used to hold.
  assert.match(ring, /fitRingAndPanel\(\s*\n\s*anchor\.x, anchor\.y, this\.slotCount/,
    'the ring and panel are placed separately, or by hand')

  const game = src('scenes/GameScene.ts')
  assert.match(game, /new TowerRing\(/, 'the tower still opens something else')
  // The two rings, and the lane the tower covers.
  assert.match(game, /private drawSelectedRange/, 'nothing draws the projected range')
  assert.match(game, /private dashedCircle/, 'the projected ring is not styled differently')
  assert.match(game, /private drawCoveredLane/, 'the covered stretch of path is not shown')
  // It follows the tower as the board pans under it, and closes when the
  // tower stops existing rather than hanging over an empty pad.
  assert.match(game, /this\.ring\?\.reposition\(\)/,
    'the ring does not follow its tower when the camera moves')
  assert.match(game, /if \(!this\.towers\.includes\(tower\)\) return null/,
    'a sold tower would keep its ring open')
  assert.match(ring, /if \(!anchor\) \{ this\.close\(\); return \}/,
    'the ring survives its anchor disappearing')
})

test('the area the ring is allowed into excludes the HUD and the notch', () => {
  // Two different things get subtracted and both have bitten this game. The
  // safe-area insets, because a notch has coordinates but is not screen; and
  // the HUD's panel area, because a ring over the ability bar is a ring whose
  // buttons fight the abilities for the same tap.
  const game = src('scenes/GameScene.ts')
  const layoutSrcForRing = src('systems/RingLayout.ts')
  const area = game.slice(game.indexOf('area: () => usableArea('), game.indexOf('onPreview,'))
  assert.match(area, /safeAreaInsets\(\)/, 'the ring may open under a notch')
  assert.match(area, /abilitiesTop: this\.layout\.abilities\.y/,
    'the ring may open over the ability bar')
  // The counters are NOT protected, deliberately: doing so costs 48px, which
  // on a 568x320 screen is the difference between the panel fitting and the
  // game reporting that it does not.
  assert.match(layoutSrcForRing, /const y = insets\.top \+ margin/,
    'the ring area subtracts a band the requirement does not protect')
  assert.match(layoutSrcForRing, /Math\.min\(viewH - insets\.bottom, bands\.abilitiesTop\) - margin/,
    'the usable area takes only one of the two bottom constraints')
})

test('a ring button buys nothing; the panel does', () => {
  // The whole reason the ring exists in this shape: a menu whose first tap
  // spends peanuts is a menu you cannot browse. Tapping an option opens its
  // description; a second, explicit press on that panel commits.
  const ring = src('ui/TowerRing.ts')
  const buildRing = ring.slice(ring.indexOf('private buildRing()'), ring.indexOf('private makeGlyph'))
  assert.doesNotMatch(buildRing, /onConfirm/,
    'a ring button can commit the purchase directly')
  assert.match(buildRing, /hit\.on\('pointerdown', \(\) => this\.select\(i\)\)/,
    'a ring button does something other than open its description')
  // The confirm is on the card, and it is a release rather than a press: a
  // finger that lands on it and slides off has to be able to take it back.
  assert.match(ring, /buy\.on\('pointerup', \(\) => \{/, 'the confirm fires on the press')
  assert.match(ring, /back\.on\('pointerup', \(\) => this\.deselect\(\)\)/,
    'cancel fires on the press')
  assert.match(ring, /option\.onConfirm\(\); this\.close\(\)/,
    'confirming does not close the menu')
  // THE CONFIRM CARRIES THE VERB AND THE PRICE, as one control. It used to be
  // a tick glyph shared by every option, so SELL's confirm and UPGRADE's were
  // pixel-identical on the one press that spends or destroys — and the price
  // sat in a row of its own further up the card.
  assert.match(ring, /buttonLabel\(option\.confirmLabel, option\.price, option\.id === 'sell'\)/,
    'the confirm button does not carry the verb and the price together')
  assert.match(ring, /icon\(s, 'cancel'\)/, 'cancel lost its glyph')

  // Cancel goes back to the ring rather than closing everything: the point of
  // a description is being able to read another one.
  const deselect = ring.slice(ring.indexOf('private deselect()'))
  assert.doesNotMatch(deselect.slice(0, deselect.indexOf('\n  }')), /this\.close\(\)/,
    'cancelling closes the whole menu instead of returning to the ring')
})

test('reopening the menu does not pile up live objects', () => {
  // BuildMenu.open() only ever pushed to its hit-area list. The array grew by
  // one entry per cell every time a pad was tapped, held every destroyed
  // rectangle alive for the life of the run, and left hitAreas[0] pointing at
  // a cell from the first menu ever opened.
  //
  // The ring cannot repeat that: it has no list that outlives an open. Its
  // buttons are built in the constructor, live in a container, and go when the
  // container is destroyed — so a new menu is a new object rather than an
  // append to an old one.
  const ring = src('ui/TowerRing.ts')
  assert.match(ring, /private readonly buttons: ButtonParts\[\] = \[\]/,
    'the button list is not per-instance')
  assert.doesNotMatch(ring, /buttons\.length = 0/,
    'the button list is being reset in place, which means it outlives an open')
  assert.match(ring, /onComplete: \(\) => ring\.destroy\(true\)/,
    'the ring container is not destroyed, so its children leak')
  assert.match(ring, /this\.panelLayer\.destroy\(true\)/, 'the panel layer leaks')
  // And the scene replaces rather than stacks.
  const game = src('scenes/GameScene.ts')
  const open = game.slice(game.indexOf('private openRing('))
  const body = open.slice(0, open.indexOf('\n  }\n'))
  assert.ok(body.indexOf('this.ring?.close()') < body.indexOf('this.ring = new TowerRing'),
    'a second open would leave the first ring alive')
})

/**
 * PAUSE MUST BE REVERSIBLE.
 *
 * The reported failure: tapping pause froze the game and the pause button then
 * did nothing. The cause was not the disabled-button audit — it was that a
 * Dialog's dim backdrop closes it on a tap unless told otherwise, and `close()`
 * is not `onCancel`. Tapping beside the PAUSED panel took the dialog away
 * without resuming, leaving `paused` true over a paused GameScene, and the old
 * `if (this.paused) return` then refused to reopen the only control that could
 * undo it.
 *
 * CI has no renderer, so what is checked here is the two invariants that make
 * the state unreachable. The behavioural proof — pause during a wave, tap the
 * backdrop, resume, and assert enemies advance again — is the harness's
 * `pauseresume` and `pausedismiss` scenarios.
 */
test('a paused game can always be un-paused', () => {
  const hud = src('scenes/HudScene.ts')
  const open = hud.slice(hud.indexOf('openSettings(): void {'), hud.indexOf('private closeSettings('))
  assert.ok(open.length > 0, 'nothing opens the settings dialog')

  // 1. The panel that pauses the world cannot be waved away. Every other
  //    dialog may be, because the game runs on underneath it; this one IS the
  //    way the game runs on. CONTINUE is the way out.
  const panel = src('ui/SettingsPanel.ts')
  assert.match(panel, /this\.blocker\.on\('pointerdown', \(\) => \{ \/\* swallowed \*\/ \}\)/,
    'tapping beside the settings panel does something, and it sits over a paused world')

  // 2. And the flag can never lock the player out on its own. A `paused` flag
  //    with no panel behind it is a broken state, not a reason to do nothing.
  assert.ok(!/if \(this\.paused\) return/.test(open),
    'openSettings early-returns on the flag alone, so a stranded flag is permanent')
  assert.match(open, /if \(this\.paused && this\.settings\) return/,
    'the re-entry guard no longer requires a panel to actually be up')

  // The quit confirmation is reached FROM the settings panel, so the world is
  // paused behind it and the same trap applies.
  const quit = hud.slice(hud.indexOf('private confirmQuit()'), hud.indexOf('private quitToTitle()'))
  assert.match(quit, /dismissable: false/,
    'the quit confirmation is dismissable, and it sits over a paused world')

  // Whatever closes the panel must resume or leave: CONTINUE, RESTART, HOME —
  // and KEEP PLAYING backs out of HOME to the panel it came from rather than
  // straight into the run.
  assert.match(open, /onContinue: \(\) => \{ this\.closeSettings\(\); this\.resumeGame\(\) \}/,
    'CONTINUE no longer resumes the game')
  assert.match(open, /onRestart: \(\) => \{ this\.closeSettings\(\); this\.restartRun\(\) \}/,
    'RESTART no longer restarts the run')
  assert.match(open, /onHome: \(\) => this\.confirmQuit\(\)/, 'HOME no longer asks first')
  assert.match(quit, /onCancel: \(\) => this\.openSettings\(\)/,
    'backing out of the quit prompt strands the paused world')
})

/**
 * THE TOWER PANEL'S ACTIONS ARE ICONS.
 *
 * Icons only on the buttons, at 40 screen pixels and never smaller, with the
 * price beneath the plate rather than on it. The harness `icons` scenario
 * measures the rendered result; these lock the rules that produce it.
 */
test('every ring button is an icon at 40px with the price beneath, never a word', () => {
  const ring = src('ui/TowerRing.ts')
  const cfg = (read('presentation') as any).ring

  // The floor, and the reason for it. Below 40 a 256px source is minified past
  // 6x and the painted outlines break up.
  assert.ok(cfg.iconSize >= 40, `ring icons are ${cfg.iconSize}px; 40 is the floor`)
  // The plate has to be bigger than the icon it carries, or the icon is the
  // button and there is nothing to aim at around it.
  assert.ok(cfg.buttonSize > cfg.iconSize,
    `a ${cfg.buttonSize}px plate cannot carry a ${cfg.iconSize}px icon`)

  // No text on a button, on either half of the menu. A word on a 58px plate is
  // a truncated word, which is how the old build menu came to be a text grid.
  const buildRing = ring.slice(ring.indexOf('private buildRing()'), ring.indexOf('private makeGlyph'))
  const texts = [...buildRing.matchAll(/scene\.add\.text\(/g)]
  assert.equal(texts.length, 1,
    `a ring button draws ${texts.length} pieces of text; the price badge is the only one allowed`)
  assert.match(buildRing, /String\(option\.price\)/, 'the one text is not the price')

  // Beneath, not on: the badge sits below the plate's bottom edge.
  assert.match(ring, /at\.y \+ CFG\.buttonSize \/ 2 \+ CFG\.priceGap/,
    'the price is not positioned below the plate')
  // And the geometry reserves room for it, or the badge would be the part that
  // hangs off the screen.
  const layout = src('systems/RingLayout.ts')
  assert.match(layout, /const footH = cfg\.buttonSize \+ cfg\.priceGap \+ cfg\.priceHeight/,
    'the button footprint ignores its price badge')

  // The plate is added BEFORE the icon, or it covers it. This shipped wrong
  // once: the measurements said a 40px icon was correctly placed and the
  // screen showed two empty coloured bars.
  const add = ring.indexOf(
    'this.ringLayer.add([...plate.parts, glyph, ...(lock ? [lock] : []), price, hit])')
  assert.ok(add > 0, 'the ring no longer adds its parts in one place')

  // AN UNAFFORDABLE OPTION KEEPS ITS OWN PICTURE, dimmed, with a padlock badge
  // over the corner. It used to be replaced by a padlock outright, and that
  // reasoning held for exactly one locked option — a padlock says "not yet"
  // where a greyed-out picture just looks broken. It fails at two: a player
  // short of peanuts is short for several options at once, and two identical
  // padlocks say nothing about what they are saving up for.
  assert.match(ring, /const key = option\.sprite && this\.scene\.textures\.exists\(option\.sprite\)/,
    'the glyph no longer starts from the option\'s own picture')
  assert.match(ring, /if \(!option\.affordable\) \{[\s\S]{0,220}?g\.setAlpha\(CFG\.lockedAlpha\)/,
    'a locked option is not dimmed')
  assert.match(ring, /private makeLock\(\): Phaser\.GameObjects\.Image \{[\s\S]{0,200}?icon\(this\.scene, 'locked'\)/,
    'there is no padlock badge')
  assert.ok(cfg.lockBadgeSize > 0 && cfg.lockBadgeSize < cfg.iconSize,
    `a ${cfg.lockBadgeSize}px badge on a ${cfg.iconSize}px icon is not a badge`)
  // The picture must not be REPLACED by the padlock anywhere.
  const glyphFn = ring.slice(ring.indexOf('private makeGlyph('), ring.indexOf('private makeLock('))
  assert.doesNotMatch(glyphFn, /icon\(this\.scene, 'locked'\)/,
    'the padlock is back in place of the option\'s own picture')

  // The build half uses icons too. It was a text grid using none of the ten.
  const game = src('scenes/GameScene.ts')
  const build = game.slice(game.indexOf('openPadRing(spot: BuildSpot)'),
    game.indexOf("/** The pad or tower's position, on the glass, right now. */"))
  assert.match(build, /sprite: def\.sprite/,
    'the build options do not carry a picture of the tower')
  // No worded label on the RING BUTTON. The card behind it carries words —
  // the name, the trait phrase, and the verb and price on the button — but the
  // ring itself is pictures and prices.
  assert.doesNotMatch(build, /label:/, 'the build options still carry worded labels')
})

test('a disabled option does not swallow taps, and still explains itself', () => {
  // Two halves of one rule, and they pull in opposite directions. The hit area
  // must be exactly the plate — a button that takes presses outside its own
  // picture steals them from the map behind it, and two of those side by side
  // leave a dead strip that looks like a bug. But the tap that DOES land on a
  // locked option has to do something, or the player never learns what they
  // are saving for: it opens the description, with the shortfall on it, and
  // only the confirm button is switched off.
  const ring = src('ui/TowerRing.ts')
  const hit = ring.slice(ring.indexOf('const hit = this.scene.add'), ring.indexOf("hit.on('pointerover'"))
  assert.match(hit, /\.rectangle\(0, 0, CFG\.buttonSize, CFG\.buttonSize/,
    'the hit area is not the plate: it takes taps outside the button')
  assert.doesNotMatch(hit, /CFG\.buttonSize \+|footH|priceHeight/,
    'the hit area is padded beyond the visible plate')
  // Not gated on affordability: a locked option opens like any other.
  assert.doesNotMatch(ring, /if \(!option\.affordable\) return/,
    'a locked option refuses its own tap, so it teaches the player nothing')
  assert.match(ring, /if \(option\.affordable\) \{ option\.onConfirm\(\)/,
    'a locked option can still be confirmed')
  assert.match(ring, /option\.reason/, 'nothing says why an option is locked')
})

test('every icon resolves through one place, so none can miss its fallback', () => {
  const artSrc = src('systems/Art.ts')
  const ring = src('ui/TowerRing.ts')
  const icons = read('art').ui.icons as Record<string, string>
  // All ten are declared, and every name the ring asks for is one of them.
  // NINE, not ten. `confirm` is retired: the ledger's primary button is a
  // green slab carrying the verb and the price, and a tick on it would be the
  // thing the redesign removed — a mark that says "commit" without saying to
  // what. Its manifest entry went with it rather than being left declared and
  // undrawn, which is how an unused asset survives a swap.
  assert.ok(Object.keys(icons).length >= 9, `only ${Object.keys(icons).length} icons declared`)
  assert.equal(icons.confirm, undefined, 'the retired confirm icon is back in the manifest')
  for (const name of ['upgrade', 'sell', 'target', 'locked', 'damage', 'range', 'firerate',
    'armor', 'cancel']) {
    assert.ok(icons[name], `${name} is used but not in the manifest`)
  }
  // ALL TEN ARE PLACED NOW. confirm and cancel were cut for a confirm step
  // that did not exist; the ring's second press is that step.
  const used = new Set<string>()
  for (const f of ['ui/TowerRing.ts', 'scenes/GameScene.ts', 'systems/Upgrades.ts']) {
    for (const m of src(f).matchAll(/'(upgrade|sell|target|locked|damage|range|firerate|armor|cancel)'/g)) {
      used.add(m[1] as string)
    }
  }
  const unplaced = Object.keys(icons).filter((k) => !used.has(k))
  assert.deepEqual(unplaced, [], 'these icons are in the manifest but drawn nowhere')

  // The resolver checks existence; a caller cannot get a key any other way.
  assert.match(artSrc, /if \(key && scene\.textures\.exists\(key\)\) return key/,
    'the resolver does not check the texture actually loaded')
  assert.doesNotMatch(ring, /ART\.icons\[/, 'the ring indexes the icon map directly')
})

/* ------------------------------------------------------------------ SELL */

test('SELL has a fixed slot that UPGRADE can never take', () => {
  /*
   * "SELL goes last" was the first answer and it was not enough. The ring's
   * geometry is a function of HOW MANY buttons are on it — an arc of two sits
   * at a different radius from an arc of three — so the position a thumb
   * learned as UPGRADE over twelve waves is a position SELL can arrive at when
   * the tower reaches the specialisation branch and the count changes.
   *
   * Three slots are reserved instead and each option names its index. Measured
   * over all 48 states (six towers, every tier, both branches) at 844x390:
   * UPGRADE at 287,155 and SELL at 392,155, in every one of them, 55.6px apart
   * at the closest.
   */
  const game = src('scenes/GameScene.ts')
  const opts = game.slice(game.indexOf('const options: RingOption[] = []'),
    game.indexOf('this.openRing(options, () => this.towerAnchor(tower)'))
  assert.match(opts, /id: 'sell',\s*\n\s*slot: 2,/, 'SELL does not claim slot 2')
  for (const m of opts.matchAll(/id: 'upgrade',\s*\n\s*slot: (\d)/g)) {
    assert.equal(m[1], '0', 'an UPGRADE option is not in slot 0')
  }
  assert.match(game, /\}, 3\)/, 'the tower panel does not reserve three slots')
  // And the ring lays out for the reserved count, not the option count.
  const ring = src('ui/TowerRing.ts')
  assert.match(ring, /private get slotCount\(\): number/, 'the ring has no reserved slot count')
  assert.match(ring, /p\.buttons\[this\.slotOf\(i\)\]/,
    'options are placed by index again, so the slots do nothing')
})

test('only SELL asks twice, and it asks in words', () => {
  // A tick glyph is not a confirmation when the button beside it is also a
  // tick. Upgrading is reversible in the only sense that matters — the tower
  // is still there — and a confirm on the action taken forty times a run is
  // friction on the wrong button.
  const game = src('scenes/GameScene.ts')
  const fn = game.slice(game.indexOf('private confirmSell('))
  const body = fn.slice(0, fn.indexOf('\n  }'))
  assert.match(body, /title: `Sell \$\{tower\.def\.name\} for \$\{refund\} peanuts\?`/,
    'the confirmation does not name the tower and the refund in words')
  assert.match(body, /confirm: \{ label: 'Sell'/, 'the confirm button is not worded')
  assert.match(body, /cancelLabel: 'Cancel'/, 'the way out is not worded')
  // The sell option routes through it; the upgrade option does not.
  assert.match(game, /onConfirm: \(\) => this\.confirmSell\(tower, refund\)/,
    'SELL still goes straight through')
  assert.match(game, /onConfirm: \(\) => this\.upgradeTower\(tower\)/,
    'UPGRADE no longer upgrades directly')
  assert.doesNotMatch(game, /confirmUpgrade/, 'UPGRADE grew a confirmation too')
})

test('the sell button wears the currency the game actually uses', () => {
  /*
   * It wore a cash symbol. The currency is peanuts.
   *
   * And the counter's own key is NOT the answer: `hud-peanuts` is the whole
   * 233x96 counter PLATE with a peanut painted into its left end, so pointing
   * the button at it drew that plate squashed into a 40px square. The peanut
   * is cut out of the plate at boot. Measured: a 54x72 cut-out, 41.3% opaque —
   * a shape in a box rather than a filled rectangle.
   */
  const art = JSON.parse(readFileSync(new URL('../src/data/art.json', import.meta.url), 'utf8'))
  assert.equal(art.ui.icons.sell, 'gen-icon-peanut')
  assert.equal(art.files['icon-sell'], undefined, 'the cash symbol is still shipped')
  assert.equal(art.ui.counters.peanuts, 'hud-peanuts',
    'the counter changed, so the cut-out is now taken from the wrong plate')
  const boot = src('scenes/BootScene.ts')
  assert.match(boot, /ensurePeanutIcon\(\s*\n?\s*this, ART\.ui\.counters\.peanuts, ART\.generated\.peanutIcon\)/,
    'nothing generates the cut-out, so the sell button has no icon at all')
  assert.equal(art.generated.peanutIcon, 'gen-icon-peanut',
    'the generated key is not declared in the manifest')
  const peanut = src('systems/PeanutIcon.ts')
  assert.match(peanut, /outKey: string,/, 'the key is hardcoded in the component again')
  // The background is FLOODED from the border, not colour-keyed: the peanut's
  // own outline is as dark as the plate behind it, and a colour key eats it.
  assert.match(peanut, /stack\.push/, 'the knockout is not a flood fill')
})

