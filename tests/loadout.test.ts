import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { abilityLine, towerLine, towerStats } from '../src/systems/AbilityText.ts'
import { fitHeroRow, heroDescription, heroRow, overlaps } from '../src/systems/HeroRow.ts'

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
  // The hero row's cards go INSIDE that card rather than beside it: a hero
  // card that built its own `card()` would be a sixth card in a three-card
  // screen, and the reveal would not know about it. They wear a plate of their
  // own — drawn straight into the face container — because a bare portrait in
  // a row reads as a filmstrip rather than as five things to choose between.
  const tile = s.slice(s.indexOf('private heroCard('), s.indexOf('private pickHero('))
  assert.ok(tile.length > 0, 'the hero picker is gone')
  assert.ok(!/this\.(card|cardRow|platePanel)\(/.test(tile),
    'a hero card builds a scene card of its own instead of sitting on the hero card')
  assert.match(s, /c\.face\.add\(this\.heroCard\(/, 'the hero cards are not on the card face')
  assert.match(s, /c\.face\.add\(this\.heroBlurb\(/, 'the description is not on the card face')
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
  // And ONE piece of arithmetic decides where the columns are, used by both
  // the face that draws a card and the measurer that says how tall the row
  // has to be. Two copies is how a row gets sized against one layout and
  // filled with another, which is a card's last line under the next heading.
  const geom = s.slice(s.indexOf('private cardGeometry('), s.indexOf('private cardNeeds('))
  assert.match(geom, /tx: -cw \/ 2 \+ pad \+ col/, 'the text column is not offset past the icon')
  assert.match(geom, /this\.frameInsetFor\(cw, ch\)/,
    'the card pads against its box rather than its frame')
  const face = s.slice(s.indexOf('private cardFace'), s.indexOf('private towerSection'))
  assert.match(face, /this\.cardGeometry\(cw, ch\)/, 'the face lays its own columns out again')
  assert.match(s.slice(s.indexOf('private cardNeeds(')), /this\.cardGeometry\(/,
    'the measurer lays the columns out again rather than asking')
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
  for (const part of ['abilities', 'openingTowers', 'reserveTowers']) {
    assert.ok(deal.includes(part), `a redeal does not redraw ${part}`)
  }
  // AND NOT THE HERO. It was in this list while the hero was dealt with
  // everything else; the hero is a choice now, and a reroll that quietly
  // replaced it would be taking the one decision this screen exists for.
  assert.ok(!deal.includes('heroId'), 'a reroll still redeals the hero')
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
test('the screen is a stack that flows, and the buttons are placed first', () => {
  /*
   * TWO OUTAGES, ONE TEST.
   *
   * The first: the layout ran top to bottom and put the buttons wherever the
   * content finished. On a 568x320 phone that was y=931 in a 720-unit box, so
   * BEGIN THE RUN was 227px below the screen and no run could be started.
   *
   * The second: the fix for that handed each section a SHARE of what was left
   * -- 62% to the hero block at most, then 53/47 to the towers and specials --
   * and a section whose content needed more than its share drew past its own
   * edge and over the heading below it, because nothing downstream was
   * listening. Four collisions on one screen.
   *
   * So: the buttons are placed first, from H, and the sections are stacked
   * from what they MEASURE rather than from a share of a budget.
   */
  const s = src('scenes/LoadoutScene.ts')
  const render = s.slice(s.indexOf('private render(): void {'), s.indexOf('private headingHeight'))

  assert.match(render, /const by = H - LO\.buttonMargin - buttonH \/ 2/,
    'the button row is not anchored to the bottom of the viewport')
  assert.match(render, /const buttonH = tapFloor\(this, LO\.buttonHeight\)/,
    'the button row reserves its requested height rather than the height it gets')
  assert.ok(render.indexOf('this.buildButtons(by, buttonH)') < render.indexOf('stackSections('),
    'the buttons are placed after the sections, so a tall card can still push them off')

  // NO SHARES. Every one of these is the old machinery, and any of them coming
  // back brings the collisions with it.
  for (const gone of ['rowShares', 'heroSectionMaxShare', 'budget *', 'const rest =']) {
    assert.ok(!render.includes(gone), `the share-of-a-budget layout is back: ${gone}`)
  }

  // The stack is fed what each section MEASURED, with a floor it may be
  // squeezed to and no further.
  assert.match(render, /const laid = stackSections\(\[/, 'the sections are not stacked')
  assert.match(render, /natural: heroWant, min: Math\.min\(heroWant, heroFloor\)/,
    'the hero block has no measured floor')
  assert.match(render, /natural: towerWant, min: Math\.min\(towerWant, towerFloor\)/,
    'the tower row has no measured floor')
  assert.match(render, /natural: specialWant, min: Math\.min\(specialWant, specialFloor\)/,
    'the specials row has no measured floor')
  // The floors come from the SMALLEST size on the type ladder, so a floor is
  // what the content genuinely needs rather than a number somebody picked.
  assert.match(render, /const small = LO\.bodySizes\[LO\.bodySizes\.length - 1\]!/,
    'the floors are not taken from the bottom of the type ladder')
  assert.match(render, /this\.heroPlan\(run\.heroId, 0\)/,
    "the hero block's floor is a chosen number rather than what it solves to")

  // THE HEADINGS ARE SECTIONS. That is what stops a label being overlapped
  // from either side: it owns a band of the stack rather than sitting in a gap
  // between two things that were sized independently.
  const headings = [...render.matchAll(/\{ natural: headingH/g)]
  assert.equal(headings.length, 3, 'the three section labels are not part of the stack')

  // Every section is placed at a top the stack computed, never at a literal.
  for (const call of ['this.heading(\'HERO\', heroLabel!)',
                      'this.heroSection(run.heroId, heroAt!, heroH!)',
                      'this.heading(\'TOWERS\', towerLabel!)',
                      'this.towerSection(run.openingTowers, towerAt!, towerH!)',
                      'this.heading(\'SPECIALS\', specialLabel!)',
                      'this.abilitySection(run.abilities, specialAt!, specialH!)']) {
    assert.ok(render.includes(call), `the stack does not place: ${call}`)
  }

  // The rows are still told their height rather than deciding it.
  for (const section of ['towerSection', 'abilitySection']) {
    assert.match(s, new RegExp(`private ${section}\\([^)]*height: number`),
      `${section} decides its own height, which is how the row grew off the screen`)
  }
  const row = s.slice(s.indexOf('private cardRow('))
  assert.match(row.slice(0, 900), /return y \+ height/,
    'the card row still reports a height it measured rather than the one it was given')

  const face = s.slice(s.indexOf('private cardFace'), s.indexOf('private towerSection'))
  // One size for the whole card, chosen so name, stats and body all fit.
  assert.match(face, /for \(const size of LO\.bodySizes\)/,
    'the card cannot shrink its type, so long copy has nowhere to go but out')
  assert.match(face, /if \(total <= room\) break/, 'the type ladder does not check it fits')
})

test('an overflowing stack scrolls, and takes only the content with it', () => {
  // A stack that does not fit after every section is at its floor must scroll
  // rather than let sections draw through each other -- and the FIRST attempt
  // at that masked the whole layer, which took the title, the subtitle and
  // both buttons off the screen with it. Worse than the bug it fixed.
  const s = src('scenes/LoadoutScene.ts')
  const scroll = s.slice(s.indexOf('private installScroll('),
    s.indexOf('/** How far the stack can be dragged'))
  assert.match(scroll, /if \(this\.scrollMax <= 0\) return/,
    'the scroll installs itself even when everything fits')
  assert.match(scroll, /this\.stack\.setMask\(/, 'the mask is not on the content container')
  assert.ok(!/this\.layer\.setMask\(/.test(scroll),
    'the mask is on the whole layer, which hides the title and the buttons')
  assert.ok(!/this\.layer\.y =/.test(scroll),
    'scrolling moves the fixed chrome as well as the content')

  // The split is real: sections draw into `stack`, chrome into `layer`.
  const render = s.slice(s.indexOf('private render(): void {'), s.indexOf('private headingHeight'))
  assert.match(render, /this\.target = this\.stack/, 'the sections do not draw into the scrolling container')
  assert.match(render, /this\.target = this\.layer/, 'the chrome is left drawing into the scrolling container')
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

  // TWO shares, not three. The hero block is sized to its content under its
  // own ceiling, so it has no share to hold; these split what it leaves.
  const shares = LO.rowShares
  assert.equal((shares as Record<string, number>).hero, undefined,
    'the hero row is back on a fixed share of the budget')
  const total = shares.towers + shares.specials
  assert.ok(Math.abs(total - 1) < 1e-9, `the dealt-row shares sum to ${total}, not 1`)
  for (const [name, v] of Object.entries(shares) as [string, number][]) {
    assert.ok(v > 0.3 && v < 0.7, `the ${name} row takes ${v} of what is left`)
  }
  // A type ladder that bottoms out too low is unreadable on a phone; one that
  // bottoms out too high cannot fit the longest copy.
  assert.deepEqual([...LO.bodySizes].sort((a: number, b: number) => b - a), LO.bodySizes,
    'the type ladder is not ordered largest first')
  assert.equal(LO.bodySizes[0], 22, 'the ladder does not start at the design size')
  assert.ok(LO.bodySizes[LO.bodySizes.length - 1] >= 18,
    'the ladder bottoms out below 18px, which is not readable on a phone')
})

test('every hero card holds a recognisable character, at every column width', () => {
  /*
   * Arithmetic, since CI has no renderer — but arithmetic against the SAME
   * module the scene lays the row out with, rather than a second opinion about
   * it. The tile sizing this replaces was exactly that second opinion: it
   * asserted a 58px portrait fits a 98px tile, which was true, while the scene
   * was drawing a 24px one because the strip it drew into had negative height.
   */
  const roster = Object.keys(read('heroes')).filter((id) => !id.startsWith('_'))
  assert.equal(roster.length, 5, 'the roster changed size; these numbers were measured for five')
  const cfg = (read('presentation') as any).loadout.heroRow

  // The column runs from the narrowest the panel is ever clamped to, to the
  // widest, less the card padding either side.
  for (let width = 460; width <= 700; width += 20) {
    for (const nameHeight of [20, 24, 30]) {
      const row = heroRow({ width, count: roster.length, nameHeight }, cfg)
      assert.equal(row.cards.length, 5)
      assert.ok(row.portrait >= cfg.minPortrait,
        `at ${width}px the portrait is ${row.portrait}px, under the ${cfg.minPortrait}px floor`)
      assert.ok(row.portrait <= cfg.maxPortrait)
      // Every card is inside the column, and the row is inside its own height.
      for (const c of row.cards) {
        assert.ok(c.x >= -0.001 && c.x + c.width <= width + 0.001,
          `at ${width}px a card runs from ${c.x} to ${c.x + c.width}`)
        assert.ok(c.y >= 0 && c.y + c.height <= row.height + 0.001,
          'a card runs past the height the row reported')
      }
    }
  }
})

test('nothing in the hero row overlaps anything else in it', () => {
  // THE FOUR REPORTED FAULTS, as one property. Portraits over the heading,
  // names over portraits, a highlight that framed neither: all of them were a
  // strip whose height had gone negative. Rectangles that are built by ADDING
  // heights cannot do that, and this is the proof at every width the panel
  // reaches and every text height the font can hand back.
  const cfg = (read('presentation') as any).loadout.heroRow
  for (let width = 460; width <= 700; width += 10) {
    for (const nameHeight of [18, 22, 26, 34]) {
      const row = heroRow({ width, count: 5, nameHeight }, cfg)
      const all: Array<[string, any]> = []
      row.cards.forEach((r, i) => all.push([`card ${i}`, r]))
      for (let i = 0; i < row.cards.length; i++) {
        // Inside its own card, with clear air between the two.
        const c = row.cards[i]!, p = row.portraits[i]!, n = row.names[i]!
        assert.ok(!overlaps(p, n), `${width}/${nameHeight}: portrait ${i} runs into its name`)
        assert.ok(n.y - (p.y + p.height) >= cfg.nameGap - 0.001,
          `${width}/${nameHeight}: name ${i} has no clear separation from its portrait`)
        for (const [what, r] of [['portrait', p], ['name', n]] as const) {
          assert.ok(r.x >= c.x - 0.001 && r.x + r.width <= c.x + c.width + 0.001
            && r.y >= c.y - 0.001 && r.y + r.height <= c.y + c.height + 0.001,
            `${width}/${nameHeight}: the ${what} on card ${i} is outside its own card`)
        }
      }
      // And no two cards touch.
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          assert.ok(!overlaps(all[i]![1], all[j]![1]),
            `${width}/${nameHeight}: ${all[i]![0]} overlaps ${all[j]![0]}`)
        }
      }
    }
  }
})

test('the row wraps rather than shrinking past the point of recognition', () => {
  // The fallback the brief asked for, and the reason `minPortrait` is a hard
  // floor: five cards that will not fit across become two rows, not five
  // smudges. It never fires at the widths this game actually uses, which is
  // the point — it is what makes the floor safe to enforce.
  const cfg = (read('presentation') as any).loadout.heroRow
  const wide = heroRow({ width: 700, count: 5, nameHeight: 24 }, cfg)
  assert.equal(wide.rows, 1, 'the full-width column is wrapping when it need not')
  const narrow = heroRow({ width: 260, count: 5, nameHeight: 24 }, cfg)
  assert.equal(narrow.rows, 2, 'a column too narrow for five shrank them instead of wrapping')
  assert.ok(narrow.portrait >= cfg.minPortrait, 'the wrapped row is still below the floor')
  assert.ok(narrow.height > wide.height, 'two rows are not taller than one')
})

test('the description block uses its space instead of leaving it empty', () => {
  // It was three lines at the top of a tall empty box. Both ability chips sit
  // beside the blurb now, and the block is as tall as the taller side rather
  // than as tall as whatever was left over.
  const d = (read('presentation') as any).loadout.heroDescription
  const tall = heroDescription({ width: 600, blurbHeight: 90, chipHeight: 34, chips: 2 }, d)
  assert.equal(tall.height, 90, 'a tall blurb does not set the block height')
  assert.equal(tall.chips.length, 2, 'both hero buttons are not shown')
  assert.ok(!overlaps(tall.blurb, tall.chips[0]!), 'the blurb runs under the chips')
  assert.ok(!overlaps(tall.chips[0]!, tall.chips[1]!), 'the two chips overlap')

  const short = heroDescription({ width: 600, blurbHeight: 20, chipHeight: 34, chips: 2 }, d)
  assert.equal(short.height, 34 * 2 + d.gap, 'a short blurb does not let the chips set the height')
  assert.ok(short.blurb.width > 0 && short.chips[0]!.width > 0)
  assert.equal(short.blurb.x + short.blurb.width + d.gap, short.chips[0]!.x,
    'the blurb column and the chip column do not tile the width')
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
  // `_note` and `_stats` document the roster; they are not heroes.
  const heroIds = Object.entries(heroes).filter(([id]) => !id.startsWith('_')) as [string, any][]
  for (const [hid, h] of heroIds) {
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
  assert.equal(combinations, heroIds.length * Object.keys(towers).length
    * Object.keys(abilities).length, 'not every combination was enumerated')
  assert.deepEqual([...new Set(tooLong)], [],
    'a card body is longer than the longest one measured to fit')
})

/* ------------------------------------------------------------ hero naming */

test('every hero and every hero button is called one thing, everywhere', () => {
  /*
   * The roster shipped calling Elijah "ELIJAH" on the picker and "Eli"
   * everywhere else, and three of the five second buttons carried a name from
   * an older design: Cory's read "Loophole", which is a TOWER branch, and
   * Bailey's read "Fetch", which is Eli's old active. A stale name on a button
   * that does nothing yet is indistinguishable from a broken button.
   */
  const heroes = read('heroes') as Record<string, any>
  const expected: Record<string, [string, string, string]> = {
    cory: ['Cory', 'Haymaker', 'Spike Strip'],
    courtland: ['Courtland', 'Shockwave', 'Seismic'],
    han: ['Han', 'Ember', 'Fireball'],
    eli: ['Eli', 'Quick Cut', 'Star Rain'],
    bailey: ['Bailey', 'Bark', 'Zoomies'],
  }
  const ids = Object.keys(heroes).filter((k) => !k.startsWith('_'))
  assert.deepEqual(ids.sort(), Object.keys(expected).sort(), 'the roster changed')
  for (const [id, [name, one, two]] of Object.entries(expected)) {
    assert.equal(heroes[id].name, name, `${id} is not called ${name}`)
    assert.equal(heroes[id].slot1.name, one, `${id}'s first button is not ${one}`)
    assert.equal(heroes[id].slot2.name, two, `${id}'s second button is not ${two}`)
  }

  // And no retired name survives anywhere the player or the log can see it.
  // Elijah is excluded: he is a real person credited by name in ATTRIBUTIONS
  // and in audio.json's notes, which is a different thing from the hero's name.
  const retired = ['Loophole', 'Overclock', 'Firestorm', 'Bedrock', 'Fetch']
  const heroesRaw = readFileSync(url('../src/data/heroes.json'), 'utf8')
  for (const dead of retired) {
    assert.ok(!heroesRaw.includes(`"${dead}"`), `${dead} is still a name in heroes.json`)
  }
  // Comments stripped: the scenes explain these bugs by name, and a note about
  // a retired string is the opposite of a retired string still in use.
  for (const scene of ['LoadoutScene', 'GameScene', 'HudScene', 'TitleScene']) {
    const body = src(`scenes/${scene}.ts`)
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    for (const dead of [...retired, 'Elijah']) {
      assert.ok(!body.includes(dead), `${scene} still hardcodes ${dead}`)
    }
  }

  // The names the UI shows come from the data, never from a literal, so there
  // is one place to change and nowhere for a second copy to go stale.
  const loadout = src('scenes/LoadoutScene.ts')
  assert.match(loadout, /hero\.name\.toUpperCase\(\)/, 'the picker label is not read from the data')
  assert.match(loadout, /slot\.name/, 'the ability chips do not read their names from the data')
})

test('a reserved hero power reads as coming rather than as broken', () => {
  // Slot 2 is gated on the powered form and not implemented. It showed only a
  // name, so a stale one was indistinguishable from a live ability.
  const loadout = src('scenes/LoadoutScene.ts')
  assert.match(loadout, /const ready = slot\.effect !== null/,
    'the chip does not know whether its ability exists yet')
  assert.match(loadout, /\$\{slot\.name\} \(soon\)/,
    'an unimplemented hero power does not say so')
  assert.match(loadout, /if \(!ready\) icon\.setAlpha/,
    'a reserved power draws at full strength, like a live one')
})

test('every hero card draws that hero, and Bailey is the dog', () => {
  // A picker whose cards share art is a picker with one option. Each card
  // renders `portraitSprite` off its own hero, and every one of those is a
  // distinct key pointing at a distinct file.
  const heroes = read('heroes') as Record<string, any>
  const art = read('art') as any
  const ids = Object.keys(heroes).filter((k) => !k.startsWith('_'))
  const keys = ids.map((id) => heroes[id].portraitSprite)
  assert.equal(new Set(keys).size, ids.length, 'two heroes share a portrait key')
  const files = keys.map((k) => {
    const path = art.files[k]
    assert.ok(path, `${k} is not in art.json`)
    return path
  })
  assert.equal(new Set(files).size, files.length, 'two portrait keys point at one file')
  assert.match(heroes.bailey.portraitSprite, /bailey/, "Bailey's card is not Bailey's art")
  assert.match(String(files[ids.indexOf('bailey')]), /bailey/,
    "Bailey's portrait key does not resolve to Bailey's file")

  const loadout = src('scenes/LoadoutScene.ts')
  assert.match(loadout, /hero\.portraitSprite/, 'the card does not draw the hero it is for')
})

test('the three rows all fit the design box, with the hero block capped', () => {
  /*
   * The whole screen's vertical arithmetic, reproduced against the real
   * config. CI has no renderer, so the measured heights — the title, the
   * subtitle, a heading, a name, an ability chip — are SWEPT across the range
   * a UI sans can plausibly hand back rather than pinned to one number. What
   * is asserted is the property: the hero block never exceeds its ceiling, and
   * the two dealt rows are never squeezed to nothing.
   */
  const P = read('presentation') as any
  const LO = P.loadout
  const H = (read('display') as any).height

  for (const lead of [0.9, 1.2, 1.5]) {         // px of height per px of size
    const th = (size: number) => Math.round(size * lead) + 6
    const top = 8 + th(44) + th(22) + 10
    const by = H - LO.buttonMargin - LO.buttonHeight / 2
    const headingH = th(22) + LO.headingGap
    const budget = (by - LO.buttonHeight / 2 - LO.buttonGap) - top - headingH * 3
      - LO.sectionGap * 2
    assert.ok(budget > 120, `a lead of ${lead} leaves only ${budget} for three rows`)

    const cap = Math.floor(budget * LO.heroSectionMaxShare)
    const pad = 14                              // the painted frame's inset
    const D = LO.heroDescription
    const chipH = Math.max(D.iconSize, th(D.chipNameSize))
    const chipsH = chipH * 2 + D.gap
    // The description's floor: two chips, or the blurb at the bottom of the
    // ladder, whichever is taller. Reserved BEFORE the row is fitted, so the
    // row is the part that gives ground.
    const innerW = LO.maxContentWidth - pad * 2
    const descFloor = Math.max(chipsH, th(18) * 2)
    const row = fitHeroRow(
      { width: innerW, count: 5, nameHeight: th(18) },
      LO.heroRow,
      cap - pad * 2 - LO.sectionGap - descFloor,
    )
    const desc = heroDescription(
      { width: innerW, blurbHeight: descFloor, chipHeight: chipH, chips: 2 }, D,
    )
    const used = pad * 2 + row.height + LO.sectionGap + desc.height

    assert.ok(used <= cap + 0.001,
      `at a lead of ${lead} the hero block wants ${used} against a ${cap} ceiling`)
    // THE POINT OF ALL OF IT: the character is big enough to recognise. The
    // version this replaces drew 24px portraits here.
    assert.ok(row.portrait >= LO.heroRow.minPortrait,
      `the portrait came out at ${row.portrait}px`)
    assert.ok(row.rows === 1, 'the full-width column should not need to wrap')

    // And the two dealt rows still have room to be cards.
    const rest = budget - used
    const towers = Math.floor(rest * (LO.rowShares.towers / (LO.rowShares.towers + LO.rowShares.specials)))
    assert.ok(towers >= 70, `the tower row is left ${towers}px`)
    assert.ok(rest - towers >= 60, `the specials row is left ${rest - towers}px`)
  }
})
