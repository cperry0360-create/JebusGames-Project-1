import Phaser from 'phaser'
import { COLOR, FONT_DISPLAY, FONT_UI } from './Theme.ts'
import { play } from '../systems/Audio.ts'
import { LAYER } from '../systems/Layers.ts'
import type { ScratchOutcome } from '../systems/Scratch.ts'
import { ART, renderFor } from '../systems/Art.ts'
import presentationData from '../data/presentation.json'
import { viewH, viewW } from '../systems/Resolution.ts'

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

/** Coarse grid used to judge "enough of it is scratched" without reading
 *  pixels. It covers the SILVER PANEL, not the whole card: the painted border
 *  is not foil and scratching it would count toward a reveal that never
 *  uncovers anything. */
const CELLS_X = 14
const CELLS_Y = 8
const SC = presentationData.scratchCard

export interface ScratchCardOptions {
  outcome: ScratchOutcome
  autoRevealSeconds: number
  onCollect: (payout: number) => void
  /** Fired when the card has gone, so the scene can drop its reference. */
  onClosed?: () => void
}

export class ScratchCard {
  private readonly scene: Phaser.Scene
  private readonly opts: ScratchCardOptions
  private readonly layer: Phaser.GameObjects.Container
  private readonly foil: Phaser.GameObjects.RenderTexture
  /** Eraser radius, scaled from the panel so it feels the same at any size. */
  private readonly nib: number = 26
  private readonly nibArt: Phaser.GameObjects.Graphics
  /** The silver coating's rectangle, in card coordinates. */
  private readonly panel: { x: number; y: number; w: number; h: number }
  /** The drawn card's size, for a harness run measuring it against the
   *  viewport. */
  readonly cardW: number = 0
  readonly cardH: number = 0
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

    // Sized from the art, and from the viewport, so the whole ticket is on
    // screen at 568x320 as well as on a desktop.
    const cfg = renderFor(ART.ui.scratchCard.revealed)
    const srcW = cfg.contentWidth ?? 600
    const srcH = cfg.contentHeight ?? 406
    const h = Math.min(SC.cardHeight, viewH(scene) * 0.62)
    const scale = h / srcH
    const w = srcW * scale
    this.cardW = w
    this.cardH = h

    // The silver coating, as a rectangle in card coordinates.
    const px = -w / 2 + SC.panelLeft * w
    const py = -h / 2 + SC.panelTop * h
    const pw = (SC.panelRight - SC.panelLeft) * w
    const ph = (SC.panelBottom - SC.panelTop) * h
    this.panel = { x: px, y: py, w: pw, h: ph }
    this.nib = Math.max(10, Math.round(Math.min(pw, ph) * SC.nibFraction))

    this.layer = scene.add.container(x, y).setDepth(depth).setScale(0.6)
    scene.tweens.add({ targets: this.layer, scale: 1, duration: 220, ease: 'Back.easeOut' })

    // The revealed ticket is the base layer. No plate behind it: the art is
    // its own frame, and a dialog plate around a painted card reads as a
    // picture of a card sitting inside a window.
    const base = scene.add.image(0, 0, ART.ui.scratchCard.revealed).setDisplaySize(w, h)

    // What the coating is hiding, drawn into the cream reveal area.
    const won = opts.outcome.payout > 0
    const cx = px + pw / 2
    const cy = py + ph / 2
    const prize = scene.add.text(cx, cy,
      won ? `${opts.outcome.payout}` : opts.outcome.label, {
        fontFamily: FONT_DISPLAY,
        fontSize: `${Math.round((won ? SC.payoutSize : SC.loseLabelSize) * scale)}px`,
        color: won ? '#b4761f' : '#7a5c3a',
        align: 'center',
        wordWrap: { width: pw - 20 },
      }).setOrigin(0.5)
    const unit = won
      ? scene.add.text(cx, cy + prize.height * 0.62, 'PEANUTS', {
        fontFamily: FONT_UI, fontSize: `${Math.round(26 * scale)}px`,
        color: '#8a6a2f', fontStyle: 'bold', letterSpacing: 3,
      }).setOrigin(0.5, 0)
      : scene.add.text(cx, cy + prize.height * 0.62, 'BUT YOU LOOKED GOOD DOING IT', {
        fontFamily: FONT_UI, fontSize: `${Math.round(17 * scale)}px`,
        color: '#8a6a2f', align: 'center', wordWrap: { width: pw - 30 },
      }).setOrigin(0.5, 0)

    // The coating, as a render texture the size of the WHOLE card so the two
    // sprites line up exactly, erased where the player drags.
    this.foil = scene.add.renderTexture(-w / 2, -h / 2, w, h).setOrigin(0, 0)
    this.paintFoil(w, h)

    this.hint = scene.add.text(0, h / 2 + 10, 'drag to scratch', {
      fontFamily: FONT_UI, fontSize: '16px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4,
    }).setOrigin(0.5, 0)

    // The eraser nib, stamped into the coating wherever the pointer drags.
    this.nibArt = scene.make.graphics({ x: 0, y: 0 }, false)
    this.nibArt.fillStyle(0xffffff, 1).fillCircle(this.nib, this.nib, this.nib)

    // Oversized deliberately: the world camera can be panned and zoomed, and a
    // blocker sized to the viewport leaves a gap at the edges once it is.
    this.blocker = scene.add
      .rectangle(0, 0, viewW(scene) * 3, viewH(scene) * 3, 0x000000, 0.35)
      .setOrigin(0.5)
      .setDepth(LAYER.modalDim)
      .setScrollFactor(0)
      .setInteractive()
    this.blocker.on('pointerdown', () => { /* swallowed */ })

    // The drag target is the PANEL, not the card. Dragging the painted border
    // is not scratching.
    this.zone = scene.add.zone(px + pw / 2, py + ph / 2, pw, ph)
      .setInteractive({ useHandCursor: true })
    this.zone.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.scratchAt(p)
    })
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.scratchAt(p))

    this.layer.add([base, prize, unit, this.foil, this.hint, this.zone])

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
    if (this.closed) return
    this.closed = true
    this.timer?.remove()
    this.nibArt.destroy()
    this.blocker.destroy()
    this.layer.destroy(true)
    this.opts.onClosed?.()
  }

  /** Lays the coating down: the covered sprite, at card size. */
  private paintFoil(w: number, h: number): void {
    const img = this.scene.make.image(
      { key: ART.ui.scratchCard.covered, add: false },
    ).setOrigin(0, 0).setDisplaySize(w, h)
    this.foil.draw(img, 0, 0)
    img.destroy()
  }

  private scratchAt(p: Phaser.Input.Pointer): void {
    if (this.revealed || this.closed) return
    // Pointer is in world space; the foil is a child of a positioned container.
    const local = this.layer.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY)
    // Inside the SILVER PANEL, not merely inside the card. The painted border
    // is part of the ticket, not coating, and erasing it would leave a hole in
    // the artwork.
    const pnl = this.panel
    if (local.x < pnl.x || local.x > pnl.x + pnl.w) return
    if (local.y < pnl.y || local.y > pnl.y + pnl.h) return

    const fx = local.x - this.foil.x
    const fy = local.y - this.foil.y
    this.foil.erase(this.nibArt, fx - this.nib, fy - this.nib)
    // Voice-capped in audio.json, so a fast drag rasps rather than roars.
    play(this.scene, 'scratching')
    this.hint.setText('keep going')

    // Every cell the nib actually covers, not just the one under the pointer.
    // Counting one cell per event made a visibly cleared card still say "keep
    // going", because the nib erases a disc far wider than a single cell.
    // The grid spans the panel, so "38% scratched" means 38% of the coating
    // rather than 38% of a card that is mostly painted border.
    const gx = local.x - pnl.x
    const gy = local.y - pnl.y
    const cellW = pnl.w / CELLS_X
    const cellH = pnl.h / CELLS_Y
    const x0 = Math.max(0, Math.floor((gx - this.nib) / cellW))
    const x1 = Math.min(CELLS_X - 1, Math.floor((gx + this.nib) / cellW))
    const y0 = Math.max(0, Math.floor((gy - this.nib) / cellH))
    const y1 = Math.min(CELLS_Y - 1, Math.floor((gy + this.nib) / cellH))
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        // Corners of the bounding box are outside the round nib.
        const dx = (cx + 0.5) * cellW - gx
        const dy = (cy + 0.5) * cellH - gy
        if (dx * dx + dy * dy <= this.nib * this.nib) this.scratched.add(cy * CELLS_X + cx)
      }
    }
    if (this.scratched.size / (CELLS_X * CELLS_Y) >= SC.revealFraction) this.reveal(false)
  }

  private reveal(auto: boolean): void {
    if (this.revealed || this.closed) return
    this.revealed = true
    this.timer?.remove()
    this.zone.disableInteractive()
    this.hint.setText(auto ? 'auto-scratched' : 'paid out')
    // Wipes the rest of the coating off rather than fading the ticket: what is
    // underneath stays, which is the whole point of a two-layer card.
    this.scene.tweens.add({ targets: this.foil, alpha: 0, duration: auto ? 320 : 220 })
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
