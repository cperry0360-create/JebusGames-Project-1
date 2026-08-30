import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Grid } from '../src/systems/Grid.ts'
import { Path } from '../src/systems/Path.ts'
import { pickFirst, pickNearest, withinRadius } from '../src/systems/Targeting.ts'
import { WaveSpawner } from '../src/systems/WaveSpawner.ts'
import { readFileSync } from 'node:fs'

const read = (n: string) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url), 'utf8'))
const map = read('map')
const display = read('display')
const waves = read('waves')

const grid = new Grid(map.cols, map.rows, display.tileSize, map.originX, map.originY)

test('grid fits the canvas', () => {
  assert.equal(grid.widthPx, display.width)
  assert.ok(map.originY + grid.heightPx <= display.height, 'grid overflows canvas bottom')
})

test('grid world/tile round trip', () => {
  for (let c = 0; c < grid.cols; c++) {
    for (let r = 0; r < grid.rows; r++) {
      assert.equal(grid.colAt(grid.centreX(c)), c)
      assert.equal(grid.rowAt(grid.centreY(r)), r)
    }
  }
})

test('path segments are axis aligned', () => {
  for (let i = 1; i < map.path.length; i++) {
    const [c0, r0] = map.path[i - 1]
    const [c1, r1] = map.path[i]
    assert.ok(c0 === c1 || r0 === r1, `segment ${i} is diagonal`)
    assert.ok(!(c0 === c1 && r0 === r1), `segment ${i} is zero length`)
  }
})

const path = new Path(map.path, grid)

test('path endpoints sit off grid so enemies walk on and off screen', () => {
  const first = map.path[0]
  const last = map.path[map.path.length - 1]
  assert.ok(!grid.contains(first[0], first[1]), 'spawn should be off-grid')
  assert.ok(!grid.contains(last[0], last[1]), 'exit should be off-grid')
})

test('pointAt is monotonic and clamped', () => {
  const start = path.pointAt(-50)
  assert.deepEqual(start, path.pointAt(0))
  const end = path.pointAt(path.totalLength + 500)
  assert.deepEqual(end, path.pointAt(path.totalLength))
  let prev = path.pointAt(0)
  for (let d = 10; d <= path.totalLength; d += 10) {
    const p = path.pointAt(d)
    const step = Math.hypot(p.x - prev.x, p.y - prev.y)
    assert.ok(step > 0 && step < 11, `bad step ${step} at ${d}`)
    prev = p
  }
})

test('pointAt hits every waypoint exactly', () => {
  let acc = 0
  for (let i = 1; i < path.points.length; i++) {
    acc += Math.hypot(path.points[i].x - path.points[i - 1].x, path.points[i].y - path.points[i - 1].y)
    const p = path.pointAt(acc)
    assert.ok(Math.abs(p.x - path.points[i].x) < 1e-6, `waypoint ${i} x`)
    assert.ok(Math.abs(p.y - path.points[i].y) < 1e-6, `waypoint ${i} y`)
  }
})

test('path tiles are in bounds, contiguous and leave room to build', () => {
  const tiles = path.tiles()
  for (const t of tiles) assert.ok(grid.contains(t.col, t.row))
  const keys = new Set(tiles.map((t) => `${t.col},${t.row}`))
  assert.equal(keys.size, tiles.length, 'duplicate path tiles')
  for (let i = 1; i < tiles.length; i++) {
    const d = Math.abs(tiles[i].col - tiles[i - 1].col) + Math.abs(tiles[i].row - tiles[i - 1].row)
    assert.equal(d, 1, `gap in road at index ${i}`)
  }
  const buildable = grid.cols * grid.rows - tiles.length
  assert.ok(buildable > 100, `only ${buildable} buildable tiles`)
  console.log(`   path: ${tiles.length} road tiles, ${buildable} buildable, ${path.totalLength.toFixed(0)}px long`)
})

test('hero start is not on the road', () => {
  const keys = new Set(path.tiles().map((t) => `${t.col},${t.row}`))
  assert.ok(grid.contains(map.heroStart[0], map.heroStart[1]), 'hero start off grid')
  assert.ok(!keys.has(`${map.heroStart[0]},${map.heroStart[1]}`), 'hero starts on the road')
})

test('targeting picks furthest along, nearest, and radius', () => {
  const mk = (x: number, y: number, distance: number, alive = true) => ({ x, y, distance, alive })
  const list = [mk(10, 0, 5), mk(20, 0, 90), mk(30, 0, 50), mk(15, 0, 999, false)]
  assert.equal(pickFirst(list, 0, 0, 100)!.distance, 90)
  assert.equal(pickNearest(list, 0, 0, 100)!.x, 10)
  assert.equal(pickFirst(list, 0, 0, 5), null, 'nothing in a tiny range')
  assert.equal(withinRadius(list, 0, 0, 25).length, 2)
  assert.equal(pickFirst([mk(0, 0, 1, false)], 0, 0, 100), null, 'dead units are skipped')
})

test('spawner emits exactly the wave count', () => {
  for (const [i, wave] of waves.waves.entries()) {
    const s = new WaveSpawner()
    s.begin(wave)
    let total = 0
    let guard = 0
    while (!s.done && guard++ < 100000) total += s.update(1 / 60).length
    const expected = wave.spawns.reduce((a: number, b: any) => a + b.count, 0)
    assert.equal(total, expected, `wave ${i + 1}`)
  }
})

test('spawner pays out backlog on a long frame', () => {
  const s = new WaveSpawner()
  s.begin({ spawns: [{ enemy: 'x', count: 5, interval: 0.1 }] })
  assert.equal(s.update(10).length, 5, 'one huge frame should flush the group')
  assert.ok(s.done)
})
