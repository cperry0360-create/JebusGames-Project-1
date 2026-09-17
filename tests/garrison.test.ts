/**
 * THE THREE IMA DUMMY TOWER BUGS, and what a node run can actually hold of them.
 *
 * The tower's data and its rally geometry are `tests/blocking.test.ts`. This is
 * the three faults that lived in the SCENE:
 *
 *   1. a lad never swung at a boss, because the scene only ever handed him the
 *      enemy that was holding still for him and a boss is never held;
 *   2. the lads could not be moved by any sequence of taps, because the rally
 *      mode was armed behind a ring that `onClick` dismisses first;
 *   3. selling the tower left its lads on the road forever, because nothing
 *      took the garrison out of `this.garrisons`.
 *
 * WHAT THIS FILE CAN AND CANNOT DO. No test here can see Phaser (CLAUDE.md),
 * so the first and third are checked against the real rules pulled out into
 * `src/systems/Garrison.ts` and driven headlessly, and the parts that are
 * genuinely scene-shaped -- which branch of `onClick` runs first, what is on
 * the ring -- are checked by reading GameScene as TEXT, the way
 * `tests/blocking.test.ts` and `tests/boardinput.test.ts` already do.
 *
 * `tools/harness/run.sh lads` is the half that presses the buttons on a
 * rendered frame, and it is the only thing that can.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { removeGarrison, swingTarget, unblockableNear } from '../src/systems/Garrison.ts'
import { statAt } from '../src/systems/Upgrades.ts'
import towers from '../src/data/towers.json' with { type: 'json' }
import enemies from '../src/data/enemies.json' with { type: 'json' }

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const SCENE = src('src/scenes/GameScene.ts')
const T = towers as Record<string, any>
const E = enemies as Record<string, any>
const D = T.imaDummy

const RANGE: number = D.soldierBlockRange
const DAMAGE = statAt(D, 1, 'soldierDamage' as never, null)
const INTERVAL = statAt(D, 1, 'soldierInterval' as never, null)

/** The body of one method of GameScene, for the ordering assertions below. */
function methodBody(name: string): string {
  // ANCHORED ON THE DECLARATION, which means the line start and the class's own
  // two-space indent. A bare `indexOf(name + '(')` finds the first CALL instead
  // and slices four lines out of the middle of another method -- which it did,
  // and the assertion that caught it read as a missing feature.
  const decl = new RegExp(`\n  (?:private |public )?${name}\\(`)
  const m = decl.exec(SCENE)
  assert.ok(m, `GameScene has no ${name}`)
  const at = m!.index
  const next = SCENE.indexOf('\n  }\n', at)
  assert.ok(next > at, `could not find the end of ${name}`)
  return SCENE.slice(at, next)
}

/* ------------------------------------------------- 1. the lads and the boss */

/**
 * One enemy walking through one lad, with the scene's own two rules in it.
 *
 * The engagement half is `tickEngagement`'s: a hold is taken only by a
 * BLOCKABLE enemy, kept until it is no longer possible, and a held enemy does
 * not move. The swinging half is the real `swingTarget` and `Soldier.tick`'s
 * timing -- the clock counts down every frame and a swing lands when it
 * crosses zero, whether or not there was anything to hit.
 */
function walkPast(def: any, opts: { lads?: number } = {}) {
  const dt = 1 / 60
  const START = -300
  const enemy = {
    alive: true, x: START, y: 0, blockable: def.blockable as boolean,
    health: def.maxHealth as number, blocker: null as unknown,
  }
  const lads = Array.from({ length: opts.lads ?? 1 }, (_, i) => ({
    x: 0, y: i * 10, attackTimer: 0,
  }))
  let hits = 0
  let everHeld = false
  let framesStopped = 0
  for (let f = 0; f < 60 * 40; f++) {
    // tickEngagement, reduced to one enemy: released when it cannot be held,
    // and taken only when it may be.
    const holder = enemy.blocker as { x: number; y: number } | null
    if (holder && (!enemy.alive || !enemy.blockable
        || Math.hypot(enemy.x - holder.x, enemy.y - holder.y) > RANGE)) {
      enemy.blocker = null
    }
    if (!enemy.blocker && enemy.blockable) {
      const free = lads.find((l) => Math.hypot(enemy.x - l.x, enemy.y - l.y) <= RANGE)
      if (free) { enemy.blocker = free; everHeld = true }
    }
    for (const lad of lads) {
      const held = enemy.blocker === lad ? enemy : null
      const target = swingTarget(held, [enemy], lad.x, lad.y, RANGE)
      lad.attackTimer -= dt
      if (target && lad.attackTimer <= 0) {
        lad.attackTimer = INTERVAL
        enemy.health -= DAMAGE
        hits++
      }
    }
    if (enemy.blocker) framesStopped++
    else enemy.x += def.speed * dt
  }
  return { enemy, hits, everHeld, framesStopped }
}

test('a boss walking past a garrison takes damage and is not held', () => {
  const boss = E.theDevil
  assert.equal(boss.blockable, false, 'the fixture stopped being an unblockable boss')
  const run = walkPast(boss, { lads: 2 })

  // IT TOOK HITS. This is the bug: before the fix a lad was only ever handed
  // the enemy HOLDING STILL for him, and a boss never holds still for anybody,
  // so every boss in the game walked through a line of lads untouched.
  assert.ok(run.hits > 0, 'the lads never swung at the boss')
  assert.ok(run.enemy.health < boss.maxHealth,
    `the boss came through on full health (${run.enemy.health}/${boss.maxHealth})`)

  // AND IT WAS NOT HELD, which is the other half and is the more important
  // half: a boss that can be parked on two lads is a fight switched off.
  assert.equal(run.enemy.blocker, null, 'a lad took hold of the boss')
  assert.equal(run.everHeld, false, 'the boss was held at some point on the way past')
  assert.equal(run.framesStopped, 0, 'the boss stopped walking')
  assert.ok(run.enemy.x > RANGE, `the boss only reached ${Math.round(run.enemy.x)}`)

  // A CHIP, NOT A WALL. Two lads at tier 1 get a handful of swings in as it
  // crosses the 92px they can reach -- before armour, which `damageEnemy`
  // takes off in the scene. Worth writing down so the number is not mistaken
  // for a way to kill a boss with a tower that has no gun.
  const window = (2 * RANGE) / boss.speed
  assert.ok(run.hits <= Math.ceil(window / INTERVAL) * 2 + 2,
    `${run.hits} swings is more than two lads can land in ${window.toFixed(1)}s`)
})

test('a rank-and-file enemy is still held, and held is still what a lad swings at', () => {
  // The regression the fix above could have caused: a lad who goes looking for
  // something to hit must not stop holding what is already in front of him.
  const run = walkPast(E.lateFiler, { lads: 1 })
  assert.equal(run.everHeld, true, 'a blockable enemy walked through the lad')
  assert.ok(run.framesStopped > 0, 'a blockable enemy was never stopped')
  assert.ok(run.hits > 0, 'a held enemy was never hit')
})

test('swingTarget keeps the held enemy even when something else is nearer', () => {
  const held = { alive: true, x: 40, y: 0, blockable: true }
  const boss = { alive: true, x: 1, y: 0, blockable: false }
  assert.equal(swingTarget(held, [held, boss], 0, 0, RANGE), held,
    'a lad in a fight wandered off to swing at something else')
})

test('a lad with nothing to hold swings at the nearest thing he may not hold', () => {
  const near = { alive: true, x: 10, y: 0, blockable: false }
  const far = { alive: true, x: 30, y: 0, blockable: false }
  assert.equal(unblockableNear([far, near], 0, 0, RANGE), near)
  // Out of reach, dead, and fighting for the player: all three are skipped.
  assert.equal(unblockableNear([{ alive: true, x: RANGE + 1, y: 0, blockable: false }],
    0, 0, RANGE), null, 'a lad reached past his own block range')
  assert.equal(unblockableNear([{ alive: false, x: 5, y: 0, blockable: false }],
    0, 0, RANGE), null, 'a lad swung at a corpse')
  assert.equal(unblockableNear([{ alive: true, x: 5, y: 0, blockable: false, controlled: true }],
    0, 0, RANGE), null, 'a lad swung at a mind-controlled enemy fighting for the player')
  // And never anything holdable: that one comes through the engagement pass,
  // and grabbing it here would be a second, silent hold.
  assert.equal(unblockableNear([{ alive: true, x: 5, y: 0, blockable: true }],
    0, 0, RANGE), null, 'the unheld path picked up a blockable enemy')
})

test('the scene swings with the same damage, interval and rage as a held blow', () => {
  const body = methodBody('tickGarrisons')
  assert.match(body, /const target = swingTarget\(\s*held\.get\(s\) \?\? null, this\.enemies, s\.x, s\.y, g\.tower\.soldierBlockRange\)/,
    'tickGarrisons does not ask swingTarget for a target')
  // The multipliers are computed ABOVE the call and passed unchanged, so the
  // free swing cannot drift away from the held one.
  const damageAt = body.indexOf('const damage =')
  const intervalAt = body.indexOf('const interval =')
  const targetAt = body.indexOf('const target =')
  assert.ok(damageAt > 0 && intervalAt > damageAt && targetAt > intervalAt,
    'the rage multipliers are no longer computed before the swing')
  assert.match(body, /s\.tick\(dt, target, g\.tower\.soldierRespawn, damage, interval,/,
    'the soldier is ticked with something other than the chosen target')
  // NOTHING SETS `blocker` HERE. The swing must not turn into a hold.
  assert.doesNotMatch(body, /\.blocker\s*=/, 'tickGarrisons assigns a blocker')
})

/* --------------------------------------------------- 2. moving the lads */

test('the Ima Dummy Tower ring carries a MOVE button with the flag on it', () => {
  const body = methodBody('towerRingOptions')
  const at = body.indexOf("id: 'move'")
  assert.ok(at > 0, 'there is no move option on the tower ring at all')
  const opt = body.slice(at, at + 700)
  assert.match(opt, /slot: 3/, 'MOVE is not nailed to its own slot')
  assert.match(opt, /sprite: ART\.generated\.rallyFlag/, 'the MOVE button has no flag on it')
  assert.match(opt, /price: null/, 'moving the lads costs peanuts')
  assert.match(opt, /confirmLabel: 'Move'/)
  assert.match(opt, /onConfirm: \(\) => this\.beginRally\(tower\)/,
    'MOVE does not arm the rally mode')
  // Deployers only: a tower whose lads do not exist has nothing to move.
  assert.match(body.slice(Math.max(0, at - 400), at), /if \(tower\.isDeployer\) \{/,
    'every tower now offers MOVE')

  // The flag is a real texture rather than the missing-icon box.
  assert.match(src('src/data/art.json'), /"rallyFlag": "generated-rally-flag"/)
  assert.match(src('src/scenes/BootScene.ts'), /ensureRallyFlagTexture\(this\)/,
    'the flag texture is never generated, so the button draws the fallback')

  // FOUR SLOTS, ALWAYS FOUR. The reserved-slot rule in `towerRingOptions` is
  // about a button never moving under a thumb between one state and the next;
  // a deploying tower has one more of them and has it at every tier.
  assert.match(methodBody('openTowerRing'), /tower\.isDeployer \? 4 : 3/,
    'the deploying tower\'s fourth slot is not reserved')
})

test('MOVE arms the mode, says so, and leaves the tower selected', () => {
  const body = methodBody('beginRally')
  assert.match(body, /this\.ring\?\.close\(\)/, 'the ring is left open over the board')
  assert.match(body, /this\.targeting\.arm\(\{ kind: 'rally', id: this\.towerKey\(tower\) \}\)/,
    'MOVE does not arm a rally request')
  assert.match(body, /this\.selected = tower/,
    'the selection is dropped, which syncTargeting reads as a reason to disarm')
  assert.match(body, /this\.syncTargeting\(\)/, 'the wash and CANCEL are never drawn')
  assert.match(body, /'Tap the road to move the lads, or CANCEL'/,
    'the mode arms without saying what it is waiting for')

  // AND SELECTING THE TOWER NO LONGER ARMS IT. That is the bug: the mode armed
  // itself behind the ring that the same tap opens.
  const select = methodBody('selectTower')
  assert.doesNotMatch(select, /targeting\.arm\(/,
    'selectTower still arms the rally mode behind its own ring')
})

test('a ground tap with the mode armed moves the lads before the ring is dismissed', () => {
  const body = methodBody('onClick')
  const rally = body.indexOf('this.orderRally(this.selected, w.x, w.y)')
  const dismiss = body.indexOf('if (this.ring?.active) {')
  const tower = body.indexOf('const tower = this.towerAt(w.x, w.y)')
  assert.ok(rally > 0, 'onClick can no longer order a rally at all')
  assert.ok(dismiss > 0 && tower > 0)
  // THE WHOLE OF BUG 2 IS THIS ORDERING. A tap on the road while the lads are
  // waiting to be posted must not be spent closing a menu.
  assert.ok(rally < dismiss,
    'the ring dismissal still runs before the rally order, so the tap is swallowed')
  assert.ok(dismiss < tower, 'the ring dismissal moved, which is not what this fixes')

  // Gated on the MODE, and still yielding to anything more specific than bare
  // ground -- a pad, another tower, the hero.
  const branch = body.slice(rally - 400, rally)
  assert.match(branch, /this\.rallyArmed\(\)/, 'the branch fires on selection rather than mode')
  assert.match(branch, /!this\.towerAt\(w\.x, w\.y\)/, 'a tap on the next tower became an order')
  assert.match(branch, /!this\.hero\.hits\(w\.x, w\.y\)/, 'a tap on the hero became an order')
  const pad = body.indexOf('const spot = this.build.spotAt(w.x, w.y)')
  assert.ok(pad > 0 && pad < rally, 'a tap on a build pad is now eaten by the rally order')

  // `rallyArmed` reads the request rather than a second boolean beside it.
  const armed = methodBody('rallyArmed')
  assert.match(armed, /this\.targeting\.request/)
  assert.match(armed, /req\?\.kind !== 'rally'/)
})

test('the rally point carries a flag whenever the tower is selected', () => {
  const body = methodBody('drawRallyMark')
  assert.match(body, /flagInto\(g, spot\.x, spot\.y, cfg\.markSize\)/,
    'the rally mark is still two rings and nothing else')
  // Drawn on SELECTION, not only once the mode is armed.
  const select = methodBody('selectTower')
  assert.match(select, /this\.drawRallyMark\(g\?\.rally \?\? null\)/,
    'selecting the tower no longer shows where the lads are posted')
  // One shape, one function: the button's picture and the board's mark.
  const present = src('src/systems/Presentation.ts')
  assert.match(present, /export function flagInto\(/)
  assert.match(present.slice(present.indexOf('export function ensureRallyFlagTexture')),
    /flagInto\(g, n \* 0\.3, n \* 0\.95, n \* 0\.88\)/,
    'the MOVE button\'s texture is drawn by something other than flagInto')
})

/* ------------------------------------------------ 3. selling takes the lads */

test('removing a garrison takes it out of the list and hands back its lads', () => {
  const tower = { id: 'a' }
  const other = { id: 'b' }
  const lads = [{ n: 1 }, { n: 2 }]
  const garrisons = [
    { tower: other, soldiers: [{ n: 3 }] },
    { tower, soldiers: lads },
  ]
  assert.deepEqual(removeGarrison(garrisons, tower), lads)
  assert.equal(garrisons.length, 1, 'the sold tower is still in the garrison list')
  assert.equal(garrisons[0]!.tower, other, 'it removed the wrong garrison')
  // Twice is a no-op, and a tower that never had one is too: both callers call
  // it unconditionally.
  assert.deepEqual(removeGarrison(garrisons, tower), [])
  assert.deepEqual(removeGarrison(garrisons, { id: 'c' }), [])
  assert.equal(garrisons.length, 1)
})

test('a sold tower leaves zero lads, and none come back after the respawn', () => {
  // `tickGarrisons` reduced to the two lines that mattered: a garrison still in
  // the list is brought back up to strength, and a fallen lad is replaced
  // `soldierRespawn` seconds later. Neither may happen once it is gone.
  const tower = { soldierCount: 2, soldierRespawn: D.soldierRespawn as number }
  const garrisons = [{ tower, soldiers: [] as Array<{ respawnIn: number; alive: boolean }> }]
  const manGarrison = (g: typeof garrisons[number]) => {
    while (g.soldiers.length < tower.soldierCount) g.soldiers.push({ respawnIn: 0, alive: true })
  }
  const tick = (dt: number) => {
    for (const g of garrisons) {
      if (g.soldiers.length !== tower.soldierCount) manGarrison(g)
      for (const s of g.soldiers) {
        if (s.respawnIn > 0) { s.respawnIn -= dt; if (s.respawnIn <= 0) s.alive = true }
      }
    }
  }
  manGarrison(garrisons[0]!)
  // One of them falls, so there is a respawn in flight when the tower is sold.
  garrisons[0]!.soldiers[0]!.alive = false
  garrisons[0]!.soldiers[0]!.respawnIn = tower.soldierRespawn
  tick(1)
  assert.equal(garrisons[0]!.soldiers.length, 2, 'the fixture is not modelling the tick')

  const lads = removeGarrison(garrisons, tower)
  assert.equal(lads.length, 2)
  assert.equal(garrisons.length, 0, 'the garrison survived the sale')

  // Twice the respawn window, which is what the bug filled with fresh lads.
  for (let s = 0; s < tower.soldierRespawn * 2 * 10; s++) tick(0.1)
  assert.equal(garrisons.length, 0)
  assert.equal(garrisons.reduce((n, g) => n + g.soldiers.length, 0), 0,
    'the sold tower respawned its lads')
})

test('both ways a tower leaves the board disband its garrison', () => {
  for (const name of ['sellTower', 'destroyTower']) {
    const body = methodBody(name)
    assert.match(body, /this\.disbandGarrison\(tower\)/,
      `${name} leaves the lads standing in the road`)
    // BEFORE the tower object is destroyed, because the helper looks the
    // garrison up by it.
    assert.ok(body.indexOf('this.disbandGarrison(tower)') < body.indexOf('tower.destroy()'),
      `${name} disbands after destroying the tower it looks up by`)
  }
  const body = methodBody('disbandGarrison')
  assert.match(body, /removeGarrison\(this\.garrisons, tower\)/,
    'disbandGarrison does not take the garrison out of the list')
  assert.match(body, /e\.blocker instanceof Soldier && mine\.has\(e\.blocker\)/,
    'an enemy is left holding onto a destroyed lad')
  assert.match(body, /for \(const lad of lads\) lad\.destroy\(\)/, 'the lads are never destroyed')
  assert.match(body, /if \(this\.selected === tower\) this\.drawRallyMark\(null\)/,
    'the rally flag outlives the tower it belonged to')
  // Released BEFORE destroyed: `Soldier.alive` reads `this.scene`, which a
  // destroyed Container no longer has.
  assert.ok(body.indexOf('e.blocker = null') < body.indexOf('lad.destroy()'),
    'the lads are destroyed while something is still holding them')
})

/* ------------------------------------------------------------ the harness */

test('the harness scenario that presses these buttons is still registered', () => {
  // The node suite cannot see a frame. `run.sh lads` is what drives the ring,
  // the tap and the sale for real, and a scenario that quietly stops being
  // listed is a scenario nobody runs.
  const harness = src('tools/harness/index.html')
  assert.match(harness, /if \(scenario === 'lads'\)/, 'the lads scenario is gone')
  assert.ok(/'lads'/.test(harness.slice(0, harness.indexOf('if (scenario ==='))),
    'the lads scenario is not in the scenario list at the top of the harness')
})
