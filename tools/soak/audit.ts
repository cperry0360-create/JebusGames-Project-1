// The static half of the soak: what the manifest, the types and the tree say.
//
//   node --experimental-strip-types tools/soak/audit.ts
//
// Reports rather than asserts. The test suite already fails on the two
// manifest invariants; this exists to list everything at once, including the
// things that are untidy rather than wrong.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'

const root = new URL('../../', import.meta.url)
const read = (p: string): string => readFileSync(new URL(p, root), 'utf8')
const art = JSON.parse(read('src/data/art.json'))

const walk = (dir: string, ext: string, out: string[] = []): string[] => {
  for (const e of readdirSync(new URL(dir, root), { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${dir}/${e.name}`, ext, out)
    else if (e.name.endsWith(ext)) out.push(`${dir}/${e.name}`)
  }
  return out
}

const srcFiles = walk('src', '.ts')
const allSrc = srcFiles.map(read).join('\n')
const dataBlob = walk('src/data', '.json').map(read).join('\n')

// --- manifest ------------------------------------------------------------
const claimed = new Set<string>()
const claim = (k: unknown): void => { if (typeof k === 'string') claimed.add(k) }
for (const section of ['map', 'ui', 'fx', 'prop', 'brand'] as const) {
  for (const v of Object.values(art[section] ?? {})) {
    if (v && typeof v === 'object') Object.values(v as Record<string, string>).forEach(claim)
    else claim(v)
  }
}
for (const k of art.decor ?? []) claim(k)
for (const k of art.greyable ?? []) claim(k)
for (const set of Object.values(art.towerTiers ?? {})) for (const k of set as string[]) claim(k)
for (const key of Object.keys(art.files)) if (new RegExp(`"${key}"`).test(dataBlob)) claimed.add(key)

const orphanKeys = Object.keys(art.files).filter((k) => !claimed.has(k))
const missingFiles = Object.entries(art.files)
  .filter(([, p]) => !existsSync(new URL(`public/${art.assetRoot}${p}`, root)))
  .map(([k, p]) => `${k} -> ${p}`)

// Files on disk that the manifest never names.
const assetRoot = `public/${art.assetRoot}`.replace(/\/$/, '')
const named = new Set(Object.values(art.files) as string[])
const onDisk = walk(assetRoot, '.webp').map((p) => p.slice(assetRoot.length + 1))
const unreferencedFiles = onDisk.filter((p) => !named.has(p))
const unreferencedBytes = unreferencedFiles.reduce(
  (n, p) => n + statSync(new URL(`${assetRoot}/${p}`, root)).size, 0)

// --- typescript ----------------------------------------------------------
const tsconfig = read('tsconfig.json')
const strict = /"strict"\s*:\s*true/.test(tsconfig)
let tsc = ''
try {
  tsc = execSync('npx tsc --noEmit 2>&1 || true', { encoding: 'utf8', cwd: new URL('.', root).pathname })
} catch { tsc = 'tsc could not run' }
const tscLines = tsc.split('\n').filter((l) => /error TS/.test(l))
const phaserCascade = tscLines.filter((l) => /Cannot find module 'phaser'|does not exist on type/.test(l))

// --- dead code -----------------------------------------------------------
// An exported name that nothing outside its own file mentions.
const deadExports: string[] = []
for (const f of srcFiles) {
  const body = read(f)
  for (const m of body.matchAll(/^export (?:async )?function (\w+)|^export const (\w+)|^export class (\w+)/gm)) {
    const name = m[1] ?? m[2] ?? m[3]!
    const others = srcFiles.filter((o) => o !== f).map(read).join('\n')
    const testsDir = walk('tests', '.ts').map(read).join('\n')
    const used = new RegExp(`\\b${name}\\b`).test(others) || new RegExp(`\\b${name}\\b`).test(testsDir)
    if (!used) deadExports.push(`${f.replace('src/', '')}: ${name}`)
  }
}

console.log(JSON.stringify({
  manifest: {
    keys: Object.keys(art.files).length,
    orphanKeys,
    missingFiles,
    unreferencedFilesOnDisk: unreferencedFiles,
    unreferencedKilobytes: Math.round(unreferencedBytes / 1024),
  },
  typescript: {
    strict,
    totalErrors: tscLines.length,
    phaserCascade: phaserCascade.length,
    other: tscLines.filter((l) => !phaserCascade.includes(l)).slice(0, 30),
  },
  deadExports,
}, null, 1))
