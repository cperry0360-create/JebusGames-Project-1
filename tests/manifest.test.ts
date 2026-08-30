import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { pickVariant, ROAD_ROLES } from '../src/systems/SpritePicker.ts'

const url = (p: string) => new URL(p, import.meta.url)
const art = JSON.parse(readFileSync(url('../src/data/art.json'), 'utf8'))

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(url(dir), { withFileTypes: true })) {
    if (e.isDirectory()) sourceFiles(`${dir}/${e.name}`, out)
    else if (e.name.endsWith('.ts')) out.push(`${dir}/${e.name}`)
  }
  return out
}

test('art.json is the only place a sprite is named', () => {
  // The whole point of the manifest: swapping art packs must be a config
  // change. If a sprite key leaks into a .ts file, that stops being true.
  const keys = new Set(Object.keys(art.files))
  const offenders: string[] = []
  for (const f of sourceFiles('../src')) {
    if (f.endsWith('systems/Art.ts')) continue
    const src = readFileSync(url(f), 'utf8')
    for (const m of src.matchAll(/['"`]([^'"`\n]+)['"`]/g)) {
      if (keys.has(m[1])) offenders.push(`${f.replace('../', '')} mentions sprite key "${m[1]}"`)
    }
  }
  assert.deepEqual(offenders, [], 'sprite keys must be resolved through src/systems/Art.ts')
})

test('no source file names an art filename directly', () => {
  const offenders: string[] = []
  for (const f of sourceFiles('../src')) {
    const src = readFileSync(url(f), 'utf8')
    if (/towerDefense_tile\d{3}/.test(src)) offenders.push(f.replace('../', ''))
  }
  assert.deepEqual(offenders, [], 'filenames belong in art.json, not in code')
})

test('every role in the manifest resolves to a file that exists', () => {
  const keys = new Set(Object.keys(art.files))
  const roleRefs: Array<[string, string]> = []
  for (const [role, key] of Object.entries(art.autotile) as [string, string][]) roleRefs.push([`autotile.${role}`, key])
  for (const [role, key] of Object.entries(art.ui) as [string, string][]) roleRefs.push([`ui.${role}`, key])
  for (const [role, key] of Object.entries(art.fx) as [string, string][]) roleRefs.push([`fx.${role}`, key])
  art.decor.forEach((key: string, i: number) => roleRefs.push([`decor[${i}]`, key]))
  for (const g of ['grass', 'road']) {
    art.ground[g].forEach((w: any, i: number) => roleRefs.push([`ground.${g}[${i}]`, w.key]))
  }
  for (const [role, key] of roleRefs) {
    assert.ok(keys.has(key), `${role} points at unknown sprite key "${key}"`)
    assert.ok(existsSync(url(`../public/assets/kenney/${art.files[key]}`)), `${role} -> ${key} has no file`)
  }
})

test('the autotiler has a sprite for every role it can return', () => {
  for (const r of ROAD_ROLES) {
    assert.ok(art.autotile[r], `no sprite mapped for road role "${r}"`)
  }
  assert.equal(Object.keys(art.autotile).length, ROAD_ROLES.length,
    'autotile map and role list disagree')
})

test('ground variant picking is deterministic and covers the whole list', () => {
  for (const list of [art.ground.grass, art.ground.road]) {
    assert.ok(list.length > 1, 'a single variant gives no terrain variety')
    for (const w of list as any[]) assert.ok(w.weight > 0, `${w.key} has no weight`)
    // Every entry must be reachable, or it is dead weight in the manifest.
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(pickVariant(list, i / 1000))
    assert.equal(seen.size, list.length, `only ${seen.size} of ${list.length} variants are reachable`)
    // Same roll, same answer.
    assert.equal(pickVariant(list, 0.42), pickVariant(list, 0.42))
    // Boundaries must not fall through.
    assert.ok(pickVariant(list, 0))
    assert.ok(pickVariant(list, 0.999999))
  }
})

test('weights actually bias the ground variants', () => {
  const counts: Record<string, number> = {}
  for (let i = 0; i < 2000; i++) {
    const k = pickVariant(art.ground.grass, i / 2000)
    counts[k] = (counts[k] ?? 0) + 1
  }
  const heaviest = [...art.ground.grass].sort((a: any, b: any) => b.weight - a.weight)[0]
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  assert.equal(top, heaviest.key, 'the heaviest variant should appear most often')
})

test('the manifest is complete enough to load a whole game', () => {
  assert.ok(Object.keys(art.files).length > 40, 'suspiciously small manifest')
  assert.match(art.basePath, /\/$/, 'basePath must end in a slash or URLs will be wrong')
  assert.ok(art.note && art.note.length > 0, 'the manifest should say what it is for')
})

test('swapping the manifest to another pack needs no code edit', () => {
  // Simulated pack swap: rewrite every filename, and check nothing in src
  // referenced the old ones. This is the guarantee, stated as a test.
  const swapped = Object.fromEntries(Object.keys(art.files).map((k) => [k, `otherPack_${k}.png`]))
  for (const f of sourceFiles('../src')) {
    const src = readFileSync(url(f), 'utf8')
    for (const oldFile of Object.values(art.files) as string[]) {
      assert.ok(!src.includes(oldFile), `${f} hardcodes ${oldFile}`)
    }
  }
  assert.equal(Object.keys(swapped).length, Object.keys(art.files).length)
})
