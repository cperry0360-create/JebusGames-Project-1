import Phaser from 'phaser'
import type { TowerDef } from '../types.ts'
import { ART } from '../systems/Art.ts'

export interface BuildOption {
  id: string
  def: TowerDef
}

const PANEL_DEPTH = 200000
const CELL_W = 92
const CELL_H = 84
const COLS = 3
const PAD = 10

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

  col = -1
  row = -1

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

  /** True when the pointer is over any part of the menu. */
  ownsAny(objects: Phaser.GameObjects.GameObject[]): boolean {
    return objects.some((o) => this.hitAreas.includes(o as Phaser.GameObjects.Rectangle))
  }

  open(
    worldX: number,
    worldY: number,
    col: number,
    row: number,
    gold: number,
    onPick: (id: string) => void,
    onPreview: (id: string | null) => void,
  ): void {
    this.close(onPreview)
    this.col = col
    this.row = row

    const rows = Math.ceil(this.options.length / COLS)
    const w = COLS * CELL_W + PAD * 2
    const h = rows * CELL_H + PAD * 2 + 22

    const cam = this.scene.cameras.main
    const x = Phaser.Math.Clamp(worldX - w / 2, 6, cam.width - w - 6)
    const y = Phaser.Math.Clamp(worldY - h - 40, 70, cam.height - h - 6)

    const c = this.scene.add.container(x, y).setDepth(PANEL_DEPTH)

    const bg = this.scene.add.rectangle(0, 0, w, h, 0x14181f, 0.94).setOrigin(0, 0)
    bg.setStrokeStyle(2, 0x4a5666)
    const title = this.scene.add.text(PAD, 8, 'BUILD', {
      fontFamily: 'monospace', fontSize: '13px', color: '#c2ab84',
    })
    c.add([bg, title])

    this.options.forEach((opt, i) => {
      const cx = PAD + (i % COLS) * CELL_W
      const cy = PAD + 22 + Math.floor(i / COLS) * CELL_H
      const affordable = gold >= opt.def.cost

      const cell = this.scene.add
        .rectangle(cx, cy, CELL_W - 6, CELL_H - 6, 0x232a34, 0.95)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x3b4552)

      const iconX = cx + (CELL_W - 6) / 2
      const base = this.scene.add.image(iconX, cy + 30, ART.ui.towerBase).setScale(0.62)
      const turret = this.scene.add.image(iconX, cy + 27, opt.def.sprite).setScale(0.62)
      if (!affordable) {
        base.setAlpha(0.35)
        turret.setAlpha(0.35)
      }

      const cost = this.scene.add
        .text(iconX, cy + 56, `${opt.def.cost}g`, {
          fontFamily: 'monospace', fontSize: '13px',
          color: affordable ? '#f2d06b' : '#7d7568',
        })
        .setOrigin(0.5, 0)

      const name = this.scene.add
        .text(iconX, cy + 2, opt.def.name.split(' ')[0], {
          fontFamily: 'monospace', fontSize: '10px',
          color: affordable ? '#f6ecd9' : '#7d7568',
        })
        .setOrigin(0.5, 0)

      // One transparent rectangle per cell carries the input, so hit testing
      // never has to care about the icons stacked underneath.
      const hit = this.scene.add
        .rectangle(cx, cy, CELL_W - 6, CELL_H - 6, 0xffffff, 0.001)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: affordable })

      hit.on('pointerover', () => {
        cell.setFillStyle(affordable ? 0x2f4536 : 0x3a2a2a, 0.95)
        onPreview(opt.id)
      })
      hit.on('pointerout', () => {
        cell.setFillStyle(0x232a34, 0.95)
        onPreview(null)
      })
      hit.on('pointerdown', () => {
        if (affordable) onPick(opt.id)
      })

      this.hitAreas.push(hit)
      c.add([cell, name, base, turret, cost, hit])
    })

    this.container = c
  }

  close(onPreview?: (id: string | null) => void): void {
    this.container?.destroy(true)
    this.container = undefined
    this.hitAreas = []
    this.col = -1
    this.row = -1
    onPreview?.(null)
  }
}
