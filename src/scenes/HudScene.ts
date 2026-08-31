import Phaser from 'phaser'
import displayData from '../data/display.json'
import { GameScene } from './GameScene.ts'
import presentationData from '../data/presentation.json'
import { COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { ART, fitInBox, renderFor } from '../systems/Art.ts'
import { greyKey } from '../systems/Desaturate.ts'
import { plateButton, type PlateButton } from '../ui/Plate.ts'
import { AudioToggle } from '../ui/AudioToggle.ts'

interface SlotView {
  id: string
  kind: 'ability' | 'haymaker' | 'restructure'
  frame: Phaser.GameObjects.Graphics
  sweep: Phaser.GameObjects.Graphics
  icon: Phaser.GameObjects.Image
  timer: Phaser.GameObjects.Text
  key: Phaser.GameObjects.Text
  hit: Phaser.GameObjects.Rectangle
  x: number
  y: number
}

const HUD = presentationData.hud
/** Icons are drawn 64px tall, as the art was made for. They carry their own
 *  frames, so nothing is drawn behind them. */
const ICON_H = 64
const SLOT_PITCH = 56

/** UI lives in its own scene so the world can Y-sort freely without the HUD
 *  ever landing in the middle of the sort order. */
export class HudScene extends Phaser.Scene {
  private world!: GameScene
  private peanutsText!: Phaser.GameObjects.Text
  private livesText!: Phaser.GameObjects.Text
  private waveText!: Phaser.GameObjects.Text
  private message!: Phaser.GameObjects.Text
  private heroLabel!: Phaser.GameObjects.Text
  private heroBar!: Phaser.GameObjects.Graphics
  private bossBar!: Phaser.GameObjects.Graphics
  private bossLabel!: Phaser.GameObjects.Text
  private startBtn!: PlateButton
  private slots: SlotView[] = []
  private slotsBuilt = false
  /** Which abilities the slots were built for, so a rare drop rebuilds them. */
  private slotKeys = ''
  /** Last drawn values, so a change can be shown rather than just displayed. */
  private lastPeanuts = -1
  private lastLives = -1

  constructor() {
    super('Hud')
  }

  create(): void {
    this.world = this.scene.get('Game') as GameScene
    this.slots = []
    this.slotsBuilt = false
    this.slotKeys = ''
    this.lastPeanuts = -1
    this.lastLives = -1
    const W = displayData.width

    // Three painted counters in the top-left corner, and nothing behind them.
    // The map runs to the full canvas now; there is no bar to crop it.
    const row = this.buildCounters()

    this.message = this.add.text(HUD.marginX, row.bottom + 8, '', {
      fontFamily: FONT_UI, fontSize: '14px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4,
    })

    // Start button in the opposite corner, standing on its own.
    this.buildStartButton(W - HudScene.START_W - HUD.marginX, HUD.marginY)

    // Mute is reachable mid-run, bottom-left, clear of the ability slots.
    new AudioToggle(this, 36, displayData.height - 36, 34)

    // The hero stays top-right where he was, moved down clear of the button.
    this.heroLabel = this.add.text(W - HUD.marginX, HUD.marginY + 54, '', {
      fontFamily: FONT_UI, fontSize: '13px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4,
    }).setOrigin(1, 0)
    this.heroBar = this.add.graphics()

    // The boss bar sits across the top between the two corners: the counters
    // own the left and the start button the right, so it takes the middle.
    this.bossBar = this.add.graphics()
    this.bossLabel = this.add.text(W / 2, HUD.marginY + 2, '', {
      fontFamily: FONT_DISPLAY, fontSize: '16px', color: COLOR.fire,
      stroke: '#0d1016', strokeThickness: 5,
    }).setOrigin(0.5, 0)

    this.add.text(W - 12, displayData.height - 16, 'art and fonts: Kenney, CC0', {
      fontFamily: FONT_UI, fontSize: '11px', color: COLOR.ink,
    }).setOrigin(1, 0).setAlpha(0.35)
  }

  /**
   * The counter plates. Each already carries its icon and an empty dark field;
   * the number goes in that field, whose position is measured in the manifest
   * rather than guessed, so a replaced plate needs no code change.
   */
  private buildCounters(): { bottom: number } {
    const keys = ART.ui.counters
    const order: Array<[string, () => Phaser.GameObjects.Text, string]> = [
      ['peanuts', () => this.peanutsText, COLOR.amber],
      ['lives', () => this.livesText, COLOR.danger],
      ['wave', () => this.waveText, COLOR.ink],
    ]
    let x = HUD.marginX
    let bottom = HUD.marginY
    for (const [name, , colour] of order) {
      const key = keys[name]
      const cfg = renderFor(key)
      const scale = HUD.plateHeight / (cfg.contentHeight ?? 96)
      const plateW = (cfg.contentWidth ?? 232) * scale

      const plate = this.add.image(x, HUD.marginY, key).setOrigin(0, 0)
      plate.setScale(scale)

      // Defaults only matter for a plate whose field was never measured; the
      // three real ones all carry theirs.
      const text = this.add.text(
        x + (cfg.fieldLeft ?? 0.3) * plateW + HUD.numberMargin,
        HUD.marginY + (cfg.fieldCentreY ?? 0.5) * HUD.plateHeight,
        '',
        { fontFamily: FONT_DISPLAY, fontSize: `${HUD.numberSize}px`, color: colour },
      ).setOrigin(0, 0.5)

      if (name === 'peanuts') this.peanutsText = text
      else if (name === 'lives') this.livesText = text
      else this.waveText = text

      x += plateW + HUD.plateGap
      bottom = Math.max(bottom, HUD.marginY + HUD.plateHeight)
    }
    return { bottom }
  }

  /** Width is declared here so the caller can place the button by its own
   *  size rather than by a number that has to be kept in step with it. */
  private static readonly START_W = 240
  private static readonly START_H = 50

  private buildStartButton(x: number, y: number): void {
    const w = HudScene.START_W
    const h = HudScene.START_H
    this.startBtn = plateButton(this, x + w / 2, y + h / 2, w, h, '',
      () => this.world.startWave(), 16)
  }

  /** Two drafted abilities, Cory's own two actives, and the rare drop if it
   *  has turned up. The slots are rebuilt when that set changes. */
  private buildSlots(): void {
    for (const s of this.slots) {
      s.frame.destroy(); s.sweep.destroy(); s.icon.destroy()
      s.timer.destroy(); s.key.destroy(); s.hit.destroy()
    }
    this.slots = []

    const s = this.world.status
    const hero = this.world.heroDef()
    const defs: Array<{ id: string; kind: SlotView['kind']; icon: string; key: string }> = []
    s.abilities.forEach((id, i) => {
      const def = this.world.abilityDef(id)
      if (def) defs.push({ id, kind: 'ability', icon: def.icon, key: i === 0 ? 'Q' : 'W' })
    })
    defs.push({ id: 'haymaker', kind: 'haymaker', icon: hero.haymaker.icon, key: 'E' })
    defs.push({ id: 'restructure', kind: 'restructure', icon: hero.restructure.icon, key: 'R' })
    if (s.rareAbility) {
      const def = this.world.abilityDef(s.rareAbility)
      if (def) defs.push({ id: s.rareAbility, kind: 'ability', icon: def.icon, key: 'F' })
    }
    this.slotKeys = defs.map((d) => d.id).join(',')

    // The bar they used to live in is gone, so they sit along the bottom
    // centre where a hero's actives belong, clear of the counters entirely.
    const startX = (displayData.width - defs.length * SLOT_PITCH) / 2
    const bottomY = displayData.height - ICON_H - 14
    defs.forEach((d, i) => {
      const x = startX + i * SLOT_PITCH
      const y = bottomY
      const frame = this.add.graphics()
      const icon = this.add.image(x + SLOT_PITCH / 2, y + ICON_H / 2, d.icon)
      fitInBox(icon, d.icon, ICON_H)
      const sweep = this.add.graphics()
      const timer = this.add.text(x + SLOT_PITCH / 2, y + ICON_H / 2, '', {
        fontFamily: FONT_DISPLAY, fontSize: '19px', color: COLOR.ink,
        stroke: '#0d1016', strokeThickness: 5,
      }).setOrigin(0.5)
      // Over the card's lower edge rather than under it: the bar is only just
      // taller than a 64px icon, and below it the letters met the bar's edge.
      const key = this.add.text(x + SLOT_PITCH / 2, y + ICON_H - 13, d.key, {
        fontFamily: FONT_UI, fontSize: '12px', color: COLOR.ink,
        stroke: '#0d1016', strokeThickness: 4,
      }).setOrigin(0.5, 0)

      const hit = this.add.rectangle(x + SLOT_PITCH / 2, y + ICON_H / 2, SLOT_PITCH, ICON_H, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => {
        if (d.kind === 'ability') this.world.armAbility(d.id)
        else if (d.kind === 'haymaker') this.world.castHaymaker()
        else this.world.armRestructure()
      })

      this.slots.push({ id: d.id, kind: d.kind, frame, sweep, icon, timer, key, hit, x, y })
    })
  }

  update(): void {
    const s = this.world.status
    // Scene creation order is not guaranteed, so wait for the game scene to
    // have populated its status before drawing anything that depends on it.
    if (s.heroName === '') return
    const wanted = [...s.abilities, 'haymaker', 'restructure', s.rareAbility ?? ''].join(',')
    if (!this.slotsBuilt || wanted !== this.slotKeys + (s.rareAbility ? '' : ',')) {
      this.buildSlots()
      this.slotsBuilt = true
    }

    this.peanutsText.setText(`${s.peanuts}`)
    this.livesText.setText(`${s.lives}`)
    // Money and lives are the two numbers a player watches, so a change has to
    // announce itself rather than quietly appear.
    if (this.lastPeanuts >= 0 && s.peanuts !== this.lastPeanuts) {
      this.bump(this.peanutsText, s.peanuts > this.lastPeanuts ? '#ffffff' : COLOR.danger, COLOR.amber)
      if (s.peanuts > this.lastPeanuts) this.floatUp(`+${s.peanuts - this.lastPeanuts}`, COLOR.amber)
    }
    if (this.lastLives >= 0 && s.lives < this.lastLives) {
      this.bump(this.livesText, '#ffffff', COLOR.danger)
    }
    this.lastPeanuts = s.peanuts
    this.lastLives = s.lives
    this.waveText.setText(`${Math.min(s.wave + 1, s.waveCount)}/${s.waveCount}`)
    this.message.setText(s.message)

    this.drawBossBar(s)
    this.drawStartButton(s)
    this.drawSlots(s)
    this.drawHeroBar(s)
  }

  /** Across the top while a boss is on the field, and gone the rest of the
   *  time. Nothing else may occupy the middle of that strip. */
  private drawBossBar(s: GameScene['status']): void {
    this.bossBar.clear()
    if (!s.bossName) {
      this.bossLabel.setText('')
      return
    }
    const w = HUD.bossBarWidth
    const h = HUD.bossBarHeight
    const x = (displayData.width - w) / 2
    const y = HUD.marginY + HUD.bossBarTop
    const ratio = Phaser.Math.Clamp(s.bossHealth / Math.max(s.bossMax, 1), 0, 1)

    this.bossLabel.setText(s.bossName.toUpperCase())
    this.bossBar.fillStyle(0x0d1016, 0.82).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 5)
    this.bossBar.fillStyle(0x3a1f1c, 1).fillRect(x, y, w, h)
    this.bossBar.fillStyle(0xff5a3c, 1).fillRect(x, y, w * ratio, h)
    this.bossBar.lineStyle(2, 0xff8f7a, 1).strokeRoundedRect(x - 3, y - 3, w + 6, h + 6, 5)
    // The two marks where he starts taxing harder, so the phases are legible.
    for (const t of HUD.bossPhaseMarks) {
      this.bossBar.lineStyle(2, 0x0d1016, 0.8).lineBetween(x + w * t, y, x + w * t, y + h)
    }
  }

  /** A short pop on a number that just changed, then back to its own colour. */
  private bump(text: Phaser.GameObjects.Text, flash: string, base: string): void {
    this.tweens.killTweensOf(text)
    text.setColor(flash)
    text.setScale(1)
    this.tweens.add({
      targets: text, scale: 1.25, duration: 90, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => text.setColor(base),
    })
  }

  private floatUp(label: string, colour: string): void {
    const t = this.add.text(this.peanutsText.x + 6, 34, label, {
      fontFamily: FONT_DISPLAY, fontSize: '15px', color: colour,
    })
    this.tweens.add({
      targets: t, y: 14, alpha: 0, duration: 700, ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    })
  }

  private drawStartButton(s: GameScene['status']): void {
    // Only pressable between waves. Mid-wave it becomes a readout, which is
    // exactly what the disabled plate is for.
    this.startBtn.setEnabled(s.phase === 'ready')

    if (s.phase === 'ready') this.startBtn.setLabel(`START WAVE ${Math.min(s.wave + 1, s.waveCount)}`)
    else if (s.phase === 'wave') this.startBtn.setLabel(`${s.waveName} · ${s.enemiesLeft} left`)
    else this.startBtn.setLabel(s.phase === 'won' ? 'CLEARED' : 'OVERRUN')
  }

  /**
   * The cards carry their own frames, so nothing is drawn behind them. A
   * cooldown darkens the icon and sweeps a dial over it; an ability that is
   * not castable at all is swapped for its greyscale copy, which reads as
   * switched off rather than as merely dim.
   */
  private drawSlots(s: GameScene['status']): void {
    for (const slot of this.slots) {
      const ready = this.world.cooldowns.ready(slot.id)
      const usable = this.slotUsable(slot, s)
      const armed = s.pendingAbility === slot.id
        || (slot.kind === 'restructure' && s.mode === 'restructure')
      const left = this.world.cooldowns.secondsLeft(slot.id)

      const base = this.world.abilityIcon(slot.id) ?? slot.icon.texture.key
      const wantKey = usable ? base : greyKey(base)
      if (this.textures.exists(wantKey) && slot.icon.texture.key !== wantKey) {
        slot.icon.setTexture(wantKey)
        fitInBox(slot.icon, base, ICON_H)
      }
      slot.icon.setTint(ready && usable ? 0xffffff : 0x8a8a8a)

      // Armed reads as a glow around the card rather than a plate behind it.
      slot.frame.clear()
      if (armed) {
        slot.frame.lineStyle(3, COLOR.accent, 0.95)
        slot.frame.strokeRoundedRect(slot.x + 4, slot.y - 2, SLOT_PITCH - 8, ICON_H + 4, 8)
      }

      slot.timer.setText(ready ? '' : String(Math.ceil(left)))

      slot.sweep.clear()
      if (!ready) {
        const p = this.world.cooldowns.progress(slot.id)
        slot.sweep.fillStyle(0x000000, 0.5)
        slot.sweep.slice(
          slot.x + SLOT_PITCH / 2, slot.y + ICON_H / 2, ICON_H * 0.42,
          Phaser.Math.DegToRad(-90 + 360 * p), Phaser.Math.DegToRad(270), false,
        )
        slot.sweep.fillPath()
      }
    }
  }

  /** Castable at all, ignoring cooldown: the hero has to be up for his own
   *  actives, and a rare drop is only usable while it is held. */
  private slotUsable(slot: SlotView, s: GameScene['status']): boolean {
    if (slot.kind !== 'ability') return !s.heroDown
    if (slot.id === s.rareAbility) return true
    return s.abilities.includes(slot.id)
  }

  private drawHeroBar(s: GameScene['status']): void {
    const w = 200
    const x = displayData.width - HUD.marginX - w
    const y = HUD.marginY + 72

    let state = ''
    if (s.heroDown) state = ' — DOWN'
    else if (s.lastStand) state = ' — DAD MODE'
    this.heroLabel.setText(`${s.heroName}${state}`)
    this.heroLabel.setColor(s.lastStand ? COLOR.fire : COLOR.ink)
    this.heroLabel.setX(x + w)

    const ratio = Phaser.Math.Clamp(s.heroHealth / Math.max(s.heroMax, 1), 0, 1)
    this.heroBar.clear()
    this.heroBar.fillStyle(0x000000, 0.55).fillRoundedRect(x, y, w, 13, 5)
    this.heroBar.fillStyle(s.heroDown ? 0x5a5a5a : s.lastStand ? 0xff5a3c : 0x4fa3e3, 1)
    this.heroBar.fillRoundedRect(x + 2, y + 2, Math.max(0, (w - 4) * ratio), 9, 4)
    // The 25% mark, so the Last Stand threshold is legible before it fires.
    const markX = x + 2 + (w - 4) * 0.25
    this.heroBar.lineStyle(1, COLOR.panelEdge, 0.9).lineBetween(markX, y, markX, y + 13)
  }
}
