import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const art = read('art'), branding = read('branding'), credits = read('credits'), display = read('display')

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

test('the credits text has room below the logos and does not overflow', () => {
  const c = branding.credits
  // The heading block sits above the logos, which sit above the text.
  assert.ok(c.subheadingY > c.headingY, 'the subheading is above the heading')
  assert.ok(c.logoY - c.logoHeight / 2 > c.subheadingY + 12,
    'the logos would sit on top of the subheading')
  const logoBottom = c.logoY + c.logoHeight / 2
  assert.ok(c.textTop > logoBottom, 'credit text would overlap the logos')
  const bottom = creditsBottom()
  assert.ok(bottom < display.height - 110,
    `credits run to y=${bottom}, leaving no room for the footer and back button`)
})

const allEntries = () => credits.sections.flatMap((s: any) => s.entries)

test('the credits name Kenney and say CC0', () => {
  const names = allEntries().map((e: any) => e.name)
  assert.ok(names.some((n: string) => n.includes('Kenney') && n.includes('CC0')),
    'one credit should name Kenney and its licence together')
})

test('credits copy is data, so adding a name never touches code', () => {
  assert.ok(credits.sections.length >= 3, 'not much of a credits screen')
  assert.ok(credits.heading && credits.subheading && credits.footer)
  for (const s of credits.sections) {
    assert.ok(s.title, 'a section with no title')
    assert.ok(s.entries.length > 0, `section "${s.title}" has no entries`)
    for (const e of s.entries) {
      assert.equal(typeof e.role, 'string')
      assert.equal(typeof e.name, 'string')
      assert.ok(e.role && e.name, 'a credit needs both a role and a name')
    }
  }
})

test('the three kids are credited together, and the joke lands on two of them', () => {
  // The contrast is the point: Courtland's real job beside the other two's
  // total absence, in the same department.
  const dept = credits.sections.find((s: any) =>
    s.entries.some((e: any) => e.name.includes('Courtland')))
  assert.ok(dept, 'Courtland is not credited')
  const names = dept.entries.map((e: any) => e.name).join(' ')
  assert.match(names, /Eli/, 'Eli should sit in the same department as Courtland')
  assert.match(names, /Han/, 'Han should sit in the same department as Courtland')

  const courtland = dept.entries.find((e: any) => e.name.includes('Courtland'))
  assert.match(courtland.role, /Tester/i, "Courtland's real contribution should be his role")
  const absent = dept.entries.find((e: any) => e.name.includes('Eli'))
  assert.match(absent.role, /Hershey/i, 'the theme-park joke is the whole credit')
  assert.match(credits.notes.join(' '), /Hershey/i, 'the closing note should land the joke')
})

test('everyone the brief asks for is credited', () => {
  const all = allEntries()
  const find = (name: string) => all.find((e: any) => e.name.includes(name))
  for (const [name, role] of [['Claude', /Programmer/i], ['ChatGPT', /Art/i], ['Gemini', /Concept/i]] as const) {
    const entry = find(name)
    assert.ok(entry, `${name} is not credited`)
    assert.match(entry.role, role, `${name} is credited with the wrong job`)
  }
})

test('Cory works in tax, and the credits still say so', () => {
  assert.match(credits.footer, /tax/i)
  assert.doesNotMatch(credits.footer, /audit/i)
})

test('the dedication sits between the closing note and the back button', () => {
  // It was written into the data long before anything drew it, which is how it
  // went missing from the screen while every test still passed.
  const c = branding.credits
  assert.ok(c.footerY > creditsBottom(),
    `the dedication at y=${c.footerY} would land on the closing note`)
  assert.ok(c.footerY < display.height - 80,
    'the dedication would land on the back button')
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
