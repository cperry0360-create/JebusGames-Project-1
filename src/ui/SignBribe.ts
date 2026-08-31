import Phaser from 'phaser'
import type { SignBribeDef, SpriteRender } from '../types.ts'
import { EFFECT_MS, playEffect } from '../systems/Effects.ts'
import { ART, renderFor } from '../systems/Art.ts'
import { COLOR, FONT_UI } from './Theme.ts'

/**
 * The sign bribe.
 *
 * The painted map already has a villager outside Courjahan's Tavern holding a
 * blank board. He is, by default, advertising for the competition. Pay him and
 * he changes his mind for the rest of the run.
 *
 * It costs peanuts and buys nothing: no stats, no towers, no advantage. That
 * is the joke, and it is why the bribe is deliberately affordable rather than
 * cheap — spending it should cost you a tower you wanted.
 *
 * The board is placed by its *board*, not by its canvas. Both sprites are a
 * board with a post hanging below it, and the post is the part the villager's
 * hand covers, so the anchor is the middle of the board and the post falls
 * where it falls.
 */
export class SignBribe {
  private readonly scene: Phaser.Scene
  private readonly def: SignBribeDef
  private readonly sprite: Phaser.GameObjects.Image
  private readonly hit: Phaser.GameObjects.Rectangle
  private bribed = false

  constructor(scene: Phaser.Scene, x: number, y: number, boardWidth: number, def: SignBribeDef) {
    this.scene = scene
    this.def = def

    const key = ART.prop.signDefault
    this.sprite = scene.add.image(x, y, key)
    this.place(key, boardWidth)

    // A tap target sized to the board, not to the sprite: the sprite's canvas
    // includes the post and a margin of nothing, and a tap on empty grass
    // beside the villager should still be an order to the hero.
    this.hit = scene.add
      .rectangle(x, y, this.boardW(key, boardWidth), this.boardH(key, boardWidth), 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
  }

  /** True when this tap was on the sign, so the world ignores it. */
  owns(objects: Phaser.GameObjects.GameObject[]): boolean {
    return objects.includes(this.hit)
  }

  get depthY(): number {
    return this.sprite.y + this.sprite.displayHeight / 2
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
    const key = ART.prop.signBribed
    this.sprite.setTexture(key)
    this.place(key, this.hit.width)
    this.celebrate()
  }

  private cfg(key: string): SpriteRender {
    return renderFor(key)
  }

  private boardW(key: string, boardWidth: number): number {
    void key
    return boardWidth
  }

  private boardH(key: string, boardWidth: number): number {
    const c = this.cfg(key)
    const fracW = (c.boardRight ?? 1) - (c.boardLeft ?? 0)
    const fracH = (c.boardBottom ?? 1) - (c.boardTop ?? 0)
    const scale = boardWidth / (fracW * (c.contentWidth ?? 1))
    return fracH * (c.contentHeight ?? 1) * scale
  }

  /** Scales the sprite so its board is `boardWidth` across, and moves its
   *  origin to the middle of the board so it hangs from the right place. */
  private place(key: string, boardWidth: number): void {
    const c = this.cfg(key)
    const left = c.boardLeft ?? 0
    const right = c.boardRight ?? 1
    const top = c.boardTop ?? 0
    const bottom = c.boardBottom ?? 1
    this.sprite.setOrigin((left + right) / 2, (top + bottom) / 2)
    this.sprite.setScale(boardWidth / ((right - left) * this.sprite.width))
  }

  /** Small and quick. It is a joke, not an achievement. */
  private celebrate(): void {
    const { x, y } = this.sprite
    this.scene.tweens.add({
      targets: this.sprite, scale: this.sprite.scale * 1.18, duration: 130,
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
