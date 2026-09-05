// The roster, the pick, and the two-state hero.
//
// Three things are checked here and they are checked differently on purpose.
// Who exists and what they wear is DATA, so it is read out of the JSON. When
// the change fires and what it is worth is RULES, so it is exercised through
// Transform.ts, which is Phaser-free precisely so that it can be. What the
// loadout and the hero entity do with either is inside a scene, so it is read
// off the source -- the same way loadout.test.ts already checks that screen.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/** A localStorage stand-in, installed before Save.ts is imported. */
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
}

const {
  DEFAULT_HERO_ID, HERO_IDS, attackFramesFor, chooseHero, chosenHero,
  hasPoweredArt, heroDef, heroList, heroSprite, resolveHeroId, walkFramesFor,
} = await import('../src/systems/Heroes.ts')
const {
  POWERED_DAMAGE_TAKEN, TRANSFORM_BELOW, TRANSFORM_INVULNERABLE_SECONDS,
  afterRespawn, afterTransform, damageToHero, shouldTransform, tickTransform,
} = await import('../src/systems/Transform.ts')
const { loadSave, writeSave, DEFAULT_SAVE } = await import('../src/systems/Save.ts')
const {
  SLOT1, SLOT2, heroSlotDefs, skillDamage, slot1Of, slot2Usable,
} = await import('../src/systems/HeroSkills.ts')
const { Cooldowns } = await import('../src/systems/Cooldowns.ts')
const { simulate } = await import('../tools/soak/Sim.ts')

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const json = (p: string) => JSON.parse(src(p))
const HEROES = json('src/data/heroes.json')
const ART = json('src/data/art.json')
const LOADOUT = src('src/scenes/LoadoutScene.ts')
const HERO_TS = src('src/entities/Hero.ts')
const GAME = src('src/scenes/GameScene.ts')
const HUD = src('src/scenes/HudScene.ts')

/** Source with comment lines removed, so a regex that means "the code does
 *  this" cannot be satisfied or broken by prose about it. */
const code = (s: string) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')

beforeEach(() => { store.clear() })

/* ------------------------------------------------------------- the roster */

test('every hero can be selected and spawns with the correct art', () => {
  assert.deepEqual(HERO_IDS, ['cory', 'courtland', 'han', 'eli', 'bailey'])
  assert.equal(DEFAULT_HERO_ID, 'cory', 'Cory is the default, so an old save plays the tuned game')

  for (const { id, def } of heroList()) {
    chooseHero(id)
    assert.equal(chosenHero(), id, `${id} could not be selected`)

    // The art a run would actually put on the field, in both forms.
    const base = heroSprite(id, false)
    const powered = heroSprite(id, true)
    assert.equal(base, ART.hero.roster[id].base, `${id} does not spawn wearing its own base art`)
    assert.equal(base, def.bodySprite, `${id}'s roster art and its bodySprite disagree`)
    assert.equal(powered, ART.hero.roster[id].powered ?? base,
      `${id}'s powered form is not the art the roster names`)

    // Every key named has a file behind it. A roster entry pointing at a
    // texture the manifest never loads is a blank hero, and only at the
    // moment of transformation, which is the worst time to find out.
    for (const key of [base, powered]) {
      assert.ok(ART.files[key], `${id} names texture ${key}, which the manifest does not load`)
    }
  }

  // Cory is the one with no powered art, and that is deliberate rather than
  // missing: his ultimate sprite is already DAD MODE, so the powered form
  // would take Last Stand's only visual away from it.
  assert.equal(hasPoweredArt('cory'), false)
  for (const id of HERO_IDS.filter((h) => h !== 'cory')) {
    assert.equal(hasPoweredArt(id), true, `${id} has no powered art`)
  }

  // An id that is not a hero plays the default rather than throwing.
  assert.equal(resolveHeroId('nobody'), DEFAULT_HERO_ID)
  assert.equal(resolveHeroId(''), DEFAULT_HERO_ID)
  assert.equal(resolveHeroId(null), DEFAULT_HERO_ID)
  assert.equal(heroDef('nobody'), null)
  assert.equal(heroDef('_note'), null, 'a note key in heroes.json must not read as a hero')
  assert.equal(heroSprite('nobody', true), HEROES.cory.bodySprite)
})

test('the hero is no longer randomised and reroll does not change it', () => {
  const deal = code(LOADOUT.slice(LOADOUT.indexOf('private deal('), LOADOUT.indexOf('private reroll(')))
  assert.doesNotMatch(deal, /hero/i, 'the deal still touches the hero')
  assert.doesNotMatch(deal, /HERO_IDS|ALL_HEROES/, 'the deal still draws from the roster')
  assert.doesNotMatch(code(LOADOUT), /rng\.pick\(\s*(HERO_IDS|heroes)/, 'a hero is still being drawn')

  // Reroll goes through the same deal, so "reroll leaves the hero alone" is
  // the same fact as "the deal does not touch it" -- but only while redeal
  // has no path of its own.
  const from = LOADOUT.indexOf('private redeal(')
  const redeal = code(LOADOUT.slice(from, LOADOUT.indexOf('\n  }', from)))
  assert.match(redeal, /this\.deal\(/, 'reroll no longer goes through deal()')
  assert.doesNotMatch(redeal, /heroId|chooseHero/, 'reroll now writes the hero')

  // And what a reroll IS allowed to replace is stated in one place.
  assert.match(code(LOADOUT), /setRunState\(\{ abilities, openingTowers: opening, reserveTowers: reserve \}\)/)
})

test('towers and specials are still randomised', () => {
  const deal = code(LOADOUT.slice(LOADOUT.indexOf('private deal('), LOADOUT.indexOf('private reroll(')))
  assert.match(deal, /makeRng\(seed\)/, 'the deal is no longer seeded')
  assert.match(deal, /draftAbilities\(pool, DRAFT\.abilitiesDrawn, rng\)/)
  assert.match(deal, /draftOpeningTowers\(towerPool, DRAFT, rng\)/)
  assert.match(deal, /reserveTowers\(towerPool, opening, rng\)/)
  // The reroll still costs something and still exists.
  assert.match(code(LOADOUT), /this\.rerollsLeft -= 1/)
})

test('selection persists across runs', () => {
  // Nothing chosen yet: the save is empty and the roster answers Cory.
  assert.equal(loadSave().heroId, '')
  assert.equal(chosenHero(), 'cory')

  chooseHero('bailey')
  assert.equal(loadSave().heroId, 'bailey', 'the pick did not reach the save')
  assert.equal(chosenHero(), 'bailey', 'the pick did not survive a reload')

  // Every other field survives a pick -- the save is written whole, and a
  // hero choice that forgot a cleared run would re-lock the Server Nuke.
  writeSave({ ...DEFAULT_SAVE, runsCleared: 3, seenCutscenes: ['level1'], volume: 0.2 })
  chooseHero('han')
  const after = loadSave()
  assert.equal(after.heroId, 'han')
  assert.equal(after.runsCleared, 3)
  assert.deepEqual(after.seenCutscenes, ['level1'])
  assert.equal(after.volume, 0.2)

  // A save naming a hero that no longer exists plays the default rather than
  // failing to boot -- the same validate-or-reset the rest of the save uses.
  writeSave({ ...DEFAULT_SAVE, heroId: 'gary' })
  assert.equal(chosenHero(), 'cory')
  writeSave({ ...DEFAULT_SAVE, heroId: 42 as unknown as string })
  assert.equal(loadSave().heroId, '', 'a non-string hero id should be discarded on read')
  assert.equal(chosenHero(), 'cory')

  // And the screen preselects it rather than dealing over it.
  assert.match(code(LOADOUT), /if \(!runState\(\)\.heroId\) setRunState\(\{ heroId: chosenHero\(\) \}\)/)
  assert.match(code(LOADOUT), /chooseHero\(id\)/, 'tapping a card no longer remembers the hero')
})

/* ----------------------------------------------------- the transformation */

/** One life, driven the way the entity drives it: damage in, health out,
 *  the change checked on what is LEFT. */
function life(maxHealth: number) {
  let health = maxHealth
  let state = { powered: false, invulnerableFor: 0 }
  let transformations = 0
  return {
    get health() { return health },
    get powered() { return state.powered },
    get invulnerableFor() { return state.invulnerableFor },
    get transformations() { return transformations },
    /** Returns the damage actually taken. */
    hit(incoming: number): number {
      const taken = damageToHero(incoming, state.powered, state.invulnerableFor)
      health = Math.max(0, health - taken)
      if (shouldTransform(health, maxHealth, state.powered)) {
        state = afterTransform()
        transformations += 1
      }
      return taken
    },
    wait(dt: number) { state = tickTransform(state, dt) },
    die() { health = 0 },
    revive() { health = maxHealth; state = afterRespawn() },
  }
}

test('transformation fires at 50 percent and not above', () => {
  assert.equal(TRANSFORM_BELOW, 0.5)

  // 51% left: no change. This is the boundary the player sees, and it is
  // read off what REMAINS, not off what the blow was going to do.
  const above = life(100)
  above.hit(49)
  assert.equal(above.health, 51)
  assert.equal(above.powered, false, 'a hero above half must not transform')

  // Exactly half: at or below, so it fires.
  const half = life(100)
  half.hit(50)
  assert.equal(half.health, 50)
  assert.equal(half.powered, true, 'exactly 50% must transform -- "50 percent or below"')

  const under = life(360)
  under.hit(200)
  assert.equal(under.powered, true)

  // A hero killed outright is dead, not powered.
  assert.equal(shouldTransform(0, 100, false), false)
  assert.equal(shouldTransform(-20, 100, false), false)
  assert.equal(shouldTransform(50, 0, false), false, 'a zero-health hero must not divide by it')
})

test('it fires once per life', () => {
  const h = life(100)
  h.hit(60)
  assert.equal(h.powered, true)
  assert.equal(h.transformations, 1)

  h.wait(TRANSFORM_INVULNERABLE_SECONDS)
  h.hit(10)
  h.hit(10)
  assert.equal(h.transformations, 1, 'the change fired again inside one life')
  assert.equal(shouldTransform(1, 100, true), false, 'already powered must never re-trigger')

  // Healed back over half: still powered. The state is entered, not held.
  assert.equal(h.powered, true)
})

test('damage reduction applies only in powered form', () => {
  assert.equal(POWERED_DAMAGE_TAKEN, 0.6, '40% off')
  assert.equal(damageToHero(100, false, 0), 100, 'a base hero takes full damage')
  assert.equal(damageToHero(100, true, 0), 60)
  assert.equal(damageToHero(0, true, 0), 0)

  // Across a real life: the same blow costs less after the change.
  const h = life(100)
  assert.equal(h.hit(40), 40, 'the pre-transformation hit was reduced')
  assert.equal(h.hit(11), 11, 'the hit that CAUSES the change is not itself reduced')
  assert.equal(h.powered, true)
  h.wait(TRANSFORM_INVULNERABLE_SECONDS)
  assert.equal(h.hit(40), 24, 'the post-transformation hit was not reduced')
})

test('invincibility expires after 1.5 seconds', () => {
  assert.equal(TRANSFORM_INVULNERABLE_SECONDS, 1.5)
  assert.equal(afterTransform().invulnerableFor, 1.5)

  const h = life(100)
  h.hit(60)
  assert.equal(h.invulnerableFor, 1.5)

  // Absolute while it lasts, and a reduction would not do this job: the point
  // is that a boss cannot delete the hero in the middle of the swap.
  h.wait(1.4)
  assert.equal(h.hit(9999), 0, 'the hero took damage during the grace')
  assert.equal(h.health, 40)

  // 1.5 seconds exactly, to the frame. Stepped in one go rather than
  // accumulated, because a float sum of sixtieths lands a hair either side of
  // the boundary and the RULE is the number, not the arithmetic.
  assert.ok(tickTransform(afterTransform(), 1.49).invulnerableFor > 0, 'it expired early')
  assert.equal(tickTransform(afterTransform(), 1.5).invulnerableFor, 0,
    'the grace outlived its 1.5 seconds')

  h.wait(0.2)
  assert.equal(h.invulnerableFor, 0)
  assert.equal(h.hit(10), 6, 'damage did not resume, at the powered rate, once the grace ran out')

  // And it never goes negative, however long the frame was.
  assert.equal(tickTransform(afterTransform(), 99).invulnerableFor, 0)
})

test('death returns the hero to base form', () => {
  const h = life(100)
  h.hit(60)
  assert.equal(h.powered, true)

  h.die()
  h.revive()
  assert.equal(h.health, 100, 'a revived hero is not at full health')
  assert.equal(h.powered, false, 'the powered form survived a death')
  assert.equal(h.invulnerableFor, 0, 'the grace survived a death')

  // And it has to be earned again from scratch.
  h.hit(40)
  assert.equal(h.powered, false)
  h.hit(11)
  assert.equal(h.powered, true)
  assert.equal(h.transformations, 2)

  // The entity does the same thing, in revive().
  const revive = code(HERO_TS.slice(HERO_TS.indexOf('private revive(')))
  assert.match(revive, /this\.powered = false/, 'revive() no longer drops the powered form')
})

/* ------------------------------------------------------------ the two slots */

test('each slot 1 ability fires and respects its cooldown', () => {
  // FIRES: driven through the soak, which is the only thing in this repo that
  // runs the rule layer without a canvas. It picks a hero per run, casts slot 1
  // whenever the cooldown allows and records what actually went off, so a
  // skill that could never fire -- no target in range, a zero cooldown, an
  // effect the runner does not know -- shows up here as an absence.
  for (const id of HERO_IDS) {
    const r = simulate(4, 'normal', 'level1', id)
    assert.ok(r.firedAbilities.has(SLOT1),
      `${id}'s ${slot1Of(id).name} never fired in a whole run`)
  }

  // RESPECTS ITS COOLDOWN: against the real Cooldowns, per hero, at its own
  // declared length. Ready at the start, spent on the cast, still spent one
  // tick before it is up, ready again on the tick that finishes it.
  for (const id of HERO_IDS) {
    const k = slot1Of(id)
    const cd = new Cooldowns()
    cd.register(SLOT1, k.cooldown)
    assert.equal(cd.ready(SLOT1), true, `${id} starts with ${k.name} on cooldown`)
    cd.start(SLOT1)
    assert.equal(cd.ready(SLOT1), false, `${id}'s ${k.name} is castable again immediately`)
    // Two clean ticks from the same cast rather than one tick split in two:
    // a float sum of two parts lands a hair either side of the boundary and
    // the RULE is the cooldown, not the arithmetic.
    cd.tick(k.cooldown - 0.5)
    assert.equal(cd.ready(SLOT1), false, `${id}'s ${k.name} came back early`)
    const cd2 = new Cooldowns()
    cd2.register(SLOT1, k.cooldown)
    cd2.start(SLOT1)
    cd2.tick(k.cooldown)
    assert.equal(cd2.ready(SLOT1), true, `${id}'s ${k.name} never came back`)
  }

  // And the five are five different things rather than five copies of the
  // punch, which is what they were before this.
  const effects = HERO_IDS.map((id) => slot1Of(id).effect)
  assert.deepEqual(effects, ['punch', 'burst', 'burn', 'double', 'howl'])
  assert.equal(new Set(HERO_IDS.map((id) => slot1Of(id).name)).size, 5)
  // Cory's is unchanged, which is what the rest of the game was tuned against.
  assert.equal(skillDamage(slot1Of('cory')), 130)
  assert.equal(slot1Of('cory').cooldown, 12)
  // Bark does nothing to health at all, on purpose.
  assert.equal(skillDamage(slot1Of('bailey')), 0)
  assert.ok(slot1Of('bailey').slowSeconds > 0, 'Bark neither damages nor slows')

  // The scene refuses every one of them the same way, through one entry point.
  const cast = GAME.slice(GAME.indexOf('castHeroSlot1(): void {'))
  const body = cast.slice(0, cast.indexOf('\n  }'))
  assert.match(body, /if \(!this\.cooldowns\.ready\(SLOT1\)\)/, 'slot 1 does not check its cooldown')
  assert.match(body, /if \(this\.hero\.down\)/, 'a downed hero can still cast slot 1')
  assert.match(body, /this\.cooldowns\.start\(SLOT1\)/, 'casting slot 1 does not spend it')
  for (const effect of ['punch', 'burst', 'burn', 'double', 'howl']) {
    assert.ok(body.includes(`case '${effect}'`), `the runner cannot cast a ${effect}`)
  }
})

test('slot 2 is unusable in base form and enabled in powered form', () => {
  // THE RULE, on its own.
  assert.equal(slot2Usable(false, false), false, 'a base-form hero can use its power')
  assert.equal(slot2Usable(true, false), true, 'a powered hero cannot use its power')
  assert.equal(slot2Usable(true, true), false, 'a hero that is down can still use its power')
  assert.equal(slot2Usable(false, true), false)

  // Across a life, driven the way the entity drives it: base, then powered at
  // half health, then base again after a death.
  const h = life(100)
  assert.equal(slot2Usable(h.powered, false), false)
  h.hit(60)
  assert.equal(slot2Usable(h.powered, false), true, 'the transformation did not light the slot')
  h.die()
  h.revive()
  assert.equal(slot2Usable(h.powered, false), false, 'the slot stayed lit through a death')

  // THE HUD ASKS THAT RULE, and it asks it about the status flag rather than
  // reaching into the hero -- the HUD is a separate scene and cannot.
  assert.match(HUD, /slot2Usable\(s\.heroPowered, s\.heroDown\)/,
    'the HUD does not gate slot 2 on the powered form')
  assert.match(code(GAME), /this\.status\.heroPowered = this\.hero\.powered/,
    'nothing keeps the status flag in step with the hero')
  assert.match(code(GAME), /heroPowered: false/, 'the flag does not start false')

  // Unusable means GREY AND INERT, not hidden: a player should be able to see
  // that the power exists and read its icon while it is out of reach. Both
  // halves of that are already in drawSlots -- the greyscale swap and the
  // hit rectangle -- and this is what says slot 2 goes through them.
  assert.match(HUD, /const usable = this\.slotUsable\(r, s\)/)
  assert.match(HUD, /const wantKey = usable \? base : greyKey\(base\)/)

  // And the button is wired, to something that says it is not built yet.
  assert.match(HUD, /else if \(region\.id === SLOT2\) this\.world\.castHeroSlot2\(\)/,
    'tapping slot 2 does nothing at all')
  const cast = GAME.slice(GAME.indexOf('castHeroSlot2(): void {'))
  const body = cast.slice(0, cast.indexOf('\n  }'))
  assert.match(body, /slot2Usable\(this\.hero\.powered, this\.hero\.down\)/,
    'the cast path does not apply the same gate the HUD draws')
  assert.doesNotMatch(body, /cooldowns\.start/,
    'the unbuilt power spends a cooldown, so pressing it costs something')

  // Both slots are in the bar, in order, and neither is an ability card.
  for (const id of HERO_IDS) {
    const def = heroDef(id)!
    const defs = heroSlotDefs(def)
    assert.deepEqual(defs.map((d) => d.id), [SLOT1, SLOT2])
    assert.ok(defs.every((d) => d.hero && d.kind === 'heroSlot'),
      `${id}'s buttons are not hero medallions`)
    assert.deepEqual(defs.map((d) => d.icon), [def.slot1.icon, def.slot2.icon])
  }
})

/* ------------------------------------------------------------ the rest of it */

test('no Restructure code or data remains', () => {
  // The full sweep of the scenes and the slot machinery lives in
  // abilitybar.test.ts; what is checked here is the HERO side of it.
  for (const [id, h] of Object.entries(HEROES) as [string, any][]) {
    if (id.startsWith('_')) continue
    assert.equal(h.restructure, undefined, `${id} still carries a restructure block`)
    assert.ok(h.slot1, `${id} has no slot 1`)
  }
  assert.equal(HEROES.cory.slot1.name, 'Haymaker', 'Cory keeps Haymaker')
  assert.equal(ART.files['ability-restructure'], undefined)
  assert.doesNotMatch(code(HERO_TS), /[Rr]estructure/, 'Hero.ts still has Restructure code in it')
  assert.doesNotMatch(code(LOADOUT), /[Rr]estructure/)
  assert.doesNotThrow(() => readFileSync(new URL('../src/data/heroes.json', import.meta.url)))
  assert.throws(
    () => readFileSync(new URL('../public/assets/abilities/ability_restructure.webp', import.meta.url)),
    'the Restructure icon is still in the build',
  )
})

test('Cory otherwise behaves as before', () => {
  // The numbers the game was tuned against, unchanged by the roster arriving.
  const cory = heroDef('cory')!
  assert.equal(cory.maxHealth, 360)
  assert.equal(cory.moveSpeed, 104)
  assert.equal(cory.damage, 18)
  assert.equal(cory.attackInterval, 0.85)
  assert.equal(cory.blockCapacity, 3)
  assert.equal(cory.attackRange, 86)
  assert.equal(cory.ignoresArmor, false)
  assert.equal(cory.ultimateSprite, 'hero-cory-ultimate', 'DAD MODE lost its own look')

  // His sheets are still his, and are still what turn the bob off.
  assert.deepEqual(walkFramesFor('cory'), ART.hero.walk)
  assert.deepEqual(attackFramesFor('cory'), ART.hero.attack)
  assert.equal(walkFramesFor('cory')!.length, 4)
  assert.equal(attackFramesFor('cory')!.length, 4)
})

test('a hero with no walk sheet bobs, and one with a sheet does not', () => {
  // The condition is the SHEET, not a flag, so dropping real frames into the
  // roster later turns the bob off by itself.
  for (const id of HERO_IDS.filter((h) => h !== 'cory')) {
    assert.equal(walkFramesFor(id), null, `${id} unexpectedly has a walk sheet`)
    assert.equal(attackFramesFor(id), null)
  }
  const bob = code(HERO_TS.slice(HERO_TS.indexOf('private bob(')))
  assert.match(bob, /if \(walkFramesFor\(this\.heroId\)\)/,
    'the bob is no longer conditioned on the walk sheet being absent')
  assert.match(bob, /this\.restingBodyY/, 'a hero with a sheet is not returned to its resting position')
  // An empty frame list reads as no sheet, so a half-added roster entry bobs
  // rather than standing perfectly still.
  assert.deepEqual(walkFramesFor('nobody'), ART.hero.walk, 'an unknown id resolves to the default hero')
})
