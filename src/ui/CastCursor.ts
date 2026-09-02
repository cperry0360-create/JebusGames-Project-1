import Phaser from 'phaser'
import { PRESENTATION } from '../systems/Presentation.ts'

/**
 * Where a summon will land, drawn under the pointer.
 *
 * THE OVERLAY THIS REPLACES. Arming Gnomes used to paint a pale blue outline
 * down both edges of the entire lane — a spline across the whole board, over
 * painted grass and a painted dirt road, describing a rule the player has to
 * translate ("inside those two lines") into an answer to the only question
 * they actually have, which is "can I drop it HERE?". Kingdom Rush, which is
 * the reference for this game's look, draws nothing on the map at all.
 *
 * So the boundary is gone and the answer is on the cursor: a marker where the
 * drop is legal, a red X where it is not. The rule has not changed; only where
 * it is reported has.
 *
 * TWO SPRITES, ARRIVING SEPARATELY. The art is being drawn and is not here
 * yet, so each state is a texture key that may or may not exist. Where it
 * does, the sprite is used; where it does not, a tinted rectangle stands in.
 * The stub is deliberately crude — it should never be mistaken for finished
 * work — and it is swapped for the real thing by dropping the file in, with no
 * code change beyond the key already named in presentation.json.
 */
export class CastCursor {
  private readonly scene: Phaser.Scene
  // Typed as Image, and at runtime either half may be a Rectangle instead.
  // That is a deliberate small lie: every member used below — setPosition,
  // setScale, setVisible, setOrigin, setDepth, destroy — is on both, and the
  // alternative is a union that has to be narrowed at each of six call sites
  // to say nothing new.
  private readonly ok: Phaser.GameObjects.Image
  private readonly no: Phaser.GameObjects.Image
  /** Which of the two is currently on the glass, for the harness to read. */
  state: 'hidden' | 'valid' | 'invalid' = 'hidden'
  /** True when the real art was found, so a probe can tell a stub from a
   *  finished cursor rather than passing on either. */
  readonly stubbed: { valid: boolean; invalid: boolean }

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene
    const cfg = PRESENTATION.castCursor
    this.stubbed = {
      valid: !scene.textures.exists(cfg.validKey),
      invalid: !scene.textures.exists(cfg.invalidKey),
    }
    this.ok = this.make(cfg.validKey, cfg.stubValidColour, depth)
    this.no = this.make(cfg.invalidKey, cfg.stubInvalidColour, depth)
    this.hide()
  }

  private make(key: string, stubColour: number, depth: number): Phaser.GameObjects.Image {
    const cfg = PRESENTATION.castCursor
    const obj = this.scene.textures.exists(key)
      ? this.scene.add.image(0, 0, key).setDisplaySize(cfg.size, cfg.size)
      : this.scene.add.rectangle(0, 0, cfg.size, cfg.size, stubColour, cfg.stubAlpha)
        .setStrokeStyle(2, 0x0d1016, 0.9)
    return (obj as Phaser.GameObjects.Image).setOrigin(0.5).setDepth(depth).setVisible(false)
  }

  /**
   * Puts the cursor at a world point and says which state it is in.
   *
   * `zoom` divides the scale so the cursor is the same size on the glass at
   * every camera position — it is a pointer, and a pointer that grows as the
   * player zooms in is reporting the camera rather than the rule.
   */
  moveTo(x: number, y: number, valid: boolean, zoom: number): void {
    const shown = valid ? this.ok : this.no
    const hidden = valid ? this.no : this.ok
    hidden.setVisible(false)
    shown.setPosition(x, y)
    shown.setScale(1 / Math.max(0.0001, zoom))
    shown.setVisible(true)
    this.state = valid ? 'valid' : 'invalid'
  }

  hide(): void {
    this.ok.setVisible(false)
    this.no.setVisible(false)
    this.state = 'hidden'
  }

  /** The two objects, so the scene can hand them to the right camera. */
  get parts(): Phaser.GameObjects.GameObject[] {
    return [this.ok, this.no]
  }

  destroy(): void {
    this.ok.destroy()
    this.no.destroy()
  }
}
