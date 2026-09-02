import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { bannerPointsFor, verdictFor, type RunOutcome } from '../src/systems/Banner.ts'
import rules from '../src/data/rules.json' with { type: 'json' }

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

const CFG = rules.banner
const WAVES = (JSON.parse(src('data/waves.json')) as { waves: unknown[] }).waves.length
const LIVES = rules.startingLives

const run = (o: Partial<RunOutcome>): RunOutcome => ({
  wavesReached: 0, cleared: false, livesRemaining: 0, maxLives: LIVES, ...o,
})

test('a lost run still pays, because depth is the term that counts', () => {
  // The whole point of replacing stars with the Banner: a run that ends at
  // wave nine is progress, and a defeat that banks nothing ends the session.
  const died = run({ wavesReached: 8 })
  const points = bannerPointsFor(died, CFG)
  assert.ok(points > 0, 'dying at wave nine paid nothing')
  assert.equal(points, 8 * CFG.perWaveCleared)
})

test('deeper is always worth more', () => {
  let last = -1
  for (let w = 0; w <= WAVES; w++) {
    const p = bannerPointsFor(run({ wavesReached: w }), CFG)
    assert.ok(p > last, `wave ${w} paid no more than wave ${w - 1}`)
    last = p
  }
})

test('winning beats dying on the last wave', () => {
  const nearly = bannerPointsFor(run({ wavesReached: WAVES - 1 }), CFG)
  const won = bannerPointsFor(
    run({ wavesReached: WAVES, cleared: true, livesRemaining: 0 }), CFG)
  assert.ok(won > nearly, 'clearing the run paid no more than dying one wave short')
})

test('lives only matter to a survivor, and need no special case', () => {
  // A run is lost at zero lives, so the lives term is already zero on a loss.
  const lost = run({ wavesReached: 5, livesRemaining: 0 })
  assert.equal(bannerPointsFor(lost, CFG), 5 * CFG.perWaveCleared)
  const clean = run({ wavesReached: WAVES, cleared: true, livesRemaining: LIVES })
  const scraped = run({ wavesReached: WAVES, cleared: true, livesRemaining: 1 })
  assert.ok(bannerPointsFor(clean, CFG) > bannerPointsFor(scraped, CFG),
    'a flawless clear paid the same as a one-life clear')
})

test('nothing pays negative, and nothing pays a fraction', () => {
  const junk = run({ wavesReached: -4, livesRemaining: -9 })
  assert.equal(bannerPointsFor(junk, CFG), 0)
  const odd = run({ wavesReached: 3.7, livesRemaining: 2.2, cleared: true })
  assert.equal(bannerPointsFor(odd, CFG) % 1, 0, 'a fractional payout reached the bank')
})

test('a perfect run is worth a meaningful multiple of a bad one', () => {
  const best = bannerPointsFor(
    run({ wavesReached: WAVES, cleared: true, livesRemaining: LIVES }), CFG)
  const early = bannerPointsFor(run({ wavesReached: 2 }), CFG)
  assert.ok(best / Math.max(early, 1) >= 5,
    `a perfect run pays ${best} against ${early} for a wave-2 death; the spread is too flat to reward playing well`)
})

test('the verdict names what actually happened', () => {
  assert.equal(verdictFor(run({ wavesReached: 4 }), CFG), CFG.verdicts.lost)
  assert.equal(
    verdictFor(run({ wavesReached: WAVES, cleared: true, livesRemaining: LIVES }), CFG),
    CFG.verdicts.flawless)
  assert.equal(
    verdictFor(run({ wavesReached: WAVES, cleared: true, livesRemaining: LIVES - 2 }), CFG),
    CFG.verdicts.clean)
  assert.equal(
    verdictFor(run({ wavesReached: WAVES, cleared: true, livesRemaining: 1 }), CFG),
    CFG.verdicts.narrow)
})

test('the results screen is not a star rating', () => {
  // DESIGN.md replaced the three-star system with the Banner. Stars would be a
  // regression, so nothing in the run-end path may draw one.
  const scene = src('scenes/GameScene.ts')
  const end = /\n  (?:private )?endRun\(phase[\s\S]*?\n  \}/.exec(scene)
  assert.ok(end, 'endRun is gone')
  // Comments stripped: this file is allowed to say why stars are gone.
  const code = end[0].split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  // Word-bounded: `startingLives` is not a star rating.
  assert.doesNotMatch(code, /\bstars?\b|starsFor|drawStar/i,
    'the results screen grades the run with stars')
  assert.match(code, /BANNER POINTS EARNED/, 'the headline is not the Banner Points')
  assert.match(code, /bannerPointsFor/, 'the results screen does not score the run')
  assert.match(code, /addBannerPoints/, 'the points are shown but never banked')
})

test('the results screen reports the run and cannot be dismissed into a dead board', () => {
  const scene = src('scenes/GameScene.ts')
  const end = /\n  (?:private )?endRun\(phase[\s\S]*?\n  \}/.exec(scene)![0]
  for (const row of ['Waves survived', 'Lives remaining', 'Kills', 'Peanuts earned']) {
    assert.ok(end.includes(row), `the results screen does not report "${row}"`)
  }
  assert.match(end, /all runs/i, 'the lifetime Banner Point total is not shown')
  assert.match(end, /dismissable: false/,
    'tapping outside the results panel leaves the player on a finished board')
  assert.match(end, /TRY AGAIN/, 'there is no way to start another run')
  assert.match(end, /QUIT TO TITLE/, 'there is no way out')
  // Dialog only honours the flag if it still has one.
  assert.match(src('ui/Dialog.ts'), /opts\.dismissable !== false/,
    'Dialog ignores dismissable, so the results panel closes on an outside tap')
})

test('peanuts earned counts income, not refunds', () => {
  // Selling a tower hands back money the player already had. Counting it as
  // earned would let a player inflate the run total by churning towers.
  const scene = src('scenes/GameScene.ts')
  const sell = /private sellTower\([\s\S]*?\n  \}/.exec(scene)
  assert.ok(sell, 'sellTower is gone')
  assert.doesNotMatch(sell[0], /this\.earn\(/, 'a sale is counted as income')
  assert.match(sell[0], /status\.peanuts \+= refund/, 'a sale no longer refunds')
  // And every other income route goes through the one counter.
  const stray = scene.match(/this\.status\.peanuts \+= /g) ?? []
  assert.equal(stray.length, 2,
    `${stray.length} places add peanuts directly; only earn() and the sell refund may`)
})

test('Banner Points persist, and nothing else in the save can wipe them', () => {
  const save = src('systems/Save.ts')
  assert.match(save, /bannerPoints: number/, 'the save has nowhere to keep the points')
  assert.match(save, /bannerPoints: count\(parsed\.bannerPoints\)/,
    'a hand-edited or half-written save could put junk in the total')
  assert.match(save, /bannerPoints: 0/, 'a fresh save does not start the total at zero')
  // Every writer must preserve the fields it does not own, or the first volume
  // change after a run would spend the player's whole history.
  // Matched across the whole CALL, not one line: a writer that names four
  // fields is a multi-line call, and a line-by-line check reads its first line
  // as a bare `writeSave({` and fails a writer that is perfectly correct.
  for (const call of save.match(/writeSave\(\{[\s\S]*?\}\)/g) ?? []) {
    assert.match(call, /\.\.\.save|\.\.\.loadSave\(\)/,
      `a writer in Save.ts replaces the whole save and would drop the Banner total`)
  }
  const audio = src('systems/Audio.ts')
  for (const line of audio.match(/writeSave\(\{[\s\S]*?\n  \}\)/g) ?? []) {
    assert.match(line, /\.\.\.loadSave\(\)/, `"${line.trim()}" would drop the Banner total`)
  }
})

test('nothing spends Banner Points yet, and the tree is not half-built', () => {
  // The Banner tree is Phase 2. The points bank now so the number has a
  // history behind it when the tree arrives; building the tree early is
  // exactly the scope creep CLAUDE.md rule 5 forbids.
  const save = src('systems/Save.ts')
  assert.doesNotMatch(save, /spendBanner|unlockNode|bannerNodes/,
    'the Banner tree is being built ahead of its phase')
  const files = readdirSync(url('../src/scenes')).filter((f) => f.endsWith('.ts'))
  for (const f of files) {
    assert.doesNotMatch(src(`scenes/${f}`), /BannerTree|bannerNode/,
      `${f} references a Banner tree that is not this phase's work`)
  }
})
