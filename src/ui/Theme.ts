import Phaser from 'phaser'
import presentation from '../data/presentation.json'

// One place for the game's look, so panels and labels stay consistent.

/**
 * Two faces, and the size decides which one you get.
 *
 * KenneyFuture is a display face and only a display face: the game's title,
 * the boss's name, the one big number on a results panel. Below about 40px its
 * letterforms stop resolving — **K reads as H, X as H, R as A** — and the game
 * starts misreading its own words. "KEEP PLAYING" rendered as "HEEP PLAYING",
 * the credits turned "CORY WORKS IN TAX" into "CORY WORHS IN TAH", "SPECIAL
 * THANKS" came out "SPECIAL THANHS", and the results panel announced THE LINE
 * BROHE. Every one of those was a real frame, not a theory.
 *
 * The floor is 44px rather than 40 because 40 is the edge of the failure and
 * not past it: at 40 an R is already ambiguous. Anything that wants the
 * display face and is smaller than this does not get it — it gets the sans,
 * sized up and set bold, which is a better-looking answer than a heading the
 * player has to decode.
 *
 * Everything else is the platform's own UI sans, which on a phone means San
 * Francisco and on a desktop means Segoe or Roboto — faces drawn for exactly
 * this job, hinted for small sizes, and already on the device so there is
 * nothing to download and nothing to wait for. Style loses to legibility here,
 * every time, without exceptions for numerals or for a word that happens to
 * contain no K.
 */
export const FONT_DISPLAY = 'KenneyFuture, Georgia, serif'
export const FONT_UI =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export const TYPE = presentation.typography

/**
 * The face for a given size. The only place that decision is made.
 *
 * Call sites ask for a size and get whichever face is legible at it, so a
 * heading cannot be set in the display face by accident just because a
 * previous version of it was bigger.
 */
export function faceFor(px: number): string {
  return px >= TYPE.displayMinSize ? FONT_DISPLAY : FONT_UI
}

/**
 * Clamps a size to the floor for screen-space UI: the HUD, dialogs and the
 * build menu, which render 1:1 against the real viewport.
 */
export function uiSize(px: number): number {
  return Math.max(px, TYPE.minUiSize)
}

/**
 * Clamps a size for the menu screens, which are composed against the 1280x720
 * design box and then fitted to the viewport. On a phone in landscape that fit
 * is about 0.55, so a menu label needs to be nearly twice the size of the same
 * label in the HUD to end up the same size on the glass.
 */
export function menuSize(px: number): number {
  return Math.max(px, TYPE.minMenuSize)
}

/**
 * Spacing for text meant to be read in sentences rather than glanced at.
 * A little air between lines and between letters is most of what separates
 * comfortable body copy from a wall.
 */
export const BODY_SPACING = {
  lineSpacing: TYPE.lineSpacing,
  letterSpacing: TYPE.letterSpacing,
} as const

export const COLOR = {
  ink: '#f6ecd9',
  dim: '#a4b0bd',
  /** A warm yellow. Named for the colour, not for a currency. */
  amber: '#f2d06b',
  danger: '#ff8f7a',
  good: '#8fd07a',
  fire: '#ff5a3c',
  panel: 0x171c24,
  panelEdge: 0x3d4a59,
  panelHi: 0x232c38,
  accent: 0x6cc24a,
}

export function heading(scene: Phaser.Scene, x: number, y: number, text: string, size = 30) {
  return scene.add
    .text(x, y, text, {
      // A heading below the display floor gets the sans instead. The face is
      // chosen by size, never by which helper happened to be called.
      fontFamily: faceFor(size),
      fontSize: `${size}px`,
      color: COLOR.ink,
      stroke: '#0d1016',
      strokeThickness: 4,
    })
    .setOrigin(0.5)
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, size = 15, color = COLOR.dim) {
  return scene.add
    .text(x, y, text, { fontFamily: FONT_UI, fontSize: `${uiSize(size)}px`, color })
    .setOrigin(0.5)
}

/**
 * A Phaser colour number as the CSS string a Text style wants.
 *
 * Colours live in presentation.json as numbers, because that is what every
 * Graphics call takes; text is the one consumer that needs a string, and the
 * four-term conversion was being written out by hand at each call site. One of
 * those copies forgot the pad and produced `#f6ecd` for a five-digit value.
 */
export function hexColour(n: number): string {
  return `#${Math.max(0, Math.round(n)).toString(16).padStart(6, '0')}`
}
