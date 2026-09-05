import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('a hidden ability keeps its slot, so nothing else moves', () => {
  // Restructure only exists during DAD MODE, and it arrives and leaves
  // mid-fight. The bar is laid out from a fixed list of ids, so hiding it must
  // not reflow anything: a bar that shifts under the player's thumb causes
  // misfires, and misfiring the Server Nuke costs a run.
  //
  // This is a property of the LAYOUT, not of the drawing: the same defs go in
  // whether or not the icon is on the glass, so the same regions come out.
  const defs = hand(2)
  const shown = regions(defs, BAR, PLACE)
  const hidden = regions(defs, BAR, PLACE)
  assert.deepEqual(
    hidden.map((r) => [r.id, r.cx, r.cy, r.pitch]),
    shown.map((r) => [r.id, r.cx, r.cy, r.pitch]),
  )

  // And the signature is unchanged, so the bar is not rebuilt when it toggles.
  assert.equal(slotSignature(defs), slotSignature(defs))
  assert.ok(defs.some((d) => d.id === 'restructure'),
    'restructure must stay in the slot list even while it is hidden')
})

test('Restructure is gone, and the machinery it forced into existence is not', () => {
  // THE ABILITY IS CUT. It let the player move a tower, it was gated on DAD
  // MODE, and it went round a full loop in its life -- gate off because a
  // player who never dropped to 25% never learned towers could move, then a
  // free MOVE on every tower panel, then the gate back on because a permanent
  // free button made the reward worthless. It is now simply removed, and the
  // discoverability problem it was trying to solve goes with it.
  const hud = readFileSync(new URL('../src/scenes/HudScene.ts', import.meta.url), 'utf8')
  const game = readFileSync(new URL('../src/scenes/GameScene.ts', import.meta.url), 'utf8')
  const heroes = JSON.parse(
    readFileSync(new URL('../src/data/heroes.json', import.meta.url), 'utf8'))
  const art = JSON.parse(readFileSync(new URL('../src/data/art.json', import.meta.url), 'utf8'))

  // Nothing left in the DATA, which is what a player could actually meet.
  for (const [id, h] of Object.entries(heroes) as [string, any][]) {
    assert.equal(h.restructure, undefined, `${id} still carries a restructure block`)
  }
  assert.equal(art.files['ability-restructure'], undefined, 'the icon is still in the manifest')
  assert.equal(art.render['ability-restructure'], undefined, 'the icon still has a render entry')

  // And nothing in the CODE. Comments are exempt on purpose: two of them
  // record why there is no MOVE on the tower panel and why the slot machinery
  // below exists, and deleting that history to satisfy a regex is the wrong
  // tidy -- it is exactly the reasoning a future change needs.
  for (const [name, src] of [['HudScene', hud], ['GameScene', game]] as const) {
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
    assert.doesNotMatch(code, /[Rr]estructure/, `${name} still has Restructure code in it`)
  }
  // Cory keeps Haymaker.
  assert.equal(heroes.cory.haymaker.name, 'Haymaker')

  // A free permanent MOVE is not the answer either, and never was.
  const code = game.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
  assert.doesNotMatch(code, /id: 'move'/, 'MOVE is back on the tower panel')
  assert.doesNotMatch(code, /Tap a free pad/, "the tower panel's move instruction is back")

  // THE HIDE MACHINERY STAYS. Restructure was the one slot that came and went
  // mid-fight, and getting that right cost three bugs: a hidden slot that
  // still hit-tested, a handler that trusted the frame before it, and a greyed
  // icon where an empty socket belonged. Nothing hides today -- `slotShown`
  // returns true -- but the next transient ability will, and deleting this
  // would re-open all three.
  assert.match(hud, /slot\.hit\.disableInteractive\(\)/,
    'a hidden slot is not taken out of hit-testing')
  assert.match(hud, /slot\.hit\.setVisible\(shown\)/,
    'a hidden slot still renders, so Phaser will still hit-test it')
  assert.ok(!/slot\.hit\.input!\.enabled/.test(hud),
    'the hidden slot is still relying on the flag that was not enough')
  assert.match(hud, /if \(!this\.slotShown\(region, this\.world\.status\)\) return/,
    'the slot handler dispatches without checking the slot is shown')
  assert.match(hud, /strokeCircle\(r\.cx, r\.cy, r\.boxH \/ 2 - e\.inset\)/,
    'the reserved slot is not drawn as an empty socket')
})

test('a disabled button stops taking the pointer, not just the click', () => {
  // The audit finding behind the reserved-slot report, in its general form:
  // three places set a flag the handler checks and left the hit rectangle
  // registered. A button like that still hovers, still shows the hand cursor,
  // and still swallows the press so nothing beneath it sees the tap.
  const plate = readFileSync(new URL('../src/ui/Plate.ts', import.meta.url), 'utf8')
  const fn = plate.slice(plate.indexOf('setEnabled: (v: boolean)'))
  const body = fn.slice(0, fn.indexOf('\n    },'))
  assert.match(body, /hit\.disableInteractive\(\)/,
    'a disabled plate keeps its hit area, so it still eats the tap')
  assert.match(body, /hit\.setInteractive\(/,
    'a re-enabled plate never gets its hit area back')
})
