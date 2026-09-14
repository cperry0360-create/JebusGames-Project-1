// Level 10's win rate, measured the way every published per-level figure is.
//
//   node --experimental-strip-types tools/soak/tune10.ts 480 level10 normal cory
//   node --experimental-strip-types tools/soak/tune10.ts 120 level10
//
// THE FOUR ARGUMENTS ARE THE WHOLE POINT OF THE FILE, because a win rate means
// nothing without them and two of the four are easy to get wrong.
//
//   runs     480 to confirm, 120 to iterate. The two disagree: Vlaude at 31000
//            reads 39.1% over 120 seeds and 45.5% over 480, a 6.4 point swing
//            on the same value.
//   level    a level id. It is passed straight to `simulate`, which falls back
//            to the DEFAULT level for an unknown one -- so a typo would soak
//            level 1 and report it under the name you asked for. `simulate`
//            notes `wrong-level` when that happens; this driver does not hide
//            it.
//   mode     `normal` runs every seed in normal mode, which is what SOAK-
//            REPORT.md's published figures are. Omitted, the seeds rotate
//            through run.ts's seven modes, four of which are normal and three
//            of which are deliberately crippled -- a different statistic, and
//            usually a much lower one.
//   hero     a hero id runs that hero on every seed. Omitted, the hero rotates
//            by seed exactly as run.ts does: Cory on three sevenths and the
//            other four on one seventh each.
//
// THE PUBLISHED METHOD IS `480 <level> normal cory`, AND THAT IS MEASURED
// RATHER THAN ASSUMED. Level 8's report says "42% over 480 seeds on normal --
// 200/480"; this driver returns 200/480 on level 8 with those arguments, the
// same integer. Level 9's report says 40%; this returns 191/480, which is
// 39.8%. Any other combination of the last two arguments moves both by several
// points -- the mode rotation puts level 10 at 31.7% where Cory-every-seed puts
// it at 45.0% on the same health -- so a figure quoted without them is not
// comparable to anything.
import { simulate, ALL_HEROES, type SoakMode } from './Sim.ts'
import { DEFAULT_HERO_ID } from '../../src/systems/Heroes.ts'
const RUNS = Number(process.argv[2] ?? 120)
const LEVEL = process.argv[3] ?? 'level10'
const ALLNORMAL = process.argv[4] === 'normal'
const FIXEDHERO = process.argv[5]
const MODES: SoakMode[] = ['normal', 'normal', 'normal', 'normal',
  'nobuild', 'supportonly', 'noabilities']
const HEROES: string[] = [DEFAULT_HERO_ID, DEFAULT_HERO_ID, DEFAULT_HERO_ID,
  ...ALL_HEROES.filter((h) => h !== DEFAULT_HERO_ID)]
let won = 0, normal = 0, normalWon = 0, lost = 0, stuck = 0
const waves: number[] = []
const byEnemy = new Map<string, number>()
for (let seed = 1; seed <= RUNS; seed++) {
  const mode: SoakMode = ALLNORMAL ? 'normal' : MODES[seed % MODES.length]!
  const r = simulate(seed, mode, LEVEL, (FIXEDHERO ?? HEROES[seed % HEROES.length]!))
  if (r.outcome === 'won') won++
  else if (r.outcome === 'stuck') stuck++
  else lost++
  if (mode === 'normal') { normal++; if (r.outcome === 'won') normalWon++ }
  waves.push(r.waves)
  for (const [k, v] of Object.entries(r.leaksByEnemy ?? {})) {
    byEnemy.set(k, (byEnemy.get(k) ?? 0) + (v as number))
  }
}
waves.sort((a, b) => a - b)
console.log(`${LEVEL}: ${RUNS} seeds`)
console.log(`  all modes : ${won}/${RUNS} = ${(100 * won / RUNS).toFixed(1)}%  (lost ${lost}, stuck ${stuck})`)
console.log(`  normal    : ${normalWon}/${normal} = ${(100 * normalWon / Math.max(1, normal)).toFixed(1)}%`)
console.log(`  waves reached: median ${waves[Math.floor(waves.length / 2)]}, min ${waves[0]}, max ${waves[waves.length - 1]}`)
console.log('  leaks by enemy: ' + [...byEnemy.entries()].sort((a, b) => b[1] - a[1])
  .slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', '))
