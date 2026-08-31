import Phaser from 'phaser'
import type { TowerDef } from '../types.ts'
import { towerIcon } from './TowerIcon.ts'
import { iconPlate, platePanel } from './Plate.ts'
import { COLOR, FONT_DISPLAY, FONT_UI } from './Theme.ts'
import { play } from '../systems/Audio.ts'

export interface BuildOption {
  id: string
  def: TowerDef
}

const PANEL_DEPTH = 200000
const CELL_W = 96
const CELL_H = 116
/** The plate is square and sits at the top of its cell; the name and cost go
 *  underneath it, outside the frame, where they are readable on any icon. */
const PLATE = 74
const MAX_COLS = 3
const PAD = 12
const TITLE_H = 24

/**
 * Opens on an empty tile and shows what can be built there and for how much.
 * Hovering an option previews that tower's range on the tile, which is the
 * whole reason to pick one over another.
 */
export class BuildMenu {
  private readonly scene: Phaser.Scene
  private options: BuildOption[]
  private container?: Phaser.GameObjects.Container
  private hitAreas: Phaser.GameObjects.Rectangle[] = []

  constructor(scene: Phaser.Scene, options: BuildOption[]) {
    this.scene = scene
    this.options = options
  }

  /** The unlocked tower list grows as the run goes on. */
  setOptions(options: BuildOption[]): void {
    this.options = options
  }

  get isOpen(): boolean {
    return this.container !== undefined
  }

  /** Every object the menu owns, for the scene's camera split. The menu is a
   *  panel, so it belongs to the fixed UI camera. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return this.container ? [this.container] : []
  }

  /**
   * True when this tap belongs to the menu, so the world ignores it.
   *
   * The list is kept after the menu closes, deliberately. Phaser hit-tests
   * before it dispatches, so picking a tower reaches the cell first — which
   * closes the menu — and then reaches the scene's own handler with the menu
   * already gone. That let the same click build a tower and then re-open a
   * menu, or open the new tower's panel, on the pad underneath.
   */
  ownsAny(objects: Phaser.GameObjects.GameObject[]): boolean {
    return objects.some((o) => this.hitAreas.includes(o as Phaser.GameObjects.Rectangle))
  }

  open(
    screenX: number,
    screenY: number,
    peanuts: number,
    onPick: (id: string) => void,
    onPreview: (id: string | null) => void,
  ): void {
    this.close(onPreview)

    // Size to the options actually offered: a fixed three columns left a wide
    // empty panel whenever fewer towers were unlocked.
    const cols = Math.max(1, Math.min(MAX_COLS, this.options.length))
    const rows = Math.ceil(this.options.length / cols)
    const w = cols * CELL_W + PAD * 2
    const h = rows * CELL_H + PAD * 2 + TITLE_H

    // Screen space, not world space. The menu is a panel: it belongs to the
    // fixed UI camera, at 1:1, clamped to the viewport. Positioning it at world
    // coordinates and then clamping those against the camera's *pixel* size
    // mixed two coordinate systems, and under zoom it landed off screen.
    const view = this.scene.scale
    const x = Phaser.Math.Clamp(screenX - w / 2, 6, view.width - w - 6)
    const y = Phaser.Math.Clamp(screenY - h - 40, 6, view.height - h - 6)

    play(this.scene, 'open')
    const c = this.scene.add.container(x, y).setDepth(PANEL_DEPTH)

    c.add(platePanel(this.scene, 0, 0, w, h))
    c.add(this.scene.add.text(w / 2, PAD - 2, 'BUILD', {
      fontFamily: FONT_DISPLAY, fontSize: '13px', color: COLOR.amber,
    }).setOrigin(0.5, 0))

    this.options.forEach((opt, i) => {
      const cx = PAD + (i % cols) * CELL_W
      const cy = PAD + TITLE_H + Math.floor(i / cols) * CELL_H
      const affordable = peanuts >= opt.def.cost

      const iconX = cx + CELL_W / 2
      const cell = iconPlate(this.scene, iconX, cy + PLATE / 2, PLATE, PLATE)
      // Unaffordable reads as greyed out, not as faded: a half-alpha tower on
      // a dark cell just looks like it is behind something.
      const icon = towerIcon(this.scene, iconX, cy + PLATE / 2 + 8, opt.def.sprite, 46, !affordable)

      const cost = this.scene.add
        .text(iconX, cy + PLATE + 20, `${opt.def.cost}p`, {
          fontFamily: FONT_DISPLAY, fontSize: '14px',
          color: affordable ? '#f2d06b' : '#7d7568',
        })
        .setOrigin(0.5, 0)

      const name = this.scene.add
        .text(iconX, cy + PLATE + 4, opt.def.name.split(' ')[0], {
          fontFamily: FONT_UI, fontSize: '11px',
          color: affordable ? '#f6ecd9' : '#7d7568',
        })
        .setOrigin(0.5, 0)

      // One transparent rectangle per cell carries the input, so hit testing
      // never has to care about the icons stacked underneath.
      const hit = this.scene.add
        .rectangle(cx + 2, cy, CELL_W - 4, CELL_H - 6, 0xffffff, 0.001)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: affordable })

      // The active plate is the hover state, so the cell lights up rather
      // than changing colour under the icon.
      hit.on('pointerover', () => {
        cell.setActive(true)
        play(this.scene, 'hover')
        onPreview(opt.id)
      })
      hit.on('pointerout', () => {
        cell.setActive(false)
        onPreview(null)
      })
      // An unaffordable pick still reports: swallowing the click here is what
      // made a greyed-out tower look like a broken button. The scene decides
      // whether the purchase happens and says why when it does not.
      hit.on('pointerdown', () => onPick(opt.id))

      this.hitAreas.push(hit)
      c.add([...cell.parts, name, ...icon, cost, hit])
    })

    this.container = c
  }

  close(onPreview?: (id: string | null) => void): void {
    if (this.container) play(this.scene, 'close')
    this.container?.destroy(true)
    this.container = undefined
    // hitAreas is not cleared here: see ownsAny. open() replaces it.
    onPreview?.(null)
  }
}
