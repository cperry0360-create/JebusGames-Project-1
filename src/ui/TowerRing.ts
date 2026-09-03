import Phaser from 'phaser'
import presentationData from '../data/presentation.json'
import { COLOR, FONT_UI, uiSize } from './Theme.ts'
import { iconPlate } from './Plate.ts'
import { fitInBox, icon } from '../systems/Art.ts'
import { play } from '../systems/Audio.ts'
import {
  type Rect, type RingPlacement, contains, fitRingAndPanel, ringPlacement,
} from '../systems/RingLayout.ts'
import { type CardStat, buttonLabel, statsThatFit } from '../systems/TowerCard.ts'

/**
 * Shrinks a one-line label until it fits, down to a floor.
 *
 * NOT a ladder. The old panel had four of those, each recomposing the whole
 * card at a smaller size to make a paragraph fit; this measures one text once
 * and scales it. Every string on the ledger is schema-limited, so it fires
 * only on the narrowest card, and one line is the contract the card is built
 * on: wrapping would change the card's height, and the height is fixed.
 */
function shrinkToFit(t: Phaser.GameObjects.Text, width: number, floor: number): void {
  if (t.width <= width || width <= 0) return
  const size = Number(String(t.style.fontSize).replace('px', '')) || floor
  t.setFontSize(Math.max(floor, Math.floor(size * (width / t.width))))
}

/**
 * THE tower menu. One component for both halves of it.
 *
 * It replaces BuildMenu and TowerPanel, which were two different answers to
 * the same question — "what can I do with this tile?" — with two different
 * layouts, two different interaction models and two different bugs. The build
 * half was a fixed 240x180 grid of text anchored to the tapped pad with no
 * viewport clamping, and on a 568x320 screen three of seven pads put its buy
 * buttons entirely below the display: the game said "Pick a tower" and there
 * was nothing on screen to pick.
 *
 * The shape of the replacement:
 *
 *   - A RADIAL RING of circular icon buttons around the pad or tower. No text
 *     on a button; an icon, with a price badge underneath it.
 *   - It lives in HUD space, positioned by projecting the world point to the
 *     screen. It does NOT scale with camera zoom, so a button is the same size
 *     to the thumb at every zoom.
 *   - Tapping a button does NOT buy anything. It opens a description panel:
 *     name, what the thing does, its numbers, its price. Buying needs a second,
 *     explicit press on that panel.
 *   - Tapping a different ring button swaps the panel's contents without
 *     closing it. Tapping anywhere else closes the lot.
 *   - The panel is clamped so it cannot leave the screen, flips to whichever
 *     side has room, and never covers the ring or the ability bar.
 *
 * Every position comes from RingLayout, which is Phaser-free so the placement
 * can be proved for every pad, every tower, both zoom ends and both viewports
 * in CI rather than sampled in a browser.
 */

const CFG = presentationData.ring

export interface RingOption {
  id: string
  /**
   * Which of the ring's slots this option occupies, when the caller has
   * reserved a fixed set of them. Defaults to the option's own index.
   *
   * The tower panel uses it to nail SELL down. Its position used to follow the
   * option COUNT: two options at tier 1, three at the specialisation branch,
   * and the arc's geometry is a function of how many buttons are on it — so
   * the place a thumb learned as "upgrade" over twelve waves is a place SELL
   * can arrive at. Three reserved slots and a fixed index each means the
   * geometry never changes between tiers at all.
   */
  slot?: number
  /** A name from art.json's ui.icons — what the button shows. */
  icon: string
  /**
   * A tower sprite to draw instead of the icon.
   *
   * The ten UI icons cover actions — upgrade, sell, confirm — and a build
   * option is not an action, it is a THING. "Which tower is this?" is answered
   * by the tower, and answering it with a generic hammer would make six
   * options identical.
   */
  sprite?: string
  /** Shown on the badge under the button, and again on the confirm button. */
  price: number
  /**
   * Whether it can be bought right now.
   *
   * A disabled option still OPENS. Its hit area is exactly its plate, so it
   * swallows nothing aimed elsewhere, but the tap that lands on it shows the
   * panel with the reason and the price — which is how a player finds out what
   * they are saving for. Only the confirm button is switched off.
   */
  affordable: boolean
  /** Why it cannot be bought, when it cannot. */
  reason?: string
  title: string
  /** The one phrase, from towers.json. At most 18 characters, never wrapped. */
  trait: string
  /** Two or three numbers. The third goes first when the card is narrow. */
  stats: CardStat[]
  /**
   * The WORD on the confirm button: BUILD, UPGRADE, SELL, MOVE.
   *
   * It used to be a tick glyph on every option, which meant the second press
   * — the one that actually spends or destroys — looked identical whether the
   * player was buying an upgrade or selling the tower. The panel above it did
   * name the tower and the refund; the button did not, and the button is what
   * the finger is aimed at.
   */
  confirmLabel: string
  onConfirm: () => void
}

export interface TowerRingOptions {
  options: RingOption[]
  /** The world point the ring is about, re-read every frame: the camera pans
   *  and zooms underneath a menu that is anchored in screen space. */
  anchor: () => { x: number; y: number } | null
  /** Where chrome may go — the HUD's panel area, already inset for safe area. */
  area: () => Rect
  /** Raised as the highlighted option changes, so the scene can preview a
   *  range ring or a ghost tower on the pad. */
  onPreview: (id: string | null) => void
  onClose: () => void
  /**
   * How many slots to lay out, when that is more than there are options.
   *
   * The ring reserves the space either way, so a menu that shows two buttons
   * at tier 1 and three at the branch puts both of them in the SAME places.
   * Omitted, the slot count is the option count and nothing is reserved —
   * which is what the build ring wants, where six towers are six towers.
   */
  slots?: number
  /**
   * Something did not fit and the player would otherwise be looking at clipped
   * text or a menu off the screen. Told, never swallowed.
   */
  onProblem: (why: string) => void
}

/** One ring button's live objects, so the selected state can be redrawn. */
interface ButtonParts {
  option: RingOption
  plate: ReturnType<typeof iconPlate>
  hit: Phaser.GameObjects.Rectangle
  glyph: Phaser.GameObjects.Image
  /** The padlock corner-badge, on an option that cannot be bought yet. */
  lock?: Phaser.GameObjects.Image
  price: Phaser.GameObjects.Text
}

export class TowerRing {
  readonly ringLayer: Phaser.GameObjects.Container
  readonly panelLayer: Phaser.GameObjects.Container
  private readonly leader: Phaser.GameObjects.Graphics
  private readonly scene: Phaser.Scene
  private readonly opts: TowerRingOptions
  private readonly buttons: ButtonParts[] = []
  private placement: RingPlacement | null = null
  private selected: number | null = null
  private panelSize = { w: CFG.panelWidth, h: 0 }
  private closed = false
  /** Raised once per open, so a panel that cannot fit does not report on
   *  every frame the camera moves. */
  private reported = false

  constructor(scene: Phaser.Scene, depth: number, opts: TowerRingOptions) {
    this.scene = scene
    this.opts = opts
    this.leader = scene.add.graphics().setDepth(depth - 1)
    this.ringLayer = scene.add.container(0, 0).setDepth(depth)
    this.panelLayer = scene.add.container(0, 0).setDepth(depth + 1)
    play(scene, 'open')
    this.buildRing()
    this.reposition()
    this.ringLayer.setAlpha(0)
    scene.tweens.add({ targets: this.ringLayer, alpha: 1, duration: 110 })
  }

  get active(): boolean {
    return !this.closed
  }

  /** How many positions the geometry is laid out for. See `slots`. */
  private get slotCount(): number {
    return Math.max(this.buttons.length, this.opts.slots ?? 0)
  }

  /** Where option `i` sits: its reserved slot, or its own index. */
  private slotOf(i: number): number {
    return this.buttons[i]?.option.slot ?? i
  }

  /** Everything the ring owns, for the scene's camera split. All of it is
   *  chrome and belongs to the fixed UI camera. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.leader, this.ringLayer, this.panelLayer]
  }

  /** True when this tap landed on the ring or its panel, so the world ignores
   *  it. Asked at pointerdown, before anything has been destroyed. */
  owns(objects: Phaser.GameObjects.GameObject[]): boolean {
    return objects.some((o) =>
      this.ringLayer.list?.includes(o) || this.panelLayer.list?.includes(o))
  }

  /** For tests and the harness: where every pressable thing actually is. */
  get hitBoxes(): Array<{ id: string; rect: Rect }> {
    const out: Array<{ id: string; rect: Rect }> = []
    for (const b of this.buttons) {
      const r = b.hit.getBounds()
      out.push({ id: b.option.id, rect: { x: r.x, y: r.y, width: r.width, height: r.height } })
    }
    for (const o of this.panelLayer.list) {
      const any = o as Phaser.GameObjects.Rectangle
      if (!any.input?.enabled || !any.getBounds) continue
      const r = any.getBounds()
      out.push({ id: any.name || 'panel', rect: { x: r.x, y: r.y, width: r.width, height: r.height } })
    }
    return out
  }

  // ------------------------------------------------------------------- ring

  private buildRing(): void {
    for (const [i, option] of this.opts.options.entries()) {
      const plate = iconPlate(this.scene, 0, 0, CFG.buttonSize, CFG.buttonSize)
      // An option that cannot be bought shows its OWN picture, dimmed, with a
      // padlock badge in the corner. See makeGlyph.
      const glyph = this.makeGlyph(option, CFG.iconSize)
      const lock = option.affordable ? undefined : this.makeLock()

      const price = this.scene.add.text(0, 0, String(option.price), {
        fontFamily: FONT_UI, fontSize: `${uiSize(CFG.priceSize)}px`, fontStyle: 'bold',
        color: option.affordable ? COLOR.amber : COLOR.danger,
        stroke: '#0d1016', strokeThickness: 3,
      }).setOrigin(0.5, 0)

      // THE HIT AREA IS THE PLATE, exactly. Not the plate plus its badge, not
      // a padded rectangle: a button that takes taps outside its own picture
      // is a button that steals them from the map behind it, and two of those
      // side by side leave a dead strip between them that looks like a bug.
      const hit = this.scene.add
        .rectangle(0, 0, CFG.buttonSize, CFG.buttonSize, 0xffffff, 0.001)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
      hit.name = `ring:${option.id}`
      hit.on('pointerover', () => { if (this.selected !== i) plate.setActive(true) })
      hit.on('pointerout', () => { if (this.selected !== i) plate.setActive(false) })
      // On the PRESS, not the release. A ring button opens a description; it
      // does not spend anything, so there is nothing to guard against a
      // mis-press and every reason to answer the finger immediately.
      hit.on('pointerdown', () => this.select(i))

      // Plate first, then the glyph on top of it: the container draws in the
      // order it is given, and pushing the icon first put the plate over it.
      // Plate, picture, badge, price, hit area — in draw order.
      this.ringLayer.add([...plate.parts, glyph, ...(lock ? [lock] : []), price, hit])
      this.buttons.push({ option, plate, hit, glyph, lock, price })
    }
  }

  /**
   * The picture on a button: the tower itself where there is one, the named
   * action icon otherwise — and ALWAYS that picture, dimmed, when the option
   * cannot be bought yet. The padlock is a small badge over the corner rather
   * than a replacement for it.
   *
   * This replaced the padlock outright, and the original reasoning was sound
   * for exactly one locked option: a padlock says "NOT YET" where a greyed-out
   * picture of the thing you wanted just looks broken or misdrawn. What it
   * misses is that one is not the common case. A player who is short of
   * peanuts is short for several options at once, and two padlocks side by
   * side are two identical buttons — the player cannot see what they are
   * saving up FOR, which is the only question a locked button has to answer.
   *
   * So the picture stays and carries the state instead: dimmed and cooled off,
   * which reads as unavailable, with the padlock badge saying why.
   */
  private makeGlyph(option: RingOption, size: number): Phaser.GameObjects.Image {
    const key = option.sprite && this.scene.textures.exists(option.sprite)
      ? option.sprite
      : icon(this.scene, option.icon)
    const g = this.scene.add.image(0, 0, key)
    fitInBox(g, key, size)
    if (!option.affordable) {
      g.setAlpha(CFG.lockedAlpha)
      // Tinted as well as faded: alpha alone over a dark plate reads as a
      // dim picture, and the cool grey is what says "off".
      g.setTint(CFG.lockedTint)
    }
    return g
  }

  /** The padlock badge, in the plate's bottom-right corner. */
  private makeLock(): Phaser.GameObjects.Image {
    const key = icon(this.scene, 'locked')
    const g = this.scene.add.image(0, 0, key)
    fitInBox(g, key, CFG.lockBadgeSize)
    return g
  }

  private select(index: number): void {
    if (this.closed) return
    const option = this.opts.options[index]
    if (!option) return
    play(this.scene, 'click')
    this.selected = index
    for (const [i, b] of this.buttons.entries()) b.plate.setActive(i === index)
    this.opts.onPreview(option.id)
    this.buildPanel(option)
    this.reposition()
  }

  // ------------------------------------------------------------------ panel

  /**
   * How wide the panel may be here.
   *
   * THE WIDEST THAT FITS BESIDE THE RING, down to a floor. A panel that sits
   * on top of the ring's own buttons costs a tap every time one is covered —
   * cancel back to the ring, then press it — and the screen where that bites
   * is the smallest one. Measured across the placement walk: at 844x390 a
   * 200px panel hides nothing at all, and at a notched 568x320 narrowing from
   * 226 takes the worst case from four buttons hidden to two, and the number
   * of placements hiding any from 225 of 540 to 55.
   *
   * Taken from the ring's ACTUAL position rather than from a worst case. A
   * ring centred in the strip leaves 60px either side on the smallest phone,
   * which is not a panel; a ring over a pad near one edge leaves plenty. The
   * cost of using the real position is that a long pan can bring a button back
   * under the panel, and that is the better trade — the panel is rebuilt on
   * every selection, not on every frame, and rebuilding it mid-pan would
   * flicker.
   */
  private panelWidthFor(ring: Rect, area: Rect): number {
    const gap = CFG.panelGap
    const room = Math.max(
      (area.x + area.width) - (ring.x + ring.width) - gap,
      ring.x - area.x - gap,
    )
    return Math.max(CFG.panelMinWidth, Math.min(CFG.panelWidth, Math.floor(room)))
  }

  /**
   * THE LEDGER. One card, four rows, a height that is arithmetic.
   *
   *   1. a 30x30 tower icon and the name beside it
   *   2. two or three numbers in equal columns, hairline rules between
   *   3. one trait phrase, above a hairline
   *   4. a wide primary button and a square cancel beside it
   *
   * WHAT IS GONE, AND WHY THE LADDER WENT WITH IT. The card carried a
   * paragraph of prose, and to make the paragraph fit there were four levers:
   * shrink the body font, then the row height, then the title, then give up
   * and drop the prose. Every one of them existed to protect a sentence that
   * answered nothing the numbers did not, and between them they made the
   * panel's height depend on how long a tower's description happened to be.
   *
   * With no prose there is nothing to search for. `cardHeight()` returns the
   * height, the same for every tower, and the only thing that varies with the
   * width is whether the third number fits.
   */
  private buildPanel(option: RingOption): void {
    this.panelLayer.removeAll(true)
    const area = this.opts.area()
    // The ring's own geometry first: it does not depend on the panel, so
    // asking for it here is not circular, and the panel's width does depend on
    // where the ring ended up.
    const anchor = this.opts.anchor()
    const ring = anchor
      ? ringPlacement(anchor.x, anchor.y, this.slotCount, CFG, area).bounds
      : { x: area.x, y: area.y, width: 0, height: 0 }
    const W = this.panelWidthFor(ring, area)

    const built = this.composeCard(option, W)
    this.panelSize = { w: W, h: built.height }

    // It cannot fail to fit any more — the height is fixed — but a viewport
    // shorter than one card is still worth saying out loud rather than
    // clipping, because the thing clipped would be the button.
    if (built.height > area.height) {
      this.reportOnce(
        `${option.title}: the card is ${built.height | 0}px and there are only `
        + `${area.height | 0}px to put it in.`)
    }
    this.ledgerSlab(W, built.height)
    this.panelLayer.add(built.parts)
    this.panelLayer.setAlpha(0)
    this.scene.tweens.add({ targets: this.panelLayer, alpha: 1, duration: 100 })
  }

  /**
   * The slab: a plain dark rounded rectangle, a hairline inside it, a soft
   * shadow under it. No bevel, no metal, no rivets, no corner plates, no
   * gradient, no glow.
   *
   * Drawn rather than nine-sliced from `ui.panel`, which is the bevelled plate
   * this replaces. The shadow is three rounded rectangles at falling alpha
   * rather than a blur, because a Graphics object cannot blur and three passes
   * read as soft at this size.
   */
  private ledgerSlab(w: number, h: number): void {
    const L = CFG.ledger
    const g = this.scene.add.graphics()
    for (let i = L.shadowSteps; i >= 1; i--) {
      const spread = (i / L.shadowSteps) * L.shadowSpread
      g.fillStyle(0x000000, L.shadowAlpha / L.shadowSteps)
      g.fillRoundedRect(
        -spread, -spread + L.shadowDrop, w + spread * 2, h + spread * 2, L.radius + spread)
    }
    g.fillStyle(L.slab, L.slabAlpha)
    g.fillRoundedRect(0, 0, w, h, L.radius)
    // INSIDE the edge, not on it: a stroke centred on the boundary is half
    // outside the slab and reads as a light halo against the map.
    g.lineStyle(1, 0xffffff, L.hairlineAlpha)
    g.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, L.radius - 0.5)
    this.panelLayer.add(g)
  }

  /** A hairline. One place, so every rule on the card is the same rule. */
  private hairline(x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics()
    g.fillStyle(0xffffff, CFG.ledger.ruleAlpha)
    g.fillRect(x, y, Math.max(1, w), Math.max(1, h))
    return g
  }

  /**
   * The card's height, in advance and without drawing anything.
   *
   * Every term is a constant. That is the whole point of the redesign: the old
   * panel could only find its height by composing itself, measuring, throwing
   * the result away and composing again at a smaller size.
   */
  private cardHeight(): number {
    const L = CFG.ledger
    return L.pad + L.headerHeight + L.gap + L.statHeight + L.gap
      + L.traitHeight + L.gap + L.buttonHeight + L.pad
  }

  private composeCard(
    option: RingOption, W: number,
  ): { parts: Phaser.GameObjects.GameObject[]; height: number } {
    const parts: Phaser.GameObjects.GameObject[] = []
    const s = this.scene
    const L = CFG.ledger
    const inner = W - L.pad * 2
    let y = L.pad

    /* 1. header ---------------------------------------------------------- */

    const badge = this.makeGlyph(option, L.iconSize)
    badge.setPosition(L.pad + L.iconSize / 2, y + L.headerHeight / 2)
    parts.push(badge)
    const nameX = L.pad + L.iconSize + L.iconGap
    const name = s.add.text(nameX, y + L.headerHeight / 2, option.title, {
      fontFamily: FONT_UI, fontSize: `${uiSize(L.nameSize)}px`, fontStyle: 'bold',
      color: COLOR.amber, letterSpacing: 0.5,
    }).setOrigin(0, 0.5)
    // Shrink rather than wrap. Every name is inside the 12-character schema
    // limit, so this only ever fires on the narrowest card, and one line is
    // the contract the whole card is built on.
    shrinkToFit(name, W - L.pad - nameX, L.nameMinSize)
    parts.push(name)
    y += L.headerHeight + L.gap

    /* 2. the numbers ----------------------------------------------------- */

    const stats = statsThatFit(option.stats, inner, L.minStatWidth)
    const colW = inner / Math.max(1, stats.length)
    for (const [i, stat] of stats.entries()) {
      const cx = L.pad + colW * i + colW / 2
      // The value, and — on an upgrade — what it becomes. Two texts rather
      // than one string, because they are different colours and the point is
      // that the eye separates them.
      const vy = y + L.statValueY
      if (stat.next) {
        const from = s.add.text(0, vy, stat.value, {
          fontFamily: FONT_UI, fontSize: `${uiSize(L.statChangedSize)}px`, color: COLOR.dim,
        }).setOrigin(0, 0.5)
        const arrow = s.add.text(0, vy, ' ', {
          fontFamily: FONT_UI, fontSize: `${uiSize(L.statChangedSize)}px`, color: COLOR.dim,
        }).setOrigin(0, 0.5)
        const to = s.add.text(0, vy, stat.next, {
          fontFamily: FONT_UI, fontSize: `${uiSize(L.statChangedSize)}px`, fontStyle: 'bold',
          color: COLOR.good,
        }).setOrigin(0, 0.5)
        const total = from.width + arrow.width + to.width
        let x = cx - total / 2
        from.setX(x); x += from.width
        arrow.setX(x); x += arrow.width
        to.setX(x)
        parts.push(from, arrow, to)
      } else {
        parts.push(s.add.text(cx, vy, stat.value, {
          fontFamily: FONT_UI, fontSize: `${uiSize(L.statValueSize)}px`, fontStyle: 'bold',
          color: COLOR.ink,
        }).setOrigin(0.5))
      }
      parts.push(s.add.text(cx, y + L.statLabelY, stat.label, {
        fontFamily: FONT_UI, fontSize: `${uiSize(L.statLabelSize)}px`, color: COLOR.dim,
        letterSpacing: 0.5,
      }).setOrigin(0.5))
      // A hairline BETWEEN columns, so the last one has no rule after it.
      if (i > 0) {
        parts.push(this.hairline(
          L.pad + colW * i, y + L.ruleInset, 1, L.statHeight - L.ruleInset * 2))
      }
    }
    y += L.statHeight + L.gap

    /* 3. the trait phrase, or the reason it cannot be bought -------------- */

    // ONE LINE, ALWAYS. Every trait is inside the 18-character schema limit
    // and cannot wrap. A REASON is not schema-checked — it is composed by the
    // scene from a shortfall — so it is shrunk to fit, and it takes the trait's
    // slot rather than adding a row: the card's shape does not change because
    // the player cannot afford something.
    const blocked = !option.affordable && option.reason
    const trait = s.add.text(L.pad, y + L.traitHeight / 2, blocked ? option.reason! : option.trait, {
      fontFamily: FONT_UI, fontSize: `${uiSize(L.traitSize)}px`,
      color: blocked ? COLOR.danger : COLOR.good,
    }).setOrigin(0, 0.5)
    shrinkToFit(trait, inner, L.traitMinSize)
    parts.push(trait)
    y += L.traitHeight
    parts.push(this.hairline(L.pad, y, inner, 1))
    y += L.gap

    /* 4. the actions ----------------------------------------------------- */

    const bh = L.buttonHeight
    const cancelW = bh
    const primaryW = inner - cancelW - L.buttonGap

    // THE VERB AND THE PRICE ARE ONE CONTROL. There is no cost row any more:
    // "Build 80p" and "Sell +45p" are what the button says, which also settles
    // the older confusion where SELL's confirm and UPGRADE's confirm were the
    // same tick glyph.
    const green = this.scene.add.graphics()
    const tint = option.affordable ? L.primary : L.primaryOff
    green.fillStyle(tint, 1)
    green.fillRoundedRect(L.pad, y, primaryW, bh, L.buttonRadius)
    // A darker bottom edge rather than a bevel: one band, no highlight.
    green.fillStyle(option.affordable ? L.primaryEdge : L.primaryOffEdge, 1)
    green.fillRoundedRect(L.pad, y + bh - L.buttonEdge, primaryW, L.buttonEdge, L.buttonRadius)
    green.fillRect(L.pad, y + bh - L.buttonEdge, primaryW, 1)
    parts.push(green)

    const label = s.add.text(L.pad + primaryW / 2, y + (bh - L.buttonEdge) / 2,
      buttonLabel(option.confirmLabel, option.price, option.id === 'sell'), {
        fontFamily: FONT_UI, fontSize: `${uiSize(L.buttonSize)}px`, fontStyle: 'bold',
        color: option.affordable ? L.primaryText : COLOR.dim, letterSpacing: 0.5,
      }).setOrigin(0.5)
    shrinkToFit(label, primaryW - 10, L.buttonMinSize)
    parts.push(label)

    const buy = s.add.rectangle(L.pad + primaryW / 2, y + bh / 2, primaryW, bh, 0xffffff, 0.001)
      .setOrigin(0.5).setInteractive({ useHandCursor: option.affordable })
    buy.name = 'ring:confirm'
    // Release, not press: this one spends, so a finger that lands on it and
    // slides off must be able to take the decision back.
    buy.on('pointerup', () => {
      if (option.affordable) { option.onConfirm(); this.close() }
    })
    parts.push(buy)

    // The cancel is a WASH, not a red plate: it undoes nothing and destroys
    // nothing, and a danger colour on it made backing out look like an action.
    const cx = L.pad + primaryW + L.buttonGap
    const wash = this.scene.add.graphics()
    wash.fillStyle(0xffffff, L.cancelAlpha)
    wash.fillRoundedRect(cx, y, cancelW, bh, L.buttonRadius)
    wash.lineStyle(1, 0xffffff, L.hairlineAlpha)
    wash.strokeRoundedRect(cx + 0.5, y + 0.5, cancelW - 1, bh - 1, L.buttonRadius - 0.5)
    parts.push(wash)
    const key = icon(s, 'cancel')
    const glyph = s.add.image(cx + cancelW / 2, y + bh / 2, key)
    fitInBox(glyph, key, bh - L.cancelInset * 2)
    parts.push(glyph)
    const back = s.add.rectangle(cx + cancelW / 2, y + bh / 2, cancelW, bh, 0xffffff, 0.001)
      .setOrigin(0.5).setInteractive({ useHandCursor: true })
    back.name = 'ring:cancel'
    back.on('pointerup', () => this.deselect())
    parts.push(back)

    return { parts, height: this.cardHeight() }
  }

  /** Back to the ring with nothing spent. */
  private deselect(): void {
    play(this.scene, 'close')
    this.selected = null
    for (const b of this.buttons) b.plate.setActive(false)
    this.panelLayer.removeAll(true)
    this.panelSize = { w: CFG.panelWidth, h: 0 }
    this.opts.onPreview(null)
    this.reposition()
  }

  private reportOnce(why: string): void {
    if (this.reported) return
    this.reported = true
    this.opts.onProblem(why)
  }

  // ------------------------------------------------------------- positioning

  /**
   * Puts the ring back over its tower, every frame.
   *
   * The world camera pans and zooms under a menu anchored in screen space, so
   * a position taken once drifts off the thing it is about the moment the
   * player moves the board.
   */
  reposition(): void {
    if (this.closed) return
    const anchor = this.opts.anchor()
    if (!anchor) { this.close(); return }
    const area = this.opts.area()

    // AN ANCHOR OFF THE USABLE AREA IS ALWAYS A CALLER BUG, and this is where
    // it shows. The ring is clamped inside the area whatever it is handed, so
    // a bad anchor does not crash or draw off screen — it produces a tidy,
    // on-screen ring nowhere near the pad that opened it, and every geometric
    // check still passes. That is exactly what happened: the anchor was
    // computed in canvas pixels and compared against an area in CSS pixels, so
    // at devicePixelRatio 3 it came out three times too large, landed far
    // outside the area, and the ring sat 401px from its pad for anyone on a
    // retina phone. It took a video to notice.
    //
    // Said once, loudly, rather than silently absorbed. `worldToScreen` is the
    // fix; this is the tripwire for the next one.
    if (anchor.x < area.x - 1 || anchor.x > area.x + area.width + 1
      || anchor.y < area.y - 1 || anchor.y > area.y + area.height + 1) {
      this.reportOnce('The tower menu opened away from its pad.')
      console.error('[ring] anchor', anchor, 'is outside the usable area', area)
    }

    // Both together: the ring and the panel constrain each other. The panel is
    // what moves; see fitRingAndPanel.
    const { ring: p, panel: at } = fitRingAndPanel(
      anchor.x, anchor.y, this.slotCount, this.panelSize.w,
      Math.max(1, this.panelSize.h), CFG, area)
    this.placement = p
    if (p.overflowed) {
      this.reportOnce('The tower menu does not fit on this screen.')
    }

    const drop = (CFG.priceGap + CFG.priceHeight) / 2
    for (const [i, b] of this.buttons.entries()) {
      const at = p.buttons[this.slotOf(i)]
      if (!at) continue
      b.plate.parts.forEach((o) => (o as Phaser.GameObjects.Image).setPosition(at.x, at.y))
      b.glyph.setPosition(at.x, at.y)
      // The badge overlaps the plate's corner rather than sitting inside it,
      // so it never eats into the picture it is annotating.
      if (b.lock) {
        const off = CFG.buttonSize / 2 - CFG.lockBadgeSize / 4
        b.lock.setPosition(at.x + off, at.y + off)
      }
      b.price.setPosition(at.x, at.y + CFG.buttonSize / 2 + CFG.priceGap)
      b.hit.setPosition(at.x, at.y)
      void drop
    }

    if (this.selected !== null && this.panelSize.h > 0) {
      this.panelLayer.setPosition(at.x, at.y)
      // Overlapping the ring's own buttons is allowed and common on a small
      // screen. Covering the pad the panel is ABOUT is not — and across all
      // 7,560 placements it never happens, because a side that would cover the
      // anchor is disqualified outright. This stays as the tripwire for a
      // screen shape nobody has measured yet.
      if (at.coversAnchor) {
        this.reportOnce('The tower menu and its description cannot both fit on this screen.')
      }
    }

    // A leader back to the tower, but only when the ring had to move off it.
    // Drawn from the ring's centre, so it reads as "this menu belongs to that"
    // rather than as a stray line.
    this.leader.clear()
    if (p.shiftX !== 0 || p.shiftY !== 0) {
      this.leader.lineStyle(2, 0xf2d06b, 0.6)
      this.leader.lineBetween(p.cx, p.cy, anchor.x, anchor.y)
    }
  }

  /** Where the ring ended up, for the harness and the tests. */
  get bounds(): Rect | null {
    return this.placement?.bounds ?? null
  }

  get panelBounds(): Rect | null {
    if (this.selected === null || this.panelSize.h <= 0) return null
    return {
      x: this.panelLayer.x, y: this.panelLayer.y,
      width: this.panelSize.w, height: this.panelSize.h,
    }
  }

  /** True when everything the ring draws is inside the area it was given. */
  fitsInside(area: Rect): boolean {
    if (!this.placement) return false
    if (!contains(area, this.placement.bounds)) return false
    const pb = this.panelBounds
    return pb === null || contains(area, pb)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    play(this.scene, 'close')
    this.opts.onPreview(null)
    this.leader.destroy()
    this.panelLayer.destroy(true)
    const ring = this.ringLayer
    this.scene.tweens.add({
      targets: ring, alpha: 0, duration: 90,
      onComplete: () => ring.destroy(true),
    })
    this.opts.onClose()
  }
}
