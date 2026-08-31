import Phaser from 'phaser'
import type { BrandingDef, HeroDef } from '../types.ts'
import displayData from '../data/display.json'
import heroesData from '../data/heroes.json'
import brandingData from '../data/branding.json'
import { setRunState } from '../systems/RunState.ts'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { plateButton, platePanel } from '../ui/Plate.ts'
import { AudioToggle } from '../ui/AudioToggle.ts'
import { unlockAudio } from '../systems/Audio.ts'
import { BUILD_ID } from '../systems/Build.ts'
import { ART, fitContentHeight, fitInBox } from '../systems/Art.ts'
import { fitCameraToDesign } from '../ui/FitCamera.ts'

const HEROES = heroesData as Record<string, HeroDef>
const BRANDING = brandingData as BrandingDef

/** Title, hero selection, and the only place a run can begin. */
export class TitleScene extends Phaser.Scene {
  private selectedHero = 'cory'
  private cards: Array<{ id: string; frame: Phaser.GameObjects.Image[] }> = []
  private blurb!: Phaser.GameObjects.Text
  private kit!: Phaser.GameObjects.Text

  constructor() {
    super('Title')
  }

  create(): void {
    // Fixed UI camera: the design box is fitted into the viewport so nothing
    // is cut off, and no gesture is bound to it. Menus never pan or zoom.
    fitCameraToDesign(this)

    // Defensive: the HUD must never survive into the title screen.
    this.scene.stop('Hud')
    this.cards = []
    const W = displayData.width
    const H = displayData.height

    this.drawBackdrop(W, H)

    const mark = BRANDING.titleMark
    const logo = this.add.image(mark.x, mark.y, ART.brand.jebusGames)
    fitContentHeight(logo, ART.brand.jebusGames, mark.height)

    this.add.text(W / 2, 96, 'COURJAHAN', {
      fontFamily: FONT_DISPLAY, fontSize: '82px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 10,
    }).setOrigin(0.5)

    this.add.text(W / 2, 158, 'D E F E N S E', {
      fontFamily: FONT_DISPLAY, fontSize: '30px', color: COLOR.amber,
      stroke: '#0d1016', strokeThickness: 6,
    }).setOrigin(0.5)

    this.add.text(W / 2, 200, 'A serious tower defense in a very silly world.', {
      fontFamily: FONT_UI, fontSize: '24px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4, ...BODY_SPACING,
    }).setOrigin(0.5)

    this.add.text(W / 2, 242, 'CHOOSE YOUR HERO', {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber,
      stroke: '#0d1016', strokeThickness: 4, letterSpacing: 2,
    }).setOrigin(0.5)

    const ids = Object.keys(HEROES)
    const cardW = 210
    const gap = 24
    const totalW = ids.length * cardW + (ids.length - 1) * gap
    ids.forEach((id, i) => this.heroCard(id, W / 2 - totalW / 2 + i * (cardW + gap), 264, cardW, 190))

    // The description and the kit are separate blocks: as one wrapped string
    // the kit line ran under the START RUN button.
    this.blurb = this.add.text(W / 2, 468, '', {
      fontFamily: FONT_UI, fontSize: '24px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4, ...BODY_SPACING,
      align: 'center', wordWrap: { width: 1140 },
    }).setOrigin(0.5, 0)

    this.kit = this.add.text(W / 2, 538, '', {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.good,
      stroke: '#0d1016', strokeThickness: 4, ...BODY_SPACING,
      align: 'center', wordWrap: { width: 1140 },
    }).setOrigin(0.5, 0)

    plateButton(this, W / 2, 606, 300, 62, 'START RUN', () => this.start(), 26)
    plateButton(this, W / 2, 670, 250, 52, 'CREDITS', () => this.scene.start('Credits'), 22, 'secondary')

    // Which build this is, small and out of the way, so a deploy can be
    // confirmed at a glance without opening devtools on a phone.
    this.add.text(W - 10, H - 8, BUILD_ID, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim,
      stroke: '#0d1016', strokeThickness: 3,
    }).setOrigin(1, 1).setAlpha(0.65)

    unlockAudio(this)

    // Settings: mute and volume, bottom-left and out of the way.
    new AudioToggle(this, 44, H - 44)

    this.select(this.selectedHero)
  }

  /**
   * The painted title illustration, scaled to cover the canvas, with a dark
   * wash over it so type stays readable. The illustration keeps its middle
   * open on purpose and puts towers at the left and right edges, which is why
   * every element on this screen is inside the central column.
   *
   * If the image is not in the build, the old flat panel is used instead: a
   * title screen that fails to draw is worse than a plain one.
   */
  private drawBackdrop(W: number, H: number): void {
    const key = ART.ui.titleBackdrop
    if (key === null || !this.textures.exists(key)) {
      this.add.rectangle(0, 0, W, H, 0x10161d).setOrigin(0, 0)
      this.decorateBackdrop()
      return
    }
    const bg = this.add.image(W / 2, H / 2, key)
    // Cover, not fit: fill the canvas and let the overflow crop.
    const scale = Math.max(W / bg.width, H / bg.height)
    bg.setScale(scale)
    this.add.rectangle(0, 0, W, H, 0x0b0e13, BRANDING.titleBackdropDim).setOrigin(0, 0)

    // The flat wash alone leaves the smaller copy fighting the village behind
    // it. A soft column behind the middle settles that without dimming the
    // towers at the edges, which are the part worth seeing.
    const col = this.add.graphics()
    const colW = BRANDING.titleColumnWidth
    // Stacked wide and faint, and running off the top and bottom edges, so it
    // fades out sideways with no seam anywhere on screen.
    for (let i = 0; i < 12; i++) {
      const t = i / 12
      col.fillStyle(0x0b0e13, 0.05)
      col.fillRoundedRect(W / 2 - (colW / 2) * (1 - t * 0.42), -40,
        colW * (1 - t * 0.42), H + 80, 120)
    }
  }

  /** A few pack sprites scattered behind the title so it is not a flat slab. */
  private decorateBackdrop(): void {
    const rng = new Phaser.Math.RandomDataGenerator(['title'])
    const keys = ART.decor
    for (let i = 0; i < 26; i++) {
      this.add
        .image(rng.between(20, displayData.width - 20), rng.between(20, displayData.height - 20), rng.pick(keys))
        .setAlpha(0.12)
        .setScale(rng.realInRange(0.6, 1.5))
        .setAngle(rng.between(0, 360))
    }
  }

  private heroCard(id: string, x: number, y: number, w: number, h: number): void {
    const def = HEROES[id]
    const frame = platePanel(this, x, y, w, h)

    // The hero's own art, fitted to the card rather than scaled by a factor.
    const portrait = this.add.image(x + w / 2, y + 74, def.portraitSprite)
    fitInBox(portrait, def.portraitSprite, 108)

    this.add.text(x + w / 2, y + 124, def.name.toUpperCase(), {
      fontFamily: FONT_DISPLAY, fontSize: '30px', color: COLOR.ink,
    }).setOrigin(0.5)
    this.add.text(x + w / 2, y + 158, def.title, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber,
    }).setOrigin(0.5)

    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerdown', () => this.select(id))

    this.cards.push({ id, frame })
  }

  private select(id: string): void {
    this.selectedHero = id
    // The plate is painted, so the picked card is the bright one and the rest
    // sit back: a tint can only darken, so selection is the absence of one.
    for (const c of this.cards) {
      const tint = c.id === id ? 0xffffff : 0x8b939c
      c.frame.forEach((p) => p.setTint(tint))
    }
    const def = HEROES[id]
    this.blurb.setText(`${def.flavor}\n${def.blurb}`)
    this.kit.setText(`${def.passive.name}: ${def.passive.flavor}    ·    ${def.haymaker.name}` +
      `    ·    ${def.restructure.name}    ·    Last Stand: ${def.lastStand.name}`)
  }

  private start(): void {
    // A fresh seed per run, so the draft differs each time.
    setRunState({ heroId: this.selectedHero, seed: Date.now() >>> 0 })
    this.scene.start('Draft')
  }
}
