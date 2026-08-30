import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Grid } from '../src/systems/Grid.ts'
import { Path } from '../src/systems/Path.ts'
import { roadRole } from '../src/systems/Autotile.ts'
import { pickFirst, pickNearest, withinRadius } from '../src/systems/Targeting.ts'
import { WaveSpawner } from '../src/systems/WaveSpawner.ts'
import { BuildSystem } from '../src/systems/BuildSystem.ts'

const read = (n: string) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url), 'utf8'))
const map = read('map'), display = read('display'), waves = read('waves')

const grid = new Grid(map.cols, map.rows, display.tileSize, map.originX, map.originY)
const lane = new Path(map.waypoints, grid)
const roadKeys = new Set(lane.roadTiles().map((t) => `${t.col},${t.row}`))
const isRoad = (c: number, r: number) => roadKeys.has(`${c},${r}`)
const onGrid = lane.roadTiles().filter((t) => grid.contains(t.col, t.row))

test('grid fits the canvas below the HUD', () => {
  assert.equal(grid.widthPx, display.width)
  assert.ok(map.originY + grid.heightPx <= display.height, 'grid overflows the canvas')
  assert.ok(map.originY >= 56, 'no room for the HUD bar')
})

test('grid world/tile round trip', () => {
  for (let c = 0; c < grid.cols; c++) {
    for (let r = 0; r < grid.rows; r++) {
      assert.equal(grid.colAt(grid.centreX(c)), c)
      assert.equal(grid.rowAt(grid.centreY(r)), r)
    }
  }
})

test('every lane segment is axis aligned and non-empty', () => {
  for (let i = 1; i < map.waypoints.length; i++) {
    const [x0, y0] = map.waypoints[i - 1]
    const [x1, y1] = map.waypoints[i]
    assert.ok(x0 === x1 || y0 === y1, `segment ${i} is diagonal`)
    assert.ok(!(x0 === x1 && y0 === y1), `segment ${i} is zero length`)
  }
})

test('the lane winds rather than running straight', () => {
  let turns = 0
  for (let i = 2; i < map.waypoints.length; i++) {
    const a = map.waypoints[i - 2], b = map.waypoints[i - 1], c = map.waypoints[i]
    const h1 = a[1] === b[1], h2 = b[1] === c[1]
    if (h1 !== h2) turns++
  }
  assert.ok(turns >= 6, `only ${turns} turns; that is not a winding path`)
})

test('lane starts and ends off the grid so enemies walk on and off screen', () => {
  const first = map.waypoints[0]
  const last = map.waypoints[map.waypoints.length - 1]
  assert.ok(first[0] < 0 || first[0] > map.cols, 'spawn should be off-grid')
  assert.ok(last[0] < 0 || last[0] > map.cols, 'exit should be off-grid')
})

test('pointAt is monotonic and clamped', () => {
  assert.deepEqual(lane.pointAt(-50), lane.pointAt(0))
  assert.deepEqual(lane.pointAt(lane.totalLength + 500), lane.pointAt(lane.totalLength))
  let prev = lane.pointAt(0)
  for (let d = 8; d <= lane.totalLength; d += 8) {
    const p = lane.pointAt(d)
    const step = Math.hypot(p.x - prev.x, p.y - prev.y)
    assert.ok(step > 0 && step < 9, `bad step ${step} at ${d}`)
    prev = p
  }
})

test('angleAt points along the lane', () => {
  // First segment runs left to right, so facing is 0 radians.
  assert.ok(Math.abs(lane.angleAt(10)) < 1e-9)
  const angles = new Set<number>()
  for (let d = 0; d < lane.totalLength; d += 40) angles.add(Math.round(lane.angleAt(d) * 100))
  assert.ok(angles.size >= 3, 'facing never changes along a winding lane')
})

test('the road is a contiguous two-tile band', () => {
  assert.ok(onGrid.length > 40, `only ${onGrid.length} road tiles`)
  const keys = new Set(onGrid.map((t) => `${t.col},${t.row}`))
  assert.equal(keys.size, onGrid.length, 'duplicate road tiles')
  for (const t of onGrid) {
    const neighbours = [[1,0],[-1,0],[0,1],[0,-1]].filter(([dc, dr]) => isRoad(t.col + dc, t.row + dr))
    assert.ok(neighbours.length >= 2, `road tile ${t.col},${t.row} is a dead end`)
  }
})

test('the road leaves plenty of buildable ground', () => {
  const buildable = grid.cols * grid.rows - onGrid.length
  assert.ok(buildable > 80, `only ${buildable} buildable tiles`)
  console.log(`   map: ${onGrid.length} road tiles, ${buildable} buildable, lane ${Math.round(lane.totalLength)}px`)
})

test('autotiler resolves every road tile to a mapped role or open road', () => {
  const art = read('art')
  let overlays = 0
  for (const t of onGrid) {
    const role = roadRole(isRoad, t.col, t.row)
    if (role === null) continue
    overlays++
    const key = art.autotile[role]
    assert.ok(key, `autotiler produced role "${role}" with no entry in art.json`)
    assert.ok(art.files[key], `autotile role "${role}" maps to unknown sprite key "${key}"`)
  }
  assert.ok(overlays > onGrid.length * 0.5, 'suspiciously few road edges drawn')
  console.log(`   autotile: ${overlays}/${onGrid.length} road tiles get an edge or corner sprite`)
})

test('autotiler never asks for a tile the pack does not have', () => {
  // A one-tile-wide neck would need a grass-both-sides tile, which the pack
  // lacks. The lane must stay two wide.
  for (const t of onGrid) {
    const n = !isRoad(t.col, t.row - 1), s = !isRoad(t.col, t.row + 1)
    const w = !isRoad(t.col - 1, t.row), e = !isRoad(t.col + 1, t.row)
    assert.ok(!(n && s), `tile ${t.col},${t.row} is a horizontal one-tile neck`)
    assert.ok(!(w && e), `tile ${t.col},${t.row} is a vertical one-tile neck`)
  }
})

test('hero starts on buildable-free open ground, not on the road', () => {
  const [c, r] = map.heroStart
  assert.ok(grid.contains(c, r), 'hero start is off grid')
  assert.ok(!isRoad(c, r), 'hero starts on the road')
})

test('decorations sit off the road and on the grid', () => {
  for (const d of map.decorations) {
    const [c, r, key] = d
    assert.ok(grid.contains(c as number, r as number), `decoration ${c},${r} is off grid`)
    assert.ok(!isRoad(c as number, r as number), `decoration ${c},${r} is on the road`)
    assert.ok(String(key).startsWith('decor-'), `bad decoration key ${key}`)
  }
})

test('scattered decoration never starves the board or blocks the good plots', () => {
  const pres = read('presentation')
  const b = new BuildSystem(grid)
  for (const t of onGrid) b.block(t.col, t.row)
  for (const d of map.decorations) b.block(d[0] as number, d[1] as number)

  let buildable = 0
  let eligible = 0
  let nearRoadPlots = 0
  const near = (c: number, r: number, dist: number) => {
    for (let dc = -dist; dc <= dist; dc++) {
      for (let dr = -dist; dr <= dist; dr++) if (isRoad(c + dc, r + dr)) return true
    }
    return false
  }
  for (let c = 0; c < grid.cols; c++) {
    for (let r = 0; r < grid.rows; r++) {
      if (!b.isBuildable(c, r)) continue
      buildable++
      if (near(c, r, pres.decoration.minDistanceFromRoad)) nearRoadPlots++
      else eligible++
    }
  }
  // Scatter only touches tiles away from the road, so every plot that can
  // actually cover the lane survives however dense the scatter gets.
  assert.equal(buildable, eligible + nearRoadPlots)
  assert.ok(nearRoadPlots > 40, `only ${nearRoadPlots} plots sit near the lane`)
  const worstCase = buildable - eligible * (pres.decoration.densityPercent / 100)
  assert.ok(worstCase > 80, `scatter could leave only ~${worstCase.toFixed(0)} buildable tiles`)
  console.log(`   scatter: ${buildable} plots, ${nearRoadPlots} near the lane, ~${worstCase.toFixed(0)} left after scatter`)
})

test('targeting picks furthest along, nearest, and radius', () => {
  const mk = (x: number, y: number, distance: number, alive = true) => ({ x, y, distance, alive })
  const list = [mk(10, 0, 5), mk(20, 0, 90), mk(30, 0, 50), mk(15, 0, 999, false)]
  assert.equal(pickFirst(list, 0, 0, 100)!.distance, 90)
  assert.equal(pickNearest(list, 0, 0, 100)!.x, 10)
  assert.equal(pickFirst(list, 0, 0, 5), null)
  assert.equal(withinRadius(list, 0, 0, 25).length, 2)
})

test('build rules: road and scenery blocked, one tower per tile', () => {
  const b = new BuildSystem(grid)
  for (const t of onGrid) b.block(t.col, t.row)
  for (const d of map.decorations) b.block(d[0] as number, d[1] as number)
  for (const t of onGrid) assert.equal(b.isBuildable(t.col, t.row), false)
  for (const d of map.decorations) assert.equal(b.isBuildable(d[0] as number, d[1] as number), false)
  assert.equal(b.isBuildable(-1, 0), false)
  assert.equal(b.isBuildable(map.cols, 0), false)
  const free: number[][] = []
  for (let c = 0; c < grid.cols; c++) for (let r = 0; r < grid.rows; r++) if (b.isBuildable(c, r)) free.push([c, r])
  assert.ok(free.length > 80)
  b.occupy(free[0][0], free[0][1])
  assert.equal(b.isBuildable(free[0][0], free[0][1]), false)
  assert.equal(b.towerCount, 1)
})

test('spawner emits exactly the wave composition, honouring group delays', () => {
  for (const [i, wave] of waves.waves.entries()) {
    const s = new WaveSpawner()
    s.begin(wave)
    const counts: Record<string, number> = {}
    let guard = 0
    while (!s.done && guard++ < 200000) {
      for (const id of s.update(1 / 60)) counts[id] = (counts[id] ?? 0) + 1
    }
    for (const g of wave.spawns) {
      assert.ok((counts[g.enemy] ?? 0) >= g.count, `wave ${i + 1} short on ${g.enemy}`)
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    assert.equal(total, wave.spawns.reduce((a: number, g: any) => a + g.count, 0), `wave ${i + 1} total`)
    assert.equal(s.remaining, 0)
  }
})

test('a delayed group really waits', () => {
  const s = new WaveSpawner()
  s.begin({ name: 't', spawns: [{ enemy: 'a', count: 1, interval: 1, delay: 0 },
                                { enemy: 'b', count: 1, interval: 1, delay: 5 }] })
  assert.deepEqual(s.update(0.1), ['a'], 'undelayed group spawns immediately')
  assert.deepEqual(s.update(1), [], 'delayed group must not spawn yet')
  assert.deepEqual(s.update(5), ['b'], 'delayed group spawns after its delay')
})

test('spawner pays out backlog on a long frame', () => {
  const s = new WaveSpawner()
  s.begin({ name: 't', spawns: [{ enemy: 'x', count: 5, interval: 0.1, delay: 0 }] })
  assert.equal(s.update(10).length, 5)
  assert.ok(s.done)
})
