// One variable at a time, over the same seeds, with the file put back.
//
//   node --experimental-strip-types tools/soak/tune7.ts 120 enemies:transporter.maxHealth 5000 7000 9000
//   node --experimental-strip-types tools/soak/tune7.ts 120 level7:blades.damagePerSecond 0 55 110
//   node --experimental-strip-types tools/soak/tune7.ts 120 --scale enemies:hatchback.maxHealth 0.8 1
//
// tools/soak/tune5.ts is level 5's version of this and tools/soak/tune8.ts is
// level 8's; both are left alone, because each is the record of how one level
// was tuned. This one takes the FILE as well as the path, for tune8's reason:
// level 7's open numbers are spread across three files -- the two boss healths
// and the rank and file on enemies.json rows, the blades' reach and rate in
// src/data/level7.json, and the wave counts in the table -- and a sensitivity
// table that could only reach one of them would have had to be run by hand for
// the others, which is the "reverting between rows" failure the header of
// tune5.ts is about.
//
// THE REASON IT IS A SCRIPT. A row that forgot to put the last row's edit back
// measures two changes and reports one, and the table then says something
// confident and wrong about which of them mattered. The edit is written, the
// soak is re-imported in a CHILD PROCESS (JSON is frozen into the module graph
// at import, so one process cannot see two values), and the file is restored in
// a `finally` so a crash mid-sweep leaves nothing behind.
//
// LEVEL 7 IS REGISTERED, so the child runs tools/soak/level.ts against its real
// row. Registering it gave level 8 its prerequisite too, so PARKED there is
// empty and nothing in this tool depends on a tools-only row any more.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const FILES: Record<string, URL> = {
  enemies: new URL('../../src/data/enemies.json', import.meta.url),
  level7: new URL('../../src/data/level7.json', import.meta.url),
  waves7: new URL('../../src/data/waves.level7.json', import.meta.url),
}

const argv = process.argv.slice(2)
const RUNS = Number(argv[0] ?? 120)
const scale = argv[1] === '--scale'
const target = argv[scale ? 2 : 1]!
const values = argv.slice(scale ? 3 : 2).map(Number)
const LEVEL = process.env.LEVEL ?? 'level7'

const [fileKey, path] = target.split(':') as [string, string]
const file = FILES[fileKey]
if (!file || !path) {
  console.log('usage: tune7.ts <runs> [--scale] <enemies|level7|waves7>:<dotted.path> <values...>')
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
