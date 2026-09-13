/**
 * A MODAL FLAG MAY NOT OUTLIVE THE RUN THAT SET IT.
 *
 * THE SOFT LOCK THIS GUARDS. Phaser builds one instance of each scene and
 * re-runs `create()` on it for every run, so a field is only as fresh as the
 * code that resets it. `HudScene.paused` was reset by exactly one path --
 * CONTINUE -- and the other two ways out of the settings panel, RESTART and
 * HOME, both stopped the scene with it still set. The next run then started
 * with `HudScene.modalOpen` true, and that is what `GameScene.chromeUnderPointer`
 * asks before acting on ANY press: every tap on the board was answered as a tap
 * on chrome, so no tower could be placed, no special could be cast and the
 * hero could not be ordered -- while the waves, which start themselves on a
 * countdown, went on spawning and the counters went on ticking. Nothing was
 * drawn and nothing threw. See reports/2026-09-13-level-8-soft-lock.md.
 *
 * DERIVED, NOT LISTED. Both `modalOpen` getters are read out of the source and
 * every field they name has to be reset, so a fifth overlay added next year is
 * covered by this test on the day it is written rather than on the day
 * somebody remembers to add it here.
 *
 * Source-as-text, because both files import Phaser and nothing in `tests/` can
 * execute that -- see CLAUDE.md.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const GAME = src('scenes/GameScene.ts')
const HUD = src('scenes/HudScene.ts')

/** The body of a method, from its signature to its matching brace. */
function methodBody(source: string, signature: string): string {
  const at = source.indexOf(signature)
  assert.ok(at >= 0, `${signature} is not in the source any more`)
  let depth = 0
  for (let i = source.indexOf('{', at); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(at, i + 1)
    }
  }
  assert.fail(`${signature} has no closing brace`)
}

/** Every `this.<field>` the modal getter's answer depends on. */
function modalFields(source: string): string[] {
  const body = methodBody(source, 'get modalOpen(): boolean {')
  const found = [...body.matchAll(/this\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!)
  const fields = [...new Set(found)]
  assert.ok(fields.length > 0, 'modalOpen names no fields; the getter has changed shape')
  return fields
}

test('every modal GameScene counts is dropped when a run starts', () => {
  const create = methodBody(GAME, 'create(): void {')
  for (const f of modalFields(GAME)) {
    assert.match(create, new RegExp(`this\\.${f}\\s*=`),
      `GameScene.modalOpen reads \`${f}\`, and create() never clears it — a run that ended `
      + 'with that overlay up makes the NEXT run\'s board chrome to every press')
  }
})

test('every modal HudScene counts is dropped when the HUD starts', () => {
  const create = methodBody(HUD, 'create(): void {')
  for (const f of modalFields(HUD)) {
    assert.match(create, new RegExp(`this\\.${f}\\s*=`),
      `HudScene.modalOpen reads \`${f}\`, and create() never clears it — this is the level 8 `
      + 'soft lock exactly: a flag left set by the last run, and a dead board on the next')
  }
})

test('every way out of the pause menu lets go of the pause', () => {
  // CONTINUE was the only one that did. RESTART and HOME are the two that are
  // reached from a player who has decided this run is over, which is precisely
  // the player who is about to start another one.
  for (const exit of ['restartRun', 'quitToTitle']) {
    const body = methodBody(HUD, `private ${exit}(): void {`)
    assert.match(body, /releaseHudModals\(\)/,
      `HudScene.${exit} leaves the run without releasing the HUD's own modal state`)
  }
  const resume = methodBody(HUD, 'private resumeGame(): void {')
  assert.match(resume, /this\.paused = false/, 'CONTINUE no longer clears `paused`')
})

test('the HUD cannot shut down still holding a pause', () => {
  // The exit nobody thought of: `relayout()` restarts this scene on a resize,
  // which on a phone is a rotate or a URL bar collapsing. A settings panel open
  // across one of those used to leave `paused` set with the panel destroyed --
  // and `openSettings` guards on `this.paused && this.settings`, so the gear
  // that is the only way back was dead as well as the board.
  const create = methodBody(HUD, 'create(): void {')
  assert.match(create, /events\.once\('shutdown',[\s\S]{0,60}?releaseHudModals/,
    'nothing releases the HUD\'s pause on shutdown, so a scene stopped by any path '
    + 'that is not RESTART, HOME or CONTINUE hands the next run a dead board')
  const release = methodBody(HUD, 'private releaseHudModals(): void {')
  assert.match(release, /isPaused\('Game'\)/,
    'releaseHudModals must ask before resuming the world: it is called on shutdown, '
    + 'and QUIT has already stopped GameScene by then')
  assert.match(release, /this\.paused = false/, 'releaseHudModals does not clear `paused`')
})
