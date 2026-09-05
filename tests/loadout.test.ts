import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { abilityLine, towerLine, towerStats } from '../src/systems/AbilityText.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))

test('the title screen is only the things that belong on a title screen', () => {
  const title = src('scenes/TitleScene.ts')
  // The hero picker, the description and the kit list all moved to the loadout
  // screen, where they are shown once with everything else the run was dealt.
  assert.doesNotMatch(title, /heroCard/, 'the hero card is still on the title screen')
  assert.doesNotMatch(title, /CHOOSE YOUR HERO/, 'the hero picker heading is still there')
  assert.doesNotMatch(title, /\.blurb/, 'the hero description is still there')
  assert.doesNotMatch(title, /portraitSprite/, 'the portrait is still there')
  assert.doesNotMatch(title, /passive\.name/, 'the kit line is still there')

  // And it still has everything it is meant to keep.
  for (const [needle, what] of [
    ['COURJAHAN', 'the title'],
    ['A serious tower defense', 'the tagline'],
    ['START RUN', 'the start button'],
    ['CREDITS', 'the credits button'],
    ['VERSION_LABEL', 'the version stamp'],
    ['AudioToggle', 'the volume control'],
  ] as const) {
    assert.ok(title.includes(needle), `the title screen lost ${what}`)
  }
})

test('the loadout screen shows the whole hand in three sections', () => {
  const s = src('scenes/LoadoutScene.ts')
  for (const section of ['HERO', 'TOWERS', 'SPECIALS']) {
    assert.ok(s.includes(`'${section}'`), `the loadout screen has no ${section} section`)
  }
  // One way IN. The two-step draft made the player click through the same
  // information twice and never showed them the whole hand at once, so there
  // is exactly one button that leaves this screen. The reroll button is not
  // one: it redeals and stays put.
  //
  // Counting `scene.start(` was the proxy for that and stopped being one when
  // BEGIN gained a comic to play first: it is still ONE BUTTON and one way
  // forward, choosing between two doors that both open into the run. So what
  // is counted now is the exits themselves -- every start must be inside the
  // single BEGIN handler, and every destination must lead into the run.
  const destinations = [...s.matchAll(/scene\.start\('(\w+)'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(destinations)].sort(), ['Cutscene', 'Game'],
    `the loadout screen leaves to ${destinations.join(', ')}; both doors should open into the run`)
  const begin = s.slice(s.indexOf('beginLabel, () => {'), s.indexOf('// Spent, it stays'))
  for (const d of destinations) {
    assert.ok(begin.includes(`scene.start('${d}'`),
      `something other than BEGIN leaves the loadout screen, to ${d}`)
  }
  assert.match(s, /platePanel\(/, 'the cards are not on the dialog plate')
})

test('the loadout is built so cards can be dealt face down later', () => {
  // The plan is for these to become cards the player taps to reveal. Every
  // card keeps its face in its own container behind one `reveal()`, so that
  // change is "start hidden, show on tap" rather than a rewrite.
  const s = src('scenes/LoadoutScene.ts')
  assert.match(s, /interface Card/, 'cards are not modelled as anything')
  assert.match(s, /face: Phaser\.GameObjects\.Container/, 'a card face is not separable from its plate')
  assert.match(s, /reveal\(\): void/, 'there is no reveal step to hook an animation onto')
  assert.match(s, /for \(const c of this\.cards\) c\.reveal\(\)/,
    'nothing calls reveal, so adding the animation would mean finding every card first')
  // Every section has to build through the same helper, or one of them will be
  // the odd one out when the reveal lands. Counting `c.face.add(` calls was a
  // proxy for that and stopped being one when the two rows started sharing a
  // `cardRow` helper — which is more uniform, not less. What is checked now is
  // the property itself: each section reaches a card, and no section builds a
  // plate of its own.
  for (const section of ['heroSection', 'towerSection', 'abilitySection']) {
    const from = s.indexOf(`private ${section}(`)
    assert.ok(from > 0, `${section} is gone`)
    const body = s.slice(from, s.indexOf('\n  private ', from + 10))
    assert.match(body, /this\.(card|cardRow)\(/,
      `${section} does not build its content on a card`)
    assert.ok(!body.includes('platePanel('),
      `${section} draws its own plate instead of going through card()`)
  }
  assert.match(s, /c\.face\.add\(/, 'nothing puts content on a card face at all')
})

test('the old two-step draft screen is gone, not just bypassed', () => {
  assert.throws(() => src('scenes/DraftScene.ts'), 'DraftScene is still in the tree')
  const config = src('config.ts')
  assert.match(config, /LoadoutScene/, 'the loadout scene is not registered')
  assert.doesNotMatch(config, /DraftScene/, 'the old scene is still registered')
  assert.match(src('scenes/TitleScene.ts'), /scene\.start\('Loadout'\)/,
    'START RUN does not lead to the loadout screen')
})

test('an active describes itself in numbers it actually has', () => {
  const abilities = read('abilities')
  for (const [id, def] of Object.entries(abilities) as [string, any][]) {
    if (!def.draftable && id !== 'serverNuke') continue
    const line = abilityLine(def)
    assert.match(line, /cooldown/, `${id} does not say what its cooldown is`)
    // It has to name an effect, not only a cooldown.
    assert.ok(line.split('·').length >= 2, `${id} reads as "${line}", which says nothing about what it does`)
    assert.ok(line.length <= 60, `${id} reads as "${line}" (${line.length} chars), too long for a card`)
  }
})

test('both card rows are built by the same component', () => {
  // They were two components with two layouts, and the specials one drew its
  // description straight over its icon and out past the card's border.
  const s = src('scenes/LoadoutScene.ts')
  const towers = s.slice(s.indexOf('private towerSection'), s.indexOf('private abilitySection'))
  const specials = s.slice(s.indexOf('private abilitySection'), s.indexOf('private cardRow'))
  for (const [name, body] of [['towerSection', towers], ['abilitySection', specials]] as const) {
    assert.match(body, /this\.cardFace\(/, `${name} does not use the shared card face`)
    // No section lays out its own text: that is how the two drifted apart.
    assert.ok(!/this\.add\.text\(/.test(body), `${name} still positions its own text`)
  }
  // And the shared face keeps the icon and the words in separate columns.
  const face = s.slice(s.indexOf('private cardFace'), s.indexOf('private towerSection'))
  assert.match(face, /const tx = -cw \/ 2 \+ pad \+ col/, 'the text column is not offset past the icon')
  assert.match(face, /this\.frameInsetFor\(cw, ch\)/,
    'the card pads against its box rather than its frame')
  assert.match(face, /wordWrap: \{ width: tw \}/, 'body text is not wrapped to the text column')
})

test('no player-facing card text quotes an engine unit', () => {
  // "Hits everything within 64px" and "128 radius" were both on the screen.
  const towers = read('towers')
  const abilities = read('abilities')
  const lines: string[] = []
  for (const def of Object.values(towers) as any[]) lines.push(towerStats(def), towerLine(def))
  for (const def of Object.values(abilities) as any[]) lines.push(abilityLine(def))
  for (const line of lines) {
    assert.ok(!/\b\d+\s*px\b/i.test(line), `"${line}" quotes pixels`)
    assert.ok(!/\bradius\b/i.test(line), `"${line}" says "radius"`)
    assert.ok(!/\b(tick|ms|msec)\b/i.test(line), `"${line}" quotes an engine unit`)
    // A bare number followed by "range" is the same problem wearing a label.
    assert.ok(!/\d\s* ?range\b/i.test(line), `"${line}" quotes a range in engine units`)
  }
})

test('the reroll is one whole-hand redeal, and its count is data', () => {
  const draft = read('draft') as any
  assert.equal(typeof draft.rerollsPerRun, 'number', 'the reroll count is not in draft.json')

  const s = src('scenes/LoadoutScene.ts')
  assert.match(s, /this\.rerollsLeft = DRAFT\.rerollsPerRun/, 'the reroll count is hardcoded')
  assert.match(s, /if \(this\.rerollsLeft <= 0\) return/, 'a spent reroll can be spent again')
  assert.match(s, /this\.rerollsLeft -= 1/, 'the reroll is never spent')
  // Spent, the button stays on screen greyed rather than disappearing.
  assert.match(s, /if \(left <= 0\) reroll\.setEnabled\(false\)/,
    'the spent reroll button is not greyed out')
  // One deal function, so a redeal cannot draw by different rules than the
  // opening hand did, and it redeals everything rather than one slot.
  const deal = s.slice(s.indexOf('private deal('), s.indexOf('private reroll('))
  for (const part of ['heroId', 'abilities', 'openingTowers', 'reserveTowers']) {
    assert.ok(deal.includes(part), `a redeal does not redraw ${part}`)
  }
  assert.match(s, /this\.deal\(runState\(\)\.seed/, 'a redeal is not derived from the run seed')
})

test('the loadout says the hand was dealt, not chosen', () => {
  const s = src('scenes/LoadoutScene.ts')
  assert.match(s, /LO\.copy\.drawnAtRandom/, 'the randomness subtext is not shown')
  const copy = (read('presentation') as any).loadout.copy
  assert.match(copy.drawnAtRandom, /random/i, 'the subtext does not mention the draw')
})

/**
 * Every card, every entry — not whatever the seed dealt.
 *
 * This screen's overflow has been reported and "fixed" three times. Each fix
 * was verified against one random draw, so each fix verified a different
 * subset and none of them covered Filing Extension, which has the longest
 * body in the set.
 *
 * CI has no renderer, so this cannot measure pixels. What it CAN do is check
 * the two things that were actually wrong, both of which are arithmetic:
 * the padding was measured against the card's BOX while the painted frame
 * reaches much further in (27.9px at the sides and 31.4px at the top, against
 * a pad of 9), and the hero card had a second layout that nobody updated.
 * Pixel verification is the harness's `everyloadout` scenario, which renders
 * all fourteen entries at both viewports.
 */
test('the screen is laid out from the viewport, not from the content', () => {
  // The outage. The layout ran top to bottom and put the buttons wherever the
  // content finished; on a 568x320 phone the content finished at y=931 in a
  // 720-unit box, so BEGIN THE RUN was 227px below the screen and no run could
  // be started at all. The buttons are placed from H now, before a single card
  // is measured, and the cards are fitted into what is left.
  const s = src('scenes/LoadoutScene.ts')
  const render = s.slice(s.indexOf('private render(): void {'), s.indexOf('private headingHeight'))

  assert.match(render, /const by = H - LO\.buttonMargin - LO\.buttonHeight \/ 2/,
    'the button row is not anchored to the bottom of the viewport')
  // Placed before the cards exist, so nothing measured later can move them.
  assert.ok(render.indexOf('this.buildButtons(by)') < render.indexOf('this.heroSection('),
    'the buttons are placed after the cards, so a tall card can still push them off')
  assert.match(render, /const budget = \(by - LO\.buttonHeight \/ 2 - LO\.buttonGap\) - top/,
    'the card area is not the space left over after the buttons')
  // And every row is GIVEN its height rather than growing to fit.
  for (const section of ['heroSection', 'towerSection', 'abilitySection']) {
    assert.match(s, new RegExp(`private ${section}\\([^)]*height: number`),
      `${section} decides its own height, which is how the row grew off the screen`)
  }
  const row = s.slice(s.indexOf('private cardRow('))
  assert.match(row.slice(0, 900), /return y \+ height/,
    'the card row still reports a height it measured rather than the one it was given')

  const face = s.slice(s.indexOf('private cardFace'), s.indexOf('private towerSection'))
  assert.match(face, /this\.frameInsetFor\(cw, ch\)/,
    'the card pads against its box rather than its frame')
  // One size for the whole card, chosen so name, stats and body all fit.
  assert.match(face, /for \(const size of LO\.bodySizes\)/,
    'the card cannot shrink its type, so long copy has nowhere to go but out')
  assert.match(face, /if \(total <= room\) break/, 'the type ladder does not check it fits')
})

test('the loadout fits the design box with room for the buttons', () => {
  // Arithmetic, since CI has no renderer: the fixed furniture must leave a
  // sane budget for three rows of cards inside 720 units.
  const P = read('presentation') as any
  const LO = P.loadout
  const H = (read('display') as any).height
  const buttonTop = H - LO.buttonMargin - LO.buttonHeight
  assert.ok(buttonTop < H, 'the button row starts below the bottom of the screen')
  assert.ok(LO.buttonMargin >= 8, 'the buttons sit flush against the bottom edge')
  // The plate's chrome hangs below its box, so the gap has to clear it.
  assert.ok(LO.buttonGap >= 20, `a ${LO.buttonGap}px gap lets the buttons touch the last card`)

  const shares = LO.rowShares
  const total = shares.hero + shares.towers + shares.specials
  assert.ok(Math.abs(total - 1) < 1e-9, `the row shares sum to ${total}, not 1`)
  for (const [name, v] of Object.entries(shares) as [string, number][]) {
    assert.ok(v > 0.15 && v < 0.5, `the ${name} row takes ${v} of the card area`)
  }
  // A type ladder that bottoms out too low is unreadable on a phone; one that
  // bottoms out too high cannot fit the longest copy.
  assert.deepEqual([...LO.bodySizes].sort((a: number, b: number) => b - a), LO.bodySizes,
    'the type ladder is not ordered largest first')
  assert.equal(LO.bodySizes[0], 22, 'the ladder does not start at the design size')
  assert.ok(LO.bodySizes[LO.bodySizes.length - 1] >= 18,
    'the ladder bottoms out below 18px, which is not readable on a phone')
})

test('every hero, tower and special is covered, and none is too long to fit', () => {
  // Enumerated, not sampled. The budget is the measured worst case: at
  // 568x320 the narrowest card gives a 162px text column, and the deepest
  // body that fits it is the Scratch Ticket's at five lines. A new string
  // longer than that has not been shown to fit and must be measured before it
  // ships.
  const towers = read('towers')
  const abilities = read('abilities')
  const heroes = read('heroes')
  // Characters. The Scratch Ticket line is the longest that has been MEASURED
  // to fit — 3 lines at 18px in the narrowest card at 568x320. Two strings
  // failed this budget and were shortened rather than left to clip: the Tax
  // Shelter's "Buffs every tower standing inside it. Cannot attack." (51) and
  // "hits everything in a wide area" (31 as part of a longer line).
  const WORST = 57

  let combinations = 0
  const tooLong: string[] = []
  for (const [hid, h] of Object.entries(heroes) as [string, any][]) {
    for (const [tid, t] of Object.entries(towers) as [string, any][]) {
      for (const [aid, a] of Object.entries(abilities) as [string, any][]) {
        combinations++
        const cards: Array<[string, string]> = [
          [`hero ${hid}`, h.blurb],
          [`tower ${tid}`, towerStats(t)],
          [`tower ${tid}`, towerLine(t)],
          [`special ${aid}`, abilityLine(a)],
        ]
        for (const [what, text] of cards) {
          if (text.length > WORST) tooLong.push(`${what}: ${text.length} chars — "${text}"`)
        }
      }
    }
  }
  assert.equal(combinations, Object.keys(heroes).length * Object.keys(towers).length
    * Object.keys(abilities).length, 'not every combination was enumerated')
  assert.deepEqual([...new Set(tooLong)], [],
    'a card body is longer than the longest one measured to fit')
})
