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
    // LEVEL 8 AFTER THE RE-TOPOLOGY: two ways in, one way out. It shipped the
    // other way round -- one western mouth and two exits -- and the
    // Performance Review stood on one of the two exits, where 10.6 of 239
    // enemies a run ever reached it.
    level8: '2S 1E',
    // LEVEL 9: two entrance lanes that SHARE one painted mouth, so one badge,
    // and one exit that is a door in the middle of the map rather than a frame
    // edge -- still an exit, still marked.
    level9: '1S 1E',
    // LEVEL 10: ONE LANE, ONE WAY IN, ONE WAY OUT, and both badges are derived
    // from the lane like every other level's rather than placed. The plate
    // draws a piece of machine housing OVER the lane at each frame edge, so
    // tools/trace_level10.py bridges the housing before it walks the
    // centreline -- which is why the lane reaches the frame at all and why
    // these two badges land on the mouths a player can see.
    level10: '1S 1E',
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
  // two MOUTHS are at opposite edges of the plate and both keep their own.
  const eight = of('level8').filter((m) => m.kind === 'spawn')
  assert.equal(eight.length, 2, 'level 8\'s two entrances collapsed into one badge')
  assert.ok(Math.hypot(eight[0]!.x - eight[1]!.x, eight[0]!.y - eight[1]!.y) > 1000,
    'level 8\'s two mouths are not at opposite edges any more')
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
  // 0.7 SINCE 2026-09-14. This used to pin 1.0 with the message "the layer
  // ships faded", which was the right guard while 1.0 was the deliberate
  // un-judged value; live play has now judged it. The guard that replaces it
  // is a BAND: the badges are navigational furniture, so they may not be at
  // full strength and they may not be so faint that a player cannot find the
  // mouth.
  assert.ok(CFG.alpha >= 0.5 && CFG.alpha < 1,
    `the badge alpha is ${CFG.alpha}; furniture sits below 1 and above 0.5`)
  assert.equal(CFG.alpha, 0.7, 'the shipped badge alpha moved without this note moving')
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

test('every badge and its arrow sit fully inside the painted plate', () => {
  /*
   * THE FAULT THIS REPLACES, AND IT WAS VISIBLE IN PLAY. Markers sat on the
   * first and last waypoint of each lane, which are the computed GATEWAY
   * points -- (-60, y) and (1340, y) -- so `clampToPlate` was pulling 27 of the
   * 32 badges onto the frame by force. A clamped badge's own rectangle is
   * inside by construction; its ARROW is not, because the arrow sits 0.736
   * badge widths further along the direction of travel, which at an exit points
   * OUT. 15 of the 32 markers had a piece off the plate, worst 10.6 px.
   *
   * `insetBadgeWidths` walks the badge along its own lane instead. This is the
   * property that chose the value: 5.871 badge widths is the smallest at which
   * nothing is outside, and 6.0 ships. Measured here rather than quoted, so a
   * re-trace, a new level or a resized badge has to come back to this number.
   *
   * THE ARROW IS ROTATED, so its bounding box is the rotated one. Checking the
   * unrotated rectangle passes at 5.0 and is wrong: level 3's exit arrow leaves
   * at -49 degrees, where the rotated box is 40% wider than the sprite.
   */
  const dim = (k: string): { w: number; h: number } => {
    const r = ART.render[ART.prop[k]]
    return { w: r.contentWidth as number, h: r.contentHeight as number }
  }
  const BADGE = { spawn: dim('markerSpawn'), exit: dim('markerExit') }
  const ARROW = { spawn: dim('markerSpawnArrow'), exit: dim('markerExitArrow') }
  const box = (x: number, y: number, w: number, h: number, a: number) => {
    const c = Math.abs(Math.cos(a)), s2 = Math.abs(Math.sin(a))
    const bw = w * c + h * s2, bh = w * s2 + h * c
    return { x0: x - bw / 2, y0: y - bh / 2, x1: x + bw / 2, y1: y + bh / 2 }
  }
  const over = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    Math.max(-b.x0, -b.y0, b.x1 - PLATE.width, b.y1 - PLATE.height, 0)

  let seen = 0
  for (const d of LEVELS) {
    for (const m of of(d.id)) {
      seen++
      const scale = BW / BADGE[m.kind].w
      const badge = box(m.x, m.y, BW, BADGE[m.kind].h * scale, 0)
      const at = arrowAt(m, BW, CFG)
      const arrow = box(at.x, at.y, ARROW[m.kind].w * scale, ARROW[m.kind].h * scale, m.angle)
      assert.equal(over(badge).toFixed(1), '0.0',
        `${d.id} ${m.kind} (${m.lanes.join('+')}): the badge hangs `
        + `${over(badge).toFixed(1)} px off the plate at (${m.x.toFixed(0)}, ${m.y.toFixed(0)})`)
      assert.equal(over(arrow).toFixed(1), '0.0',
        `${d.id} ${m.kind} (${m.lanes.join('+')}): the ARROW hangs `
        + `${over(arrow).toFixed(1)} px off the plate at (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`)
    }
  }
  assert.equal(seen, 32, `${seen} markers were checked, not 32`)
})

test('the inset moves a gateway badge and leaves an interior exit alone', () => {
  // THE SCOPE OF THE INSET, which is the one judgement in it. Its job is the
  // computed gateway points off the edge of the plate; an exit already inside
  // the plate is where the badge belongs, because the badge means "they get out
  // HERE". A uniform inset walks level 9's door 140 px back up the road to
  // (1064, 274), which points it at a piece of lane that is not the exit.
  assert.ok((CFG.insetBadgeWidths ?? 0) > 0, 'the inset is off')
  const door = of('level9').find((m) => m.kind === 'exit')!
  assert.deepEqual([Math.round(door.x), Math.round(door.y)], [1177, 329],
    'level 9\'s interior door badge has moved off the door')
  // And a gateway one HAS moved: level 7's north lane runs from (-60, 151) and
  // the badge is 140 px along it.
  const gate = of('level7').find((m) => m.kind === 'spawn' && m.lanes.includes('north'))!
  assert.ok(gate.x > 60, `level 7's north spawn badge is at x=${gate.x}, still off the plate`)
  // THE SHARED MOUTH STILL MERGES. Level 9's two entrance lanes are traced from
  // one point; insetting both along their own lanes could pull them apart, and
  // at about 8 badge widths it does. At 6.0 they are still one badge.
  assert.equal(of('level9').filter((m) => m.kind === 'spawn').length, 1,
    'level 9 draws two spawn badges on one painted mouth again')
})
