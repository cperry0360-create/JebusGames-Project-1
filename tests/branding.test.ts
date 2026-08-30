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

test('the credits text has room below the logos and does not overflow', () => {
  const c = branding.credits
  const logoBottom = c.logoY + c.logoHeight / 2
  assert.ok(c.textTop > logoBottom, 'credit text would overlap the logos')
  const lastLine = c.textTop + (credits.lines.length - 1) * c.lineHeight
  assert.ok(lastLine < display.height - 110,
    `credits run to y=${lastLine}, leaving no room for the footer and back button`)
})

test('the credits name Kenney and say CC0', () => {
  const all = [credits.subheading, ...credits.lines, credits.footer].join(' ')
  assert.match(all, /Kenney/, 'the CC0 art has to be credited by name')
  assert.match(all, /CC0/, 'the licence has to be named')
  assert.ok(credits.lines.some((l: string) => l.includes('Kenney') && l.includes('CC0')),
    'one line should credit Kenney and its licence together')
})

test('credits copy is data, so adding a name never touches code', () => {
  assert.ok(credits.lines.length >= 3, 'not much of a credits screen')
  assert.ok(credits.heading && credits.subheading && credits.footer)
  for (const line of credits.lines) assert.equal(typeof line, 'string')
})

test('Cory works in tax, and the credits still say so', () => {
  assert.match(credits.footer, /tax/i)
  assert.doesNotMatch(credits.footer, /audit/i)
})
