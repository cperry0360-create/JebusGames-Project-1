// The world map: where a level is chosen.
//
// COMPOSED, NOT PAINTED. Three pieces, and adding a level touches none of the
// art:
//   background  one tiling texture, reused at every size and never regenerated
//   cards       one small picture per level, cropped from that level's own
//               plate by tools/mapcards
//   trail       drawn here in code from the levels' own mapPositions, so
//               moving a card in levels.json moves the trail with it
//
// A level's place on the map lives in exactly one place — `mapPosition` in
// levels.json — and its picture in exactly one other: `worldMap.cards` in
// art.json. A test fails if a level has neither.
//
// THE WORLD HAS ITS OWN COORDINATE SPACE. Everything below is positioned in
// world units, not screen pixels, and the camera is what puts it on the glass.
// Two cards fit on one screen today so the camera is a fixed fit and nothing
// pans — but the separation is the point: panning later means letting the
// camera move, not moving every object.

import Phaser from 'phaser'
import {
  LEVELS, furthestUnlocked, isLevelCleared, isLevelUnlocked, type LevelDef,
} from '../systems/Levels.ts'
import { loadSave } from '../systems/Save.ts'
import { clearRun, loadRun } from '../systems/RunSave.ts'
import { setRunState } from '../systems/RunState.ts'
import { ART, icon } from '../systems/Art.ts'
import { COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { plateButton } from '../ui/Plate.ts'
import { fitCameraToDesign, DESIGN_WIDTH, DESIGN_HEIGHT } from '../ui/FitCamera.ts'
import { musicForScene } from '../systems/Music.ts'
import { logEvent } from '../systems/Diagnostics.ts'
import { unlockAudio } from '../systems/Audio.ts'

/**
 * The world's bounds, in world units.
 *
 * The design box, so this screen fits the same way every other menu does and
 * cannot crop at any device shape. `mapPosition` is normalised against THESE,
 * so growing the world later is a change to these two numbers plus letting the
 * camera move — the cards follow, and so does the trail.
 */
const WORLD_W = DESIGN_WIDTH
const WORLD_H = DESIGN_HEIGHT

/** Card size in world units. The art is 300x200; drawn a little under that so
 *  two sit comfortably with the trail visible between them. */
const CARD_W = 264
const CARD_H = 176

/** The band the cards live in, so they clear the title and the buttons. */
const TOP_MARGIN = 150
const BOTTOM_MARGIN = 150

export class WorldMapScene extends Phaser.Scene {
  constructor() {
    super('WorldMap')
  }

  create(): void {
    musicForScene('Title')
    // The same fixed fit every menu uses: the whole design box inside the
    // viewport, centred, nothing cropped at any shape. No gesture is bound to
    // it — see CameraRig for the one camera the player drives.
    fitCameraToDesign(this)

    const cleared = loadSave().runsCleared

    this.drawBackground()
    this.drawTrail()
    for (const level of LEVELS) this.drawCard(level, cleared)
    this.drawChrome(cleared)

    unlockAudio(this)
  }

  /** Where a level's card sits, in world units. */
  private cardCentre(level: LevelDef): { x: number; y: number } {
    const [fx, fy] = level.mapPosition
    const top = TOP_MARGIN + CARD_H / 2
    const bottom = WORLD_H - BOTTOM_MARGIN - CARD_H / 2
    return {
      // Inset by half a card so a position of 0 or 1 still draws a whole card
      // rather than half of one off the edge.
      x: CARD_W / 2 + fx * (WORLD_W - CARD_W),
      y: top + fy * (bottom - top),
    }
  }

  /**
   * The tiling background.
   *
   * A TileSprite rather than a stretched image: the texture is seamless, so
   * repeating it costs one draw and looks the same at every size, where
   * stretching one 1254px square across a 1024-wide iPad would soften it.
   *
   * Drawn WIDER THAN THE WORLD on purpose. The camera fits the design box and
   * centres it, and whatever is left over at a different aspect would
   * otherwise be the dark chrome colour — a map screen with black bars down
   * the sides. Three times the box in each direction covers every shape this
   * game runs at with parchment instead.
   */
  private drawBackground(): void {
    const bg = this.add.tileSprite(
      WORLD_W / 2, WORLD_H / 2, WORLD_W * 3, WORLD_H * 3, ART.worldMap.background,
    )
    bg.setDepth(-100)
    // A wash, so the cards and the type on top of them stay readable against a
    // texture that is deliberately busy at close range.
    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W * 3, WORLD_H * 3, 0x1a1208, 0.18)
      .setDepth(-99)
  }

  /**
   * The trail between the cards, generated rather than painted.
   *
   * Dots along the straight line from one card to the next, in the order
   * levels.json lists them. Nothing here knows where the cards are except
   * `cardCentre`, so moving a level in the data moves its card AND both
   * halves of the trail that meet it.
   */
  private drawTrail(): void {
    const g = this.add.graphics().setDepth(-50)
    const SPACING = 26
    const RADIUS = 4.5

    for (let i = 0; i < LEVELS.length - 1; i++) {
      const a = this.cardCentre(LEVELS[i]!)
      const b = this.cardCentre(LEVELS[i + 1]!)
      const dx = b.x - a.x, dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      if (len < 1) continue
      // Start and end clear of the cards themselves, so the dots read as a
      // path BETWEEN places rather than as a line drawn over them.
      const clear = Math.min(CARD_W, CARD_H) * 0.55
      const from = clear, to = len - clear
      for (let d = from; d <= to; d += SPACING) {
        const t = d / len
        const x = a.x + dx * t, y = a.y + dy * t
        g.fillStyle(0x1d1409, 0.35)
        g.fillCircle(x + 2, y + 2, RADIUS)
        g.fillStyle(0xf0e0b8, 0.92)
        g.fillCircle(x, y, RADIUS)
      }
    }
  }

  /**
   * One region card.
   *
   * THREE STATES, all read off the two numbers the game already keeps —
   * `runsClearedToUnlock` on the level and `runsCleared` in the save. There is
   * no second gating path and no new save field:
   *   locked    desaturated, a padlock, no handler at all
   *   unlocked  full colour, tappable, ringed as the current objective
   *   cleared   full colour, tappable, with a tick
   */
  private drawCard(level: LevelDef, cleared: number): void {
    const { x, y } = this.cardCentre(level)
    const open = isLevelUnlocked(level.id, cleared)
    const done = isLevelCleared(level.id, cleared)
    const current = open && !done && level.id === furthestUnlocked(cleared).id

    // The frame, drawn under the picture and a little larger, so every card
    // has a border without the art needing one baked in.
    const frame = this.add.rectangle(x, y, CARD_W + 10, CARD_H + 10, 0x2a1d0e)
    frame.setStrokeStyle(3, done ? 0x6fbf73 : current ? 0xf0a830 : 0x5a4630)
    frame.setDepth(0)

    const key = ART.worldMap.cards[level.id]
    const card = this.add.image(x, y, key).setDisplaySize(CARD_W, CARD_H).setDepth(1)

    if (!open) {
      // Desaturated: a cool grey tint plus reduced alpha reads as "not yet"
      // without hiding which place it is.
      card.setTint(0x8a8a8a)
      card.setAlpha(0.55)
    }

    const label = this.add.text(x, y + CARD_H / 2 + 18, level.name.toUpperCase(), {
      fontFamily: FONT_UI, fontSize: '22px', fontStyle: 'bold',
      color: open ? COLOR.ink : COLOR.dim,
      stroke: '#0d1016', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(2)

    if (!open) {
      // The padlock over the middle of the card, and NO hit area at all — a
      // locked card does nothing rather than doing nothing quietly.
      const lock = this.add.image(x, y, icon(this, 'locked')).setDepth(3)
      const h = Math.min(CARD_W, CARD_H) * 0.38
      const src = this.textures.get(icon(this, 'locked')).getSourceImage()
      lock.setDisplaySize(h * (src.width / src.height), h)
      const need = level.runsClearedToUnlock
      this.add.text(x, y + CARD_H / 2 + 44,
        `Clear ${need === 1 ? 'a run' : `${need} runs`} to unlock`, {
          fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim,
          stroke: '#0d1016', strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(2)
      return
    }

    if (done) {
      // A tick in the corner: "you have been here".
      // The UI face, not the display one: the display face has a 44px floor
      // and no exemptions, and a tick does not need 44px.
      this.add.text(x + CARD_W / 2 - 12, y - CARD_H / 2 + 6, '✓', {
        fontFamily: FONT_UI, fontSize: '34px', fontStyle: 'bold', color: '#6fbf73',
        stroke: '#0d1016', strokeThickness: 5,
      }).setOrigin(1, 0).setDepth(3)
    }

    if (current) {
      label.setColor(COLOR.amber)
    }

    const hit = this.add.rectangle(x, y, CARD_W + 10, CARD_H + 10, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
      .setDepth(4)
    hit.on('pointerover', () => frame.setStrokeStyle(3, 0xffffff))
    hit.on('pointerout', () => {
      frame.setStrokeStyle(3, done ? 0x6fbf73 : current ? 0xf0a830 : 0x5a4630)
    })
    hit.on('pointerdown', () => this.startLevel(level.id))
  }

  /** The title, the resume offer and the way back. */
  private drawChrome(cleared: number): void {
    this.add.text(WORLD_W / 2, 54, 'CHOOSE YOUR BATTLE', {
      fontFamily: FONT_DISPLAY, fontSize: '46px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(10)

    // A run left in progress is offered back here as well as on the title
    // screen, because this is now the screen a player arrives at meaning to
    // play — and being made to go back a screen to pick it up is the kind of
    // thing that gets a run abandoned.
    const saved = loadRun()
    const y = WORLD_H - 58
    if (saved) {
      plateButton(this, WORLD_W / 2 - 150, y, 280, 54,
        `RESUME  ·  WAVE ${saved.wave + 1}`, () => this.resume(), 22)
      plateButton(this, WORLD_W / 2 + 150, y, 200, 54, 'BACK',
        () => this.scene.start('Title'), 22, 'secondary')
    } else {
      plateButton(this, WORLD_W / 2, y, 200, 54, 'BACK',
        () => this.scene.start('Title'), 22, 'secondary')
    }

    void cleared
  }

  /** Begins a run on a level the player has actually unlocked. */
  private startLevel(id: string): void {
    const cleared = loadSave().runsCleared
    // Re-checked here rather than trusted to the card having no handler. The
    // card is a drawing; this is where the run begins.
    if (!isLevelUnlocked(id, cleared)) return
    clearRun()
    logEvent('scene', `WorldMap -> Loadout (${id})`)
    setRunState({
      levelId: id, seed: Date.now() >>> 0,
      openingTowers: [], abilities: [], reserveTowers: [], resumeFrom: null,
    })
    this.scene.start('Loadout')
  }

  /** The same hand-over the title screen does: the run goes back to the level
   *  it was saved on. */
  private resume(): void {
    const saved = loadRun()
    if (!saved) return
    logEvent('scene', `WorldMap -> Game (resume at wave ${saved.wave + 1})`)
    setRunState({
      heroId: saved.heroId,
      levelId: saved.level,
      seed: saved.seed,
      abilities: [...saved.abilities],
      openingTowers: [...saved.openingTowers],
      reserveTowers: [...saved.reserveTowers],
      resumeFrom: saved,
    })
    this.scene.start('Game')
  }
}
