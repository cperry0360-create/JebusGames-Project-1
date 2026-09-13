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
 * IT IS EMPTY NOW, and that is the state of the repository rather than a
 * deleted feature. Level 8 was the one entry -- built, checked and soaked,
 * with no row because it is unlocked by level 7 and level 7 had no row either
 * -- and registering level 7 gave it the prerequisite it was waiting for, so
 * both rows landed together and there is nothing left parked.
 *
 * WHY IT STAYS. `loadLevel` resolves an unknown id to the DEFAULT level, so
 * `level.ts 120 level9` would print LEVEL 1's win rate under level 9's name.
 * Sim.ts reports a `wrong-level` finding when that happens and this is the
 * other half: the next built-but-unregistered level needs exactly this list,
 * and a tools-only mutation is how it gets soaked without putting a
 * permanently locked node on the world map.
 */
const PARKED: Array<Record<string, unknown>> = []
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
// LEVEL 7'S FINALE, MEASURED. Where the splitting boss was killed relative to
// its exit, and how many runs the cars off its trailer ended. Both are empty on
// every other level, because nothing else in the game splits AND holds its wave.
const splitKills: number[] = []
let lostToSplit = 0
let bladeCuts = 0
for (let seed = 1; seed <= RUNS; seed++) {
  const r = simulate(seed, 'normal', LEVEL, undefined, DIFFICULTY)
  if (r.outcome === 'won') { wins++; livesLeft += r.lives }
  else if (r.outcome === 'stuck') stuck++
  else lostOn.push(r.waves)
  for (const [k, v] of Object.entries(r.leaksByExit)) leaks[k] = (leaks[k] ?? 0) + v
  for (const [k, v] of Object.entries(r.leaksByEnemy)) leakers[k] = (leakers[k] ?? 0) + v
  if (r.lostToExit) killedBy[r.lostToExit] = (killedBy[r.lostToExit] ?? 0) + 1
  if (r.splitKillToExit !== null) splitKills.push(r.splitKillToExit)
  if (r.lostToSplit) lostToSplit++
  bladeCuts += r.bladeCuts
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

// LEVEL 7'S FINALE. Where the boss was actually killed, and what that cost --
// the brief's question, and the one the design turns on: the four cars come off
// the trailer AT THE PLACE IT FELL, so a kill 200 px from the exit is four cars
// 200 px from the exit. There is deliberately no clamp; this is how the risk is
// checked rather than designed around.
if (splitKills.length > 0) {
  const sorted = [...splitKills].sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  const median = sorted[Math.floor(sorted.length / 2)]!
  const late = sorted.filter((d) => d < 300).length
  console.log(`  the splitting boss was killed ${splitKills.length} times, `
    + `with a mean of ${mean.toFixed(0)} px of road left (median ${median.toFixed(0)}, `
    + `worst ${sorted[0]!.toFixed(0)}, best ${sorted[sorted.length - 1]!.toFixed(0)})`)
  console.log(`  killed inside the last 300 px: ${late} of ${splitKills.length} `
    + `(${((late / splitKills.length) * 100).toFixed(0)}%)`)
}
if (lostToSplit > 0) {
  const losses = RUNS - wins - stuck
  console.log(`  runs ended by a car off the trailer: ${lostToSplit} `
    + `(${losses ? ((lostToSplit / losses) * 100).toFixed(0) : 0}% of losses)`)
}
if (bladeCuts > 0) {
  console.log(`  the blades did ${bladeCuts.toFixed(0)} damage to the player's own units `
    + `(${(bladeCuts / RUNS).toFixed(0)} a run)`)
}
