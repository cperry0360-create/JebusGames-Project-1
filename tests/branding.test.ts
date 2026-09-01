import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const art = read('art'), branding = read('branding'), credits = read('credits'), display = read('display')
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

test('all three brand logos are in the manifest and on disk', () => {
  const roles = ['studioCard', 'jebusGames', 'cpPlays'] as const
  for (const role of roles) {
    const key = art.brand[role]
    assert.ok(key, `brand role ${role} is missing`)
    const path = art.files[key]
    assert.ok(path, `brand.${role} points at unknown key "${key}"`)
    assert.ok(path.startsWith('branding/'), `${key} should live under branding/`)
    assert.ok(existsSync(url(`../public/${art.assetRoot}${path}`)), `${key} -> ${path} is missing`)
  }
})

test('each logo carries its measured content extents', () => {
  // Every one of the three is padded, so sizing by the canvas would draw them
  // smaller than asked for and hang them off centre.
  for (const role of ['studioCard', 'jebusGames', 'cpPlays'] as const) {
    const cfg = art.render[art.brand[role]]
    assert.ok(cfg, `no render config for brand.${role}`)
    assert.ok(cfg.contentWidth > 0 && cfg.contentHeight > 0, `brand.${role} has no content extents`)
    assert.ok(Math.abs(cfg.anchorX - 0.5) < 0.05, `brand.${role} anchorX ${cfg.anchorX} is far off centre`)
    assert.ok(Math.abs(cfg.anchorY - 0.5) < 0.05, `brand.${role} anchorY ${cfg.anchorY} is far off centre`)
  }
})

test('the splash runs for about two seconds and can be skipped', () => {
  const s = branding.splash
  const total = s.fadeInMs + s.holdMs + s.fadeOutMs
  assert.ok(total >= 1500 && total <= 2600, `splash runs ${total}ms, which is not "about two seconds"`)
  assert.ok(s.fadeInMs > 0 && s.fadeOutMs > 0, 'the splash should fade in and out, not cut')
  assert.ok(s.skipGuardMs > 0 && s.skipGuardMs < s.fadeInMs,
    'the skip guard should be short enough to feel instant but stop a stray click')
})

test('the studio card fits the canvas with margin', () => {
  const key = art.brand.studioCard
  const cfg = art.render[key]
  const h = branding.splash.cardHeight
  const w = (cfg.contentWidth / cfg.contentHeight) * h
  assert.ok(w <= display.width - 80, `studio card is ${w.toFixed(0)}px wide on a ${display.width}px canvas`)
  assert.ok(h <= display.height - 80, `studio card is ${h}px tall on a ${display.height}px canvas`)
})

test('the title screen does not repeat the studio mark', () => {
  // The splash card is the JebusGames logo, full screen, immediately before
  // this scene. A second copy in the corner reads as a watermark.
  const title = src('scenes/TitleScene.ts')
  assert.doesNotMatch(title, /brand\.jebusGames/,
    'the title screen still draws the studio logo the splash just showed')
  assert.doesNotMatch(JSON.stringify(branding), /titleMark/,
    'the title mark config outlived the mark it positioned')
})

/** Every plate role, and the manifest key each points at. */
const PLATE_ROLES: [string, string][] = [
  ['buttons.primary', art.ui.buttons?.primary],
  ['buttons.secondary', art.ui.buttons?.secondary],
  ['buttons.disabled', art.ui.buttons?.disabled],
  ['iconButton', art.ui.iconButton],
  ['iconButtonActive', art.ui.iconButtonActive],
  ['panel', art.ui.panel],
]

test('all six UI plates are in the manifest and on disk', () => {
  for (const [role, key] of PLATE_ROLES) {
    assert.ok(key, `no plate for ui.${role}`)
    const path = art.files[key]
    assert.ok(path, `ui.${role} points at unknown key "${key}"`)
    assert.ok(path.startsWith('ui/'), `${key} should live under ui/`)
    assert.ok(existsSync(url(`../public/${art.assetRoot}${path}`)), `${key} -> ${path} is missing`)
  }
  assert.equal(new Set(PLATE_ROLES.map(([, k]) => k)).size, 6,
    'the six roles should map to six distinct plates')
})

test('every plate is sliced sanely', () => {
  // A plate is drawn by slicing at its corners. If opposite insets were
  // measured wider than the plate they would overlap and the frame would fold
  // in on itself, which is the one way this looks broken rather than wrong.
  for (const [role, key] of PLATE_ROLES) {
    const cfg = art.render[key]
    assert.ok(cfg?.slice, `${key} (ui.${role}) has no measured slice`)
    const s = cfg.slice
    assert.ok(s.left > 0 && s.right > 0 && s.top > 0 && s.bottom > 0,
      `${key} has a zero inset, so it has no chrome to preserve`)
    assert.ok(s.left + s.right < cfg.contentWidth,
      `${key} side insets span ${s.left + s.right}px of a ${cfg.contentWidth}px plate`)
    assert.ok(s.top + s.bottom < cfg.contentHeight,
      `${key} top and bottom insets span ${s.top + s.bottom}px of a ${cfg.contentHeight}px plate`)
  }
})

test('no button or panel is drawn by hand any more', () => {
  // The plates replaced every drawn plate in the game. A Graphics-painted
  // panel creeping back in is how the look drifts apart again.
  const theme = readFileSync(url('../src/ui/Theme.ts'), 'utf8')
  assert.doesNotMatch(theme, /export function (button|panel|paintPanel)\b/,
    'Theme still exports a hand-drawn button or panel')
})

/* ------------------------------------------------------ the credits roll */

const blocks = credits.blocks as Array<Record<string, unknown>>
const creditsOf = () => blocks.filter((b) => b.kind === 'credit')
const rollText = JSON.stringify(blocks)

test('the credits are a roll, not a page', () => {
  // The length is the joke. A static list cannot carry it, and a roll that
  // races past cannot either.
  assert.ok(credits.scrollSeconds >= 45 && credits.scrollSeconds <= 90,
    `a ${credits.scrollSeconds}s roll is not the slow scroll this is meant to be`)
  const scene = src('scenes/CreditsScene.ts')
  // The roll is now a chain of legs with a hold on each card, so the duration
  // is apportioned across them rather than being one tween's `duration`. What
  // still has to be true is that the total comes from the data.
  assert.match(scene, /const total = creditsData\.scrollSeconds \* 1000/,
    'the scroll duration is hardcoded away from the data')
  assert.match(scene, /this\.tweens\.add\(\{[\s\S]{0,220}duration: Math\.max\(1, total \*/,
    'nothing scrolls, or a leg does not take its share of the total')
  assert.match(scene, /ease: 'Linear'/, 'credits that ease look like they are buffering')
  // Nobody is held here.
  assert.match(scene, /pointerdown[\s\S]{0,60}leave\(\)/, 'the roll cannot be skipped by tapping')
})

test('the roll is long enough for its own joke, and nearly all of it is Cory', () => {
  const all = creditsOf()
  assert.ok(all.length >= 60, `${all.length} credits is not a roll, it is a list`)
  const cory = all.filter((c) => c.name === 'CORY')
  assert.ok(cory.length / all.length > 0.7,
    `only ${cory.length} of ${all.length} credits are Cory; the joke needs him to be nearly all of them`)
  // The specific pair the brief calls out, plus the one that closes the roll.
  for (const role of ['Semicolon Placement', 'Semicolon Removal', 'Person Still Reading the Credits']) {
    assert.ok(all.some((c) => c.role === role), `the roll is missing "${role}"`)
  }
})

test('Claude is the one name in the roll that is not Cory, and looks it', () => {
  const claude = creditsOf().find((c) => c.name === 'CLAUDE')
  assert.ok(claude, 'Claude is not credited')
  assert.equal(claude.role, 'Lead Programmer')
  assert.equal(claude.accent, 'claude', 'Claude has no accent, so it renders like every other name')
  const scene = src('scenes/CreditsScene.ts')
  assert.match(scene, /CLAUDE_COLOUR/, 'nothing gives the accent its own colour')
  // And that colour must not be one the rest of the roll already uses.
  const m = /const CLAUDE_COLOUR = '(#[0-9a-f]{6})'/i.exec(scene)
  assert.ok(m, 'the accent colour is not a plain value')
  const theme = src('ui/Theme.ts')
  assert.doesNotMatch(theme, new RegExp(m[1] as string, 'i'),
    'the accent reuses a theme colour, so it does not read as different')
})

test('the real credits are in among the joke ones', () => {
  const want: Array<[string, string]> = [
    ['Lead Programmer', 'CLAUDE'],
    ['Art', 'CHATGPT'],
    ['Early Concept Art', 'GEMINI'],
    ['Lead Game Tester, CP Plays', 'COURTLAND'],
    ['Field Research, Hersheypark Division', 'ELI AND HAN'],
  ]
  for (const [role, name] of want) {
    const c = creditsOf().find((x) => x.role === role)
    assert.ok(c, `${role} is not credited`)
    assert.equal(c.name, name, `${role} is credited to the wrong name`)
  }
  assert.match(rollText, /Hersheypark/, 'the Hersheypark note is gone')
  assert.match(rollText, /No findings were submitted/, 'the punchline of the field research is gone')
  assert.match(rollText, /rides were reportedly excellent/, 'the rides line is gone')
  assert.match(rollText, /Kenney/, 'Kenney is not credited')
  assert.match(rollText, /CC0/, 'the CC0 licence is not named')
})

test('the roll is broken into departments, not one flat list', () => {
  const divisions = blocks.filter((b) => b.kind === 'division')
  assert.ok(divisions.length >= 8,
    `${divisions.length} department headers is a list with a title on it, not a roll`)
  assert.equal(blocks.findIndex((b) => b.kind === 'credit') >
    blocks.findIndex((b) => b.kind === 'division'), true,
    'the roll starts crediting people before it says which department they are in')
  // Every credit sits under a header, and no header is left with nothing
  // under it.
  let seen: string | null = null
  const under = new Map<string, number>()
  for (const b of blocks) {
    if (b.kind === 'division') { seen = b.text as string; under.set(seen, 0) }
    // A `tracks` block is a whole section's worth of content read from
    // music.json — the MUSIC department has no hand-written credit lines
    // because its entries arrive with the tracks.
    if ((b.kind === 'credit' || b.kind === 'tracks' || b.kind === 'card') && seen !== null) {
      under.set(seen, (under.get(seen) ?? 0) + (b.kind === 'credit' ? 1 : 3))
    }
  }
  for (const [name, n] of under) {
    assert.ok(n >= 3, `department "${name}" has ${n} credits under it`)
  }
  // A department header must not be mistakable for the section headings that
  // announce SPECIAL THANKS and DEDICATION.
  const scene = src('scenes/CreditsScene.ts')
  assert.match(scene, /case 'division':/, 'the scene does not render department headers')
  assert.match(scene, /private division\(/, 'department headers reuse the section heading style')
})

test('Cory arrives long before Claude does', () => {
  // The joke is the sheer volume of Cory credits, and the real credits are
  // the relief. Relief that arrives first is just a cast list.
  const all = creditsOf()
  const real = new Set(['CLAUDE', 'CHATGPT', 'GEMINI'])
  const firstReal = all.findIndex((c) => real.has(c.name as string))
  assert.ok(firstReal > 0, 'the first credit in the roll is not one of Cory\'s')
  const fraction = firstReal / all.length
  assert.ok(fraction >= 0.28,
    `the real credits arrive ${(fraction * 100).toFixed(0)}% in; the joke has not had time to build`)
  assert.ok(fraction <= 0.45,
    `the real credits arrive ${(fraction * 100).toFixed(0)}% in; that is past the point of relief`)
  // And the run before them is unbroken Cory.
  const opening = all.slice(0, firstReal)
  assert.ok(opening.every((c) => c.name === 'CORY'),
    'somebody else is credited in the opening run, which breaks the count')
  assert.ok(opening.length >= 25, `${opening.length} credits is not a run, it is a warm-up`)
})

test('the roll has room to be read', () => {
  const scene = src('scenes/CreditsScene.ts')
  const line = /const LINE_H = (\d+)/.exec(scene)
  assert.ok(line, 'the roll has no line height')
  assert.ok(Number(line[1]) >= 44, `${line[1]}px between credits is cramped`)
  for (const name of ['DIV_ABOVE', 'DIV_BELOW']) {
    const m = new RegExp(`const ${name} = (\\d+)`).exec(scene)
    assert.ok(m && Number(m[1]) >= 30, `${name} leaves a department header no breathing room`)
  }
  // Dot leaders, measured rather than guessed, are what align the columns.
  assert.match(scene, /'\.'\.repeat/, 'the dot leaders are gone')
  // Speed follows length: a longer roll at the same duration just scrolls
  // faster, which is the opposite of readable.
  // The roll is 12,444px tall. `scrollSeconds` is the MOTION time, and at 60s
  // that is 219 px/sec — 0.21s per credit line. That is deliberate for eighty
  // lines that all say CORY, and impossible for the two that do not, so the
  // scroll stops on a card instead of being slowed for everything.
  assert.ok(credits.scrollSeconds >= 55,
    `${credits.scrollSeconds}s for a roll this long is a blur even for a joke`)
  const scene2 = readFileSync(url('../src/scenes/CreditsScene.ts'), 'utf8')
  const hold = /const CARD_HOLD_MS = (\d+)/.exec(scene2)
  assert.ok(hold && Number(hold[1]) >= 1000,
    'nothing stops the scroll on a card, so the two real names fly past')
  assert.match(scene2, /this\.cardStops\.push/, 'the roll does not know where its cards are')
})

test('a studio mark is placed on the line it is laid out on', () => {
  // fitContentHeight anchors on the artwork's centre and overwrites any origin
  // set before it. Laying a logo out as if it were top-anchored is what put
  // CP Plays through the middle of "IN COLLABORATION WITH".
  const scene = src('scenes/CreditsScene.ts')
  const body = /private logo\([\s\S]*?\n  \}/.exec(scene)
  assert.ok(body, 'the roll no longer draws logos')
  assert.doesNotMatch(body[0], /setOrigin/,
    'the logo sets an origin that fitContentHeight then overwrites')
  assert.match(body[0], /y \+ height \/ 2/,
    'the logo is not centred in the space the layout reserved for it')
})

test('the shout lands between the last credit and SPECIAL THANKS', () => {
  const kinds = blocks.map((b) => b.kind)
  const lastCredit = blocks.findIndex((b) => b.role === 'Person Still Reading the Credits')
  const shout = blocks.findIndex((b) =>
    b.kind === 'shout' && JSON.stringify(b.lines).includes('SELF-AGGRANDIZING'))
  const thanks = blocks.findIndex((b) => b.kind === 'heading' && b.text === 'SPECIAL THANKS')
  assert.ok(lastCredit >= 0 && shout >= 0 && thanks >= 0, 'one of the three markers is missing')
  assert.ok(lastCredit < shout, 'the shout comes before the credit it is answering')
  assert.ok(shout < thanks, 'the shout comes after SPECIAL THANKS instead of before it')
  assert.ok(kinds.includes('names'), 'the names moment is missing')
})

test('the dedication closes the way it is supposed to', () => {
  const order = ['THAT’S IT!', 'CLOWN COLLEGE', 'JUST KIDDING', 'LOVE YOU BOYS', 'THIS ONE IS FOR YOU']
  let at = -1
  for (const phrase of order) {
    const i = blocks.findIndex((b, k) =>
      k > at && b.kind === 'shout' && JSON.stringify(b.lines).toUpperCase().includes(
        phrase.replace('’', "'").toUpperCase()))
    assert.ok(i > at, `"${phrase}" is missing or out of order in the dedication`)
    at = i
  }
  // The names, then the title, then the last line.
  const names = blocks.findIndex((b) => b.kind === 'names')
  const title = blocks.findIndex((b) => b.kind === 'big' && b.text === 'COURJAHAN')
  const last = blocks.findIndex((b) =>
    b.kind === 'shout' && JSON.stringify(b.lines).includes('THIS ONE IS FOR YOU'))
  assert.ok(names < title && title < last, 'the names, the title and the sign-off are out of order')
  // And it closes on the studio.
  const lastLogo = blocks.map((b) => b.kind).lastIndexOf('logo')
  assert.ok(lastLogo > last, 'the roll does not close on the JebusGames logo')
  assert.equal(blocks[lastLogo]!.art, 'jebusGames')
})

test('the three names spell the title, in birth order', () => {
  const names = credits.names as Array<{ pre?: string; lit: string; rest: string }>
  assert.equal(names.map((n) => n.lit).join(''), 'COURJAHAN',
    'the lit letters do not spell the title')
  const full = names.map((n) => `${n.pre ?? ''}${n.lit}${n.rest}`.toUpperCase())
  assert.deepEqual(full, ['COURTLAND', 'ELIJAH', 'HAN'],
    'the names are wrong, or out of birth order')
})

test('the studio cards open the roll in the right order', () => {
  const first = blocks.filter((b) => b.kind === 'logo' || b.kind === 'label').slice(0, 3)
  assert.equal(first[0]!.art, 'jebusGames', 'JebusGames does not open the roll')
  assert.equal(first[1]!.text, 'IN COLLABORATION WITH')
  assert.equal(first[2]!.art, 'cpPlays', 'CP Plays does not follow the collaboration line')
})

test('every music track carries the attribution its licence requires', () => {
  // A CC-BY track that ships without naming its artist is a licence breach,
  // not a missing nicety. The roll reads these from music.json, so this is
  // the only place that can catch an entry added without its credit.
  const music = JSON.parse(readFileSync(url('../src/data/music.json'), 'utf8'))
  const tracks = Object.values(music.tracks) as Array<Record<string, unknown>>
  assert.ok(tracks.length > 0, 'no tracks are credited')
  for (const t of tracks) {
    const title = String(t.title ?? '')
    assert.ok(title.trim().length > 0, 'a track has no title')
    // Both tracks here are Creative Commons, which makes naming the artist and
    // the licence a condition of use rather than a nicety. A track that plays
    // and is not credited is a breach, so this guards the data the roll reads.
    assert.ok(String(t.artist ?? '').trim().length > 0, `"${title}" names no artist`)
    assert.ok(String(t.license ?? '').trim().length > 0, `"${title}" records no licence`)
    assert.ok(String(t.source ?? '').trim().length > 0, `"${title}" records no source URL`)
    // Unverified entries must SAY so, and say why, rather than looking settled.
    if (t.verified !== true) {
      assert.ok(String(t._verify ?? '').length > 20,
        `"${title}" is unverified and does not record why`)
    }
  }
})

test('ATTRIBUTIONS.md and the credits roll agree with the data', () => {
  // Two records of the same obligation drift apart the moment one is edited
  // alone. Both are generated from, or checked against, music.json.
  const attributions = readFileSync(url('../ATTRIBUTIONS.md'), 'utf8')
  const music = JSON.parse(readFileSync(url('../src/data/music.json'), 'utf8'))
  for (const t of Object.values(music.tracks) as Array<Record<string, string>>) {
    assert.ok(attributions.includes(t.title), `ATTRIBUTIONS.md does not list "${t.title}"`)
    assert.ok(attributions.includes(t.artist), `ATTRIBUTIONS.md does not credit ${t.artist}`)
    assert.ok(attributions.includes(t.source), `ATTRIBUTIONS.md does not record ${t.title}'s source`)
  }
  // An unverified entry has to be flagged in the record too, not just the data.
  const unverified = (Object.values(music.tracks) as Array<Record<string, unknown>>)
    .filter((t) => t.verified !== true)
  if (unverified.length > 0) {
    assert.match(attributions, /NOT verified/,
      'a track could not be verified and ATTRIBUTIONS.md does not say so')
  }
  // Kenney is CC0, which the shipped licence file has to actually say — the
  // point of the audit was to confirm rather than assume.
  const kenney = readFileSync(url('../public/assets/kenney/License.txt'), 'utf8')
  assert.match(kenney, /Creative Commons Zero/i, 'the Kenney pack licence is not what we claim')
  const font = readFileSync(url('../public/assets/fonts/License.txt'), 'utf8')
  assert.match(font, /Creative Commons Zero/i, 'the font licence is not what we claim')

  // And the roll still names them.
  const credits = JSON.parse(readFileSync(url('../src/data/credits.json'), 'utf8'))
  const flat = JSON.stringify(credits.blocks)
  assert.match(flat, /KENNEY/, 'the roll no longer credits Kenney')
  assert.match(flat, /"MUSIC"/, 'the roll has no MUSIC section')
  // The two names that are not Cory still get their own presentation.
  const cards = credits.blocks.filter((b: { kind: string }) => b.kind === 'card')
  assert.deepEqual(cards.map((c: { name: string }) => c.name).sort(), ['COURTLAND', 'HAN'],
    'Courtland and Han no longer get their own cards')
})
