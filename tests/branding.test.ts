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

test('the title mark is small and sits inside the canvas', () => {
  const m = branding.titleMark
  const cfg = art.render[art.brand.jebusGames]
  const w = (cfg.contentWidth / cfg.contentHeight) * m.height
  assert.ok(m.height <= 160, `a corner mark ${m.height}px tall is not small`)
  assert.ok(m.x - w / 2 >= 0 && m.x + w / 2 <= display.width, 'title mark runs off the canvas horizontally')
  assert.ok(m.y - m.height / 2 >= 0 && m.y + m.height / 2 <= display.height, 'title mark runs off vertically')
})

test('both credits logos fit side by side with the configured gap', () => {
  const c = branding.credits
  const widthOf = (role: 'jebusGames' | 'cpPlays') => {
    const cfg = art.render[art.brand[role]]
    return (cfg.contentWidth / cfg.contentHeight) * c.logoHeight
  }
  const total = widthOf('jebusGames') + c.logoGap + widthOf('cpPlays')
  assert.ok(total <= display.width - 80, `credits logos span ${total.toFixed(0)}px on a ${display.width}px canvas`)
  assert.ok(c.logoGap > 40, 'the two marks need breathing room between them')
})

/** Where the credits block ends, laid out exactly as CreditsScene lays it. */
function creditsBottom(): number {
  const c = branding.credits
  let y = c.textTop
  for (const section of credits.sections) {
    y += c.sectionGap
    y += section.entries.length * c.lineHeight
    y += c.sectionGap
  }
  return y + credits.notes.length * 18
}

const allEntries = () => credits.sections.flatMap((s: any) => s.entries)

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
  assert.match(scene, /this\.tweens\.add\(\{[\s\S]{0,200}duration: creditsData\.scrollSeconds/,
    'nothing scrolls, or the duration is hardcoded away from the data')
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
