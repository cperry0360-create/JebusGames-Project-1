import Phaser from 'phaser'
import type { SignBoard, SignBribeDef } from '../types.ts'
import { EFFECT_MS, playEffect } from '../systems/Effects.ts'
import { ART } from '../systems/Art.ts'
import { fitAspect, placeSign } from '../systems/SignPlacement.ts'
import { COLOR, FONT_UI } from './Theme.ts'

/**
 * The sign bribe.
 *
 * The painted map already has a villager outside Courjahan's Tavern holding a
 * board. He is, by default, advertising for the competition. Pay him and he
 * changes his mind for the rest of the run.
 *
 * It costs peanuts and buys nothing: no stats, no towers, no advantage. That
 * is the joke, and it is why the bribe is deliberately affordable rather than
 * cheap — spending it should cost you a tower you wanted.
 *
 * THE BOARD IS PAINTED INTO THE PLATE and stays there. Both textures are
 * lettering on a transparent canvas, drawn on top of it in the rectangle
 * map.json records for that board, rotated to match. The sprites that carried
 * their own board and post are gone, so nothing here fits art to a board any
 * more: the rectangle is the board.
 *
 * The bribe therefore swaps the texture and does nothing else. No reposition,
 * no rescale, no re-anchor — the two canvases share one aspect deliberately,
 * and any per-texture sizing would make the words jump when they changed.
 */
export class SignBribe {
  private readonly scene: Phaser.Scene
  private readonly def: SignBribeDef
  private readonly sprite: Phaser.GameObjects.Image
  private readonly hit: Phaser.GameObjects.Rectangle
  private readonly foot: number
  private bribed = false

  constructor(
    scene: Phaser.Scene,
    board: SignBoard,
    worldWidth: number,
    worldHeight: number,
    def: SignBribeDef,
  ) {
    this.scene = scene
    this.def = def

    // FITTED INSIDE THE WOOD, not stretched to it. The panel is 1.23 and the
    // lettering is 1.40; stretching would squash the words by 14%.
    const probe = scene.textures.get(ART.prop.signDefault).getSourceImage()
    const at = fitAspect(placeSign(board, worldWidth, worldHeight),
      probe.width / probe.height)
    this.foot = at.footY
    this.sprite = scene.add.image(at.x, at.y, ART.prop.signDefault)
      .setDisplaySize(at.width, at.height)
      .setRotation(at.rotationRad)

    // A tap target on the painted BOARD rather than on the lettering, which is
    // inset inside it — the board's frame is part of what the player is aiming
    // at. It carries the same rotation, so the corners are where they look.
    const full = placeSign(board, worldWidth, worldHeight, 1)
    this.hit = scene.add
      .rectangle(full.x, full.y, full.width, full.height, 0xffffff, 0.001)
      .setRotation(full.rotationRad)
      .setInteractive({ useHandCursor: true })
  }

  /** True when this tap was on the sign, so the world ignores it. */
  owns(objects: Phaser.GameObjects.GameObject[]): boolean {
    return objects.includes(this.hit)
  }

  get depthY(): number {
    return this.foot
  }

  setDepth(depth: number): void {
    this.sprite.setDepth(depth)
  }

  get paid(): boolean {
    return this.bribed
  }

  get cost(): number {
    return this.def.cost
  }

  /**
   * What a tap on the sign should do. This never spends anything on its own —
   * paying peanuts on a single tap with no prompt is exactly what a misjudged
   * tap must not be able to do, so the scene puts up a confirm dialog and calls
   * `pay()` only if the player says yes.
   */
  tap(peanuts: number): 'ask' | 'broke' | 'done' {
    if (this.bribed) return 'done'
    if (peanuts < this.def.cost) return 'broke'
    return 'ask'
  }

  /** Takes the bribe. Only ever called after the player has confirmed. */
  pay(): void {
    if (this.bribed) return
    this.bribed = true
    // The whole swap. Same rectangle, same rotation, same everything else.
    this.sprite.setTexture(ART.prop.signBribed)
    this.celebrate()
  }

  /** Small and quick. It is a joke, not an achievement. */
  private celebrate(): void {
    const { x, y } = this.sprite
    const grown = this.sprite.scale * 1.18
    this.scene.tweens.add({
      targets: this.sprite, scale: grown, duration: 130,
      yoyo: true, ease: 'Back.easeOut',
    })

    // A ring of sparks around the board. Each one is the hit-spark animation
    // rather than a tile flung outward and shrunk, so they pop where they land.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      this.scene.time.delayedCall(i * 34, () => {
        playEffect(this.scene, ART.fx.spark,
          x + Math.cos(a) * 40, y + Math.sin(a) * 40 - 10, {
            size: EFFECT_MS.bribeSparkSize,
            depth: this.sprite.depth + 1,
            durationMs: EFFECT_MS.hitSparkMs,
          })
      })
    }

    const cheer = this.scene.add.text(x, y - 26, 'COURJAHAN!', {
      fontFamily: FONT_UI, fontSize: '20px', color: COLOR.amber, fontStyle: 'bold',
      stroke: '#0d1016', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(this.sprite.depth + 2)
    this.scene.tweens.add({
      targets: cheer, y: y - 58, alpha: 0, duration: 900, ease: 'Quad.easeOut',
      onComplete: () => cheer.destroy(),
    })
  }
}
