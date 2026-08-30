import Phaser from 'phaser'
import type { BrandingDef, CreditsDef } from '../types.ts'
import displayData from '../data/display.json'
import brandingData from '../data/branding.json'
import creditsData from '../data/credits.json'
import { ART, contentWidthAt, fitContentHeight } from '../systems/Art.ts'
import { COLOR, FONT_DISPLAY, FONT_UI, button } from '../ui/Theme.ts'

const BRANDING = brandingData as BrandingDef
const CREDITS = creditsData as CreditsDef

/** Both studio marks, with the attribution the CC0 art asks for. */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits')
  }

  create(): void {
    const W = displayData.width
    const H = displayData.height
    const c = BRANDING.credits

    this.add.rectangle(0, 0, W, H, 0x10161d).setOrigin(0, 0)
    this.decorateBackdrop()

    this.add.text(W / 2, 74, CREDITS.heading, {
      fontFamily: FONT_DISPLAY, fontSize: '46px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 6,
    }).setOrigin(0.5)

    this.add.text(W / 2, 126, CREDITS.subheading, {
      fontFamily: FONT_UI, fontSize: '16px', color: COLOR.amber,
    }).setOrigin(0.5)

    // Both marks side by side, spaced from their real on-screen widths.
    const leftW = contentWidthAt(ART.brand.jebusGames, c.logoHeight)
    const rightW = contentWidthAt(ART.brand.cpPlays, c.logoHeight)
    const total = leftW + c.logoGap + rightW
    const leftX = W / 2 - total / 2 + leftW / 2
    const rightX = W / 2 + total / 2 - rightW / 2

    const left = this.add.image(leftX, c.logoY, ART.brand.jebusGames)
    fitContentHeight(left, ART.brand.jebusGames, c.logoHeight)
    const right = this.add.image(rightX, c.logoY, ART.brand.cpPlays)
    fitContentHeight(right, ART.brand.cpPlays, c.logoHeight)

    this.add.text(W / 2, c.logoY, '×', {
      fontFamily: FONT_DISPLAY, fontSize: '30px', color: COLOR.dim,
    }).setOrigin(0.5).setAlpha(0.7)

    // Room for text credits below; lines live in credits.json so adding a
    // name never means touching code.
    CREDITS.lines.forEach((line, i) => {
      if (line === '') return
      const isAttribution = line.includes('CC0')
      this.add.text(W / 2, c.textTop + i * c.lineHeight, line, {
        fontFamily: FONT_UI,
        fontSize: isAttribution ? '15px' : '14px',
        color: isAttribution ? COLOR.ink : COLOR.dim,
      }).setOrigin(0.5)
    })

    this.add.text(W / 2, H - 96, CREDITS.footer, {
      fontFamily: FONT_UI, fontSize: '12px', color: COLOR.dim,
    }).setOrigin(0.5).setAlpha(0.65)

    button(this, W / 2, H - 46, 200, 46, 'BACK', () => this.scene.start('Title'), 18)
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Title'))
  }

  private decorateBackdrop(): void {
    const rng = new Phaser.Math.RandomDataGenerator(['credits'])
    for (let i = 0; i < 22; i++) {
      this.add
        .image(rng.between(20, displayData.width - 20), rng.between(20, displayData.height - 20),
          rng.pick(ART.decor))
        .setAlpha(0.1)
        .setScale(rng.realInRange(0.6, 1.4))
        .setAngle(rng.between(0, 360))
    }
  }
}
