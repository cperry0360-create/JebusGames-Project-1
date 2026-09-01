// The soak driver.
//
//   node --experimental-strip-types tools/soak/run.ts [runs]
//
// Every run is seeded, and every finding carries the seed that produced it, so
// anything this reports can be reproduced with:
//
//   node --experimental-strip-types -e "import {simulate} from './tools/soak/Sim.ts'; console.log(simulate(SEED))" --input-type=module

import { simulate, ALL_ABILITIES, ALL_HEROES, ALL_TOWERS, type SoakMode, type SoakResult } from './Sim.ts'

const RUNS = Number(process.argv[2] ?? 500)
// Most runs are a competent player. A slice of them are not, because the
// stuck states hide where a board cannot kill anything.
const MODES: SoakMode[] = ['normal', 'normal', 'normal', 'normal',
  'nobuild', 'supportonly', 'noabilities']

// Anything the engine or a rule module writes to the console counts as a
// failure: a soak that ignores warnings is a soak that misses the cheap bugs.
const consoleHits: Array<{ seed: number; level: string; text: string }> = []
let currentSeed = -1
for (const level of ['error', 'warn'] as const) {
  const original = console[level].bind(console)
  console[level] = (...args: unknown[]) => {
    consoleHits.push({ seed: currentSeed, level, text: args.map(String).join(' ').slice(0, 300) })
    if (consoleHits.length < 5) original(...args)
  }
}
const rejections: Array<{ seed: number; text: string }> = []
process.on('unhandledRejection', (r) => {
  rejections.push({ seed: currentSeed, text: String(r).slice(0, 300) })
})

const results: SoakResult[] = []
const crashes: Array<{ seed: number; error: string; stack: string }> = []
const firedTowers = new Set<string>()
const firedAbilities = new Set<string>()
const byKind = new Map<string, Array<{ seed: number; detail: string; wave: number }>>()

const t0 = Date.now()
for (let seed = 1; seed <= RUNS; seed++) {
  currentSeed = seed
  try {
    const r = simulate(seed, MODES[seed % MODES.length]!)
    results.push(r)
    for (const t of r.firedTowers) firedTowers.add(t)
    for (const a of r.firedAbilities) firedAbilities.add(a)
    for (const f of r.findings) {
      if (!byKind.has(f.kind)) byKind.set(f.kind, [])
      byKind.get(f.kind)!.push({ seed, detail: f.detail, wave: f.wave })
    }
  } catch (e) {
    const err = e as Error
    crashes.push({
      seed, error: String(err?.message ?? err),
      stack: `mode=${MODES[seed % MODES.length]} ${String(err?.stack ?? '').slice(0, 500)}`,
    })
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

const won = results.filter((r) => r.outcome === 'won').length
const lost = results.filter((r) => r.outcome === 'lost').length
const stuck = results.filter((r) => r.outcome === 'stuck').length
const flawless = results.filter((r) => r.outcome === 'won' && r.lives === 20).length
const mean = (f: (r: SoakResult) => number): number =>
  results.length === 0 ? 0 : results.reduce((n, r) => n + f(r), 0) / results.length

const out = {
  runs: RUNS,
  completed: results.length,
  seconds: Number(elapsed),
  outcomes: { won, lost, stuck },
  flawlessWins: flawless,
  means: {
    waves: +mean((r) => r.waves).toFixed(2),
    lives: +mean((r) => r.lives).toFixed(2),
    peanutsEarned: Math.round(mean((r) => r.peanutsEarned)),
    kills: Math.round(mean((r) => r.kills)),
    bannerPoints: Math.round(mean((r) => r.bannerPoints)),
  },
  crashes,
  rejections,
  consoleHits: consoleHits.slice(0, 40),
  consoleHitCount: consoleHits.length,
  findings: Object.fromEntries(
    [...byKind.entries()].map(([k, v]) => [k, { count: v.length, examples: v.slice(0, 5) }]),
  ),
  neverFired: {
    towers: ALL_TOWERS.filter((t) => !firedTowers.has(t)),
    // The Server Nuke is a mid-run drop gated on having cleared a run, so it
    // is not in the draft pool and cannot be cast here. Restructure is a hero
    // action, not a drafted ability.
    abilities: ALL_ABILITIES.filter((a) => !firedAbilities.has(a)),
  },
  modes: Object.fromEntries(MODES.filter((m, i) => MODES.indexOf(m) === i).map((m) => [
    m,
    (() => {
      const rs = results.filter((_, i) => MODES[(i + 1) % MODES.length] === m)
      return { runs: rs.length }
    })(),
  ])),
  coverage: {
    heroes: ALL_HEROES,
    levels: ['level1'],
    towersSeen: [...firedTowers].sort(),
    abilitiesSeen: [...firedAbilities].sort(),
  },
}

console.log(JSON.stringify(out, null, 1))
