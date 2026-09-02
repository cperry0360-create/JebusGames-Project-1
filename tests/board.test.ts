import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { scatter, distanceToPath, scatterRng, type ScatterKind } from '../src/systems/Scatter.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))

const MAP = read('map')
const DISPLAY = read('display')
const P = read('presentation')
const art = read('art')
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
  assert.ok(out.length >= 10, `only ${out.length} props placed; the map would look bare`)
  const r = cfg.rules
  const grassOnly = new Set(
    (cfg.kinds as ScatterKind[]).filter((k) => k.surface === 'grass').map((k) => k.key),
  )
  const radius = new Map((cfg.kinds as ScatterKind[]).map((k) => [k.key, k.radius]))

  for (const p of out) {
    const d = distanceToPath(p.x, p.y, MAP.waypoints)
    // Grass props carry grass in their bases; a tuft of it in the middle of
    // the lane is the whole reason the surface rule exists.
    if (grassOnly.has(p.key)) {
      assert.ok(d >= r.pathClearancePx, `${p.key} is ${d.toFixed(0)}px from the lane centre`)
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

test('the scatter reads as texture, not as objects', () => {
  // It was 179 props and looked like a field of obstacles competing with the
  // lane. A third of that, spaced much further apart, with a real buffer of
  // empty grass either side of the road.
  const out = scatter(input, cfg.seed)
  assert.ok(out.length >= 10 && out.length <= 14,
    `${out.length} props; the board is dressed back to 10-14, from 33, 56 and 179 before that`)

  const r = cfg.rules
  assert.ok(r.minGapPx >= 30, `a ${r.minGapPx}px minimum gap still lets props cluster`)
  // The buffer either side of the lane, measured from the road EDGE rather
  // than its centre — that is what the player sees as clear grass.
  const clear = r.pathClearancePx - MAP.roadWidth / 2
  assert.ok(clear >= 50,
    `only ${clear.toFixed(0)}px of clear grass beside the road; the props crowd the path`)

  // Density per unit area, so this stays meaningful if the map changes size.
  const perMillion = out.length / (DISPLAY.width * DISPLAY.height) * 1e6
  assert.ok(perMillion < 20, `${perMillion.toFixed(0)} props per million square units is a thicket`)
})

/**
 * Rocks and grass, and nothing else — for now.
 *
 * The board is being dressed back to see what it actually wants. The other ten
 * props are NOT deleted: they keep their art, their manifest entry, their
 * weight and their cap, and they are one `enabled` flag from returning. So
 * this test checks the dealt hand rather than the list, because the list is
 * deliberately still full.
 */
test('only rocks and grass tufts are dealt, and the rest are parked not deleted', () => {
  const ALLOWED = [
    'scatter-grass-small', 'scatter-grass-tall',
    'scatter-rock-large', 'scatter-rock-medium', 'scatter-rock-small',
  ]
  const out = scatter(input, cfg.seed)
  const dealt = [...new Set(out.map((p) => p.key))].sort()
  for (const k of dealt) {
    assert.ok(ALLOWED.includes(k), `${k} is on the board; only rocks and grass should be dealt`)
  }
  // Every kind that is switched off must still be here in full, so turning one
  // back on is a one-character edit rather than an archaeology exercise.
  const kinds = cfg.kinds as ScatterKind[]
  const parked = kinds.filter((k) => k.enabled === false)
  assert.ok(parked.length >= 10, `only ${parked.length} props are parked; some have been deleted`)
  for (const k of parked) {
    assert.ok(k.weight > 0 && k.radius > 0,
      `${k.key} was parked by gutting it rather than by switching it off`)
  }
  // And the manifest still names them, so the art still ships.
  const manifest = read('art').scatter as Record<string, string>
  const named = new Set(Object.values(manifest))
  for (const k of parked) {
    if (k.key === 'scatter-grass-small') continue // art not delivered yet
    assert.ok(named.has(k.key), `${k.key} was dropped from the art manifest`)
  }
})

/**
 * The one that matters, and the one that was missing.
 *
 * Fifteen of the previous fifty-six props sat on the walking lane — six small
 * branches, four large ones, five pebbles and two patches of cracked dirt —
 * and every test above passed the whole time. They passed because the surface
 * rule had a value, `'either'`, that satisfied every check including the
 * lane's, so the props that broke the rule were exactly the props exempt from
 * it. The union no longer contains a value meaning "anywhere".
 */
test('the walking lane is clean, and the two exceptions are beside it, not on it', () => {
  const out = scatter(input, cfg.seed)
  const r = cfg.rules
  const half = MAP.roadWidth / 2
  const radius = new Map((cfg.kinds as ScatterKind[]).map((k) => [k.key, k.radius]))
  const edgeKinds = new Set(
    (cfg.kinds as ScatterKind[]).filter((k) => k.surface === 'lane-edge').map((k) => k.key),
  )

  // Only the puddle and the tire ruts may go near the lane at all, and only
  // one of each. Pebbles and cracked dirt used to live ON it.
  assert.deepEqual([...edgeKinds].sort(), ['scatter-puddle', 'scatter-tire-ruts'])

  for (const p of out) {
    const d = distanceToPath(p.x, p.y, MAP.waypoints)
    // Not the anchor point — the BODY. A prop whose centre clears the road by
    // 2px still has half of itself lying across it.
    const near = d - (radius.get(p.key) ?? 0)
    assert.ok(near >= half,
      `${p.key} reaches to ${near.toFixed(0)}px of the lane centre; the road is ${half.toFixed(0)}px wide either side`)
    if (!edgeKinds.has(p.key)) {
      assert.ok(d >= r.pathClearancePx,
        `${p.key} is ${d.toFixed(0)}px from the lane centre and is not one of the two allowed at the edge`)
    }
  }

  // There is no way back to placing on the lane: nothing may claim a surface
  // that skips the test.
  const fn = src('systems/Scatter.ts')
  assert.ok(!/Surface = [^\n]*'either'/.test(fn),
    "the 'either' surface is back in the union; it exempts a prop from the lane rule")
  assert.ok(!/surface === 'either'/.test(fn), "something tests for the 'either' surface again")
  assert.ok(!(cfg.kinds as ScatterKind[]).some((k) => (k.surface as string) === 'either'),
    'a prop kind claims a surface that skips the lane test')
  assert.ok(/if \(d < r\.laneHalfPx\) continue/.test(fn),
    'the lane rejection is no longer the first surface test')
})

test('the four rare props are hard-capped, not merely unlikely', () => {
  // "At most one or two each on the whole map" is a cap, not a probability —
  // a weight can always roll high twice.
  const RARE: Record<string, number> = {
    'scatter-stump': 2, 'scatter-puddle': 1, 'scatter-tire-ruts': 1, 'scatter-mushrooms': 2,
  }
  for (const [key, cap] of Object.entries(RARE)) {
    const kind = (cfg.kinds as ScatterKind[]).find((k) => k.key === key)
    if (!kind) continue
    assert.equal(kind.max, cap, `${key} is not capped at ${cap} in the data`)
  }
  // And the cap holds across many layouts, not just the shipped seed.
  for (let seed = 1; seed <= 40; seed++) {
    const out = scatter(input, cfg.seed + seed)
    const counts = new Map<string, number>()
    for (const p of out) counts.set(p.key, (counts.get(p.key) ?? 0) + 1)
    for (const [key, cap] of Object.entries(RARE)) {
      assert.ok((counts.get(key) ?? 0) <= cap,
        `seed ${seed}: ${counts.get(key)} of ${key}, capped at ${cap}`)
    }
  }
})

test('the scatter is drawn beneath everything and takes no input', () => {
  const g = src('scenes/GameScene.ts')
  const fn = g.slice(g.indexOf('private createScatter()'), g.indexOf('private createPads()'))
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

  // THE COUNT. There are seven build spots and exactly one may carry the full
  // sign. This shipped with SEVEN of them: the quiet marker was a manifest
  // hook whose art never arrived, so every pad took the fallback and the board
  // shouted the same joke seven times.
  //
  // CI has no renderer, so the property is checked where it is decided: one
  // index is chosen, and `isSign` is true for that index alone. The count on
  // the real board is the harness's `signs` scenario.
  const signIndexPicks = fn.match(/signIndex = i\b/g) ?? []
  assert.equal(signIndexPicks.length, 1, 'the sign index is assigned from more than one place')
  assert.ok(!/isSign = true/.test(fn), 'something can force a spot to carry the sign')

  // THE ASSET THAT BLANKED THE GAME. It is painted art now, and REQUIRED —
  // an optional hook whose file never arrived is what put seven signs on the
  // board, and a procedurally drawn disc is what propped it up in the interim.
  const quietKey = art.prop.buildPadQuiet
  assert.ok(quietKey, 'there is no quiet marker key at all')
  assert.ok(art.files[quietKey], `${quietKey} is not in the manifest`)
  assert.ok(!(art.optional ?? []).includes(quietKey),
    'the pad art is on the optional list, where a missing file says nothing')
  assert.ok(existsSync(url(`../public/${art.assetRoot}${art.files[quietKey]}`)),
    `${quietKey} -> ${art.files[quietKey]} is not in the repo`)
  // Required means boot SAYS so and keeps going. The existence check stays
  // whatever the manifest claims, and what "keeps going" means is the sign.
  assert.match(fn, /this\.textures\.exists\(quietKey\)/,
    'the pad is drawn without checking its art loaded, which is a blank render')
  assert.match(fn, /const isSign = i === signIndex \|\| !hasQuiet/,
    'a missing pad texture no longer falls back to anything')
  // And the disc is gone, along with everything that drew it.
  const boot = src('scenes/BootScene.ts')
  assert.ok(!/ensureBuildPadTexture/.test(boot + src('systems/Presentation.ts')),
    'the procedural marker is still being generated')
  assert.ok(!/generated\.buildPad/.test(src('scenes/GameScene.ts')),
    'the pad still falls back to a texture nothing draws any more')
  assert.equal((art.generated as Record<string, string>).buildPad, undefined,
    'the manifest still names a generated pad texture')

  // The pad has to read as a buildable slot at a glance, which it did not
  // when it was a third of the sign: at 26px it was a brown smudge, and next
  // to a rock it WAS a rock. It is bigger than every scatter prop and still
  // clearly smaller than the one sign, which stays the loudest thing there.
  //
  // Its size is specified in SCREEN pixels, so the world figure the rest of
  // this compares against is derived the same way the scene derives it.
  const P2 = read('presentation') as any
  const padW = P2.buildPad.quietScreenWidth / DISPLAY.camera.defaultZoom
  const r = (art.render as Record<string, any>)[quietKey]
  assert.ok(r?.contentWidth && r?.contentHeight,
    `${quietKey} has no measured content extents, so fitContentWidth divides by the frame`)
  const padH = padW * (r.contentHeight / r.contentWidth)
  const ratio = padH / P2.buildPad.signHeight
  assert.ok(ratio > 0.45 && ratio < 0.8,
    `the pad is ${(ratio * 100).toFixed(0)}% of the sign; it should read as a slot, not as a second sign`)
  // Bigger than the biggest thing it could be mistaken for. Scatter radii are
  // half-extents, so the widest prop spans twice its radius, at native scale.
  const widestProp = Math.max(...(cfg.kinds as ScatterKind[]).map((k) => k.radius)) * 2
  assert.ok(padW > widestProp * 1.5,
    `the pad is ${padW.toFixed(0)}px across and the widest prop is ${widestProp}px; it will read as scenery`)
  // CLAUDE.md rule 7, on the one piece of art that was cut for it: the source
  // must hold up at the top of the zoom band on a 3x screen.
  const wanted = padH * DISPLAY.camera.maxZoom * 3
  assert.ok(r.contentHeight >= wanted * 0.9,
    `the pad is ${r.contentHeight}px of source for a ${padH.toFixed(0)}px render; `
    + `rule 7 wants ${wanted.toFixed(0)}`)
  // The art shrinks; the tap target does not. Taps are geometric, against
  // map.spotRadius, and never against the sprite.
  assert.ok(!/pads\[[^\]]*\]\.setInteractive/.test(g), 'a pad carries its own hit area')
  assert.ok(MAP.spotRadius >= 30, `a ${MAP.spotRadius}px tap target is too small for a thumb`)
})

test('the tavern is painted, not lit at runtime', () => {
  // Seven additive glows and a chimney emitter, placed against the OLD plate.
  // The new one paints lit windows, hanging lanterns and a smoking chimney
  // into the art, so the overlay was doing a job that is already done — and
  // doing it in the wrong places: two glows landed on the painted signboard
  // and one on the innkeeper. Deleted rather than re-placed.
  //
  // It also flickered, which made it the one animated thing on an otherwise
  // still map: the scrim probe's corner samples drifted 12% between two
  // frames because a light happened to be near a corner.
  const g = src('scenes/GameScene.ts')
  assert.ok(!/createAmbient|installAmbient/.test(g), 'the tavern ambience is back in GameScene')
  assert.equal(MAP.ambient, undefined, 'map.json still carries ambient coordinates')
  assert.equal(P.ambient, undefined, 'presentation.json still carries an ambient style')
  assert.ok(!existsSync(new URL('../src/systems/Ambient.ts', import.meta.url)),
    'src/systems/Ambient.ts still exists')
})

test('the scatter rng is its own, so a different draft does not move the rocks', () => {
  const a = scatterRng(7)
  const b = scatterRng(7)
  assert.equal(a(), b())
  assert.notEqual(scatterRng(7)(), scatterRng(8)())
})
