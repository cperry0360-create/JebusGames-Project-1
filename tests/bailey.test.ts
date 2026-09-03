import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  appearanceMs, peekRise, pickSpot, rollGap, type PeekConfig,
} from '../src/systems/PeekSchedule.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const art = read('art'), presentation = read('presentation'), map = read('map')
const CFG = presentation.bailey as PeekConfig & { worldHeight: number }

/** A deterministic stand-in for Math.random that walks [0, 1). */
const ramp = (n: number) => { let i = 0; return () => (i++ % n) / n }

test('she appears at most once a minute, and never on a schedule', () => {
  // The two rules that make her an easter egg rather than a decoration.
  assert.ok(CFG.minGapMs >= 60000, `a gap of ${CFG.minGapMs}ms is more than once a minute`)
  assert.ok(CFG.maxGapMs > CFG.minGapMs, 'a fixed gap is a schedule')
  assert.ok(CFG.maxGapMs / CFG.minGapMs >= 2,
    'the band is too narrow to stop the interval being learnable')

  const seen = new Set<number>()
  const r = ramp(50)
  for (let i = 0; i < 50; i++) {
    const g = rollGap(CFG, r)
    assert.ok(g >= CFG.minGapMs - 1e-9 && g <= CFG.maxGapMs + 1e-9, `gap ${g} is outside the band`)
    seen.add(Math.round(g))
  }
  assert.ok(seen.size > 30, `50 rolls produced only ${seen.size} distinct gaps`)
})

test('she never appears twice in the same spot', () => {
  // THE RULE MOST LIKELY TO BE GOT WRONG, because the obvious implementation
  // is to re-roll until the index differs, which loops forever on one spot
  // and is biased on two.
  // TWO, not three or four. The plate has exactly two places outside the HUD
  // band where painted foliage runs across her whole width below a visible top
  // edge; two convincing spots beat four that need explaining.
  const n = map.baileySpots.spots.length
  assert.ok(n >= 2, `only ${n} peek spots; she would come up in the same one twice`)
  const r = ramp(37)
  let prev = -1
  for (let i = 0; i < 400; i++) {
    const next = pickSpot(n, prev, r)
    assert.ok(next >= 0 && next < n, `picked ${next} out of ${n}`)
    if (prev >= 0) assert.notEqual(next, prev, 'she came up in the same gap twice')
    prev = next
  }
})

test('the spot picker covers every spot and terminates on degenerate lists', () => {
  const r = ramp(23)
  const hit = new Set<number>()
  let prev = -1
  for (let i = 0; i < 500; i++) { prev = pickSpot(4, prev, r); hit.add(prev) }
  assert.deepEqual([...hit].sort(), [0, 1, 2, 3], 'some spots are never used')
  // One spot: it has to return that spot rather than spin looking for another.
  assert.equal(pickSpot(1, 0, () => 0.99), 0)
  assert.equal(pickSpot(0, -1, () => 0.5), -1)
})

test('the appearance is a rise, a hold and a drop, and then it is over', () => {
  assert.ok(CFG.riseMs > 0 && CFG.holdMs > 0 && CFG.dropMs > 0)
  assert.equal(peekRise(-1, CFG), null)
  assert.equal(peekRise(0, CFG), 0)
  assert.equal(peekRise(CFG.riseMs, CFG), 1, 'she is not fully up at the top of the rise')
  assert.equal(peekRise(CFG.riseMs + CFG.holdMs - 1, CFG), 1, 'the hold does not hold')
  const end = appearanceMs(CFG)
  assert.equal(peekRise(end, CFG), null, 'she never goes away')
  assert.equal(peekRise(end + 5000, CFG), null)
  // Monotonic up, then monotonic down: no wobble at the joins.
  let last = -1
  for (let t = 0; t <= CFG.riseMs; t += 20) {
    const v = peekRise(t, CFG)!
    assert.ok(v >= last - 1e-9, `the rise goes backwards at ${t}ms`)
    last = v
  }
  last = 2
  for (let t = CFG.riseMs + CFG.holdMs; t < end; t += 20) {
    const v = peekRise(t, CFG)!
    assert.ok(v <= last + 1e-9, `the drop goes backwards at ${t}ms`)
    last = v
  }
})

test('she is on screen for well under two seconds', () => {
  // Long enough to notice, short enough that nobody waits for her.
  const ms = appearanceMs(CFG)
  assert.ok(ms >= 1500 && ms <= 2600, `an appearance lasts ${ms}ms`)
})

test('only the top half of her clears the canopy', () => {
  // Any more and she reads as a dog sitting on top of a tree.
  /*
   * MEASURED OFF HER ART, not chosen. On the 872px source the eyes span 40-54%
   * of the height, the nose 60-66% and the collar starts at 69%. The line has
   * to fall below the eyes and above the collar: any less and she is two ears,
   * any more and she is a whole dog sitting on a bush.
   *
   * Wrong in both directions before this — 0.5 cut the eyes in half and read
   * as a severed sprite, 0.33 put them under the line entirely.
   */
  assert.ok(CFG.peakVisible > 0.55, `${CFG.peakVisible} leaves her eyes under the foliage`)
  assert.ok(CFG.peakVisible < 0.69, `${CFG.peakVisible} shows her collar and chest`)
})

test('the peek spots are on the plate, in the top left, and far apart', () => {
  const display = read('display')
  const spots = map.baileySpots.spots as Array<{ x: number; canopyY: number }>
  for (const s of spots) {
    // ON SCREEN AND CLEAR OF THE HUD, which the top-left forest is not: the
    // opening camera shows world y 94 downward and the HUD band covers world
    // y 94..218, so every spot in that forest was behind the peanut counter.
    assert.ok(s.x > 0 && s.x < display.width, `a spot at x ${s.x} is off the plate`)
    assert.ok(s.canopyY > 232 && s.canopyY < 660,
      `a spot at y ${s.canopyY} is under the HUD band or below the visible map`)
  }
  // Far enough apart that two consecutive appearances cannot overlap.
  const w = CFG.worldHeight
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      assert.ok(Math.abs(spots[i]!.x - spots[j]!.x) >= w * 0.4,
        `the spots at x ${spots[i]!.x} and ${spots[j]!.x} are the same spot to look at`)
    }
  }
})

test('her art is an optional hook, so an absent file is not a broken build', () => {
  const key = art.prop.baileyPeek
  assert.ok(key, 'no prop role for Bailey')
  assert.ok(art.files[key], `${key} is not in the manifest`)
  assert.ok((art.optional ?? []).includes(key),
    `${key} is required art, so the build breaks until the file lands — and she ` +
    'does nothing, so absent should mean absent rather than a placeholder')
  // No render config: she is placed by world height from presentation.json.
  assert.equal(art.render[key], undefined)
  // Recorded either way, so the report can say which state the repo is in.
  const path = url(`../public/${art.assetRoot}${art.files[key]}`)
  void existsSync(path)
})

test('she does nothing: no input, no sound, no reward', () => {
  // The brief, as an assertion. This is the part most likely to be "improved".
  const src = readFileSync(url('../src/entities/Bailey.ts'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
    .join('\n')
  // `on(` on its own matches setPosition, so the listener check is anchored.
  for (const bad of ['setInteractive', 'playEffect', 'peanuts', 'scene.input',
    '.on(', '.emit(', 'AudioManager', 'status.message']) {
    assert.ok(!src.includes(bad), `Bailey now uses ${bad}; she is supposed to do nothing`)
  }
})
