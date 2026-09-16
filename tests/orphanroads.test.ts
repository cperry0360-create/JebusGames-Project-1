// PAINTED ROAD THAT NO LANE WALKS, on every level, as a number with a ceiling.
//
// THIS EXISTS BECAUSE THREE ORPHAN ROADS WERE FOUND BY EYE and nothing in the
// repository could have found a fourth: level 8's dead gate segment, level 6's
// bottom opening, and level 9's dead-end spur. Each one was somebody looking at
// a picture. The lanes and the plate are two descriptions of the same road and
// nothing compared them.
//
// HOW IT WORKS WITHOUT A DECODER. There is no WebP decoder in node and
// `npm install` answers 403 here, so the test cannot open a plate. It does not
// need to: `tools/orphan_roads.py` thresholds each plate with that level's own
// classifier and writes the result to tests/fixtures/road-masks.json, and this
// measures that mask against the LIVE map JSON. So the half that drifts —
// somebody moves a lane, splits one, or adds a level — is the half this reads
// fresh, and the half that only changes when the art changes is the fixture.
// Re-run `python3 tools/orphan_roads.py --write` after touching a plate.
//
// The fixture carries only the components a lane centreline touches; a cyan
// cooling-tower vent that is not connected to the trace is not an orphan road,
// it is the classifier matching something else. The tool's header says why.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import map1 from '../src/data/map.json' with { type: 'json' }
import map2 from '../src/data/map_level2.json' with { type: 'json' }
import map3 from '../src/data/map_level3.json' with { type: 'json' }
import map4 from '../src/data/map_level4.json' with { type: 'json' }
import map5 from '../src/data/map_level5.json' with { type: 'json' }
import map6 from '../src/data/map_level6.json' with { type: 'json' }
import map7 from '../src/data/map_level7.json' with { type: 'json' }
import map8 from '../src/data/map_level8.json' with { type: 'json' }
import map9 from '../src/data/map_level9.json' with { type: 'json' }
import map10 from '../src/data/map_level10.json' with { type: 'json' }

interface LaneMap { waypoints: number[][]; lanes?: { waypoints: number[][] }[] }
const MAPS: Record<string, LaneMap> = {
  level1: map1 as LaneMap, level2: map2 as LaneMap, level3: map3 as LaneMap,
  level4: map4 as LaneMap, level5: map5 as LaneMap, level6: map6 as LaneMap,
  level7: map7 as LaneMap, level8: map8 as LaneMap, level9: map9 as LaneMap,
  level10: map10 as LaneMap,
}

interface MaskLevel {
  plate: string; map: string; scale: number; w: number; h: number
  painted: number; rows: string[]
}
const FIXTURE = JSON.parse(readFileSync(
  new URL('./fixtures/road-masks.json', import.meta.url), 'utf8')) as {
    _radius: number; levels: Record<string, MaskLevel>
  }

/** How far a painted pixel has to be from every lane to count as orphaned. */
const RADIUS = FIXTURE._radius

/**
 * What share of a level's painted road may have no lane near it.
 *
 * THREE PER CENT IS THE RULE and the exceptions are listed, not defaulted: a
 * level that is not in this table gets the rule. An exception is a road
 * somebody looked at and decided to leave, and it carries the reason, so the
 * next session does not have to re-derive whether it is a finding.
 */
const CEILING = 3.0
const ALLOWED: Record<string, { pct: number; why: string }> = {
  // THE BYPASS ACROSS THE MIDDLE OF THE BOARD, and it is the direct
  // consequence of a decision already taken and already pinned by
  // tests/level6map.test.ts. The plate MERGES level 6's two lanes and runs
  // them together to the east exit; the level is designed as two independent
  // roads, so `map_level6.json` authors an 82 px join from (591, 393) to
  // (592, 475) that drops the south lane onto the lower band instead. The
  // painted stretch the join steps over -- x 650-990, y 364-448 -- is what
  // this counts. It is orphaned BY DESIGN, and putting a lane back on it
  // would undo the two-lane level.
  //
  // 8% rather than the measured 7.05% so a re-trace that moves the band by a
  // few pixels does not fail; anything that moves it by a percentage point
  // moved the road.
  level6: { pct: 8.0, why: 'the band the authored 82 px join steps over; see level6map.test.ts' },
}

const segDist = (px: number, py: number, a: number[], b: number[]): number => {
  const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]!) * dx + (py - a[1]!) * dy) / len2))
  return Math.hypot(a[0]! + t * dx - px, a[1]! + t * dy - py)
}

/** Every painted pixel in the mask, in world coordinates. */
function paintedPoints(m: MaskLevel): [number, number][] {
  const out: [number, number][] = []
  m.rows.forEach((row, y) => {
    if (!row) return
    for (const run of row.split(',')) {
      const [at, len] = run.split(':').map(Number) as [number, number]
      for (let i = 0; i < len; i++) out.push([(at + i) * m.scale, y * m.scale])
    }
  })
  return out
}

function orphanShare(level: string): { pct: number; worst: [number, number] | null; n: number } {
  const m = FIXTURE.levels[level]!
  const map = MAPS[level]!
  const lanes = [map.waypoints, ...(map.lanes ?? []).map((l) => l.waypoints)]
  const pts = paintedPoints(m)
  let orphans = 0
  let worst: [number, number] | null = null
  let worstD = 0
  for (const [x, y] of pts) {
    let best = Infinity
    for (const w of lanes) {
      for (let i = 1; i < w.length && best >= RADIUS; i++) {
        const d = segDist(x, y, w[i - 1]!, w[i]!)
        if (d < best) best = d
      }
      if (best < RADIUS) break
    }
    if (best >= RADIUS) {
      orphans++
      if (best > worstD) { worstD = best; worst = [x, y] }
    }
  }
  return { pct: (100 * orphans) / pts.length, worst, n: pts.length }
}

test('the fixture describes the maps this repository actually has', () => {
  assert.deepEqual(Object.keys(FIXTURE.levels).sort(), Object.keys(MAPS).sort())
  assert.equal(RADIUS, 60, 'the radius the fixture was measured at is not the one documented')
  for (const [id, m] of Object.entries(FIXTURE.levels)) {
    assert.ok(m.painted > 10000, `${id}'s mask has only ${m.painted} painted pixels`)
    assert.equal(m.w * m.scale, 1280, `${id}'s mask is not canvas width`)
    assert.equal(m.h * m.scale, 720, `${id}'s mask is not canvas height`)
    assert.equal(paintedPoints(m).length, m.painted, `${id}'s run-length encoding does not decode`)
  }
})

test('no level leaves more than a few percent of its painted road unwalked', () => {
  const report: string[] = []
  const failures: string[] = []
  for (const level of Object.keys(MAPS)) {
    const { pct, worst, n } = orphanShare(level)
    const allow = ALLOWED[level]
    const ceiling = allow?.pct ?? CEILING
    report.push(`${level} ${pct.toFixed(2)}% of ${n}` + (allow ? ` (allowed ${allow.pct}%)` : ''))
    if (pct > ceiling) {
      failures.push(
        `${level}: ${pct.toFixed(2)}% of its painted road has no lane within ${RADIUS} px, ` +
        `over the ${ceiling}% it is allowed. The furthest painted pixel from any lane is at ` +
        `(${worst?.[0]}, ${worst?.[1]}). Either put a lane on that road or, if it is meant to ` +
        'be decoration, add it to ALLOWED here with the reason.')
    }
  }
  assert.deepEqual(failures, [], `${failures.join('\n')}\n\nall ten: ${report.join(', ')}`)
})

test("level 9's flank put a lane back on the biggest orphan in the game", () => {
  // THE RECEIPT FOR THIS CHANGE. The spur read 10.33% before the flank lane
  // existed -- 16,024 world px of painted trace round the bottom right that
  // nothing walked, the largest orphan on any of the ten boards. Pinned at zero
  // rather than at the ceiling: level 9 is now the one level where every
  // painted pixel of road is within 60 px of a lane, and a change that gives
  // any of it back should have to say so.
  const { pct } = orphanShare('level9')
  assert.equal(pct, 0, `level 9 is back to ${pct.toFixed(2)}% orphaned road`)
})
