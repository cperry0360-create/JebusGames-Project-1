import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))

const L1 = read('map'), L2 = read('map_level2'), art = read('art'), display = read('display')
const W = display.width, H = display.height

/**
 * Level 2 is DATA ONLY at this point. Nothing loads it: GameScene still reads
 * map.json and the run still plays level 1, which is what Phase 1 asks for.
 * What these tests hold is that the file is a map — the same shape, in the
 * same units, with the same guarantees — so that whatever loads it later is
 * loading something already known to be sane.
 *
 * The measurements against the painting live in tools/check_level2.py, which
 * needs the 1440x810 overlay and a PNG decoder. This checks the properties
 * that survive without either.
 */

test('level 2 is the same shape of map as level 1', () => {
  for (const key of Object.keys(L1)) {
    // Level 1 carries painted furniture level 2 has none of: an arch, a gate,
    // a tavern sign, an innkeeper, two clumps for Bailey.
    if (['signs', 'innkeeper', 'entrance', 'exit', 'baileySpots'].includes(key)) continue
    assert.ok(key in L2, `map_level2.json is missing "${key}"`)
  }
  assert.equal(typeof L2.roadWidth, 'number')
  assert.equal(L2.spotRadius, L1.spotRadius, 'the tap target is a thumb, not a map property')
})

test('the level 2 plate is a manifest role that resolves to a file', () => {
  const key = art.map[L2.plate]
  assert.ok(key, `no manifest entry for plate "${L2.plate}"`)
  assert.match(art.files[key], /^maps\//, 'the plate is not under the maps directory')
  assert.ok(existsSync(url(`../public/${art.assetRoot}${art.files[key]}`)), `${key} has no file`)
  assert.notEqual(art.map[L2.plate], art.map[L1.plate], 'both maps name the same painting')
})

test('the lane crosses the whole plate and runs off both ends', () => {
  const way = L2.waypoints as number[][]
  assert.ok(way.length > 20, `${way.length} waypoints is too coarse for four S-bends`)
  assert.ok(way[0]![0]! < 0, 'the lane starts on the plate; enemies walk in from off it')
  assert.ok(way[way.length - 1]![0]! > W, 'the lane ends on the plate')
  for (const [x, y] of way) {
    assert.ok(x! >= -80 && x! <= W + 80, `waypoint x ${x} is a long way off the plate`)
    assert.ok(y! >= 0 && y! <= H, `waypoint y ${y} is off the plate`)
  }
  // No zero-length hops. A repeated waypoint is a divide by zero waiting for
  // whatever normalises the segment it sits on.
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1] as [number, number]
    const [bx, by] = way[i] as [number, number]
    assert.ok(Math.hypot(bx - ax, by - ay) > 0.5, `waypoints ${i - 1} and ${i} are the same point`)
  }
})

test('every level 2 pad is off the road, on the plate, and worth building on', () => {
  const spots = L2.buildSpots as number[][]
  const way = L2.waypoints as number[][]
  const toLane = (x: number, y: number): number => {
    let best = Infinity
    for (let i = 1; i < way.length; i++) {
      const [ax, ay] = way[i - 1] as [number, number]
      const [bx, by] = way[i] as [number, number]
      const dx = bx - ax, dy = by - ay
      const span = dx * dx + dy * dy
      const t = span === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / span))
      best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)))
    }
    return best
  }
  // The longest reach in the roster. A pad no tower can shoot the lane from is
  // a pad nobody ever builds on.
  const towers = read('towers')
  const reach = Math.max(...Object.values(towers).map((t: any) => t.range))

  assert.ok(spots.length >= 2, 'one pad is not a decision')
  for (const [i, spot] of spots.entries()) {
    const [x, y] = spot as [number, number]
    assert.ok(x > 0 && x < W && y > 0 && y < H, `pad ${i} at (${x}, ${y}) is off the plate`)
    const d = toLane(x, y)
    assert.ok(d > L2.roadWidth / 2, `pad ${i} is ${d.toFixed(1)}px from the lane centre; it is in the road`)
    assert.ok(d < reach, `pad ${i} is ${d.toFixed(1)}px from the lane and the longest range is ${reach}`)
  }
  // TWO PADS MAY NEVER SHARE A TAP TARGET. A node's tap radius is spotRadius,
  // so two centres closer than 2 x spotRadius put a thumb over both at once —
  // one mis-tap, every time, on the pad you did not mean. The first ring set
  // was packed at a 59.0 px minimum against a 68 px requirement, and pads 2-5
  // (59.0) and 5-7 (59.6) overlapped; the re-drawn overlay is packed at 72.1.
  //
  // THIS IS THE ASSERTION THAT KEEPS IT THAT WAY. The pads are painted, so the
  // only thing standing between a re-export and the old overlap is this test.
  // Note which end is fixed: 68 falls out of spotRadius, and spotRadius is 34
  // because world 1280 renders to 844 CSS px, making it a 44.8 px tap diameter
  // against the 44 pt minimum. Dropping it to 28 would buy room for tighter
  // pads and land at 36.9 px, under that minimum. If this fails, move the ring
  // in the overlay and re-derive — do not shrink the radius to fit the art.
  const floor = 2 * L2.spotRadius
  let closest = Infinity
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const [ax, ay] = spots[i] as [number, number]
      const [bx, by] = spots[j] as [number, number]
      const d = Math.hypot(bx - ax, by - ay)
      closest = Math.min(closest, d)
      assert.ok(d > floor,
        `pads ${i} and ${j} are ${d.toFixed(1)}px apart; their ${L2.spotRadius}px tap ` +
        `targets overlap, which needs ${floor}px. Move a ring in the overlay and ` +
        're-derive with tools/check_level2.py --emit.')
    }
  }
  assert.ok(closest > floor, `closest pair is ${closest.toFixed(1)}px, under the ${floor}px floor`)
})

/**
 * THE HERO USED TO START ABOVE THE TOP OF THE BOARD. `heroStart` was
 * (588.0, 128.0), which is 36 px higher than the highest point the lane ever
 * reaches — on a plate where everything above the lane's top bend is lava
 * field. He is about 120 world px tall, so his head was over the edge of the
 * painting and his feet were in molten rock.
 *
 * The lava is measured in tools/check_level2.py, off the plate. What is
 * checkable here is the part that made the old value obviously wrong without
 * opening the image at all: a hero who starts outside the band the lane
 * occupies is a hero standing somewhere the board does not go.
 */
test('the hero starts inside the band the lane occupies', () => {
  const [hx, hy] = L2.heroStart as [number, number]
  const ys = (L2.waypoints as number[][]).map((p) => p[1]!)
  assert.ok(hy >= Math.min(...ys), `the hero starts at y=${hy}, above the lane's highest point`)
  assert.ok(hx > 0 && hx < W && hy > 0 && hy < H, 'the hero starts off the plate')
  assert.ok(L2._heroStart && /measured/i.test(L2._heroStart),
    'heroStart carries no note saying what it was measured against')
})

/**
 * The overlay is 1.9MB and exactly one thing reads it: tools/check_level2.py.
 * It shipped in public/assets/maps/ first, and everything under public/ is
 * deployed whether or not the manifest points at it — so that was 1.9MB on
 * every phone for a file the game never opens. Same rule that took the 10.9MB
 * plate PNG and 282 unused pack tiles out of the deploy.
 */
test('the level 2 overlay is a tool input, not a shipped asset', () => {
  assert.ok(existsSync(url('../tools/level2_path_overlay.png')),
    'the overlay is gone; check_level2.py has nothing to read')
  assert.ok(!existsSync(url('../public/assets/maps/level2_path_overlay.png')),
    'the overlay is back in public/ and ships to every player')
  const script = readFileSync(url('../tools/check_level2.py'), 'utf8')
  assert.match(script, /--overlay/, 'check_level2.py takes no --overlay argument')
  assert.ok(!/public\/assets\/maps\/level2_path_overlay/.test(script),
    'check_level2.py still points at the old public/ path')
})
