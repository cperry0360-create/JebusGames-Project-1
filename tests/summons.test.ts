import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LaneNetwork, MAIN_LANE } from '../src/systems/Lanes.ts'
import enemies from '../src/data/enemies.json' with { type: 'json' }

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const E = enemies as Record<string, any>

/**
 * The summoning rule, run headlessly.
 *
 * Enemy extends a Phaser container and cannot be built without a scene, so
 * what is exercised here is the arithmetic the scene and the entity both
 * implement: the burst timer, the cap counted over living children, and the
 * child starting at its parent's own place. The two source assertions at the
 * bottom hold GameScene and Sim to this same shape, so this is a model of the
 * rule rather than a second one.
 */
interface Mob {
  id: string
  def: any
  alive: boolean
  laneId: string
  laneDistance: number
  distance: number
  summonedBy: Mob | null
  summonTimer: number
}

const mob = (id: string, over: Partial<Mob> = {}): Mob => ({
  id,
  def: E[id] ?? { summons: undefined },
  alive: true,
  laneId: MAIN_LANE,
  laneDistance: 0,
  distance: 0,
  summonedBy: null,
  summonTimer: (E[id]?.summons?.interval) ?? 0,
  ...over,
})

/** One frame of summoning, the way GameScene.tickSummons does it. */
function tickSummons(field: Mob[], dt: number): void {
  for (const parent of [...field]) {
    const spec = parent.def.summons
    if (!spec || !parent.alive) continue
    parent.summonTimer -= dt
    let due = 0
    while (parent.summonTimer <= 0) { due += spec.count; parent.summonTimer += spec.interval }
    if (due <= 0) continue
    if (spec.cap !== undefined) {
      const alive = field.filter((e) => e.alive && e.summonedBy === parent).length
      due = Math.min(due, Math.max(0, spec.cap - alive))
    }
    for (let i = 0; i < due; i++) {
      field.push(mob(spec.enemy, {
        laneId: parent.laneId,
        laneDistance: parent.laneDistance,
        distance: parent.distance,
        summonedBy: parent,
      }))
    }
  }
}

/* ------------------------------------------------------------- the data */

test('the Devil summons underlings, capped, on a timer', () => {
  const d = E.theDevil
  assert.deepEqual(d.summons, { enemy: 'directReport', count: 1, interval: 5, cap: 6 })
  assert.ok(E[d.summons.enemy], 'the Devil summons an enemy that does not exist')
  // And the level 4 boss, in both his forms: the same block, two per burst
  // rather than one, and faster on the way back. Named rather than counted --
  // the point of the list is that a level cannot quietly GAIN a mechanic, and
  // a count would not notice the mechanic moving to a different enemy.
  const summoners = Object.entries(E).filter(([, v]) => (v as any).summons).map(([k]) => k)
  assert.deepEqual(summoners, ['theDevil', 'glitchLich', 'glitchLichReturn'])
  assert.deepEqual(E.glitchLich.summons, { enemy: 'tinyGlitch', count: 2, interval: 6, cap: 8 })
  assert.deepEqual(E.glitchLichReturn.summons, { enemy: 'tinyGlitch', count: 2, interval: 4, cap: 8 })
  assert.ok(E[E.glitchLich.summons.enemy], 'the Lich King summons an enemy that does not exist')
})

/* ------------------------------------------------- where children appear */

test('a child appears on its parent lane, at its parent progress', () => {
  // The point of carrying progress: a child called in three quarters of the
  // way down the lane carries on from there. Starting it at the gate would
  // give the player a free run back down the whole board.
  const field = [mob('theDevil', { laneDistance: 900, distance: 900 })]
  tickSummons(field, 5)
  assert.equal(field.length, 2)
  const child = field[1]!
  assert.equal(child.id, 'directReport')
  assert.equal(child.laneId, field[0]!.laneId, 'the child was not put on its parent lane')
  assert.equal(child.laneDistance, 900, 'the child did not start at its parent place on the lane')
  assert.equal(child.distance, 900, 'the child did not inherit its parent progress')
  assert.equal(child.summonedBy, field[0], 'the child does not know who called it')
})

test('a child called in on a branch inherits the branch and merges like its parent', () => {
  // On a fork the parent lane is the thing that decides the rest of the route,
  // so a child that started on "main" would take a different way to the exit
  // than the boss that called it.
  const net = new LaneNetwork({
    waypoints: [[400, 100], [1000, 100]],
    lanes: [{ id: 'west', waypoints: [[0, 0], [400, 100]], merge: { into: MAIN_LANE, atIndex: 0 } }],
  } as never)
  const field = [mob('theDevil', { laneId: 'west', laneDistance: 100, distance: 100 })]
  tickSummons(field, 5)
  const child = field[1]!
  assert.equal(child.laneId, 'west')
  // And from there it has the same route left as its parent does.
  assert.equal(net.routeLength('west') - child.laneDistance, net.routeLength('west') - 100)
})

/* ------------------------------------------------------------- the cap */

test('the cap holds, and refills only as children die', () => {
  const devil = mob('theDevil')
  const field = [devil]
  // Long enough for far more than six bursts.
  for (let t = 0; t < 200; t++) tickSummons(field, 1)
  const children = () => field.filter((e) => e.alive && e.summonedBy === devil).length
  assert.equal(children(), 6, `cap of 6 exceeded: ${children()} alive`)
  assert.equal(field.length, 7, 'more bodies were created than the cap allows')

  // Kill two: the summoner may top back up to the cap and no further.
  field.filter((e) => e.summonedBy === devil).slice(0, 2).forEach((e) => { e.alive = false })
  assert.equal(children(), 4)
  for (let t = 0; t < 100; t++) tickSummons(field, 1)
  assert.equal(children(), 6, 'the summoner did not refill to its cap, or went past it')
})

test('two summoners do not share one allowance', () => {
  const a = mob('theDevil')
  const b = mob('theDevil')
  const field = [a, b]
  for (let t = 0; t < 200; t++) tickSummons(field, 1)
  assert.equal(field.filter((e) => e.alive && e.summonedBy === a).length, 6)
  assert.equal(field.filter((e) => e.alive && e.summonedBy === b).length, 6)
})

test('the first burst waits a full interval', () => {
  // A boss that arrived with a crowd already around it would be a different
  // fight from the one the interval describes.
  const field = [mob('theDevil')]
  tickSummons(field, 4.9)
  assert.equal(field.length, 1, 'the Devil summoned before his first interval elapsed')
  tickSummons(field, 0.2)
  assert.equal(field.length, 2)
})

/* --------------------------------------------- wave completion, and death */

test('wave completion ignores summons but waits for scripted spawns', () => {
  // The rule both the scene and the sim use: a wave is over when what it SENT
  // is gone. A summoner that kept bursting would otherwise hold the wave open
  // for as long as it could summon.
  const over = (field: Mob[]) => !field.some((e) => e.alive && e.summonedBy === null)

  const devil = mob('theDevil')
  const field = [devil, mob('directReport')]
  assert.equal(over(field), false, 'the wave ended with scripted spawns still alive')

  for (let t = 0; t < 60; t++) tickSummons(field, 1)
  assert.ok(field.filter((e) => e.summonedBy).length > 0, 'nothing was summoned to test with')
  assert.equal(over(field), false, 'still scripted spawns alive')

  // Kill only the scripted ones. The summons remain on the field, and the wave
  // is nonetheless over.
  field.filter((e) => e.summonedBy === null).forEach((e) => { e.alive = false })
  assert.ok(field.some((e) => e.alive), 'the summons should still be standing')
  assert.equal(over(field), true, 'the wave waited for summons that are not its own')
})

test('children outlive the parent, and stay its children', () => {
  const devil = mob('theDevil')
  const field = [devil]
  for (let t = 0; t < 30; t++) tickSummons(field, 1)
  const born = field.filter((e) => e.summonedBy === devil).length
  assert.ok(born > 0)

  devil.alive = false
  for (let t = 0; t < 30; t++) tickSummons(field, 1)

  assert.equal(field.filter((e) => e.alive && e.summonedBy === devil).length, born,
    'the children died with their parent, or the corpse kept summoning')
  // Still attributed to the dead summoner, so a live one's allowance is not
  // charged for them.
  assert.ok(field.filter((e) => e.summonedBy === devil).every((e) => e.summonedBy === devil))
})

/* --------------------------------------------------------------- wiring */

test('the scene and the sim summon by the same rule', () => {
  const game = src('scenes/GameScene.ts')
  // Cap counted over children still pointing at THIS parent.
  assert.match(game, /this\.enemies\.filter\(\(e\) => e\.summonedBy === parent\)\.length/,
    'the cap is not counted per summoner')
  // Child placed at the parent's own point on the parent's own lane.
  assert.match(game, /startAt: \{ laneDistance: at\.laneDistance, distance: at\.distance \}/,
    'the child does not start at its parent place')
  assert.match(game, /laneId: at\.laneId/, 'the child is not put on its parent lane')
  // Wave completion ignores summons.
  assert.match(game, /this\.enemies\.some\(\(e\) => !e\.summoned\)/,
    'the wave-over check no longer ignores summons')

  const sim = readFileSync(new URL('../tools/soak/Sim.ts', import.meta.url), 'utf8')
  assert.match(sim, /e\.summonedBy === parent/, 'the sim does not cap per summoner')
  assert.match(sim, /!enemies\.some\(\(e\) => e\.summonedBy === null\)/,
    'the sim wave-over does not ignore summons, so its numbers would not match the game')
  assert.match(sim, /spawn\(spec\.enemy, parent\.distance, parent, parent\.laneId, parent\.laneDistance\)/,
    'the sim does not summon at the parent distance, on the parent lane')
})

test('a summoned child pays its normal bounty', () => {
  // Nothing anywhere reduces or zeroes the reward for a summoned enemy: the
  // bounty is a property of the DEF, and a child is an ordinary enemy of that
  // def in every respect but wave accounting.
  const game = src('scenes/GameScene.ts')
  const sim = readFileSync(new URL('../tools/soak/Sim.ts', import.meta.url), 'utf8')
  for (const [name, code] of [['GameScene', game], ['Sim', sim]] as const) {
    assert.ok(!/summon\w*[\s\S]{0,80}peanutReward\s*[*=]\s*0/i.test(code),
      `${name} zeroes the bounty for a summoned enemy`)
  }
  assert.ok(E.directReport.peanutReward > 0, 'the underling pays nothing to begin with')
})
