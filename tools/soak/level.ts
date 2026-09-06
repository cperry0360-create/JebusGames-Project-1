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

let wins = 0
let stuck = 0
const lostOn: number[] = []
let livesLeft = 0
for (let seed = 1; seed <= RUNS; seed++) {
  const r = simulate(seed, 'normal', LEVEL)
  if (r.outcome === 'won') { wins++; livesLeft += r.lives }
  else if (r.outcome === 'stuck') stuck++
  else lostOn.push(r.waves)
}

const hist = new Map<number, number>()
for (const w of lostOn) hist.set(w, (hist.get(w) ?? 0) + 1)
console.log(`${LEVEL}: ${wins}/${RUNS} wins  (${((wins / RUNS) * 100).toFixed(0)}%)`
  + (stuck ? `  ${stuck} stuck` : ''))
console.log('  lost after wave: ' + ([...hist.entries()].sort((a, b) => a[0] - b[0])
  .map(([w, n]) => `w${w}x${n}`).join(' ') || '(none)'))
if (wins) console.log(`  average lives left on a win: ${(livesLeft / wins).toFixed(1)}`)
