// One variable at a time, over the same seeds, with the file put back.
//
//   node --experimental-strip-types tools/soak/tune5.ts 120 batula.maxHealth 3000 4200 5400
//   node --experimental-strip-types tools/soak/tune5.ts 120 --scale glider.maxHealth 0.8 0.9 1
//
// THIS IS HOW A SENSITIVITY TABLE IS BUILT, and the reason it is a script
// rather than a person editing JSON between runs is the "reverting between
// rows" part of the brief. A row that forgot to put the last row's edit back
// measures two changes and reports one, and the table then says something
// confident and wrong about which of them mattered -- which is the failure
// level 4's boss table exists to avoid repeating.
//
// The edit is written to src/data/enemies.json, the soak is re-imported in a
// child process (JSON is frozen into the module graph at import, so the same
// process cannot see a second value), and the file is restored in a `finally`
// so a crash mid-sweep does not leave the repository holding a probe value.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const ENEMIES = new URL('../../src/data/enemies.json', import.meta.url)

const argv = process.argv.slice(2)
const RUNS = Number(argv[0] ?? 120)
const scale = argv[1] === '--scale'
const path = argv[scale ? 2 : 1]!
const values = argv.slice(scale ? 3 : 2).map(Number)

const original = readFileSync(ENEMIES, 'utf8')

/** `glider.maxHealth` -> the value it has now. */
function read(doc: any, dotted: string): number {
  return dotted.split('.').reduce((o, k) => o[k], doc)
}

function write(doc: any, dotted: string, value: number): void {
  const parts = dotted.split('.')
  const last = parts.pop()!
  parts.reduce((o, k) => o[k], doc)[last] = value
}

const base = read(JSON.parse(original), path)
console.log(`${path}: ${base} now, over ${RUNS} seeds, normal\n`)
console.log('    value     wins    rate   lost after wave')

try {
  for (const v of values) {
    const doc = JSON.parse(original)
    const value = scale ? Math.round(base * v) : v
    write(doc, path, value)
    writeFileSync(ENEMIES, JSON.stringify(doc, null, 2) + '\n')
    const out = execFileSync(
      process.execPath,
      ['--experimental-strip-types', 'tools/soak/level.ts', String(RUNS), 'level5'],
      { encoding: 'utf8' },
    )
    const rate = /(\d+)\/(\d+) wins\s+\((\d+)%\)/.exec(out)
    const lost = /lost after wave: (.*)/.exec(out)
    console.log(`  ${String(value).padStart(7)}  ${(rate?.[1] ?? '?').padStart(5)}`
      + `  ${(rate?.[3] ? rate[3] + '%' : '?').padStart(6)}   ${lost?.[1] ?? ''}`)
  }
} finally {
  writeFileSync(ENEMIES, original)
  console.log('\nenemies.json restored')
}
