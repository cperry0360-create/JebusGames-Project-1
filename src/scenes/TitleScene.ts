import Phaser from 'phaser'
import type { BrandingDef } from '../types.ts'
import displayData from '../data/display.json'
import brandingData from '../data/branding.json'
import { setRunState } from '../systems/RunState.ts'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { plateButton } from '../ui/Plate.ts'
import { AudioToggle } from '../ui/AudioToggle.ts'
import { unlockAudio } from '../systems/Audio.ts'
import { VERSION_LABEL } from '../systems/Build.ts'
import { logEvent } from '../systems/Diagnostics.ts'
import { ART } from '../systems/Art.ts'
import { fitCameraToDesign } from '../ui/FitCamera.ts'
import { musicForScene } from '../systems/Music.ts'

const BRANDING = brandingData as BrandingDef

/** Title, hero selection, and the only place a run can begin. */
export class TitleScene extends Phaser.Scene {
  private selectedHero = 'cory'

  constructor() {
    super('Title')
  }

  create(): void {
    // What plays here is data; see music.json. A scene not listed keeps
    // whatever is already playing, which is what carries the battle track
    // across Title -> Loadout without a restart.
    musicForScene('Title')
    // Fixed UI camera: the design box is fitted into the viewport so nothing
    // is cut off, and no gesture is bound to it. Menus never pan or zoom.
    fitCameraToDesign(this)

    // Defensive: the HUD must never survive into the title screen.
    this.scene.stop('Hud')
    const W = displayData.width
    const H = displayData.height

    this.drawBackdrop(W, H)

    // No studio mark here. The splash card immediately before this screen is
    // the JebusGames logo, full size and on its own; repeating it in the
    // corner four hundred milliseconds later reads as a watermark, not as a
    // studio. The title is the title screen's job.

    this.add.text(W / 2, 96, 'COURJAHAN', {
      fontFamily: FONT_DISPLAY, fontSize: '82px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 10,
    }).setOrigin(0.5)

    this.add.text(W / 2, 158, 'D E F E N S E', {
      fontFamily: FONT_UI, fontSize: '30px', fontStyle: 'bold', color: COLOR.amber,
      stroke: '#0d1016', strokeThickness: 6,
    }).setOrigin(0.5)

    this.add.text(W / 2, 214, 'A serious tower defense in a very silly world.', {
      fontFamily: FONT_UI, fontSize: '24px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4, ...BODY_SPACING,
    }).setOrigin(0.5)

    plateButton(this, W / 2, 386, 320, 68, 'START RUN', () => this.start(), 28)
    plateButton(this, W / 2, 470, 260, 56, 'CREDITS', () => this.scene.start('Credits'), 22, 'secondary')

    // Which build this is. Small and out of the way, but readable without
    // squinting: this is the line that answers "did my deploy actually reach
    // the phone?", and a stamp you cannot read answers nothing. It sits on its
    // own dark pill because the corner behind it is painted scenery, and text
    // over arbitrary art is only legible by luck.
    const stamp = this.add.text(W - 18, H - 14, VERSION_LABEL, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 3,
    }).setOrigin(1, 1)
    const pad = 12
    this.add.rectangle(
      stamp.x - stamp.width / 2,
      stamp.y - stamp.height / 2,
      stamp.width + pad * 2,
      stamp.height + pad * 0.7,
      0x0d1016,
      0.62,
    ).setOrigin(0.5)
    // The pill is created second so it can be sized from the measured text,
    // which puts it on top; the label has to come back over it.
    this.children.bringToTop(stamp)

    // Five taps on the version stamp opens the diagnostics. Hidden because it
    // is for one person and a player who finds it learns nothing useful; the
    // stamp is the right place for it because a bug report starts with which
    // build you are on.
    let taps = 0
    let lastTap = 0
    const hit = this.add.rectangle(stamp.x - stamp.width / 2, stamp.y - stamp.height / 2,
      stamp.width + 40, stamp.height + 26, 0xffffff, 0.001)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: false })
    hit.on('pointerdown', () => {
      const now = this.time.now
      // The taps have to be deliberate: a run of them, not five separate
      // curious pokes minutes apart.
      taps = now - lastTap > 1200 ? 1 : taps + 1
      lastTap = now
      if (taps >= 5) {
        taps = 0
        logEvent('scene', 'Title -> Diagnostics')
        this.scene.start('Diagnostics')
      }
    })

    unlockAudio(this)

    // Settings: mute and volume, bottom-left and out of the way.
    // Design-box coordinates, not viewport: this screen is fitted.
    new AudioToggle(this, 44, H - 44, 40, H)

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



  private start(): void {
    // A fresh seed per run, so the draft differs each time.
    // The hand is cleared as well as the seed: the loadout screen deals only
    // when there is no hand, so leaving the last run's cards here would show
    // them again.
    setRunState({
      heroId: this.selectedHero, seed: Date.now() >>> 0,
      openingTowers: [], abilities: [], reserveTowers: [],
    })
    this.scene.start('Loadout')
  }
}
