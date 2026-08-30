import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const art = read('art'), abilities = read('abilities'), heroes = read('heroes')
const towers = read('towers'), enemies = read('enemies'), map = read('map'), pres = read('presentation')

const ART_KEYS = new Set(Object.keys(art.files))

test('every sprite key referenced anywhere resolves to a real file', () => {
  const refs: Array<[string, string]> = []
  for (const [id, t] of Object.entries(towers) as [string, any][]) refs.push([`tower ${id}`, t.sprite], [`tower ${id} shot`, t.shot])
  for (const [id, e] of Object.entries(enemies) as [string, any][]) refs.push([`enemy ${id}`, e.sprite])
  for (const [id, a] of Object.entries(abilities) as [string, any][]) refs.push([`ability ${id}`, a.icon])
  for (const [id, h] of Object.entries(heroes) as [string, any][]) {
    refs.push([`hero ${id} body`, h.bodySprite], [`hero ${id} gun`, h.gunSprite],
      [`hero ${id} portrait`, h.portraitSprite], [`hero ${id} haymaker`, h.haymaker.icon],
      [`hero ${id} restructure`, h.restructure.icon])
  }
  refs.push([`map plate ${map.plate}`, art.map[map.plate]])
  for (const [where, key] of refs) {
    assert.ok(ART_KEYS.has(key), `${where} references unknown sprite key "${key}"`)
  }
})

test('the art manifest points at files that exist on disk', () => {
  for (const [key, path] of Object.entries(art.files) as [string, string][]) {
    assert.match(path, /^[\w-]+\/[\w.-]+\.png$/, `${key} -> ${path} is not an asset path`)
    assert.ok(existsSync(url(`../public/${art.assetRoot}${path}`)), `${key} -> ${path} is missing from public/assets`)
  }
})

test('the sprite keys the scenes ask for by role are all in the manifest', () => {
  // Effect and backdrop keys are named by scenes through Art.ts rather than by
  // data files, so nothing else checks that they resolve.
  const hardcoded = [
    'map-level1',
    'fx-spark', 'fx-flame', 'fx-flame-small',
    'decor-bush', 'decor-shrub', 'decor-plant', 'decor-rock', 'decor-rock2', 'decor-rock3',
  ]
  for (const k of hardcoded) assert.ok(ART_KEYS.has(k), `code uses sprite key "${k}" which art.json lacks`)
})

test('the fonts and sound cues are bundled', () => {
  for (const f of ['KenneyFuture.ttf', 'KenneyFutureNarrow.ttf', 'KenneyMiniSquare.ttf', 'License.txt']) {
    assert.ok(existsSync(url(`../public/assets/fonts/${f}`)), `missing font asset ${f}`)
  }
  for (const s of ['sfx-dadmode', 'sfx-build', 'sfx-leak', 'sfx-cast']) {
    assert.ok(existsSync(url(`../public/assets/audio/${s}.wav`)), `missing sound cue ${s}`)
  }
  assert.ok(existsSync(url('../public/assets/kenney/License.txt')), 'the art pack license must ship with the art')
})

test('all six actives exist and each does something distinct', () => {
  const ids = Object.keys(abilities)
  assert.deepEqual(new Set(ids), new Set([
    'explosion', 'twoFighters', 'freezeField', 'meteorBarrage', 'chainLightning', 'goldRain',
  ]))
  const a = abilities
  assert.ok(a.explosion.damage > 0 && a.explosion.radius > 0, 'Explosion needs damage in an area')
  assert.ok(a.twoFighters.summonCount === 2, 'Two Fighters summons two')
  assert.ok(a.twoFighters.duration > 0, 'summons need a lifetime')
  assert.ok(a.freezeField.slowFactor > 0 && a.freezeField.duration > 0, 'Freeze Field must slow, and linger')
  assert.ok(a.meteorBarrage.ticks > 1 && a.meteorBarrage.duration > 0, 'a barrage is repeated impacts over time')
  assert.ok(a.chainLightning.ticks > 1, 'chain lightning needs jumps')
  assert.ok(a.chainLightning.ignoresArmor, 'lightning should not care about armour')
  assert.ok(a.goldRain.gold > 0 && a.goldRain.targeting === 'instant', 'Gold Rain pays out immediately')
  for (const [id, def] of Object.entries(a) as [string, any][]) {
    assert.ok(def.cooldown > 0, `${id} has no cooldown`)
    assert.ok(['ground', 'instant'].includes(def.targeting), `${id} has bad targeting "${def.targeting}"`)
  }
})

test('ability cooldowns are spread, so they are not interchangeable', () => {
  const cds = Object.values(abilities).map((a: any) => a.cooldown)
  assert.ok(Math.max(...cds) >= Math.min(...cds) * 2, 'every ability has roughly the same cooldown')
})

test('Gold Rain pays less than it would cost to just hand over a tower board', () => {
  const cheapest = Math.min(...Object.values(towers).map((t: any) => t.cost))
  const dearest = Math.max(...Object.values(towers).map((t: any) => t.cost))
  assert.ok(abilities.goldRain.gold >= cheapest, 'Gold Rain should buy at least one tower')
  assert.ok(abilities.goldRain.gold <= dearest * 2, 'Gold Rain should not hand over the whole board')
})

test("Cory's kit matches the design doc", () => {
  const c = heroes.cory
  assert.equal(c.name, 'Cory')
  assert.equal(c.title, 'The Optimizer')
  assert.match(c.flavor, /[Nn]ot an auditor/, 'Cory works in tax, not audit, and the flavour should say so')
  assert.equal(c.passive.name, 'Depreciation')
  assert.equal(c.haymaker.name, 'Haymaker')
  assert.equal(c.restructure.name, 'Restructure')
  assert.equal(c.lastStand.name, 'DAD MODE')
})

test('Haymaker is a real burst with knockback, and Restructure is free', () => {
  const c = heroes.cory
  assert.ok(c.haymaker.damage > c.damage * 4, 'Haymaker should dwarf a normal swing')
  assert.ok(c.haymaker.knockbackPixels > 0, 'Haymaker needs knockback')
  assert.ok(c.haymaker.ignoresArmor, 'a haymaker should not be stopped by armour')
  assert.ok(c.haymaker.cooldown > 0 && c.restructure.cooldown > 0)
  assert.equal((c.restructure as any).cost, undefined, 'Restructure is free by design')
})

test('Depreciation strips armour but cannot go past the toughest enemy', () => {
  const p = heroes.cory.passive
  assert.ok(p.armorShredPerSecond > 0 && p.armorShredRadius > 0)
  const worst = Math.max(...Object.values(enemies).map((e: any) => e.armor))
  assert.ok(p.maxArmorShred >= worst, 'the passive should be able to fully strip the armoured enemy eventually')
  const seconds = worst / p.armorShredPerSecond
  assert.ok(seconds > 1, `armour vanishes in ${seconds.toFixed(1)}s, which makes the anti-armour tower pointless`)
})

test('presentation numbers are present and sane', () => {
  assert.ok(pres.shadow.alpha > 0 && pres.shadow.alpha < 1)
  assert.ok(pres.shadow.heightRatio > 0 && pres.shadow.heightRatio < 1,
    'a ground shadow should be an ellipse, wider than it is tall')
  assert.ok(pres.shadow.softLayers > 1, 'a single layer gives a hard edge, not a soft shadow')
  assert.ok(pres.shadow.defaultWidth > 0)
  assert.ok(pres.shadow.textureWidth > pres.shadow.textureHeight,
    'the shadow texture should be wider than it is tall')
  assert.ok(pres.enemyBob.amplitudeY > 0 && pres.enemyBob.durationMs > 0)
  assert.ok(pres.towerRecoilPixels > 0 && pres.towerRecoilMs > 0)
  assert.ok(pres.damageNumbers.critFontSize > pres.damageNumbers.fontSize)
  assert.ok(pres.shake.lastStandIntensity > pres.shake.leakIntensity,
    'Last Stand should shake harder than a leak')
})
