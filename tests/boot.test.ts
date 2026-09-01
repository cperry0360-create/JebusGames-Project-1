import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const art = JSON.parse(readFileSync(url('../src/data/art.json'), 'utf8'))

/**
 * The outage, as tests.
 *
 * A manifest hook was added for art that had not been uploaded. The loader was
 * taught to tolerate it and the manifest tests were taught to skip it — and
 * the one place that actually gates the game, BootScene, was not. It collected
 * every absent texture, drew the list on a blank screen and returned without
 * starting Splash. The whole game was a green screen reading "Missing art".
 *
 * Nothing here can prove the game renders; CI has no browser. What it holds
 * are the two properties that would each have prevented it alone: boot never
 * refuses to continue, and no REQUIRED file is absent. The rendering proof is
 * the harness's `realboot` scenario, which walks Boot to Hud forcing nothing.
 */

test('boot never refuses to start the game', () => {
  const boot = src('scenes/BootScene.ts')
  const create = boot.slice(boot.indexOf('create(): void {'))
  const body = create.slice(0, create.indexOf('\n  }'))

  // The exact shape of the bug: a bare `return` in create() before Splash.
  assert.ok(!/\n\s+return\b/.test(body),
    'BootScene.create() can return early, which is what blanked the game on live')
  assert.match(body, /this\.scene\.start\('Splash'\)/, 'boot does not start the game')

  // Missing art is reported, not fatal, and the two kinds are told apart.
  assert.match(body, /OPTIONAL_SPRITE_KEYS/, 'boot does not know which art is optional')
  assert.match(body, /REQUIRED_SPRITE_KEYS/, 'boot does not know which art is required')
  assert.match(body, /console\.warn\(/, 'a missing optional asset is not warned about')
  assert.match(body, /console\.error\(/, 'a missing required asset is not reported loudly')
})

test('every REQUIRED manifest file is really present', () => {
  // This is the check that was switched off. The `optional` skip was added so
  // a hook could exist before its art, and it must apply to optional keys only.
  const optional: string[] = art.optional ?? []
  const missing: string[] = []
  for (const [key, path] of Object.entries(art.files) as [string, string][]) {
    if (optional.includes(key)) continue
    if (!existsSync(url(`../public/${art.assetRoot}${path}`))) missing.push(`${key} -> ${path}`)
  }
  assert.deepEqual(missing, [], 'required art is referenced but not in the repo')
})

test('an optional key is a short deliberate list, and every one has a fallback', () => {
  const optional: string[] = art.optional ?? []
  // NOT a raw count. The cap was bumped twice — once for ten UI icons, once
  // for eight hero frames — and a number that moves every time art lands is
  // not a rule, it is a formality. What actually stops this list becoming a
  // mute button is that every key on it belongs to a FAMILY with a named,
  // checked fallback. Eight walk frames sharing one fallback are one decision,
  // not eight; a stray key belonging to no family is the thing to catch.
  const FAMILIES: Array<{ match: RegExp; fallback: string }> = [
    { match: /^icon-/, fallback: 'the generated icon stand-in' },
    { match: /^hero-cory-(walk|attack)-\d$/, fallback: 'the static idle sprite' },
  ]
  assert.ok(FAMILIES.length <= 6,
    `${FAMILIES.length} families of optional art; this list is for art being drawn`)
  const orphans = optional.filter((k) => !FAMILIES.some((f) => f.match.test(k)))
  assert.deepEqual(orphans, [],
    'these optional keys belong to no family, so nothing says what they fall back to')
  for (const key of optional) {
    assert.ok(art.files[key], `${key} is marked optional but is not in the manifest`)
  }
  // Every family's fallback is real code, not a comment.
  assert.match(src('scenes/BootScene.ts'), /ensureIconFallbackTexture\(this\)/, 'no icon fallback')
  assert.match(src('entities/Hero.ts'), /return this\.def\.bodySprite/,
    'a missing hero frame does not fall back to the static idle')

  // The build pad is REQUIRED art now, not an optional hook — it was the one
  // that took the game down to a green screen, and a hook whose file never
  // arrived is what put seven signs on the board afterwards. Required means
  // boot names it in a banner and carries on, so the existence check and the
  // fallback matter more than they did, not less.
  const game = src('scenes/GameScene.ts')
  assert.ok(!optional.includes('prop-pad-flagstone') && !optional.includes('prop-build-pad'),
    'the build pad is back on the optional list, where a missing file says nothing')
  assert.match(game, /this\.textures\.exists\(quietKey\)/,
    'the build pad has no existence check, so a missing file would draw nothing')
  assert.match(game, /const isSign = i === signIndex \|\| !hasQuiet/,
    'the build pad does not fall back to the sign when its art is absent')
})

test('the scatter skips props whose art did not load', () => {
  // Fourteen ordinary manifest entries, so one going missing must drop that
  // prop rather than putting a placeholder box on the grass.
  const game = src('scenes/GameScene.ts')
  const fn = game.slice(game.indexOf('private createScatter()'), game.indexOf('private createAmbient()'))
  assert.match(fn, /\.filter\(\(k\) => this\.textures\.exists\(k\.key\)\)/,
    'the scatter draws props without checking their art loaded')
  assert.match(fn, /if \(kinds\.length === 0\) return/,
    'the scatter has no answer for every prop being absent')
})

test('the loader does not pretend to handle a missing file', () => {
  // The first attempt registered a no-op `fileerror` listener that swallowed
  // nothing and prevented nothing — and reading it made the tolerance look
  // handled when it was not.
  const loader = src('systems/ArtLoader.ts')
  assert.ok(!/fileerror-image-/.test(loader),
    'the loader has a listener that does nothing, which is worse than none')
})

test('the missing-art banner cannot be hidden behind the game', () => {
  // A Phaser text was tried first and was invisible: scene render order beats
  // any depth, and Boot is the FIRST scene in the config array, so it drew
  // underneath the entire game in exactly the case it exists for.
  const boot = src('scenes/BootScene.ts')
  assert.match(boot, /position:fixed/, 'the banner is drawn on a canvas that renders below the game')
  assert.match(boot, /z-index:99998/, 'the banner has no stacking order of its own')
  assert.ok(!/this\.scene\.bringToTop\('Boot'\)/.test(boot),
    'the banner is still trying to win a scene-order fight it cannot win')
})
