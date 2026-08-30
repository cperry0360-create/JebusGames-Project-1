import Phaser from 'phaser'
import type { BrandingDef, HeroDef } from '../types.ts'
import displayData from '../data/display.json'
import heroesData from '../data/heroes.json'
import brandingData from '../data/branding.json'
import { setRunState } from '../systems/RunState.ts'
import { COLOR, FONT_DISPLAY, FONT_UI, button, panel } from '../ui/Theme.ts'
import { ART, fitContentHeight } from '../systems/Art.ts'

const HEROES = heroesData as Record<string, HeroDef>
const BRANDING = brandingData as BrandingDef

/** Title, hero selection, and the only place a run can begin. */
export class TitleScene extends Phaser.Scene {
  private selectedHero = 'cory'
  private cards: Array<{ id: string; frame: Phaser.GameObjects.Graphics; x: number; y: number; w: number; h: number }> = []
  private blurb!: Phaser.GameObjects.Text
  private kit!: Phaser.GameObjects.Text

  constructor() {
    super('Title')
  }

  create(): void {
    // Defensive: the HUD must never survive into the title screen.
    this.scene.stop('Hud')
    this.cards = []
    const W = displayData.width
    const H = displayData.height

    this.add.rectangle(0, 0, W, H, 0x10161d).setOrigin(0, 0)
    this.decorateBackdrop()

    const mark = BRANDING.titleMark
    const logo = this.add.image(mark.x, mark.y, ART.brand.jebusGames)
    fitContentHeight(logo, ART.brand.jebusGames, mark.height)

    this.add.text(W / 2, 96, 'COURJAHAN', {
      fontFamily: FONT_DISPLAY, fontSize: '82px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 10,
    }).setOrigin(0.5)

    this.add.text(W / 2, 158, 'D E F E N S E', {
      fontFamily: FONT_DISPLAY, fontSize: '30px', color: COLOR.gold,
      stroke: '#0d1016', strokeThickness: 6,
    }).setOrigin(0.5)

    this.add.text(W / 2, 196, 'A serious tower defense in a very silly world.', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
    }).setOrigin(0.5)

    this.add.text(W / 2, 252, 'CHOOSE YOUR HERO', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
    }).setOrigin(0.5)

    const ids = Object.keys(HEROES)
    const cardW = 210
    const gap = 24
    const totalW = ids.length * cardW + (ids.length - 1) * gap
    ids.forEach((id, i) => this.heroCard(id, W / 2 - totalW / 2 + i * (cardW + gap), 282, cardW, 190))

    // The description and the kit are separate blocks: as one wrapped string
    // the kit line ran under the START RUN button.
    this.blurb = this.add.text(W / 2, 486, '', {
      fontFamily: FONT_UI, fontSize: '13px', color: COLOR.dim,
      align: 'center', wordWrap: { width: 680 },
    }).setOrigin(0.5, 0)

    this.kit = this.add.text(W / 2, 552, '', {
      fontFamily: FONT_UI, fontSize: '12px', color: COLOR.good,
      align: 'center', wordWrap: { width: 780 },
    }).setOrigin(0.5, 0)

    button(this, W / 2, 622, 260, 58, 'START RUN', () => this.start(), 24)
    button(this, W / 2, 680, 190, 38, 'CREDITS', () => this.scene.start('Credits'), 15)

    this.select(this.selectedHero)
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
    const frame = panel(this, x, y, w, h, { fill: COLOR.panelHi })

    // Portrait built from the hero's own sprites, scaled up.
    this.add.image(x + w / 2, y + 74, def.portraitSprite).setScale(1.7)
    this.add.image(x + w / 2, y + 70, def.gunSprite).setScale(1.7)

    this.add.text(x + w / 2, y + 122, def.name.toUpperCase(), {
      fontFamily: FONT_DISPLAY, fontSize: '26px', color: COLOR.ink,
    }).setOrigin(0.5)
    this.add.text(x + w / 2, y + 152, def.title, {
      fontFamily: FONT_UI, fontSize: '13px', color: COLOR.gold,
    }).setOrigin(0.5)

    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerdown', () => this.select(id))

    this.cards.push({ id, frame, x, y, w, h })
  }

  private select(id: string): void {
    this.selectedHero = id
    for (const c of this.cards) {
      const on = c.id === id
      c.frame.clear()
      c.frame.fillStyle(on ? 0x24402a : COLOR.panelHi, 0.96).fillRoundedRect(c.x, c.y, c.w, c.h, 10)
      c.frame.lineStyle(on ? 3 : 2, on ? COLOR.accent : COLOR.panelEdge, 1)
        .strokeRoundedRect(c.x, c.y, c.w, c.h, 10)
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
