/**
 * The one definition of "can still be acted on".
 *
 * THE BUG THIS EXISTS TO CLOSE. Liveness used to mean "not dead", and that is
 * not the same thing as "still on the board". An enemy that walks off the far
 * end of the lane is destroyed by `leak()` while its `status` is still
 * `'walking'` — it never dies, it leaves — so it passed every guard on the
 * damage path:
 *
 *   - the hero's committed-swing closure: `if (v.alive)`
 *   - `GameScene.damageEnemy`:            `if (!enemy.alive) return`
 *   - `Enemy.hurt`:                       `if (this.status === 'dead') return`
 *
 * All three asked "is it dead?" and none asked "does it still exist?". The
 * swing then reached `Enemy.hurt`, which called `floatingDamage(this.scene, …)`
 * on an object whose `scene` Phaser had already nulled, and the run ended with
 * `Cannot read properties of undefined (reading 'add')`.
 *
 * Fixing that at the `floatingDamage` call site would have moved the crash
 * rather than removed it. The definition is the bug, so there is now one
 * definition and every guard goes through it.
 *
 * Phaser-free on purpose: this is the predicate the whole damage path hangs
 * off, and it should be checkable without a canvas.
 */

/**
 * The minimum an object has to expose to be asked whether it is still there.
 *
 * `active` and `scene` are Phaser's own destruction markers — `destroy()` sets
 * `active` to false and `scene` to undefined — and `status` is the game's.
 * Both are needed: an object can be dead without being destroyed (a corpse
 * mid-fade) and destroyed without being dead (a leak).
 */
export interface BoardObject {
  /** Phaser sets this false in `GameObject.destroy()`. */
  active?: boolean
  /** Phaser sets this undefined in `GameObject.destroy()`. */
  scene?: unknown
  /** The game's own state. `'dead'` is the only value that means dead. */
  status?: string
}

/**
 * True when `o` is still a thing on the board that may be targeted, damaged,
 * blocked or drawn on.
 *
 * Deliberately strict about `active`: `!== false` rather than `=== true`, so a
 * plain object that never had the field (a test double, a pure-arithmetic
 * target) is not silently treated as destroyed. The same for `scene`. What is
 * being detected is a POSITIVE mark of destruction, not the absence of a mark.
 */
export function onBoard(o: BoardObject | null | undefined): boolean {
  if (!o) return false
  if (o.active === false) return false
  if ('scene' in o && (o.scene === null || o.scene === undefined)) return false
  return o.status !== 'dead'
}
