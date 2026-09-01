import Phaser from 'phaser'
import { platePanel, plateButton, type PlateButton } from './Plate.ts'
import { COLOR, FONT_UI } from './Theme.ts'
import type { Rect } from '../systems/HudLayout.ts'
import { play } from '../systems/Audio.ts'
import { fitInBox, icon } from '../systems/Art.ts'

/**
 * The panel a built tower opens, anchored beside the tower.
 *
 * It replaces a centred modal dialog, and the reason is PROTOTYPE-GAP item 11:
 * the panel asking "should I upgrade this?" was covering the range ring, which
 * is the information needed to answer. A dimmed screen with a box in the
 * middle of it hides the board, the lane and the tower being decided about.
 *
 * So: no dim, no blocker, no centring. It sits under the tower it belongs to,
 * flips above when it would run into the controls, and stays inside the part
 * of the screen the HUD leaves free. A tap anywhere else closes it and does
 * whatever that tap would normally have done.
 */

export interface PanelRow {
  label: string
  value: string
  /** A name from art.json's ui.icons, drawn to the left of the label. */
  icon?: string
  accent?: boolean
}

/** Where the tower is, on the glass. */
export interface PanelAnchor {
  x: number
  /** The tower's feet. */
  base: number
  /** The top of its art, so a flip clears the whole thing. */
  top: number
  halfWidth: number
}

export interface TowerPanelOptions {
  title: string
  subtitle?: string
  rows: PanelRow[]
  /** The action buttons carry an ICON and a PRICE, never a label. A word on a
   *  38px button was truncated on the narrow panel long before the icons
   *  arrived; the price is the only text, and it sits under the button. */
  confirm?: { icon: string; price: number; onPick: () => void; enabled?: boolean }
  extra?: { icon: string; price: number; onPick: () => void }
  /** Raised while the upgrade button is hovered or held, so the caller can
   *  emphasise the projected range ring. */
  onPreview?: (on: boolean) => void
  onClose: () => void
}

const WIDTH = 250
const PAD = 12
const ROW_H = 19
const BTN_H = 38
/**
 * The icon size on the button, in panel units — which are CSS pixels, so this
 * is 40 screen pixels and stays 40 at every device scale: the panel is drawn
 * by the UI camera, which carries the device ratio in its zoom rather than in
 * these numbers.
 *
 * Forty is a floor, not a preference. Below it the 256px source is being
 * minified past 6x and the outlines break up, which is the same failure the
 * cast had before rule 7 was restated.
 */
const BTN_ICON = 40
/** The stat-row icons, which sit beside 15px text rather than on a button. */
const ROW_ICON = 17
const PRICE_GAP = 3
const PRICE_SIZE = 15
const PRICE_H = 18
/** How far below the tower's base the panel sits, and how far above its head
 *  when it has to flip. */
const GAP = 12

export class TowerPanel {
  readonly layer: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly height: number
  private readonly leader: Phaser.GameObjects.Graphics
  private readonly buttons: PlateButton[] = []
  private closed = false
  private onClose: () => void

  constructor(scene: Phaser.Scene, depth: number, opts: TowerPanelOptions) {
    this.scene = scene
    this.onClose = opts.onClose
    this.leader = scene.add.graphics().setDepth(depth - 1)
    this.layer = scene.add.container(0, 0).setDepth(depth)
    play(scene, 'open')

    const parts: Phaser.GameObjects.GameObject[] = []
    let y = PAD + 4

    const title = scene.add.text(WIDTH / 2, y, opts.title, {
      fontFamily: FONT_UI, fontSize: '16px', fontStyle: 'bold',
      color: COLOR.ink, letterSpacing: 1,
      align: 'center', wordWrap: { width: WIDTH - PAD * 2 },
    }).setOrigin(0.5, 0)
    y += title.height + 2

    // The tier, and what a neighbouring Shelter is adding. A line rather than
    // a row: it is context, not a number being compared.
    let subtitle: Phaser.GameObjects.Text | undefined
    if (opts.subtitle) {
      subtitle = scene.add.text(WIDTH / 2, y, opts.subtitle, {
        fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
        align: 'center', wordWrap: { width: WIDTH - PAD * 2 },
      }).setOrigin(0.5, 0)
      y += subtitle.height
    }
    y += 8

    // Icon left, label beside it, value right, against the panel's inner face.
    const rowParts: Phaser.GameObjects.GameObject[] = []
    for (const row of opts.rows) {
      let textX = PAD + 4
      if (row.icon) {
        const key = icon(scene, row.icon)
        const glyph = scene.add.image(PAD + 4 + ROW_ICON / 2, y + ROW_H / 2 - 2, key)
        fitInBox(glyph, key, ROW_ICON)
        rowParts.push(glyph)
        textX = PAD + 4 + ROW_ICON + 6
      }
      rowParts.push(scene.add.text(textX, y, row.label, {
        fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
      }).setOrigin(0, 0))
      rowParts.push(scene.add.text(WIDTH - PAD - 4, y, row.value, {
        fontFamily: FONT_UI, fontSize: '15px', fontStyle: 'bold',
        color: row.accent ? COLOR.amber : COLOR.ink,
      }).setOrigin(1, 0))
      y += ROW_H
    }

    const row: Array<{
      icon: string; price: number; onPick: () => void; enabled?: boolean; primary: boolean
    }> = []
    if (opts.confirm) row.push({ ...opts.confirm, primary: true })
    if (opts.extra) row.push({ ...opts.extra, primary: false })

    const btnY = y + 10 + BTN_H / 2
    // Room under the button for the price. It goes BENEATH rather than on the
    // face: an icon and a number sharing a 38px plate leaves too little of
    // either, and the icon is what the player aims at.
    this.height = btnY + BTN_H / 2 + PRICE_GAP + PRICE_H + PAD

    // Plate first, then everything on top of it: the container draws in the
    // order it is given.
    parts.push(...platePanel(scene, 0, 0, WIDTH, this.height, 0.17))
    parts.push(title)
    if (subtitle) parts.push(subtitle)
    parts.push(...rowParts)

    const gap = 10
    const bw = row.length > 0 ? (WIDTH - PAD * 2 - gap * (row.length - 1)) / row.length : 0
    row.forEach((b, i) => {
      const bx = PAD + bw / 2 + i * (bw + gap)
      // No text on the plate at all. plateButton still owns the plate, the
      // enabled/disabled art and the hit area; the label is empty and the icon
      // is drawn over it.
      const btn = plateButton(scene, bx, btnY, bw, BTN_H, '',
        () => { b.onPick(); this.close() }, 14, b.primary ? 'primary' : 'secondary')
      if (b.enabled === false) btn.setEnabled(false)

      // Hovering or holding the upgrade button emphasises the projected ring.
      if (b.primary && opts.onPreview) {
        btn.hit.on('pointerover', () => opts.onPreview?.(true))
        btn.hit.on('pointerout', () => opts.onPreview?.(false))
        btn.hit.on('pointerdown', () => opts.onPreview?.(true))
      }
      this.buttons.push(btn)
      // The PLATE FIRST, then the icon on top of it. The container draws in
      // the order it is given, and pushing the glyph before the button put the
      // plate over it: the measurements said a 40px icon was in the right
      // place and the screen showed two empty coloured bars.
      parts.push(...btn.parts)

      // A button the player cannot afford says so with the padlock rather than
      // by being a greyed-out picture of the thing they wanted.
      const name = b.enabled === false ? 'locked' : b.icon
      const key = icon(scene, name)
      const glyph = scene.add.image(bx, btnY, key)
      fitInBox(glyph, key, BTN_ICON)
      if (b.enabled === false) glyph.setAlpha(0.75)
      parts.push(glyph)

      // Beneath the plate, never on it.
      const price = scene.add.text(bx, btnY + BTN_H / 2 + PRICE_GAP, String(b.price), {
        fontFamily: FONT_UI, fontSize: `${PRICE_SIZE}px`, fontStyle: 'bold',
        color: b.enabled === false ? COLOR.danger : COLOR.amber,
        stroke: '#0d1016', strokeThickness: 3,
      }).setOrigin(0.5, 0)
      parts.push(price)
    })

    this.layer.add(parts)
    this.layer.setAlpha(0)
    scene.tweens.add({ targets: this.layer, alpha: 1, duration: 120 })
  }

  get active(): boolean {
    return !this.closed
  }

  /** The panel and its leader line, for a scene that renders screen space on
   *  its own camera. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.leader, this.layer]
  }

  /** True when this tap landed on the panel, so the world ignores it. */
  owns(objects: Phaser.GameObjects.GameObject[]): boolean {
    return objects.some((o) => this.layer.list?.includes(o))
  }

  /**
   * Puts the panel beside the tower, in screen coordinates.
   *
   * Below, then above, then off to one side. The third case is not a
   * fallback nobody hits: a phone in landscape leaves about 218px between the
   * counters and the ability bar, and a tower stands 150px tall on the glass,
   * so there are plenty of positions where neither below nor above can clear
   * it. Going sideways keeps both the tower and most of its range ring — the
   * thing this panel exists to let the player look at — uncovered.
   */
  moveTo(anchor: PanelAnchor, area: Rect): void {
    if (this.closed) return
    const areaBottom = area.y + area.height
    const areaRight = area.x + area.width

    let top: number
    let left = anchor.x - WIDTH / 2

    if (anchor.base + GAP + this.height <= areaBottom) {
      top = anchor.base + GAP
    } else if (anchor.top - GAP - this.height >= area.y) {
      top = anchor.top - GAP - this.height
    } else {
      // Beside it: level with the tower, and clear of its silhouette.
      top = anchor.base - this.height / 2
      const toTheRight = anchor.x + anchor.halfWidth + GAP
      left = toTheRight + WIDTH <= areaRight
        ? toTheRight
        : anchor.x - anchor.halfWidth - GAP - WIDTH
    }

    top = Phaser.Math.Clamp(top, area.y, Math.max(area.y, areaBottom - this.height))
    left = Phaser.Math.Clamp(left, area.x, Math.max(area.x, areaRight - WIDTH))
    this.layer.setPosition(left, top)

    // A thin line back to the tower, so a panel pushed aside still says which
    // one it belongs to.
    this.leader.clear()
    const fromX = Phaser.Math.Clamp(anchor.x, left + 14, left + WIDTH - 14)
    const fromY = Phaser.Math.Clamp(anchor.base, top + 14, top + this.height - 14)
    this.leader.lineStyle(2, 0xf2d06b, 0.7)
    this.leader.lineBetween(fromX, fromY, anchor.x, anchor.base)
  }

  /** True when the panel is covering the point it is about. */
  coversAnchor(anchor: PanelAnchor): boolean {
    const b = this.layer.getBounds()
    return b.contains(anchor.x, anchor.base)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    play(this.scene, 'close')
    this.onClose()
    this.leader.destroy()
    this.scene.tweens.add({
      targets: this.layer, alpha: 0, duration: 110,
      onComplete: () => this.layer.destroy(true),
    })
  }
}
