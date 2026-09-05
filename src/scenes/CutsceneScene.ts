import Phaser from 'phaser'
import { COLOR, faceFor, uiSize } from '../ui/Theme.ts'
import { viewH, viewW } from '../systems/Resolution.ts'
import { onSceneResize, sceneIsLive } from '../systems/SceneEvents.ts'
import { logEvent } from '../systems/Diagnostics.ts'
import { markSeen, panelKey, panelUrl, panelsFor } from '../systems/Cutscenes.ts'

/**
 * The comic that plays before a level.
 *
 * Handed a level id and where to go afterwards; it draws that level's panels
 * one at a time, advances on a tap anywhere, and hands over. Everything about
 * WHICH panels and WHEN a comic plays at all is in systems/Cutscenes.ts -- this
 * counts taps and draws pictures.
 *
 * TAP ANYWHERE, NOT A BUTTON. A comic is read by tapping the page, and hunting
 * for a small "next" target on a phone is worse than the panel it advances.
 * The one real control is SKIP, which is deliberately in a corner and out of
 * the way of the reading.
 *
 * FIT, NEVER FILL. The panels are 16:9 and a phone in portrait is nothing like
 * it, so a cover-fit would cut a third off each side -- and a speech bubble in
 * the corner of a panel IS the panel. Contain-fit puts the whole thing on
 * screen: on a portrait phone that means full width, centred vertically, with
 * the game's own dark chrome above and below.
 */
export interface CutsceneRequest {
  levelId: string
  /** The scene to start once the comic is over, however it ended. */
  then: string
}

/** Where the SKIP control sits, and how big its tap target is. */
const SKIP_MARGIN = 18
const SKIP_W = 108
const SKIP_H = 44

export class CutsceneScene extends Phaser.Scene {
  private levelId = ''
  private next = 'Game'
  private panels: string[] = []
  private index = 0
  private image?: Phaser.GameObjects.Image
  private skipParts: Phaser.GameObjects.GameObject[] = []
  private counter?: Phaser.GameObjects.Text
  /** Guards the hand-over: a fast double tap on the last panel would otherwise
   *  start the next scene twice. */
  private finished = false

  constructor() {
    super('Cutscene')
  }

  init(req: CutsceneRequest): void {
    this.levelId = req?.levelId ?? ''
    this.next = req?.then ?? 'Game'
    this.panels = panelsFor(this.levelId)
    this.index = 0
    this.finished = false
  }

  preload(): void {
    // Only the FIRST panel is waited on. The rest are fetched while the reader
    // is looking at the one in front of them -- see `preloadAhead`.
    const first = this.panels[0]
    if (first) this.load.image(panelKey(first), panelUrl(first))
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x10161d)

    // Nothing to show. Not an error: a level with no entry in cutscenes.json
    // simply starts, and this is the path that makes that true.
    if (this.panels.length === 0) {
      this.handOver('no panels')
      return
    }

    this.drawPanel()
    this.drawSkip()

    // The whole screen is the advance control. `setInteractive` on a full-size
    // zone rather than on the image, so the letterbox bars advance too -- a tap
    // that lands in the chrome is still a tap on the comic.
    const zone = this.add.zone(0, 0, viewW(this), viewH(this)).setOrigin(0, 0)
    zone.setInteractive({ useHandCursor: true })
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.advance())
    zone.setDepth(-1)
    onSceneResize(this, () => {
      if (!sceneIsLive(this)) return
      zone.setSize(viewW(this), viewH(this))
      this.layout()
    })

    // A keyboard is not the target but it costs nothing and makes the scene
    // testable by hand on a desktop.
    this.input.keyboard?.on('keydown-SPACE', () => this.advance())
    this.input.keyboard?.on('keydown-ENTER', () => this.advance())
    this.input.keyboard?.on('keydown-ESC', () => this.skip())

    this.preloadAhead()
    logEvent('cutscene', `${this.levelId} panel 1/${this.panels.length}`)
  }

  /**
   * Fetches the panel AFTER the one on screen.
   *
   * Started as soon as a panel is shown, so by the time the reader taps, the
   * next one is already in the texture manager and the change is instant. Panels
   * are about 300KB each; without this, every tap is a network round trip on a
   * phone and the comic stutters exactly where it should flow.
   */
  private preloadAhead(): void {
    const upcoming = this.panels[this.index + 1]
    if (!upcoming) return
    const key = panelKey(upcoming)
    if (this.textures.exists(key)) return
    this.load.image(key, panelUrl(upcoming))
    this.load.start()
  }

  /** Draws the current panel, replacing whatever was there. */
  private drawPanel(): void {
    const path = this.panels[this.index]
    if (!path) return
    const key = panelKey(path)
    this.image?.destroy()
    // A panel that has not landed yet leaves the frame empty for a moment
    // rather than throwing; the loader's completion redraws it.
    if (!this.textures.exists(key)) {
      this.load.image(key, panelUrl(path))
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (sceneIsLive(this)) this.drawPanel()
      })
      this.load.start()
      return
    }
    this.image = this.add.image(0, 0, key).setOrigin(0.5, 0.5).setDepth(0)
    this.layout()
    this.updateCounter()
  }

  /**
   * Contain-fit, recomputed on every resize.
   *
   * `Math.min` of the two ratios is what makes it a fit rather than a fill: the
   * axis that runs out first decides, and the other one gets the chrome. On a
   * portrait phone the width runs out first, which is the case the brief names.
   */
  private layout(): void {
    const w = viewW(this)
    const h = viewH(this)
    if (this.image) {
      const src = this.textures.get(this.image.texture.key).getSourceImage()
      const sw = (src as { width: number }).width
      const sh = (src as { height: number }).height
      const scale = Math.min(w / sw, h / sh)
      this.image.setDisplaySize(sw * scale, sh * scale)
      this.image.setPosition(w / 2, h / 2)
    }
    this.placeSkip()
  }

  private drawSkip(): void {
    const label = this.add.text(0, 0, 'SKIP', {
      fontFamily: faceFor(uiSize(20)),
      fontSize: `${uiSize(20)}px`,
      color: COLOR.ink,
    }).setOrigin(0.5, 0.5).setDepth(11)
    const plate = this.add.rectangle(0, 0, SKIP_W, SKIP_H, 0x000000, 0.55)
      .setOrigin(0.5, 0.5).setDepth(10)
      .setStrokeStyle(2, 0xf6ecd9, 0.5)
    plate.setInteractive({ useHandCursor: true })
    // `pointerup` on the plate, and the plate is above the full-screen zone, so
    // a tap on SKIP does not also count as an advance.
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP,
      (_p: unknown, _x: unknown, _y: unknown, ev: { stopPropagation?: () => void }) => {
        ev?.stopPropagation?.()
        this.skip()
      })

    this.counter = this.add.text(0, 0, '', {
      fontFamily: faceFor(uiSize(16)),
      fontSize: `${uiSize(16)}px`,
      color: COLOR.ink,
    }).setOrigin(0.5, 0.5).setAlpha(0.65).setDepth(11)

    this.skipParts = [plate, label]
    this.placeSkip()
    this.updateCounter()
  }

  private placeSkip(): void {
    const w = viewW(this)
    const h = viewH(this)
    const x = w - SKIP_MARGIN - SKIP_W / 2
    const y = SKIP_MARGIN + SKIP_H / 2
    for (const p of this.skipParts) (p as Phaser.GameObjects.Image).setPosition(x, y)
    this.counter?.setPosition(w / 2, h - SKIP_MARGIN - 12)
  }

  private updateCounter(): void {
    this.counter?.setText(`${this.index + 1} / ${this.panels.length}`)
  }

  /** One tap: the next panel, or out of the comic if that was the last. */
  private advance(): void {
    if (this.finished) return
    if (this.index + 1 >= this.panels.length) {
      this.handOver('read to the end')
      return
    }
    this.index++
    this.drawPanel()
    this.preloadAhead()
    logEvent('cutscene', `${this.levelId} panel ${this.index + 1}/${this.panels.length}`)
  }

  /** Straight to the level. Counts as seen: the player has decided about this
   *  comic, and asking again next run is not respecting the answer. */
  private skip(): void {
    if (this.finished) return
    this.handOver('skipped')
  }

  private handOver(why: string): void {
    if (this.finished) return
    this.finished = true
    // WRITTEN HERE AND ONLY HERE, at the one point every ending goes through,
    // so "read to the end" and "skipped" cannot drift apart. A level with no
    // panels is not marked -- there is nothing to have seen.
    if (this.panels.length > 0) markSeen(this.levelId)
    logEvent('cutscene', `${this.levelId} ${why} -> ${this.next}`)
    this.scene.start(this.next)
  }
}
