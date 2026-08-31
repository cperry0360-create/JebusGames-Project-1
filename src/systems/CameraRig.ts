import Phaser from 'phaser'
import { clampZoom, coverZoom } from './CameraMath.ts'

/**
 * Pan and pinch over the map.
 *
 * The world stays the size it has always been — the painted plate's own
 * 1280x720 — and the camera moves over it. That keeps every gameplay
 * coordinate (waypoints, build pads, ranges) exactly as measured, and lets
 * Phaser translate pointer positions into world space for free.
 *
 * Zoom is expressed as a multiple of *cover* zoom: the zoom at which the map
 * fills the viewport with nothing showing past its edges. That is the floor, so
 * the player can never pan off into blank space, and it recomputes on rotate
 * or resize because it depends on the viewport's shape.
 *
 * Panning must not eat taps. A press starts as a potential tap; it only
 * becomes a pan once the pointer has travelled past `tapSlopPx`, and the
 * scene asks `consumedGesture` before acting on the release.
 */

export interface CameraLimits {
  /** World size in pixels. The camera is clamped to this. */
  worldWidth: number
  worldHeight: number
  /** Multiples of cover zoom. */
  defaultZoom: number
  maxZoom: number
  /** Movement in screen pixels that turns a tap into a pan. */
  tapSlopPx: number
}

export class CameraRig {
  private readonly scene: Phaser.Scene
  private readonly limits: CameraLimits
  /** Set once a press has travelled far enough to be a pan rather than a tap. */
  private panning = false
  /** True for the release that ended a pan, so the scene ignores that tap. */
  private consumed = false
  private startX = 0
  private startY = 0
  private startScrollX = 0
  private startScrollY = 0
  /** Distance between the two fingers when the pinch began. */
  private pinchStart = 0
  private pinchZoomStart = 1
  private enabled = true

  constructor(scene: Phaser.Scene, limits: CameraLimits) {
    this.scene = scene
    this.limits = limits

    const cam = scene.cameras.main
    cam.setBounds(0, 0, limits.worldWidth, limits.worldHeight)
    this.applyZoom(this.cover * limits.defaultZoom)
    cam.centerOn(limits.worldWidth / 2, limits.worldHeight / 2)

    scene.input.on('pointerdown', this.onDown, this)
    scene.input.on('pointermove', this.onMove, this)
    scene.input.on('pointerup', this.onUp, this)
    // A mouse wheel is the desktop equivalent of a pinch.
    scene.input.on('wheel', this.onWheel, this)
    scene.scale.on('resize', this.onResize, this)
  }

  /** Cover zoom for the viewport as it is right now. */
  get cover(): number {
    const cam = this.scene.cameras.main
    return coverZoom(cam.width, cam.height, this.limits.worldWidth, this.limits.worldHeight)
  }

  get zoom(): number {
    return this.scene.cameras.main.zoom
  }

  /** True when the gesture that just ended was a pan, so its release must not
   *  be treated as a tap on the world. */
  get consumedGesture(): boolean {
    return this.consumed
  }

  /** Switched off while a modal owns the screen. */
  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) this.panning = false
  }

  destroy(): void {
    const s = this.scene
    s.input.off('pointerdown', this.onDown, this)
    s.input.off('pointermove', this.onMove, this)
    s.input.off('pointerup', this.onUp, this)
    s.input.off('wheel', this.onWheel, this)
    s.scale.off('resize', this.onResize, this)
  }

  private applyZoom(z: number): void {
    const cam = this.scene.cameras.main
    cam.setZoom(clampZoom(z, this.cover, this.limits.maxZoom))
  }

  /**
   * Phaser clamps the camera to its bounds itself, in `preRender`, and its
   * `scrollX` is the top-left of the *unzoomed* camera rect rather than of the
   * visible world rectangle — so a hand-rolled `scroll + width/zoom <= world`
   * clamp fights it and loses. `setBounds` in the constructor is the whole
   * mechanism; `cameras.main.worldView` is what to check it against.
   */
  /** Zooms about a screen point, so the world under the fingers stays put. */
  private zoomAround(z: number, screenX: number, screenY: number): void {
    const cam = this.scene.cameras.main
    const before = cam.getWorldPoint(screenX, screenY)
    this.applyZoom(z)
    const after = cam.getWorldPoint(screenX, screenY)
    cam.scrollX += before.x - after.x
    cam.scrollY += before.y - after.y
  }

  private onResize = (): void => {
    // Cover zoom depends on the viewport's shape, so a rotate can leave the
    // camera below the floor and showing blank space past the map.
    this.applyZoom(this.scene.cameras.main.zoom)
  }

  private onDown = (p: Phaser.Input.Pointer): void => {
    if (!this.enabled) return
    this.consumed = false
    const cam = this.scene.cameras.main
    const two = this.scene.input.pointer2
    if (two?.isDown) {
      this.pinchStart = Phaser.Math.Distance.Between(p.x, p.y, two.x, two.y)
      this.pinchZoomStart = cam.zoom
      this.panning = true
      return
    }
    this.panning = false
    this.startX = p.x
    this.startY = p.y
    this.startScrollX = cam.scrollX
    this.startScrollY = cam.scrollY
  }

  private onMove = (p: Phaser.Input.Pointer): void => {
    if (!this.enabled || !p.isDown) return
    const cam = this.scene.cameras.main
    const two = this.scene.input.pointer2

    if (two?.isDown && this.pinchStart > 0) {
      const now = Phaser.Math.Distance.Between(p.x, p.y, two.x, two.y)
      if (now > 0) {
        this.zoomAround(
          this.pinchZoomStart * (now / this.pinchStart),
          (p.x + two.x) / 2,
          (p.y + two.y) / 2,
        )
      }
      this.consumed = true
      return
    }

    const dx = p.x - this.startX
    const dy = p.y - this.startY
    if (!this.panning && Math.hypot(dx, dy) < this.limits.tapSlopPx) return

    this.panning = true
    this.consumed = true
    cam.scrollX = this.startScrollX - dx / cam.zoom
    cam.scrollY = this.startScrollY - dy / cam.zoom
  }

  private onUp = (): void => {
    this.panning = false
    this.pinchStart = 0
    // `consumed` stays true until the next press, so the release that ended a
    // pan is ignored by the scene and the one after it is not.
  }

  private onWheel = (
    _p: Phaser.Input.Pointer,
    _o: unknown,
    _dx: number,
    dy: number,
  ): void => {
    if (!this.enabled) return
    const cam = this.scene.cameras.main
    const pointer = this.scene.input.activePointer
    this.zoomAround(cam.zoom * (dy > 0 ? 0.9 : 1.1), pointer.x, pointer.y)
  }
}
