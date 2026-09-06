import Phaser from 'phaser'
import { COLOR, faceFor, uiSize } from '../ui/Theme.ts'
import { fitUiCamera, viewH, viewW } from '../systems/Resolution.ts'
import { onSceneResize, sceneIsLive } from '../systems/SceneEvents.ts'
import { logEvent } from '../systems/Diagnostics.ts'
import { panelKey, panelUrl, panelsFor } from '../systems/Cutscenes.ts'
import { cutsceneLayout, type CutsceneLayout } from '../systems/CutsceneLayout.ts'
import { safeAreaInsets } from '../systems/SafeArea.ts'
import { PRESENTATION } from '../systems/Presentation.ts'

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
 *
 * THE CAMERA IS FITTED, and this is the line whose absence produced the bug.
 * Every layout in this game is written in CSS pixels and the canvas is measured
 * in PHYSICAL ones; `fitUiCamera` is what reconciles the two. Without it this
 * scene computed a perfectly good contain-fit in CSS pixels and drew it through
 * an untransformed camera over a canvas three times larger, which is a panel at
 * a third of its size with its centre a sixth of the way across -- a small
 * comic pinned to the top-left, exactly as reported. At devicePixelRatio 1 the
 * two spaces are the same number and it looked right, which is how it shipped.
 *
 * Every other screen in the game already does this: the menus through
 * `fitCameraToDesign`, GameScene through its own `uiCam`. This one did not.
 *
 * WHERE THINGS GO is `systems/CutsceneLayout.ts`, which is Phaser-free so the
 * viewports in the brief can be checked without a canvas.
 */
export interface CutsceneRequest {
  levelId: string
  /** The scene to start once the comic is over, however it ended. */
  then: string
}

/** The panel source size. Every panel in the game is 1672x941; read off the
 *  texture at draw time rather than assumed, and this is only the fallback for
 *  the frame before one has loaded. */
const PANEL_W = 1672
const PANEL_H = 941

const CFG = PRESENTATION.cutscene

export class CutsceneScene extends Phaser.Scene {
  private levelId = ''
  private next = 'Game'
  private panels: string[] = []
  private index = 0
  private image?: Phaser.GameObjects.Image
  private skipParts: Phaser.GameObjects.GameObject[] = []
  private counter?: Phaser.GameObjects.Text
  /** The last layout computed, for the harness and for the tests that ask
   *  where things ended up rather than how they got there. */
  placement?: CutsceneLayout
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
    // FIRST, before anything is measured or placed. See the note above: this
    // is the line whose absence was the bug.
    fitUiCamera(this)
    this.cameras.main.setBackgroundColor(CFG.background)

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
    // RESIZE AND ROTATE, not just the first render. The camera has to be
    // re-fitted as well as the panel re-placed: its centre is derived from the
    // viewport, so a rotate that only moved the sprites would leave the whole
    // scene offset by half the difference.
    onSceneResize(this, () => {
      if (!sceneIsLive(this)) return
      fitUiCamera(this)
      zone.setPosition(0, 0)
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
   * THE ONE LAYOUT PATH.
   *
   * Called by `drawPanel` — so the first panel, every later panel, and the
   * redraw when a panel's texture arrives late all go through it — and by the
   * resize handler. There is deliberately no second placement anywhere: the
   * scene reads its answer out of `cutsceneLayout` and applies it, and a
   * viewport that changes is the same call again.
   *
   * The panel's SOURCE size is read off the texture rather than assumed, so a
   * panel that is not 1672x941 is fitted correctly rather than stretched.
   */
  private layout(): void {
    const src = this.image
      ? this.textures.get(this.image.texture.key).getSourceImage() as { width: number; height: number }
      : { width: PANEL_W, height: PANEL_H }
    const at = cutsceneLayout({
      width: viewW(this),
      height: viewH(this),
      insets: safeAreaInsets(),
      panelWidth: src.width || PANEL_W,
      panelHeight: src.height || PANEL_H,
    }, CFG)
    this.placement = at

    if (this.image) {
      this.image.setDisplaySize(at.panel.width, at.panel.height)
      this.image.setPosition(at.panel.x + at.panel.width / 2, at.panel.y + at.panel.height / 2)
    }
    for (const p of this.skipParts) {
      (p as Phaser.GameObjects.Image).setPosition(
        at.skip.x + at.skip.width / 2, at.skip.y + at.skip.height / 2,
      )
    }
    this.counter?.setPosition(
      at.counter.x + at.counter.width / 2, at.counter.y + at.counter.height / 2,
    )
  }

  private drawSkip(): void {
    const label = this.add.text(0, 0, 'SKIP', {
      fontFamily: faceFor(uiSize(CFG.skipLabelSize)),
      fontSize: `${uiSize(CFG.skipLabelSize)}px`,
      color: COLOR.ink,
    }).setOrigin(0.5, 0.5).setDepth(11)
    const plate = this.add
      .rectangle(0, 0, CFG.skipWidth, CFG.skipHeight, CFG.skipFill, CFG.skipFillAlpha)
      .setOrigin(0.5, 0.5).setDepth(10)
      .setStrokeStyle(2, CFG.skipEdge, CFG.skipEdgeAlpha)
    plate.setInteractive({ useHandCursor: true })
    // `pointerup` on the plate, and the plate is above the full-screen zone, so
    // a tap on SKIP does not also count as an advance.
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP,
      (_p: unknown, _x: unknown, _y: unknown, ev: { stopPropagation?: () => void }) => {
        ev?.stopPropagation?.()
        this.skip()
      })

    this.counter = this.add.text(0, 0, '', {
      fontFamily: faceFor(uiSize(CFG.counterSize)),
      fontSize: `${uiSize(CFG.counterSize)}px`,
      color: COLOR.ink,
    }).setOrigin(0.5, 0.5).setAlpha(CFG.counterAlpha).setDepth(11)

    this.skipParts = [plate, label]
    // Placed by `layout`, like everything else. There is no second placement:
    // a control positioned in its own function is a control that gets left
    // behind by the next resize.
    this.layout()
    this.updateCounter()
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

  /** Straight to the level, from one tap, at any point in the comic. That
   *  cheapness is the whole reason the comic can afford to replay every run. */
  private skip(): void {
    if (this.finished) return
    this.handOver('skipped')
  }

  /** The one point every ending goes through -- read to the end, skipped, or
   *  a level with no panels at all -- so they cannot drift apart. It used to
   *  also write the seen flag; nothing is recorded now, because nothing asks. */
  private handOver(why: string): void {
    if (this.finished) return
    this.finished = true
    logEvent('cutscene', `${this.levelId} ${why} -> ${this.next}`)
    this.scene.start(this.next)
  }
}
