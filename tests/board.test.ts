import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { scatter, distanceToPath, scatterRng, type ScatterKind } from '../src/systems/Scatter.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))

const MAP = read('map')
const DISPLAY = read('display')
const P = read('presentation')
const cfg = P.scatter

const input = {
  worldWidth: DISPLAY.width,
  worldHeight: DISPLAY.height,
  waypoints: MAP.waypoints,
  buildSpots: MAP.buildSpots,
  exclude: MAP.scatterExclude,
  kinds: cfg.kinds as ScatterKind[],
  rules: cfg.rules,
  scaleJitter: cfg.scaleJitter,
  rotateDegrees: cfg.rotateDegrees,
}

test('the scatter is the same every run and every session', () => {
  // A layout that shifts between sessions is a map the player cannot learn.
  const a = scatter(input, cfg.seed)
  const b = scatter(input, cfg.seed)
  assert.deepEqual(a, b, 'the same seed produced two different layouts')
  const c = scatter(input, cfg.seed + 1)
  assert.notDeepEqual(a, c, 'the seed does not actually drive the layout')
})

test('nothing lands on the path, a build spot, an end, or the painted furniture', () => {
  const out = scatter(input, cfg.seed)
  assert.ok(out.length > 40, `only ${out.length} props placed; the map would look bare`)
  const r = cfg.rules
  const grassOnly = new Set(
    (cfg.kinds as ScatterKind[]).filter((k) => k.surface === 'grass').map((k) => k.key),
  )
  const dirtOnly = new Set(
    (cfg.kinds as ScatterKind[]).filter((k) => k.surface === 'dirt').map((k) => k.key),
  )

  for (const p of out) {
    const d = distanceToPath(p.x, p.y, MAP.waypoints)
    // Grass props carry grass in their bases; a tuft of it in the middle of
    // the lane is the whole reason the surface rule exists.
    if (grassOnly.has(p.key)) {
      assert.ok(d >= r.pathClearancePx, `${p.key} is ${d.toFixed(0)}px from the lane centre`)
    }
    if (dirtOnly.has(p.key)) {
      assert.ok(d <= r.dirtBandPx, `${p.key} is ${d.toFixed(0)}px from the lane; it belongs on dirt`)
    }
    for (const s of MAP.buildSpots) {
      assert.ok(Math.hypot(p.x - s[0], p.y - s[1]) >= r.buildSpotClearPx,
        `${p.key} sits on a build spot`)
    }
    for (const rect of MAP.scatterExclude) {
      const inside = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h
      assert.ok(!inside, `${p.key} was placed on painted furniture at ${rect.x},${rect.y}`)
    }
  }
})

test('no two props overlap', () => {
  const out = scatter(input, cfg.seed)
  const radius = new Map((cfg.kinds as ScatterKind[]).map((k) => [k.key, k.radius]))
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const need = (radius.get(out[i]!.key) ?? 0) + (radius.get(out[j]!.key) ?? 0) + cfg.rules.minGapPx
      const got = Math.hypot(out[i]!.x - out[j]!.x, out[i]!.y - out[j]!.y)
      assert.ok(got >= need, `${out[i]!.key} and ${out[j]!.key} are ${got.toFixed(0)}px apart, need ${need}`)
    }
  }
})

test('the rare props stay rare and the common ones stay common', () => {
  const out = scatter(input, cfg.seed)
  const counts = new Map<string, number>()
  for (const p of out) counts.set(p.key, (counts.get(p.key) ?? 0) + 1)
  for (const k of cfg.kinds as ScatterKind[]) {
    if (k.max === undefined) continue
    assert.ok((counts.get(k.key) ?? 0) <= k.max,
      `${k.key} is capped at ${k.max} and appeared ${counts.get(k.key)} times`)
  }
  // Grass and small rocks should be the bulk of it.
  const common = (counts.get('scatter-grass-tall') ?? 0) + (counts.get('scatter-rock-small') ?? 0)
  assert.ok(common > out.length * 0.25, 'the common props are not common')
})

test('variation never flips a prop or shrinks it away', () => {
  const out = scatter(input, cfg.seed)
  for (const p of out) {
    assert.ok(p.scale > 0, `${p.key} has a non-positive scale, which would flip or vanish it`)
    assert.ok(Math.abs(p.scale - 1) <= cfg.scaleJitter + 1e-9, `${p.key} scale ${p.scale} is out of range`)
    const deg = Math.abs(p.rotation) * 180 / Math.PI
    assert.ok(deg <= cfg.rotateDegrees + 1e-9, `${p.key} is rotated ${deg.toFixed(1)}deg`)
  }
})

test('the scatter is drawn beneath everything and takes no input', () => {
  const g = src('scenes/GameScene.ts')
  const fn = g.slice(g.indexOf('private createScatter()'), g.indexOf('private createAmbient()'))
  assert.match(fn, /setDepth\(GROUND_DEPTH \+ 1\)/, 'the scatter is not on the ground layer')
  assert.ok(!/setInteractive/.test(fn), 'a decoration prop takes pointer input')
  // Delivered at 2x, so it renders at half its native pixels.
  assert.match(fn, /cfg\.nativeScale \* p\.scale/, 'the props do not render at their delivered scale')
  assert.equal(cfg.nativeScale, 0.5, 'the props are delivered at 2x and must render at 50%')
})

test('exactly one build spot keeps the sign, and it is the one nearest the entrance', () => {
  const g = src('scenes/GameScene.ts')
  const fn = g.slice(g.indexOf('private createPads()'), g.indexOf('/** Shows the pads still free'))
  assert.match(fn, /const isSign = i === signIndex/, 'more than one spot can carry the sign')
  assert.match(fn, /MAP\.waypoints\[0\]/, 'the sign is not placed relative to the entrance')
  // Falls back to the sign for every spot while the quiet art is a hook only.
  assert.match(fn, /!hasQuiet/, 'a missing quiet marker leaves the board with no markers at all')
  assert.match(fn, /this\.textures\.exists\(quietKey\)/, 'the fallback does not check the texture loaded')
  // The art shrinks; the tap target does not. Taps are geometric, against
  // map.spotRadius, and never against the sprite.
  assert.ok(!/pads\[[^\]]*\]\.setInteractive/.test(g), 'a pad carries its own hit area')
  assert.ok(MAP.spotRadius >= 30, `a ${MAP.spotRadius}px tap target is too small for a thumb`)
})

test('the ambient overlay is data, decoration, and cleans up after itself', () => {
  const a = src('systems/Ambient.ts')
  assert.ok(!/setInteractive/.test(a), 'the tavern ambience takes pointer input')
  // Both SHUTDOWN and DESTROY, per the listener rules.
  assert.match(a, /onSceneEvent\(scene, scene\.events as never, 'shutdown', release\)/,
    'the emitter is not released on shutdown')
  assert.match(a, /onSceneEvent\(scene, scene\.events as never, 'destroy', release\)/,
    'the emitter is not released on destroy')
  assert.match(a, /for \(const em of emitters\) em\.stop\(\)/, 'the emitter is never stopped')

  // Coordinates are per-map data, not code.
  assert.ok(MAP.ambient.lights.length >= 5, 'the tavern has no lit windows recorded')
  assert.ok(MAP.ambient.chimneys.length >= 1, 'the tavern has no chimney recorded')
  for (const l of MAP.ambient.lights) {
    assert.ok(l.x > 0 && l.x < DISPLAY.width && l.y > 0 && l.y < DISPLAY.height,
      `a light at ${l.x},${l.y} is off the map`)
  }
  // Candlelight, not a strobe.
  assert.ok(P.ambient.minAlpha >= 0.7 && P.ambient.maxAlpha <= 1,
    'the flicker range is wider than candlelight')
  assert.ok(P.ambient.smoke.lifespanMs >= 2000, 'the smoke is too brisk to read as lazy')
})

test('the scatter rng is its own, so a different draft does not move the rocks', () => {
  const a = scatterRng(7)
  const b = scatterRng(7)
  assert.equal(a(), b())
  assert.notEqual(scatterRng(7)(), scatterRng(8)())
})
