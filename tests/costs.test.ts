import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { BASE_TIER, maxTier, nextStep, specById, statAt } from '../src/systems/Upgrades.ts'
import { buttonLabel } from '../src/systems/TowerCard.ts'

const dir = new URL('../src/data/', import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(new URL(n, dir), 'utf8'))

/**
 * NOTHING THE PLAYER BUYS IS FREE.
 *
 * Live play reported an upgrade panel offering two options, one at 201 peanuts
 * and one at 0. The 0 was not a missing value: it was the disabled upgrade slot,
 * which `GameScene.towerRingOptions` emits ALWAYS so that SELL can never
 * inherit ring position 0, and which passed `price: 0` while there was nothing
 * to buy. `buttonLabel` already printed the bare verb for 0, so the confirm
 * button read "Upgrade" — but the price BADGE under the icon printed the
 * literal "0", which is indistinguishable from a free upgrade. That slot now
 * carries `price: null` and draws no badge.
 *
 * The 201 identifies the panel exactly: `shelter` invested through tier 2 is
 * 140 + 196 = 336, and 336 × the 0.6 sell refund is 201. So it was a Beacon
 * mid-upgrade to tier 2 — `reason: 'Already building. Wait for it to finish.'`
 * — with SELL offering its refund beside a price of nothing.
 *
 * THIS FILE GUARDS THE FAULT THAT WAS SUSPECTED RATHER THAN THE ONE THAT
 * HAPPENED, which is the point of it: a genuine zero in a data file, or a
 * fallback that resolves to one, would look identical on the glass and would
 * actually give the thing away. Nothing in `src/data/` carries one today and
 * this fails the moment one arrives.
 */

/** Every `cost`-shaped number in a JSON tree, with the path that found it. */
function costsIn(value: unknown, path = ''): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = []
  if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...costsIn(v, `${path}[${i}]`)))
    return out
  }
  if (value === null || typeof value !== 'object') return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // Notes are prose about numbers, not numbers.
    if (k.startsWith('_')) continue
    // `cost` and `...Cost`, but NOT `livesCost`: that is what an enemy takes
    // off the player when it escapes, and 0 would be a different bug in a
    // different direction. Nothing buys it.
    if ((k === 'cost' || k === 'price' || (k.endsWith('Cost') && k !== 'livesCost'))
      && typeof v === 'number') {
      out.push([`${path}/${k}`, v])
    }
    out.push(...costsIn(v, `${path}/${k}`))
  }
  return out
}

test('no purchasable in any data file costs nothing', () => {
  const files = readdirSync(dir).filter((n) => n.endsWith('.json'))
  assert.ok(files.length > 20, `only ${files.length} data files were scanned`)
  let checked = 0
  for (const name of files) {
    for (const [path, value] of costsIn(read(name))) {
      checked++
      assert.equal(typeof value, 'number', `${name}${path} is not a number`)
      assert.ok(Number.isFinite(value as number),
        `${name}${path} is ${value}, which is not a finite cost`)
      assert.ok((value as number) > 0,
        `${name}${path} costs ${value}. Nothing the player buys is free; a zero here `
        + 'gives the thing away and reads on the glass exactly like the disabled '
        + 'upgrade slot that live play reported.')
    }
  }
  // 29 tower numbers -- seven builds, eight tier steps, fourteen branches --
  // plus the sign bribe. Pinned so a refactor that moves the costs somewhere
  // this scan cannot see fails instead of passing vacuously.
  assert.ok(checked >= 30, `only ${checked} costs were found; the scan has gone blind`)
})

test('every tower resolves a real cost at every tier and every branch', () => {
  /*
   * THE RESOLVED cost, not the authored one, because that is what the panel
   * spends. `nextStep` is what the upgrade option reads and `specById` is what
   * the branch options read, so a fallback that quietly produced 0 would show
   * up here and not in the scan above.
   */
  const TOWERS = read('towers.json') as Record<string, never>
  let seen = 0
  for (const [id, raw] of Object.entries(TOWERS)) {
    if (id.startsWith('_')) continue
    const def = raw as unknown as Parameters<typeof maxTier>[0]
    const anyDef = def as unknown as { cost: number; specializations?: Array<{ id: string }> }
    assert.ok(anyDef.cost > 0, `${id} builds for ${anyDef.cost}`)
    seen++
    for (let tier = BASE_TIER; tier <= maxTier(def); tier++) {
      const step = nextStep(def, tier)
      if (step !== null) {
        assert.ok(step.cost > 0, `${id} tier ${tier} -> ${tier + 1} costs ${step.cost}`)
        seen++
      }
      // AND THE STAT THE PANEL PRINTS BESIDE IT. A tier whose damage resolves
      // to 0 is a different giveaway -- a tower that costs money and shoots
      // nothing -- and `statAt` multiplies through the tiers, so one missing
      // multiplier zeroes it.
      //
      // A GUN ONLY. The Beacon is a support tower: `fireInterval` and `damage`
      // are both 0 in towers.json because it shoots nothing, and the firing
      // loops read it through `Math.max(0.05, ...)` for exactly that reason.
      // Asserting a fire rate on it was this test's own first red result.
      for (const spec of [null, ...(anyDef.specializations ?? []).map((s) => s.id)]) {
        const s = specById(def, spec)
        if (spec !== null) {
          const cost = (s as unknown as { cost: number } | null)?.cost
          assert.ok(typeof cost === 'number' && cost > 0,
            `${id}'s ${spec} branch costs ${cost}`)
          seen++
        }
        const gun = statAt(def, tier, 'supportRadius', spec) <= 0
          && statAt(def, tier, 'damage', spec) > 0
        if (!gun) continue
        const interval = statAt(def, tier, 'fireInterval', spec)
        assert.ok(interval > 0, `${id} tier ${tier}${spec ? ':' + spec : ''} fires every ${interval}s`)
      }
    }
  }
  assert.ok(seen >= 40, `only ${seen} resolved costs were checked`)
})

test('a button with no price says so by saying nothing', () => {
  // The two halves of the fix, in the two places that print a price.
  assert.equal(buttonLabel('Upgrade', null), 'Upgrade')
  assert.equal(buttonLabel('Upgrade', 0), 'Upgrade')
  assert.equal(buttonLabel('Upgrade', 201), 'Upgrade 201p')
  assert.equal(buttonLabel('Sell', 201, true), 'Sell +201p')
  // And the badge under the icon, which is the one that printed "0".
  const ring = readFileSync(new URL('../src/ui/TowerRing.ts', import.meta.url), 'utf8')
  assert.match(ring, /price: number \| null/,
    'the ring option price is a plain number again, so the disabled slot has to pass 0')
  assert.match(ring, /option\.price === null \? '' : String\(option\.price\)/,
    'the price badge prints whatever it is handed again')
  const game = readFileSync(new URL('../src/scenes/GameScene.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(game, /\n\s+price: 0,/,
    'a ring option is priced at 0 again; use null for "there is nothing to buy"')
})
