import Phaser from 'phaser'
import {
  appearanceMs, peekRise, pickSpot, rollGap,
  type PeekConfig, type PeekSpot,
} from '../systems/PeekSchedule.ts'

/**
 * Bailey, behind the trees.
 *
 * She puts her head up over the tree line in the top-left of the map, looks
 * around, and goes back down. She does nothing else: not tappable, no reward,
 * no sound, no message. If a player never notices her, that is fine.
 *
 * BUILD PHASE ONLY. An easter egg that moves while a wave is walking in is
 * competing with the thing the player has to watch, and the whole point of
 * this one is that it costs nothing.
 *
 * BEHIND the trees, not on them. The trees are painted into the map plate, so
 * there is no sprite to sort behind — everything drawn at all is drawn over
 * them. She is masked instead: nothing of her renders below her spot's canopy
 * line, so what clears it is the top of her head and her ears and what is
 * under it is simply not there. Rising is that line staying put while she
 * moves up through it.
 *
 * The art is an OPTIONAL manifest hook. If the file has not landed, the
 * texture does not exist, and she never appears — which for something that
 * does nothing is the correct fallback and needs no placeholder.
 */
export class Bailey {
  private readonly spots: PeekSpot[]
  private readonly cfg: PeekConfig
  private readonly worldHeight: number
  private readonly img?: Phaser.GameObjects.Image
  private readonly mask?: Phaser.GameObjects.Graphics

  private nextAt = 0
  private startedAt = -1
  private spot = -1

  constructor(
    scene: Phaser.Scene,
    key: string | undefined,
    spots: PeekSpot[],
    cfg: PeekConfig,
    worldHeight: number,
    depth: number,
  ) {
    this.spots = spots
    this.cfg = cfg
    this.worldHeight = worldHeight
    if (!key || !scene.textures.exists(key) || spots.length === 0) return

    this.mask = scene.make.graphics({}, false)
    this.img = scene.add.image(0, 0, key)
      .setOrigin(0.5, 0)
      .setDepth(depth)
      .setVisible(false)
    this.img.setDisplaySize(
      worldHeight * (this.img.width / this.img.height), worldHeight)
    this.img.setMask(this.mask.createGeometryMask())
    this.nextAt = -1
  }

  /** Frees the mask graphic, which is not a display-list child and so is not
   *  torn down with the scene. */
  destroy(): void {
    this.img?.destroy()
    this.mask?.destroy()
  }

  /**
   * @param now      the scene clock, in ms
   * @param canAppear true only in the build phase between waves
   */
  update(now: number, canAppear: boolean): void {
    const img = this.img
    if (!img) return

    if (this.startedAt < 0) {
      if (!canAppear) return
      // The first interval is rolled the first time she COULD appear rather
      // than at scene start, so a run that opens mid-wave does not have her
      // waiting to pop the instant it ends.
      if (this.nextAt < 0) { this.nextAt = now + rollGap(this.cfg, Math.random); return }
      if (now < this.nextAt) return
      this.spot = pickSpot(this.spots.length, this.spot, Math.random)
      this.startedAt = now
    }

    const s = this.spots[this.spot]
    if (!s) { this.startedAt = -1; return }

    // A wave starting mid-peek sends her down rather than deleting her: an
    // easter egg vanishing in one frame reads as a glitch.
    const elapsed = canAppear
      ? now - this.startedAt
      : Math.max(now - this.startedAt, this.cfg.riseMs + this.cfg.holdMs)
    const rise = peekRise(elapsed, this.cfg)
    if (rise === null) {
      this.startedAt = -1
      this.nextAt = now + rollGap(this.cfg, Math.random)
      img.setVisible(false)
      return
    }

    const shown = rise * this.cfg.peakVisible * this.worldHeight
    img.setPosition(s.x, s.canopyY - shown)
    img.setVisible(shown > 0.5)

    // The mask is the canopy: everything above the line, nothing below it.
    const g = this.mask!
    g.clear()
    g.fillStyle(0xffffff)
    g.fillRect(s.x - this.worldHeight, s.canopyY - this.worldHeight * 2,
      this.worldHeight * 2, this.worldHeight * 2)
  }

  /** For the harness: where she is in her cycle, without waiting for one. */
  get debug(): { spot: number; visible: boolean; y: number; nextAt: number } {
    return {
      spot: this.spot,
      visible: this.img?.visible ?? false,
      y: this.img?.y ?? 0,
      nextAt: this.nextAt,
    }
  }

  /** For the harness only: start an appearance now, at a chosen spot. */
  forcePeek(now: number, spot: number): void {
    if (!this.img) return
    this.spot = Math.max(0, Math.min(this.spots.length - 1, spot))
    this.startedAt = now
  }

  get appearanceLengthMs(): number {
    return appearanceMs(this.cfg)
  }

  get armed(): boolean {
    return !!this.img
  }
}
