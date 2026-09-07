// The world map: where a level is chosen.
//
// ONE ROAD, NOT FOUR CARDS. This screen used to be four full-size pictures
// scattered across the design box at hand-authored positions, and every fault
// it had came out of that:
//
//   - the cards read as four different sizes, because each one showed a
//     different amount of its level at a different apparent scale;
//   - the trail between them was drawn in level order but the POSITIONS were
//     not in level order — level 4 sat at the far left because the cards were
//     too big to stack and there was nowhere else it would fit — so the long
//     run across the screen appeared to skip a level;
//   - there was no room for a fifth level, never mind twenty;
//   - and nothing said which level a card was.
//
// It is a road of identical numbered nodes now, laid out along one curve by
// LEVEL ORDER, carrying every planned level whether it is built or not. The
// geometry lives in systems/WorldRoad.ts so the tests measure what the scene
// draws rather than a second copy of it.
//
// COMPOSED, NOT PAINTED, which has not changed. Adding a level touches no art:
//   background  one tiling texture, reused at every size
//   cards       one small picture per level, cropped from that level's own
//               plate by tools/mapcards
//   road        drawn here from the node positions, so moving a level in
//               levels.json moves the road with it
//
// THE ROAD IS WIDER THAN THE SCREEN, and it scrolls sideways — the axis it
// runs on. THE CAMERA DOES NOT MOVE: it is the fixed design-box fit every menu
// uses, and the road is a container inside it whose x is dragged. Gestures on
// a camera belong to CameraRig, which lives on GameScene alone.

import Phaser from 'phaser'
import { LEVELS, furthestUnlocked, isLevelUnlocked, levelDef } from '../systems/Levels.ts'
import {
  ROAD, maxScroll, nodeState, roadNodes, roadWidth, scrollToNode,
  type NodeState, type RoadNode,
} from '../systems/WorldRoad.ts'
import { loadSave, setDifficulty } from '../systems/Save.ts'
import { clearRun, loadRun } from '../systems/RunSave.ts'
import { setRunState } from '../systems/RunState.ts'
import { ART, icon } from '../systems/Art.ts'
import { COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { plateButton } from '../ui/Plate.ts'
import { Dialog } from '../ui/Dialog.ts'
import {
  DIFFICULTIES, difficultyName, resolveDifficultyId,
} from '../systems/Difficulty.ts'
import { fitCameraToDesign, DESIGN_WIDTH, DESIGN_HEIGHT } from '../ui/FitCamera.ts'
import { musicForScene } from '../systems/Music.ts'
import { logEvent } from '../systems/Diagnostics.ts'
import { unlockAudio } from '../systems/Audio.ts'
import { onSceneResize, sceneIsLive } from '../systems/SceneEvents.ts'
import { deviceScale } from '../systems/Resolution.ts'
import { safeAreaInsets } from '../systems/SafeArea.ts'

const WORLD_W = DESIGN_WIDTH
const WORLD_H = DESIGN_HEIGHT

/**
 * How far a press may travel and still count as a tap.
 *
 * The map is dragged with the same finger that picks a level, so without this
 * every scroll that ended over a node would start it. In design units, which
 * is the space the drag is measured in.
 */
const TAP_SLOP = 10

export class WorldMapScene extends Phaser.Scene {
  /**
   * Everything that scrolls. The camera never moves; this does.
   *
   * Public for the harness, which has to be able to tell content that is
   * off screen because it is scrolled away from content that is off screen
   * because the layout put it there. Without that it reports fifteen OFF
   * faults for a road doing exactly what a road is for.
   */
  road!: Phaser.GameObjects.Container
  /** The scrollbar, drawn only when the road is longer than the screen. */
  private bar!: Phaser.GameObjects.Graphics
  private scroll = 0
  /** Where a press started, and how far it has travelled since. */
  private grabX = 0
  private grabScroll = 0
  private dragging = false
  private dragged = 0

  constructor() {
    super('WorldMap')
  }

  create(): void {
    musicForScene('Title')
    // The same fixed fit every menu uses: the whole design box inside the
    // viewport, centred, nothing cropped at any shape. No gesture is bound to
    // it — see CameraRig for the one camera the player drives.
    fitCameraToDesign(this)

    const cleared = loadSave().clearedLevels
    const nodes = roadNodes()

    this.drawBackground()

    this.road = this.add.container(0, 0).setDepth(0)
    this.drawRoad(nodes)
    for (const node of nodes) this.drawNode(node, cleared)

    this.bar = this.add.graphics().setDepth(5)
    this.drawChrome()

    this.bindScroll()
    // Open on the level the player is actually up to. The road is three
    // screens long; opening it at slot one every time would hide their own
    // position behind a drag they have no reason to expect.
    const at = LEVELS.indexOf(furthestUnlocked(cleared))
    this.setScroll(scrollToNode(Math.max(0, at), this.scrollWindow().width))

    // A rotate or a URL-bar collapse changes how much road is on screen, which
    // changes both the clamp and whether the bar is drawn at all. Through the
    // helper so it comes off on DESTROY as well as SHUTDOWN.
    onSceneResize(this, () => { if (sceneIsLive(this)) this.setScroll(this.scroll) })

    unlockAudio(this)
  }

  /* ------------------------------------------------------- the visible width */

  /**
   * The strip of world the road may occupy, in world units.
   *
   * Read off the camera rather than assumed to be the design box: the fit is
   * CONTAIN, so a screen wider than 16:9 sees past both edges of the box and a
   * road clamped to the box would stop with empty parchment beside it.
   *
   * AND INSET BY THE HARDWARE. This is the one thing the design-box menus get
   * for free and a scrolling screen does not: everything composed against the
   * box is already inside the safe area, because fitCameraToDesign fits the
   * box into it — but the road is clamped to what the CAMERA can see, which is
   * the whole canvas, notch included. Without the inset the first node's tap
   * target landed 39pt from the left edge of a screen with a 47pt notch, which
   * is what the harness reported.
   *
   * The CAMERA's own width, not the scene's scale: both are the canvas in
   * physical pixels, and dividing by the camera's zoom is what turns that into
   * world units. Reading `scale.width` for a layout is the mistake
   * camera.test.ts exists to catch — layout is in CSS pixels and this is not
   * layout, it is the camera's own view of the world. The insets ARE in CSS
   * pixels, so they are multiplied by the device scale on the way in.
   *
   * `midPoint` and `zoom` are both set by fitCameraToDesign; `worldView` is
   * not filled in until the first render, which has not happened in `create`.
   *
   * Public for the harness, which reports how many screens long the road is
   * and cannot work that out from the camera alone once the notch is in play.
   */
  scrollWindow(): { left: number; width: number } {
    const cam = this.cameras.main
    const dpr = deviceScale()
    const ins = safeAreaInsets()
    const full = cam.width / cam.zoom
    const left = (ins.left * dpr) / cam.zoom
    const right = (ins.right * dpr) / cam.zoom
    return {
      left: cam.midPoint.x - full / 2 + left,
      width: Math.max(1, full - left - right),
    }
  }

  /* --------------------------------------------------------------- the ground */

  /**
   * The tiling background.
   *
   * A TileSprite rather than a stretched image: the texture is seamless, so
   * repeating it costs one draw and looks the same at every size, where
   * stretching one 1254px square across a 1024-wide iPad would soften it.
   *
   * Drawn WIDER THAN THE ROAD on purpose. The camera fits the design box and
   * centres it, and whatever is left over at a different aspect would
   * otherwise be the dark chrome colour — a map screen with black bars down
   * the sides.
   */
  private drawBackground(): void {
    const w = roadWidth() + WORLD_W * 2
    const bg = this.add.tileSprite(
      WORLD_W / 2, WORLD_H / 2, w, WORLD_H * 3, ART.worldMap.background,
    )
    bg.setDepth(-100)
    // A wash, so the nodes and the type on top of them stay readable against a
    // texture that is deliberately busy at close range.
    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, w, WORLD_H * 3, 0x1a1208, 0.18)
      .setDepth(-99)
  }

  /* ----------------------------------------------------------------- the road */

  /**
   * The road itself: ONE polyline through every node in level order.
   *
   * The screen this replaces drew a separate dotted run between each pair,
   * which is the same picture only while the positions happen to be in order —
   * and they were not, so one run crossed the whole screen and read as though
   * it skipped a level. Order is the position now (see WorldRoad.ts), so a
   * single stroke through the points cannot be out of order.
   *
   * Drawn UNDER the nodes rather than stopping short of them. A road that
   * passes behind a place reads as one road; a road that stops at each place
   * reads as links.
   */
  private drawRoad(nodes: RoadNode[]): void {
    const points = nodes.map((n) => new Phaser.Math.Vector2(n.x, n.y))
    if (points.length < 2) return
    const g = this.add.graphics().setDepth(-50)
    const P = ROAD.path

    g.lineStyle(P.bedWidth, P.bedColour, P.bedAlpha)
    g.strokePoints(points, false, false)
    g.lineStyle(P.surfaceWidth, P.surfaceColour, P.surfaceAlpha)
    g.strokePoints(points, false, false)

    // Steps along the middle. Spaced per segment and started half a step in,
    // so a node never has a dot sitting on its own centre and the two halves
    // of a segment look the same.
    g.fillStyle(P.dotColour, P.dotAlpha)
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!, b = points[i + 1]!
      const len = a.distance(b)
      for (let d = P.dotSpacing / 2; d < len; d += P.dotSpacing) {
        const t = d / len
        g.fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, P.dotRadius)
      }
    }
    this.road.add(g)
  }

  /* ---------------------------------------------------------------- one node */

  /**
   * One node on the road: identical box, identical frame, identical badge.
   *
   * THREE STATES, read off the levels the save says have been beaten and the
   * prerequisite each level names — plus whether the level exists at all:
   *   cleared   full colour, a green frame, a tick
   *   open      full colour, an amber frame and a pulse: play this one
   *   locked    darkened under a padlock, or a bare plate if it is not built
   */
  private drawNode(node: RoadNode, cleared: readonly string[]): void {
    const state = nodeState(node, cleared)
    const style = state === 'cleared' ? ROAD.states.cleared
      : state === 'open' ? ROAD.states.open : ROAD.states.locked
    const N = ROAD.node
    const w = N.width + N.framePad
    const h = N.height + N.framePad

    // The frame and the plate are one drawing: a rounded slab a little larger
    // than the picture, so every node has a border without the art carrying
    // one and an unbuilt node has something to be.
    const frame = this.add.graphics().setDepth(0)
    const paint = (edge: number): void => {
      frame.clear()
      frame.fillStyle(node.level ? ROAD.plate.fill : ROAD.plate.unbuiltFill, 1)
      frame.fillRoundedRect(node.x - w / 2, node.y - h / 2, w, h, N.radius)
      frame.lineStyle(3, edge, 1)
      frame.strokeRoundedRect(node.x - w / 2, node.y - h / 2, w, h, N.radius)
    }
    paint(style.edge)
    this.road.add(frame)

    if (node.level) {
      const key = ART.worldMap.cards[node.level.id]
      const card = this.add.image(node.x, node.y, key)
        .setDisplaySize(N.width, N.height).setDepth(1)
      if (state === 'locked') {
        // Desaturated: a cool grey tint plus reduced alpha reads as "not yet"
        // without hiding which place it is.
        card.setTint(ROAD.states.locked.tint)
        card.setAlpha(ROAD.states.locked.alpha)
      }
      this.road.add(card)
    }

    this.drawBadge(node, state)

    if (state === 'open') this.drawPulse(node)
    if (state === 'locked') this.drawLock(node)
    if (state === 'cleared') this.drawTick(node)

    // A slot with no level behind it says so. A padlock alone reads as "you
    // have not earned this", and the truth is "this does not exist yet" -- a
    // player who reads the first goes looking for what they missed.
    const label = this.drawLabel(
      node,
      node.level ? node.level.name.toUpperCase() : ROAD.plate.unbuiltLabel,
      node.level ? style.label : COLOR.dim,
    )

    if (state !== 'locked') {
      const hit = this.add.rectangle(node.x, node.y, w, h, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true }).setDepth(4)
      hit.on('pointerover', () => paint(ROAD.states.hover))
      hit.on('pointerout', () => paint(style.edge))
      // ON RELEASE, NOT ON PRESS. The same finger drags the map, so a press
      // that travelled is a scroll and must not also start a level.
      hit.on('pointerup', () => {
        if (this.dragged <= TAP_SLOP && node.level) this.startLevel(node.level.id)
      })
      this.road.add(hit)
      return
    }

    // A locked node is given no handler at all, so it cannot start anything
    // however the rest of the screen behaves. Its caption says what would open
    // it — where there is a level behind it to open.
    if (node.level) this.drawUnlockLine(node, label)
  }

  /** The level number, top-left of every node. */
  private drawBadge(node: RoadNode, state: NodeState): void {
    const B = ROAD.badge
    const N = ROAD.node
    const x = node.x - (N.width + N.framePad) / 2 + B.inset + B.radius
    const y = node.y - (N.height + N.framePad) / 2 + B.inset + B.radius
    const edge = state === 'cleared' ? ROAD.states.cleared.edge
      : state === 'open' ? ROAD.states.open.edge : ROAD.states.locked.edge

    const disc = this.add.graphics().setDepth(3)
    disc.fillStyle(ROAD.plate.fill, 0.92)
    disc.fillCircle(x, y, B.radius)
    disc.lineStyle(3, edge, 1)
    disc.strokeCircle(x, y, B.radius)
    this.road.add(disc)

    const t = this.add.text(x, y, `${node.number}`, {
      fontFamily: FONT_UI, fontSize: `${B.size}px`, fontStyle: 'bold',
      color: state === 'locked' ? COLOR.dim : COLOR.ink,
      stroke: '#0d1016', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3)
    this.road.add(t)
  }

  /** The padlock over a locked node. */
  private drawLock(node: RoadNode): void {
    const key = icon(this, 'locked')
    const lock = this.add.image(node.x, node.y, key).setDepth(3)
    const h = ROAD.node.height * ROAD.lockHeight
    const src = this.textures.get(key).getSourceImage()
    lock.setDisplaySize(h * (src.width / src.height), h)
    this.road.add(lock)
  }

  /** A tick in the corner: "you have been here". */
  private drawTick(node: RoadNode): void {
    const N = ROAD.node
    // The UI face, not the display one: the display face has a 44px floor and
    // no exemptions, and a tick does not need 44px.
    const t = this.add.text(
      node.x + N.width / 2 - 6, node.y - N.height / 2 + 2, '✓',
      {
        fontFamily: FONT_UI, fontSize: '34px', fontStyle: 'bold', color: '#6fbf73',
        stroke: '#0d1016', strokeThickness: 5,
      },
    ).setOrigin(1, 0).setDepth(3)
    this.road.add(t)
  }

  /**
   * The pulse around the one level that is open and unplayed.
   *
   * The only thing on this screen that moves, so "where am I up to" is
   * answered before anything has to be read.
   */
  private drawPulse(node: RoadNode): void {
    const R = ROAD.ring
    const N = ROAD.node
    const w = N.width + N.framePad + R.spread * 2
    const h = N.height + N.framePad + R.spread * 2
    const g = this.add.graphics().setDepth(2)
    g.lineStyle(R.width, ROAD.states.open.edge, 1)
    g.strokeRoundedRect(node.x - w / 2, node.y - h / 2, w, h, N.radius + R.spread)
    g.setAlpha(R.alpha)
    this.road.add(g)
    this.tweens.add({
      targets: g, alpha: { from: R.alpha, to: 0.1 },
      duration: R.periodMs / 2, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
  }

  /** The line under a node: the level's name, or that there is no level yet. */
  private drawLabel(node: RoadNode, text: string, colour: string): Phaser.GameObjects.Text {
    const N = ROAD.node
    // WRAPPED TO THE NODE. "SPORTS COMPLEX AT DUSK" sets far wider than a node
    // is, and unwrapped it would lie across its neighbours.
    const t = this.add.text(
      node.x, node.y + (N.height + N.framePad) / 2 + ROAD.label.gap,
      text,
      {
        fontFamily: FONT_UI, fontSize: `${ROAD.label.size}px`, fontStyle: 'bold',
        color: colour, stroke: '#0d1016', strokeThickness: 4,
        wordWrap: { width: N.width }, align: 'center',
      },
    ).setOrigin(0.5, 0).setDepth(2)
    this.road.add(t)
    return t
  }

  /**
   * What would open this level, under its name.
   *
   * IT NAMES THE LEVEL. It used to read `Clear a run to unlock`, `Clear 2
   * runs`, `Clear 3 runs` — true of the arithmetic behind it and no use to a
   * player, who has to guess two runs of WHAT. The level knows which level
   * opens it now, so the caption says so.
   *
   * A prerequisite that is not a level falls back to a plain "Locked". That is
   * a typo in levels.json rather than a state a player can be in — a test
   * fails the build on it — and a caption is not the place to shout about it.
   */
  private drawUnlockLine(node: RoadNode, label: Phaser.GameObjects.Text): void {
    const need = node.level!.unlockedBy
    const prereq = need === null ? null : levelDef(need)
    // UNDER THE NAME, MEASURED. A fixed offset is one line of title plus a
    // gap, and the longest level name wraps to three now that it is held to
    // the node's width, so a fixed offset put this line through the last one.
    const t = this.add.text(
      node.x, label.y + label.height + 4,
      prereq ? `Clear ${prereq.name.toUpperCase()} to unlock` : 'Locked',
      {
        fontFamily: FONT_UI, fontSize: `${ROAD.label.size}px`, color: COLOR.dim,
        stroke: '#0d1016', strokeThickness: 3,
        wordWrap: { width: ROAD.pitch - 10 }, align: 'center',
      },
    ).setOrigin(0.5, 0).setDepth(2)
    this.road.add(t)
  }

  /* -------------------------------------------------------------- scrolling */

  private bindScroll(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true
      this.dragged = 0
      this.grabX = p.worldX
      this.grabScroll = this.scroll
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return
      const dx = p.worldX - this.grabX
      this.dragged = Math.max(this.dragged, Math.abs(dx))
      this.setScroll(this.grabScroll - dx)
    })
    // Cleared on the NEXT tick, not here: a node's own pointerup fires after
    // this one, and it is what has to see how far the press travelled.
    this.input.on('pointerup', () => {
      this.dragging = false
      this.time.delayedCall(0, () => { this.dragged = 0 })
    })
    this.input.on('wheel', (
      _p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number,
    ) => {
      // Either axis scrolls the one axis this screen has. A trackpad reports a
      // sideways flick as dx and a mouse wheel reports everything as dy.
      this.setScroll(this.scroll + (Math.abs(dx) > Math.abs(dy) ? dx : dy))
    })
  }

  /** Clamps, moves the road and redraws the bar. The one way scroll changes. */
  private setScroll(to: number): void {
    const win = this.scrollWindow()
    const max = maxScroll(win.width)
    this.scroll = Math.max(0, Math.min(max, to))
    this.road.x = max > 0
      ? win.left - this.scroll
      // Shorter than the screen: centred, and nothing to scroll.
      : win.left + (win.width - roadWidth()) / 2
    this.drawBar(win.width, max)
  }

  /**
   * The scrollbar: horizontal, because that is the axis the road runs on, and
   * ABSENT when the whole road is on screen.
   *
   * Drawn rather than made a control. The map is dragged directly, so this
   * reports where you are; a 12-unit-tall control would be an eight-pixel tap
   * target on a phone, which is the kind of thing the harness exists to catch.
   */
  private drawBar(visW: number, max: number): void {
    this.bar.clear()
    if (max <= 0) return

    const S = ROAD.scrollbar
    // Against the design box, not the visible width: the box is the part of
    // the screen that is on every device, and a bar centred on it is centred
    // under the road at every shape.
    const left = (WORLD_W - S.width) / 2
    const r = S.height / 2

    this.bar.fillStyle(S.trackColour, S.trackAlpha)
    this.bar.fillRoundedRect(left, S.y - r, S.width, S.height, r)
    this.bar.lineStyle(2, S.trackEdge, 0.9)
    this.bar.strokeRoundedRect(left, S.y - r, S.width, S.height, r)

    const thumb = Math.max(S.minThumb, S.width * (visW / roadWidth()))
    const x = left + (S.width - thumb) * (this.scroll / max)
    this.bar.fillStyle(S.thumbColour, 1)
    this.bar.fillRoundedRect(x, S.y - r, thumb, S.height, r)
    this.bar.lineStyle(2, S.thumbEdge, 1)
    this.bar.strokeRoundedRect(x, S.y - r, thumb, S.height, r)
  }

  /* ----------------------------------------------------------------- chrome */

  /** The title, the resume offer and the way back. */
  private drawChrome(): void {
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

    this.drawDifficultyChip()
  }

  /**
   * The difficulty, shown and changed HERE.
   *
   * THIS SCREEN AND NOWHERE ELSE, which is what makes "it cannot be changed
   * once a level has started" true. GameScene reads the setting once, on the
   * frame the level is created, and never asks again — so the rule is a
   * property of when the value is captured rather than a flag anybody has to
   * remember to check.
   *
   * A CHIP THAT OPENS A PANEL rather than three buttons in a row. Three
   * 200px buttons want 624px of the bottom row and the row already holds BACK
   * and, when there is a run to pick up, RESUME. The panel also has room for
   * each mode's one-line description, which a segmented control does not —
   * and "what does Lazy Dad Mode actually do" is the question a player has at
   * exactly this moment.
   */
  private drawDifficultyChip(): void {
    // TOP RIGHT, ON THE TITLE'S LINE, and not in the bottom row with BACK.
    //
    // The bottom row already holds BACK and, when there is a run to pick up,
    // RESUME — 280px and 200px of a 1280px design box, centred. A chip beside
    // them fits until the day a level name or a third button grows, and the
    // caption over it would land on the scrollbar at y 610 whatever height it
    // was set at. The title is centred and about 560px wide, so everything
    // past x 940 is empty on every screen.
    const id = resolveDifficultyId(loadSave().difficultyId)
    this.add.text(1120, 26, 'DIFFICULTY', {
      // 22px: this screen is composed against the design box and fitted, so
      // it is held to the menu floor rather than the screen-space one.
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim,
      stroke: '#0d1016', strokeThickness: 4, letterSpacing: 1,
    }).setOrigin(0.5).setDepth(10)
    plateButton(this, 1120, 68, 280, 48, difficultyName(id).toUpperCase(),
      () => this.pickDifficulty(), 20, 'secondary')
  }

  private pickDifficulty(): void {
    const current = resolveDifficultyId(loadSave().difficultyId)
    // IN DESIGN-BOX UNITS, NOT CSS PIXELS. This scene's camera is fitted by
    // `fitCameraToDesign`, so its world units are the 1280x720 box — the same
    // units the chip above is placed in. Handing the dialog `viewW`/`viewH`
    // here would centre it on (422, 195) of the box on an 844x390 phone, which
    // is up and to the left of centre with the scrim short of two edges.
    new Dialog(this, WORLD_W / 2, WORLD_H / 2, 900, {
      space: { width: WORLD_W, height: WORLD_H },
      title: 'DIFFICULTY',
      subtitle: 'Changes lives and starting peanuts. The enemies are the same on all three.',
      choices: DIFFICULTIES.map((d) => ({
        name: d.name,
        lines: [
          `Lives ×${d.livesMultiplier}`,
          `Starting peanuts ×${d.peanutsMultiplier}`,
        ],
        cost: d.blurb,
        takes: '',
        label: d.id === current ? 'CURRENT' : 'CHOOSE',
        onPick: () => {
          setDifficulty(d.id)
          // Redrawn rather than patched: the chip's label, and nothing else on
          // this screen, depends on the setting. Restarting the scene is the
          // one way to be sure the two agree.
          this.scene.restart()
        },
      })),
      cancelLabel: 'CLOSE',
      dim: 0.6,
    })
  }

  /** Begins a run on a level the player has actually unlocked. */
  private startLevel(id: string): void {
    const cleared = loadSave().clearedLevels
    // Re-checked here rather than trusted to the node having no handler. The
    // node is a drawing; this is where the run begins.
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
