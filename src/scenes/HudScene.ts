import Phaser from 'phaser'
import displayData from '../data/display.json'
import { GameScene } from './GameScene.ts'
import { COLOR, FONT_DISPLAY, FONT_UI, panel } from '../ui/Theme.ts'
import { fitInBox } from '../systems/Art.ts'
import { greyKey } from '../systems/Desaturate.ts'

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

const SHADOW_H = 6
/** The bar itself; display.hudHeight is the bar plus its shadow, which is the
 *  line the rest of the game has to keep clear. */
const BAR_H = displayData.hudHeight - SHADOW_H
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
  private startBox!: Phaser.GameObjects.Graphics
  private startLabel!: Phaser.GameObjects.Text
  private startHit!: Phaser.GameObjects.Rectangle
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

    panel(this, -4, -6, W + 8, BAR_H + 6, { radius: 0, alpha: 0.97, shadow: false })
    // The bar is flush to the top edge, so its shadow is drawn below it only.
    this.add.rectangle(0, BAR_H, W, SHADOW_H, 0x000000, 0.3).setOrigin(0, 0)

    this.peanutsText = this.add.text(18, 12, '', {
      fontFamily: FONT_DISPLAY, fontSize: '22px', color: COLOR.amber,
    })
    this.livesText = this.add.text(158, 12, '', {
      fontFamily: FONT_DISPLAY, fontSize: '22px', color: COLOR.danger,
    })
    this.waveText = this.add.text(288, 12, '', {
      fontFamily: FONT_DISPLAY, fontSize: '22px', color: COLOR.ink,
    })
    // Under the bar rather than inside it: at 13px the guidance line ran
    // straight into the ability slots and lost its second half.
    this.message = this.add.text(18, BAR_H + 12, '', {
      fontFamily: FONT_UI, fontSize: '14px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4,
    })

    this.buildStartButton(W - 208, 10)

    this.heroLabel = this.add.text(W - 232, 12, '', {
      fontFamily: FONT_UI, fontSize: '13px', color: COLOR.ink,
    }).setOrigin(1, 0)
    this.heroBar = this.add.graphics()

    this.add.text(W - 12, displayData.height - 16, 'art and fonts: Kenney, CC0', {
      fontFamily: FONT_UI, fontSize: '11px', color: COLOR.ink,
    }).setOrigin(1, 0).setAlpha(0.35)
  }

  private buildStartButton(x: number, y: number): void {
    const w = 196
    const h = 46
    this.startBox = this.add.graphics()
    this.startLabel = this.add.text(x + w / 2, y + h / 2, '', {
      fontFamily: FONT_DISPLAY, fontSize: '17px', color: COLOR.ink,
    }).setOrigin(0.5)
    this.startHit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    this.startHit.on('pointerdown', () => this.world.startWave())
    this.startHit.setData('box', { x, y, w, h })
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

    const startX = 420
    defs.forEach((d, i) => {
      const x = startX + i * SLOT_PITCH
      const y = 4
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

    this.peanutsText.setText(`${s.peanuts}p`)
    this.livesText.setText(`${s.lives} HP`)
    // Money and lives are the two numbers a player watches, so a change has to
    // announce itself rather than quietly appear.
    if (this.lastPeanuts >= 0 && s.peanuts !== this.lastPeanuts) {
      this.bump(this.peanutsText, s.peanuts > this.lastPeanuts ? '#ffffff' : COLOR.danger, COLOR.amber)
      if (s.peanuts > this.lastPeanuts) this.floatUp(`+${s.peanuts - this.lastPeanuts}p`, COLOR.amber)
    }
    if (this.lastLives >= 0 && s.lives < this.lastLives) {
      this.bump(this.livesText, '#ffffff', COLOR.danger)
    }
    this.lastPeanuts = s.peanuts
    this.lastLives = s.lives
    this.waveText.setText(`WAVE ${Math.min(s.wave + 1, s.waveCount)}/${s.waveCount}`)
    this.message.setText(s.message)

    this.drawStartButton(s)
    this.drawSlots(s)
    this.drawHeroBar(s)
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
    const box = this.startHit.getData('box') as { x: number; y: number; w: number; h: number }
    const ready = s.phase === 'ready'
    this.startBox.clear()
    this.startBox.fillStyle(ready ? 0x2f6b38 : 0x232c38, 0.98).fillRoundedRect(box.x, box.y, box.w, box.h, 9)
    this.startBox.lineStyle(2, ready ? COLOR.accent : COLOR.panelEdge, 1)
      .strokeRoundedRect(box.x, box.y, box.w, box.h, 9)
    this.startLabel.setColor(ready ? COLOR.ink : '#6f7a86')

    if (s.phase === 'ready') this.startLabel.setText(`START WAVE ${Math.min(s.wave + 1, s.waveCount)}`)
    else if (s.phase === 'wave') this.startLabel.setText(`${s.waveName} · ${s.enemiesLeft} left`)
    else this.startLabel.setText(s.phase === 'won' ? 'CLEARED' : 'OVERRUN')
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
    const x = displayData.width - 232 - w
    const y = 34

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
