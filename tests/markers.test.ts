import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  arrowAt, badgeWorldWidth, markersFor, type MarkerConfig,
} from '../src/systems/Markers.ts'
import { LEVELS, loadLevel } from '../src/systems/Levels.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const CFG = read('markers') as MarkerConfig
const DISPLAY = read('display')
const ART = read('art')
const BW = badgeWorldWidth(CFG, DISPLAY.camera.defaultZoom)
const PLATE = { width: DISPLAY.width, height: DISPLAY.height }
const of = (id: string) => markersFor(loadLevel(id).map, CFG, BW, PLATE)

test('every way in and every way out of every level gets exactly one marker', () => {
  // DERIVED, NOT AUTHORED, so this is a table of what the maps say rather than
  // a list anybody maintains. A level added tomorrow appears here by itself.
  const counts: Record<string, string> = {}
  for (const d of LEVELS) {
    const m = of(d.id)
    counts[d.id] = `${m.filter((x) => x.kind === 'spawn').length}S `
      + `${m.filter((x) => x.kind === 'exit').length}E`
  }
  assert.deepEqual(counts, {
    level1: '1S 1E', level2: '1S 1E', level3: '2S 1E', level4: '2S 1E',
    // LEVEL 5's three ways in: the west mouth and the two that come out of the
    // top and bottom edges.
    level5: '3S 1E',
    // LEVEL 6's THIRD SPAWN IS THE ONE THAT CAUGHT THE RULE. `lower` is a
    // second independent entrance AND is fed by `flank`, the sneaky bottom-edge
    // lane -- so "a spawn is a lane nothing merges into" silently dropped it
    // and drew two badges where the board has three.
    level6: '3S 2E',
    level7: '3S 3E',
    // LEVEL 8: one way in, two ways out.
    level8: '1S 2E',
    // LEVEL 9: two entrance lanes that SHARE one painted mouth, so one badge,
    // and one exit that is a door in the middle of the map rather than a frame
    // edge -- still an exit, still marked.
    level9: '1S 1E',
  }, 'a level gained or lost a way in or out and the markers did not follow')
})

test('the shared trunk is not a spawn, however laneDefs flags it', () => {
  // `laneDefs` puts `entrance: true` on whichever lane is main, unconditionally.
  // On levels 3, 4 and 5 main is the TRUNK the two arms merge into and it
  // starts in the middle of the board, so reading that flag literally puts a
  // spawn badge on a join. Level 3's would have been at (733, 378).
  for (const id of ['level3', 'level4', 'level5']) {
    const spawns = of(id).filter((m) => m.kind === 'spawn')
    for (const s of spawns) {
      assert.ok(!s.lanes.includes(loadLevel(id).map.mainId as string),
        `${id}: the trunk is marked as a spawn at ${Math.round(s.x)},${Math.round(s.y)}`)
    }
  }
})

test('two lanes out of one mouth draw one badge', () => {
  const nine = of('level9').filter((m) => m.kind === 'spawn')
  assert.equal(nine.length, 1, 'level 9 draws a badge per entrance lane rather than per mouth')
  assert.deepEqual([...nine[0]!.lanes].sort(), ['north', 'south'],
    'the one badge does not stand for both arms')
  // And it must NOT fire on two markers a player reads as separate: level 8's
  // two exits are 437px apart and both keep their own.
  assert.equal(of('level8').filter((m) => m.kind === 'exit').length, 2)
})

test('every badge lands on the painted plate', () => {
  // Waypoints run off the frame deliberately, so 29 of the 30 derived markers
  // start outside 1280x720 -- and the world camera is clamped to the plate
  // horizontally, so an unclamped badge is not off to one side, it is
  // unreachable. See `clampToPlate`.
  for (const d of LEVELS) {
    for (const m of of(d.id)) {
      assert.ok(m.x >= BW / 2 - 0.001 && m.x <= PLATE.width - BW / 2 + 0.001
        && m.y >= BW / 2 - 0.001 && m.y <= PLATE.height - BW / 2 + 0.001,
      `${d.id}: a ${m.kind} badge sits at ${Math.round(m.x)},${Math.round(m.y)}, off the plate`)
    }
  }
})

test('the arrow points the way the walk goes, at both ends', () => {
  // A SPAWN ARROW POINTS IN AND AN EXIT ARROW POINTS OUT, and both fall out of
  // the same rule -- the lane's direction of travel -- rather than from a sign
  // flip anybody has to remember. Checked against the plate's middle: a spawn's
  // arrow gets closer to it, an exit's gets further away.
  const mid = { x: PLATE.width / 2, y: PLATE.height / 2 }
  for (const d of LEVELS) {
    for (const m of of(d.id)) {
      const a = arrowAt(m, BW, CFG)
      const badge = Math.hypot(m.x - mid.x, m.y - mid.y)
      const arrow = Math.hypot(a.x - mid.x, a.y - mid.y)
      if (m.kind === 'spawn') {
        assert.ok(arrow < badge,
          `${d.id}: a spawn arrow points away from the board (${arrow.toFixed(0)} vs ${badge.toFixed(0)})`)
      } else {
        assert.ok(arrow > badge,
          `${d.id}: an exit arrow points back into the board (${arrow.toFixed(0)} vs ${badge.toFixed(0)})`)
      }
    }
  }
})

test('the arrow sits 0.736 badge widths along the lane, and the badge never turns', () => {
  const m = of('level1')[0]!
  const a = arrowAt(m, BW, CFG)
  assert.ok(Math.abs(Math.hypot(a.x - m.x, a.y - m.y) - BW * CFG.arrowOffset) < 1e-6,
    'the arrow is not at arrowOffset badge widths from the badge centre')
  assert.equal(CFG.arrowOffset, 0.736, 'the offset that reproduces the original render moved')
  // The badge carries no angle of its own; only the arrow reads `angle`.
  assert.ok(!('rotation' in m), 'a marker carries a badge rotation, which it must not')
})

test('the size is authored in screen pixels and derived into world units', () => {
  assert.equal(CFG.badgeScreenWidth, 40, 'the badge is no longer 40 CSS px at default zoom')
  assert.equal(CFG.alpha, 1, 'the layer ships faded')
  assert.ok(Math.abs(BW - 40 / DISPLAY.camera.defaultZoom) < 1e-9,
    'the world width is not derived from the screen width')
  // The four files, and their content boxes measured rather than assumed.
  for (const k of ['markerSpawn', 'markerSpawnArrow', 'markerExit', 'markerExitArrow']) {
    const key = ART.prop[k]
    assert.ok(key, `art.json names no prop for ${k}`)
    assert.ok(ART.files[key], `${k} points at ${key}, which is not a file`)
    const r = ART.render[key]
    assert.ok(r && r.contentWidth > 0 && r.contentHeight > 0,
      `${key} has no measured content box, so fitting it divides by a guess`)
    assert.ok(ART.levelArt.shared.includes(key),
      `${key} is not level art, so boot downloads it`)
  }
})
