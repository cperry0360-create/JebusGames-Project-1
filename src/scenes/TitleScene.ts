import Phaser from 'phaser'
import type { BrandingDef } from '../types.ts'
import displayData from '../data/display.json'
import brandingData from '../data/branding.json'
import { setRunState } from '../systems/RunState.ts'
import { clearRun, loadRun } from '../systems/RunSave.ts'
import { LEVELS, furthestUnlocked, resolveLevelId } from '../systems/Levels.ts'
import { loadSave } from '../systems/Save.ts'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { plateButton } from '../ui/Plate.ts'
import { AudioToggle } from '../ui/AudioToggle.ts'
import { unlockAudio } from '../systems/Audio.ts'
import { VERSION_LABEL } from '../systems/Build.ts'
import { logEvent } from '../systems/Diagnostics.ts'
import { ART } from '../systems/Art.ts'
import { fitCameraToDesign } from '../ui/FitCamera.ts'
import { musicForScene, musicProblem, onMusicProblem } from '../systems/Music.ts'
import { sceneIsLive } from '../systems/SceneEvents.ts'

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

    // If the soundtrack cannot play, say so here rather than leaving the
    // player to wonder why one game is silent and another is not. Only ever
    // shown on real evidence — a load failure or a refusal the browser
    // named — so a working game never carries an apology.
    const musicNote = this.add.text(W / 2, 250, '', {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim,
      stroke: '#0d1016', strokeThickness: 3, align: 'center',
      wordWrap: { width: W - 160 }, ...BODY_SPACING,
    }).setOrigin(0.5).setVisible(false)
    const sayMusic = (why: string): void => {
      if (!sceneIsLive(this)) return
      musicNote.setText(`No music: ${why}.`).setVisible(true)
    }
    if (musicProblem()) sayMusic(musicProblem())
    // The callback is global and outlives this scene, so it is guarded by
    // sceneIsLive rather than unregistered: each new Title replaces it, and a
    // stale one from a scene that has gone returns without touching anything.
    onMusicProblem(sayMusic)

    // The level select row that used to sit here is now a screen of its own:
    // a world map with a card per level. This is the way in. Only drawn when
    // there is more than one level, so a single-level build is unchanged.
    const shift = this.buildMapButton(W, 300)

    // A run left in progress is offered back before anything else.
    //
    // OFFERED, NOT RESUMED AUTOMATICALLY. Dropping the player straight into a
    // half-finished board takes away the choice to start again, and the answer
    // is not always yes — the run they abandoned may be the one they were
    // losing. So it is a button, it is the first one, and START RUN beside it
    // means what it says: that run is then gone.
    const saved = loadRun()
    if (saved) {
      plateButton(this, W / 2, 372 + shift, 320, 68, `RESUME  ·  WAVE ${saved.wave + 1}`,
        () => this.resume(), 26)
      plateButton(this, W / 2, 452 + shift, 260, 56, 'NEW RUN', () => this.start(), 22, 'secondary')
      plateButton(this, W / 2, 524 + shift, 260, 56, 'CREDITS',
        () => this.scene.start('Credits'), 22, 'secondary')
    } else {
      plateButton(this, W / 2, 386 + shift, 320, 68, 'START RUN', () => this.start(), 28)
      plateButton(this, W / 2, 470 + shift, 260, 56, 'CREDITS',
        () => this.scene.start('Credits'), 22, 'secondary')
    }

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
      stamp.width + 36, stamp.height + 26, 0xffffff, 0.001)
      .setOrigin(0.5)
      // NAMED, AND DELIBERATELY UNDER 44pt. The screen audit reports every
      // live rectangle smaller than a fingertip, and this one is meant to be:
      // it is a hidden developer door behind five deliberate taps on a version
      // stamp, not a control a player is meant to find. The name is what lets
      // the audit's output say that rather than leaving the next reader to
      // work out which unlabelled rectangle it was.
      .setName('title:version-stamp (hidden dev door, not a tap target)')
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
   * The way to the world map.
   *
   * This replaced a row of level buttons. The row worked, but it could only
   * ever be a row — it had nowhere to say where a place IS, and "Head Office"
   * beside "Courjahan Village" is two words, not a journey. The map screen
   * carries the same choice with the geography attached.
   *
   * Returns how far to push the buttons below it, so a build with one level
   * and nothing to choose between keeps the old layout exactly.
   */
  private buildMapButton(W: number, y: number): number {
    if (LEVELS.length < 2) return 0
    plateButton(this, W / 2, y, 320, 54, 'WORLD MAP',
      () => this.scene.start('WorldMap'), 24, 'secondary')
    return 30
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



  /**
   * Picks the saved run back up, skipping the draft.
   *
   * The loadout is part of what was saved — the hero, the hand it dealt and
   * the reserve — because a resumed run with a fresh draft is a different run.
   * Dealing again here would hand the player towers they had not earned and
   * take away the ones already standing on the board.
   */
  private resume(): void {
    const saved = loadRun()
    // It was there when the screen was drawn. If it has gone since — another
    // tab, a cleared site — start a run rather than a scene with nothing in it.
    if (!saved) {
      this.start()
      return
    }
    logEvent('scene', `Title -> Game (resume ${resolveLevelId(saved.level)} at wave ${saved.wave + 1})`)
    setRunState({
      heroId: saved.heroId,
      // The run goes back to the level it was saved on. GameScene reads
      // resumeFrom.level in preference to this, so the two cannot disagree;
      // it is set for anything that asks the run state which level is live.
      levelId: resolveLevelId(saved.level),
      seed: saved.seed,
      abilities: [...saved.abilities],
      openingTowers: [...saved.openingTowers],
      reserveTowers: [...saved.reserveTowers],
      resumeFrom: saved,
    })
    this.scene.start('Game')
  }

  private start(): void {
    // A NEW run replaces the saved one. Keeping it would leave the title
    // screen offering to resume a run the player has already walked away from,
    // with a board from two games ago.
    clearRun()
    // A fresh seed per run, so the draft differs each time.
    // The hand is cleared as well as the seed: the loadout screen deals only
    // when there is no hand, so leaving the last run's cards here would show
    // them again.
    // Re-checked here rather than trusted to the button being disabled. The
    // enforcement has to live where the run actually starts: the row above is
    // a drawing, and a drawing is not a gate.
    // The furthest level open to this player, which is where a player who
    // presses START RUN rather than picking off the map means to be. One
    // definition, in Levels.ts, shared with the map screen's "current
    // objective" ring.
    const levelId = furthestUnlocked(loadSave().runsCleared).id
    setRunState({
      heroId: this.selectedHero, seed: Date.now() >>> 0, levelId,
      openingTowers: [], abilities: [], reserveTowers: [], resumeFrom: null,
    })
    this.scene.start('Loadout')
  }
}
