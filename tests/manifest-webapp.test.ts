/**
 * The web app manifest, and the four places the ground colour has to agree.
 *
 * There was no manifest at all until 2026-09-09, which is why a home screen
 * web app got no display mode and was free to rotate into a layout the game
 * does not draw. See reports/2026-09-09-manifest-and-cleanup.md.
 *
 * NO PHASER HERE, deliberately: `npm install` answers 403 in this environment,
 * so a test that reaches the engine cannot run at all. This reads files.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const manifest = JSON.parse(read('public/manifest.webmanifest')) as Record<string, unknown>
const indexHtml = read('index.html')
const display = JSON.parse(read('src/data/display.json')) as Record<string, unknown>

test('the manifest asks for landscape, fullscreen, and its own scope', () => {
  assert.equal(manifest.orientation, 'landscape',
    'the game is landscape-only; the manifest is how a platform that honours it is told')
  assert.equal(manifest.display, 'fullscreen')
  // RELATIVE, NOT ABSOLUTE. vite.config.ts sets `base: './'` so the build works
  // at the Pages project path without hardcoding the repo name. A start_url of
  // "/" would launch the home screen app at the domain root, which on
  // <user>.github.io is somebody else's page.
  assert.equal(manifest.start_url, './')
  assert.equal(manifest.scope, './')
})

test('the manifest names icons that exist, including a maskable one', () => {
  const icons = manifest.icons as { src: string; sizes: string; purpose?: string }[]
  assert.ok(Array.isArray(icons) && icons.length >= 2, 'no icons listed')
  for (const i of icons) {
    const rel = i.src.replace(/^\.\//, 'public/')
    assert.doesNotThrow(() => readFileSync(new URL(`../${rel}`, import.meta.url)),
      `${i.src} is listed in the manifest but not in public/`)
  }
  assert.ok(icons.some((i) => i.purpose === 'maskable'),
    'no maskable icon: an Android launcher crops a non-maskable one into its own shape')
  assert.ok(icons.some((i) => i.sizes === '512x512'))
})

test('index.html links the manifest and the iOS-only icon', () => {
  assert.match(indexHtml, /<link rel="manifest" href="\.\/manifest\.webmanifest"/)
  // iOS takes the home screen icon from this link and ignores manifest icons.
  assert.match(indexHtml, /rel="apple-touch-icon"/)
  // For iOS older than 16.4, which does not read the manifest at all.
  assert.match(indexHtml, /name="apple-mobile-web-app-capable" content="yes"/)
})

test('the ground colour is the same in all four places', () => {
  // A mismatch between any two of these shows as a band down the edge of the
  // screen on iOS. It used to be three places; the manifest makes it four.
  const ground = display.backgroundColor as string
  assert.equal(ground, '#10161d')
  assert.equal(manifest.background_color, ground, 'manifest background_color drifted from display.json')
  assert.equal(manifest.theme_color, ground, 'manifest theme_color drifted from display.json')
  const meta = indexHtml.match(/<meta name="theme-color" content="([^"]+)"/)
  assert.ok(meta, 'no theme-color meta tag in index.html')
  assert.equal(meta[1], ground, 'the theme-color meta tag drifted from display.json')
  assert.match(indexHtml, /background: #10161d/, 'html/body no longer paints the same ground')
})

test('the rotate gate is still in the source', () => {
  // THE MANIFEST DOES NOT REPLACE IT. iOS honours no orientation member, in a
  // home screen app or a tab, so on the platform the crash was reported from
  // the gate is the only thing standing between a rotation and a landscape
  // layout drawn into a portrait viewport. Deleting the gate because "the
  // manifest handles it now" would be a regression on every iPhone.
  const orientation = read('src/systems/Orientation.ts')
  assert.ok(orientation.length > 0, 'Orientation.ts is gone')
})
