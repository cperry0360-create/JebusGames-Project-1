import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))

const MAP = read('map')
const DISPLAY = read('display')
const P = read('presentation')
const art = read('art')

/**
 * The generated scatter is deleted, and this is what keeps it deleted.
 *
 * It dealt thirteen props at random positions on a plate that is already
 * painted full of rocks, boulders, pebbles, flowers and grass tufts, and it
 * had no idea what was underneath any of them. Five of the thirteen landed in
 * the painted tree line and one on the stone arch: a pale rock on the foliage
 * of a conifer, a grass tuft on a canopy above the tavern roof, another inside
 * the top-left wood, one over a trunk, one on the lower-right conifers, and one
 * floating over the arch keystone.
 *
 * That was not fixable by placement rules. The plate is ONE IMAGE at
 * GROUND_DEPTH, so every foliage pixel on the map is below every prop on it by
 * construction — a prop can only ever draw over a tree, never behind one. The
 * scatter's only guard against the tree line was `edgeInsetPx: 24`, and the
 * painted wood is far deeper than 24px in every corner.
 *
 * So it is gone rather than constrained. Generated clutter on top of
 * hand-painted clutter was buying nothing the plate did not already have, and
 * every prop over the tree line was a bug report waiting to be filed.
 */
test('there is no generated scatter, and no way for one to come back quietly', () => {
  assert.ok(!existsSync(url('../src/systems/Scatter.ts')), 'src/systems/Scatter.ts still exists')

  const g = src('scenes/GameScene.ts')
  assert.ok(!/createScatter|scatterCount/.test(g), 'GameScene still places scatter props')
  assert.ok(!/systems\/Scatter/.test(g), 'GameScene still imports the scatter')
  assert.ok(!/scatter/i.test(src('systems/Art.ts')), 'ART still re-exports a scatter section')

  assert.equal(P.scatter, undefined, 'presentation.json still carries a scatter block')
  assert.equal(art.scatter, undefined, 'art.json still carries a scatter section')
  assert.equal(MAP.scatterExclude, undefined,
    'map.json still carries the keep-out rects the scatter used')

  // The art goes with it. Fourteen prop sprites nothing draws are fourteen
  // files every player downloads for nothing, which is the same rule that took
  // 282 pack tiles and a 10.9MB plate out of the deploy. Matched without an
  // extension: the deploy is WebP now, and a resurrected prop would come back
  // in whichever container the re-export happened to use.
  const named = Object.keys(art.files as Record<string, string>)
  assert.deepEqual(named.filter((k) => k.startsWith('scatter-')), [],
    'the manifest still names scatter props')
  const shipped = readdirSync(url('../public/assets/props'))
    .map((f) => f.replace(/\.[^.]+$/, ''))
  for (const f of ['rock_small', 'rock_medium', 'rock_large', 'grass_tall',
    'pebbles', 'stump', 'branch_large', 'branch_small', 'mushrooms',
    'flowers_white', 'flowers_yellow', 'dirt_cracked', 'puddle',
    'tire_ruts']) {
    assert.ok(!shipped.includes(f), `public/assets/props/${f} still ships and nothing draws it`)
  }
})

test('exactly one build spot keeps the sign, and it is the one nearest the entrance', () => {
  const g = src('scenes/GameScene.ts')
  const fn = g.slice(g.indexOf('private createPads()'), g.indexOf('/** Shows the pads still free'))
  assert.match(fn, /const isSign = i === signIndex/, 'more than one spot can carry the sign')
  assert.match(fn, /this\.level\.map\.waypoints\[0\]/,
    'the sign is not placed relative to the entrance')

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
  // to a rock it WAS a rock. It stays clearly smaller than the one sign, which
  // is the loudest thing there.
  //
  // Its size is specified in SCREEN pixels, so the world figure the rest of
  // this compares against is derived the same way the scene derives it.
  //
  // IT USED TO BE MEASURED AGAINST THE SCATTER PROPS TOO — "bigger than the
  // widest prop by half again" — and that comparison died with them. It is not
  // re-aimed at the plate, for two reasons. CI cannot measure the plate: it is
  // a WebP and nothing here decodes one. And the answer would be no — measured
  // off the source PNG, the painted boulders on level one run 46 to 70 world px
  // wide, and the pad is 52, so it sits inside the range of the things it must
  // not be mistaken for rather than above it. The harness's board screenshot is
  // the only check left, and it is an open question rather than a property this
  // file can assert.
  const P2 = read('presentation') as any
  const padW = P2.buildPad.quietScreenWidth / DISPLAY.camera.defaultZoom
  const r = (art.render as Record<string, any>)[quietKey]
  assert.ok(r?.contentWidth && r?.contentHeight,
    `${quietKey} has no measured content extents, so fitContentWidth divides by the frame`)
  const padH = padW * (r.contentHeight / r.contentWidth)
  const ratio = padH / P2.buildPad.signHeight
  assert.ok(ratio > 0.45 && ratio < 0.8,
    `the pad is ${(ratio * 100).toFixed(0)}% of the sign; it should read as a slot, not as a second sign`)
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
