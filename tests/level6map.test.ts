// LEVEL 6'S MAP, and the one thing in it that is not traced.
//
// The plate MERGES its two lanes and leaves the east 82.8% exit fed only by a
// band no entrance reaches -- tools/level6_geometry.json says so in its
// `_conflict` key, and tools/check_level6.py re-derives it on every run. Level 6
// is designed as two INDEPENDENT lanes, so the map joins the south lane to that
// unreachable band across a gap that has no road painted on it. Cory chose that
// over re-painting the plate.
//
// These tests are the receipt. They pin how much was authored and where, so a
// later pass cannot quietly widen it, and they pin the properties the design
// asks for that the plate does not give: two lanes, two entrances, two exits,
// never touching.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LaneNetwork, validateLanes } from '../src/systems/Lanes.ts'
import map from '../src/data/map_level6.json' with { type: 'json' }
import waves from '../src/data/waves.level6.json' with { type: 'json' }
import levels from '../src/data/levels.json' with { type: 'json' }

const GEOMETRY = JSON.parse(
  readFileSync(new URL('../tools/level6_geometry.json', import.meta.url), 'utf8'))
const M = map as unknown as {
  plate: string; roadWidth: number; spotRadius: number; mainId: string
  waypoints: [number, number][]
  lanes: { id: string; waypoints: [number, number][]; entrance?: boolean; merge?: unknown }[]
  buildSpots: [number, number][]
}
const PLATE_W = 1280, PLATE_H = 720

const dist = (a: number[], b: number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!)
const segDist = (p: number[], a: number[], b: number[]): number => {
  const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / len2)) : 0
  return Math.hypot(p[0]! - (a[0]! + t * dx), p[1]! - (a[1]! + t * dy))
}
const toPoly = (p: number[], w: number[][]): number => {
  let best = Infinity
  for (let i = 0; i < w.length - 1; i++) best = Math.min(best, segDist(p, w[i]!, w[i + 1]!))
  return best
}

test('level 6 is two independent lanes, and the engine accepts that shape', () => {
  assert.deepEqual(validateLanes(M as never), [],
    'the map does not validate; see LaneDef.entrance')
  const net = new LaneNetwork(M as never)
  assert.deepEqual(net.lanes.map((l) => l.id), ['upper', 'lower', 'flank'])
  for (const id of ['upper', 'lower']) {
    // Independent means: nothing continues from it, and it is its own terminal.
    assert.equal(net.transferFrom(id), null, `${id} hands its walkers on to something`)
    assert.deepEqual(net.terminals(id).map((t) => t.id), [id], `${id} does not reach its own exit`)
  }
  // And the wave table spawns on exactly these two, by name. LaneNetwork.lane()
  // resolves an unknown id to main, so a typo here would walk the wrong road in
  // silence rather than throwing -- which is why this is checked rather than
  // assumed. It is also why the map carries `mainId`.
  assert.equal(M.mainId, 'upper')
  const spawnLanes = new Set<string>()
  for (const w of (waves as never as { waves: { spawns: { lane?: string }[] }[] }).waves) {
    for (const s of w.spawns) if (s.lane) spawnLanes.add(s.lane)
  }
  assert.deepEqual([...spawnLanes].sort(), ['flank', 'lower', 'upper'])

  // AND THE FLANK IS NOT INDEPENDENT: it merges into `lower` and therefore
  // terminates there. A flank that reached an exit of its own would be a third
  // lane, which is the thing the design says it must not become.
  assert.ok(net.transferFrom('flank'), 'the flank does not hand its walkers on')
  assert.deepEqual(net.terminals('flank').map((t) => t.id), ['lower'])
  const join = net.transferFrom('flank')!
  assert.equal(join.lane.id, 'lower')
  assert.ok(Math.abs(join.distance - 830.9) < 0.5,
    `the flank joins lower at ${join.distance.toFixed(1)} px, not the 830.9 the map records`)
})

test('the two lanes enter on the west edge, leave on the east, and never touch', () => {
  const lanes = [M.waypoints, M.lanes[0]!.waypoints]
  for (const w of lanes) {
    assert.ok(w[0]![0]! < 0, 'a lane does not start off the west edge')
    assert.ok(w[w.length - 1]![0]! > PLATE_W, 'a lane does not leave past the east edge')
  }
  // NEVER TOUCH is the design's word and it needs a number: the roads are
  // `roadWidth` wide, so their centrelines have to stay more than that apart or
  // the paint overlaps. Measured on the plate only -- the gateway points run off
  // it towards their own exits and converge on nothing.
  let closest = Infinity
  const [A, B] = lanes as [number[][], number[][]]
  for (let i = 0; i < B.length - 1; i++) {
    const a = B[i]!, b = B[i + 1]!
    const steps = Math.max(2, Math.ceil(dist(a, b)))
    for (let t = 0; t <= steps; t++) {
      const q = [a[0]! + (b[0]! - a[0]!) * t / steps, a[1]! + (b[1]! - a[1]!) * t / steps]
      if (q[0]! < 0 || q[0]! > PLATE_W || q[1]! < 0 || q[1]! > PLATE_H) continue
      closest = Math.min(closest, toPoly(q, A))
    }
  }
  assert.ok(closest > M.roadWidth,
    `the lanes close to ${closest.toFixed(1)} px, inside the ${M.roadWidth} px road width`)
  // 59.6 is the plate's own tightest squeeze between the two painted roads and
  // is not something this pass chose. Pinned so a re-trace that moves it says so.
  assert.ok(Math.abs(closest - 59.6) < 0.5, `closest approach moved to ${closest.toFixed(1)}`)
})

test('exactly one stretch of level 6 road is not painted, and it is 82 px long', () => {
  // THE AUTHORED JOIN. Everything else in `waypoints` and `lanes` is a point
  // from tools/level6_geometry.json, so the test is: every waypoint on the
  // plate is one of the traced points, except the two ends of this one segment
  // -- which are ALSO traced, it is the segment BETWEEN them that is invented.
  const traced = new Set<string>()
  for (const p of GEOMETRY.lanes.north) traced.add(`${p[0]},${p[1]}`)
  for (const p of GEOMETRY.lanes.south) traced.add(`${p[0]},${p[1]}`)
  for (const p of GEOMETRY.orphanBand.centreline) traced.add(`${p[0]},${p[1]}`)
  for (const w of [M.waypoints, M.lanes[0]!.waypoints]) {
    for (const p of w.slice(1, -1)) {
      assert.ok(traced.has(`${p[0]},${p[1]}`),
        `(${p[0]}, ${p[1]}) is on the plate but is not a traced point`)
    }
  }
  // THE GAP ITSELF, found structurally rather than by length. "The longest
  // step" does NOT identify it: the tracer emits a single stride across a
  // straight run, so the upper lane has a traced 91 px step and the lower a
  // traced 100 px one, both longer than the 82 px join. What is unique about
  // the join is that it is the one segment whose two ends come from DIFFERENT
  // painted roads -- south lane on one side, the unreachable band on the other.
  const inSouth = new Set<string>(
    (GEOMETRY.lanes.south as number[][]).map((p) => `${p[0]},${p[1]}`))
  const inBand = new Set<string>(
    (GEOMETRY.orphanBand.centreline as number[][]).map((p) => `${p[0]},${p[1]}`))
  const lower = M.lanes[0]!.waypoints
  const crossings: { from: number[]; to: number[]; len: number }[] = []
  for (let i = 1; i < lower.length - 2; i++) {
    const a = lower[i]!, b = lower[i + 1]!
    const aOnly = inSouth.has(`${a[0]},${a[1]}`) && !inBand.has(`${a[0]},${a[1]}`)
    const bOnly = inBand.has(`${b[0]},${b[1]}`) && !inSouth.has(`${b[0]},${b[1]}`)
    if (aOnly && bOnly) crossings.push({ from: a, to: b, len: dist(a, b) })
  }
  assert.equal(crossings.length, 1,
    `${crossings.length} segments cross from the south lane to the band; exactly one may`)
  const gap = crossings[0]!
  assert.deepEqual(gap.from, [591, 393], 'the authored join moved')
  assert.deepEqual(gap.to, [592, 475], 'the authored join moved')
  assert.ok(Math.abs(gap.len - 82.0) < 0.1, `the join is ${gap.len.toFixed(1)} px, not 82`)
  // AND THE UPPER LANE HAS NO SUCH SEGMENT: it is traced end to end.
  const upper = M.waypoints
  for (let i = 1; i < upper.length - 2; i++) {
    const a = upper[i]!, b = upper[i + 1]!
    assert.ok(!(inBand.has(`${b[0]},${b[1]}`) && !inBand.has(`${a[0]},${a[1]}`)),
      'the upper lane reaches into the unreachable band; it should be wholly traced')
  }
})

test('level 6 carries all eighteen painted pads, untouched', () => {
  assert.equal(M.buildSpots.length, 18)
  for (let i = 0; i < 18; i++) assert.deepEqual(M.buildSpots[i], GEOMETRY.pads[i])
  // FIVE OF THEM REACH NO ROAD, and that is a property of the plate rather than
  // a mistake here. The pads are painted, the geometry file copies them as
  // painted, and moving one is re-drawing the art. Four of the five were drawn
  // to serve the band this map does not use; pad 2 reached nothing on the
  // painted layout either and check_level6.py has always named it.
  const RANGE = GEOMETRY.towerRange
  const dead: number[] = []
  for (let i = 0; i < 18; i++) {
    const p = M.buildSpots[i]!
    if (toPoly(p, M.waypoints) > RANGE && toPoly(p, M.lanes[0]!.waypoints) > RANGE) dead.push(i + 1)
  }
  assert.deepEqual(dead, [2, 9, 12, 16, 18],
    'the set of pads that reach no road changed; re-read the report before moving the join')
})

test('the Rooster breathes from its beak, uniformly scaled, above the board', () => {
  // FIX 2, pinned. The flame used to be an Image with `setDisplaySize(300, 64)`
  // on a 181 x 181 cell: an aspect of 4.69:1, which smears painted art into a
  // gradient, stuck on frame 0 of a twelve-frame sheet, at a depth below every
  // tower on the board. What the numbers here guard is the SHAPE of the fix;
  // that it reads as fire is a picture, and the picture is in the report.
  const art = JSON.parse(readFileSync(new URL('../src/data/art.json', import.meta.url), 'utf8'))
  const bird = art.render['enemy-rooster']
  // The beak, as measured off the painted jet's narrowest column. It goes stale
  // on a re-export exactly the way contentWidth does, so it is pinned.
  assert.ok(Math.abs(bird.beakForward - 27.8) < 0.1, `beakForward is ${bird.beakForward}`)
  assert.ok(Math.abs(bird.beakRise - -108.5) < 0.1, `beakRise is ${bird.beakRise}`)
  // It is above the origin (the feet) and forward of it, which is the only
  // arrangement that can be a beak on a bird standing on the ground.
  assert.ok(bird.beakRise < 0 && Math.abs(bird.beakRise) < bird.displayHeight,
    'the beak is not between the feet and the top of the sprite')
  assert.ok(bird.beakForward > 0, 'the beak is not forward of the origin')

  // UNIFORM SCALE. The scene computes `reach / contentWidth` and applies it to
  // both axes, so the only thing that can reintroduce the smear is the source
  // calling setDisplaySize again.
  const src = readFileSync(new URL('../src/scenes/GameScene.ts', import.meta.url), 'utf8')
  const showFlame = src.slice(src.indexOf('private showFlame'), src.indexOf('private hideFlame'))
  assert.match(showFlame, /art\.setScale\(k\)/, 'the flame is not uniformly scaled')
  assert.doesNotMatch(showFlame, /setDisplaySize/,
    'the flame sets a display size again; that is the 4.69:1 smear coming back')
  assert.match(showFlame, /this\.add\.sprite/, 'the flame is not a Sprite and cannot animate')
  assert.match(showFlame, /LAYER\.worldOverlay/,
    'the flame is not in the band whose definition is "above every entity"')
  // And the scale is the ability's reach over the art's own ink width.
  const flame = art.render['fx-rooster-flame']
  const k = 240 / flame.contentWidth
  assert.ok(k > 0, 'the flame art has no contentWidth to scale by')
})

test('a field holding a Phaser sprite is DECLARED as a sprite', () => {
  // THIS IS A LOCAL STAND-IN FOR A TYPECHECK THAT CANNOT RUN HERE, and it
  // exists because the flame fix shipped broken.
  //
  // `flameArt` was declared `Phaser.GameObjects.Image | null` while `showFlame`
  // assigned `this.add.sprite(...)` to it. `tsc` in CI rejected four lines --
  // `.anims` and `.play` do not exist on an Image -- and `tools/tsdiff.sh` was
  // blind to every one of them: with no `node_modules` every Phaser type is
  // `any`, so the local error COUNT did not move. That is the exact blind spot
  // CLAUDE.md documents, and the cost was a red `main`.
  //
  // So: read the source as text and pair every `this.X = this.add.sprite(...)`
  // with X's declaration. It catches nothing tsc would not, and it catches it
  // HERE, which is the whole point.
  const src = readFileSync(new URL('../src/scenes/GameScene.ts', import.meta.url), 'utf8')
  const decl = new Map<string, string>()
  for (const m of src.matchAll(
    /^\s*(?:private |readonly |public )*(\w+)(?:!)?:\s*Phaser\.GameObjects\.(\w+)/gm)) {
    decl.set(m[1]!, m[2]!)
  }
  const factoryType: Record<string, string> = {
    sprite: 'Sprite', image: 'Image', text: 'Text', graphics: 'Graphics',
    container: 'Container', rectangle: 'Rectangle',
  }
  let checked = 0
  for (const m of src.matchAll(/this\.(\w+)\s*=\s*this\.add\.(\w+)\(/g)) {
    const field = m[1]!, factory = m[2]!
    const want = factoryType[factory]
    const have = decl.get(field)
    if (!want || !have) continue
    checked++
    // An Image assigned to a Sprite field is fine in neither direction here:
    // Sprite extends Image, so a Sprite in an Image field compiles until
    // somebody calls `.anims` on it, which is exactly what happened.
    assert.equal(have, want,
      `GameScene.${field} is declared Phaser.GameObjects.${have} but is assigned `
      + `this.add.${factory}(). A Sprite in an Image field compiles until something `
      + 'calls .anims or .play on it, and tsdiff cannot see that.')
  }
  assert.ok(checked >= 3,
    `only ${checked} field assignments were checked; the regex has stopped matching `
    + 'and this test is no longer looking at anything')
})

test('level 6 is reachable from the world map, behind level 5', () => {
  const row = (levels as never as { levels: { id: string; unlockedBy: string | null }[] })
    .levels.find((l) => l.id === 'level6')
  assert.ok(row, 'level 6 has no row in levels.json')
  assert.equal(row!.unlockedBy, 'level5')
})
