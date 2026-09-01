import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { abilityLine } from '../src/systems/AbilityText.ts'

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
  // One way in. The two-step draft made the player click through the same
  // information twice and never showed them the whole hand at once.
  const buttons = s.match(/plateButton\(/g) ?? []
  assert.equal(buttons.length, 1, `${buttons.length} buttons on a screen that needs one`)
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
