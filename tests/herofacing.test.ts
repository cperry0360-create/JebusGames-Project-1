import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nearest, restFacingTarget, spawnLaneIds } from '../src/systems/HeroFacing.ts'
import { facesLeft, mirroredFor } from '../src/systems/Facing.ts'
import { LaneNetwork, MAIN_LANE } from '../src/systems/Lanes.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

/** Every level, as the pair this module needs: its map and its wave table. */
const LEVELS: Array<[string, string, string]> = [
  ['level 1', 'map', 'waves'],
  ['level 2', 'map_level2', 'waves.level2'],
  ['level 3', 'map_level3', 'waves.level3'],
  ['level 4', 'map_level4', 'waves.level4'],
]

test('a hero with something to look at looks at the nearest of it', () => {
  const arrivals = [{ x: 0, y: 0 }]
  const hero = { x: 500, y: 300 }
  const near = { x: 540, y: 300 }
  assert.deepEqual(restFacingTarget(hero, near, arrivals), near,
    'an enemy on the board loses to a gate on the other side of the map')
  // AT ANY DISTANCE. The whole point of asking `pickNearest` without a range
  // is that `attackRange` is 70-122 world pixels on a 1280px board, so a hero
  // can watch a wave walk the length of the map with his back to it.
  const far = { x: 1240, y: 300 }
  assert.deepEqual(restFacingTarget(hero, far, arrivals), far)
})

test('an empty board sends the hero back to the nearest gate', () => {
  const hero = { x: 500, y: 300 }
  const gates = [{ x: -60, y: 178 }, { x: -60, y: 653 }]
  const look = restFacingTarget(hero, null, gates)
  assert.deepEqual(look, gates[0], 'the wrong gate of two')
  // Moved down the board and the other gate wins, which is the whole reason
  // this is a list rather than the word "left".
  assert.deepEqual(restFacingTarget({ x: 500, y: 600 }, null, gates), gates[1])
})

test('nothing to look at at all keeps the facing there is', () => {
  // NULL IS A REAL ANSWER. `atan2(0, 0)` is 0, which is "face east" chosen by
  // nothing at all, and a sprite that snaps to a default is the shape of bug
  // that spins on the spot.
  assert.equal(restFacingTarget({ x: 5, y: 5 }, null, []), null)
  assert.equal(nearest({ x: 5, y: 5 }, []), null)
  // Standing exactly on the only candidate is the same case.
  assert.equal(nearest({ x: 5, y: 5 }, [{ x: 5, y: 5 }]), null)
  assert.equal(nearest({ x: 5, y: 5 }, [{ x: 5.4, y: 5 }]), null, 'half a pixel is not a direction')
})

test('every level resolves its gates from its own data, and none of them is "left"', () => {
  for (const [name, mapFile, wavesFile] of LEVELS) {
    const map = read(mapFile)
    const waves = read(wavesFile)
    const ids = spawnLaneIds(waves)
    assert.ok(ids.length > 0, `${name} resolves no spawn lane at all`)
    const lanes = new LaneNetwork(map)
    for (const id of ids) {
      assert.ok(lanes.has(id), `${name} spawns on lane "${id}", which its map does not declare`)
    }
    const points = ids.map((id) => lanes.lane(id).path.pointAt(0))
    // A GATE IS OFF THE PLATE. Every one of these should be outside the
    // 1280x720 board, because that is what a gate is: enemies walk in from
    // off-screen. This is the assertion that catches the mistake worth
    // catching -- level 3 declares a `main` lane that is NOT a gate, whose
    // first waypoint is at (733, 378), in the middle of the road. Resolving
    // gates from the lane list rather than from the wave table would put one
    // there and the hero would spend the level staring at it.
    for (const [i, p] of points.entries()) {
      const off = p.x < 0 || p.x > 1280 || p.y < 0 || p.y > 720
      assert.ok(off,
        `${name} gate "${ids[i]}" starts at ${Math.round(p.x)},${Math.round(p.y)}, `
        + 'which is on the board rather than off it')
    }
  }
})

test('level 3 and 4 have two gates and level 1 and 2 have one', () => {
  // The reason the direction cannot be a constant. Levels 3 and 4 have two
  // arches that merge, so which way "enemies arrive from" points depends on
  // where the hero is standing.
  assert.equal(spawnLaneIds(read('waves')).length, 1)
  assert.deepEqual(spawnLaneIds(read('waves')), [MAIN_LANE],
    'a wave group that names no lane must resolve to the trunk')
  assert.equal(spawnLaneIds(read('waves.level2')).length, 1)
  assert.deepEqual(spawnLaneIds(read('waves.level3')).sort(), ['lower', 'upper'])
  assert.deepEqual(spawnLaneIds(read('waves.level4')).sort(), ['lower', 'upper'])
  // And level 3's trunk is deliberately NOT among them.
  assert.ok(!spawnLaneIds(read('waves.level3')).includes(MAIN_LANE),
    'the trunk is being treated as a gate')
})

test('the hero asks for a resting facing, and does not hardcode a side', () => {
  const hero = src('entities/Hero.ts')
  assert.match(hero, /restFacingTarget\(/, 'the hero never asks which way to look at rest')
  assert.match(hero, /pickNearest\(enemies, this\.x, this\.y, Infinity\)/,
    'the resting look is limited to attack range, so a hero ignores a wave crossing the map')
  // The direction comes from the scene, from map data.
  assert.match(hero, /arrivalPoints/, 'the hero has no idea where enemies come from')
  const scene = src('scenes/GameScene.ts')
  assert.match(scene, /this\.hero\.arrivalPoints = spawnLaneIds\(/,
    'the scene never tells the hero where the gates are')
})

test('every enemy declares which way its art is drawn, and the unicorn faces right', () => {
  const enemies = read('enemies')
  const entries = Object.entries(enemies)
    .filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object') as [string, any][]
  for (const [id, e] of entries) {
    assert.ok(['left', 'right'].includes(e.artFacing), `${id} does not declare its facing`)
  }
  // THE REPORTED BACKWARDS BOSS. She is drawn facing right -- checked against
  // the pixels -- and was declared left, which inverts `mirroredFor` and walked
  // her the whole of level 3 back to front. She was reported as the level 1
  // boss; level 1's boss is the Politician, who is right and always was.
  assert.equal(enemies.unicornBoss.artFacing, 'right',
    'the Rainbow Reaper is drawn facing right; declaring left walks her backwards')
  assert.equal(enemies.politician.artFacing, 'right')
  // The four she arrived with really ARE drawn facing left, which is how hers
  // came to be filled in wrongly. They are the regression risk if anybody
  // "tidies" the file to one value.
  for (const id of ['pompom', 'longsnap', 'catcher', 'zamboni']) {
    assert.equal(enemies[id].artFacing, 'left', `${id} is drawn facing left`)
  }

  // And the rule the declaration feeds: mirrored exactly when the heading
  // disagrees with the art. Driven end to end for both kinds of art, because
  // the enemies are the only characters left that use the 'left' branch.
  for (const [angle, goingLeft] of [[0, false], [Math.PI, true]] as const) {
    const heading = facesLeft(angle, false, 0.2)
    assert.equal(heading, goingLeft)
    assert.equal(mirroredFor(heading, 'right'), goingLeft)
    assert.equal(mirroredFor(heading, 'left'), !goingLeft)
  }
})
