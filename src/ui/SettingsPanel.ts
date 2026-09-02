import Phaser from 'phaser'
import { getVolume, play, setVolume } from '../systems/Audio.ts'
import { controlDrawerOn, setControlDrawer } from '../systems/Save.ts'
import { pointerToScreen } from '../systems/Resolution.ts'
import { refreshMusicVolume } from '../systems/Music.ts'
import { Slider } from './Slider.ts'
import { platePanel, plateButton } from './Plate.ts'
import { COLOR, FONT_DISPLAY, FONT_UI, uiSize } from './Theme.ts'
import { viewH, viewW } from '../systems/Resolution.ts'
import presentationData from '../data/presentation.json'

const CFG = presentationData.settings

export interface SettingsActions {
  onHome: () => void
  onRestart: () => void
  onContinue: () => void
  /** The drawer flag was flipped. The game scene switches control schemes on
   *  the spot rather than at the next run — that is what "compare them
   *  minutes apart" needs. Optional so a caller that does not care may omit
   *  it. */
  onFlagChanged?: () => void
}

/**
 * The settings dialog: three volume sliders and the three ways out of a run.
 *
 * IT REPLACED FOUR CONTROLS. A mute toggle, a minus, a plus and a percentage
 * readout in one corner, and a pause button in the other — chrome sitting on
 * the board for the whole run, for settings a player opens once and then
 * leaves alone. One gear opens all of it.
 *
 * Owned by the HUD scene rather than by GameScene, and that is load-bearing:
 * this panel pauses GameScene, and a panel drawn by a paused scene cannot be
 * tweened, pressed or closed.
 *
 * DELIBERATELY ONLY THIS. No difficulty, no accessibility toggles, no hints,
 * no now-playing line. Three sliders and three buttons.
 */
export class SettingsPanel {
  readonly layer: Phaser.GameObjects.Container
  private readonly blocker: Phaser.GameObjects.Rectangle
  private closed = false
  /** The pressable regions, so a test can check where they are rather than
   *  only that their handlers fired. */
  readonly hits: Phaser.GameObjects.GameObject[] = []

  constructor(scene: Phaser.Scene, depth: number, actions: SettingsActions) {
    const onFlagChanged = actions.onFlagChanged
    const VW = viewW(scene)
    const VH = viewH(scene)

    // Swallows every press that is not on a control. There is no
    // tap-outside-to-close: the world behind this is PAUSED, and a paused
    // world is left on purpose. CONTINUE is the way out.
    this.blocker = scene.add
      .rectangle(VW / 2, VH / 2, VW * 1.5, VH * 1.5, 0x000000, 0.62)
      .setOrigin(0.5)
      .setDepth(depth - 1)
      .setInteractive()
    this.blocker.on('pointerdown', () => { /* swallowed */ })

    this.layer = scene.add.container(0, 0).setDepth(depth)

    // CLAMPED TO THE VIEWPORT, both ways. At 568x320 the design width does not
    // fit and neither does the natural height, so the panel is what the screen
    // allows and the rows are packed to suit.
    const margin = 12
    const W = Math.max(CFG.minWidth, Math.min(CFG.width, VW - margin * 2))
    // Four rows now: three sliders and the drawer flag.
    const rows = 4
    const bodyH = CFG.titleSize + 14 + rows * CFG.rowHeight + 10 + CFG.buttonHeight
    const H = Math.min(VH - margin * 2, bodyH + CFG.pad * 2)
    const x = Math.round((VW - W) / 2)
    const y = Math.round((VH - H) / 2)

    this.layer.add(platePanel(scene, x, y, W, H, 0.2))

    const title = scene.add.text(x + W / 2, y + CFG.pad, 'SETTINGS', {
      fontFamily: FONT_DISPLAY, fontSize: `${CFG.titleSize}px`, color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 5,
    }).setOrigin(0.5, 0)
    this.layer.add(title)

    // The three sliders. Persisted on every change rather than on close: a
    // player who drags the music down and then closes the tab has set the
    // music down.
    const innerX = x + CFG.pad
    const innerW = W - CFG.pad * 2
    // Whatever height is left after the title and the button row, shared out.
    const buttonsTop = y + H - CFG.pad - CFG.buttonHeight
    const firstRow = y + CFG.pad + CFG.titleSize + 12
    const rowH = Math.max(30, Math.min(CFG.rowHeight, (buttonsTop - 10 - firstRow) / rows))
    const channels: Array<[string, 'music' | 'sfx' | 'voice']> = [
      ['MUSIC', 'music'],
      ['SOUND EFFECTS', 'sfx'],
      ['VOICE', 'voice'],
    ]
    for (const [i, [label, channel]] of channels.entries()) {
      const s = new Slider(
        scene, innerX, firstRow + i * rowH, innerW, label, channel, getVolume(channel),
        (v) => {
          setVolume(v, channel)
          if (channel === 'music') refreshMusicVolume()
        },
      )
      this.layer.add(s.parts)
      this.hits.push(s.hit)
    }

    // THE FEATURE FLAG, under the sliders.
    //
    // It is here rather than on a debug screen because the whole point is
    // comparing the two control schemes on the same device minutes apart, and
    // a flag you have to rebuild for cannot be compared that way. It is
    // TEMPORARY: when the comparison is settled, one of the two paths is
    // deleted and this row goes with it.
    const flagY = firstRow + 3 * rowH
    const flagH = Math.min(rowH - 6, 34)
    const label = scene.add.text(innerX, flagY + flagH / 2, 'NEW CONTROL DRAWER', {
      fontFamily: FONT_UI, fontSize: `${uiSize(CFG.labelSize)}px`, color: COLOR.ink,
    }).setOrigin(0, 0.5)
    this.layer.add(label)

    const boxW = 62
    const boxX = innerX + innerW - boxW
    const box = scene.add.graphics()
    this.layer.add(box)
    const knob = scene.add.graphics()
    this.layer.add(knob)
    const paint = (): void => {
      const on = controlDrawerOn()
      box.clear()
      box.fillStyle(on ? COLOR.accent : 0x39424e, 1)
      box.fillRoundedRect(boxX, flagY + (flagH - 26) / 2, boxW, 26, 13)
      box.lineStyle(2, 0x0d1016, 1)
      box.strokeRoundedRect(boxX, flagY + (flagH - 26) / 2, boxW, 26, 13)
      knob.clear()
      knob.fillStyle(0xf6ecd9, 1)
      knob.fillCircle(boxX + (on ? boxW - 15 : 15), flagY + flagH / 2, 10)
    }
    paint()

    // The whole ROW is the target, not the 62px switch: a toggle you have to
    // hit precisely is a toggle nobody flips twice, and comparing the two
    // schemes means flipping it often.
    const flagHit = scene.add
      .rectangle(innerX, flagY, innerW, flagH, 0xffffff, 0.001)
      .setOrigin(0, 0).setInteractive({ useHandCursor: true })
    flagHit.name = 'settings:drawer'
    flagHit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // CSS pixels, like every rectangle here. The slider two rows up was
      // pinned at 100% on retina for exactly this reason.
      const at = pointerToScreen(scene, p, scene.cameras.main)
      if (at.x < innerX || at.x > innerX + innerW) return
      setControlDrawer(!controlDrawerOn())
      play(scene, 'click')
      paint()
      onFlagChanged?.()
    })
    // INTO THE LAYER, like every other control. Left out, it kept the default
    // depth of 0 while the modal blocker sits at `depth - 1`, so the blocker
    // swallowed every press on it: the row was drawn, listed, measured as
    // reachable, and could not be pressed. The one control that turns the
    // drawer on was the one control that did nothing.
    this.layer.add(flagHit)
    this.hits.push(flagHit)

    // HOME, RESTART, CONTINUE, in that order, along the bottom.
    const bw = (innerW - CFG.buttonGap * 2) / 3
    const buttons: Array<[string, () => void, 'primary' | 'secondary']> = [
      ['HOME', actions.onHome, 'secondary'],
      ['RESTART', actions.onRestart, 'secondary'],
      ['CONTINUE', actions.onContinue, 'primary'],
    ]
    for (const [i, [label, onPick, weight]] of buttons.entries()) {
      const cx = innerX + bw / 2 + i * (bw + CFG.buttonGap)
      const btn = plateButton(
        scene, cx, buttonsTop + CFG.buttonHeight / 2, bw, CFG.buttonHeight, label,
        () => { play(scene, 'click'); onPick() }, 16, weight,
      )
      btn.hit.name = `settings:${label.toLowerCase()}`
      this.layer.add(btn.parts)
      this.hits.push(btn.hit)
    }
  }

  /** Everything the camera split has to be told about. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.blocker, this.layer]
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.blocker.destroy()
    this.layer.destroy(true)
  }
}
