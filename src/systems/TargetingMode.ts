// The mode the board is in while it waits for the player to tap a place.
//
// WHY THIS IS ITS OWN FILE. Targeting was two fields on GameScene — a string
// mode and a pending ability id — written by five different methods and read
// by seven. Every way OUT of the mode was a separate piece of code that had to
// remember to clear both, and playtesting found the state the shape of that
// design predicts: a mode with one exit, and that exit broken. There was no
// place to ask "what are all the ways out of this?", so there was no place for
// the answer to be wrong in an obvious way.
//
// So the mode is an object with an explicit set of exits, and it is
// Phaser-free: which taps cancel, which taps commit, and whether an exit
// spends the ability are decisions a test can drive directly rather than
// through a canvas.
//
// THE RULE THE WHOLE FILE EXISTS FOR: exactly one exit commits. `resolveTap`
// on a legal point returns `commit`, and everything else — the button, the
// key, the toggle, a tap outside the legal area, a modal opening on top —
// returns `cancel`. A cancelled request is handed back untouched: the caller
// has not started a cooldown, has not spent a rare drop, and has not moved a
// soldier. Nothing here can spend anything, because nothing here knows how.

/**
 * What the mode is waiting for a place for.
 *
 * `power` is slot 2, the hero power. It is its own kind rather than an
 * `ability` because the two are looked up in different tables — one in
 * abilities.json and one on the hero — and a kind that means "look it up
 * somewhere" is a kind that gets looked up in the wrong place.
 */
export type TargetKind = 'ability' | 'rally' | 'power'

/** One request for a place on the map. `id` identifies it inside its kind: an
 *  ability id, or the key of the tower whose lads are being posted. */
export interface TargetRequest {
  kind: TargetKind
  id: string
}

/**
 * Why the mode ended. Every one of these except `commit` leaves the request
 * unspent, and they are named rather than boolean so the log says which way
 * out the player actually found.
 */
export type ExitReason =
  /** The CANCEL control. */
  | 'button'
  /** The same ability button pressed a second time. */
  | 'toggle'
  /** Escape, on a desktop. */
  | 'key'
  /** A tap on the board outside the area this request may be placed in. */
  | 'outside'
  /** Another request armed on top of this one, or the selection cleared for
   *  some other reason: a wave ending, a dialog opening, the run finishing. */
  | 'replaced'
  /** The tap landed and the caller is about to act on it. THE ONLY EXIT THAT
   *  SPENDS ANYTHING. */
  | 'commit'

/** Whether an exit spends the thing that was armed. */
export function spends(reason: ExitReason): boolean {
  return reason === 'commit'
}

/** What a tap resolved to: the request, and what to do about it. */
export interface TapOutcome {
  request: TargetRequest
  reason: ExitReason
}

/**
 * Arming a request when one is already armed.
 *
 * `toggled` is the second press of the SAME button, which is one of the ways
 * out. A DIFFERENT button replaces the first, which is not a way out of
 * targeting so much as a way sideways — but the first request is still
 * dropped unspent, and the caller still has to hear about it.
 */
export type ArmResult = 'armed' | 'toggled' | 'replaced'

export function sameRequest(a: TargetRequest | null, b: TargetRequest | null): boolean {
  return a !== null && b !== null && a.kind === b.kind && a.id === b.id
}

export class TargetingMode {
  private req: TargetRequest | null = null

  /** True while the board is waiting for a tap. */
  get active(): boolean {
    return this.req !== null
  }

  /** What it is waiting to place, or null. */
  get request(): TargetRequest | null {
    return this.req
  }

  /**
   * The armed BUTTON's id, or null.
   *
   * Both kinds that come off the ability bar, because the bar draws its armed
   * glow from this and a hero power armed with no glow reads as a press that
   * did nothing. Not a rally order: that is a tower's selection, has no button
   * on the bar, and must not light one.
   */
  get pendingAbility(): string | null {
    return this.req !== null && this.req.kind !== 'rally' ? this.req.id : null
  }

  /**
   * Arms a request, or toggles off the one already armed.
   *
   * The toggle is deliberate and it is the cheapest escape there is: the
   * button the player just pressed is under their thumb, so pressing it again
   * has to mean "no, actually". It has to compare the WHOLE request, not just
   * the id — an ability and a tower could share a key and the second press
   * would silently mean the other one.
   */
  arm(next: TargetRequest): ArmResult {
    if (sameRequest(this.req, next)) {
      this.req = null
      return 'toggled'
    }
    const had = this.req !== null
    this.req = next
    return had ? 'replaced' : 'armed'
  }

  /**
   * Leaves the mode without spending anything, and reports what was dropped.
   *
   * Returns null when there was nothing armed, so a caller can wire this to
   * every escape it has — the button, the key, a dialog opening — without any
   * of them needing to check first. An escape that has to ask permission is an
   * escape somebody will forget to ask for.
   */
  cancel(reason: Exclude<ExitReason, 'commit'>): TapOutcome | null {
    const req = this.req
    if (!req) return null
    this.req = null
    return { request: req, reason }
  }

  /**
   * What a tap on the board does.
   *
   * `valid` is the caller's answer to "may this request be placed here?" — a
   * summon has to land on the road, a rally point has to be within the tower's
   * ring, an unrestricted ability may go anywhere.
   *
   * AN INVALID TAP CANCELS. It used to refuse and stay armed, on the reasoning
   * that a misjudged tap should not cost the ability. That is right about the
   * ability and wrong about the mode: it means the ONLY thing a tap can do is
   * keep the player where they are, which is the soft-lock as felt rather than
   * as coded. Leaving is free — nothing is spent either way — so a tap that
   * cannot land is read as "not there, then", and the ability is still ready
   * on the bar for the next one.
   */
  resolveTap(valid: boolean): TapOutcome | null {
    const req = this.req
    if (!req) return null
    this.req = null
    return { request: req, reason: valid ? 'commit' : 'outside' }
  }
}
