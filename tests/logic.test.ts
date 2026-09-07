import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Path } from '../src/systems/Path.ts'
import { pickFirst, pickNearest, withinRadius } from '../src/systems/Targeting.ts'
import { WaveSpawner } from '../src/systems/WaveSpawner.ts'
import { BuildSystem } from '../src/systems/BuildSystem.ts'
import { facesLeft } from '../src/systems/Facing.ts'

const read = (n: string) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url), 'utf8'))
const map = read('map'), display = read('display'), waves = read('waves')

const lane = new Path(map.waypoints)
const spots: number[][] = map.buildSpots

/** Where along the lane a point sits, as a fraction of the whole walk. */
function laneFraction(x: number, y: number): number {
  let best = Infinity
  let at = 0
  let travelled = 0
  for (let i = 1; i < lane.points.length; i++) {
    const a = lane.points[i - 1]
    const b = lane.points[i]
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2))
    const d = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t))
    if (d < best) {
      best = d
      at = travelled + t * Math.sqrt(len2)
    }
    travelled += Math.sqrt(len2)
  }
  return at / lane.totalLength
}

// ------------------------------------------------------------------ the plate

test('the map is one painted plate, not a tile grid', () => {
  assert.equal(typeof map.plate, 'string', 'map.json must name the plate it is traced from')
  assert.equal(map.cols, undefined, 'the tile grid is gone; there are no columns')
  assert.equal(map.rows, undefined, 'the tile grid is gone; there are no rows')
  assert.equal(display.tileSize, undefined, 'nothing is measured in tiles any more')
})

test('the plate is in the art manifest and on disk', () => {
  const art = read('art')
  const key = art.map[map.plate]
  assert.ok(key, `art.json has no map entry for plate "${map.plate}"`)
  assert.ok(art.files[key], `plate "${map.plate}" maps to unknown sprite key "${key}"`)
})

// ------------------------------------------------------------------- the lane

test('the lane runs right across the plate, entering and leaving off-screen', () => {
  const first = map.waypoints[0]
  const last = map.waypoints[map.waypoints.length - 1]
  assert.ok(first[0] < 0, 'enemies should walk in through the arch from off-screen left')
  assert.ok(last[0] > display.width, 'enemies should walk out through the gate off-screen right')
  const xs = map.waypoints.map((w: number[]) => w[0])
  assert.ok(Math.max(...xs) - Math.min(...xs) > display.width, 'the lane does not cross the map')
})

test('every waypoint after the entry sits on the plate', () => {
  // Only the two off-screen ends may leave the canvas; a stray point in the
  // middle would mean the trace jumped off the painted road.
  for (const [i, [x, y]] of map.waypoints.entries()) {
    if (i === 0 || i === map.waypoints.length - 1) continue
    assert.ok(x >= 0 && x <= display.width, `waypoint ${i} x=${x} is off the plate`)
    assert.ok(y >= 0 && y <= display.height, `waypoint ${i} y=${y} is off the plate`)
  }
})

test('the traced lane winds and never doubles back on itself', () => {
  let turns = 0
  for (let i = 1; i < map.waypoints.length; i++) {
    const [x0, y0] = map.waypoints[i - 1]
    const [x1, y1] = map.waypoints[i]
    assert.ok(Math.hypot(x1 - x0, y1 - y0) > 1, `segment ${i} is a duplicate point`)
    if (i > 1) {
      const [xp, yp] = map.waypoints[i - 2]
      const a = Math.atan2(y0 - yp, x0 - xp)
      const b = Math.atan2(y1 - y0, x1 - x0)
      let turn = b - a
      while (turn > Math.PI) turn -= Math.PI * 2
      while (turn < -Math.PI) turn += Math.PI * 2
      assert.ok(Math.abs(turn) < Math.PI * 0.75, `the lane hairpins at waypoint ${i}`)
      if (Math.abs(turn) > 0.2) turns++
    }
  }
  assert.ok(turns >= 6, `only ${turns} real turns; that is not a winding road`)
  console.log(`   lane: ${map.waypoints.length} waypoints, ${turns} turns, ${Math.round(lane.totalLength)}px`)
})

test('the lane never detours to the tavern door', () => {
  // The painted spur to the tavern is decoration. If the trace had followed
  // it, the walk would leave and rejoin the road near the same place.
  for (let i = 0; i < map.waypoints.length; i++) {
    for (let j = i + 3; j < map.waypoints.length; j++) {
      const [xi, yi] = map.waypoints[i]
      const [xj, yj] = map.waypoints[j]
      const apart = Math.hypot(xj - xi, yj - yi)
      const walked = (j - i) * 20
      assert.ok(apart > 40 || walked < 80,
        `waypoints ${i} and ${j} are ${apart.toFixed(0)}px apart; the lane loops back`)
    }
  }
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
  // The arch sits on the left edge, so the walk starts heading right.
  assert.ok(Math.abs(lane.angleAt(10)) < 0.5, 'enemies should enter walking east')
  const angles = new Set<number>()
  for (let d = 0; d < lane.totalLength; d += 40) angles.add(Math.round(lane.angleAt(d) * 4))
  assert.ok(angles.size >= 3, 'facing never changes along a winding lane')
})

test('distanceTo measures to the lane, not to a waypoint', () => {
  const mid = lane.pointAt(lane.totalLength / 2)
  assert.ok(lane.distanceTo(mid.x, mid.y) < 1e-6, 'a point on the lane is zero away from it')
  assert.ok(lane.distanceTo(mid.x, mid.y - 100) > 40, 'a point beside the lane is not on it')
})

// ------------------------------------------------------------ buildable spots

test('there are seven pads, so placement is a decision', () => {
  // With a four-tower cap, two dozen pads meant almost every choice covered
  // the same ground. Seven means picking a stretch to defend.
  assert.equal(spots.length, 7, `${spots.length} build pads; the map is designed for 7`)
  assert.ok(map.spotRadius > 16, 'a pad smaller than this is hard to click')
})

test('each pad owns its own stretch of the walk', () => {
  // Two pads close enough to cover the same bend are one decision spent twice.
  const towerRange = Math.min(...Object.values(read('towers')).map((t: any) => t.range))
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const d = Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1])
      assert.ok(d > towerRange, `pads ${i} and ${j} are ${d.toFixed(0)}px apart, inside one tower's ${towerRange}px range`)
    }
  }
})

test('a tower on any pad stays clear of the HUD bar', () => {
  // Towers are anchored at their base and drawn upwards, so a pad too high on
  // the map hides a tower's roof behind the HUD.
  const art = read('art')
  const tallest = Math.max(...Object.values(read('towers'))
    .map((t: any) => art.render[t.sprite].displayHeight))
  for (const [i, [, y]] of spots.entries()) {
    assert.ok(y - tallest > display.hudHeight,
      `pad ${i} at y=${y} puts a ${tallest}px tower behind the ${display.hudHeight}px HUD`)
  }
})

test('every spot sits on open ground beside the road, never on it', () => {
  const r = map.spotRadius
  for (const [i, [x, y]] of spots.entries()) {
    assert.ok(x - r > 0 && x + r < display.width, `spot ${i} hangs off the plate horizontally`)
    assert.ok(y - r > 0 && y + r < display.height, `spot ${i} hangs off the plate vertically`)
    const clear = lane.distanceTo(x, y)
    assert.ok(clear > r + 20, `spot ${i} is only ${clear.toFixed(0)}px from the road; a tower would stand in it`)
  }
})

test('no two spots overlap, so every highlight is its own click target', () => {
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const d = Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1])
      assert.ok(d > map.spotRadius * 2,
        `spots ${i} and ${j} are ${d.toFixed(0)}px apart and their highlights overlap`)
    }
  }
})

test('spots cover the whole walk, not just the near end', () => {
  // Enemies enter and leave off-screen, so the buildable stretch is the part
  // of the walk that is actually on the plate.
  const onPlate = map.waypoints.filter((w: number[]) => w[0] >= 0 && w[0] <= display.width)
  const visibleStart = laneFraction(onPlate[0][0], onPlate[0][1])
  const visibleEnd = laneFraction(onPlate[onPlate.length - 1][0], onPlate[onPlate.length - 1][1])
  const fractions = spots.map(([x, y]) => laneFraction(x, y)).sort((a, b) => a - b)

  assert.ok(fractions[0] < visibleStart + 0.1, 'nothing guards the entrance')
  assert.ok(fractions[fractions.length - 1] > visibleEnd - 0.1, 'nothing guards the gate')
  // Seven pads across roughly three quarters of the visible walk leaves real
  // gaps by design; what matters is that no gap is big enough to be a hole.
  for (let i = 1; i < fractions.length; i++) {
    assert.ok(fractions[i] - fractions[i - 1] < 0.28,
      `a ${((fractions[i] - fractions[i - 1]) * 100).toFixed(0)}% stretch of the walk has no pad beside it`)
  }
  console.log(`   spots: ${spots.length} covering ${(fractions[0] * 100).toFixed(0)}%` +
    `-${(fractions[fractions.length - 1] * 100).toFixed(0)}% of the walk`)
})

/**
 * THE HERO STARTS AT THE CENTRE OF THE BOARD, ON EVERY LEVEL.
 *
 * This replaces a per-map `heroStart`, and it replaces three separate tests --
 * one per level -- that each checked a different measured value against a
 * different set of clearances. The old scheme owed every new painting a
 * measurement, and level 2 shipped one that put the hero's head above the top
 * of the board because nothing checked it until afterwards. A rule that is the
 * same on every map cannot go wrong that way, and it is checked here once for
 * all of them.
 *
 * What is NOT claimed any more is roadside clearance. Level 3's centre is
 * 20.9 px outside its road's edge, so his footprint overlaps the track; that
 * is a consequence of the rule and is recorded rather than asserted away.
 */
test('the hero starts at the centre of the board, on every level', () => {
  const HERO_HEIGHT = 120
  const cx = display.width / 2
  const cy = display.height / 2

  for (const name of ['map', 'map_level2', 'map_level3']) {
    const m = read(name)
    assert.equal(m.heroStart, undefined, `${name} still declares a heroStart`)
    assert.equal(m._heroStart, undefined, `${name} still carries a heroStart note`)

    // FEET, so the head is HERO_HEIGHT above and the sprite has to clear the
    // top edge as well as the bottom one.
    assert.ok(cy - HERO_HEIGHT > 0,
      `his head is at y=${cy - HERO_HEIGHT}, off the top of the board`)
    assert.ok(cy < display.height && cx > 0 && cx < display.width,
      'the centre of the board is not on the board')

    // Not standing IN the road on any of them. The margin varies by map and is
    // reported by the level reports rather than fixed here.
    const routes: number[][][] = m.lanes
      ? Object.values(m.lanes as Record<string, { waypoints: number[][] }>).map((l) => l.waypoints)
      : []
    if (m.waypoints) routes.push(m.waypoints)
    const clear = Math.min(...routes.map((r) => new Path(r).distanceTo(cx, cy))) - m.roadWidth / 2
    assert.ok(clear > 0, `${name}: the hero starts ${clear.toFixed(1)}px inside the road`)
  }

  // And nothing reads a per-map value any more.
  const game = readFileSync(new URL('../src/scenes/GameScene.ts', import.meta.url), 'utf8')
  assert.match(game, /const HERO_START: readonly \[number, number\] = \[displayData\.width \/ 2, displayData\.height \/ 2\]/,
    'the hero start is not the centre of the design box')
  assert.doesNotMatch(
    game.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n'),
    /map\.heroStart/, 'something still reads a per-map hero start')
})

// --------------------------------------------------------------- build system

test('a click lands on the nearest spot, and only within its radius', () => {
  const b = new BuildSystem(map.buildSpots, map.spotRadius)
  const [x, y] = spots[3]
  assert.equal(b.spotAt(x, y)!.index, 3, 'a click dead centre misses its own spot')
  assert.equal(b.spotAt(x + map.spotRadius - 1, y)!.index, 3, 'the edge of a spot should still be clickable')
  assert.equal(b.spotAt(x, y + map.spotRadius + 5), null, 'clicks outside a spot must not build')
  assert.equal(b.spotAt(-500, -500), null)
})

test('one tower per spot, and selling frees it again', () => {
  const b = new BuildSystem(map.buildSpots, map.spotRadius)
  assert.equal(b.freeSpots().length, spots.length)
  assert.equal(b.isFree(0), true)
  b.occupy(0)
  assert.equal(b.isFree(0), false)
  assert.equal(b.towerCount, 1)
  assert.equal(b.freeSpots().length, spots.length - 1)
  assert.ok(!b.freeSpots().some((s) => s.index === 0), 'an occupied spot must not offer itself again')
  b.release(0)
  assert.equal(b.isFree(0), true, 'taking a tower off a spot should free it')
  assert.equal(b.towerCount, 0)
  assert.equal(b.isFree(-1), false)
  assert.equal(b.isFree(spots.length), false)
})

// ---------------------------------------------------------------- unit facing

test('art drawn facing right mirrors only when the walk turns left', () => {
  const dz = read('presentation').facing.deadZone
  const R = 0, L = Math.PI, DOWN = Math.PI / 2, UP = -Math.PI / 2
  assert.equal(facesLeft(R, false, dz), false, 'walking east should not flip')
  assert.equal(facesLeft(L, false, dz), true, 'walking west should flip')
  assert.equal(facesLeft(R, true, dz), false, 'walking east again should unflip')
  // Diagonals commit to a side.
  assert.equal(facesLeft(Math.PI * 0.75, false, dz), true, 'north-west faces left')
  assert.equal(facesLeft(Math.PI * 0.25, true, dz), false, 'south-east faces right')
})

test('a near-vertical stretch of lane never spins a unit on the spot', () => {
  const dz = read('presentation').facing.deadZone
  // Straight down and straight up: the sideways component is noise either way,
  // so whatever the unit was facing is what it keeps.
  for (const angle of [Math.PI / 2, -Math.PI / 2]) {
    assert.equal(facesLeft(angle, true, dz), true)
    assert.equal(facesLeft(angle, false, dz), false)
  }
  // The dead zone has to be wide enough to cover this map's steepest leg,
  // which drifts 3px west while dropping 92px.
  const steepest = map.waypoints
    .slice(1)
    .map((w: number[], i: number) => [w[0] - map.waypoints[i][0], w[1] - map.waypoints[i][1]])
    .filter(([dx]: number[]) => dx < 0)
  for (const [dx, dy] of steepest) {
    const angle = Math.atan2(dy, dx)
    assert.equal(facesLeft(angle, false, dz), false,
      `a leg drifting ${dx.toFixed(1)}px west over ${Math.abs(dy).toFixed(0)}px should not flip anyone`)
  }
})

// ----------------------------------------------------------------- combat bits

test('targeting picks furthest along, nearest, and radius', () => {
  const mk = (x: number, y: number, distance: number, alive = true) => ({ x, y, distance, alive })
  const list = [mk(10, 0, 5), mk(20, 0, 90), mk(30, 0, 50), mk(15, 0, 999, false)]
  assert.equal(pickFirst(list, 0, 0, 100)!.distance, 90)
  assert.equal(pickNearest(list, 0, 0, 100)!.x, 10)
  assert.equal(pickFirst(list, 0, 0, 5), null)
  assert.equal(withinRadius(list, 0, 0, 25).length, 2)
})

test('spawner emits exactly the wave composition, honouring group delays', () => {
  for (const [i, wave] of waves.waves.entries()) {
    const s = new WaveSpawner()
    s.begin(wave)
    const counts: Record<string, number> = {}
    let guard = 0
    while (!s.done && guard++ < 200000) {
      for (const sp of s.update(1 / 60)) counts[sp.enemy] = (counts[sp.enemy] ?? 0) + 1
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
  const ids = (out: { enemy: string }[]) => out.map((o) => o.enemy)
  assert.deepEqual(ids(s.update(0.1)), ['a'], 'undelayed group spawns immediately')
  assert.deepEqual(ids(s.update(1)), [], 'delayed group must not spawn yet')
  assert.deepEqual(ids(s.update(5)), ['b'], 'delayed group spawns after its delay')
})

test('a group carries its lane, and defaults to none for the map to resolve', () => {
  // The spawner does not know what lanes a map has and must not: it passes the
  // name through, and LaneNetwork.lane turns undefined into the main lane.
  const s = new WaveSpawner()
  s.begin({ name: 't', spawns: [
    { enemy: 'a', count: 1, interval: 1, delay: 0, lane: 'west' },
    { enemy: 'b', count: 1, interval: 1, delay: 0 },
  ] })
  const out = s.update(0.1)
  assert.deepEqual(out.map((o) => [o.enemy, o.lane]), [['a', 'west'], ['b', undefined]])
})

test('spawner pays out backlog on a long frame', () => {
  const s = new WaveSpawner()
  s.begin({ name: 't', spawns: [{ enemy: 'x', count: 5, interval: 0.1, delay: 0 }] })
  assert.equal(s.update(10).length, 5)
  assert.ok(s.done)
})

/* ----------------------------------------------------- which way art faces */

test('every enemy declares which way its art is drawn', () => {
  // THE BUG THIS LOCKS OUT, and it has now happened twice. Enemy.ts carried a
  // bare `setFlipX(left)`, which is the statement "every enemy is drawn facing
  // right". That was true of all seven enemies that existed when it was
  // written and false of all five added for level 3, so the whole of level 3
  // walked backwards. The heroes had the identical bug with the identical
  // shape: a blanket rule in the renderer that was true of the only character
  // there was when it was written.
  //
  // The values were established by DECODING THE SPRITES AND LOOKING AT THEM,
  // not by reading filenames or trusting a brief -- the brief that reported
  // this said level 3's five were authored facing right, and they are not.
  const enemies = JSON.parse(
    readFileSync(new URL('../src/data/enemies.json', import.meta.url), 'utf8'))
  const facing: Record<string, string> = {}
  for (const [id, def] of Object.entries(enemies) as [string, any][]) {
    assert.ok(def.artFacing === 'left' || def.artFacing === 'right',
      `${id} does not say which way its art is drawn`)
    facing[id] = def.artFacing
  }
  // FOUR OF LEVEL 3'S FIVE FACE LEFT, NOT ALL FIVE. Stated rather than
  // derived, so re-exporting a sprite mirrored fails here.
  //
  // `unicornBoss` was on this list and should never have been. She is drawn
  // facing RIGHT -- horn-cannon, muzzle flash and head all to the right, tail
  // and rainbow to the left -- and she arrived in the same upload as the four
  // that really are drawn facing left, so hers was filled in with theirs. The
  // effect is the bug this whole test exists to lock out, arrived at from the
  // other direction: `mirroredFor` inverts on a wrong declaration exactly as
  // it did on a blanket rule, and the Rainbow Reaper walked the whole of level
  // 3 backwards.
  //
  // The comment above says these values were established by decoding the
  // sprites and looking at them. They were, and one of them was still wrong,
  // which is worth keeping on the record: LOOKING IS THE ONLY CHECK THERE IS
  // -- which way a picture faces cannot be derived from the picture -- so the
  // fix was to look at all eighteen rather than at the one that was reported.
  // The other seventeen agree with their declarations.
  assert.deepEqual(
    Object.entries(facing).filter(([, v]) => v === 'left').map(([k]) => k).sort(),
    ['catcher', 'longsnap', 'pompom', 'zamboni'],
    'the set of left-drawn enemies changed')
})

test('nothing decides facing with a bare flip any more', () => {
  // Both renderers ask the same shared function, and both pass the character's
  // own `artFacing`. A bare `setFlipX(left)` in either is the bug coming back.
  for (const f of ['entities/Enemy.ts', 'entities/Hero.ts']) {
    const code = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
    assert.match(code, /mirroredFor\(/, `${f} does not use the shared facing rule`)
    // Comments stripped: the note explaining what the old bare flip was would
    // otherwise fail this test for describing the bug it prevents.
    const live = code.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    assert.ok(!/setFlipX\(left\)/.test(live),
      `${f} flips straight from the heading, ignoring how its art was drawn`)
  }
  // And the opening frame counts: `face()` early-returns when the heading has
  // not changed, so an enemy that spawns walking the way it starts out facing
  // would never reach it and would stand there mirrored wrongly.
  const enemy = readFileSync(new URL('../src/entities/Enemy.ts', import.meta.url), 'utf8')
  assert.match(enemy, /const flip0 = mirroredFor\(this\.facingLeft, def\.artFacing\)/,
    'the opening flip is never applied')
})

test('a boss that walks through the line also walks through a slow', () => {
  // THE RAINBOW REAPER'S FIGHT IS A CLOCK: it disables towers on a cooldown
  // while it walks, and the player's job is to out-damage that clock. A
  // permanent 45% slow from one Deferral turns the clock off, which is the
  // same trick as parking an unblockable boss on a soldier -- and the reason
  // it is unblockable is that trick.
  //
  // Expressed as a flag on the enemy, beside `blockable`, rather than as a
  // rule about tiers: crowd-control immunity is a property of a character.
  const enemies = JSON.parse(
    readFileSync(new URL('../src/data/enemies.json', import.meta.url), 'utf8'))
  for (const [id, def] of Object.entries(enemies) as [string, any][]) {
    assert.equal(typeof def.slowable, 'boolean', `${id} does not say whether it can be slowed`)
  }
  assert.equal(enemies.unicornBoss.slowable, false, 'the Rainbow Reaper can be slowed')
  assert.equal(enemies.unicornBoss.blockable, false, 'the Rainbow Reaper can be blocked')

  // THE POLITICIAN IS DELIBERATELY STILL SLOWABLE. He is unblockable for the
  // same reason, but levels 1 and 2 are tuned around him as he is, and this
  // was a level 3 change. Stated so that "bosses resist crowd control" is not
  // quietly generalised into a balance change nobody measured.
  assert.equal(enemies.politician.slowable, true,
    'the Politician was made slow-immune, which retunes levels 1 and 2')

  // And BOTH the game and the simulator honour it, or the soak reports a boss
  // the game does not have.
  for (const f of ['../src/entities/Enemy.ts', '../tools/soak/Sim.ts']) {
    const code = readFileSync(new URL(f, import.meta.url), 'utf8')
    assert.match(code, /slowable\) return/, `${f} applies slows regardless of the flag`)
  }
})
