import Phaser from 'phaser'
import type { BrandingDef } from '../types.ts'
import displayData from '../data/display.json'
import brandingData from '../data/branding.json'
import { ART, fitContentHeight } from '../systems/Art.ts'
import { COLOR, FONT_UI } from '../ui/Theme.ts'

const BRANDING = brandingData as BrandingDef

/** Studio card before the title. Fades in, holds, fades out; any input skips. */
export class SplashScene extends Phaser.Scene {
  private done = false

  constructor() {
    super('Splash')
  }

  create(): void {
    this.done = false
    const cfg = BRANDING.splash
    const W = displayData.width
    const H = displayData.height

    this.add.rectangle(0, 0, W, H, Phaser.Display.Color.HexStringToColor(cfg.backgroundColor).color)
      .setOrigin(0, 0)

    const card = this.add.image(W / 2, H / 2, ART.brand.studioCard).setAlpha(0)
    fitContentHeight(card, ART.brand.studioCard, cfg.cardHeight)

    const hint = this.add.text(W / 2, H - 42, 'tap to skip', {
      fontFamily: FONT_UI, fontSize: '12px', color: COLOR.ink,
    }).setOrigin(0.5).setAlpha(0)

    this.tweens.add({ targets: card, alpha: 1, duration: cfg.fadeInMs, ease: 'Quad.easeOut' })
    this.tweens.add({ targets: hint, alpha: 0.4, duration: cfg.fadeInMs, delay: cfg.fadeInMs })

    this.time.delayedCall(cfg.fadeInMs + cfg.holdMs, () => {
      if (this.done) return
      this.tweens.add({
        targets: [card, hint],
        alpha: 0,
        duration: cfg.fadeOutMs,
        ease: 'Quad.easeIn',
        onComplete: () => this.finish(),
      })
    })

    // A stray click left over from loading should not eat the whole splash.
    this.time.delayedCall(cfg.skipGuardMs, () => {
      if (this.done) return
      this.input.once('pointerdown', () => this.finish())
      this.input.keyboard?.once('keydown', () => this.finish())
    })
  }

  private finish(): void {
    if (this.done) return
    this.done = true
    this.scene.start('Title')
  }
}
