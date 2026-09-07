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

test('story mode pays in cakes, and banks no points at all', () => {
  /*
   * THIS TEST USED TO SAY THE OPPOSITE, and the change is deliberate.
   *
   * It asserted `BANNER POINTS EARNED`, `bannerPointsFor` and
   * `addBannerPoints` in `endRun`, on the reasoning in DESIGN.md that the
   * Banner "replaces the 3-star system entirely". That is still true of RUN
   * MODE and is no longer true of story mode: points grade a run on depth and
   * accrue across a campaign, which cannot say "you have done this level as
   * well as it can be done". See the story-mode subsection under "Meta
   * progression" in DESIGN.md.
   *
   * The two must not mix, so this checks BOTH halves: cakes are paid, and
   * points are not merely hidden but never scored and never banked.
   */
  const scene = src('scenes/GameScene.ts')
  const end = /\n  (?:private )?endRun\(phase[\s\S]*?\n  \}/.exec(scene)
  assert.ok(end, 'endRun is gone')
  // Comments stripped: this file is allowed to say why points are gone from
  // here, and a check that failed on the explanation would be a check that can
  // only pass once the record of the change is deleted.
  const code = end[0].split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

  assert.match(code, /cakesFor\(won, this\.status\.lives, this\.status\.startingLives\)/,
    'the results screen does not score the level in cakes')
  assert.match(code, /recordCakes\(this\.level\.id, earned, this\.status\.difficultyId\)/,
    'the cakes are shown but never banked against the level')
  assert.match(code, /cakes: \{ earned, max: MAX_CAKES, animate: true \}/,
    'the victory panel does not draw the cakes')

  // AND NOT AGAINST THE UN-SCALED CONSTANT. Difficulty scales starting lives,
  // so a threshold measured against `RULES.startingLives` would pay three
  // cakes for an untouched Try Hard run and two for the same performance on
  // normal.
  assert.doesNotMatch(code, /cakesFor\([^)]*RULES\.startingLives/,
    'the cake thresholds are measured against the un-scaled constant')

  // Points: gone from this path entirely.
  for (const gone of ['BANNER POINTS', 'bannerPointsFor', 'addBannerPoints']) {
    assert.ok(!code.includes(gone), `story mode still deals in points: ${gone}`)
  }
})

test('the skill tree and its points are kept, whole and unreferenced', () => {
  /*
   * DELETED FROM STORY MODE, NOT DELETED. Run mode is what Banner Points are
   * for and it is not built yet, so the arithmetic, its tuning and the
   * lifetime total in the save all stay exactly as they are — this file's
   * other twenty tests still drive them. What must not happen is a later pass
   * "tidying away" an unreferenced module and taking Phase 2 with it.
   */
  assert.match(src('systems/Banner.ts'), /export function bannerPointsFor/,
    'the Banner scoring is gone; run mode needs it')
  assert.ok(rules.banner && typeof rules.banner.perWaveCleared === 'number',
    'rules.banner is gone; run mode needs it')
  const save = src('systems/Save.ts')
  assert.match(save, /bannerPoints: number/, 'the lifetime point total is gone from the save')
  assert.match(save, /export function addBannerPoints/, 'nothing can bank a point any more')

  // Nothing story mode touches may read them. The scenes are story mode today.
  for (const f of ['scenes/GameScene.ts', 'scenes/WorldMapScene.ts', 'scenes/HudScene.ts']) {
    const body = src(f).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    assert.ok(!/bannerPointsFor|addBannerPoints|bannerTotal/.test(body),
      `${f} still scores or banks Banner Points`)
  }
  // `verdictFor` is the exception and is not points: it is the one flavour
  // line under the title, and it reads lives remaining.
  assert.match(src('scenes/GameScene.ts'), /verdictFor\(outcome, RULES\.banner\)/,
    'the verdict line is gone from the results screen')
})

test('the results screen reports the run and cannot be dismissed into a dead board', () => {
  const scene = src('scenes/GameScene.ts')
  const end = /\n  (?:private )?endRun\(phase[\s\S]*?\n  \}/.exec(scene)![0]
  for (const row of ['Waves survived', 'Lives remaining', 'Kills', 'Peanuts earned']) {
    assert.ok(end.includes(row), `the results screen does not report "${row}"`)
  }
  // The lifetime point total is gone from this screen with the rest of the
  // points. What replaced it is the level's own best, and only when the level
  // has done better before — see the cakes test above.
  assert.ok(!/all runs/i.test(end), 'the lifetime Banner Point total is back on the results screen')
  assert.match(end, /Best on this level/, 'a run below the level\'s record does not say so')
  assert.match(end, /dismissable: false/,
    'tapping outside the results panel leaves the player on a finished board')
  // A WIN OFFERS SOMEWHERE TO GO AND A LOSS OFFERS ANOTHER TRY. These were
  // TRY AGAIN and QUIT TO TITLE, which on a win is a dead end of its own kind:
  // there was a way off the screen and no way forward.
  assert.match(end, /'REPLAY'/, 'there is no way to play the level again')
  assert.match(end, /'MAIN MENU'/, 'there is no way out')
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
  assert.match(sell[0], /setPeanuts\(this\.status\.peanuts \+ refund\)/,
    'a sale no longer refunds')

  // AND THERE IS EXACTLY ONE WRITER. This used to count direct `+=` sites and
  // allow two; the balance is now written in one method, because an open build
  // panel has to be re-priced when it moves and nine scattered writes had
  // nowhere to hang that off. Anything assigning the field outside
  // `setPeanuts` is the stale-panel bug coming back.
  const writes = [...scene.matchAll(/this\.status\.peanuts\s*(?:=|\+=|-=)[^=]/g)]
  assert.equal(writes.length, 1,
    `${writes.length} places write the balance; only setPeanuts may`)
  assert.match(scene, /private setPeanuts\(next: number\): void \{[\s\S]{0,260}this\.refreshAffordability\(\)/,
    'the one writer does not re-price the open panel')
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
