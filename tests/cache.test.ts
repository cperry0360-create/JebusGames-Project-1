import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BUILD_ID, stamped } from '../src/systems/Build.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (p: string) => readFileSync(url(p), 'utf8')
const config = read('../vite.config.ts')
const page = read('../index.html')

test('every bundle filename is content-hashed', () => {
  // A hashed name is a new URL, which no cache can answer with the old file.
  // This is the mechanism the whole fix rests on, so it is spelled out in the
  // config rather than left to Vite's default.
  for (const key of ['entryFileNames', 'chunkFileNames', 'assetFileNames']) {
    const m = new RegExp(`${key}:\\s*'([^']+)'`).exec(config)
    assert.ok(m, `${key} is not declared`)
    assert.match(m[1], /\[hash\]/, `${key} (${m[1]}) has no content hash`)
  }
})

test('the public URL is untouched by any of this', () => {
  // People have it bookmarked. Only internal filenames may change.
  assert.match(config, /base:\s*'\.\/'/, 'a changed base would change the public URL')
})

test('the build stamps itself into the bundle and beside it', () => {
  assert.match(config, /__BUILD_ID__:\s*JSON\.stringify\(BUILD_ID\)/,
    'the build id is not defined for the bundle')
  assert.match(config, /fileName:\s*'version\.json'/, 'version.json is never emitted')
  assert.match(config, /rev-parse --short HEAD/, 'the build id should be the commit')
})

test('runtime assets are stamped, because Vite does not hash them', () => {
  // Files under public/ are copied verbatim. They get no content hash, so
  // without a query stamp a phone keeps last week's art and audio.
  const artLoader = read('../src/systems/ArtLoader.ts')
  const audio = read('../src/systems/Audio.ts')
  assert.match(artLoader, /load\.image\([^,]+,\s*stamped\(/, 'art URLs are not stamped')
  assert.match(audio, /load\.audio\([^,]+,\s*stamped\(/, 'audio URLs are not stamped')
})

test('stamped() appends the build id without breaking an existing query', () => {
  assert.equal(stamped('a/b.png'), `a/b.png?v=${BUILD_ID}`)
  assert.equal(stamped('a/b.png?x=1'), `a/b.png?x=1&v=${BUILD_ID}`)
  assert.ok(BUILD_ID.length > 0, 'there is always a build id, even outside a build')
})

test('index.html asks not to be cached, and checks for itself as well', () => {
  // GitHub Pages will not set Cache-Control for us, so the meta tags are best
  // effort. The version check is the part that actually works.
  assert.match(page, /http-equiv="Cache-Control"[^>]*no-store/, 'no no-cache meta')
  assert.match(page, /fetch\('\.\/version\.json',\s*\{\s*cache:\s*'no-store'\s*\}\)/,
    'version.json must be fetched with no-store or the check is cached too')
  assert.match(page, /location\.reload\(\)/, 'a stale page never recovers')
  assert.match(page, /sessionStorage/, 'an unguarded reload can loop forever')
  assert.match(page, /__BUILD_ID__/, 'nothing for the build to stamp')
})

test('the stale-page reload cannot loop', () => {
  // If even the reload is served from cache, the guard has to stop it.
  const block = page.slice(page.indexOf('Self-healing cache check'))
  const setIdx = block.indexOf("sessionStorage.setItem")
  const reloadIdx = block.indexOf('location.reload()')
  assert.ok(setIdx > 0 && reloadIdx > setIdx,
    'the guard must be written before the reload, or a cached reload loops')
})

test('the title screen says which build it is', () => {
  const title = read('../src/scenes/TitleScene.ts')
  assert.match(title, /BUILD_ID/, 'no build stamp on the title screen')
})
