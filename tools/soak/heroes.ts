// What the hero rotation costs, per level, measured against the Cory-pinned run.
//
//   node --experimental-strip-types tools/soak/heroes.ts 480
//
// WHY THIS EXISTS. `tools/soak/level.ts` pins DEFAULT_HERO_ID -- Cory -- on
// every seed, and every published win rate and the whole 35-45% band are
// statements about that. `tools/soak/run.ts` ROTATES, three Cory slots and one
// each of the other four, so Courtland plays roughly one seed in seven. The two
// tools therefore answer different questions and their numbers are not
// comparable, which is easy to forget and expensive to forget: a per-level band
// checked against an aggregate would be checked against a different game.
//
// This runs both over the same seeds on the same head and prints the gap, plus
// how each level goes on Courtland's own seeds specifically -- which is the
// question worth asking while his abilities are deliberately overtuned.
//
// Nothing here tunes anything. It is a measuring instrument.
import { simulate, ALL_HEROES } from './Sim.ts'
import { DEFAULT_HERO_ID } from '../../src/systems/Heroes.ts'

const ROTA: string[] = [DEFAULT_HERO_ID, DEFAULT_HERO_ID, DEFAULT_HERO_ID,
  ...ALL_HEROES.filter((h: string) => h !== DEFAULT_HERO_ID)]
const N = Number(process.argv[2] ?? 480)

console.log(`rotation: ${JSON.stringify(ROTA)}  (${N} seeds each)\n`)
console.log('level    Cory-pinned      rotated        delta   Courtland seeds (won/played)')
for (const lvl of ['level1', 'level2', 'level3', 'level4', 'level5']) {
  let pinned = 0, rotated = 0, ctWon = 0, ctPlayed = 0
  for (let s = 1; s <= N; s++) {
    if (simulate(s, 'normal', lvl, undefined, 'normal').outcome === 'won') pinned++
    const h = ROTA[s % ROTA.length]!
    const r = simulate(s, 'normal', lvl, h, 'normal')
    if (r.outcome === 'won') rotated++
    if (h === 'courtland') { ctPlayed++; if (r.outcome === 'won') ctWon++ }
  }
  const pp = (100 * pinned / N).toFixed(0), rp = (100 * rotated / N).toFixed(0)
  console.log(`${lvl}  ${String(pinned).padStart(4)}/${N} (${pp.padStart(2)}%)`
    + `  ${String(rotated).padStart(4)}/${N} (${rp.padStart(2)}%)`
    + `  ${(rotated - pinned >= 0 ? '+' : '') + (rotated - pinned)}`.padStart(8)
    + `   ${ctWon}/${ctPlayed} (${ctPlayed ? (100 * ctWon / ctPlayed).toFixed(0) : '-'}%)`)
}
