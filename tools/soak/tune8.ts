// One variable at a time, over the same seeds, with the file put back.
//
//   node --experimental-strip-types tools/soak/tune8.ts 120 enemies:ceo.maxHealth 7000 9000 11000
//   node --experimental-strip-types tools/soak/tune8.ts 120 level8:armorAura.armorBonus 0 2 4
//   node --experimental-strip-types tools/soak/tune8.ts 120 --scale enemies:manager.maxHealth 0.8 1
//
// tools/soak/tune5.ts is level 5's version of this and it is left alone: it
// sweeps enemies.json against level 5 and is the record of how Batula was
// tuned. This one takes the FILE as well as the path, because two of level 8's
// three open numbers live in its rules block rather than on an enemy row -- the
// HR aura's bonus and the gate's multipliers -- and a sensitivity table that
// could only reach one of the two files would have had to be run by hand for
// the other, which is the "reverting between rows" failure the header of
// tune5.ts is about.
//
// THE REASON IT IS A SCRIPT. A row that forgot to put the last row's edit back
// measures two changes and reports one, and the table then says something
// confident and wrong about which of them mattered. The edit is written, the
// soak is re-imported in a CHILD PROCESS (JSON is frozen into the module graph
// at import, so one process cannot see two values), and the file is restored in
// a `finally` so a crash mid-sweep leaves nothing behind.
//
// LEVEL 8 IS PARKED, so the child runs tools/soak/level.ts, which registers the
// row it will have the day level 7 exists. See PARKED there.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const FILES: Record<string, URL> = {
  enemies: new URL('../../src/data/enemies.json', import.meta.url),
  level8: new URL('../../src/data/level8.json', import.meta.url),
  waves8: new URL('../../src/data/waves.level8.json', import.meta.url),
}

const argv = process.argv.slice(2)
const RUNS = Number(argv[0] ?? 120)
const scale = argv[1] === '--scale'
const target = argv[scale ? 2 : 1]!
const values = argv.slice(scale ? 3 : 2).map(Number)
const LEVEL = process.env.LEVEL ?? 'level8'

const [fileKey, path] = target.split(':') as [string, string]
const file = FILES[fileKey]
if (!file || !path) {
  console.log('usage: tune8.ts <runs> [--scale] <enemies|level8|waves8>:<dotted.path> <values...>')
  process.exit(1)
}

const original = readFileSync(file, 'utf8')

/** `ceo.maxHealth` -> the value it has now. */
function read(doc: any, dotted: string): number {
  return dotted.split('.').reduce((o, k) => o[k], doc)
}

function write(doc: any, dotted: string, value: number): void {
  const parts = dotted.split('.')
  const last = parts.pop()!
  parts.reduce((o, k) => o[k], doc)[last] = value
}

const base = read(JSON.parse(original), path)
console.log(`${target}: ${base} now, over ${RUNS} seeds on ${LEVEL}, normal\n`)
console.log('    value     wins    rate   lost after wave')

try {
  for (const v of values) {
    const doc = JSON.parse(original)
    const value = scale ? Math.round(base * v) : v
    write(doc, path, value)
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
    const out = execFileSync(
      process.execPath,
      ['--experimental-strip-types', 'tools/soak/level.ts', String(RUNS), LEVEL],
      { encoding: 'utf8' },
    )
    const rate = /(\d+)\/(\d+) wins\s+\((\d+)%\)/.exec(out)
    const lost = /lost after wave: (.*)/.exec(out)
    const exits = /lives lost by exit: (.*)/.exec(out)
    console.log(`  ${String(value).padStart(7)}  ${(rate?.[1] ?? '?').padStart(5)}`
      + `  ${(rate?.[3] ? rate[3] + '%' : '?').padStart(6)}   ${lost?.[1] ?? ''}`)
    if (exits) console.log(`          ${exits[1]}`)
  }
} finally {
  writeFileSync(file, original)
  console.log(`\n${fileKey}.json restored`)
}
