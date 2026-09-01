import Phaser from 'phaser'
import displayData from '../data/display.json'
import { queueArt } from '../systems/ArtLoader.ts'
import { OPTIONAL_SPRITE_KEYS, REQUIRED_SPRITE_KEYS } from '../systems/Art.ts'
import { initAudio, queueAudio } from '../systems/Audio.ts'
import { registerEffectAnims } from '../systems/Effects.ts'
import { ensureShadowTexture } from '../systems/Presentation.ts'
import { ensureGrey } from '../systems/Desaturate.ts'
import { ART } from '../systems/Art.ts'
import { COLOR, FONT_UI } from '../ui/Theme.ts'

/** Loads the Kenney art and the synthesised cues, then hands over to the title. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload(): void {
    const cx = displayData.width / 2
    const cy = displayData.height / 2

    const label = this.add.text(cx, cy - 34, 'COURJAHAN DEFENSE', {
      fontFamily: FONT_UI, fontSize: '40px', fontStyle: 'bold', color: COLOR.ink,
      letterSpacing: 3,
    }).setOrigin(0.5)

    const bar = this.add.rectangle(cx - 158, cy + 30, 0, 10, 0x6cc24a).setOrigin(0, 0.5)
    const frame = this.add.rectangle(cx, cy + 30, 320, 14).setStrokeStyle(2, 0x4a5666)

    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => bar.setSize(316 * v, 10))
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`[assets] failed to load "${file.key}" from ${file.url}`)
    })
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      label.destroy()
      bar.destroy()
      frame.destroy()
    })

    queueArt(this)
    initAudio()
    queueAudio(this)
  }

  create(): void {
    // Missing art NEVER stops the game.
    //
    // This used to collect every absent texture, draw the list on a blank
    // screen and `return` — which meant it never started Splash, and one
    // manifest hook whose file had not been uploaded yet took the whole game
    // down to a green screen on live. A player who cannot get past the boot
    // scene cannot tell you anything useful; a player looking at magenta
    // placeholders can tell you exactly which thing is wrong.
    //
    // So: optional keys are a warning, required keys are an error and a
    // banner, and in both cases the game boots.
    const absent = (keys: string[]): string[] => keys.filter((k) => !this.textures.exists(k))
    const missingOptional = absent(OPTIONAL_SPRITE_KEYS)
    const missingRequired = absent(REQUIRED_SPRITE_KEYS)

    if (missingOptional.length > 0) {
      // Expected: the hook exists so the code can be written before the art.
      console.warn('[art] optional art not present, using fallbacks:',
        missingOptional.join(', '))
    }
    if (missingRequired.length > 0) {
      console.error('[art] MISSING REQUIRED TEXTURES:', missingRequired.join(', '))
      this.missingRequired = missingRequired
    }
    // Every ground shadow reuses one generated texture; build it once here.
    ensureShadowTexture(this)
    // Phaser's animation manager is global, so the effect animations are
    // registered once and every scene can play them.
    registerEffectAnims(this)
    // Greyed copies of anything the UI shows as unavailable, built once rather
    // than per frame.
    for (const key of ART.greyable) ensureGrey(this, key)
    this.scene.start('Splash')
    // Drawn over the running game rather than instead of it, so the fault is
    // reportable without being fatal.
    if (this.missingRequired.length > 0) this.showMissingBanner()
  }

  /** Required art that did not load. Empty on a healthy boot. */
  private missingRequired: string[] = []

  /**
   * A banner naming what is missing, over a game that is still running.
   *
   * DOM, not a Phaser text. Scene render order beats any depth and Boot is the
   * FIRST scene in the config array, so a label drawn here renders underneath
   * the entire game — I tried it, and the banner was invisible in exactly the
   * situation it exists for. A fixed-position element sits above the canvas
   * unconditionally and cannot be re-ordered out from under itself.
   *
   * Deliberately a strip and not the crash panel: the crash panel covers the
   * screen, and covering the screen is the failure being fixed here.
   */
  private showMissingBanner(): void {
    const doc = globalThis.document
    if (!doc?.body) return
    const list = this.missingRequired
    const el = doc.createElement('div')
    el.id = 'missing-art'
    el.textContent = `MISSING ART (${list.length}): ${list.slice(0, 8).join(', ')}`
      + (list.length > 8 ? ` and ${list.length - 8} more` : '')
      + '   — tap to dismiss'
    el.setAttribute('style', [
      'position:fixed', 'left:0', 'right:0', 'top:0', 'z-index:99998',
      'background:#c1443a', 'color:#fff', 'font:12px/1.4 monospace',
      'padding:6px 10px', 'cursor:pointer', 'text-align:center',
    ].join(';'))
    el.addEventListener('pointerdown', () => el.remove())
    doc.body.appendChild(el)
  }
}
