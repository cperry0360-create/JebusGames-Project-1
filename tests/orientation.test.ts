import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

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
  assert.match(config, /Phaser\.Scale\.RESIZE/, 'a fixed scale mode letterboxes instead of filling')
})

test('portrait shows the gate and landscape does not', () => {
  // Driven by a media query rather than a listener: the overlay is then correct
  // on the frame the viewport changes shape, with no event to fire late and no
  // state to get stuck in.
  assert.match(gate, /@media \(orientation: portrait\)/, 'visibility is not driven by CSS')
  assert.match(gate, /display: flex/, 'the portrait rule does not show anything')
  assert.match(gate, /export function isPortrait/, 'no orientation test for the script side to use')
  assert.match(gate, /window\.innerHeight > window\.innerWidth/,
    'orientation should come from the viewport shape, not a device API that can be locked')
})

test('the gate pauses the game, and resumes only what it paused', () => {
  assert.match(gate, /game\.scene\.pause\(key\)/, 'the game keeps running behind the overlay')
  assert.match(gate, /getScenes\(true\)/,
    'pausing must read the running scenes, or it resumes ones the game paused itself')
  assert.match(gate, /gatePaused/, 'nothing records which scenes the gate paused')
  // The trap: the game pauses GameScene itself for its own pause dialog. A gate
  // that resumed everything it found would restart a run the player stopped.
  const resume = gate.slice(gate.indexOf('for (const key of gatePaused)'))
  assert.match(resume, /game\.scene\.resume\(key\)/, 'nothing is ever resumed')
  assert.ok(gate.indexOf('gatePaused.clear()') > gate.indexOf('for (const key of gatePaused)'),
    'the record is cleared before it is used')
  // Boot is the loader; pausing it mid-preload stalls the download.
  assert.match(gate, /key === 'Boot'/, 'pausing the loader stalls it')
})

test('a scene that starts while portrait is caught', () => {
  // The boot chain runs Boot -> Splash -> Title behind the overlay. Syncing
  // only on resize left each new scene running, and listening for scene create
  // events does not work either: when the gate installs, the scene manager has
  // only queued the scenes from the config, so there is nothing to listen to.
  assert.match(gate, /POST_STEP/, 'nothing catches a scene that starts while the overlay is up')
  assert.match(gate, /if \(isPortrait\(\)\) pauseRunning\(\)/,
    'the per-frame check should do nothing at all in landscape')
})

test('an orientation change re-measures more than once', () => {
  // iOS reports the old viewport for a frame or two either side of a rotation.
  // Believing the first number is how a phone ends up with a landscape-sized
  // canvas in a portrait window and every pointer coordinate scaled wrong.
  assert.match(gate, /orientationchange/, 'no orientation change listener')
  assert.match(gate, /visualViewport/, "iOS's URL bar collapse raises no plain resize event")
  assert.match(gate, /requestAnimationFrame\(measure\)/, 'only one measurement is taken')
  assert.match(gate, /setTimeout\(measure/, 'no late re-measure, so a slow rotate is missed')
  assert.match(gate, /game\.scale\.refresh\(\)/, 'nothing tells the scale manager to re-read')
  // resize() to window dimensions would fight the 100dvh parent.
  assert.doesNotMatch(gate, /scale\.resize\(/,
    'forcing window dimensions overrides the parent box the canvas actually lives in')
})

test('the gate is installed on the real boot path', () => {
  assert.match(src('main.ts'), /installOrientationGate\(game\)/, 'the gate is never installed')
})
