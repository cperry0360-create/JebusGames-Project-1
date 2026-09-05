// Which way a 3/4 character faces, given the direction it is walking.
// Phaser-free, so the rule can be tested without a browser — worth doing here
// because a map whose road only ever runs left to right never exercises it.

/**
 * True when the art should be mirrored. The art is drawn facing right, so a
 * leftward heading flips it.
 *
 * `deadZone` is how level a segment has to be before it counts at all: on a
 * near-vertical stretch the heading is almost pure north or south and its
 * sideways component is noise, so the current facing is kept rather than
 * snapped to whichever side the noise landed on. Without it a unit spins on
 * the spot every time it rounds a corner.
 */
export function facesLeft(angle: number, current: boolean, deadZone: number): boolean {
  const heading = Math.cos(angle)
  if (Math.abs(heading) < deadZone) return current
  return heading < 0
}

/** Which way a character's art is drawn before any mirroring. */
export type ArtFacing = 'left' | 'right'

/**
 * Whether the sprite has to be mirrored to face where it is going.
 *
 * THIS EXISTS BECAUSE THE ROSTER DOES NOT AGREE WITH ITSELF. The enemies, the
 * summoned fighters and four of the five heroes are drawn facing right; Cory —
 * every frame of him, and the SUV — is drawn facing left. The hero renderer
 * carried "both hero sprites are drawn facing LEFT" as a blanket rule with the
 * flip inverted to match, which was true of the only hero there was when it
 * was written. The four added afterwards all walked backwards.
 *
 * So the answer is a function of two things and the second one is DATA: which
 * way the character is heading, and which way its art was drawn. Nothing here
 * knows about any particular hero.
 */
export function mirroredFor(headingLeft: boolean, native: ArtFacing): boolean {
  return headingLeft !== (native === 'left')
}
