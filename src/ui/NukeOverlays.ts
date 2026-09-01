// The Server Nuke's two moments.
//
// It is the rarest thing in the game — a 2% drop from elites and bosses, once
// per run, one use — and until now it arrived as a fifth icon quietly
// appearing in the ability bar, and fired on a single tap of that icon.
// Neither of those is proportionate to what it is.
//
//   `NukeEarnedOverlay` is the announcement. Loud on purpose.
//   `NukeLaunchOverlay` is the confirmation. A once-per-run ability that
//   misfires on a stray tap is genuinely bad, so the launch has to be a
//   deliberate press and the way out has to be unmissable.
//
// Both are modals in the sense systems/Layers.ts means: a full-screen blocker
// at `LAYER.modalDim`, content at `LAYER.modal`, the HUD stood down and the
// camera rig gated by GameScene while either is up. Neither draws its own
// dimming rectangle at some hand-picked depth, because that is the pattern
// that produced three separate layering bugs.

import Phaser from 'phaser'
import { COLOR, FONT_DISPLAY, FONT_UI } from './Theme.ts'
import { LAYER } from '../systems/Layers.ts'
import { ART, fitContentHeight, renderFor } from '../systems/Art.ts'
import { EFFECT_MS, playEffect } from '../systems/Effects.ts'
import { play } from '../systems/Audio.ts'
import presentationData from '../data/presentation.json'
import { viewH, viewW } from '../systems/Resolution.ts'

const EARNED = presentationData.serverNuke.earned
const LAUNCH = presentationData.serverNuke.launch

/** Fits a size to the viewport so nothing is clipped on a small phone. */
function fitToViewport(scene: Phaser.Scene, want: number, share: number): number {
  const room = Math.min(viewW(scene), viewH(scene)) * share
  return Math.min(want, room)
}

/**
 * The announcement, roughly 2.5 seconds, tap to skip.
 *
 * The sequence is a chain rather than a pile of delayedCalls, so skipping is
 * one thing to cancel and the timings cannot drift apart.
 */
export class NukeEarnedOverlay {
  private readonly scene: Phaser.Scene
  readonly blocker: Phaser.GameObjects.Rectangle
  /** Public for the harness, which checks which camera draws it. */
  readonly layer: Phaser.GameObjects.Container
  /** The viewport this panel was composed against; see recentre. */
  private builtW = 0
  private builtH = 0
  readonly medallion: Phaser.GameObjects.Image
  readonly headline: Phaser.GameObjects.Text
  readonly subhead: Phaser.GameObjects.Text
  private readonly hint: Phaser.GameObjects.Text
  private readonly onDone: () => void
  private closed = false
  private flying = false
  /** Where the icon ends up: its slot in the ability bar. */
  private readonly target: { x: number; y: number; height: number }
  /** The scale the viewport fit chose. Every tween returns to it. */
  private restScale = 1

  constructor(
    scene: Phaser.Scene,
    iconKey: string,
    target: { x: number; y: number; height: number },
    onDone: () => void,
  ) {
    this.scene = scene
    this.onDone = onDone
    this.target = target

    const W = viewW(scene)
    const H = viewH(scene)

    this.blocker = scene.add
      .rectangle(W / 2, H / 2, W * 3, H * 3, 0x000000, EARNED.dim)
      .setDepth(LAYER.modalDim)
      .setScrollFactor(0)
      .setInteractive()
    this.blocker.on('pointerdown', () => this.skip())

    this.layer = scene.add.container(0, 0).setDepth(LAYER.modal).setScrollFactor(0)
    this.builtW = W
    this.builtH = H

    // Sized against the viewport, not against the design box: at 568x320 a
    // 260px medallion plus two lines of display type does not fit, and the
    // whole point is that it is bigger than any icon normally renders.
    const medH = fitToViewport(scene, EARNED.medallionHeight, 0.46)
    this.medallion = scene.add.image(W / 2, H / 2, iconKey)
    fitContentHeight(this.medallion, iconKey, medH)
    // The size the fit chose, kept, because the bounce tween has to land on
    // THIS rather than on 1. Tweening to an absolute scale of 1 undid the fit
    // and drew the medallion at its native 256px on every viewport — 80% of
    // the height of a 320px phone.
    this.restScale = this.medallion.scaleX
    this.medallion.setScale(this.restScale * 0.2)

    const headSize = Math.round(fitToViewport(scene, 54, 0.115))
    const subSize = Math.round(fitToViewport(scene, 26, 0.062))
    this.headline = scene.add.text(W / 2, H / 2 - medH / 2 - headSize * 0.9, EARNED.headline, {
      fontFamily: FONT_DISPLAY, fontSize: `${headSize}px`, color: '#ffd45e',
      stroke: '#1a1208', strokeThickness: Math.max(5, headSize / 7), letterSpacing: 2,
      align: 'center', wordWrap: { width: W - 24 },
    }).setOrigin(0.5).setAlpha(0)

    this.subhead = scene.add.text(W / 2, H / 2 + medH / 2 + subSize * 0.9, EARNED.subhead, {
      fontFamily: FONT_DISPLAY, fontSize: `${subSize}px`, color: COLOR.ink,
      stroke: '#1a1208', strokeThickness: Math.max(4, subSize / 7), letterSpacing: 1,
      align: 'center', wordWrap: { width: W - 24 },
    }).setOrigin(0.5).setAlpha(0)

    this.hint = scene.add.text(W / 2, H - 14, EARNED.skipHint, {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
    }).setOrigin(0.5, 1).setAlpha(0)

    this.layer.add([this.medallion, this.headline, this.subhead, this.hint])
    this.run(medH)
  }

  get active(): boolean {
    return !this.closed
  }

  /** The blocker and the content, for the scene that splits its cameras. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.blocker, this.layer]
  }

  /**
   * Re-centres the panel when the viewport changes under it.
   *
   * Everything here is composed once, absolutely, against the viewport as it
   * was at that moment — a button at W/2, a heading above it. The UI camera IS
   * re-centred on a resize, so without this the two disagree and the panel
   * sits off-centre by half the difference: rotate a phone, or let iOS
   * collapse the URL bar while the panel is open, and the content walks
   * towards an edge while the camera stays where it is.
   *
   * Shifting the container by half the delta is exact for centred content and
   * costs nothing, which is why it is done rather than rebuilding.
   */
  recentre(w: number, h: number): void {
    this.layer.setPosition((w - this.builtW) / 2, (h - this.builtH) / 2)
  }


  owns(objects: Phaser.GameObjects.GameObject[]): boolean {
    return objects.includes(this.blocker)
  }

  private run(medH: number): void {
    const s = this.scene
    play(s, 'cast-servernuke', 0.9)

    // 1. The medallion bounces up to full size.
    s.tweens.add({
      targets: this.medallion,
      scaleX: this.restScale,
      scaleY: this.restScale,
      duration: EARNED.bounceMs,
      ease: 'Back.easeOut',
      onComplete: () => this.slam(medH),
    })
    s.tweens.add({ targets: this.hint, alpha: 1, duration: 300, delay: 500 })
  }

  /** 2. The text slams in, and the blast goes off behind the medallion. */
  private slam(medH: number): void {
    if (this.closed) return
    const s = this.scene

    for (const [t, from] of [[this.headline, -1], [this.subhead, 1]] as const) {
      const restY = t.y
      t.setY(restY + from * 40).setAlpha(0).setScale(1.6)
      s.tweens.add({
        targets: t, y: restY, alpha: 1, scaleX: 1, scaleY: 1,
        duration: EARNED.slamMs, ease: 'Back.easeOut',
      })
    }

    // The blast is BEHIND the medallion, so the icon stays readable through it.
    const blast = playEffect(s, ART.fx.blast, viewW(s) / 2, viewH(s) / 2, {
      size: fitToViewport(s, EARNED.blastSize, 1.15),
      depth: LAYER.modal - 1,
      durationMs: EFFECT_MS.blastMs * 1.4,
    })
    blast.setScrollFactor(0)
    this.onEffect?.(blast)

    s.cameras.main.shake(EARNED.shakeMs, EARNED.shakeIntensity)
    s.cameras.main.flash(EARNED.flashMs, 255, 255, 255)

    s.time.delayedCall(EARNED.holdMs, () => this.flyToSlot())
    void medH
  }

  /** Set by the scene so an effect created mid-sequence joins the UI camera. */
  onEffect?: (obj: Phaser.GameObjects.GameObject) => void

  /** 3. Everything shrinks into the ability bar, so the player sees where it
   *  went. This is also where a skip lands. */
  private flyToSlot(): void {
    if (this.closed || this.flying) return
    this.flying = true
    const s = this.scene

    s.tweens.add({ targets: [this.headline, this.subhead, this.hint], alpha: 0, duration: 140 })
    s.tweens.add({ targets: this.blocker, alpha: 0, duration: EARNED.flyMs })
    s.tweens.add({
      targets: this.medallion,
      x: this.target.x,
      y: this.target.y,
      scaleX: this.target.height / this.medallion.height,
      scaleY: this.target.height / this.medallion.height,
      duration: EARNED.flyMs,
      ease: 'Cubic.easeIn',
      onComplete: () => this.close(),
    })
  }

  /** A tap anywhere goes straight to the fly-out. The sequence is short, and a
   *  skip that cut it dead would leave the player without the one thing the
   *  whole sequence exists to say: where the icon went. */
  private skip(): void {
    if (this.flying) return
    this.scene.tweens.killTweensOf([this.medallion, this.headline, this.subhead])
    this.medallion.setScale(this.restScale)
    this.flyToSlot()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.blocker.destroy()
    this.layer.destroy(true)
    this.onDone()
  }
}

/**
 * The launch confirmation.
 *
 * Only two things on the screen respond: the dome, and the X. A tap anywhere
 * else is swallowed. The X is put in the opposite corner from the dome and
 * given its own generous hit box, because the cost of an accidental launch is
 * a run's rarest ability spent on nothing.
 */
export class NukeLaunchOverlay {
  private readonly scene: Phaser.Scene
  readonly blocker: Phaser.GameObjects.Rectangle
  /** Public for the harness, which checks which camera draws it. */
  readonly layer: Phaser.GameObjects.Container
  /** The viewport this panel was composed against; see recentre. */
  private builtW = 0
  private builtH = 0
  readonly button: Phaser.GameObjects.Image
  readonly hit: Phaser.GameObjects.Rectangle
  readonly closeHit: Phaser.GameObjects.Rectangle
  private pulse?: Phaser.Tweens.Tween
  private closed = false
  private fired = false

  constructor(scene: Phaser.Scene, onLaunch: () => void, onCancel: () => void) {
    this.scene = scene
    const W = viewW(scene)
    const H = viewH(scene)

    this.blocker = scene.add
      .rectangle(W / 2, H / 2, W * 3, H * 3, 0x000000, LAUNCH.dim)
      .setDepth(LAYER.modalDim)
      .setScrollFactor(0)
      .setInteractive()
    // Deliberately does nothing. Tapping outside the two controls must not
    // launch and must not cancel: a modal that closes on a stray tap is how a
    // once-per-run ability gets thrown away.
    this.blocker.on('pointerdown', () => {})

    this.layer = scene.add.container(0, 0).setDepth(LAYER.modal).setScrollFactor(0)
    this.builtW = W
    this.builtH = H

    const cfg = renderFor(ART.ui.nukeButton.up)
    const btnH = fitToViewport(scene, LAUNCH.buttonHeight, 0.62)
    const headSize = Math.round(fitToViewport(scene, 40, 0.1))

    // The button sits low enough to leave room for the heading above it, and
    // the whole group is centred on what is left after the heading.
    const groupTop = headSize * 1.6
    const cy = groupTop + (H - groupTop) / 2

    const heading = scene.add.text(W / 2, groupTop / 2 + 4, LAUNCH.heading, {
      fontFamily: FONT_DISPLAY, fontSize: `${headSize}px`, color: '#ff6b57',
      stroke: '#1a0d08', strokeThickness: Math.max(5, headSize / 7), letterSpacing: 3,
      align: 'center',
    }).setOrigin(0.5)

    this.button = scene.add.image(W / 2, cy, ART.ui.nukeButton.up)
    this.button.setScale(btnH / (cfg.contentHeight ?? this.button.height))

    // A hit box on the dome only, inset from the art's bounding box so the
    // transparent corners of a 600x495 PNG are not live.
    const bw = this.button.displayWidth * 0.62
    const bh = this.button.displayHeight * 0.62
    this.hit = scene.add.rectangle(W / 2, cy, bw, bh, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    this.hit.on('pointerdown', () => this.press(onLaunch))

    const hint = scene.add.text(W / 2, cy + this.button.displayHeight / 2 + 6, LAUNCH.confirmHint, {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim, letterSpacing: 1,
    }).setOrigin(0.5, 0)

    // The way out: top-left, diagonally opposite the dome's centre, with a hit
    // box larger than the glyph it draws.
    const cs = LAUNCH.closeSize
    const cxq = LAUNCH.closeMargin + cs / 2
    const cyq = LAUNCH.closeMargin + cs / 2
    const closeBg = scene.add.circle(cxq, cyq, cs / 2, 0x1b2430, 0.92)
      .setStrokeStyle(3, 0xf6ecd9, 0.9)
    const closeText = scene.add.text(cxq, cyq, LAUNCH.closeLabel, {
      fontFamily: FONT_UI, fontSize: `${Math.round(cs * 0.5)}px`,
      fontStyle: 'bold', color: COLOR.ink,
    }).setOrigin(0.5)
    this.closeHit = scene.add.rectangle(cxq, cyq, cs * 1.5, cs * 1.5, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    this.closeHit.on('pointerdown', () => { this.close(); onCancel() })

    this.layer.add([heading, this.button, this.hit, hint, closeBg, closeText, this.closeHit])

    play(scene, 'open')
    // Slams in.
    this.button.setScale((btnH / (cfg.contentHeight ?? this.button.height)) * 2.2).setAlpha(0)
    scene.tweens.add({
      targets: this.button,
      scaleX: btnH / (cfg.contentHeight ?? this.button.height),
      scaleY: btnH / (cfg.contentHeight ?? this.button.height),
      alpha: 1, duration: 260, ease: 'Back.easeOut',
      onComplete: () => this.startPulse(),
    })
  }

  get active(): boolean {
    return !this.closed
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.blocker, this.layer]
  }

  /**
   * Re-centres the panel when the viewport changes under it.
   *
   * Everything here is composed once, absolutely, against the viewport as it
   * was at that moment — a button at W/2, a heading above it. The UI camera IS
   * re-centred on a resize, so without this the two disagree and the panel
   * sits off-centre by half the difference: rotate a phone, or let iOS
   * collapse the URL bar while the panel is open, and the content walks
   * towards an edge while the camera stays where it is.
   *
   * Shifting the container by half the delta is exact for centred content and
   * costs nothing, which is why it is done rather than rebuilding.
   */
  recentre(w: number, h: number): void {
    this.layer.setPosition((w - this.builtW) / 2, (h - this.builtH) / 2)
  }


  owns(objects: Phaser.GameObjects.GameObject[]): boolean {
    return objects.includes(this.blocker)
      || objects.includes(this.hit)
      || objects.includes(this.closeHit)
  }

  /** Slow, so it reads as armed and waiting rather than as an alarm. */
  private startPulse(): void {
    if (this.closed) return
    const base = this.button.scaleX
    this.pulse = this.scene.tweens.add({
      targets: this.button,
      scaleX: base * LAUNCH.pulseScale,
      scaleY: base * LAUNCH.pulseScale,
      duration: LAUNCH.pulseMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  private press(onLaunch: () => void): void {
    if (this.fired || this.closed) return
    this.fired = true
    this.pulse?.stop()
    // The dome goes down and stays down. Same box, same chrome ring position,
    // so the swap reads as the dome depressing rather than as a new picture.
    this.button.setTexture(ART.ui.nukeButton.down)
    this.hit.disableInteractive()
    this.closeHit.disableInteractive()
    play(this.scene, 'build')
    this.scene.cameras.main.shake(LAUNCH.shakeMs, LAUNCH.shakeIntensity)
    this.scene.time.delayedCall(LAUNCH.pressHoldMs, () => {
      this.close()
      onLaunch()
    })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.pulse?.stop()
    this.blocker.destroy()
    this.layer.destroy(true)
  }
}
