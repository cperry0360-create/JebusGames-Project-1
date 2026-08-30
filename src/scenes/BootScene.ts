import Phaser from 'phaser'
import { fillMissingTextures, queueKenneyPack } from '../systems/ArtLoader.ts'

/** Loads the art pack if it is present and fills in placeholders for anything
 *  missing, so a fresh clone with no assets still runs. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload(): void {
    // A missing or misnamed file must not black-screen the game; it just falls
    // through to the generated placeholder.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`[art] could not load "${file.key}", using placeholder`)
    })
    queueKenneyPack(this)
  }

  create(): void {
    fillMissingTextures(this)
    this.scene.start('Game')
    this.scene.launch('Hud')
  }
}
