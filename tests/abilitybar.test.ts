import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  barWidth, iconBox, regions, slotDefs, slotSignature,
  type BarMetrics, type SlotDef,
} from '../src/systems/AbilityBar.ts'
import presentation from '../src/data/presentation.json' with { type: 'json' }

const BAR = presentation.abilityBar as BarMetrics
const PLACE = { x: 400, y: 640, scale: 1, iconH: 64 }

/** A hand of `drafted` run abilities plus the hero's own two. */
function hand(drafted: number, rare = false): SlotDef[] {
  const ids = ['molotov', 'gnomes', 'glacier', 'meteor'].slice(0, drafted)
  return slotDefs(
    ids,
    rare ? 'serverNuke' : null,
    (id) => ({ icon: `icon-${id}` }),
    [
      { id: 'haymaker', kind: 'haymaker', icon: 'icon-haymaker', hero: true },
      { id: 'restructure', kind: 'restructure', icon: 'icon-restructure', hero: true },
    ],
  )
}

test('every slot is drawn where it is tapped, for 1 to 6 slots', () => {
  // The assertion the bar has now failed twice for want of. The icon, the
  // frame and the hit rectangle are all placed from one region, so this checks
  // the region's own internal consistency: the centre a tap is tested against
  // is the centre the icon is drawn at, and the rectangle around it spans
  // exactly the slot's own column.
  for (let total = 1; total <= 6; total++) {
    // Two of every hand are the hero's own, so `total` counts from there.
    const defs = hand(Math.max(0, total - 2)).slice(0, total)
    assert.equal(defs.length, total, `wanted ${total} slots`)

    for (const scale of [1, 0.75, 0.5]) {
      const placed = regions(defs, BAR, { ...PLACE, scale })
      assert.equal(placed.length, total)

      for (const r of placed) {
        // The hit rectangle is centred on (cx, cy) and sized (pitch, boxH).
        // Its edges must be exactly the slot's own column.
        assert.equal(r.cx - r.pitch / 2, r.x,
          `${r.id}: hit rectangle's left edge is not the slot's left edge`)
        assert.equal(r.cx + r.pitch / 2, r.x + r.pitch,
          `${r.id}: hit rectangle's right edge is not the slot's right edge`)
        assert.equal(r.cy - r.boxH / 2, r.y,
          `${r.id}: hit rectangle's top edge is not the icon box's top edge`)
        // The icon is fitted to a box that must fit inside what is tapped.
        assert.ok(iconBox(r, BAR, scale) <= r.pitch + 1e-9,
          `${r.id}: icon is drawn ${iconBox(r, BAR, scale)}px wide in a ${r.pitch}px slot`)
        assert.ok(r.pitch > 0 && r.boxH > 0, `${r.id}: zero-sized slot`)
      }
    }
  }
})

test('slots never overlap, at any count', () => {
  // A tap belongs to one slot or to none. Overlapping rectangles mean the
  // topmost one silently swallows its neighbour's taps.
  for (let total = 1; total <= 6; total++) {
    const defs = hand(Math.max(0, total - 2)).slice(0, total)
    const placed = regions(defs, BAR, PLACE)
    for (let i = 1; i < placed.length; i++) {
      const prev = placed[i - 1]!
      const cur = placed[i]!
      assert.ok(cur.x >= prev.x + prev.pitch,
        `${cur.id} starts at ${cur.x}, inside ${prev.id} which ends at ${prev.x + prev.pitch}`)
    }
  }
})

test('the measured width is the width the slots actually take', () => {
  // These were two separate calculations, and the second one assumed exactly
  // two hero slots and no rare drop. The row was then centred for four icons
  // and five were drawn into it, which is the gap the testers saw.
  for (const rare of [false, true]) {
    for (let drafted = 0; drafted <= 4; drafted++) {
      const defs = hand(drafted, rare)
      const placed = regions(defs, BAR, PLACE)
      const last = placed[placed.length - 1]!
      const span = last.x + last.pitch - placed[0]!.x
      assert.equal(span, barWidth(defs, BAR),
        `drafted=${drafted} rare=${rare}: measured ${barWidth(defs, BAR)}, drew ${span}`)
    }
  }
})

test('a rare drop widens the row rather than being squeezed into it', () => {
  const four = hand(2)
  const five = hand(2, true)
  assert.equal(four.length, 4)
  assert.equal(five.length, 5)
  assert.ok(barWidth(five, BAR) > barWidth(four, BAR),
    'five slots must measure wider than four, or the layout reserves too little room')
  assert.equal(barWidth(five, BAR) - barWidth(four, BAR), BAR.draftedPitch,
    'the extra width should be exactly one drafted plate')
})

test('the rebuild signature does not depend on where the rare drop is listed', () => {
  // The freeze, stated as a rule. The check for "has the hand changed?"
  // compared a signature built in bar order against one built with the rare
  // ability moved to the end. Once the Server Nuke landed the two could never
  // be equal, so the bar was destroyed and rebuilt every frame and no tap on
  // it could ever complete.
  const defs = hand(2, true)
  const sig = slotSignature(defs)

  // Same hand, asked for twice: stable.
  assert.equal(sig, slotSignature(hand(2, true)))

  // And the signature genuinely is bar order, so anything comparing against it
  // has to build it the same way rather than by hand.
  assert.equal(sig, defs.map((d) => d.id).join(','))
  assert.equal(sig, 'molotov,gnomes,serverNuke,haymaker,restructure')

  // The old check, reinstated, to show it never matches.
  const oldWanted = ['molotov', 'gnomes', 'haymaker', 'restructure', 'serverNuke'].join(',')
  assert.notEqual(oldWanted, sig,
    'this is the comparison that rebuilt the bar every frame')

  // Adding the drop must change the signature, or the bar never rebuilds at all.
  assert.notEqual(slotSignature(hand(2)), sig)
})

test('the two shapes stay in their own groups, with one seam between them', () => {
  // The gap is a deliberate signal — rectangular plates are what the run dealt,
  // round medallions are the hero's own — so there must be exactly one of them.
  const defs = hand(3, true)
  const placed = regions(defs, BAR, PLACE)
  let seams = 0
  for (let i = 1; i < placed.length; i++) {
    if (placed[i]!.x > placed[i - 1]!.x + placed[i - 1]!.pitch) seams++
  }
  assert.equal(seams, 1, 'expected exactly one gap, between the drafted group and the hero group')
  assert.deepEqual(placed.map((r) => r.hero), [false, false, false, false, true, true],
    'the hero medallions must stay last')
})
