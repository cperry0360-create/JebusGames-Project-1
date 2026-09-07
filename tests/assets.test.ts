import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const art = JSON.parse(readFileSync(url('../src/data/art.json'), 'utf8'))

/**
 * WHAT SHIPS, MEASURED AGAINST WHAT IS ASKED FOR.
 *
 * THIS TEST EXISTS BECAUSE THREE FILES 404'D ON THE LIVE BUILD AND ALL FOUR CI
 * JOBS WERE GREEN. `assets/abilities/ability_eli_1.webp`, `ability_eli_2.webp`
 * and `ability_bailey_1.webp` were named in art.json, requested by the loader
 * on every boot, and were not in the repository. Nothing failed.
 *
 * The hole was `optional`. manifest.test.ts already checks that every manifest
 * path exists -- and skips any key on that list, on the reasoning that an
 * optional key is a HOOK: the path is agreed first and the file lands later.
 * That reasoning is right about the LOADER and wrong about the DEPLOY.
 * `queueArt` iterates `ART.files` and queues every one of them; it has no idea
 * which are optional, and it could not have -- the only way to find out a file
 * is absent is to ask the server for it. So an optional key is not a file the
 * build does not request. It is a file the build requests and is told does not
 * exist, on every single boot, by every single player.
 *
 * So the rule here is deliberately blunt and has NO exemption list: if a path
 * is in the manifest, the file is in the build. A key that is genuinely not
 * ready yet should not be in `files` at all -- taking it out is one line, and
 * `icon()` and the missing-texture stand-in already cover the drawing side.
 *
 * "The built output" is `public/`, verbatim: Vite copies that directory into
 * `dist/` unchanged and unhashed (which is why `stamped()` exists at all), so
 * a file present here is present in the deploy and a file absent here 404s.
 * Checking `dist/` instead would mean running a build, and `npm install`
 * answers 403 in the agent environment -- see CLAUDE.md on typechecking.
 */
test('every asset the manifest names is in the built output', () => {
  const missing: string[] = []
  for (const [key, path] of Object.entries(art.files) as [string, string][]) {
    if (!existsSync(url(`../public/${art.assetRoot}${path}`))) {
      missing.push(`${key} -> ${art.assetRoot}${path}`)
    }
  }
  assert.deepEqual(missing, [],
    'the loader requests every manifest path on every boot; these would 404')
})

/**
 * And the same question asked the other way round, because `optional` was the
 * mechanism that hid the first fault and it is still in the manifest.
 *
 * A key on that list is tolerated by BootScene -- it warns instead of showing
 * the missing-art banner -- which is a reasonable thing to want for art that
 * is arriving. What it must never mean is that the file can be absent from the
 * deploy: that is the exact combination that shipped three 404s quietly. So
 * the list may name keys, and every key it names must still have its file.
 */
test('an optional key is a soft failure to DRAW, never a missing file', () => {
  const optional: string[] = art.optional ?? []
  const absent = optional.filter(
    (key) => art.files[key] && !existsSync(url(`../public/${art.assetRoot}${art.files[key]}`)),
  )
  assert.deepEqual(absent, [],
    'optional means the game survives without it, not that it may 404')
})

/**
 * Nothing may be named that is not there, and nothing hero-shaped may be there
 * that is not named.
 *
 * The second half is narrower than the first on purpose. Plenty of files under
 * `public/assets` are legitimately unreferenced -- the Kenney pack ships whole,
 * fonts are loaded by CSS, audio has its own manifest -- so a blanket "every
 * file is referenced" rule would be noise. The three directories the hero
 * update owns are different: every file in them exists to be drawn by a key in
 * art.json, so one that no key points at is either dead weight in the deploy
 * or art that was placed and never wired. Both have happened.
 */
test('every hero, ability and effect file on disk is bound to a manifest key', () => {
  const referenced = new Set(Object.values(art.files) as string[])
  const orphans: string[] = []
  for (const dir of ['heroes', 'abilities', 'effects']) {
    const root = url(`../public/${art.assetRoot}${dir}/`)
    if (!existsSync(root)) continue
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (e.isDirectory()) continue
      if (!referenced.has(`${dir}/${e.name}`)) orphans.push(`${dir}/${e.name}`)
    }
  }
  assert.deepEqual(orphans, [],
    'art in these directories exists to be drawn; an unreferenced file is dead weight')
})

/**
 * No source PNG left beside the WebP it was converted into.
 *
 * Everything under public/assets is stored as WebP at quality 95, and the
 * conversion leaves the PNG in place deliberately -- deleting it is a separate
 * step (see tools/towebp/run.sh). A step that is separate is a step that gets
 * forgotten, and a forgotten 400KB PNG beside a 40KB WebP is pure deploy
 * weight nothing ever requests.
 */
test('no PNG ships beside the WebP that replaced it', () => {
  const root = url(`../public/${art.assetRoot}`)
  const strays: string[] = []
  const walk = (dir: URL, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { walk(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`); continue }
      if (!e.name.endsWith('.png')) continue
      if (existsSync(new URL(e.name.replace(/\.png$/, '.webp'), dir))) {
        strays.push(`${prefix}${e.name}`)
      }
    }
  }
  walk(root, '')
  assert.deepEqual(strays, [], 'the .webp is what ships; delete the .png')
})

/**
 * The manifest's own size, reported rather than asserted.
 *
 * `content.test.ts` owns the deploy budget and this does not duplicate it.
 * What this adds is the per-directory breakdown the budget test cannot give,
 * so a report can say where 26MB went without anyone re-deriving it by hand.
 */
test('the art the manifest names is weighed, per directory', () => {
  const root = url(`../public/${art.assetRoot}`)
  const totals = new Map<string, { files: number; mb: number }>()
  for (const path of new Set(Object.values(art.files) as string[])) {
    const file = url(`../public/${art.assetRoot}${path}`)
    if (!existsSync(file)) continue
    const dir = path.includes('/') ? path.slice(0, path.indexOf('/')) : '.'
    const t = totals.get(dir) ?? { files: 0, mb: 0 }
    t.files++
    t.mb += statSync(file).size / 1e6
    totals.set(dir, t)
  }
  const lines = [...totals.entries()].sort((a, b) => b[1].mb - a[1].mb)
    .map(([d, t]) => `${d}: ${t.files} files, ${t.mb.toFixed(2)}MB`)
  console.log('  manifest art by directory\n    ' + lines.join('\n    '))
  assert.ok(totals.size > 0, 'the manifest names no art at all')
  void root
})
