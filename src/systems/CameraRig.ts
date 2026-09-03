import Phaser from 'phaser'
import {
  anchorCenter,
  centerRange,
  clampZoom,
  coverZoom,
  pinchScale,
  safeScroll,
  smoothing,
  worldAt,
} from './CameraMath.ts'
import { onSceneResize, sceneIsLive } from './SceneEvents.ts'

/**
 * Pan and pinch over the map.
 *
 * The world stays the size it has always been — the painted plate's own
 * 1280x720 — and the camera moves over it. That keeps every gameplay
 * coordinate (waypoints, build pads, ranges) exactly as measured.
 *
 * Zoom is expressed as a multiple of *cover* zoom: the zoom at which the map
 * fills the viewport with nothing showing past its edges. That is the floor,
 * and it recomputes on rotate because it depends on the viewport's shape.
 *
 * Two things make this feel like a phone game rather than a debug camera:
 *
 * **Nothing is written to the camera from an input handler.** Handlers only
 * move a *target*. A single place, `update`, eases the real camera toward that
 * target every frame. Every jump the old rig had came from a handler writing
 * `cam.scrollX` directly from a delta measured against a stale origin; with a
 * target there is no origin to go stale, and a mid-gesture mode change is just
 * a re-anchor that leaves the target where it already was.
 *
 * **Pointers are tracked explicitly.** The old rig asked `input.pointer2` at
 * pointerdown to decide whether a pinch had started, which fails in exactly
 * the case it exists for: when the second finger is the one going down, it
 * *is* `pointer2`, so the "distance between the fingers" was the distance from
 * a point to itself — zero. The pinch never armed, and the second finger fell
 * through to the pan branch and dragged from the first finger's origin. Here
 * the rig keeps its own map of live pointers and derives the mode from how
 * many there are.
 *
 * Panning must not eat taps. A press starts as a potential tap; it only
 * becomes a pan once the pointer has travelled past `tapSlopPx`, and the scene
 * asks `consumedGesture` before acting on the release.
 */

export interface CameraLimits {
  /** World size in pixels. The camera is clamped to this. */
  worldWidth: number
  worldHeight: number
  /** Multiples of cover zoom. */
  /** Where the view is centred when the run opens. Defaults to the middle of
   *  the map, which is only the right answer when the whole map is visible. */
  startX?: number
  startY?: number
  /** Absolute zoom the run starts at, chosen so a tower renders at the size
   *  the art was drawn for. Raised to cover on a viewport that needs more. */
  defaultZoom: number
  /** Where the run OPENS, if that is not the design default. The board is
   *  framed on the first frame so the player can see the whole lane before
   *  the first wave; the default is what a reset returns to. */
  startZoom?: number
  /** Absolute ceiling, a little above the default. */
  maxZoom: number
  /** Absolute floor, a little below it. The band is deliberately narrow: the
   *  player may adjust the framing, never zoom out far enough to take in the
   *  whole map, which is what made everything read small. */
  minZoom?: number
  /** How far past the map edge the view may reach before panning stops. */
  boundsMarginPx?: number
  /** Movement in screen pixels that turns a tap into a pan. */
  tapSlopPx: number
  /** Map travel per unit of finger travel. Below 1 so a drag is not twitchy. */
  panSpeed: number
  /** Exponent on the pinch ratio. Below 1 so zoom lags the fingers. */
  pinchDamping: number
  /** e-folds per second for the position and zoom eases. */
  followLambda: number
  zoomLambda: number
  /** Fraction of glide velocity surviving one second, and the cutoff speed. */
  momentumDecay: number
  momentumMinSpeed: number
}

type Mode = 'idle' | 'pan' | 'pinch'

interface Live {
  id: number
  x: number
  y: number
}

export class CameraRig {
  private readonly scene: Phaser.Scene
  private readonly limits: CameraLimits

  /** Live pointers in the order they went down. The first two drive gestures. */
  private readonly pointers: Live[] = []
  private mode: Mode = 'idle'
  private enabled = true

  /** Where the camera is easing toward. The camera itself is never set here. */
  private targetCenterX = 0
  private targetCenterY = 0
  private targetZoom = 1

  /**
   * Sets the zoom the rig is easing toward, clamped into the band.
   *
   * For tests and diagnostics. Writing `camera.zoom` directly does not work:
   * the rig owns the zoom and eases back to its own target on the next frame,
   * so an edge-of-band check done that way silently measures the default.
   */
  setTargetZoom(z: number): void {
    this.targetZoom = this.clampZ(z)
  }

  /**
   * Where the camera actually is, as a float, owned here rather than read back
   * from `cam.scrollX`.
   *
   * The game runs with `roundPixels`, which makes Phaser round `scrollX` to a
   * whole number. Easing toward a target by reading that value back deadlocks:
   * once the remaining distance is small enough that a step of it rounds to
   * nothing, every frame computes the same rounded value and the camera parks
   * short of where it is meant to be — visibly, at the map edge, as a sliver of
   * background past the map. Interpolating a float we own and rounding only on
   * the way out fixes it, and is the general rule: never read your own state
   * back out of a lossy sink.
   */
  private curCenterX = 0
  private curCenterY = 0

  /** Pan: the finger position and camera centre when the drag was anchored. */
  private panScreenX = 0
  private panScreenY = 0
  private panCenterX = 0
  private panCenterY = 0

  /** Tap slop is measured from where the first finger actually landed. */
  private downX = 0
  private downY = 0
  private consumed = false

  /** Pinch: the finger separation and zoom it began at, and the world point
   *  under the midpoint, which must stay under the midpoint throughout. */
  private pinchDist = 0
  private pinchZoom = 1
  private pinchWorldX = 0
  private pinchWorldY = 0
  private pinchMidX = 0
  private pinchMidY = 0

  /** Glide, in world pixels per second, and the samples it is measured from. */
  private velX = 0
  private velY = 0
  private lastMoveAt = 0
  private lastMoveX = 0
  private lastMoveY = 0

  constructor(scene: Phaser.Scene, limits: CameraLimits) {
    this.scene = scene
    this.limits = limits

    const cam = scene.cameras.main
    // Deliberately no `setBounds`. Phaser's bounds clamp runs in `preRender`
    // and would flatten the rubber band at the map edge back to a hard stop.
    // The clamp is owned here instead, against the camera *centre*, which is
    // the quantity that actually has to stay inside the world.
    // An absolute zoom, not a multiple of cover: the point of the number is
    // the size a tower is on the glass, and that cannot depend on how wide the
    // window happens to be.
    // THE OPENING ZOOM IS CLAMPED AGAINST COVER, NOT AGAINST THE BAND.
    //
    // `minZoom` is a floor on the PINCH — it stops a gesture parking the whole
    // map at a scale where a tower is a smudge — and on this map it sits above
    // the zoom that frames the board. Putting the opening through it would
    // hand back a first frame with a fifth of the lane missing, which is the
    // fault being fixed. Cover is still enforced, so the map always fills the
    // screen: what is relaxed is the design minimum, not honesty about the
    // edge of the world.
    //
    // The consequence, deliberately not hidden: the first pinch clamps back
    // into the band, so a player who opens wider than `minZoom` and then
    // pinches will see the view step in once. That is the cost of leaving the
    // band alone, and the band is where the fix belongs if it ever grates.
    this.targetZoom = limits.startZoom !== undefined
      ? clampZoom(limits.startZoom, this.cover, limits.maxZoom)
      : this.clampZ(limits.defaultZoom)
    // Where the run opens. Callers point it at the board's own centre, which
    // is what the opening zoom is framing.
    this.targetCenterX = limits.startX ?? limits.worldWidth / 2
    this.targetCenterY = limits.startY ?? limits.worldHeight / 2
    cam.setZoom(this.targetZoom)
    this.writeCenter(this.targetCenterX, this.targetCenterY)

    scene.input.on('pointerdown', this.onDown, this)
    scene.input.on('pointermove', this.onMove, this)
    scene.input.on('pointerup', this.onUp, this)
    scene.input.on('pointerupoutside', this.onUp, this)
    // A mouse wheel is the desktop equivalent of a pinch.
    scene.input.on('wheel', this.onWheel, this)
    // The input plugin is the scene's own and Phaser tears it down with the
    // scene, so the five above are safe either way. The ScaleManager is not:
    // it belongs to the game and outlives every run, so this one goes through
    // the helper and comes off on SHUTDOWN and DESTROY both.
    onSceneResize(scene, this.onResize)
  }

  /* ---------------------------------------------------------- accessors */

  /** Cover zoom for the viewport as it is right now. */
  get cover(): number {
    const cam = this.scene.cameras.main
    return coverZoom(cam.width, cam.height, this.limits.worldWidth, this.limits.worldHeight)
  }

  get zoom(): number {
    return this.scene.cameras.main.zoom
  }

  /** For tests and the harness: which gesture is in progress right now. */
  get gesture(): Mode {
    return this.mode
  }

  /** Internals, for the harness. Nothing in the game reads this. */
  get debug(): Record<string, number | string> {
    return {
      mode: this.mode,
      fingers: this.pointers.length,
      ids: this.pointers.map((q) => q.id).join(','),
      centerX: this.curCenterX,
      centerY: this.curCenterY,
      targetCenterX: this.targetCenterX,
      targetCenterY: this.targetCenterY,
      targetZoom: this.targetZoom,
      velX: this.velX,
      velY: this.velY,
      moves: this.moveCount,
    }
  }

  /** Counts pointermove events the rig accepted, so a scenario can tell "the
   *  gesture did nothing" from "the events never arrived". */
  moveCount = 0

  /** Whether the rig is currently listening. Read by the harness. */
  get isEnabled(): boolean {
    return this.enabled
  }

  /** True when the gesture that just ended was a pan or a pinch, so its
   *  release must not be treated as a tap on the world. */
  get consumedGesture(): boolean {
    return this.consumed
  }

  /** Switched off while a modal owns the screen. */
  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) this.endAll()
  }

  destroy(): void {
    const s = this.scene
    s.input.off('pointerdown', this.onDown, this)
    s.input.off('pointermove', this.onMove, this)
    s.input.off('pointerup', this.onUp, this)
    s.input.off('pointerupoutside', this.onUp, this)
    s.input.off('wheel', this.onWheel, this)
    // The resize subscription unregisters itself; see the constructor.
  }

  /* ------------------------------------------------------- camera access */

  private clampZ(z: number): number {
    return clampZoom(z, this.cover, this.limits.maxZoom, this.limits.minZoom ?? 0)
  }

  private writeCenter(
    x: number,
    y: number,
    rx?: { min: number; max: number },
    ry?: { min: number; max: number },
  ): void {
    const cam = this.scene.cameras.main
    this.curCenterX = x
    this.curCenterY = y
    const sx = x - cam.width / 2
    const sy = y - cam.height / 2
    // Rounded inside the legal range rather than left to Phaser's own
    // rounding, which could put the rendered view a pixel past the map edge.
    cam.scrollX = rx ? safeScroll(sx, rx.min - cam.width / 2, rx.max - cam.width / 2) : sx
    cam.scrollY = ry ? safeScroll(sy, ry.min - cam.height / 2, ry.max - cam.height / 2) : sy
  }

  /**
   * Adopts the camera if something outside the rig moved it.
   *
   * Nothing in the game does; the test harness does, and a rig that silently
   * yanked the view back would make every scenario after it a lie. The
   * threshold clears the sub-pixel disagreement `roundPixels` leaves behind
   * every frame without swallowing a real jump.
   */
  private adopt(): void {
    const cam = this.scene.cameras.main
    const cx = cam.scrollX + cam.width / 2
    const cy = cam.scrollY + cam.height / 2
    if (Math.abs(cx - this.curCenterX) > 2) {
      this.curCenterX = cx
      this.targetCenterX = cx
    }
    if (Math.abs(cy - this.curCenterY) > 2) {
      this.curCenterY = cy
      this.targetCenterY = cy
    }
  }

  /* --------------------------------------------------------- the frame */

  /**
   * Eases the camera toward its target. Called every frame by the scene.
   *
   * Order matters. Zoom settles first, then a live pinch recomputes where the
   * centre has to be *for the zoom the camera actually reached*, not the one
   * it is heading for — otherwise the map slides out from under the fingers
   * for as long as the zoom is still easing in.
   */
  update(dt: number): void {
    const cam = this.scene.cameras.main
    const step = Math.max(dt, 0)
    this.prune()
    this.adopt()

    // A glide only runs when no finger is down.
    if (this.mode === 'idle' && (this.velX !== 0 || this.velY !== 0)) {
      this.targetCenterX += this.velX * step
      this.targetCenterY += this.velY * step
      const keep = Math.pow(this.limits.momentumDecay, step)
      this.velX *= keep
      this.velY *= keep
      if (Math.hypot(this.velX, this.velY) < this.limits.momentumMinSpeed) {
        this.velX = 0
        this.velY = 0
      }
    }

    const z = Phaser.Math.Linear(
      cam.zoom,
      this.targetZoom,
      smoothing(this.limits.zoomLambda, step),
    )
    cam.setZoom(z)

    if (this.mode === 'pinch') {
      this.targetCenterX = anchorCenter(this.pinchWorldX, this.pinchMidX, cam.width, z)
      this.targetCenterY = anchorCenter(this.pinchWorldY, this.pinchMidY, cam.height, z)
    }

    // The map edge is a wall, not a spring. The rubber band let a drag pull
    // past the edge and show the void beyond the map before snapping back,
    // which reads as the camera losing its place rather than as resistance.
    // Clamped every frame, target and actual alike, so the edge is never
    // crossed in the first place and there is nothing to correct.
    const m = this.limits.boundsMarginPx ?? 0
    const rx = centerRange(cam.width, this.limits.worldWidth, z, m)
    const ry = centerRange(cam.height, this.limits.worldHeight, z, m)
    const cx = Math.min(Math.max(this.targetCenterX, rx.min), rx.max)
    const cy = Math.min(Math.max(this.targetCenterY, ry.min), ry.max)
    // Momentum must not keep pushing into a wall it cannot pass.
    if (cx !== this.targetCenterX) this.velX = 0
    if (cy !== this.targetCenterY) this.velY = 0
    this.targetCenterX = cx
    this.targetCenterY = cy

    const t = smoothing(this.limits.followLambda, step)
    this.writeCenter(
      Math.min(Math.max(Phaser.Math.Linear(this.curCenterX, this.targetCenterX, t), rx.min), rx.max),
      Math.min(Math.max(Phaser.Math.Linear(this.curCenterY, this.targetCenterY, t), ry.min), ry.max),
      rx,
      ry,
    )
  }

  /* -------------------------------------------------------- gesture state */

  private find(id: number): Live | undefined {
    return this.pointers.find((q) => q.id === id)
  }

  /** Anchors a pan at the given pointer without moving the camera: the target
   *  is recorded as it stands, so the first frame's delta is zero. */
  private beginPan(p: Live): void {
    this.mode = 'pan'
    this.panScreenX = p.x
    this.panScreenY = p.y
    this.panCenterX = this.targetCenterX
    this.panCenterY = this.targetCenterY
    this.lastMoveAt = this.scene.time.now
    this.lastMoveX = this.targetCenterX
    this.lastMoveY = this.targetCenterY
    this.velX = 0
    this.velY = 0
  }

  /** Arms a pinch on the first two live pointers. Records the separation, and
   *  the world point under the midpoint, which is what stays put. */
  private beginPinch(): void {
    const [a, b] = this.pointers
    if (!a || !b) return
    const cam = this.scene.cameras.main
    this.mode = 'pinch'
    this.velX = 0
    this.velY = 0
    this.pinchDist = Math.max(Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), 1)
    this.pinchZoom = this.targetZoom
    this.pinchMidX = (a.x + b.x) / 2 - cam.x
    this.pinchMidY = (a.y + b.y) / 2 - cam.y
    this.pinchWorldX = worldAt(this.pinchMidX, this.targetCenterX, cam.width, this.targetZoom)
    this.pinchWorldY = worldAt(this.pinchMidY, this.targetCenterY, cam.height, this.targetZoom)
    this.consumed = true
  }

  private endAll(): void {
    this.mode = 'idle'
    this.pointers.length = 0
    this.velX = 0
    this.velY = 0
  }

  /* ------------------------------------------------------------ handlers */

  private onDown = (p: Phaser.Input.Pointer): void => {
    if (!this.enabled) return
    if (!this.find(p.id)) this.pointers.push({ id: p.id, x: p.x, y: p.y })

    if (this.pointers.length === 1) {
      this.consumed = false
      this.downX = p.x
      this.downY = p.y
      // Not a pan yet: a press this short is still a tap. Killing any glide
      // now is what makes a second tap feel like it caught a moving camera.
      this.mode = 'idle'
      this.velX = 0
      this.velY = 0
      this.targetCenterX = this.curCenterX
      this.targetCenterY = this.curCenterY
    } else if (this.pointers.length === 2) {
      // The second finger ends the pan outright rather than becoming a new pan
      // origin. This is the case the old rig got wrong.
      this.beginPinch()
    }
    // A third finger is ignored; the first two keep the gesture.
  }

  private onMove = (p: Phaser.Input.Pointer): void => {
    if (!this.enabled) return
    const live = this.find(p.id)
    if (!live) return
    this.moveCount++
    live.x = p.x
    live.y = p.y

    if (this.mode === 'pinch') {
      this.trackPinch()
      return
    }
    if (this.pointers.length !== 1) return

    const dx = p.x - this.downX
    const dy = p.y - this.downY
    if (this.mode !== 'pan') {
      if (Math.hypot(dx, dy) < this.limits.tapSlopPx) return
      // Anchor at the point the slop was crossed, not where the finger landed,
      // or the map lurches by the slop distance the moment a pan begins.
      this.beginPan(live)
      this.consumed = true
      return
    }

    this.trackPan(live)
  }

  private trackPan(live: Live): void {
    const cam = this.scene.cameras.main
    const speed = this.limits.panSpeed / cam.zoom
    this.targetCenterX = this.panCenterX - (live.x - this.panScreenX) * speed
    this.targetCenterY = this.panCenterY - (live.y - this.panScreenY) * speed

    // Velocity for the glide, sampled over the gap since the last move. A
    // single frame's delta is too noisy; anything older than ~80ms is stale
    // and would launch the camera after the finger has already stopped.
    const now = this.scene.time.now
    const gap = (now - this.lastMoveAt) / 1000
    if (gap > 0.004) {
      this.velX = (this.targetCenterX - this.lastMoveX) / gap
      this.velY = (this.targetCenterY - this.lastMoveY) / gap
      this.lastMoveAt = now
      this.lastMoveX = this.targetCenterX
      this.lastMoveY = this.targetCenterY
    }
  }

  private trackPinch(): void {
    const [a, b] = this.pointers
    if (!a || !b) return
    const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)
    if (dist <= 0) return
    const vp = this.scene.cameras.main
    this.pinchMidX = (a.x + b.x) / 2 - vp.x
    this.pinchMidY = (a.y + b.y) / 2 - vp.y
    this.targetZoom = this.clampZ(
      this.pinchZoom * pinchScale(dist / this.pinchDist, this.limits.pinchDamping),
    )
    // The centre is not touched here. `update` derives it from the anchor once
    // it knows what zoom the camera actually reached this frame.
  }

  private onUp = (p: Phaser.Input.Pointer): void => {
    this.release(p.id)
  }

  /**
   * One finger is gone, however we found that out.
   *
   * Every transition here re-anchors rather than resetting, so the camera does
   * not move on the frame a finger leaves.
   */
  private release(id: number): void {
    const i = this.pointers.findIndex((q) => q.id === id)
    if (i >= 0) this.pointers.splice(i, 1)

    if (this.pointers.length >= 2) {
      // Three fingers down to two: re-arm the pinch on whichever two are left,
      // from their current separation, so the zoom does not jump.
      this.beginPinch()
      return
    }
    if (this.pointers.length === 1) {
      // A pinch losing a finger. Hand the remaining one a pan anchored where
      // it is now against the camera as it now stands — its delta starts at
      // zero, so nothing moves on the transition.
      const rest = this.pointers[0]
      if (rest) {
        this.beginPan(rest)
        // Whatever this gesture becomes, it started as a pinch: its release is
        // not a tap on the map.
        this.consumed = true
      }
      return
    }

    // Last finger up. A pan hands over its velocity to the glide; a pinch or a
    // tap has none to hand over.
    if (this.mode !== 'pan') {
      this.velX = 0
      this.velY = 0
    } else if ((this.scene.time.now - this.lastMoveAt) / 1000 > 0.08) {
      // The finger was resting before it lifted, so there is nothing to carry.
      this.velX = 0
      this.velY = 0
    }
    this.mode = 'idle'
    // `consumed` stays as it is until the next press, so the release that
    // ended a gesture is ignored by the scene and the one after it is not.
  }

  /**
   * Drops fingers Phaser no longer considers down.
   *
   * A finger that leaves the canvas, or a touch the browser cancels, does not
   * reliably send an up — and listening for `gameout` instead is worse than
   * useless: it fires while a finger is still down, which silently cleared
   * every tracked pointer and left panning dead while pinch still worked.
   * Phaser's own pointer state is the one source that cannot drift.
   */
  private prune(): void {
    if (this.pointers.length === 0) return
    const all = this.scene.input.manager.pointers
    for (const q of [...this.pointers]) {
      const ph = all.find((x) => x.id === q.id)
      if (!ph || !ph.isDown) this.release(q.id)
    }
  }

  private onWheel = (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number): void => {
    if (!this.enabled) return
    const cam = this.scene.cameras.main
    const at = this.scene.input.activePointer
    const before = this.targetZoom
    this.targetZoom = this.clampZ(before * (dy > 0 ? 0.88 : 1.14))
    // Keep the world under the cursor under the cursor, solved against the
    // zoom being aimed at rather than the one on screen.
    // In the camera's own space: its viewport no longer starts at the top of
    // the screen, so a raw pointer y would anchor a band's height too low.
    const ax = at.x - cam.x
    const ay = at.y - cam.y
    const wx = worldAt(ax, this.targetCenterX, cam.width, before)
    const wy = worldAt(ay, this.targetCenterY, cam.height, before)
    this.targetCenterX = anchorCenter(wx, ax, cam.width, this.targetZoom)
    this.targetCenterY = anchorCenter(wy, ay, cam.height, this.targetZoom)
  }

  private onResize = (): void => {
    // Reachable from the game-owned ScaleManager, so it has to survive one
    // late delivery after the scene has gone: viewportChanged reads the camera.
    if (!sceneIsLive(this.scene)) return
    // Cover zoom depends on the viewport's shape, so a rotate can leave the
    // camera below the floor and showing blank space past the map.
    this.viewportChanged()
  }

  /**
   * The camera's viewport is no longer the whole screen.
   *
   * The world camera is inset by the reserved HUD bands, so its width and
   * height — which every clamp here is computed from — change without the
   * window changing size at all. Re-clamping zoom is what stops a shorter
   * viewport from leaving the map floating in a gap it no longer fills.
   */
  viewportChanged(): void {
    this.targetZoom = this.clampZ(this.targetZoom)
    this.scene.cameras.main.setZoom(this.targetZoom)
  }
}
