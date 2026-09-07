import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (p: string) => readFileSync(url(`../${p}`), 'utf8')
const json = (p: string) => JSON.parse(read(p))

/**
 * EVERY ASSET PATH THE GAME NAMES, CHECKED AGAINST THE DISK.
 *
 * WHY THIS EXISTS, and why it is broader than the manifest check in
 * `assets.test.ts`. This class has now reached the deployed game twice:
 *
 *   1. `ability_eli_1.webp`, `ability_eli_2.webp` and `ability_bailey_1.webp`
 *      were named in art.json, requested on every boot, absent from the
 *      repository, and green on all four CI jobs.
 *   2. The same three, seen on an iPad: a 256px yellow exclamation mark in a
 *      56px ability slot, and a blank circle where Zoomies should be.
 *
 * `assets.test.ts` walks `art.files` and nothing else, so a path written into
 * audio.json, music.json, or straight into a `.ts` file is not covered by it.
 * This walks EVERY string in `src/` that looks like a filename and resolves it,
 * which is deliberately blunt: a check with an exemption list is a check that
 * grows exemptions.
 */

const ROOTS = ['public/', 'public/assets/']

/** Every file under src/, including the JSON data. */
function srcFiles(dir = 'src'): string[] {
  const out: string[] = []
  for (const e of readdirSync(url(`../${dir}`), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) out.push(...srcFiles(p))
    else out.push(p)
  }
  return out
}

const ASSET_LITERAL =
  /["']([^"'\s]+\.(?:webp|png|jpg|jpeg|gif|svg|mp3|ogg|m4a|wav|ttf|otf|woff2?))["']/g

const resolves = (p: string): boolean =>
  ROOTS.some((r) => existsSync(url(`../${r}${p}`)) && statSync(url(`../${r}${p}`)).isFile())

test('every asset path written anywhere in src/ exists under public/', () => {
  const missing: string[] = []
  for (const f of srcFiles()) {
    // MARKDOWN IS PROSE, NOT A REFERENCE. `src/data/README.md` explains the
    // manifest format with two example paths -- "towers/tower_withholding.webp
    // sits beside kenney/towerDefense_tile203.webp" -- and neither is a file
    // the game asks for. Nothing loads a .md, so this is a scope rule rather
    // than an exemption: every file the game actually reads is still swept,
    // with no per-path allowances.
    if (f.endsWith('.md')) continue
    const body = read(f)
    for (const m of body.matchAll(ASSET_LITERAL)) {
      const p = m[1]!
      // A bare filename with no directory is prose, not a path — the notes in
      // these files mention files by name constantly.
      if (!p.includes('/')) continue
      if (p.startsWith('http') || p.startsWith('data:')) continue
      if (!resolves(p)) missing.push(`${f}: ${p}`)
    }
  }
  assert.deepEqual(missing, [],
    'these paths are named in src/ and are not on disk under public/')
})

/* --------------------------- the structured references, resolved properly */

test('every key in the art manifest resolves to a real file', () => {
  const art = json('src/data/art.json')
  const missing: string[] = []
  for (const [key, path] of Object.entries(art.files as Record<string, string>)) {
    if (!existsSync(url(`../public/${art.assetRoot}${path}`))) missing.push(`${key} -> ${path}`)
  }
  assert.deepEqual(missing, [], 'art.json names files that are not in public/assets')
})

test('every ability and hero slot names an icon and an effect that exist', () => {
  /*
   * THE ONE THAT WOULD HAVE CAUGHT THE IPAD. Bailey's Bark pointed at
   * `ability-bailey-1`, that key pointed at a file that was not in the
   * repository, and nothing anywhere asked the question in those terms --
   * art.json was self-consistent and heroes.json was self-consistent.
   *
   * Checked through BOTH hops: the logical key must be in the manifest, and
   * the manifest's file must be on disk.
   */
  const art = json('src/data/art.json')
  const heroes = json('src/data/heroes.json')
  const abilities = json('src/data/abilities.json')
  const bad: string[] = []
  const hop = (owner: string, what: string, key: unknown): void => {
    if (typeof key !== 'string' || key === '') return
    const path = (art.files as Record<string, string>)[key]
    if (path === undefined) { bad.push(`${owner} ${what}: "${key}" is not in art.files`); return }
    if (!existsSync(url(`../public/${art.assetRoot}${path}`))) {
      bad.push(`${owner} ${what}: "${key}" -> ${path} is not on disk`)
    }
  }
  for (const [id, h] of Object.entries(heroes as Record<string, any>)) {
    if (id.startsWith('_')) continue
    // EVERY ABILITY THIS HERO HAS, walked rather than the two it used to be
    // guaranteed. Courtland has three; a loop over `slot1` and `slot2` would
    // have checked two of them and reported the third's art as fine.
    for (const [i, a] of (h.abilities ?? []).entries()) {
      hop(`${id}.abilities[${i}]`, 'icon', a?.icon)
      hop(`${id}.abilities[${i}]`, 'fx', a?.fx)
    }
    hop(id, 'portraitSprite', h.portraitSprite)
    hop(id, 'poweredSprite', h.poweredSprite)
  }
  for (const [id, a] of Object.entries(abilities as Record<string, any>)) {
    if (id.startsWith('_')) continue
    hop(id, 'icon', a.icon)
    hop(id, 'fx', a.fx)
  }
  assert.deepEqual(bad, [], 'an ability points at art that will not load')
})

test('every audio cue and music track resolves to a real file', () => {
  const audio = json('src/data/audio.json')
  const missing: string[] = []
  for (const [id, c] of Object.entries(audio.cues as Record<string, any>)) {
    const p = `${audio.root}${c.file}.${c.format}`
    if (!existsSync(url(`../public/${p}`))) missing.push(`cue ${id} -> ${p}`)
  }
  const music = json('src/data/music.json')
  for (const [id, m] of Object.entries(music as Record<string, any>)) {
    if (id.startsWith('_') || typeof m !== 'object' || m === null) continue
    const file = (m as { file?: string }).file
    if (typeof file !== 'string') continue
    if (!existsSync(url(`../public/${music.root}${file}`))) missing.push(`music ${id} -> ${file}`)
  }
  assert.deepEqual(missing, [], 'a declared sound has no file behind it')
})

/* ------------------------------------------- and the fallback, when one is used */

test('a missing texture is drawn at the size of the thing it replaced', () => {
  /*
   * THE SECOND HALF OF THE IPAD BUG, and the one that is not about a file.
   *
   * The ability bar read:
   *   if (exists(wantKey) && key !== wantKey) { setTexture(...); fitInBox(...) }
   * so when the wanted texture did NOT exist -- which is exactly what happens
   * to `<icon>-grey` when the icon itself failed to load, because nothing
   * builds a greyscale copy of a texture that is not there -- the whole block
   * was skipped. The sprite kept the texture AND the scale it was constructed
   * with, and the 256-pixel stand-in drew at 256 pixels in a 56-pixel slot.
   *
   * The fit is unconditional now, and it fits the key the sprite is ACTUALLY
   * wearing rather than the one that was wanted; those differ precisely when a
   * fallback is in play.
   */
  const hud = read('src/scenes/HudScene.ts')
  assert.match(hud, /fitInBox\(slot\.icon, slot\.icon\.texture\.key, r\.boxH\)/,
    'the ability icon is not fitted to the texture it is actually showing')
  const swap = /const base = this\.world\.abilityIcon[\s\S]{0,700}?r\.boxH\)/.exec(hud)
  assert.ok(swap, 'the icon swap has moved; this test is checking nothing')
  // The fit must NOT be inside the "does the texture exist" branch any more.
  assert.ok(!/if \(this\.textures\.exists\(wantKey\)[\s\S]{0,200}fitInBox/.test(swap[0]),
    'the fit is back inside the existence check, so a missing texture goes unfitted')
  // And an absent greyscale copy falls back to the colour icon rather than to
  // nothing: wrong-looking but present beats blank.
  assert.match(swap[0], /this\.textures\.exists\(grey\) \? grey : base/,
    'an unavailable slot with no greyscale copy has nothing to draw')

  const fallbackSize = json('src/data/presentation.json').iconFallback.size
  assert.equal(fallbackSize, 256,
    'the stand-in canvas changed size; the point is that it is much larger than a slot, '
    + 'which is why it has to be fitted rather than trusted')
})
