import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The type rules, enforced.
 *
 * KenneyFutureNarrow was the UI face and it could not hold its letterforms at
 * UI sizes: K read as H, X as H, R as A. The game misread its own words —
 * "KEEP PLAYING" became "HEEP PLAYING", and the credits turned "CORY WORKS IN
 * TAX" into "CORY WORHS IN TAH". These tests exist so that cannot come back by
 * someone typing a familiar-looking number into a style object.
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
function styles(body: string): { family: string; size: number; at: number; numerals: boolean }[] {
  const found: { family: string; size: number; at: number; numerals: boolean }[] = []
  const re = /(\/\* numerals \*\/\s*)?fontFamily:\s*(FONT_DISPLAY|FONT_UI|'[^']*')[\s\S]{0,120}?fontSize:\s*'(\d+)px'/g
  for (let m = re.exec(body); m; m = re.exec(body)) {
    found.push({
      family: m[2] as string,
      size: Number(m[3]),
      at: body.slice(0, m.index).split('\n').length,
      numerals: Boolean(m[1]),
    })
  }
  return found
}

test('the display face is never used below the size its letters survive', () => {
  // Digits are exempt and stay in the display face: the glyphs that fail are
  // letters, and the HUD counters are the "big numbers" the face is for. The
  // exemption has to be claimed in the source with a `/* numerals */` marker,
  // so it is a decision someone made rather than one they drifted into.
  for (const { path, body } of ALL) {
    for (const s of styles(body)) {
      if (s.family !== 'FONT_DISPLAY') continue
      if (s.numerals) continue
      assert.ok(s.size >= type.displayMinSize,
        `${path}:${s.at} sets the display face at ${s.size}px, below the ${type.displayMinSize}px floor. ` +
        'That is where K becomes H and X becomes H.')
    }
  }
})

test('no UI text is set below the legible minimum', () => {
  // Menu scenes are fitted from the 1280x720 design box down to the viewport,
  // so their floor is much higher: on a phone in landscape the fit is about
  // 0.55, and a 13px menu label was seven real pixels.
  const MENU = ['scenes/TitleScene.ts', 'scenes/DraftScene.ts', 'scenes/CreditsScene.ts', 'scenes/SplashScene.ts']
  for (const { path, body } of ALL) {
    if (path === 'scenes/BootScene.ts') continue // the missing-art dump, not UI
    const floor = MENU.includes(path) ? type.minMenuSize : type.minUiSize
    for (const s of styles(body)) {
      assert.ok(s.size >= floor,
        `${path}:${s.at} sets ${s.size}px text; the floor ${MENU.includes(path) ? 'for a fitted menu screen' : 'for screen-space UI'} is ${floor}px`)
    }
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
