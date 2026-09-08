import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const art = JSON.parse(readFileSync(url('../src/data/art.json'), 'utf8'))
/** The shipped page, which carries the pre-boot error handler and the script
 *  tag whose attributes decide whether a crash report says anything. */
const page = readFileSync(url('../index.html'), 'utf8')

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
    // The hero ability icons with no file behind them. Two were never in the
    // art upload; Eli's second was deleted deliberately when his abilities
    // changed, because the placeholder it held read STAR / LOCKED and slot 2
    // is Ice Beam now -- see art.json's _optional. All three fall back to the
    // same generated stand-in the UI icons use, through GameScene.abilityIcon,
    // which checks the texture rather than trusting the manifest.
    { match: /^ability-(bailey-1|eli-[12])$/, fallback: 'the generated icon stand-in' },
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
  assert.match(src('entities/Hero.ts'), /return heroSprite\(this\.heroId, this\.powered\)/,
    'a missing hero frame does not fall back to the static idle')
  assert.match(src('scenes/GameScene.ts'), /this\.textures\.exists\(key\) \? key : ART\.generated\.iconMissing/,
    'a hero ability icon with no file behind it draws the missing texture')

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

/**
 * THE ATTRIBUTE THAT DECIDES WHETHER A CRASH REPORT SAYS ANYTHING.
 *
 * Three iPhone reports came back reading `error  Script error.` with no
 * message, no file, no line and no stack. That is what a browser reports for
 * an exception in a script it treats as cross-origin, and the module script
 * had no `crossorigin` attribute.
 *
 * This checks the SOURCE. It cannot check the build — `npm install` answers
 * 403 in the agent environment so Vite never runs there, and Vite rewrites
 * this exact tag on its way to `dist/index.html`. That half is asserted in
 * `.github/workflows/deploy.yml`, on the real output, by the machine that
 * actually builds it; and the page reports its own `scriptCrossOrigin` at
 * runtime so the next crash report says it too. Three checks because the
 * attribute is invisible when it works and costs a diagnosis when it does not.
 */
test('the module script asks for cross-origin error detail', () => {
  const tag = /<script[^>]*type="module"[^>]*>/.exec(page)?.[0]
  assert.ok(tag, 'index.html has no module script tag at all')
  assert.match(tag, /crossorigin/,
    'without crossorigin an exception reports as a bare "Script error." with no stack')
})

/**
 * Both handlers, and they must not be the same handler.
 *
 * A rejected promise surfaces differently from a thrown error and may be the
 * real source here, so the two are labelled apart — a report that says
 * "unhandled rejection" points somewhere different from one that says
 * "uncaught exception", and the early queue in index.html has to carry the
 * distinction too or it is lost exactly where it is hardest to reproduce.
 */
test('a thrown error and a rejected promise are reported as different things', () => {
  const panel = src('systems/ErrorPanel.ts')
  assert.match(panel, /addEventListener\?\.\('error'/, 'no handler for uncaught exceptions')
  assert.match(panel, /addEventListener\?\.\('unhandledrejection'/, 'no handler for rejections')
  assert.match(panel, /'unhandled rejection'/, 'rejections are not labelled apart from throws')

  // The location, which was being thrown away: ErrorEvent carries it whether
  // or not a stack survives, so it is the one detail a muted script might
  // still yield on some other build.
  assert.match(panel, /e\.filename/, 'the error location is not captured')
  assert.match(panel, /e\.lineno/, 'the error line is not captured')

  // And the early queue keeps the distinction rather than flattening it.
  assert.match(page, /kind: kind \|\| 'error'/, 'the pre-boot queue loses the kind')
  assert.match(page, /'rejection'/, 'the pre-boot handler does not mark rejections')
})
