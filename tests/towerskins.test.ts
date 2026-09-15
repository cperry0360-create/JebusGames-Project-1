import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { imageSize } from './imagesize.ts'
import {
  isSkinnedKey, SKIN_NAMES, SKINNABLE_KEYS, SKINNED_KEYS,
  skinArtForLevel, skinDef, skinForLevel, skinnedKeyIn, skinnedSprite,
} from '../src/systems/TowerSkins.ts'
import { isLevelArtKey, levelArtKeys } from '../src/systems/LevelArt.ts'
import { LEVELS } from '../src/systems/Levels.ts'

const url = (p: string) => new URL(p, import.meta.url)
const art = JSON.parse(readFileSync(url('../src/data/art.json'), 'utf8'))
const file = (key: string) => url(`../public/${art.assetRoot}${art.files[key]}`)

/**
 * THE SKIN IS A PAIRING, AND A HALF-LANDED PAIRING IS THE FAILURE MODE.
 *
 * 14 machine-world tower files arrived beside 14 originals, and there are two
 * ways to wire that up wrong, both silent. A skinned key with no original is a
 * texture nothing can fall back to, so a level wearing the skin draws a tower
 * that has no un-skinned twin and the fallback in `skinnedSprite` — the thing
 * that is supposed to save a board when art is missing — returns a key that is
 * not in the manifest either. An original with no skinned key is the other
 * half: the skin covers eleven towers out of twelve and the twelfth stands
 * there in stone on a machine board, which is not a crash and not a warning,
 * just a board that looks broken.
 *
 * So the question is asked in BOTH directions, over the whole `keys` table.
 */
test('every skinned key has its original, and every original its skinned key', () => {
  assert.ok(SKIN_NAMES.length > 0, 'the manifest defines no tower skin at all')
  for (const name of SKIN_NAMES) {
    const keys = skinDef(name)!.keys
    const faults: string[] = []
    for (const [original, skinned] of Object.entries(keys)) {
      if (!(original in art.files)) faults.push(`${name}: ${skinned} has no original ${original}`)
      if (!(skinned in art.files)) faults.push(`${name}: ${original} has no skinned key ${skinned}`)
    }
    // And the other direction over the manifest itself, so a skinned FILE that
    // was added to `files` and never entered in `keys` is caught too — that is
    // art in the deploy that nothing can ever draw.
    for (const key of Object.keys(art.files)) {
      if (!key.endsWith(`-${name}`)) continue
      const original = key.slice(0, -`-${name}`.length)
      if (!(original in art.files)) continue
      if (keys[original] !== key) faults.push(`${name}: ${key} is in files but not in keys`)
    }
    assert.deepEqual(faults, [], `the ${name} skin is only half wired up`)
  }
})

/**
 * And the files themselves, because `assets.test.ts` asks only whether a path
 * exists. A skin is a repaint of a specific frame, and the frame is the
 * contract: see the render test below for what depends on it.
 */
test('every skin pair ships, on the same canvas as its original', () => {
  const faults: string[] = []
  for (const name of SKIN_NAMES) {
    for (const [original, skinned] of Object.entries(skinDef(name)!.keys)) {
      if (!existsSync(file(original)) || !existsSync(file(skinned))) {
        faults.push(`${original} / ${skinned}: a file is missing`)
        continue
      }
      const o = imageSize(readFileSync(file(original)), art.files[original])
      const s = imageSize(readFileSync(file(skinned)), art.files[skinned])
      if (o[0] !== s[0] || o[1] !== s[1]) {
        faults.push(`${skinned} is ${s[0]}x${s[1]}, original ${original} is ${o[0]}x${o[1]}`)
      }
    }
  }
  assert.deepEqual(faults, [], 'a skin repaints a frame; it does not resize it')
})

/**
 * EVERY SKINNED KEY NEEDS ITS OWN `render` ENTRY, and this is the test that
 * would have caught the wrong version of this change.
 *
 * The brief for this work said art.json's `render` block was null for every
 * tower key and that towers were drawn from `files` alone. It is not: all 14
 * originals carry an anchor, a `displayHeight` and a `shadowWidth`. A skinned
 * key added to `files` and left out of `render` falls back to
 * `DEFAULT_RENDER` — `{anchorX: 0.5, anchorY: 0.5}` and no height — so
 * `applyRender` gives it no scale at all and centre-anchors it: a 371px tower
 * drawn at 371 world px, buried to its waist in its own pad. Nothing throws
 * and no test outside this one looks.
 *
 * `displayHeight` is asserted EQUAL to the original's, and that is only sound
 * because the test above pins the canvases together: `applyRender` divides by
 * `sprite.height`, the canvas and not the ink, so equal canvases mean an equal
 * number is an equal on-screen size. If the canvases ever diverge, that test
 * fails first and this one's reasoning is what it was protecting.
 */
test('a skinned key carries the anchor and height of the original it repaints', () => {
  const faults: string[] = []
  for (const name of SKIN_NAMES) {
    for (const [original, skinned] of Object.entries(skinDef(name)!.keys)) {
      const o = art.render[original]
      const s = art.render[skinned]
      if (!s) { faults.push(`${skinned} has no render entry; it would draw unscaled`); continue }
      for (const f of ['anchorX', 'anchorY', 'displayHeight', 'shadowWidth']) {
        if (o?.[f] !== s[f]) faults.push(`${skinned}.${f} is ${s[f]}, original is ${o?.[f]}`)
      }
      // The ink extents are the skinned file's OWN, per CLAUDE.md rule 7:
      // `fitInBox` divides by these, and the machine art's ink is not the
      // original's. Only their presence is checked here — the values are
      // measured by tools/measure_art.py, not restated.
      if (typeof s.contentWidth !== 'number' || typeof s.contentHeight !== 'number') {
        faults.push(`${skinned} has no contentWidth/contentHeight`)
      }
    }
  }
  assert.deepEqual(faults, [], 'a skinned key without its original render entry draws wrong')
})

/**
 * The remap itself, and the two keys whose filenames lie about them.
 *
 * `tower_filing.webp` is `turret-extension` and `tower_tax.webp` is
 * `turret-shelter`. Anybody wiring this up from the filenames pairs those two
 * the other way round, and the result is a Filing tower wearing the Tax
 * Shelter's machine and vice versa — on the board, with no error anywhere.
 * These two assertions are the whole reason this test names paths.
 */
test('the skin remaps each key to the repaint of its OWN file', () => {
  for (const name of SKIN_NAMES) {
    for (const [original, skinned] of Object.entries(skinDef(name)!.keys)) {
      assert.equal(skinnedKeyIn(name, original), skinned)
      // The skinned file is the original's path with the skin's suffix on it.
      // Not a naming rule the loader depends on — `files` is the only thing
      // that resolves a path — but it is the check that catches a crossed pair.
      const expected = art.files[original].replace(/\.webp$/, `_${name}.webp`)
      assert.equal(art.files[skinned], expected,
        `${skinned} should repaint ${art.files[original]}`)
    }
  }
})

test('turret-extension is the filing tower and turret-shelter is the tax tower', () => {
  // Spelled out rather than derived, because the derivation above is what a
  // session gets wrong. If these two ever read tower_tax / tower_filing, the
  // pair has been crossed.
  assert.match(art.files['turret-extension-machine'], /tower_filing_machine\.webp$/)
  assert.match(art.files['turret-shelter-machine'], /tower_tax_machine\.webp$/)
})

/**
 * LEVELS 1 THROUGH 8 KEEP THE ORIGINAL ART. This is the test that says so.
 *
 * The skin's `levels` list is the only switch, and it is empty: the machine art
 * is for levels 9 and 10 and levels.json registers level1 to level6, with 7 and
 * 8 built but unregistered. So every level that exists resolves to no skin and
 * every key it draws is the key it drew before this change.
 */
test('exactly one level wears the skin, and it is the one the art was drawn for', () => {
  // THIS TEST USED TO SAY "NO LEVEL", and the change is the whole point of the
  // mechanism rather than a relaxation. The fourteen machine files sat in the
  // repository with `towerSkins.machine.levels` deliberately empty from the day
  // they landed, because `levelArtKeys` resolves an unknown id to the DEFAULT
  // level -- so naming `level9` before level 9 had a row would have switched
  // the skin on for a board that never fetched the art, which is a missing
  // texture on level 1. Level 9 has a row now. The assertion flips from "none"
  // to "exactly this one", which is the same assertion doing the same job.
  // AND NOW IT IS TWO, which is the same flip a second time and for the same
  // reason. Level 10 is the other half of AI Override -- the same machine one
  // floor further in -- so it wears the same repaint, and it could not be named
  // in `levels` until it had a row in levels.json for exactly the reason level 9
  // could not. Both have one now. The art was drawn for these two boards and for
  // no others, which is what this assertion is really holding.
  const wearing = LEVELS.filter((l) => skinForLevel(l.id) !== null).map((l) => l.id)
  assert.deepEqual(wearing, ['level9', 'level10'], 'the set of levels wearing a skin changed')
  for (const level of LEVELS) {
    const skin = skinForLevel(level.id)
    if (skin !== null) {
      // The level that wears it LOADS it: fourteen keys, every one of them in
      // this level's manifest and nowhere near boot.
      assert.equal(skin, 'machine')
      const loaded = levelArtKeys(level.id).filter((k) => isSkinnedKey(k))
      assert.equal(loaded.length, skinArtForLevel(level.id).length)
      assert.ok(loaded.length > 0, `${level.id} wears a skin and loads none of it`)
      for (const key of SKINNABLE_KEYS) {
        assert.notEqual(skinnedSprite(key, level.id), key,
          `${key} is not repainted on ${level.id}, which is what wearing a skin means`)
      }
      continue
    }
    assert.deepEqual(skinArtForLevel(level.id), [], `${level.id} loads skin art`)
    const loaded = levelArtKeys(level.id).filter((k) => isSkinnedKey(k))
    assert.deepEqual(loaded, [], `${level.id} would load ${loaded.join(', ')}`)
    // And the keys it does draw come back unchanged, which is the other half of
    // "unaffected": not merely that no skin art loads, but that every call the
    // board makes for a tower texture returns what it always returned.
    for (const key of SKINNABLE_KEYS) {
      assert.equal(skinnedSprite(key, level.id), key,
        `${key} is repainted on ${level.id}`)
    }
  }
})

test('outside a run, and for an unknown level, the skin is the identity', () => {
  for (const key of SKINNABLE_KEYS) {
    assert.equal(skinnedSprite(key, null), key)
    assert.equal(skinnedSprite(key, undefined), key)
    assert.equal(skinnedSprite(key, ''), key)
    // LEVEL 11 IS THE UNREGISTERED ONE NOW, and the reasoning is unchanged:
    // `levelArtKeys` resolves an unknown id to the default level, so a skin
    // switched on for an id with no row would have the board drawing a texture
    // nothing fetched. Level 10 got its row, so it is NOT here any more -- it
    // is asserted the other way round in the test above, beside level 9.
    // THERE IS NO LEVEL 11 AND THERE IS NOT MEANT TO BE: levels.json's
    // `_plannedLevels` says ten is the scope and it is final. The id is used
    // here precisely because nothing will ever define it.
    assert.equal(skinnedSprite(key, 'level11'), key)
    assert.equal(skinnedSprite(key, 'level12'), key)
  }
})

/**
 * A skin nobody is wearing must cost nothing at boot.
 *
 * 14 more tower textures is the whole of this change's memory question. Boot
 * loads `REQUIRED_SPRITE_KEYS`, which is the manifest minus the optional keys
 * minus level art — so classifying the skin as level art is what makes the
 * answer zero, and this is the assertion that keeps it zero. Without it,
 * dropping the keys out of `LEVEL_ART_KEYS` would put all 14 on the title
 * screen and nothing would say so.
 */
test('skin art is level art, so boot loads none of it', () => {
  const notLevelArt = SKINNED_KEYS.filter((k) => !isLevelArtKey(k))
  assert.deepEqual(notLevelArt, [], 'a parked skin would be resident on every menu')
})

/**
 * One level, at most one skin. "Which one wins" is not a question worth having
 * an answer to, so it is made unaskable instead.
 */
test('no level is claimed by two skins', () => {
  const seen = new Map<string, string>()
  const clashes: string[] = []
  for (const name of SKIN_NAMES) {
    for (const id of skinDef(name)!.levels) {
      const prior = seen.get(id)
      if (prior) clashes.push(`${id} is claimed by both ${prior} and ${name}`)
      else seen.set(id, name)
    }
  }
  assert.deepEqual(clashes, [], 'a level may wear at most one skin')
})

test('no tower is drawn on a shared base, so a skin cannot put a keep on wheels', () => {
  /*
   * LIVE PLAY REPORTED THE STONE KEEP RENDERING ON WHEELS under the machine
   * skin, and the fix depends on which of two things the base is.
   *
   * IT IS NEITHER SHARED NOR CODE. `Tower`'s constructor adds exactly one
   * sprite -- `skinnedTexture(scene, def.sprite)` -- plus a shadow generated
   * from that same sprite and the tier pips. There is no base, plinth or
   * pedestal object, and its own comment says so: the manifest used to point
   * at a Kenney placeholder tile to stand in for one and the painted towers
   * made it redundant. And a skin is a whole-key substitution:
   * `turret-shelter` for `turret-shelter-machine`, with no base key in the
   * map to exempt anybody from.
   *
   * So the wheels, wherever they are, are painted into each tower's own
   * picture, and repainting one is an art job. `tools/harness/run.sh skins`
   * renders all eleven skinned tower pictures, plain above and machine below,
   * which is the frame that claim rests on.
   *
   * This asserts the thing that would change the answer: if a shared base
   * sprite ever arrives, the exemption branch becomes available and somebody
   * should come back here.
   */
  const tower = readFileSync(new URL('../src/entities/Tower.ts', import.meta.url), 'utf8')
  const ctor = tower.slice(tower.indexOf('  constructor('), tower.indexOf('  /**\n   * Whether a click'))
  assert.ok(ctor.length > 200, 'the Tower constructor was not found')
  // One sprite, and it is the tower's own skinned art.
  const sprites = ctor.match(/scene\.add\.sprite\(/g) ?? []
  assert.equal(sprites.length, 1,
    `the Tower constructor adds ${sprites.length} sprites; a second one would be a shared base`)
  assert.match(ctor, /skinnedTexture\(scene, def\.sprite\)/,
    'the tower no longer wears its own skinned art')
  // NO SECOND DRAWN OBJECT. A base would be an Image under the sprite; the only
  // other things in here are the generated shadow and the tier pips, neither of
  // which is added with `add.image`. Checked this way rather than by grepping
  // for the word "base", which matches `baseScale` and the comment that says
  // there is no base -- this test's own first red result.
  assert.doesNotMatch(ctor, /scene\.add\.image\(/,
    'an image is drawn in the Tower constructor; if it is a shared base, the '
    + 'exemption branch is available and this test\'s header is out of date')
  // And the skin map names no base.
  const skins = art.towerSkins as Record<string, { keys: Record<string, string> }>
  for (const [name, def] of Object.entries(skins)) {
    for (const k of Object.keys(def.keys)) {
      assert.doesNotMatch(k, /base|plinth|pedestal/i,
        `the ${name} skin maps ${k}, which is a shared base and changes the answer above`)
    }
  }
})
