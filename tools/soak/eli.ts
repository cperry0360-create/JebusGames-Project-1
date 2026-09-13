// What a change to ELI'S abilities costs each level, measured three ways.
//
//   node --experimental-strip-types tools/soak/eli.ts 480 out.json
//
// WHY THIS EXISTS AND heroes.ts DOES NOT ANSWER IT. `tools/soak/level.ts`
// pins Cory on every seed, so a change to Eli cannot move a single number it
// prints -- which makes it a control rather than a measurement.
// `tools/soak/run.ts` rotates, three Cory slots and one each of the other
// four, so Eli plays roughly one seed in seven and a real effect arrives at
// the published rates diluted by about 7x. `tools/soak/heroes.ts` runs both
// but stops at level 5 and reports Courtland.
//
// So this runs the SAME SEEDS three ways on every built level:
//
//   cory     DEFAULT_HERO_ID on every seed. Eli never takes the field, so this
//            must not move at all. A number that moves here is collateral --
//            a shared rule that was supposed to be Eli's and is not.
//   rotated  run.ts's own rotation, which is the shape the published win rates
//            are in. Real, and diluted.
//   eli      Eli on every seed: the effect undiluted, which is the number that
//            says what the change actually did.
//
// Nothing here tunes anything. It is a measuring instrument, and the whole
// point of the three columns is that they disagree in a way you can read.
import { simulate, ALL_HEROES } from './Sim.ts'
import { DEFAULT_HERO_ID } from '../../src/systems/Heroes.ts'
import { LEVELS } from '../../src/systems/Levels.ts'
import { writeFileSync } from 'node:fs'

/** run.ts's rotation, copied deliberately: this has to be the same shape the
 *  published aggregate is in, and it is only a statement about that while the
 *  two lists match. */
const ROTA: string[] = [DEFAULT_HERO_ID, DEFAULT_HERO_ID, DEFAULT_HERO_ID,
  ...ALL_HEROES.filter((h: string) => h !== DEFAULT_HERO_ID)]

const N = Number(process.argv[2] ?? 480)
const OUT = process.argv[3] ?? ''
const IDS = LEVELS.map((l) => l.id)

interface Row {
  level: string
  cory: number
  rotated: number
  eli: number
  /** Of the rotated seeds, the ones Eli actually played, and how they went --
   *  the rotated column's whole movement comes out of these. */
  eliSeeds: number
  eliSeedWins: number
}

const rows: Row[] = []
const t0 = Date.now()
for (const lvl of IDS) {
  let cory = 0, rotated = 0, eli = 0, eliSeeds = 0, eliSeedWins = 0
  for (let s = 1; s <= N; s++) {
    if (simulate(s, 'normal', lvl, DEFAULT_HERO_ID, 'normal').outcome === 'won') cory++
    const h = ROTA[s % ROTA.length]!
    const r = simulate(s, 'normal', lvl, h, 'normal')
    if (r.outcome === 'won') rotated++
    if (h === 'eli') {
      eliSeeds++
      if (r.outcome === 'won') eliSeedWins++
    }
    if (simulate(s, 'normal', lvl, 'eli', 'normal').outcome === 'won') eli++
  }
  rows.push({ level: lvl, cory, rotated, eli, eliSeeds, eliSeedWins })
  const pc = (n: number): string => `${String(n).padStart(4)}/${N} (${(100 * n / N).toFixed(1).padStart(5)}%)`
  console.log(`${lvl.padEnd(8)} cory ${pc(cory)}   rotated ${pc(rotated)}   eli ${pc(eli)}`
    + `   [eli seeds ${eliSeedWins}/${eliSeeds}]`)
}
console.log(`\n${N} seeds x ${IDS.length} levels x 3 rotations in `
  + `${((Date.now() - t0) / 1000).toFixed(0)}s`)
console.log(`rotation: ${JSON.stringify(ROTA)}`)
if (OUT) {
  writeFileSync(OUT, JSON.stringify({ seeds: N, rota: ROTA, rows }, null, 1))
  console.log(`wrote ${OUT}`)
}
