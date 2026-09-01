import { expectedValue, lossRate, rollOutcome, topPayout, totalWeight } from '../src/systems/Scratch.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { specPoints, specSummary } from '../src/systems/Upgrades.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const art = read('art'), abilities = read('abilities'), heroes = read('heroes'), rules = read('rules')
const towers = read('towers'), enemies = read('enemies'), map = read('map'), pres = read('presentation')
const display = read('display'), waves = read('waves')

const ART_KEYS = new Set(Object.keys(art.files))

test('every sprite key referenced anywhere resolves to a real file', () => {
  const refs: Array<[string, string]> = []
  for (const [id, t] of Object.entries(towers) as [string, any][]) {
    refs.push([`tower ${id}`, t.sprite])
    // A support tower never fires and names no projectile.
    if (t.shot) refs.push([`tower ${id} shot`, t.shot])
  }
  for (const [id, e] of Object.entries(enemies) as [string, any][]) refs.push([`enemy ${id}`, e.sprite])
  for (const [id, a] of Object.entries(abilities) as [string, any][]) refs.push([`ability ${id}`, a.icon])
  for (const [id, h] of Object.entries(heroes) as [string, any][]) {
    refs.push([`hero ${id} body`, h.bodySprite], [`hero ${id} ultimate`, h.ultimateSprite],
      [`hero ${id} portrait`, h.portraitSprite],
      [`hero ${id} haymaker`, h.haymaker.icon], [`hero ${id} restructure`, h.restructure.icon])
    h.fighterSprites.forEach((s: string, i: number) => refs.push([`hero ${id} gnome ${i}`, s]))
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
    'fx-explosion', 'fx-hit-spark', 'fx-death-puff', 'fx-muzzle',
    'decor-bush', 'decor-shrub', 'decor-plant', 'decor-rock', 'decor-rock2', 'decor-rock3',
  ]
  for (const k of hardcoded) assert.ok(ART_KEYS.has(k), `code uses sprite key "${k}" which art.json lacks`)
})

test('Cory is painted art in two forms, both standing on the ground', () => {
  const c = heroes.cory
  for (const [what, key] of [['on foot', c.bodySprite], ['in the SUV', c.ultimateSprite]] as [string, string][]) {
    assert.match(art.files[key], /^hero\//, `Cory ${what} is not using the painted hero art`)
    const cfg = art.render[key]
    assert.ok(cfg, `Cory ${what} has no render entry`)
    assert.equal(cfg.anchorY, 1, `Cory ${what} must stand on his own base`)
    assert.ok(cfg.shadowWidth > 0, `Cory ${what} casts no shadow`)
  }
})

test('the Last Stand form is sized by width, and is wider than the road', () => {
  // It is a vehicle, not a bigger man. Matching its height to his would make
  // it a toy; the point is that it does not fit in the lane.
  const c = heroes.cory
  const onFoot = art.render[c.bodySprite]
  const suv = art.render[c.ultimateSprite]
  // Measured on the STANCE, not on the canvas. contentWidth is the size of the
  // image file, and a re-export with different transparent margins moves it
  // without moving anything the player sees — which is exactly what happened
  // when Cory's source went from 199x208 to 386x470 and this read 2.56x for a
  // pair of sprites whose on-screen relationship had not changed at all.
  // shadowWidth is the measured width he actually stands on.
  const suvW = (suv.contentWidth / suv.contentHeight) * suv.displayHeight
  const multiple = suv.shadowWidth / onFoot.shadowWidth
  assert.ok(multiple > 2.5,
    `the SUV is only ${multiple.toFixed(2)}x his stance; it is supposed to be a vehicle`)
  assert.ok(suvW > map.roadWidth,
    `the SUV is ${suvW.toFixed(0)}px against a ${map.roadWidth}px road; it is supposed to not fit`)
})

test('DAD MODE grows every number it is supposed to grow', () => {
  const ls = heroes.cory.lastStand
  for (const k of ['attackRangeMultiplier', 'blockRangeMultiplier', 'moveSpeedMultiplier']) {
    assert.ok(ls[k] > 1, `${k} is ${ls[k]}; the vehicle form should be bigger in every sense`)
  }
  assert.ok(ls.damageMultiplier > 1 && ls.damageTakenMultiplier > 1,
    'DAD MODE should hit harder and take more')
  assert.ok(ls.rammingDamage > 0 && ls.rammingKnockbackPixels > 0,
    'driving through someone should hurt and shove them')
  assert.ok(ls.transformPauseMs >= 300 && ls.transformPauseMs <= 900,
    'the pause before he reappears is the beat; it must be short but real')
  assert.ok(ls.transformShakeMs > 0 && ls.transformFlashMs > 0, 'the swap needs a shake and a flash')
})

test('the three enemies are the painted art, standing on the ground', () => {
  for (const [id, e] of Object.entries(enemies) as [string, any][]) {
    assert.match(art.files[e.sprite], /^enemies\//, `${id} is not using the painted enemy art`)
    const cfg = art.render[e.sprite]
    assert.ok(cfg, `${id} has no render entry, so it would draw at its raw 512px size`)
    assert.ok(cfg.anchorY >= 0.95,
      `${id} anchors at ${cfg.anchorY}; a 3/4 character has to stand on its feet`)
    assert.ok(cfg.displayHeight > 0 && cfg.shadowWidth > 0, `${id} is missing a measured size`)
  }
})

test('the enemies keep the sizes they were drawn at, relative to each other', () => {
  // They arrived already scaled against each other with the brute the tallest.
  // Normalising them to a common height would throw that away, so every one
  // has to sit at the same scale factor from its own source art.
  //
  // The tolerance is relative, and it is not tight, because the cast has been
  // re-exported once already: 226 / 120 / 150 / 282 are what 512 / 273 / 339 /
  // 640 rounded to, and no two of them landed on exactly the same factor. That
  // costs about half a percent. A genuine normalisation costs the full height
  // ratio between the brute and the scout — a factor of nearly two — so this
  // still catches the mistake it was written for.
  const SPREAD = 0.015
  const scales = Object.values(enemies).map((e: any) => {
    const cfg = art.render[e.sprite]
    return cfg.displayHeight / cfg.contentHeight
  })
  for (const s of scales) {
    assert.ok(Math.abs(s / scales[0] - 1) < SPREAD,
      `enemies draw at different scales (${scales.map((v) => v.toFixed(4)).join(', ')}); ` +
      'that is a normalised height, not the artist\'s proportions')
  }
  const heights = Object.values(enemies).map((e: any) => art.render[e.sprite].displayHeight)
  assert.ok(Math.max(...heights) > Math.min(...heights) * 1.5,
    'the three should be visibly different sizes on screen')
})

test('an enemy is smaller than a tower but big enough to read', () => {
  const towerHeights = Object.values(towers).map((t: any) => art.render[t.sprite].displayHeight)
  const biggest = Math.max(...Object.values(enemies).map((e: any) => art.render[e.sprite].displayHeight))
  assert.ok(biggest < Math.min(...towerHeights), 'the brute towers over the buildings')
  assert.ok(biggest > 40, 'the biggest enemy is too small to make out')
})

test('health bars are sized from the sprite, not fixed', () => {
  const b = pres.healthBar
  assert.ok(b.widthFactor > 0 && b.widthFactor <= 1, 'a bar should not be wider than its sprite')
  assert.ok(b.minWidth > 0 && b.maxWidth > b.minWidth, 'bar clamp is inverted')
  assert.ok(b.heightPx > 0 && b.gapAbovePx > 0, 'the bar needs height, and air above the head')
  // The clamp must not flatten the three enemies back to one width, or scaling
  // to the sprite achieves nothing.
  const widths = Object.values(enemies).map((e: any) => {
    const cfg = art.render[e.sprite]
    const w = (cfg.contentWidth / cfg.contentHeight) * cfg.displayHeight * b.widthFactor
    return Math.min(Math.max(w, b.minWidth), b.maxWidth)
  })
  assert.equal(new Set(widths.map((w) => Math.round(w))).size, widths.length,
    'the clamp collapses two enemies to the same bar width')
})

test('every icon the UI shows can be sized from the manifest', () => {
  // The HUD, the build menu and the draft screen all draw icons from the same
  // manifest, mixing 64px pack tiles with 512px painted art. Anything painted
  // has to record its content box or the UI cannot fit it to a slot — that is
  // how a 616px tower ended up drawn at 444px across the middle of the map.
  const icons: Array<[string, string]> = []
  for (const [id, a] of Object.entries(abilities) as [string, any][]) icons.push([`ability ${id}`, a.icon])
  for (const [id, h] of Object.entries(heroes) as [string, any][]) {
    icons.push([`hero ${id} haymaker`, h.haymaker.icon], [`hero ${id} restructure`, h.restructure.icon])
  }
  for (const [id, t] of Object.entries(towers) as [string, any][]) icons.push([`tower ${id}`, t.sprite])

  for (const [where, key] of icons) {
    const path = art.files[key]
    assert.ok(path, `${where} references unknown sprite key "${key}"`)
    if (/^kenney\//.test(path)) continue
    const cfg = art.render[key]
    assert.ok(cfg && cfg.contentWidth > 0 && cfg.contentHeight > 0,
      `${where} uses painted art ("${key}") with no measured content box, so no slot can size it`)
  }
})

test('Server Nuke is a rare drop with real teeth and a real wind-up', () => {
  const cfg = rules.serverNuke
  assert.equal(abilities[cfg.abilityId].draftable, false, 'the rare drop must not be draftable')
  assert.ok(cfg.dropChance > 0 && cfg.dropChance <= 0.05,
    `a ${(cfg.dropChance * 100).toFixed(1)}% drop is not ultra-rare`)
  assert.ok(cfg.dropFromTiers.length > 0, 'nothing can drop it')
  assert.ok(!cfg.dropFromTiers.includes('basic'),
    'a trash mob dropping it stops it being a reward for a hard fight')
  assert.ok(cfg.bossHealthPercent > 0.3 && cfg.bossHealthPercent < 1,
    'a boss must survive it, but only just')
  assert.ok(cfg.castSeconds >= 1.5 && cfg.castSeconds <= 4,
    `a ${cfg.castSeconds}s wind-up is not something you watch`)
})

test('every enemy declares a tier, and at least one can drop the nuke', () => {
  const tiers = Object.values(enemies).map((e: any) => e.tier)
  for (const [id, e] of Object.entries(enemies) as [string, any][]) {
    assert.ok(e.tier, `${id} has no tier`)
    assert.ok(['basic', 'elite', 'boss'].includes(e.tier), `${id} has an unknown tier "${e.tier}"`)
  }
  assert.ok(tiers.some((t) => rules.serverNuke.dropFromTiers.includes(t)),
    'no enemy in the game can drop the rare ability, so it can never appear')
})

test('every ability icon is its own painted card', () => {
  for (const [id, a] of Object.entries(abilities) as [string, any][]) {
    assert.match(art.files[a.icon], /^abilities\//, `${id} is not using the painted ability art`)
    const cfg = art.render[a.icon]
    assert.ok(cfg?.contentWidth && cfg?.contentHeight, `${id}'s icon records no content box`)
  }
  // The cards carry their own frames, so every one has to be greyable for the
  // unavailable state — a plate cannot be dimmed behind them.
  for (const a of Object.values(abilities) as any[]) {
    assert.ok(art.greyable.includes(a.icon), `${a.icon} has no greyscale copy for the unavailable state`)
  }
})

test('the three counter plates carry a measured number field', () => {
  // The HUD draws each number inside its plate's empty area, so where that
  // area is has to come from the manifest rather than from a constant.
  const counters = art.ui.counters
  assert.deepEqual(Object.keys(counters).sort(), ['lives', 'peanuts', 'wave'])
  for (const [name, key] of Object.entries(counters) as [string, string][]) {
    const cfg = art.render[key]
    assert.ok(cfg, `the ${name} plate has no render entry`)
    assert.ok(cfg.fieldLeft > 0.1 && cfg.fieldLeft < 0.6,
      `the ${name} plate's number field starts at ${cfg.fieldLeft}; that is not beside its icon`)
    assert.ok(cfg.fieldRight > cfg.fieldLeft, `the ${name} plate's field is inverted`)
    assert.ok(Math.abs(cfg.fieldCentreY - 0.5) < 0.1,
      `the ${name} plate's field is not vertically centred`)
    assert.match(art.files[key], /^ui\/hud_/, `the ${name} plate is not the painted art`)
  }
})

test('the HUD leaves the map uncropped and its corners uncontested', () => {
  const hud = pres.hud
  const plates = Object.values(art.ui.counters as Record<string, string>)
    .map((k) => (art.render[k].contentWidth / art.render[k].contentHeight) * hud.plateHeight)
  const rowWidth = plates.reduce((a, b) => a + b, 0) + hud.plateGap * (plates.length - 1)
  // The counters own the left of the strip and the start button the right;
  // they must not be able to meet in the middle.
  const buttonLeft = display.width - 196 - hud.marginX
  assert.ok(hud.marginX + rowWidth < buttonLeft,
    `the counter row reaches ${(hud.marginX + rowWidth).toFixed(0)}px and the button starts at ${buttonLeft}px`)
  assert.ok(hud.marginY + hud.plateHeight <= display.hudHeight,
    'the counters stick out below the strip the world keeps clear of')
})

test('nothing in the shipped data calls the currency gold', () => {
  // The currency is peanuts. A stray "gold" in a flavour line or a field name
  // is the kind of thing that survives a rename and then ships.
  for (const name of ['rules', 'towers', 'enemies', 'heroes', 'abilities', 'waves', 'draft', 'credits']) {
    const raw = readFileSync(url(`../src/data/${name}.json`), 'utf8')
    assert.ok(!/gold/i.test(raw), `src/data/${name}.json still says gold`)
  }
})

test('the fonts and sound cues are bundled', () => {
  for (const f of ['KenneyFuture.ttf', 'License.txt']) {
    assert.ok(existsSync(url(`../public/assets/fonts/${f}`)), `missing font asset ${f}`)
  }
  for (const s of ['sfx-dadmode', 'sfx-build', 'sfx-leak', 'sfx-cast']) {
    assert.ok(existsSync(url(`../public/assets/audio/${s}.wav`)), `missing sound cue ${s}`)
  }
  assert.ok(existsSync(url('../public/assets/kenney/License.txt')), 'the art pack license must ship with the art')
})

test('six draftable actives plus the rare drop, each doing something distinct', () => {
  const draftable = Object.entries(abilities).filter(([, a]: [string, any]) => a.draftable).map(([id]) => id)
  assert.deepEqual(new Set(draftable), new Set([
    'molotov', 'gnomes', 'glacier', 'meteor', 'chain', 'scratchTicket',
  ]))
  const rare = Object.entries(abilities).filter(([, a]: [string, any]) => !a.draftable).map(([id]) => id)
  assert.deepEqual(rare, ['serverNuke'], 'Server Nuke is the only ability outside the draft pool')
  const a = abilities
  assert.ok(a.molotov.damage > 0 && a.molotov.radius > 0, 'Molotov needs damage in an area')
  assert.ok(a.gnomes.summonCount === 2, 'Gnomes summons two')
  assert.ok(a.gnomes.duration > 0, 'summons need a lifetime')
  assert.ok(a.glacier.slowFactor > 0 && a.glacier.duration > 0, 'Glacier must slow, and linger')
  assert.ok(a.meteor.ticks > 1 && a.meteor.duration > 0, 'a barrage is repeated impacts over time')
  assert.ok(a.chain.ticks > 1, 'chain lightning needs jumps')
  assert.ok(a.chain.ignoresArmor, 'lightning should not care about armour')
  assert.ok((a.scratchTicket.outcomes?.length ?? 0) >= 3,
    'a Scratch Ticket with a fixed payout is not a scratch ticket')
  assert.equal(a.scratchTicket.targeting, 'instant', 'the ticket is not aimed anywhere')
  for (const [id, def] of Object.entries(a) as [string, any][]) {
    if (!def.draftable) continue
    assert.ok(def.cooldown > 0, `${id} has no cooldown`)
    assert.ok(['ground', 'instant'].includes(def.targeting), `${id} has bad targeting "${def.targeting}"`)
  }
})

test('ability cooldowns are spread, so they are not interchangeable', () => {
  const cds = Object.values(abilities).filter((a: any) => a.draftable).map((a: any) => a.cooldown)
  assert.ok(Math.max(...cds) >= Math.min(...cds) * 2, 'every ability has roughly the same cooldown')
})

test('a Scratch Ticket is a gamble rather than an income stream', () => {
  // It was `Between(60, 320)`: a uniform roll that could not lose, mean 190
  // against a mean wave income of 322. At a 34s cooldown that is most of a
  // run's earnings, free, with no decision attached.
  const t = abilities.scratchTicket
  const outs = t.outcomes as Array<{ label: string; payout: number; weight: number }>
  const cheapest = Math.min(...Object.values(towers).map((tw: any) => tw.cost))
  const ev = expectedValue(outs)

  // What one wave pays, which is the yardstick the tuning is set against.
  const perWave = Object.values((waves as any).waves).map((w: any) =>
    w.spawns.reduce((n: number, sp: any) => n + sp.count * (enemies as any)[sp.enemy].peanutReward, 0)
    + (rules as any).peanutsPerWaveCleared)
  const meanWave = perWave.reduce((a: number, b: number) => a + b, 0) / perWave.length

  assert.ok(lossRate(outs) >= 0.25,
    `only ${(lossRate(outs) * 100).toFixed(0)}% of tickets lose; a ticket that always pays is not a gamble`)
  assert.ok(lossRate(outs) <= 0.6,
    `${(lossRate(outs) * 100).toFixed(0)}% of tickets lose; that is a punishment, not a gamble`)
  assert.ok(outs.some((o) => o.payout <= 0 && o.label.trim().length > 0),
    'a losing ticket must say something, or an uncovered blank card is just confusing')

  assert.ok(ev > 0, 'the expected value should be positive; nobody drafts a losing bet')
  assert.ok(ev < meanWave * 0.2,
    `expected value ${ev.toFixed(0)} is ${(ev / meanWave * 100).toFixed(0)}% of a wave's income; ` +
    'that is an economy rather than a flutter')

  const top = topPayout(outs)
  assert.ok(top >= cheapest, 'no ticket ever buying a tower removes the point')
  assert.ok(top <= meanWave, `the top prize ${top} exceeds a whole wave's income (${meanWave.toFixed(0)})`)

  // The big one has to be rare, or it is not the big one.
  const jackpot = outs.filter((o) => o.payout === top)
  const jackpotChance = jackpot.reduce((n, o) => n + o.weight, 0) / totalWeight(outs)
  assert.ok(jackpotChance <= 0.03,
    `the top prize comes up ${(jackpotChance * 100).toFixed(0)}% of the time`)

  // And a typical result is small. The median matters more than the mean here:
  // the mean can be dragged up by a jackpot nobody sees.
  const sorted = [...outs].sort((a, b) => a.payout - b.payout)
  let seen = 0
  let median = 0
  for (const o of sorted) {
    seen += o.weight
    if (seen >= totalWeight(outs) / 2) { median = o.payout; break }
  }
  assert.ok(median < meanWave * 0.15,
    `the median ticket pays ${median}, which is not "noticeably less than a wave's income"`)

  assert.ok(t.autoRevealSeconds > 0 && t.autoRevealSeconds <= 6,
    'the ticket must reveal itself, and fast enough not to stall the wave')
})

test('the payout table is drawn from, in proportion', () => {
  // The table is only worth tuning if the draw honours it.
  const outs = abilities.scratchTicket.outcomes as Array<{ payout: number; weight: number }>
  const counts = new Map<number, number>()
  const N = 200_000
  for (let i = 0; i < N; i++) {
    const o = rollOutcome(outs as any, (i + 0.5) / N)
    counts.set(o.payout, (counts.get(o.payout) ?? 0) + 1)
  }
  for (const o of outs) {
    const want = o.weight / totalWeight(outs as any)
    // Outcomes can share a payout, so compare against the combined weight.
    const share = (counts.get(o.payout) ?? 0) / N
    const combined = outs.filter((x) => x.payout === o.payout)
      .reduce((n, x) => n + x.weight, 0) / totalWeight(outs as any)
    assert.ok(Math.abs(share - combined) < 0.01,
      `payout ${o.payout} came up ${(share * 100).toFixed(1)}% against a weight of ${(combined * 100).toFixed(1)}%`)
    void want
  }
  // A sweep of the whole [0,1) range must produce the mean the table states.
  let sum = 0
  for (let i = 0; i < N; i++) sum += rollOutcome(outs as any, (i + 0.5) / N).payout
  assert.ok(Math.abs(sum / N - expectedValue(outs as any)) < 0.5,
    'the sampled mean does not match the table\'s expected value')
})

test("Cory's kit matches the design doc", () => {
  const c = heroes.cory
  assert.equal(c.name, 'Cory')
  assert.equal(c.title, 'The Optimizer')
  assert.equal((c as any).flavor, undefined, 'the hero card is one short line now, not two')
  assert.ok(c.blurb.length <= 90, `the hero blurb is ${c.blurb.length} characters; it should be one short line`)
  // Cory works in tax, not audit. The line that used to say so was flavour on
  // the hero card and has been cut, so the fact now has to hold where it still
  // appears — the credits — and nothing anywhere may call him an auditor.
  const credits = read('credits')
  const allCredits = JSON.stringify(credits)
  assert.match(allCredits, /works in tax/, 'nothing in the game says Cory works in tax any more')
  for (const [name, blob] of [['heroes', heroes], ['credits', credits]] as const) {
    assert.doesNotMatch(JSON.stringify(blob).replace(/[Nn]ot an auditor/g, ''), /auditor/i,
      `${name} calls Cory an auditor`)
  }
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

test("the hero's own actives use ability art, not a tower or a placeholder", () => {
  // Haymaker drew the Write-Off tower and Restructure drew a leftover Kenney
  // pad tile, sitting beside two real ability cards in the same HUD row.
  const heroes = JSON.parse(readFileSync(new URL('../src/data/heroes.json', import.meta.url), 'utf8'))
  const art = JSON.parse(readFileSync(new URL('../src/data/art.json', import.meta.url), 'utf8'))
  for (const hero of Object.values(heroes) as any[]) {
    for (const slot of ['haymaker', 'restructure'] as const) {
      const key = hero[slot].icon
      const path = art.files[key]
      assert.ok(path, `${hero.name}'s ${slot} points at unknown art key "${key}"`)
      assert.match(path, /^abilities\//,
        `${hero.name}'s ${slot} draws ${path}, which is not an ability icon`)
    }
  }
})

test('the retired tower-base placeholder is gone from the manifest', () => {
  // Kenney's projectiles, effects, decor and the summoned fighter are all
  // still in use and legitimate. This is about one specific leftover: the pad
  // tile that ui.towerBase pointed at before the towers gained their own
  // bases. It outlived its role and was still being loaded at boot.
  const art = JSON.parse(readFileSync(new URL('../src/data/art.json', import.meta.url), 'utf8'))
  assert.equal(art.files['tower-base'], undefined, 'tower-base is still loaded')
  assert.ok(!('towerBase' in art.ui),
    'ui.towerBase is still in the manifest; a permanently null field is a branch nobody can take')

  // The branches that read it have to go too, or the next person wires a new
  // placeholder into a hole that was supposed to be closed.
  for (const f of ['entities/Tower.ts', 'ui/TowerIcon.ts', 'types.ts']) {
    assert.doesNotMatch(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'),
      /towerBase/, `${f} still reads ui.towerBase`)
  }

  // And the file itself. Kenney's projectiles, effects and decor stay — they
  // are used and credited — but this one tile is not art, it is a leftover.
  assert.equal(existsSync(new URL('../public/assets/kenney/towerDefense_tile181.png', import.meta.url)),
    false, 'the placeholder tile is still on disk')
})

/* ------------------------------------------------- every tower does something */

test('every tower either shoots or supports, and none is inert', () => {
  for (const [id, t] of Object.entries(towers) as [string, any][]) {
    const shoots = t.damage > 0 && t.range > 0 && t.fireInterval > 0
    const supports = t.supportRadius > 0 && t.supportDamageBonus > 0
    assert.ok(shoots || supports,
      `${id} neither shoots (dmg ${t.damage}, range ${t.range}) nor supports ` +
      `(radius ${t.supportRadius}, bonus ${t.supportDamageBonus}) — it is 100% inert`)
    assert.ok(!(shoots && supports), `${id} is both a turret and a support tower; pick one`)
  }
})

test('a support tower can actually reach another build pad', () => {
  // This is the one that was violated. Shelter had a 104px support radius on a
  // map whose two closest build pads are 141px apart, so it could never buff
  // anything: 140 peanuts for a tower that did nothing at all, on any pad, in
  // any run. A support radius is meaningless except against the map it is
  // played on, so it has to be checked against the map.
  const spots = read('map').buildSpots as [number, number][]
  const gaps: number[] = []
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      gaps.push(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]))
    }
  }
  const closest = Math.min(...gaps)

  for (const [id, t] of Object.entries(towers) as [string, any][]) {
    if (!(t.supportRadius > 0)) continue
    assert.ok(t.supportRadius >= closest,
      `${id} has a ${t.supportRadius}px support radius but the closest two build pads are ` +
      `${closest.toFixed(0)}px apart, so it can never reach a single tower`)
    // And its weaker specialization must still reach, or picking it is a trap.
    for (const spec of t.specializations ?? []) {
      const mult = spec.supportRadius ?? 1
      assert.ok(t.supportRadius * mult >= closest,
        `${id}/${spec.id} shrinks the support radius to ${(t.supportRadius * mult).toFixed(0)}px, ` +
        `below the ${closest.toFixed(0)}px gap between the closest pads`)
    }
  }
})

/* ------------------------------------------- tier 3 is a choice, not a number */

test('every specialization changes behaviour, not just a percentage', () => {
  // A tier-3 pick that only scaled numbers was not a decision: both options
  // were "more damage" and one of them was simply larger. Each one now does
  // something the other cannot.
  const BEHAVIOURS = [
    'ignoresArmor', 'chainTargets', 'executeBelowPercent', 'rampPerShot',
    'splashSlowSeconds', 'bonusVsArmored', 'stunSeconds',
    'supportRangeBonus', 'grantsPierce',
  ]
  for (const [id, t] of Object.entries(towers) as [string, any][]) {
    for (const spec of t.specializations ?? []) {
      const has = BEHAVIOURS.filter((k) => spec[k])
      assert.ok(has.length > 0,
        `${id}/${spec.id} only multiplies stats; it needs something the other option cannot do`)
    }
  }
})

test('the two specializations of a tower do different things', () => {
  const BEHAVIOURS = [
    'ignoresArmor', 'chainTargets', 'executeBelowPercent', 'rampPerShot',
    'splashSlowSeconds', 'bonusVsArmored', 'stunSeconds',
    'supportRangeBonus', 'grantsPierce',
  ]
  for (const [id, t] of Object.entries(towers) as [string, any][]) {
    const specs = t.specializations ?? []
    if (specs.length < 2) continue
    const sets = specs.map((s: any) => BEHAVIOURS.filter((k) => s[k]).join('+'))
    assert.notEqual(sets[0], sets[1],
      `${id}: both specializations do "${sets[0]}", so the branch has only one real option`)
  }
})

test('a specialization explains itself in mechanics, not in jokes', () => {
  for (const [id, t] of Object.entries(towers) as [string, any][]) {
    for (const spec of t.specializations ?? []) {
      assert.equal(spec.flavor, undefined, `${id}/${spec.id} still carries flavour text`)
      const line = specSummary(spec)
      assert.notEqual(line, 'No change', `${id}/${spec.id} summarises to nothing at all`)
      // It has to name a real effect, not just read as prose.
      assert.match(line, /%|armour|enemy|enemies|health|slows|stops|pierce/,
        `${id}/${spec.id} summarises as "${line}", which tells the player nothing`)
    }
  }
})

test('the tier-3 fork is two cards, not two rows sharing a line', () => {
  // The bug: both specializations were label/value rows, so a stat string long
  // enough to reach back across its own label ran straight through the other
  // option's name. Deferral's stats sat on top of Amendment's.
  const scene = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  const fork = scene.slice(scene.indexOf('openSpecChoice(tower: Tower)'),
    scene.indexOf('specialize(tower: Tower, specId'))
  assert.ok(fork.includes('choices:'), 'the fork is not built from choice cards')
  assert.ok(!/rows:/.test(fork), 'the fork still renders its options as shared rows')
  // Each card has to carry its own price and its own build time: a single
  // shared cost row is what let the two options be told apart by nothing.
  assert.ok(/cost:/.test(fork) && /takes:/.test(fork), 'the cards do not price themselves')
})

test('a specialization lists its effects one per line', () => {
  // The card sets each point on its own line. One joined string is what had to
  // be wrapped, and wrapping is what overlapped.
  for (const [id, t] of Object.entries(towers) as [string, any][]) {
    for (const spec of t.specializations ?? []) {
      const points = specPoints(spec)
      assert.ok(points.length >= 1, `${id}/${spec.id} lists nothing`)
      for (const p of points) {
        assert.ok(!p.includes('\u00b7'), `${id}/${spec.id} still joins points into one line`)
        // A line this long wraps to three rows in a card column and starts
        // pushing the button off the panel.
        assert.ok(p.length <= 52, `${id}/${spec.id}: "${p}" is ${p.length} characters`)
      }
    }
  }
})

test('the game counts enemies in English', () => {
  const chained = Object.values(towers as Record<string, any>)
    .flatMap((t) => t.specializations ?? [])
    .filter((s: any) => s.chainTargets)
  assert.ok(chained.length > 0, 'no chaining specialization to check')
  for (const spec of chained) {
    const line = specSummary(spec)
    assert.ok(!line.includes('enemyies'), `"${line}"`)
    assert.match(line, spec.chainTargets > 1 ? /more enemies/ : /more enemy/)
  }
})

test('tier is visible on the board without opening a panel', () => {
  // All three tiers share one sprite, so an upgraded tower looked exactly like
  // one still at tier 1. Until per-tier art exists the pips carry it.
  const t = read('presentation').towerTier
  assert.ok(t, 'no tier indicator configured at all')
  assert.ok(t.pipRadius >= 6, `${t.pipRadius}px pips are too small to read over the art`)
  assert.ok(t.pipGap > t.pipRadius * 2, 'the pips would overlap each other')
  assert.ok(t.scalePerTier > 0 && t.tintPerTier > 0,
    'an upgraded tower should also read as bigger and brighter, not only by counting pips')
  const tower = readFileSync(url('../src/entities/Tower.ts'), 'utf8')
  assert.match(tower, /private drawTier\(\)/, 'nothing draws the tier')
  // Redrawn when a tier actually lands, or the pips describe the old tower.
  const build = tower.slice(tower.indexOf('private tickBuild'))
  assert.match(build.slice(0, build.indexOf('\n  ', 40) + 400), /drawTier\(\)/,
    'finishing a tier never redraws the indicator')

  // On the base, not floating above the tower's head. A row hung a full
  // sprite-height above the origin sat out over the map belonging to nothing,
  // and was close enough to the next tower's row to run into it.
  assert.ok(typeof t.pipDropBelowBase === 'number' && t.pipDropBelowBase > 0,
    'the pips are not anchored below the tower base')
  assert.equal(t.pipRiseAboveTop, undefined,
    'the pips still float above the tower art')
  const draw = /private drawTier\(\)[\s\S]*?\n  \}/.exec(tower)![0]
  assert.doesNotMatch(draw, /turret\.displayHeight/,
    'the pip row is still positioned from the height of the art')
  // And the row has to fit inside a tower's own footprint, or two towers side
  // by side collide.
  const span = (3 - 1) * t.pipGap + t.pipRadius * 2
  const shadow = read('presentation').shadow.defaultWidth
  assert.ok(span <= shadow * 2.6,
    `a ${span}px pip row is wider than the tower it belongs to`)
})

/* --------------------------------------- hero abilities have their own art */

test('the hero abilities point at their own icons, not at borrowed ones', () => {
  // AUDIT #2: Haymaker pointed at a tower sprite and Restructure at a Kenney
  // placeholder tile. Both then spent a while pointing at other abilities'
  // icons as stand-ins, which is better but still borrowed.
  const art = JSON.parse(readFileSync(new URL('../src/data/art.json', import.meta.url), 'utf8'))
  const c = heroes.cory
  for (const [slot, key] of [['haymaker', c.haymaker.icon], ['restructure', c.restructure.icon]] as const) {
    assert.equal(key, `ability-${slot}`, `${slot} does not use its own icon`)
    assert.ok(art.files[key], `${key} is not in the manifest`)
    assert.match(art.files[key], new RegExp(`ability_${slot}\\.png$`), `${key} points at the wrong file`)
    assert.ok(art.render[key], `${key} has no render entry, so it cannot be fitted`)
    assert.equal(existsSync(new URL(`../public/${art.files[key]}`.replace('/assets/', '/assets/'), import.meta.url))
      || existsSync(new URL(`../public/assets/${art.files[key]}`, import.meta.url)), true,
      `${art.files[key]} is not on disk`)
  }
  // And nothing borrows a drafted ability's icon any more.
  for (const key of [c.haymaker.icon, c.restructure.icon]) {
    assert.doesNotMatch(key, /meteor|gnomes|molotov|glacier|chain|scratch/, `${key} is still a borrowed icon`)
  }
})

test('the hero medallions are round and the drafted plates are not', () => {
  // The shapes carry the meaning: round is a hero ability, rectangular is one
  // this run dealt. The manifest has to reflect that, or the bar cannot.
  const art = JSON.parse(readFileSync(new URL('../src/data/art.json', import.meta.url), 'utf8'))
  const ratio = (k: string): number => art.render[k].contentWidth / art.render[k].contentHeight
  for (const k of ['ability-haymaker', 'ability-restructure']) {
    assert.ok(Math.abs(ratio(k) - 1) < 0.15, `${k} is ${ratio(k).toFixed(2)}:1, not a square medallion`)
  }
  for (const k of ['ability-molotov', 'ability-glacier', 'ability-meteor']) {
    assert.ok(ratio(k) < 0.85, `${k} is ${ratio(k).toFixed(2)}:1, not a tall plate`)
  }
})

test('the ability bar groups the hero medallions and spaces them apart', () => {
  const bar = read('presentation').abilityBar
  assert.ok(bar, 'the ability bar has no layout config')
  // A medallion fitted to the same box is far wider than a plate, so they
  // cannot share one grid without the round ones colliding.
  assert.ok(bar.heroPitch > bar.draftedPitch,
    `hero pitch ${bar.heroPitch} is not wider than the drafted pitch ${bar.draftedPitch}`)
  assert.ok(bar.groupGap > 0, 'nothing separates the two groups')

  // The hero pair goes last and together, after everything the run dealt.
  // The order itself is asserted against the real function in
  // tests/abilitybar.test.ts; what is checked here is that the order still has
  // exactly one owner. It used to be spelled out twice — once where the bar
  // was built and once where the check for "has the hand changed?" was made —
  // and the two spellings put the rare drop in different places, which
  // rebuilt the bar every frame and made every icon on it dead to touch.
  const hud = readFileSync(new URL('../src/scenes/HudScene.ts', import.meta.url), 'utf8')
  assert.ok(!/\[\s*\.\.\.\s*s\w*\.abilities\s*,/.test(hud),
    'HudScene spells out the slot order inline again; it belongs to AbilityBar.slotDefs')
  assert.equal((hud.match(/heroSlots|slotDefs\(/g) ?? []).length > 0, true,
    'HudScene no longer builds its slots through AbilityBar.slotDefs')

  const source = readFileSync(new URL('../src/systems/AbilityBar.ts', import.meta.url), 'utf8')
  const fn = source.slice(source.indexOf('export function slotDefs'))
  const body = fn.slice(0, fn.indexOf('\nexport '))
  assert.ok(body.indexOf('rareAbility') < body.indexOf('heroSlots'),
    'the rare drop is pushed after the hero abilities, splitting the medallion pair')

  // And the armed outline follows the shape rather than boxing a circle.
  assert.match(hud, /r\.hero[\s\S]{0,120}strokeCircle/,
    'a round medallion is outlined with a rectangle when armed')
})

test('the summoned gnomes are two gnomes, not one gnome twice', () => {
  const sprites = heroes.cory.fighterSprites as string[]
  assert.equal(sprites.length, new Set(sprites).size, 'the pair shares a sprite')
  assert.ok(sprites.length >= abilities.gnomes.summonCount,
    `${abilities.gnomes.summonCount} gnomes are summoned but only ${sprites.length} sprites exist`)
})

test('a gnome is smaller than the enemy it stands in front of', () => {
  // The art was drawn to a shared scale — 300px against Cory's 470 — and the
  // manifest has to keep that relationship or the joke reads as a bug.
  const gnome = art.render[heroes.cory.fighterSprites[0]]
  const soldier = art.render.enemyFiler ?? art.render[enemies.lateFiler.sprite]
  const hero = art.render[heroes.cory.bodySprite]
  for (const key of heroes.cory.fighterSprites as string[]) {
    const cfg = art.render[key]
    assert.ok(cfg, `${key} has no render config`)
    assert.ok(cfg.displayHeight < soldier.displayHeight,
      `a gnome at ${cfg.displayHeight}px is not smaller than the soldier at ${soldier.displayHeight}px`)
    // Bottom-anchored, so it stands on the ground rather than floating.
    assert.equal(cfg.anchorY, 1.0, `${key} is not anchored on its feet`)
    assert.ok(cfg.shadowWidth > 0, `${key} casts no ground shadow`)
  }
  // Against the SOLDIER, which is what the joke is about and what the gnome
  // stands in front of. It used to be measured against Cory, and Cory has
  // since been scaled up 25% on purpose while the enemy cast stayed where it
  // was — so a ratio against him stopped describing the art's shared scale
  // and started describing a deliberate design change.
  const vsSoldier = gnome.displayHeight / soldier.displayHeight
  assert.ok(vsSoldier > 0.75 && vsSoldier < 0.95,
    `a gnome is ${vsSoldier.toFixed(2)} of the soldier it blocks; it should be nearly as tall but clearly smaller`)
  const ratio = gnome.displayHeight / hero.displayHeight
  assert.ok(ratio > 0.40 && ratio < 0.72,
    `a gnome is ${ratio.toFixed(2)} of Cory; the art was drawn at two thirds`)
})

test('the gnomes replaced the Kenney placeholder outright', () => {
  // The old summon wore a top-down pack tile. Leaving it in the manifest is
  // how an unused asset survives a swap.
  for (const [key, path] of Object.entries(art.files) as [string, string][]) {
    assert.ok(!/^kenney\/.*tile291/.test(path), `${key} still points at the fighter placeholder`)
  }
})

test('gnomes can only be dropped on the lane', () => {
  // A gnome in a field blocks nothing, so the cast is refused rather than
  // wasted. It is the only ability with the restriction.
  assert.ok(abilities.gnomes.pathOnlyWithin > 0, 'the summon is not restricted to the path')
  const restricted = Object.entries(abilities as Record<string, any>)
    .filter(([, a]) => a.pathOnlyWithin !== undefined && a.pathOnlyWithin > 0)
    .map(([id]) => id)
  assert.deepEqual(restricted, ['gnomes'], 'only the summon should be path-only')
})

test('the wave curve has no cliff in it', () => {
  // Two testers failed to clear a run, and the shape of the back half was why:
  // wave 12 arrived 28% heavier than wave 11 on top of an already steep ramp.
  // This is the shape, not the absolute numbers, so tuning up later is free.
  const load = (w: any): number =>
    w.spawns.reduce((n: number, s: any) => n + s.count * enemies[s.enemy].maxHealth, 0)
  const totals = waves.waves.map(load)
  for (let i = 1; i < totals.length; i++) {
    const step = totals[i] / totals[i - 1] - 1
    // The boss wave is allowed to spike; that is what a boss is for.
    const cap = waves.waves[i].boss ? 0.8 : 0.55
    assert.ok(step <= cap,
      `wave ${i + 1} is ${Math.round(step * 100)}% heavier than wave ${i}, which is a cliff`)
    assert.ok(step > 0, `wave ${i + 1} is lighter than wave ${i}`)
  }
})

test('cutting the wave counts did not quietly cut the economy with them', () => {
  // Fewer enemies is fewer kills is fewer peanuts. A difficulty cut that also
  // takes the player's income away is not a difficulty cut.
  const income = (w: any): number =>
    w.spawns.reduce((n: number, s: any) => n + s.count * enemies[s.enemy].peanutReward, 0)
  const health = (w: any): number =>
    w.spawns.reduce((n: number, s: any) => n + s.count * enemies[s.enemy].maxHealth, 0)
  const totalIncome = waves.waves.reduce((n: number, w: any) => n + income(w), 0)
  const totalHealth = waves.waves.reduce((n: number, w: any) => n + health(w), 0)
  // Peanuts per point of health the player has to chew through. Below this and
  // the board cannot be built fast enough to keep up.
  const ratio = totalIncome / totalHealth
  assert.ok(ratio >= 0.13,
    `the run pays ${ratio.toFixed(3)} peanuts per point of enemy health, which is too thin`)
})

test('nothing ships a font or a pack file the game never asks for', () => {
  // 282 unused pack PNGs, two preloaded faces no style referenced, and an art
  // reference sheet were all being copied into the deploy. Public/ is copied
  // verbatim, so anything left in it is bytes a phone downloads for nothing.
  const html = readFileSync(url('../index.html'), 'utf8')
  const faces = [...html.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1])
  const files = readdirSync(url('../public/assets/fonts')).filter((f) => f.endsWith('.ttf'))
  for (const f of files) {
    const face = f.replace('.ttf', '')
    assert.ok(faces.includes(face), `${f} ships but no @font-face declares it`)
  }
  for (const face of faces) {
    assert.ok(files.includes(`${face}.ttf`), `@font-face declares ${face} with no file`)
  }

  // Every pack file left under public/ must be one the manifest names.
  const named = new Set(Object.values(art.files as Record<string, string>)
    .filter((p) => p.startsWith('kenney/'))
    .map((p) => p.slice('kenney/'.length)))
  for (const f of readdirSync(url('../public/assets/kenney'))) {
    if (f === 'License.txt') continue
    assert.ok(named.has(f), `public/assets/kenney/${f} is not in the manifest`)
  }

  // And nothing under public/ is a working file: an underscore prefix is how
  // the art references were marked, and they belong in reference/.
  for (const dir of ['fx', 'units', 'props', 'hero', 'enemies', 'towers']) {
    for (const f of readdirSync(url(`../public/assets/${dir}`))) {
      assert.ok(!f.startsWith('_'), `public/assets/${dir}/${f} is a reference file in the deploy`)
    }
  }
})

test('the rockets are painted art, sized from the manifest', () => {
  // They were the only sprites in the game with no render entry, drawn 1:1 in
  // world space. Survivable while every projectile was a 64px pack tile;
  // not once one of them is a 200px painted rocket.
  const rockets = ['projectile-rocket', 'projectile-rocket-big']
  for (const key of rockets) {
    assert.match(art.files[key], /^projectiles\//, `${key} is not the painted art`)
    const cfg = art.render[key]
    assert.ok(cfg, `${key} has no render entry, so it would draw at source size`)
    assert.ok(cfg.displayHeight > 0, `${key} has no on-screen height`)
    // Centred, because Projectile rotates about its own origin to point at
    // whatever it is flying toward.
    assert.equal(cfg.anchorX, 0.5, `${key} would spin about a corner`)
    assert.equal(cfg.anchorY, 0.5, `${key} would spin about a corner`)
  }

  // The heavy one has to stay visibly heavier. Height alone is not the test:
  // it is the wider silhouette that reads as weight in flight.
  const [small, big] = rockets.map((k) => art.render[k])
  const widthAt = (c: any): number => c.displayHeight * (c.contentWidth / c.contentHeight)
  assert.ok(big.displayHeight > small.displayHeight, 'the big rocket is not taller')
  assert.ok(widthAt(big) > widthAt(small) * 1.3,
    `the big rocket is only ${(widthAt(big) / widthAt(small)).toFixed(2)}x the width of the small one`)

  // And the towers that fire them are the two splash towers, not a swap.
  assert.equal(towers.rounding.shot, 'projectile-rocket')
  assert.equal(towers.escalation.shot, 'projectile-rocket-big')
})

test('the projectile pack tiles are gone', () => {
  for (const [key, path] of Object.entries(art.files) as [string, string][]) {
    assert.ok(!/towerDefense_tile25[12]/.test(path), `${key} still points at a pack rocket`)
  }
  for (const f of ['towerDefense_tile251.png', 'towerDefense_tile252.png']) {
    assert.ok(!existsSync(url(`../public/assets/kenney/${f}`)), `${f} still ships`)
  }
})

test('the muzzle flash comes out of the barrel, not through it', () => {
  const cfg = art.render['fx-muzzle']
  assert.ok(cfg, 'the muzzle flash has no render entry')
  assert.match(art.files['fx-muzzle'], /^fx\//, 'the muzzle flash is not the painted art')
  // Anchored on the base of the flame. The flash is rotated about its origin
  // to the firing angle, so a centred origin straddles the muzzle instead of
  // emerging from it.
  assert.equal(cfg.anchorY, 1, 'the flash is anchored through its middle')
  assert.ok(Math.abs(cfg.anchorX - 0.5) < 0.02, 'the flash is not anchored on its own centre line')
  assert.ok(cfg.displayHeight > 0, 'the flash has no on-screen height')

  // The art points up and the firing angle is measured from the +x axis, so
  // the rotation needs the quarter turn. The pack tile pointed up too and was
  // rotated by the bare angle, which was ninety degrees out for years.
  const pres = readFileSync(url('../src/systems/Presentation.ts'), 'utf8')
  const fn = pres.slice(pres.indexOf('export function muzzleFlash'))
  assert.match(fn, /setRotation\(angle \+ Math\.PI \/ 2\)/,
    'the flash is not turned to point along the barrel')
  assert.match(fn, /applyRender\(flash/, 'the flash is not sized from the manifest')
})

test('the blast throws no separate embers, because its own frames do', () => {
  // Six Kenney tiles were thrown outward from every ability blast. The painted
  // sheet carries debris in frames four and five, and the same Molotov with
  // and without them was indistinguishable — so they were six more sprites a
  // frame and the last Kenney tile in the effects.
  const runner = readFileSync(url('../src/systems/AbilityRunner.ts'), 'utf8')
  assert.ok(!/ART\.fx\.ember/.test(runner), 'the ember loop is still there')
  assert.equal((art.fx as Record<string, string>).ember, undefined,
    'the ember role is still in the manifest')
  for (const path of Object.values(art.files) as string[]) {
    assert.ok(!/towerDefense_tile295/.test(path), 'the ember tile is still in the manifest')
  }
  assert.ok(!existsSync(url('../public/assets/kenney/towerDefense_tile295.png')),
    'the ember tile still ships')
})
