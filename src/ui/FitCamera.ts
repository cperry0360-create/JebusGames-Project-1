import Phaser from 'phaser'
import displayData from '../data/display.json'
import { fitScale } from '../systems/CameraMath.ts'
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
    cam.setZoom(fitScale(scene.scale.width, scene.scale.height, designW, designH))
    // Centre the design box in the viewport. Any leftover is the camera's own
    // background colour, which is the game's dark ground.
    cam.centerOn(designW / 2, designH / 2)
  }
  apply()
  // SHUTDOWN and DESTROY both, and guarded: a resize already in flight when
  // the scene stopped still arrives, and `apply` reads the camera.
  onSceneResize(scene, () => { if (sceneIsLive(scene)) apply() })
}
