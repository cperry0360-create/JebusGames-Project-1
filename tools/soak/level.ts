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
for (let seed = 1; seed <= RUNS; seed++) {
  const r = simulate(seed, 'normal', LEVEL, undefined, DIFFICULTY)
  if (r.outcome === 'won') { wins++; livesLeft += r.lives }
  else if (r.outcome === 'stuck') stuck++
  else lostOn.push(r.waves)
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
