import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import enemies from '../src/data/enemies.json' with { type: 'json' }
import levels from '../src/data/levels.json' with { type: 'json' }
import art from '../src/data/art.json' with { type: 'json' }
import level6 from '../src/data/level6.json' with { type: 'json' }
import waves6 from '../src/data/waves.level6.json' with { type: 'json' }
import towers from '../src/data/towers.json' with { type: 'json' }
import { newFlameState, tickFlame, inFlame, flameEnd, scorchIntervalMultiplier } from '../src/systems/Flame.ts'
import type { FlameRules } from '../src/systems/Flame.ts'

const url = (p: string) => new URL(p, import.meta.url)
const E = enemies as Record<string, any>
const FLAME = (level6 as any).flame as FlameRules

/* ------------------------------------------------ the gate the brief asked for */

test('a level cannot ship with a boss whose health is unset', () => {
  // THE ROOSTER'S HEALTH WAS NULL ON PURPOSE UNTIL LEVEL 6 SHIPPED.
  //
  // A boss's health only means anything against the DPS the board it walks
  // past can hold, so the number stayed absent until there was a board to
  // measure it on. It is 7500 now, soaked at 480 seeds against level 6's own
  // two-lane map for 42%: see reports/2026-09-11-level-6.md. What this test
  // guards has not changed -- a level whose wave table spawns an enemy with no
  // health would divide by nothing on the first frame.
  //
  // The rule is about REGISTERED levels rather than about the file. Authoring
  // a roster ahead of a map is still fine; wiring it into levels.json is what
  // promises it is playable, and level 6 now makes that promise.
  const registered = new Set((levels as any).levels.map((l: any) => l.id))
  for (const l of (levels as any).levels) {
    const table = JSON.parse(readFileSync(url(`../src/data/${l.waves}`), 'utf8'))
    for (const w of table.waves) {
      for (const s of w.spawns) {
        const def = E[s.enemy]
        assert.ok(def, `${l.id} spawns unknown enemy ${s.enemy}`)
        assert.ok(typeof def.maxHealth === 'number' && def.maxHealth > 0,
          `${l.id} is registered and spawns ${s.enemy}, whose maxHealth is `
          + `${JSON.stringify(def.maxHealth)}. A boss's health comes off its own level's soak; `
          + 'register the level only once it has one.')
      }
    }
  }
  // And the other half, the way round it now runs: level 6 IS registered, so
  // the loop above is actually checking its roster rather than skipping it.
  // Without this line the test would still pass on a levels.json that had
  // quietly dropped level 6, and would be testing nothing about the Rooster.
  assert.ok(registered.has('level6'), 'level 6 is no longer registered in levels.json')
  assert.equal(E.rooster.maxHealth, 7500,
    'the Rooster\'s health moved; it is a soaked number, so re-soak level 6 and update the report')
  // RE-DERIVED AFTER THE FLANK LANDED, and it came back to the same number.
  // 7000 soaks at 50% and 8000 at 28%, so 7500's 38% is the middle of the band
  // and not a figure that happened to survive. See
  // reports/2026-09-12-level-6-fixes.md.
})

test('an unregistered wave table belongs to a level that is genuinely unfinished', () => {
  // The loophole in broadening rules.test.ts's enemy-coverage check to every
  // wave table on disk: a table nothing points at would otherwise let a dead
  // enemy hide forever. So a table that levels.json does not name has to be
  // one whose level cannot yet BE named -- and "cannot yet" means its boss has
  // no health. A level stops qualifying the moment somebody tunes it, which is
  // the moment it should be registered.
  //
  // THE LIST IS EMPTY NOW. `waves.level6.json` was the only entry and level 6
  // is registered, so every wave table on disk belongs to a level. The test
  // stays because the loophole has not gone anywhere: the next roster authored
  // ahead of its map lands here, and this is what stops it hiding a dead enemy
  // from rules.test.ts indefinitely.
  const named = new Set((levels as any).levels.map((l: any) => l.waves))
  const unregistered: string[] = []
  for (const f of readdirSync(url('../src/data/'))) {
    if (/^waves.*\.json$/.test(f) && !named.has(f)) unregistered.push(f)
  }
  assert.deepEqual(unregistered, [],
    'a wave table exists that no level names; either register its level or say why here')
  for (const f of unregistered) {
    const table = JSON.parse(readFileSync(url(`../src/data/${f}`), 'utf8'))
    const boss = table.waves.map((w: any) => w.boss).filter(Boolean).pop()
    assert.ok(boss, `${f} is not registered and has no boss; it is simply orphaned`)
    assert.equal(E[boss].maxHealth, null,
      `${f} is not registered but its boss ${boss} is tuned; register the level`)
  }
})

/* ------------------------------------------------------------------ the roster */

test('the level 6 roster is four grey mannequins and one finished bird', () => {
  const roster = (level6 as any).roster as Record<string, string>
  for (const id of Object.values(roster)) {
    assert.ok(E[id], `level6.json's roster names ${id}, which is not an enemy`)
    // EVERY ONE OF THEM FACES RIGHT, and this is checked rather than trusted:
    // a wrong `artFacing` inverts `mirroredFor` everywhere and walked level
    // 3's boss backwards through the entire map. The four pictures were looked
    // at; nothing in the engine can derive which way a drawing faces.
    assert.equal(E[id].artFacing, 'right', `${id} does not declare that it faces right`)
    assert.ok(art.files[E[id].sprite as keyof typeof art.files],
      `${id} names sprite ${E[id].sprite}, which is not in the manifest`)
  }
  // The three rank and file are ordinary and the bird is not.
  for (const id of [roster.filler, roster.fast, roster.wall]) {
    assert.notEqual(E[id].tier, 'boss', `${id} should not be a boss`)
    assert.equal(E[id].blockable, true, `${id} should be holdable`)
  }
  assert.equal(E[roster.boss].tier, 'boss')
  assert.equal(E[roster.boss].blockable, false, 'the Rooster is not held; it breathes')
  assert.equal(E[roster.boss].damage, 0, 'the Rooster does not swing')
  assert.equal(E[roster.boss].slowable, false, 'the Rooster is immune to slow')
})

test('the Sprinter is fast, and the collision with Baby Frank is recorded', () => {
  // THE BRIEF ASKED FOR THE FASTEST UNIT IN THE GAME AT 150 AND IT IS NOT.
  //
  // Level 5's Baby Frank is 172, and it landed an hour before this brief was
  // written -- so the two asks are simply in conflict and neither number has
  // been changed to hide it. What is asserted is the fact rather than the
  // wish: the Sprinter is the second fastest thing in the game, Baby Frank is
  // the first, and the third is level 3's Tiny Glitch at 140.
  const speeds = Object.entries(E)
    .filter(([, e]: [string, any]) => typeof e.speed === 'number')
    .sort((a, b) => (b[1] as any).speed - (a[1] as any).speed)
  assert.equal(speeds[0]![0], 'babyFrank', 'something has overtaken Baby Frank')
  assert.equal(speeds[1]![0], 'sprinter', 'the Sprinter is no longer second fastest')
  assert.equal((speeds[0]![1] as any).speed, 172)
  assert.equal((speeds[1]![1] as any).speed, 150)
  assert.equal((speeds[2]![1] as any).speed, 140, 'the third fastest moved')
})

/* ------------------------------------------------------------------- the waves */

test('thirteen waves, both lanes live, and the heavier side alternates', () => {
  const W = (waves6 as any).waves
  assert.equal(W.length, 13, 'the brief asks for thirteen waves')
  assert.equal(W[0].spawns.length, 1, 'wave 1 should teach one thing')
  assert.equal(W[12].boss, 'rooster', 'the Rooster is the finale')
  for (let i = 0; i < 12; i++) {
    assert.ok(!W[i].boss, `wave ${i + 1} has a boss; the brief asks for no mid-level appearance`)
  }
  const lanes = new Set<string>()
  for (const w of W) for (const s of w.spawns) lanes.add(s.lane)
  assert.deepEqual([...lanes].sort(), ['flank', 'lower', 'upper'],
    'the level has two front lanes and one flank')

  // THE FLANK IS DELIBERATELY SMALL, and this is where that stays true.
  //
  // It spawns out of the bottom mouth and merges into `lower`, and the whole
  // design intent is a surprise rather than a third front: a few fast bodies,
  // a few waves, in the back half. The easiest way for a later pass to ruin
  // level 6 is to make it a lane -- so the numbers are gated rather than
  // described. See waves.level6.json's `_flank`.
  const flankWaves = W.map((w: any, i: number) =>
    w.spawns.some((s: any) => s.lane === 'flank') ? i + 1 : 0).filter(Boolean)
  assert.ok(flankWaves.length >= 2 && flankWaves.length <= 3,
    `the flank is on ${flankWaves.length} waves; the brief asks for two or three`)
  assert.ok(flankWaves.every((n: number) => n >= 7),
    `the flank appears on wave ${flankWaves.find((n: number) => n < 7)}; it belongs in the back `
    + 'half, after the player has been taught the two front lanes')
  const flankBodies = W.flatMap((w: any) => w.spawns)
    .filter((s: any) => s.lane === 'flank')
  assert.ok(flankBodies.every((s: any) => s.enemy === 'sprinter'),
    'the flank carries something other than a Sprinter; it is meant to be the cheapest and '
    + 'fastest thing on the board, not a second Bruiser column')
  const flankTotal = flankBodies.reduce((n: number, s: any) => n + s.count, 0)
  const allTotal = W.flatMap((w: any) => w.spawns).reduce((n: number, s: any) => n + s.count, 0)
  assert.ok(flankTotal / allTotal < 0.1,
    `the flank is ${(flankTotal / allTotal * 100).toFixed(1)}% of the level's bodies; over 10% and `
    + 'it is a third lane rather than a surprise')

  // NOT MIRRORED. The heavier side has to change, or a board built
  // symmetrically is right on every wave and the second lane is decoration.
  const heavier = W.map((w: any) => {
    const per: Record<string, number> = { upper: 0, lower: 0 }
    for (const s of w.spawns) {
      // The FLANK is not a side. It merges into `lower` rather than running its
      // own route, so counting its health as lower's would call a wave
      // lower-heavy on the strength of three Sprinters arriving late.
      if (s.lane !== 'upper' && s.lane !== 'lower') continue
      if (E[s.enemy].maxHealth) per[s.lane] += s.count * E[s.enemy].maxHealth
    }
    return per.upper === per.lower ? 'even' : per.upper > per.lower ? 'upper' : 'lower'
  })
  const swaps = heavier.filter((h: string, i: number) => i > 0 && h !== heavier[i - 1]).length
  assert.ok(swaps >= 6, `the heavier lane only changes ${swaps} times in 13 waves; that is a mirror`)
  // ...and neither lane is starved.
  for (const side of ['upper', 'lower']) {
    assert.ok(heavier.filter((h: string) => h === side).length >= 4,
      `${side} is the heavier lane on fewer than four waves`)
  }
})

/* ------------------------------------------------------------------- the flame */

test('the flame telegraphs before it burns, and a dead bird burns nothing', () => {
  const DT = 1 / 30
  let s = newFlameState(FLAME)
  // THE WARNING COMES FIRST. Nothing may be damaged before the telegraph has
  // run its full length -- that is the whole difference between this and the
  // game cheating, and it is the Glitch Bug's rule.
  let t = 0
  let firstBurn = -1
  let telegraphAt = -1
  for (let i = 0; i < 2000; i++) {
    const r = tickFlame(s, DT, true, FLAME)
    s = r.state
    t += DT
    if (r.event?.kind === 'telegraph' && telegraphAt < 0) telegraphAt = t
    if (r.ticks > 0 && firstBurn < 0) firstBurn = t
  }
  assert.ok(telegraphAt > 0, 'the flame never telegraphed')
  assert.ok(firstBurn > 0, 'the flame never burned')
  assert.ok(firstBurn - telegraphAt >= FLAME.telegraphSeconds - DT * 2,
    `only ${(firstBurn - telegraphAt).toFixed(2)}s of warning before the first damage, `
    + `against ${FLAME.telegraphSeconds}s asked for`)
  // The first breath waits a full interval, so it does not open with one.
  assert.ok(telegraphAt >= FLAME.intervalSeconds - DT * 2,
    `the first telegraph came at ${telegraphAt.toFixed(2)}s, inside the ${FLAME.intervalSeconds}s cooldown`)

  // A BIRD KILLED MID-TELEGRAPH BURNS NOTHING.
  let d = newFlameState(FLAME)
  for (let i = 0; i < 2000; i++) {
    const r = tickFlame(d, DT, true, FLAME)
    d = r.state
    if (r.event?.kind === 'telegraph') break
  }
  assert.ok(d.telegraphLeft > 0, 'the telegraph did not start')
  for (let i = 0; i < 200; i++) {
    const r = tickFlame(d, DT, false, FLAME)
    d = r.state
    assert.equal(r.ticks, 0, 'a dead Rooster dealt flame damage')
    assert.equal(r.burning, false, 'a dead Rooster is still burning')
  }
})

test('the flame is a corridor along its own lane and half its width either side', () => {
  const from = { x: 100, y: 300 }
  const to = flameEnd(from.x, from.y, 0, FLAME)
  assert.equal(Math.round(to.x - from.x), FLAME.reach, 'the reach is not the reach')
  assert.equal(Math.round(to.y), Math.round(from.y), 'the corridor left its own heading')
  // WIDTH IS THE FULL CORRIDOR. Something exactly half a width off the centre
  // line is in it; something a pixel past that is not. Reading `width` as a
  // radius would double the corridor and reach the next lane over.
  assert.ok(inFlame({ x: 200, y: 300 }, from, to, FLAME), 'the centre line is not in the flame')
  assert.ok(inFlame({ x: 200, y: 300 + FLAME.width / 2 - 0.5 }, from, to, FLAME),
    'the corridor is narrower than its own width')
  assert.ok(!inFlame({ x: 200, y: 300 + FLAME.width / 2 + 1 }, from, to, FLAME),
    'the corridor is wider than its own width')
  // ...and it stops, at a ROUND end. `distanceToSegment` clamps, so the tip
  // reaches `reach + width / 2` and not `reach` -- 332 rather than 300. That
  // is deliberate and documented in Flame.ts; what is checked is that it stops
  // THERE rather than going on.
  assert.ok(inFlame({ x: from.x + FLAME.reach + FLAME.width / 2 - 1, y: 300 }, from, to, FLAME),
    'the capsule tip is shorter than half a width')
  assert.ok(!inFlame({ x: from.x + FLAME.reach + FLAME.width / 2 + 1, y: 300 }, from, to, FLAME),
    'the flame reaches past its own reach plus its own tip')
  assert.ok(!inFlame({ x: from.x - FLAME.width, y: 300 }, from, to, FLAME),
    'the flame reaches backwards out of the bird')
})

test('a scorched tower fires at half rate and takes no damage', () => {
  // Half the RATE is twice the interval. Getting it the wrong way round makes
  // being set on fire a buff, which is the trap AcidPuddle already documents.
  assert.equal(scorchIntervalMultiplier(FLAME), 2)
  assert.ok(FLAME.scorchSeconds > 0, 'the scorch does not last')
  // The marker is art that already exists rather than a new file.
  assert.equal(FLAME.scorchFx, 'fx-burn')
  assert.ok(art.files[FLAME.scorchFx as keyof typeof art.files], 'fx-burn is not in the manifest')
  assert.equal(FLAME.harmsEnemies, false, 'the flame has been allowed to hit other enemies')
})

/* --------------------------------------------------------------------- the art */

test('the flame strip is registered as a line, not as a gradient', () => {
  // fx-mind-laser shipped looking like a procedural gradient because
  // `beamWidth` was divided by `contentHeight` on a cell that is mostly not
  // beam: 8.25:1 anisotropy flattens every painted highlight. This entry is
  // the shape that fixed it.
  const cfg = (art.render as any)['fx-rooster-flame']
  assert.ok(cfg, 'the flame strip has no render entry')
  assert.equal(cfg.anchorX, 0, 'a strip stretched along a line anchors at its muzzle')
  assert.equal(cfg.stretch, 'line')
  assert.equal(cfg.sheet.frameWidth, 181)
  assert.equal(cfg.sheet.frameHeight, 181)
  assert.equal(cfg.sheet.frames, 12)
  assert.ok(cfg.beamCoreHeight > 0, 'without a core height the whole cell is forced into the corridor')
  assert.ok(cfg.beamCoreHeight < cfg.sheet.frameHeight,
    'the core cannot be the whole cell, or the field is doing nothing')
  // The number that decides whether the painting survives being drawn.
  const scaleX = FLAME.reach / cfg.contentWidth
  const scaleY = FLAME.width / cfg.beamCoreHeight
  const anisotropy = scaleX / scaleY
  assert.ok(anisotropy < 3.0,
    `the strip is drawn at ${anisotropy.toFixed(2)}:1, which flattens the paint; `
    + 'the Mind Laser was 8.25:1 and read as a gradient')
  // And the sheet on disk is the sheet the manifest describes.
  assert.ok(existsSync(url(`../public/assets/${art.files['fx-rooster-flame' as keyof typeof art.files]}`)),
    'the flame strip is not on disk')
})

test('the level 6 art is not soft: every source clears the 7x rule', () => {
  // CLAUDE.md rule 7: source height >= world height x maxZoom x devicePixelRatio.
  // All four of level 6's characters clear it, which is worth an assertion
  // because level 5's cast -- measured the same way an hour earlier -- cleared
  // none of it.
  const MAX_ZOOM = 2.37
  const MAX_DPR = 3
  const sources: Record<string, number> = {
    'enemy-scrapper': 611, 'enemy-sprinter': 649, 'enemy-bruiser': 692, 'enemy-rooster': 1224,
  }
  for (const [key, h] of Object.entries(sources)) {
    const want = (art.render as any)[key].displayHeight * MAX_ZOOM * MAX_DPR
    assert.ok(h >= want,
      `${key} has ${h}px of source against ${want.toFixed(0)} wanted; it will be soft`)
  }
})

test('nothing on the board is taller than the shortest building', () => {
  // The Bruiser is 85 and not the brief's 92, and this is the rule that
  // decided it: an ordinary enemy taller than every tower stops the board
  // reading as a board.
  const shortest = Math.min(
    ...Object.values(towers as Record<string, any>).map((t) => (art.render as any)[t.sprite].displayHeight))
  for (const id of ['scrapper', 'sprinter', 'bruiser6']) {
    assert.ok((art.render as any)[E[id].sprite].displayHeight < shortest,
      `${id} is drawn taller than the shortest tower`)
  }
  assert.equal((art.render as any)['enemy-bruiser'].displayHeight, 85)
})

/* ------------------------------------------------------------------- the scope */

test('level 6 adds nothing to any other level', () => {
  // The same property level 5 has to hold, checked the same way: the flame
  // reaches exactly ONE level because exactly one level names level6.json.
  // That count was zero until level 6 shipped and is one now; what must never
  // happen is two, which is how a level-scoped rule becomes a global one.
  const named = (levels as any).levels.filter((l: any) => l.rules === 'level6.json')
  assert.deepEqual(named.map((l: any) => l.id), ['level6'],
    'level6.json reaches a level that is not level 6')
  // And the file itself declares no global anything.
  const raw = readFileSync(url('../src/data/level6.json'), 'utf8')
  for (const k of ['startingLives', 'startingPeanuts', 'peanutsPerWaveCleared']) {
    assert.ok(!raw.includes(k), `level6.json sets ${k}; the economy is rules.json's`)
  }
})
