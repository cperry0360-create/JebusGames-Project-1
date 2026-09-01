import Phaser from 'phaser'
import { COLOR, FONT_DISPLAY, FONT_UI } from './Theme.ts'
import { platePanel } from './Plate.ts'
import { play } from '../systems/Audio.ts'
import { LAYER } from '../systems/Layers.ts'
import type { ScratchOutcome } from '../systems/Scratch.ts'

/**
 * The Scratch Ticket overlay.
 *
 * The payout is rolled the moment the card appears, so scratching reveals a
 * number that already exists rather than one the game is still deciding — the
 * player is uncovering a result, not rolling for it. Dragging across the foil
 * erases it; covering enough of the panel reveals the rest and pays out.
 *
 * It never blocks the wave. Enemies keep walking underneath, and the ticket
 * reveals itself after `autoRevealSeconds` whether it was touched or not, so a
 * player who ignores it loses nothing but the fun.
 */

/** Coarse grid used to judge "enough of it is scratched" without reading pixels. */
const CELLS_X = 14
const CELLS_Y = 8
const REVEAL_FRACTION = 0.38
const NIB = 26

export interface ScratchCardOptions {
  outcome: ScratchOutcome
  autoRevealSeconds: number
  onCollect: (payout: number) => void
}

export class ScratchCard {
  private readonly scene: Phaser.Scene
  private readonly opts: ScratchCardOptions
  private readonly layer: Phaser.GameObjects.Container
  private readonly foil: Phaser.GameObjects.RenderTexture
  private readonly nib: Phaser.GameObjects.Graphics
  private readonly hint: Phaser.GameObjects.Text
  private readonly zone: Phaser.GameObjects.Zone
  /**
   * Swallows every pointer event that is not on the card.
   *
   * The card is an interactive object, which is not the same as a modal: the
   * camera rig listens at the SCENE level and heard every drag straight
   * through it, so scratching panned the board underneath. The rig is now
   * gated centrally (see systems/Layers.ts) and this stops taps outside the
   * card reaching build pads and the lane.
   */
  private readonly blocker: Phaser.GameObjects.Rectangle
  private readonly scratched = new Set<number>()
  private revealed = false
  private closed = false
  private timer?: Phaser.Time.TimerEvent

  constructor(scene: Phaser.Scene, x: number, y: number, depth: number, opts: ScratchCardOptions) {
    this.scene = scene
    this.opts = opts

    const w = 300
    const h = 176
    this.layer = scene.add.container(x, y).setDepth(depth).setScale(0.6)
    scene.tweens.add({ targets: this.layer, scale: 1, duration: 220, ease: 'Back.easeOut' })

    // The plate's chrome sits outside the card, not over it: sized from the
    // foil plus the title above and the hint below, or the frame eats both.
    const pw = w + 150
    const ph = h + 240
    const panel = platePanel(scene, -pw / 2, -ph / 2, pw, ph)
    const title = scene.add.text(0, -h / 2 - 24, 'SCRATCH TICKET', {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink, fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    // What is under the foil, drawn first so erasing the foil uncovers it.
    const face = scene.add.graphics()
    face.fillStyle(0x1b2430, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 8)
    // A losing ticket has to say so. Uncovering a blank card and being told
    // nothing is confusing rather than funny, and 40% of them lose now.
    const won = opts.outcome.payout > 0
    const prize = scene.add.text(0, won ? -6 : -2, won ? `${opts.outcome.payout}` : opts.outcome.label, {
      fontFamily: FONT_DISPLAY,
      fontSize: won ? '58px' : '26px',
      color: won ? COLOR.amber : COLOR.dim,
      align: 'center',
      wordWrap: { width: w - 24 },
    }).setOrigin(0.5)
    const unit = scene.add.text(0, 46, won ? 'PEANUTS' : 'BUT YOU LOOKED GOOD DOING IT', {
      fontFamily: FONT_UI, fontSize: won ? '20px' : '13px', color: COLOR.dim,
      fontStyle: 'bold', letterSpacing: won ? 3 : 1,
      align: 'center', wordWrap: { width: w - 20 },
    }).setOrigin(0.5)

    // The foil itself: a render texture so it can be erased where dragged.
    this.foil = scene.add.renderTexture(-w / 2, -h / 2, w, h).setOrigin(0, 0)
    this.paintFoil(w, h)

    this.hint = scene.add.text(0, h / 2 + 12, 'drag to scratch', {
      fontFamily: FONT_UI, fontSize: '16px', color: COLOR.dim,
    }).setOrigin(0.5, 0)

    // The eraser nib, stamped into the foil wherever the pointer drags.
    this.nib = scene.make.graphics({ x: 0, y: 0 }, false)
    this.nib.fillStyle(0xffffff, 1).fillCircle(NIB, NIB, NIB)

    // Oversized deliberately: the world camera can be panned and zoomed, and a
    // blocker sized to the viewport leaves a gap at the edges once it is.
    this.blocker = scene.add
      .rectangle(0, 0, scene.scale.width * 3, scene.scale.height * 3, 0x000000, 0.35)
      .setOrigin(0.5)
      .setDepth(LAYER.modalDim)
      .setScrollFactor(0)
      .setInteractive()
    this.blocker.on('pointerdown', () => { /* swallowed */ })

    this.zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true })
    this.zone.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.scratchAt(p)
    })
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.scratchAt(p))

    this.layer.add([...panel, title, face, prize, unit, this.foil, this.hint, this.zone])

    this.timer = scene.time.delayedCall(opts.autoRevealSeconds * 1000, () => this.reveal(true))
  }

  /** True while the card owns the pointer, so the world ignores those clicks. */
  /** Everything the card draws, for a scene that splits its two cameras.
   *  It is all inside one container, so the container is the whole card. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.blocker, this.layer]
  }

  /** Any press while the card is up belongs to the card — on the foil or on
   *  the blocker around it. Nothing behind it may act on one. */
  owns(objects: Phaser.GameObjects.GameObject[]): boolean {
    return objects.includes(this.zone) || objects.includes(this.blocker)
  }

  get active(): boolean {
    return !this.closed
  }

  destroy(): void {
    this.closed = true
    this.timer?.remove()
    this.nib.destroy()
    this.blocker.destroy()
    this.layer.destroy(true)
  }

  private paintFoil(w: number, h: number): void {
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false)
    g.fillStyle(0x9aa6b4, 1).fillRoundedRect(0, 0, w, h, 8)
    // Brushed streaks, so it reads as foil rather than a grey rectangle.
    for (let i = 0; i < 26; i++) {
      const y = (i / 26) * h
      g.fillStyle(i % 2 === 0 ? 0xb4c0cd : 0x8794a3, 0.55)
      g.fillRect(0, y, w, h / 34)
    }
    g.lineStyle(2, 0x6f7c8b, 1).strokeRoundedRect(1, 1, w - 2, h - 2, 8)
    this.foil.draw(g, 0, 0)
    g.destroy()
  }

  private scratchAt(p: Phaser.Input.Pointer): void {
    if (this.revealed || this.closed) return
    // Pointer is in world space; the foil is a child of a positioned container.
    const local = this.layer.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY)
    const fx = local.x - this.foil.x
    const fy = local.y - this.foil.y
    if (fx < 0 || fy < 0 || fx > this.foil.width || fy > this.foil.height) return

    this.foil.erase(this.nib, fx - NIB, fy - NIB)
    // Voice-capped in audio.json, so a fast drag rasps rather than roars.
    play(this.scene, 'scratching')
    this.hint.setText('keep going')

    // Every cell the nib actually covers, not just the one under the pointer.
    // Counting one cell per event made a visibly cleared card still say "keep
    // going", because the nib erases a disc far wider than a single cell.
    const cellW = this.foil.width / CELLS_X
    const cellH = this.foil.height / CELLS_Y
    const x0 = Math.max(0, Math.floor((fx - NIB) / cellW))
    const x1 = Math.min(CELLS_X - 1, Math.floor((fx + NIB) / cellW))
    const y0 = Math.max(0, Math.floor((fy - NIB) / cellH))
    const y1 = Math.min(CELLS_Y - 1, Math.floor((fy + NIB) / cellH))
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        // Corners of the bounding box are outside the round nib.
        const dx = (cx + 0.5) * cellW - fx
        const dy = (cy + 0.5) * cellH - fy
        if (dx * dx + dy * dy <= NIB * NIB) this.scratched.add(cy * CELLS_X + cx)
      }
    }
    if (this.scratched.size / (CELLS_X * CELLS_Y) >= REVEAL_FRACTION) this.reveal(false)
  }

  private reveal(auto: boolean): void {
    if (this.revealed || this.closed) return
    this.revealed = true
    this.timer?.remove()
    this.zone.disableInteractive()
    this.hint.setText(auto ? 'auto-scratched' : 'paid out')
    this.scene.tweens.add({ targets: this.foil, alpha: 0, duration: 220 })
    this.opts.onCollect(this.opts.outcome.payout)
    this.scene.time.delayedCall(900, () => {
      if (this.closed) return
      this.scene.tweens.add({
        targets: this.layer, alpha: 0, scale: 0.85, duration: 260,
        onComplete: () => this.destroy(),
      })
    })
  }
}
