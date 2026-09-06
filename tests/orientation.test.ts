import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { ENTER_FRAMES, OrientationGate } from '../src/systems/OrientationGate.ts'

/**
 * The game renders at the device's actual orientation, always.
 *
 * A canvas rotated to force landscape is the worst kind of fix: the browser
 * reports pointer coordinates in screen space, so every tap, drag and pinch
 * arrives in a different frame from the one the game draws in. Taps land in
 * the wrong place, panning drifts and a pinch cannot work at all — and none of
 * it is visible in a test that only checks what the screen looks like.
 *
 * Portrait gets an overlay and a paused game instead.
 */

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const page = readFileSync(url('../index.html'), 'utf8')
const gate = src('systems/Orientation.ts')

function allSources(dir = '', out: { path: string; body: string }[] = []) {
  for (const e of readdirSync(url(`../src/${dir}`), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name
    if (e.isDirectory()) allSources(rel, out)
    else if (e.name.endsWith('.ts')) out.push({ path: rel, body: src(rel) })
  }
  return out
}

test('nothing rotates the canvas or anything containing it', () => {
  // The page's own CSS first. A `transform: rotate` on #game or the canvas is
  // the specific hack this test exists to keep out.
  const css = page.slice(page.indexOf('<style>'), page.indexOf('</style>'))
  assert.doesNotMatch(css, /transform\s*:/, 'index.html applies a CSS transform')
  assert.doesNotMatch(css, /\brotate\b/, 'index.html rotates something')
  assert.doesNotMatch(css, /-webkit-transform/, 'index.html applies a prefixed transform')

  // And no code may set one at runtime either.
  for (const { path, body } of allSources()) {
    // The rotate gate's own icon animates a phone *inside an SVG*, which is
    // art, not a transform on the canvas. Everything else is out of bounds.
    const code = path === 'systems/Orientation.ts'
      ? body.slice(0, body.indexOf('function styles()'))
      : body
    assert.doesNotMatch(code, /style\.transform\s*=/, `${path} sets a transform in script`)
    assert.doesNotMatch(code, /webkitTransform/, `${path} sets a prefixed transform in script`)
    assert.doesNotMatch(code, /screen\.orientation\.lock/, `${path} tries to lock the orientation`)
  }
})

test('the canvas fills the true viewport with no letterbox', () => {
  const css = page.slice(page.indexOf('<style>'), page.indexOf('</style>'))
  assert.match(css, /#game\s*\{[^}]*width:\s*100vw/, '#game does not span the viewport width')
  assert.match(css, /#game\s*\{[^}]*height:\s*100dvh/,
    'without dvh the canvas is the wrong height while Safari\'s URL bar collapses')
  const config = src('config.ts')
  assert.match(config, /Phaser\.Scale\.NONE/, 'a fixed scale mode letterboxes instead of filling')
  // NONE only fills because Resolution sizes it to the parent every time.
  assert.match(src('systems/Resolution.ts'), /getBoundingClientRect/,
    'the canvas is sized from something other than the parent box it lives in')
})

test('portrait shows the gate and landscape does not', () => {
  // Driven by a media query rather than a listener: the overlay is then correct
  // on the frame the viewport changes shape, with no event to fire late and no
  // state to get stuck in.
  assert.match(gate, /@media \(orientation: portrait\)/, 'visibility is not driven by CSS')
  assert.match(gate, /display: flex/, 'the portrait rule does not show anything')
  assert.match(gate, /export function isPortrait/, 'no orientation test for the script side to use')
  // Still the viewport's shape rather than a device API that can be locked —
  // but asked through the media query, so it is the SAME shape the overlay
  // reads. See 'the pause and the overlay ask the same question'.
  assert.match(gate, /window\.innerHeight > window\.innerWidth/,
    'no fallback for an environment without matchMedia')
})

/**
 * A FAKE SCENE MANAGER, so the gate's control flow can actually be run.
 *
 * Every test below used to be a regular expression over the source. They all
 * passed while a player's run froze solid: the words `game.scene.resume(key)`
 * were in the file, in a branch that a stale viewport reading could not reach.
 * Matching source text cannot tell you which lines run.
 */
function fakeHost(running: string[]) {
  const paused = new Set<string>()
  const calls: string[] = []
  return {
    paused,
    calls,
    host: {
      running: () => running.filter((k) => !paused.has(k)),
      isPaused: (k: string) => paused.has(k),
      pause: (k: string) => { paused.add(k); calls.push('pause:' + k) },
      resume: (k: string) => { paused.delete(k); calls.push('resume:' + k) },
    },
  }
}

/** Portrait for `n` frames. The gate needs ENTER_FRAMES of them to commit. */
function portraitFor(g: OrientationGate, h: ReturnType<typeof fakeHost>, n: number) {
  for (let i = 0; i < n; i++) g.sync(true, h.host)
}

test('the gate pauses the game, and resumes only what it paused', () => {
  const g = new OrientationGate()
  const h = fakeHost(['Boot', 'Game', 'Hud'])
  portraitFor(g, h, ENTER_FRAMES)
  assert.deepEqual([...h.paused].sort(), ['Game', 'Hud'], 'the gate did not pause the run')
  // Boot is the loader; pausing it mid-preload stalls the download.
  assert.ok(!h.paused.has('Boot'), 'pausing the loader stalls the download behind the overlay')

  g.sync(false, h.host)
  assert.deepEqual([...h.paused], [], 'the gate did not hand the run back')
})

test('the gate never resumes a scene the game paused itself', () => {
  // The trap: the game pauses GameScene for its own pause dialog. A gate that
  // resumed everything it found would restart a run the player stopped.
  const h = fakeHost(['Game', 'Hud'])
  h.host.pause('Game')
  const g = new OrientationGate()
  portraitFor(g, h, ENTER_FRAMES)
  assert.deepEqual(g.holding, ['Hud'], 'the gate claimed a scene it did not pause')
  g.sync(false, h.host)
  assert.ok(h.paused.has('Game'), 'the gate resumed a run the player had deliberately paused')
  assert.ok(!h.paused.has('Hud'), 'the gate failed to resume what it did pause')
})

test('a scene that starts while portrait is caught', () => {
  // The boot chain runs Boot -> Splash -> Title behind the overlay, and each
  // one arrives running. Listening for scene create events does not work: when
  // the gate installs, the scene manager has only queued them from the config.
  const g = new OrientationGate()
  const h = fakeHost(['Splash'])
  portraitFor(g, h, ENTER_FRAMES)
  assert.deepEqual([...h.paused], ['Splash'])
  // Title starts behind the overlay two frames later.
  h.host.running = () => ['Title'].filter((k) => !h.paused.has(k))
  g.sync(true, h.host)
  assert.ok(h.paused.has('Title'), 'a scene that started behind the overlay was left running')
})

/**
 * THE SOFT LOCK. A player froze mid-run on level 1: no input anywhere, enemies
 * stopped mid-lane, no crash and no report.
 *
 * The gate paused from a per-frame hook and resumed only from a resize
 * listener. iOS reports the old viewport for a frame or two around a rotation
 * — the gate's own comments say so — so one stale frame latched a pause that
 * no event would ever undo, behind an overlay the CSS had already hidden.
 */
test('a single stale portrait frame cannot latch a pause', () => {
  const g = new OrientationGate()
  const h = fakeHost(['Game', 'Hud'])
  // One frame of the device mis-reporting itself, mid-landscape.
  g.sync(true, h.host)
  g.sync(false, h.host)
  assert.deepEqual([...h.paused], [], 'a stale frame froze the run')
  assert.deepEqual(g.holding, [], 'the gate is still holding scenes it will never release')
})

test('a stale frame partway to the gate still releases', () => {
  // Belt and braces: even if a transient runs long enough to take a pause on
  // the way to ENTER_FRAMES, leaving portrait hands it straight back.
  assert.ok(ENTER_FRAMES > 1, 'entering must be debounced or a transient is believed')
  const g = new OrientationGate()
  const h = fakeHost(['Game'])
  portraitFor(g, h, ENTER_FRAMES)
  assert.ok(h.paused.has('Game'))
  g.sync(false, h.host)
  assert.deepEqual([...h.paused], [], 'the gate held a pause after the viewport came back')
})

test('leaving portrait is immediate and entering it is not', () => {
  // The asymmetry points the safe way: slow to take control, instant to give
  // it back. The old code had it exactly the other way round.
  const g = new OrientationGate()
  const h = fakeHost(['Game'])
  for (let i = 0; i < ENTER_FRAMES - 1; i++) {
    g.sync(true, h.host)
    assert.deepEqual([...h.paused], [], `committed after ${i + 1} frame(s); a transient is enough`)
  }
  g.sync(true, h.host)
  assert.deepEqual([...h.paused], ['Game'], 'a real rotation never gated')
  assert.equal(g.sync(false, h.host), 'lowered', 'leaving took more than one frame')
})

test('the pause and the overlay ask the same question', () => {
  // The overlay is shown by `@media (orientation: portrait)`. The script used
  // to ask `innerHeight > innerWidth`, which is a different predicate that
  // agrees almost always and disagrees exactly when it matters — and the
  // disagreement paused the game while hiding the overlay explaining why.
  assert.match(gate, /@media \(orientation: portrait\)/, 'visibility is not driven by CSS')
  assert.match(gate, /matchMedia\?\.\('\(orientation: portrait\)'\)/,
    'the script asks a different question from the stylesheet')
  const post = gate.slice(gate.indexOf('POST_STEP'))
  assert.doesNotMatch(post.slice(0, 200), /pauseRunning/,
    'the per-frame hook must run the whole decision, not just the pausing half')
})

test('the gate can be made to hand everything back', () => {
  // The recovery path the stuck guard pulls when a run is frozen and the gate
  // is a suspect.
  const g = new OrientationGate()
  const h = fakeHost(['Game', 'Hud'])
  portraitFor(g, h, ENTER_FRAMES)
  assert.deepEqual(g.forceRelease(h.host).sort(), ['Game', 'Hud'])
  assert.deepEqual([...h.paused], [], 'forceRelease left something paused')
  assert.equal(g.raised, false)
})


test('an orientation change re-measures more than once', () => {
  // iOS reports the old viewport for a frame or two either side of a rotation.
  // Believing the first number is how a phone ends up with a landscape-sized
  // canvas in a portrait window and every pointer coordinate scaled wrong.
  assert.match(gate, /orientationchange/, 'no orientation change listener')
  assert.match(gate, /visualViewport/, "iOS's URL bar collapse raises no plain resize event")
  assert.match(gate, /requestAnimationFrame\(measure\)/, 'only one measurement is taken')
  assert.match(gate, /setTimeout\(measure/, 'no late re-measure, so a slow rotate is missed')
  assert.match(gate, /applyResolution\(game\)/, 'nothing tells the scale manager to re-read')
  // refresh() no longer resizes anything: under NONE it re-reads bounds and
  // stops. Calling it here would look right and do nothing.
  assert.doesNotMatch(gate, /game\.scale\.refresh\(\)/,
    'refresh() does not resize the canvas under the NONE scale mode')
  // The measurement must still come from the parent, not the window: the
  // parent is 100dvh and the two disagree while Safari's URL bar collapses.
  assert.doesNotMatch(src('systems/Resolution.ts'), /resize\(\s*(globalThis|window)\.innerWidth/,
    'forcing window dimensions overrides the parent box the canvas actually lives in')
})

test('the gate is installed on the real boot path', () => {
  assert.match(src('main.ts'), /installOrientationGate\(game\)/, 'the gate is never installed')
})
