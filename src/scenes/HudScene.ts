import Phaser from 'phaser'
import { GameScene } from './GameScene.ts'
import type { RulesDef } from '../types.ts'
import presentationData from '../data/presentation.json'
import rulesData from '../data/rules.json'
import { COLOR, FONT_UI } from '../ui/Theme.ts'
import { ART, fitInBox, renderFor } from '../systems/Art.ts'
import { greyKey } from '../systems/Desaturate.ts'
import { plateButton, type PlateButton } from '../ui/Plate.ts'
import { AudioToggle } from '../ui/AudioToggle.ts'
import { iconPlate } from '../ui/Plate.ts'
import { Dialog } from '../ui/Dialog.ts'
import { play } from '../systems/Audio.ts'
import { bandsFor, rowRegions, type Bands } from '../systems/Bands.ts'

interface SlotView {
  id: string
  kind: 'ability' | 'haymaker' | 'restructure'
  /** True for Cory's own two, which are round medallions rather than plates. */
  hero: boolean
  frame: Phaser.GameObjects.Graphics
  sweep: Phaser.GameObjects.Graphics
  icon: Phaser.GameObjects.Image
  timer: Phaser.GameObjects.Text
  hit: Phaser.GameObjects.Rectangle
  x: number
  y: number
  /** This slot's own width; the two shapes do not share a grid. */
  pitch: number
}

const HUD = presentationData.hud
const RULES = rulesData as unknown as RulesDef
/** Icons are drawn 64px tall, as the art was made for. They carry their own
 *  frames, so nothing is drawn behind them. */
const ICON_H = 64

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
  private bands: Bands = { top: 0, bottom: 0, worldTop: 0, worldHeight: 0 }
  /** Top of the second row of the top band, shared by the message, the boss
   *  bar and the hero readout. */
  private row2Y = 0
  private regions = { left: { x: 0, width: 0 }, right: { x: 0, width: 0 } }
  /** Top of the ability icons, inside the bottom band. */
  private abilityTop = 0
  /** Width of each counter plate's printable field, so a number that outgrows
   *  it shrinks instead of running off the plate. */
  private peanutsField = 999
  private livesField = 999
  private waveField = 999
  private bossBar!: Phaser.GameObjects.Graphics
  private bossLabel!: Phaser.GameObjects.Text
  private startBtn!: PlateButton
  private panel?: Dialog
  private paused = false
  slots: SlotView[] = []
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
    // A rotate or a URL-bar collapse changes the viewport, and every position
    // below is measured from it. Rebuilding is cheaper to keep correct than
    // repositioning thirty objects by hand.
    this.scale.on('resize', this.relayout, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.relayout, this))

    this.world = this.scene.get('Game') as GameScene
    this.slots = []
    this.slotsBuilt = false
    this.slotKeys = ''
    this.lastPeanuts = -1
    this.lastLives = -1
    const W = this.scale.width
    const H = this.scale.height
    // The same numbers the world camera is clipped by, from the same function,
    // so the HUD cannot lay itself out against a band the world does not
    // respect. Everything below is placed inside one of these two strips.
    this.bands = bandsFor(H, HUD.bands)
    const B = HUD.bands
    const row2Y = B.marginY + B.plateHeight + B.rowGap
    const regions = rowRegions(W, HUD.marginX)
    this.row2Y = row2Y
    this.regions = regions

    // The bands are painted before anything is laid into them. Without a
    // ground of their own they read as the map having been cropped rather
    // than as the HUD owning that strip.
    const chrome = this.add.graphics()
    for (const [y, h] of [[0, this.bands.top], [H - this.bands.bottom, this.bands.bottom]]) {
      chrome.fillStyle(0x10161d, 0.94).fillRect(0, y, W, h)
    }
    chrome.lineStyle(2, 0x3d4a59, 0.7)
    chrome.lineBetween(0, this.bands.top, W, this.bands.top)
    chrome.lineBetween(0, H - this.bands.bottom, W, H - this.bands.bottom)

    // --- top band, row 1: counters left, start-wave button right.
    // The button takes what the counters leave. Fixed at 240px it ran into the
    // wave counter on a 568px screen, which is an iPhone SE in landscape.
    const countersRight = this.buildCounters(B.marginY)
    const spare = W - countersRight - HUD.marginX * 2
    const startW = Phaser.Math.Clamp(spare, HudScene.START_MIN_W, HudScene.START_W)
    this.buildStartButton(W - startW - HUD.marginX, B.marginY, startW)

    // --- top band, row 2, left region: the wave message, or the boss bar.
    // They are never both up: while a boss is on the field the bar *is* the
    // message. Sharing one region by rule is what keeps them from stacking.
    this.message = this.add.text(regions.left.x, row2Y, '', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4,
      // One line. A wrapped sentence would grow out of the band.
      wordWrap: { width: regions.left.width },
      maxLines: 1,
    })
    this.bossBar = this.add.graphics()
    this.bossLabel = this.add.text(0, 0, '', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink,
      fontStyle: 'bold', stroke: '#0d1016', strokeThickness: 4, letterSpacing: 1,
    }).setOrigin(0.5, 0.5)

    // --- top band, row 2, right region: the hero's name and health.
    this.heroLabel = this.add.text(regions.right.x + regions.right.width, row2Y, '', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4,
    }).setOrigin(1, 0)
    this.heroBar = this.add.graphics()

    // --- bottom band: mute at the left end, abilities centred, pause at the
    // right end. The ability slots are built later, from the run's hand, and
    // land on the same baseline.
    this.abilityTop = H - this.bands.bottom + B.marginY
    new AudioToggle(this, 26, H - 26, 30)
    this.buildPauseButton(W - 26, H - 26)
    // The Kenney line is gone from the play screen. It was the only element
    // here with no gameplay function, it sat over the board on a phone, and
    // the attribution it carried is already a credit of its own in the roll.
  }

  /** A counter number, scaled down if it no longer fits its plate's field. */
  private setCounter(t: Phaser.GameObjects.Text, value: string, field: number): void {
    if (t.text === value) return
    t.setScale(1)
    t.setText(value)
    if (t.width > field) t.setScale(Math.max(0.6, field / t.width))
  }

  /**
   * The counter plates. Each already carries its icon and an empty dark field;
   * the number goes in that field, whose position is measured in the manifest
   * rather than guessed, so a replaced plate needs no code change.
   */
  /** Lays the counter plates out and reports where the row ends. */
  private buildCounters(top: number): number {
    const keys = ART.ui.counters
    const order: Array<[string, () => Phaser.GameObjects.Text, string]> = [
      ['peanuts', () => this.peanutsText, COLOR.amber],
      ['lives', () => this.livesText, COLOR.danger],
      ['wave', () => this.waveText, COLOR.ink],
    ]
    let x = HUD.marginX
    for (const [name, , colour] of order) {
      const key = keys[name]
      const cfg = renderFor(key)
      const scale = HUD.plateHeight / (cfg.contentHeight ?? 96)
      const plateW = (cfg.contentWidth ?? 232) * scale

      const plate = this.add.image(x, top, key).setOrigin(0, 0)
      plate.setScale(scale)

      // Defaults only matter for a plate whose field was never measured; the
      // three real ones all carry theirs.
      const text = this.add.text(
        x + (cfg.fieldLeft ?? 0.3) * plateW + HUD.numberMargin,
        top + (cfg.fieldCentreY ?? 0.5) * HUD.plateHeight,
        '',
        {
          fontFamily: FONT_UI, fontSize: `${HUD.numberSize}px`,
          fontStyle: 'bold', color: colour,
        },
      ).setOrigin(0, 0.5)

      // The field the number is printed into, so a five-glyph wave counter
      // cannot run off the end of its own plate.
      const field = plateW * (1 - (cfg.fieldLeft ?? 0.3)) - HUD.numberMargin * 2
      if (name === 'peanuts') { this.peanutsText = text; this.peanutsField = field }
      else if (name === 'lives') { this.livesText = text; this.livesField = field }
      else { this.waveText = text; this.waveField = field }

      x += plateW + HUD.plateGap
    }
    return x - HUD.plateGap
  }

  /** Width is declared here so the caller can place the button by its own
   *  size rather than by a number that has to be kept in step with it. */
  private static readonly START_W = 240
  /** Below this the plate's own end caps leave no room for a label at all. */
  private static readonly START_MIN_W = 150
  private static readonly START_H = 50

  /**
   * Pause lives here rather than in GameScene, because it pauses GameScene:
   * a panel drawn by a paused scene cannot be tweened, pressed or closed.
   */
  private buildPauseButton(x: number, y: number): void {
    const plate = iconPlate(this, x, y, 40, 40)
    const g = this.add.graphics()
    g.fillStyle(0xf6ecd9, 1)
    g.fillRect(x - 7, y - 8, 5, 16)
    g.fillRect(x + 2, y - 8, 5, 16)
    const hit = this.add.rectangle(x, y, 44, 44, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => plate.setActive(true))
    hit.on('pointerout', () => plate.setActive(false))
    hit.on('pointerdown', () => this.openPause())
  }

  private openPause(): void {
    if (this.paused) return
    this.paused = true
    play(this, 'open')
    this.scene.pause('Game')
    this.showPanel({
      title: 'PAUSED',
      subtitle: 'The wave is stopped. Nothing moves until you resume.',
      confirm: { label: 'RESUME', onPick: () => this.resumeGame() },
      extra: { label: 'RESTART', onPick: () => this.restartRun() },
      cancelLabel: 'QUIT',
      onCancel: () => this.confirmQuit(),
      dim: 0.55,
    })
  }

  /** A dialog owned by the HUD, so it keeps working while Game is paused. */
  private showPanel(opts: ConstructorParameters<typeof Dialog>[4]): void {
    this.panel?.close()
    this.panel = new Dialog(this, this.scale.width / 2, this.scale.height / 2, 90000, opts)
    this.panel.onClosed(() => { this.panel = undefined })
  }

  private resumeGame(): void {
    this.paused = false
    this.scene.resume('Game')
  }

  private restartRun(): void {
    this.scene.resume('Game')
    this.scene.get('Game').scene.restart()
    this.scene.restart()
  }

  /** Quitting throws the run away, so it asks first. */
  private confirmQuit(): void {
    this.showPanel({
      title: 'QUIT TO TITLE?',
      subtitle: 'This run ends here. Towers, upgrades and peanuts are lost.',
      confirm: { label: 'QUIT', onPick: () => this.quitToTitle() },
      cancelLabel: 'KEEP PLAYING',
      onCancel: () => this.resumeGame(),
      dim: 0.6,
    })
  }

  private quitToTitle(): void {
    this.scene.resume('Game')
    this.scene.stop('Game')
    this.scene.start('Title')
  }

  /** Tears the HUD down and builds it again at the new viewport size. */
  private relayout(): void {
    this.scene.restart()
  }

  private buildStartButton(x: number, y: number, width: number): void {
    const w = width
    const h = HudScene.START_H
    this.startBtn = plateButton(this, x + w / 2, y + h / 2, w, h, '',
      () => this.world.startWave(), 16)
  }

  /** Two drafted abilities, Cory's own two actives, and the rare drop if it
   *  has turned up. The slots are rebuilt when that set changes. */
  private buildSlots(): void {
    for (const s of this.slots) {
      s.frame.destroy(); s.sweep.destroy(); s.icon.destroy()
      s.timer.destroy(); s.hit.destroy()
    }
    this.slots = []

    const s = this.world.status
    const hero = this.world.heroDef()
    // No key letters. This is a touch game; Q W E R meant nothing on a phone
    // and the labels were four more things crowding a 64px icon.
    // Two groups, and the order says which is which. Everything the run dealt
    // — the drafted actives and the rare drop — comes first as rectangular
    // arcade plates; Cory's own two come last as round medallions. The shape
    // is the signal, so the layout keeps each group whole rather than
    // interleaving them or forcing both into one grid.
    const defs: Array<{ id: string; kind: SlotView['kind']; icon: string; hero: boolean }> = []
    s.abilities.forEach((id) => {
      const def = this.world.abilityDef(id)
      if (def) defs.push({ id, kind: 'ability', icon: def.icon, hero: false })
    })
    if (s.rareAbility) {
      const def = this.world.abilityDef(s.rareAbility)
      if (def) defs.push({ id: s.rareAbility, kind: 'ability', icon: def.icon, hero: false })
    }
    defs.push({ id: 'haymaker', kind: 'haymaker', icon: hero.haymaker.icon, hero: true })
    defs.push({ id: 'restructure', kind: 'restructure', icon: hero.restructure.icon, hero: true })
    this.slotKeys = defs.map((d) => d.id).join(',')

    const bar = presentationData.abilityBar
    const pitchOf = (d: { hero: boolean }): number => (d.hero ? bar.heroPitch : bar.draftedPitch)
    const iconOf = (d: { hero: boolean }): number => (d.hero ? bar.heroIcon : bar.draftedIcon)
    // One gap, where the run's hand ends and the hero's own begins.
    const gaps = defs.some((d) => d.hero) && defs.some((d) => !d.hero) ? bar.groupGap : 0
    const totalW = defs.reduce((a, d) => a + pitchOf(d), 0) + gaps

    // Along the bottom centre, where a hero's actives belong, clear of the
    // counters entirely.
    let x = (this.scale.width - totalW) / 2
    // Inside the bottom band, on the baseline the band was sized for.
    const bottomY = this.abilityTop
    defs.forEach((d, i) => {
      if (i > 0 && d.hero && !defs[i - 1]!.hero) x += bar.groupGap
      const pitch = pitchOf(d)
      const box = iconOf(d)
      const y = bottomY
      const cx = x + pitch / 2
      const cy = y + ICON_H / 2
      const frame = this.add.graphics()
      const icon = this.add.image(cx, cy, d.icon)
      fitInBox(icon, d.icon, box)
      const sweep = this.add.graphics()
      const timer = this.add.text(cx, cy, '', {
        fontFamily: FONT_UI, fontSize: '19px', fontStyle: 'bold', color: COLOR.ink,
        stroke: '#0d1016', strokeThickness: 5,
      }).setOrigin(0.5)
      const hit = this.add.rectangle(cx, cy, pitch, ICON_H, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => {
        if (d.kind === 'ability') this.world.armAbility(d.id)
        else if (d.kind === 'haymaker') this.world.castHaymaker()
        else this.world.armRestructure()
      })

      this.slots.push({ id: d.id, kind: d.kind, hero: d.hero, frame, sweep, icon, timer, hit, x, y, pitch })
      x += pitch
    })
  }

  update(): void {
    // The HUD is a separate scene and renders after the world, so a dialog the
    // world owns cannot cover it — the wave message ran straight through the
    // panel's title and the ability bar sat on its bottom edge. Dimming this
    // scene's camera pushes the whole HUD behind the modal in one move, and
    // restores it exactly, without touching any object's own alpha. The HUD's
    // own pause dialog is unaffected: the world has no modal open then.
    this.cameras.main.setAlpha(this.world.modalOpen ? 0.3 : 1)

    const s = this.world.status

    // A refusal is consumed once: the world raises it, the HUD shows it.
    if (s.alert) {
      this.toast(s.alert)
      s.alert = ''
    }
    // Scene creation order is not guaranteed, so wait for the game scene to
    // have populated its status before drawing anything that depends on it.
    if (s.heroName === '') return
    const wanted = [...s.abilities, 'haymaker', 'restructure', s.rareAbility ?? ''].join(',')
    if (!this.slotsBuilt || wanted !== this.slotKeys + (s.rareAbility ? '' : ',')) {
      this.buildSlots()
      this.slotsBuilt = true
    }

    this.setCounter(this.peanutsText, `${s.peanuts}`, this.peanutsField)
    this.setCounter(this.livesText, `${s.lives}`, this.livesField)
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
    this.setCounter(this.waveText, `${Math.min(s.wave + 1, s.waveCount)}/${s.waveCount}`, this.waveField)
    this.message.setText(s.message)

    this.drawBossBar(s)
    this.drawStartButton(s)
    this.drawSlots(s)
    this.drawHeroBar(s)
  }

  /**
   * The boss bar, in the left region of the top band's second row.
   *
   * It takes the same region the wave message uses, and the message is hidden
   * while it is up: a full-width bar centred across the top used to run
   * through the wave counter on one side and the start button on the other,
   * and pushing the message out of its way pushed it into the board.
   *
   * The name is drawn *inside* the bar rather than under it, because a label
   * on its own line is another row the band would have to be tall enough for.
   */
  private drawBossBar(s: GameScene['status']): void {
    this.bossBar.clear()
    const boss = Boolean(s.bossName)
    // One region, one occupant.
    this.message.setVisible(!boss)
    if (!boss) {
      this.bossLabel.setText('')
      return
    }
    const region = this.regions.left
    const h = HUD.bands.rowHeight - 4
    const x = region.x
    const y = this.row2Y
    const w = region.width
    const ratio = Phaser.Math.Clamp(s.bossHealth / Math.max(s.bossMax, 1), 0, 1)

    this.bossBar.fillStyle(0x0d1016, 0.82).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 5)
    this.bossBar.fillStyle(0x3a1f1c, 1).fillRect(x, y, w, h)
    this.bossBar.fillStyle(0xff5a3c, 1).fillRect(x, y, w * ratio, h)
    this.bossBar.lineStyle(2, 0xff8f7a, 1).strokeRoundedRect(x - 3, y - 3, w + 6, h + 6, 5)
    // The two marks where he starts taxing harder, so the phases are legible.
    for (const t of HUD.bossPhaseMarks) {
      this.bossBar.lineStyle(2, 0x0d1016, 0.8).lineBetween(x + w * t, y, x + w * t, y + h)
    }
    this.bossLabel.setText(s.bossName.toUpperCase())
    this.bossLabel.setPosition(x + w / 2, y + h / 2)
  }

  /**
   * A refusal, shown above the ability bar where the tap happened.
   *
   * The guidance line lives in the opposite corner and is easy to miss, so a
   * tap that could not do anything looked like a dead button. This puts the
   * reason under the player's own thumb for a moment and then gets out of the
   * way.
   */
  private toast(text: string): void {
    this.activeToast?.destroy()
    const label = this.add.text(this.scale.width / 2, this.abilityTop - 6, text, {
      fontFamily: FONT_UI, fontSize: '17px', color: COLOR.ink,
      fontStyle: 'bold', align: 'center',
      wordWrap: { width: this.scale.width - 80 },
    }).setOrigin(0.5, 1).setDepth(500)
    const pad = 14
    const pill = this.add.rectangle(
      label.x, label.y - label.height / 2,
      label.width + pad * 2, label.height + pad * 0.8,
      0x0d1016, 0.82,
    ).setOrigin(0.5).setDepth(499)
    const parts: Phaser.GameObjects.GameObject[] = [pill, label]
    this.activeToast = this.add.container(0, 0, parts).setDepth(499)
    this.tweens.add({
      targets: this.activeToast, alpha: 0, delay: 1500, duration: 420,
      onComplete: () => { this.activeToast?.destroy(); this.activeToast = undefined },
    })
  }

  private activeToast?: Phaser.GameObjects.Container

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
      fontFamily: FONT_UI, fontSize: '18px', fontStyle: 'bold', color: colour,
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

    if (s.phase === 'ready') {
      const n = Math.min(s.wave + 1, s.waveCount)
      // The clock is on the button because the button is the thing it is
      // counting down to, and the bonus is beside it because that is the whole
      // argument for pressing it now rather than letting it run out.
      const left = Math.ceil(s.readyCountdown)
      if (left > 0) {
        const bonus = Math.floor(s.readyCountdown) * RULES.pacing.earlyStartPeanutsPerSecond
        // Three things on one plate. Separated by middots rather than double
        // spaces so the line is as short as it can be and still parse.
        this.startBtn.setLabel(`WAVE ${n} · ${left}s${bonus > 0 ? ` · +${bonus}` : ''}`)
      } else {
        this.startBtn.setLabel(`START WAVE ${n}`)
      }
    }
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

      // Armed reads as a glow around the card rather than a plate behind it,
      // and it follows the card's own shape: a ring for the round hero
      // medallions, a rounded rect for the rectangular drafted plates. A box
      // drawn around a circle is exactly the kind of thing that makes two
      // deliberately different shapes look like one of them is a mistake.
      slot.frame.clear()
      if (armed) {
        slot.frame.lineStyle(3, COLOR.accent, 0.95)
        if (slot.hero) {
          slot.frame.strokeCircle(slot.x + slot.pitch / 2, slot.y + ICON_H / 2, ICON_H / 2 + 3)
        } else {
          slot.frame.strokeRoundedRect(slot.x + 4, slot.y - 2, slot.pitch - 8, ICON_H + 4, 8)
        }
      }

      slot.timer.setText(ready ? '' : String(Math.ceil(left)))

      slot.sweep.clear()
      if (!ready) {
        const p = this.world.cooldowns.progress(slot.id)
        slot.sweep.fillStyle(0x000000, 0.5)
        slot.sweep.slice(
          slot.x + slot.pitch / 2, slot.y + ICON_H / 2, ICON_H * 0.42,
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

  /**
   * The hero's name and health, in the right region of the second row.
   *
   * Name on the bar rather than above it, for the same reason the boss's is:
   * a second line is a taller band, and on a phone the band is taken out of
   * the board.
   */
  private drawHeroBar(s: GameScene['status']): void {
    const region = this.regions.right
    const x = region.x
    const w = region.width
    const h = HUD.bands.rowHeight - 4
    const y = this.row2Y

    let state = ''
    if (s.heroDown) state = ' · DOWN'
    else if (s.lastStand) state = ' · DAD MODE'
    this.heroLabel.setText(`${s.heroName}${state}`)
    this.heroLabel.setColor(s.lastStand ? COLOR.fire : COLOR.ink)
    this.heroLabel.setPosition(x + w - 4, y + h / 2)
    this.heroLabel.setOrigin(1, 0.5)

    const ratio = Phaser.Math.Clamp(s.heroHealth / Math.max(s.heroMax, 1), 0, 1)
    this.heroBar.clear()
    this.heroBar.fillStyle(0x000000, 0.55).fillRoundedRect(x, y, w, h, 5)
    this.heroBar.fillStyle(s.heroDown ? 0x5a5a5a : s.lastStand ? 0xff5a3c : 0x4fa3e3, 1)
    this.heroBar.fillRoundedRect(x + 2, y + 2, Math.max(0, (w - 4) * ratio), h - 4, 4)
    // The 25% mark, so the Last Stand threshold is legible before it fires.
    const markX = x + 2 + (w - 4) * 0.25
    this.heroBar.lineStyle(1, COLOR.panelEdge, 0.9).lineBetween(markX, y, markX, y + h)
  }
}
