// One level's win rate over N seeds, which is the number a balance change is
// judged against.
//
//   node --experimental-strip-types tools/soak/level.ts 60 level3
//
// `run.ts` is the whole-game soak: every level, four modes, the audit and the
// crash reporting. This is the narrow one -- one level, all-normal, seeds 1..N
// -- because tuning a single boss against a 2,100-run aggregate is slow and
// tells you about the wrong thing. Same simulator, same seeds every time, so
// a before and an after are comparable.
import { simulate } from './Sim.ts'
import { LEVELS } from '../../src/systems/Levels.ts'

/**
 * LEVELS THAT ARE BUILT AND HAVE NO ROW IN levels.json, registered here so
 * this file can soak them.
 *
 * WHY THIS EXISTS. `loadLevel` resolves an unknown id to the DEFAULT level, so
 * `level.ts 120 level8` would have printed LEVEL 1's win rate under level 8's
 * name -- and level 8 genuinely has no row, because it is unlocked by level 7
 * and level 7 has no row either. Sim.ts now reports a `wrong-level` finding
 * when that happens; this is the other half, which makes the soak possible.
 *
 * IT IS A TOOLS-ONLY MUTATION and it has to stay one: pushing the row into the
 * shipped registry would put a permanently locked node on the world map (see
 * src/data/level8.json's `_theRowIsNotThereYet`). The row here is exactly the
 * one level 8 will have the day level 7 exists, `laneLengthPx` included --
 * 3646.5, the longer of its two routes, measured through `LaneNetwork`.
 */
const PARKED = [
  {
    id: 'level8',
    name: 'The Optimization',
    unlockedBy: 'level7',
    waves: 'waves.level8.json',
    laneLengthPx: 3646.5,
    rules: 'level8.json',
  },
]
for (const row of PARKED) {
  if (!LEVELS.some((l) => l.id === row.id)) LEVELS.push(row as never)
}

const RUNS = Number(process.argv[2] ?? 60)
const LEVEL = process.argv[3] ?? 'level3'
/**
 * The DIFFICULTY, defaulting to normal.
 *
 *   node --experimental-strip-types tools/soak/level.ts 120 level2 try-hard
 *
 * TUNING IS DONE AGAINST NORMAL AND ONLY NORMAL. The other two are a sanity
 * check -- is casual trivial, is hardcore impossible -- and nothing is retuned
 * to hit a number on either, because the published win rates and the 35-45%
 * band are statements about normal.
 */
const DIFFICULTY = process.argv[4] ?? 'normal'

let wins = 0
let stuck = 0
const lostOn: number[] = []
let livesLeft = 0
// WHERE THE LIVES WENT, summed over the run set. One key on every map with one
// exit; level 8 has two that both cost lives, and which of them the losses came
// out of is the question its wave table was built to answer.
const leaks: Record<string, number> = {}
const leakers: Record<string, number> = {}
// WHICH EXIT ENDED THE RUN, over the losses. See `lostToExit` in Sim.ts.
const killedBy: Record<string, number> = {}
let reviewed = 0
let auraBuffed = 0
let blastOnFriendlies = 0
let wrongLevel = ''
for (let seed = 1; seed <= RUNS; seed++) {
  const r = simulate(seed, 'normal', LEVEL, undefined, DIFFICULTY)
  if (r.outcome === 'won') { wins++; livesLeft += r.lives }
  else if (r.outcome === 'stuck') stuck++
  else lostOn.push(r.waves)
  for (const [k, v] of Object.entries(r.leaksByExit)) leaks[k] = (leaks[k] ?? 0) + v
  for (const [k, v] of Object.entries(r.leaksByEnemy)) leakers[k] = (leakers[k] ?? 0) + v
  if (r.lostToExit) killedBy[r.lostToExit] = (killedBy[r.lostToExit] ?? 0) + 1
  reviewed += r.reviewed
  auraBuffed += r.auraBuffed
  blastOnFriendlies += r.blastOnFriendlies
  const wrong = r.findings.find((f) => f.kind === 'wrong-level')
  if (wrong) wrongLevel = wrong.detail
}
// THE LOUD FAILURE FIRST. A soak of the wrong level is worse than no soak.
if (wrongLevel) {
  console.log(`!! ${wrongLevel}`)
  console.log('!! add it to PARKED in tools/soak/level.ts, or check the spelling')
}

const hist = new Map<number, number>()
for (const w of lostOn) hist.set(w, (hist.get(w) ?? 0) + 1)
console.log(`${LEVEL} [${DIFFICULTY}]: ${wins}/${RUNS} wins  (${((wins / RUNS) * 100).toFixed(0)}%)`
  + (stuck ? `  ${stuck} stuck` : ''))
// SAID EVERY RUN, so nobody compares these to the game without knowing it.
// Wave 1 waits for the player and pays no early bonus -- which is what a
// simulator with no ready phase already does, so that rule change moved
// nothing here. Waves 2 onward are modelled without their early-start bonus,
// so every number this prints is a floor. See the header of Sim.ts.
console.log('  waves: wave 1 player-started and unpaid (matches the game); '
  + 'waves 2+ auto-start unmodelled, so no early bonus is banked -- these are floors')
console.log('  lost after wave: ' + ([...hist.entries()].sort((a, b) => a[0] - b[0])
  .map(([w, n]) => `w${w}x${n}`).join(' ') || '(none)'))
if (wins) console.log(`  average lives left on a win: ${(livesLeft / wins).toFixed(1)}`)
const leaked = Object.entries(leaks).sort((a, b) => b[1] - a[1])
if (leaked.length) {
  const total = leaked.reduce((a, [, v]) => a + v, 0)
  console.log('  lives lost by exit: ' + leaked
    .map(([k, v]) => `${k} ${v} (${((v / total) * 100).toFixed(0)}%)`).join('  '))
}
const ended = Object.entries(killedBy).sort((a, b) => b[1] - a[1])
if (ended.length) {
  const total = ended.reduce((a, [, v]) => a + v, 0)
  console.log('  the exit that ended the run: ' + ended
    .map(([k, v]) => `${k} ${v} (${((v / total) * 100).toFixed(0)}% of losses)`).join('  '))
}
const got = Object.entries(leakers).sort((a, b) => b[1] - a[1])
if (got.length) {
  console.log('  what got out: ' + got.map(([k, v]) => `${k} x${v}`).join('  '))
}
if (reviewed) {
  console.log(`  performance reviews: ${reviewed} enemies buffed `
    + `(${(reviewed / RUNS).toFixed(1)} a run)`)
}
if (auraBuffed) {
  console.log(`  HR aura: ${auraBuffed} enemies stood in one at some point `
    + `(${(auraBuffed / RUNS).toFixed(1)} a run)`)
}
if (blastOnFriendlies) {
  console.log(`  consultant blasts on the player's own units: ${blastOnFriendlies} damage `
    + `(${(blastOnFriendlies / RUNS).toFixed(0)} a run)`)
}
