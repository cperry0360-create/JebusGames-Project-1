import Phaser from 'phaser'
import presentationData from '../data/presentation.json'
import { COLOR, FONT_UI, uiSize } from './Theme.ts'
import { iconPlate, platePanel } from './Plate.ts'
import { fitInBox, icon } from '../systems/Art.ts'
import { play } from '../systems/Audio.ts'
import {
  type Rect, type RingPlacement, contains, fitRingAndPanel, ringPlacement,
} from '../systems/RingLayout.ts'

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

export interface RingRow {
  label: string
  value: string
  /** A name from art.json's ui.icons. */
  icon?: string
  accent?: boolean
}

export interface RingOption {
  id: string
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
  description: string
  rows: RingRow[]
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

  private buildPanel(option: RingOption): void {
    this.panelLayer.removeAll(true)
    const area = this.opts.area()
    // The ring's own geometry first: it does not depend on the panel, so
    // asking for it here is not circular, and the panel's width does depend on
    // where the ring ended up.
    const anchor = this.opts.anchor()
    const ring = anchor
      ? ringPlacement(anchor.x, anchor.y, this.buttons.length, CFG, area).bounds
      : { x: area.x, y: area.y, width: 0, height: 0 }
    const W = this.panelWidthFor(ring, area)
    const maxH = Math.max(120, area.height * CFG.panelMaxHeightFraction)

    // Composed at the full size first, then shrunk only if it does not fit.
    // Shrinking first would make every panel small because one tower has a
    // long description.
    let body = CFG.bodySize
    let built = this.composePanel(option, W, body)
    while (built.height > maxH && body > CFG.bodyMinSize) {
      built.parts.forEach((p) => p.destroy())
      body -= 1
      built = this.composePanel(option, W, body)
    }
    // A tower with five stat rows spends more height on rows than on prose, so
    // the description font alone is not enough of a lever. The rows tighten
    // with it, to their own floor.
    let rowH = CFG.rowHeight
    while (built.height > maxH && rowH > CFG.rowMinHeight) {
      built.parts.forEach((p) => p.destroy())
      rowH -= 1
      built = this.composePanel(option, W, body, rowH)
    }
    // And the title last. It is the thing a player reads first, so it gives
    // way last — but "WITHHOLDING TOWER" wraps to two lines in a 171px column
    // and two lines of title is 40px of a 238px budget.
    let titleSize = CFG.titleSize
    while (built.height > maxH && titleSize > CFG.titleMinSize) {
      built.parts.forEach((p) => p.destroy())
      titleSize -= 1
      built = this.composePanel(option, W, body, rowH, titleSize)
    }
    // LAST OF ALL, THE PROSE GOES. A narrow panel wraps the description into a
    // column of three-word lines, and at that point it is costing more height
    // than it is worth: the stat rows carry the numbers, the title carries the
    // name, and the price carries the decision. The flavour is the only part
    // that can be dropped without losing an answer the player needs.
    if (built.height > maxH) {
      built.parts.forEach((p) => p.destroy())
      built = this.composePanel(option, W, body, rowH, titleSize, false)
    }

    // THE HEIGHT RECORDED IS THE HEIGHT DRAWN. Clamping it to `maxH` here was
    // a lie the placement believed: the panel was composed at its full height
    // and then told the geometry it was 15px shorter, so the clamp put it 15px
    // too low and the confirm and cancel buttons hung off the bottom of the
    // screen. The browser run caught it; the arithmetic could not, because the
    // arithmetic was given the wrong number.
    this.panelSize = { w: W, h: built.height }

    // Still too tall for the space at the smallest body size. TELL THE PLAYER
    // rather than clipping: a panel with its bottom cut off looks like a
    // rendering fault, and the thing it hides is usually the price.
    if (built.height > area.height) {
      this.reportOnce(
        `${option.title}: the description will not fit in ${area.height | 0}px`
        + ' even at the smallest size.')
    }
    this.panelLayer.add(platePanel(this.scene, 0, 0, W, this.panelSize.h, 0.17))
    this.panelLayer.add(built.parts)
    this.panelLayer.setAlpha(0)
    this.scene.tweens.add({ targets: this.panelLayer, alpha: 1, duration: 100 })
  }

  /**
   * Lays the panel's contents out at a given body size and reports how tall
   * they came to. Built off-container so a rejected size can be thrown away
   * without ever being drawn.
   */
  private composePanel(
    option: RingOption,
    W: number,
    bodySize: number,
    rowH: number = CFG.rowHeight,
    titleSize: number = CFG.titleSize,
    withDescription = true,
  ): { parts: Phaser.GameObjects.GameObject[]; height: number } {
    const parts: Phaser.GameObjects.GameObject[] = []
    const s = this.scene
    const inner = W - CFG.pad * 2
    let y = CFG.pad

    // The badge on the left, the title BESIDE it. Centring the title across
    // the whole panel width put "SELL WITHHOLDING TOWER" straight under the
    // badge and lost its first letter.
    const badge = this.makeGlyph(option, CFG.headerIconSize)
    badge.setPosition(CFG.pad + CFG.headerIconSize / 2, y + CFG.headerIconSize / 2)
    parts.push(badge)

    const titleX = CFG.pad + CFG.headerIconSize + 7
    const title = s.add.text(titleX, y, option.title.toUpperCase(), {
      fontFamily: FONT_UI, fontSize: `${uiSize(titleSize)}px`, fontStyle: 'bold',
      color: COLOR.ink, letterSpacing: 1,
      wordWrap: { width: W - CFG.pad - titleX },
    }).setOrigin(0, 0)
    parts.push(title)
    y += Math.max(title.height, CFG.headerIconSize) + 5

    if (withDescription) {
      const desc = s.add.text(CFG.pad, y, option.description, {
        fontFamily: FONT_UI, fontSize: `${uiSize(bodySize)}px`, color: COLOR.dim,
        wordWrap: { width: inner }, lineSpacing: 2,
      }).setOrigin(0, 0)
      parts.push(desc)
      y += desc.height + 6
    }

    const rows: RingRow[] = [...option.rows, {
      label: option.price >= 0 && option.id === 'sell' ? 'Returns' : 'Cost',
      value: `${option.price}p`,
      accent: true,
    }]
    for (const row of rows) {
      let textX = CFG.pad
      if (row.icon) {
        const key = icon(s, row.icon)
        const glyph = s.add.image(CFG.pad + rowH / 2, y + rowH / 2 - 1, key)
        fitInBox(glyph, key, rowH - 2)
        parts.push(glyph)
        textX = CFG.pad + rowH + 5
      }
      parts.push(s.add.text(textX, y, row.label, {
        fontFamily: FONT_UI, fontSize: `${uiSize(CFG.rowSize)}px`, color: COLOR.dim,
      }).setOrigin(0, 0))
      parts.push(s.add.text(W - CFG.pad, y, row.value, {
        fontFamily: FONT_UI, fontSize: `${uiSize(CFG.rowSize)}px`, fontStyle: 'bold',
        color: row.accent ? COLOR.amber : COLOR.ink,
      }).setOrigin(1, 0))
      y += rowH
    }

    if (!option.affordable && option.reason) {
      const why = s.add.text(CFG.pad, y + 3, option.reason, {
        fontFamily: FONT_UI, fontSize: `${uiSize(bodySize)}px`, color: COLOR.danger,
        wordWrap: { width: inner },
      }).setOrigin(0, 0)
      parts.push(why)
      y += why.height + 3
    }

    // THE SECOND, EXPLICIT PRESS. Two buttons, side by side: confirm carries
    // the price, cancel goes back to the ring. This is the whole reason a ring
    // button does not buy anything — a menu where the first tap spends peanuts
    // is a menu you cannot browse.
    y += 7
    const bw = (inner - 8) / 2
    const bh = CFG.confirmHeight
    const mk = (
      cx: number, iconName: string, enabled: boolean, onPick: () => void, tag: string,
    ): void => {
      const plate = iconPlate(s, cx, y + bh / 2, bw, bh)
      const key = icon(s, enabled ? iconName : 'locked')
      const glyph = s.add.image(cx, y + bh / 2, key)
      // The floor, but never taller than the plate it stands on.
      fitInBox(glyph, key, Math.min(CFG.iconSize, bh - 4))
      if (!enabled) glyph.setAlpha(0.7)
      const hit = s.add.rectangle(cx, y + bh / 2, bw, bh, 0xffffff, 0.001)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: enabled })
      hit.name = tag
      hit.on('pointerover', () => plate.setActive(true))
      hit.on('pointerout', () => plate.setActive(false))
      // Release, not press: this one spends, so a finger that lands on it and
      // slides off must be able to take the decision back.
      hit.on('pointerup', onPick)
      parts.push(...plate.parts, glyph, hit)
    }
    mk(CFG.pad + bw / 2, 'confirm', option.affordable,
      () => { if (option.affordable) { option.onConfirm(); this.close() } }, 'ring:confirm')
    mk(CFG.pad + bw + 8 + bw / 2, 'cancel', true, () => this.deselect(), 'ring:cancel')
    y += bh

    return { parts, height: y + CFG.pad }
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
      anchor.x, anchor.y, this.buttons.length, this.panelSize.w,
      Math.max(1, this.panelSize.h), CFG, area)
    this.placement = p
    if (p.overflowed) {
      this.reportOnce('The tower menu does not fit on this screen.')
    }

    const drop = (CFG.priceGap + CFG.priceHeight) / 2
    for (const [i, b] of this.buttons.entries()) {
      const at = p.buttons[i]
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
