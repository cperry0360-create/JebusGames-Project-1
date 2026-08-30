import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'

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

test('no source file names an art file or directory directly', () => {
  const offenders: string[] = []
  const dirs = new Set(Object.values(art.files).map((p: any) => String(p).split('/')[0]))
  for (const f of sourceFiles('../src')) {
    const src = readFileSync(url(f), 'utf8')
    if (/towerDefense_tile\d{3}/.test(src)) offenders.push(`${f} names a pack filename`)
    for (const d of dirs) {
      if (src.includes(`${d}/`)) offenders.push(`${f} names the "${d}/" asset directory`)
    }
  }
  assert.deepEqual(offenders, [], 'paths belong in art.json, not in code')
})

test('every role in the manifest resolves to a file that exists', () => {
  const keys = new Set(Object.keys(art.files))
  const roleRefs: Array<[string, string]> = []
  for (const [role, key] of Object.entries(art.map) as [string, string][]) roleRefs.push([`map.${role}`, key])
  for (const [role, key] of Object.entries(art.ui) as [string, string | null][]) {
    // A null role is a deliberate opt-out, e.g. towers that carry their own base.
    if (key !== null) roleRefs.push([`ui.${role}`, key])
  }
  for (const [role, key] of Object.entries(art.fx) as [string, string][]) roleRefs.push([`fx.${role}`, key])
  art.decor.forEach((key: string, i: number) => roleRefs.push([`decor[${i}]`, key]))
  for (const [role, key] of roleRefs) {
    assert.ok(keys.has(key), `${role} points at unknown sprite key "${key}"`)
    assert.ok(existsSync(url(`../public/${art.assetRoot}${art.files[key]}`)), `${role} -> ${key} has no file`)
  }
})

test('the painted plate is a first-class manifest role', () => {
  // The map used to be tiles picked in code. It is one image now, and which
  // image it is has to stay a config change like every other sprite.
  assert.ok(Object.keys(art.map).length > 0, 'no map plates in the manifest')
  assert.equal(art.ground, undefined, 'ground tile variants belong to the old tile map')
  assert.equal(art.autotile, undefined, 'road autotiling belongs to the old tile map')
  for (const [name, key] of Object.entries(art.map) as [string, string][]) {
    assert.match(art.files[key], /^maps\//, `plate "${name}" should live under the maps directory`)
  }
})

test('the manifest is complete enough to load a whole game', () => {
  assert.ok(Object.keys(art.files).length > 30, 'suspiciously small manifest')
  assert.match(art.assetRoot, /\/$/, 'assetRoot must end in a slash or URLs will be wrong')
  assert.ok(art.note && art.note.length > 0, 'the manifest should say what it is for')
})

test('every file in the manifest exists under assetRoot', () => {
  for (const [key, path] of Object.entries(art.files) as [string, string][]) {
    assert.ok(!path.startsWith('/'), `${key} path should be relative to assetRoot`)
    assert.ok(existsSync(url(`../public/${art.assetRoot}${path}`)), `${key} -> ${path} is missing`)
  }
})

test('art from any source size can be placed without touching code', () => {
  // This is the swap guarantee: anchor and on-screen height are manifest
  // fields, so art authored at 512px drops in beside art authored at 64px.
  for (const [key, cfg] of Object.entries(art.render) as [string, any][]) {
    assert.ok(art.files[key], `render config for unknown sprite key "${key}"`)
    if (cfg.anchorX !== undefined) assert.ok(cfg.anchorX >= 0 && cfg.anchorX <= 1, `${key} anchorX`)
    if (cfg.anchorY !== undefined) assert.ok(cfg.anchorY >= 0 && cfg.anchorY <= 1, `${key} anchorY`)
    if (cfg.displayHeight !== undefined) assert.ok(cfg.displayHeight > 0, `${key} displayHeight`)
    if (cfg.shadowWidth !== undefined) assert.ok(cfg.shadowWidth > 0, `${key} shadowWidth`)
  }
})

test('a sprite anchored at its base is what makes it stand on the ground', () => {
  // The anchor puts the artwork's bottom on the painted ground line. It is not
  // always exactly 1: a canvas with transparent padding below the art needs a
  // slightly smaller value, or the art floats by the height of that padding.
  const tall = Object.entries(art.render).filter(([, c]: [string, any]) =>
    c.displayHeight !== undefined && c.displayHeight > 64)
  assert.ok(tall.length > 0, 'no tall art is configured, so this proves nothing')
  for (const [key, cfg] of tall as [string, any][]) {
    assert.ok(cfg.anchorY >= 0.95,
      `${key} is tall art but anchors at ${cfg.anchorY}; it will float or sink`)
  }
})

test('anchors sit near the horizontal centre', () => {
  // A canvas padded unevenly needs an anchor off 0.5 to put the art's base
  // over the build spot, but never far off — that would mean a bad measurement.
  for (const [key, cfg] of Object.entries(art.render) as [string, any][]) {
    if (cfg.anchorX === undefined) continue
    assert.ok(Math.abs(cfg.anchorX - 0.5) < 0.1,
      `${key} anchorX ${cfg.anchorX} is far off centre; check the measurement`)
  }
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
