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
