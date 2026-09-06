import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The type rules, enforced.
 *
 * KenneyFuture cannot hold its letterforms at UI sizes: K reads as H, X as H,
 * R as A. The game misread its own words — "KEEP PLAYING" became "HEEP
 * PLAYING", "SPECIAL THANKS" became "SPECIAL THANHS", the credits turned "CORY
 * WORKS IN TAX" into "CORY WORHS IN TAH", and the results panel announced THE
 * LINE BROHE. Each one was found in a real frame, and each was worked around
 * one at a time until the copy was being chosen to suit the font.
 *
 * So the rule is now total and mechanical: the display face above the floor,
 * the sans everywhere else, with no exemption for numerals and none for a
 * string that happens to contain no K. These tests exist so it cannot come
 * back by someone typing a familiar-looking number into a style object.
 */

const url = (p: string) => new URL(p, import.meta.url)
const type = JSON.parse(readFileSync(url('../src/data/presentation.json'), 'utf8')).typography

function sources(dir: string, out: { path: string; body: string }[] = []) {
  for (const e of readdirSync(url(`../src/${dir}`), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name
    if (e.isDirectory()) sources(rel, out)
    else if (e.name.endsWith('.ts')) {
      out.push({ path: rel, body: readFileSync(url(`../src/${rel}`), 'utf8') })
    }
  }
  return out
}
const ALL = sources('')

/** Every `fontFamily: X, ... fontSize: 'Npx'` pair in one file, in order. */
function styles(body: string): { family: string; size: number; at: number }[] {
  const found: { family: string; size: number; at: number }[] = []
  const re = /fontFamily:\s*(FONT_DISPLAY|FONT_UI|'[^']*')[\s\S]{0,140}?fontSize:\s*'(\d+)px'/g
  for (let m = re.exec(body); m; m = re.exec(body)) {
    found.push({
      family: m[1] as string,
      size: Number(m[2]),
      at: body.slice(0, m.index).split('\n').length,
    })
  }
  return found
}

test('the display face is never used below the size its letters survive', () => {
  // No exemptions. The numerals exemption is gone: it was the crack the face
  // kept coming back through, and a rule with a carve-out is a rule someone
  // has to remember rather than one the code enforces.
  for (const { path, body } of ALL) {
    for (const s of styles(body)) {
      if (s.family !== 'FONT_DISPLAY') continue
      assert.ok(s.size >= type.displayMinSize,
        `${path}:${s.at} sets the display face at ${s.size}px, below the ${type.displayMinSize}px floor. ` +
        'That is where K becomes H, X becomes H and R becomes A.')
    }
  }
})

test('the floor is clear of the failure, not on its edge', () => {
  // 40px is where an R is already ambiguous, so the floor sits above it.
  assert.ok(type.displayMinSize >= 44,
    `a ${type.displayMinSize}px floor is inside the range where the face fails`)
})

test('the face is chosen by size in one place, not at each call site', () => {
  const theme = readFileSync(url('../src/ui/Theme.ts'), 'utf8')
  assert.match(theme, /export function faceFor\(px: number\): string \{[\s\S]{0,120}displayMinSize \? FONT_DISPLAY : FONT_UI/,
    'there is no single place that decides which face a size gets')
  assert.match(theme, /fontFamily: faceFor\(size\)/,
    'the heading helper picks a face without asking faceFor')
})

test('what is left in the display face is genuinely large', () => {
  // The title, the boss, the payoff — and nothing that a player has to read
  // quickly or that carries a word the face cannot spell.
  const big: string[] = []
  for (const { path, body } of ALL) {
    if (path === 'ui/Theme.ts') continue
    for (const s of styles(body)) {
      if (s.family === 'FONT_DISPLAY') big.push(`${path}:${s.at}@${s.size}`)
    }
  }
  assert.ok(big.length > 0, 'the display face is gone entirely; the title should still use it')
  assert.ok(big.length <= 12,
    `${big.length} display-face sites is more than a title and a few headings: ${big.join(', ')}`)
})

test('no UI text is set below the legible minimum', () => {
  // Menu scenes are fitted from the 1280x720 design box down to the viewport,
  // so their floor is much higher: on a phone in landscape the fit is about
  // 0.55, and a 13px menu label was seven real pixels.
  const MENU = ['scenes/TitleScene.ts', 'scenes/LoadoutScene.ts', 'scenes/CreditsScene.ts',
    'scenes/SplashScene.ts', 'scenes/WorldMapScene.ts']
  for (const { path, body } of ALL) {
    if (path === 'scenes/BootScene.ts') continue // the missing-art dump, not UI
    const floor = MENU.includes(path) ? type.minMenuSize : type.minUiSize
    for (const s of styles(body)) {
      assert.ok(s.size >= floor,
        `${path}:${s.at} sets ${s.size}px text; the floor ${MENU.includes(path) ? 'for a fitted menu screen' : 'for screen-space UI'} is ${floor}px`)
    }
  }
})

test('type sizes that live in data are held to the same floor as the ones in code', () => {
  // THE REGEX ABOVE CANNOT SEE THESE. It looks for `fontSize: 'Npx'` in a
  // source file, and the world map's sizes are in presentation.json -- read
  // through ROAD and interpolated -- because that is where this project keeps
  // numbers that might be tuned. A rule that a whole screen can step outside
  // by moving a number into JSON is not a rule, so the JSON is checked too.
  const wm = JSON.parse(readFileSync(url('../src/data/presentation.json'), 'utf8')).worldMap
  const sizes: Array<[string, number]> = [
    ['worldMap.label.size', wm.label.size],
    ['worldMap.badge.size', wm.badge.size],
  ]
  for (const [where, px] of sizes) {
    assert.equal(typeof px, 'number', `${where} is not a number`)
    assert.ok(px >= type.minMenuSize,
      `${where} is ${px}px; the floor for a fitted menu screen is ${type.minMenuSize}px`)
  }
})

test('the UI face is a real sans, not a display font wearing one', () => {
  const theme = readFileSync(url('../src/ui/Theme.ts'), 'utf8')
  const ui = /export const FONT_UI\s*=\s*\n?\s*'([^']*)'/.exec(theme)
  assert.ok(ui, 'FONT_UI is not a plain string any more; this test cannot check it')
  const stack = ui[1] as string
  assert.doesNotMatch(stack, /Kenney/, 'the Kenney faces are display faces; none of them belongs in the UI stack')
  assert.match(stack, /-apple-system|BlinkMacSystemFont/, 'no system face, so iOS does not get San Francisco')
  assert.match(stack, /sans-serif\s*$/, 'the stack must end in a generic sans, or a bare device falls back to serif')
  // A monospace fallback was the old stack's last resort and is not a UI face.
  assert.doesNotMatch(stack, /monospace/, 'monospace is not a fallback for UI text')
})

test('button labels never use the display face at any size', () => {
  // A button is the text a player reads fastest and acts on. This is the one
  // that produced "HEEP PLAYING" on the run-end screen.
  const plate = readFileSync(url('../src/ui/Plate.ts'), 'utf8')
  const btn = plate.slice(plate.indexOf('export function plateButton'))
  assert.ok(btn.length > 0, 'plateButton moved; this test is checking nothing')
  assert.match(btn, /fontFamily: FONT_UI/, 'button labels are back on the display face')
  assert.match(btn, /uiSize\(size\)/, 'a caller can still set a button label below the legible floor')
})

test('body text is given room to breathe', () => {
  assert.ok(type.lineSpacing >= 4, `${type.lineSpacing}px of line spacing is not extra leading`)
  assert.ok(type.letterSpacing > 0, 'no letter spacing on body text')
  // And it has to actually be applied somewhere, or it is a number in a file.
  const users = ALL.filter((f) => f.body.includes('...BODY_SPACING'))
  assert.ok(users.length >= 5,
    `only ${users.length} files apply BODY_SPACING; the wrapped blurbs are the ones that need it`)
})

test('the wrapped blurbs fit the width they are given', () => {
  // A wordWrap wider than the design box silently overflows the screen.
  for (const { path, body } of ALL) {
    for (const m of body.matchAll(/wordWrap:\s*\{\s*width:\s*(\d+)\s*\}/g)) {
      assert.ok(Number(m[1]) <= 1160,
        `${path} wraps text at ${m[1]}px inside a 1280px design box, leaving no margin`)
    }
  }
})
