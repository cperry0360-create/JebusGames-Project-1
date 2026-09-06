import Phaser from 'phaser'
import displayData from '../data/display.json'
import { fitScale } from '../systems/CameraMath.ts'
import { deviceScale } from '../systems/Resolution.ts'
import { safeAreaInsets } from '../systems/SafeArea.ts'
import { onSceneResize, sceneIsLive } from '../systems/SceneEvents.ts'

/**
 * The fixed UI camera.
 *
 * Menu screens are composed against a 1280x720 design box. The canvas is the
 * device viewport now, so on a phone in landscape that box is both a different
 * size and a different shape — and a scene that positions a hero card at y=282
 * puts it off the bottom of a 393px-tall screen.
 *
 * This fits the whole design box inside the viewport with a single uniform
 * scale and centres it, so **nothing is ever cut off at any device size**. It
 * is a fixed transform: no gestures are bound to it, nothing pans, and the
 * player cannot change it. That is the difference that matters — the world
 * camera is driven by the player, this one is not.
 *
 * The HUD, dialogs and panels do not use this. They are laid out against the
 * live viewport and render 1:1; only the fixed-design menu screens need
 * fitting.
 */

export const DESIGN_WIDTH = displayData.width
export const DESIGN_HEIGHT = displayData.height

/**
 * Fits this scene's camera to the design box and keeps it fitted through
 * rotations and resizes. Returns nothing to bind: menus take no gestures.
 */
export function fitCameraToDesign(
  scene: Phaser.Scene,
  designW = DESIGN_WIDTH,
  designH = DESIGN_HEIGHT,
): void {
  const apply = (): void => {
    const cam = scene.cameras.main
    // Whatever the fit leaves over is the game's dark chrome, not the grass
    // green the world camera clears to.
    cam.setBackgroundColor(0x10161d)

    // THE CAMERA COVERS THE WHOLE CANVAS; THE CONTENT RESPECTS THE HARDWARE.
    //
    // Those are two different things and the first attempt at this conflated
    // them. Insetting the camera's VIEWPORT by the safe area did keep the
    // controls clear of the notch -- and it also stopped the painted backdrop
    // reaching the edges of the screen, so the inset strip showed whatever the
    // canvas clears to. That was grass green, and it read as a rendering
    // fault: a green band around a dark game.
    //
    // So the viewport stays full-bleed. What the insets do instead is shrink
    // the BOX THE DESIGN IS FITTED INTO and move its centre onto the centre of
    // the safe area. Everything composed against the design box lands inside
    // the hardware; everything drawn beyond it -- the room, the map, the
    // painted ground -- runs off the edges the way a background should.
    const dpr = deviceScale()
    const insets = safeAreaInsets()
    cam.setViewport(0, 0, scene.scale.width, scene.scale.height)
    const safeW = Math.max(1, scene.scale.width - (insets.left + insets.right) * dpr)
    const safeH = Math.max(1, scene.scale.height - (insets.top + insets.bottom) * dpr)

    // Physical pixels on purpose. Everything else in the game measures in CSS
    // pixels via `viewW`/`viewH`, but this fits a fixed design box to whatever
    // the canvas actually is -- which is why the menus came out at full
    // resolution with no other change when the canvas did.
    const zoom = fitScale(safeW, safeH, designW, designH)
    cam.setZoom(zoom)

    // Centre the design box on the middle of the SAFE area rather than the
    // middle of the canvas, so an inset on one side only (a notch in landscape)
    // pushes the content away from it instead of splitting the difference.
    const safeMidX = (insets.left * dpr + (scene.scale.width - insets.right * dpr)) / 2
    const safeMidY = (insets.top * dpr + (scene.scale.height - insets.bottom * dpr)) / 2
    const offX = (safeMidX - scene.scale.width / 2) / zoom
    const offY = (safeMidY - scene.scale.height / 2) / zoom
    cam.centerOn(designW / 2 - offX, designH / 2 - offY)
  }
  apply()
  // SHUTDOWN and DESTROY both, and guarded: a resize already in flight when
  // the scene stopped still arrives, and `apply` reads the camera.
  onSceneResize(scene, () => { if (sceneIsLive(scene)) apply() })
}
