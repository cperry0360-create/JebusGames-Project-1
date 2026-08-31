import Phaser from 'phaser'
import { platePanel, plateButton, type PlateButton } from './Plate.ts'
import { COLOR, FONT_UI } from './Theme.ts'
import type { Rect } from '../systems/HudLayout.ts'
import { play } from '../systems/Audio.ts'

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
  confirm?: { label: string; onPick: () => void; enabled?: boolean }
  extra?: { label: string; onPick: () => void }
  /** Raised while the upgrade button is hovered or held, so the caller can
   *  emphasise the projected range ring. */
  onPreview?: (on: boolean) => void
  onClose: () => void
}

const WIDTH = 250
const PAD = 12
const ROW_H = 19
const BTN_H = 38
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

    // Label left, value right, against the panel's inner face.
    const rowParts: Phaser.GameObjects.GameObject[] = []
    for (const row of opts.rows) {
      rowParts.push(scene.add.text(PAD + 4, y, row.label, {
        fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
      }).setOrigin(0, 0))
      rowParts.push(scene.add.text(WIDTH - PAD - 4, y, row.value, {
        fontFamily: FONT_UI, fontSize: '15px', fontStyle: 'bold',
        color: row.accent ? COLOR.amber : COLOR.ink,
      }).setOrigin(1, 0))
      y += ROW_H
    }

    const row: Array<{ label: string; onPick: () => void; enabled?: boolean; primary: boolean }> = []
    if (opts.confirm) row.push({ ...opts.confirm, primary: true })
    if (opts.extra) row.push({ ...opts.extra, primary: false })

    const btnY = y + 10 + BTN_H / 2
    this.height = btnY + BTN_H / 2 + PAD

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
      const btn = plateButton(scene, bx, btnY, bw, BTN_H, b.label,
        () => { b.onPick(); this.close() }, 14, b.primary ? 'primary' : 'secondary')
      if (b.enabled === false) btn.setEnabled(false)
      // Hovering or holding the upgrade button emphasises the projected ring.
      if (b.primary && opts.onPreview) {
        btn.hit.on('pointerover', () => opts.onPreview?.(true))
        btn.hit.on('pointerout', () => opts.onPreview?.(false))
        btn.hit.on('pointerdown', () => opts.onPreview?.(true))
      }
      this.buttons.push(btn)
      parts.push(...btn.parts)
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
