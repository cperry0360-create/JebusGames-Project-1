// Level 9's open numbers, one row at a time or all four bosses at once.
//
//   node --experimental-strip-types tools/soak/tune9.ts 120 --scale bosses 0.8 0.9 1.0
//   node --experimental-strip-types tools/soak/tune9.ts 120 enemies:perplexed.maxHealth 6000 7000
//   node --experimental-strip-types tools/soak/tune9.ts 120 waves9:flankShare 0.05 0.1 0.2
//
// tools/soak/tune8.ts is level 8's version of this and it is the one this was
// written from, down to the child process and the `finally`. Two things are
// new, and both are about level 9 rather than about tuning:
//
//   A NAMED SET. Level 9's shape is FOUR MINI-BOSS FIGHTS, at waves 4, 8, 12
//   and 16, and moving one of them moves one quarter of the level. A retune
//   that has to bring the whole level back into band needs to move all four
//   together and needs the table to say so; `bosses` is that set, swept by one
//   scale so the fights keep their relative sizes. tune8's one-variable form
//   is still here and is what the per-boss sensitivity tables below use.
//
//   THE SHARE IS A WHOLE COLUMN. `flankShare` is per wave -- sixteen copies of
//   the same number -- so `waves9:flankShare` writes all sixteen at once. There
//   is no sensible way to sweep one wave's share on its own and no reason to.
//
// The child process matters for the same reason it does in tune8: JSON is
// frozen into the module graph at import, so one process cannot see two values.
// The file is written, the soak runs in a child, and the original is restored
// in a `finally` so a crash mid-sweep leaves nothing behind.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const FILES: Record<string, URL> = {
  enemies: new URL('../../src/data/enemies.json', import.meta.url),
  level9: new URL('../../src/data/level9.json', import.meta.url),
  waves9: new URL('../../src/data/waves.level9.json', import.meta.url),
}

/** The four mini bosses, in the order they are met. */
const BOSSES = ['hatGtt', 'cancer', 'noPilot', 'perplexed']

const argv = process.argv.slice(2)
const RUNS = Number(argv[0] ?? 120)
const scale = argv[1] === '--scale'
const target = argv[scale ? 2 : 1]!
const values = argv.slice(scale ? 3 : 2).map(Number)
const LEVEL = process.env.LEVEL ?? 'level9'

if (!target || !values.length) {
  console.log('usage: tune9.ts <runs> [--scale] <bosses|enemies|level9|waves9:path> <values...>')
  process.exit(1)
}

/** Which file, and which dotted paths inside it, this sweep writes. */
function resolve(t: string): { file: URL; key: string; paths: string[] } {
  if (t === 'bosses') {
    return { file: FILES.enemies!, key: 'enemies', paths: BOSSES.map((b) => `${b}.maxHealth`) }
  }
  const [fileKey, path] = t.split(':') as [string, string]
  const file = FILES[fileKey]
  if (!file || !path) {
    console.log(`unknown target ${t}`)
    process.exit(1)
  }
  return { file, key: fileKey, paths: [path] }
}

const { file, key, paths } = resolve(target)
const original = readFileSync(file, 'utf8')

function read(doc: any, dotted: string): number {
  return dotted.split('.').reduce((o, k) => o[k], doc)
}

function write(doc: any, dotted: string, value: number): void {
  const parts = dotted.split('.')
  const last = parts.pop()!
  parts.reduce((o, k) => o[k], doc)[last] = value
}

/** `flankShare` is per wave; writing it means writing all sixteen. */
function writeAll(doc: any, dotted: string, value: number): void {
  if (key === 'waves9' && !dotted.includes('.')) {
    for (const w of doc.waves) w[dotted] = value
    return
  }
  write(doc, dotted, value)
}

function readAny(doc: any, dotted: string): number {
  if (key === 'waves9' && !dotted.includes('.')) return doc.waves[0][dotted]
  return read(doc, dotted)
}

const baseDoc = JSON.parse(original)
const base = paths.map((p) => readAny(baseDoc, p))
console.log(`${target}: ${paths.map((p, i) => `${p}=${base[i]}`).join(', ')}`)
console.log(`over ${RUNS} seeds on ${LEVEL}, normal\n`)
console.log('    value                              wins    rate   lost after wave')

try {
  for (const v of values) {
    const doc = JSON.parse(original)
    const applied = paths.map((p, i) => {
      const value = scale ? Math.round(base[i]! * v) : v
      writeAll(doc, p, value)
      return value
    })
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
    const out = execFileSync(
      process.execPath,
      ['--experimental-strip-types', 'tools/soak/level.ts', String(RUNS), LEVEL],
      { encoding: 'utf8' },
    )
    const rate = /(\d+)\/(\d+) wins\s+\((\d+)%\)/.exec(out)
    const lost = /lost after wave: (.*)/.exec(out)
    const label = scale ? `x${v}  (${applied.join(', ')})` : String(applied[0])
    console.log(`  ${label.padEnd(33)}  ${(rate?.[1] ?? '?').padStart(4)}`
      + `  ${(rate?.[3] ? rate[3] + '%' : '?').padStart(6)}   ${lost?.[1] ?? ''}`)
  }
} finally {
  writeFileSync(file, original)
  console.log(`\n${key}.json restored`)
}
