// The single place any sprite is named.
//
// Gameplay code asks for a *role* — the blast effect, the tower base, a grass
// variant — and this module resolves it through src/data/art.json. Nothing
// outside this file may mention a sprite key or a path, so dropping in new art
// is an edit to art.json and nothing else. A test enforces it.
//
// Two things make an art swap a config change rather than a code change:
//   `files`  keys map to paths under assetRoot, so a second art directory is
//            just a different prefix on the path.
//   `render` gives a key an anchor and an on-screen height, so art authored at
//            any source size lands correctly without a magic number in code.

import Phaser from 'phaser'
import type { ArtDef, SpriteRender } from '../types.ts'
import artData from '../data/art.json'

const art = artData as ArtDef

export const ART = {
  assetRoot: art.assetRoot,
  credit: art.credit,
  /** Logical key -> path under assetRoot. Only the loader should need this. */
  files: art.files,
  map: art.map,
  ui: art.ui,
  /** Named UI icons. Read through `icon()`, never directly, so a missing file
   *  resolves to the visible stand-in instead of an empty texture key. */
  icons: (art.ui as { icons?: Record<string, string> }).icons ?? {},
  /** Props painted onto the map rather than owned by an entity. */
  prop: art.prop as { signDefault: string; signBribed: string; buildPad: string; buildPadQuiet?: string },
  scatter: (art as { scatter?: Record<string, string> }).scatter ?? {},
  optional: (art as { optional?: string[] }).optional ?? [],
  fx: art.fx,
  decor: art.decor,
  brand: art.brand,
  generated: art.generated,
  /** Art the UI draws greyed out when it is unavailable. */
  greyable: art.greyable,
  /**
   * Per-tier sprites, keyed by the tower's base sprite.
   *
   * A tower with an entry here swaps its whole silhouette as it upgrades; one
   * without keeps the single sprite it has always had. That is the whole
   * mechanism, and it is why adding tier art for the next tower is three file
   * entries, three render entries and one line in `towerTiers` — no code.
   */
  towerTiers: art.towerTiers ?? {},
}

/**
 * The sprite a tower of this tier should be wearing.
 *
 * Falls back to the base key, so the five towers that have no tier art yet
 * behave exactly as before and nothing has to know which is which.
 */
export function tierSprite(baseKey: string, tier: number): string {
  const set = (art.towerTiers ?? {})[baseKey]
  if (!set || set.length === 0) return baseKey
  return set[Phaser.Math.Clamp(tier - 1, 0, set.length - 1)] ?? baseKey
}

/** Whether this tower's look changes with its tier at all. */
export function hasTierArt(baseKey: string): boolean {
  return ((art.towerTiers ?? {})[baseKey]?.length ?? 0) > 1
}

export const SPRITE_KEYS = Object.keys(art.files)

/**
 * Keys whose file may legitimately not be there.
 *
 * A manifest hook is how new art is requested: the key and the path are agreed
 * first, the file lands later, and the game falls back until it does. The
 * fallback is the caller's job — `this.textures.exists(key)` and an
 * alternative — and NOTHING here may stop the game because one is absent.
 *
 * This list cost a live outage. `prop-build-pad` was added as a hook, the
 * loader and the manifest tests were both taught to tolerate it, and the one
 * place that actually gates the game — BootScene, which refused to start
 * Splash if any key was missing — was not. The result was a green screen and
 * the word "Missing art".
 */
export const OPTIONAL_SPRITE_KEYS: string[] = (art as { optional?: string[] }).optional ?? []

/**
 * Everything else: art the game cannot sensibly run without.
 *
 * Every map plate, every unit, every tower, every UI plate, every HUD icon.
 * A missing one is a real fault and says so loudly — but it still does not
 * stop the game, because a player looking at Phaser's magenta placeholder can
 * at least tell you what is wrong, and a player looking at a green screen
 * cannot.
 */
export const REQUIRED_SPRITE_KEYS = SPRITE_KEYS.filter(
  (k) => !OPTIONAL_SPRITE_KEYS.includes(k),
)

/** True when this key is allowed to be absent. */
export function isOptionalArt(key: string): boolean {
  return OPTIONAL_SPRITE_KEYS.includes(key)
}

/**
 * Scales a sprite so its *artwork* is `targetHeight` tall, ignoring any
 * transparent margin in the canvas, and anchors it on the artwork's centre.
 * Logos are padded and slightly off-centre, so sizing by the texture would
 * make them smaller than asked for and hang them off centre.
 */
export function fitContentHeight(
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  key: string,
  targetHeight: number,
): void {
  const cfg = renderFor(key)
  sprite.setOrigin(cfg.anchorX, cfg.anchorY)
  sprite.setScale(targetHeight / (cfg.contentHeight ?? sprite.height))
}

/**
 * Fits art inside a square box, from the manifest alone.
 *
 * Icons are drawn from every art source in the game at once — a 64px Kenney
 * tile beside a 616px painted tower — so an icon must never be sized by a bare
 * scale factor. Doing that is what put a 444px tower in a 56px HUD slot.
 */
export function fitInBox(
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  key: string,
  box: number,
): void {
  const cfg = renderFor(key)
  const w = cfg.contentWidth ?? sprite.width
  const h = cfg.contentHeight ?? sprite.height
  sprite.setOrigin(0.5, 0.5)
  sprite.setScale(Math.min(box / w, box / h))
}

/** On-screen width of art fitted to a given content height. */
export function contentWidthAt(key: string, targetHeight: number): number {
  const cfg = renderFor(key)
  if (!cfg.contentWidth || !cfg.contentHeight) return targetHeight
  return (cfg.contentWidth / cfg.contentHeight) * targetHeight
}

/** Centred at natural size unless the manifest says otherwise. */
const DEFAULT_RENDER: SpriteRender = { anchorX: 0.5, anchorY: 0.5 }

/**
 * The texture for a named UI icon, or the stand-in when it did not load.
 *
 * One resolver rather than a check at each call site, because the build-pad
 * miss got through precisely by having the fallback in some places and not in
 * the one that mattered. A caller cannot forget this: there is no other way to
 * get an icon key.
 */
export function icon(scene: Phaser.Scene, name: string): string {
  const key = ART.icons[name]
  if (key && scene.textures.exists(key)) return key
  return ART.generated.iconMissing
}

export function renderFor(key: string): SpriteRender {
  return { ...DEFAULT_RENDER, ...(art.render[key] ?? {}) }
}

/**
 * Places 3/4 character art so its *feet* sit on the object's position, and
 * returns how far the art's frame centre ends up from those feet.
 *
 * The origin deliberately stays at the frame's horizontal centre rather than
 * at the manifest's anchorX. These characters carry props — a leaf blower, a
 * rake — that widen the canvas to one side, so their feet are off-centre in
 * the frame. Anchoring on the feet would make flipX mirror the art about the
 * feet instead of about the character, and a sprite would jump sideways every
 * time it turned around. Offsetting the sprite instead keeps a flip a plain
 * mirror about the art's own centre line: negate the offset and the feet stay
 * exactly where they were.
 */
export function applyGroundRender(
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  key: string,
): number {
  const cfg = renderFor(key)
  sprite.setOrigin(0.5, cfg.anchorY)
  if (cfg.displayHeight !== undefined) sprite.setScale(cfg.displayHeight / sprite.height)
  const offset = (0.5 - cfg.anchorX) * sprite.displayWidth
  sprite.x = offset
  return offset
}

/**
 * Applies a key's anchor and on-screen height. Source art can be any size —
 * a 512px tower and a 64px tile both land at the height the manifest asks for,
 * with their aspect ratio preserved.
 */
export function applyRender(
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  key: string,
  scale = 1,
): void {
  const cfg = renderFor(key)
  sprite.setOrigin(cfg.anchorX, cfg.anchorY)
  if (cfg.displayHeight !== undefined) {
    const factor = (cfg.displayHeight / sprite.height) * scale
    sprite.setScale(factor)
  } else if (scale !== 1) {
    sprite.setScale(scale)
  }
}
