import Phaser from 'phaser'
import type { BrandingDef, CreditsDef } from '../types.ts'
import displayData from '../data/display.json'
import brandingData from '../data/branding.json'
import creditsData from '../data/credits.json'
import { ART, contentWidthAt, fitContentHeight } from '../systems/Art.ts'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { plateButton } from '../ui/Plate.ts'
import { fitCameraToDesign } from '../ui/FitCamera.ts'

const BRANDING = brandingData as BrandingDef
const CREDITS = creditsData as CreditsDef

/** Both studio marks, with the attribution the CC0 art asks for. */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits')
  }

  create(): void {
    // Fixed UI camera: the design box is fitted into the viewport so nothing
    // is cut off, and no gesture is bound to it. Menus never pan or zoom.
    fitCameraToDesign(this)

    const W = displayData.width
    const H = displayData.height
    const c = BRANDING.credits

    this.add.rectangle(0, 0, W, H, 0x10161d).setOrigin(0, 0)
    this.decorateBackdrop()

    this.add.text(W / 2, c.headingY, CREDITS.heading, {
      fontFamily: FONT_DISPLAY, fontSize: '46px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 6,
    }).setOrigin(0.5)

    this.add.text(W / 2, c.subheadingY, CREDITS.subheading, {
      fontFamily: FONT_UI, fontSize: '24px', color: COLOR.amber,
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

    // Credits proper: a role on the left of the centre line and a name on the
    // right, so the three kids read as one department and the difference
    // between Courtland's contribution and the other two's is the whole joke.
    let y = c.textTop
    for (const section of CREDITS.sections) {
      this.add.text(W / 2, y, section.title, {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber, letterSpacing: 2,
      }).setOrigin(0.5)
      y += c.sectionGap

      for (const entry of section.entries) {
        this.add.text(W / 2 - c.columnGap, y, entry.role, {
          fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim,
        }).setOrigin(1, 0.5)
        this.add.text(W / 2 + c.columnGap, y, entry.name, {
          fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink,
        }).setOrigin(0, 0.5)
        y += c.lineHeight
      }
      y += c.sectionGap
    }

    // The closing note, which is the punchline rather than a credit.
    CREDITS.notes.forEach((note, i) => {
      this.add.text(W / 2, y + i * 28, note, {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.good, ...BODY_SPACING,
      }).setOrigin(0.5).setAlpha(0.85)
    })

    // The dedication. It is the sign-off, so it sits on its own above the
    // button rather than joining the list of credits.
    this.add.text(W / 2, c.footerY, CREDITS.footer, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink, ...BODY_SPACING,
    }).setOrigin(0.5).setAlpha(0.85)

    // Going back is the lesser action, so it wears the secondary plate.
    plateButton(this, W / 2, H - 48, 250, 56, 'BACK', () => this.scene.start('Title'), 24, 'secondary')
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
