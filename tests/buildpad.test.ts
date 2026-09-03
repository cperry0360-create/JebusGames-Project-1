import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const read = (name: string) => JSON.parse(src(`data/${name}.json`))

const art = read('art')
const presentation = read('presentation')

test('the pad art is in the manifest and on disk', () => {
  const key = art.prop.buildPad
  assert.ok(key, 'no build pad in the manifest')
  const path = art.files[key]
  assert.ok(path, `prop.buildPad points at unknown key "${key}"`)
  assert.ok(existsSync(url(`../public/${art.assetRoot}${path}`)), `${key} -> ${path} is missing`)
  const cfg = art.render[key]
  assert.ok(cfg, 'the pad has no render entry, so it would be drawn at its source size')
  // ANCHORED ON ITS DIRT, not on the bottom of its canvas.
  //
  // This asserted 1.0 and said bottom-centre was right because otherwise the
  // sign would sink and the dirt would float. It is the other way round: the
  // art is a dirt oval with a sign planted in the middle of it, so anchoring
  // the canvas bottom on the spot lifted the whole oval above the spot and the
  // node's highlight ring — which is drawn at the spot — circled the grass
  // underneath it. That was the one node out of seven that looked wrong.
  //
  // The oval's own centre is at 0.719 of the canvas, measured, and is recorded
  // as `groundY` so the two cannot drift apart.
  assert.equal(cfg.anchorX, 0.5, 'the pad is not centred horizontally')
  assert.equal(cfg.anchorY, cfg.groundY,
    `the pad anchors at ${cfg.anchorY} but its painted dirt is centred at ${cfg.groundY}`)
  assert.ok(cfg.displayHeight > 0, 'the pad has no on-screen size')
})

test('the pad is sized against the towers that stand on it', () => {
  const pad = art.render[art.prop.buildPad].displayHeight
  const towers = Object.entries(art.render as Record<string, { displayHeight?: number }>)
    .filter(([k]) => k.startsWith('turret-'))
    .map(([, v]) => v.displayHeight ?? 0)
  const tower = Math.max(...towers)
  assert.ok(pad < tower, `a ${pad}px pad is taller than a ${tower}px tower`)
  assert.ok(pad > tower * 0.5, `a ${pad}px pad is lost beside a ${tower}px tower`)
})

test('every buildable pad gets the art — there is no second kind of pad', () => {
  // The sign is wrong on all of them. That is the joke, and a pad that opted
  // out would give it away.
  const game = src('scenes/GameScene.ts')
  const create = /private createPads\([\s\S]*?\n  \}/.exec(game)
  assert.ok(create, 'createPads is gone')
  assert.match(create[0], /this\.build\.spots\.map\(/,
    'the pads are built from something other than every build spot')
  assert.doesNotMatch(create[0], /filter\(/, 'some spots are being excluded from the art')
  assert.match(create[0], /ART\.prop\.buildPad/, 'the pad art is not read from the manifest')
  assert.match(create[0], /applyRender\(img, key\)/,
    'the pad is not anchored and scaled from the manifest')
})

test('a pad never draws over what is standing on it', () => {
  const game = src('scenes/GameScene.ts')
  const create = /private createPads\([\s\S]*?\n  \}/.exec(game)![0]
  assert.match(create, /setDepth\(GROUND_DEPTH \+ \d+\)/,
    'the pad is not on the ground layer, so it can sort above a tower')
  // GROUND_DEPTH is negative and every entity sorts by its own y on a map
  // whose coordinates are all positive, so ground beats entity by construction.
  const sort = src('systems/DepthSort.ts')
  const g = /export const GROUND_DEPTH = (-?\d+)/.exec(sort)
  assert.ok(g && Number(g[1]) < 0, 'GROUND_DEPTH is no longer below every entity')
  assert.match(sort, /obj\.setDepth\(obj\.y \+ bias\)/, 'entities no longer sort by y')
  for (const f of ['entities/Tower.ts', 'entities/Enemy.ts', 'entities/Hero.ts']) {
    assert.match(src(f), /ySort\(/, `${f} does not sort by y, so a pad could cover it`)
  }
})

test('a pad disappears under the tower built on it', () => {
  const game = src('scenes/GameScene.ts')
  const draw = /private drawSpots\(\): void \{[\s\S]*?\n  \}/.exec(game)
  assert.ok(draw, 'drawSpots is gone')
  assert.match(draw[0], /const free = this\.build\.isFree\(spot\.index\)\s*\n\s*img\.setVisible\(free\)/,
    'an occupied pad is still drawn')
})

test('the pad pulses, and hover and press still read', () => {
  const game = src('scenes/GameScene.ts')
  const create = /private createPads\([\s\S]*?\n  \}/.exec(game)![0]
  assert.match(create, /yoyo: true/, 'the pulse does not run back and forth')
  assert.match(create, /repeat: -1/, 'the pulse stops after one cycle')
  assert.match(create, /delay: \(i \* cfg\.pulseMs\)/,
    'every pad pulses in unison, which reads as a warning light')
  // Scale is the pulse and tint is the state, so the two never fight over one
  // property.
  assert.match(create, /scale: \{ from: base, to: base \* cfg\.pulseScale \}/,
    'the pulse is not a scale pulse on the whole sprite')
  const draw = /private drawSpots\(\): void \{[\s\S]*?\n  \}/.exec(game)![0]
  assert.match(draw, /hoverTint/, 'the hover state is gone')
  assert.match(draw, /placingTint/, 'the press state is gone')
  assert.doesNotMatch(draw, /setScale/, 'the state writes the scale the pulse owns')

  const cfg = presentation.buildPad
  assert.ok(cfg, 'the pad has no presentation config')
  assert.ok(cfg.pulseScale > 1 && cfg.pulseScale <= 1.08,
    `a ${cfg.pulseScale}x pulse is not subtle`)
  assert.ok(cfg.pulseMs >= 900, 'the pulse is fast enough to read as a flash')
})

test('the game never acknowledges what the sign says', () => {
  // The sign is wrong on every pad and the game must never wink at it: no
  // hint, no tooltip, no joke in the credits, nothing.
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(url(`../src/${dir}`), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name
      if (e.isDirectory()) walk(rel)
      else files.push(rel)
    }
  }
  walk('')
  const banned = /do not build|don't build|dont build|ignore the sign|sign is wrong|despite the sign|anyway/i
  for (const f of files) {
    const body = src(f)
    // Only the strings a player can read, not the code or its comments.
    for (const m of body.matchAll(/'([^'\n]{6,})'|"([^"\n]{6,})"/g)) {
      const text = (m[1] ?? m[2]) as string
      if (f === 'data/art.json' && text.includes('pad_donotbuild')) continue
      assert.doesNotMatch(text, banned,
        `${f} says "${text}" — the game is not allowed to acknowledge the sign`)
    }
  }
})

test('nothing tells the player the pads glow any more', () => {
  // They are painted markers now. Copy that describes the old art is copy that
  // sends a player looking for something that is not there.
  for (const f of ['scenes/GameScene.ts', 'scenes/HudScene.ts', 'data/credits.json']) {
    assert.doesNotMatch(src(f), /glowing/i, `${f} still calls the pads glowing`)
  }
})
