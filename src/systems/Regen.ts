// An enemy that repairs itself, and the one mechanic level 9 could not build
// out of something that already shipped.
//
// HAT-GTT heals. Everything else in its fight is an existing system wearing
// level 9's art -- the Wall of Text is `systems/Flame.ts`, CANCER's and
// PERPLEXED's casts are `systems/TowerDisable.ts`, the No-Pilot's charge is
// `systems/Blades.ts` -- and none of those puts health back. `onHealthThreshold`
// was the near miss: it fires ONCE at a share of health and summons, which is a
// one-shot event rather than a thing that keeps happening, and a hat that
// repaired itself exactly once would be a flourish rather than a fight.
//
// THE CADENCE IS THE DISABLER'S, field for field, because every telegraphed
// repeat in this game is: a cooldown that starts full so nothing opens with a
// cast, a state object owned by the caller, and the rule that a dead caster
// does nothing. What differs is that there is no target to lock and no windup
// to draw -- a heal is not something the player can dodge, it is something the
// player has to out-damage, and the effect sheet playing over the hat IS the
// warning that it happened.
//
// IT IS ARMED BY A THRESHOLD AND THEN KEEPS GOING. Below `belowHealth` it
// repairs every `cooldown` seconds for as long as it is hurt; back above, it
// stops. That is what makes it a fight rather than a timer: a player who
// commits enough damage pushes it past the threshold and out of the mechanic,
// and a player who chips at it is fighting a pool that refills.
//
// Phaser-free like the other rule modules, and `tools/soak/Sim.ts` runs this
// same file -- so the health the soak reports and the health the player chews
// through are the same arithmetic rather than two implementations that agree
// until they do not.

/** The block an enemy carries in enemies.json. */
export interface RegenDef {
  /** Armed below this share of max health, 0-1. Above it, nothing happens. */
  belowHealth: number
  /** Health restored per repair. Flat, not a share: a share would make the
   *  mechanic weakest exactly when it matters most. */
  heal: number
  /** Seconds between repairs, measured from the last one. */
  cooldown: number
  /** The sheet played OVER the enemy when it repairs, as a manifest key. */
  fx: string
  /** How big that sheet is drawn, in world pixels. Square. */
  fxSize: number
  /** A second sprite worn while it repairs, as a manifest key.
   *
   *  HAT-GTT's -a and -b are the same hat at two tilts, and the joke is that
   *  its transformation changes almost nothing. Swapping to -b for the length
   *  of a repair is the only place the second state is used and the only
   *  difference there is meant to be. Optional: an enemy with one picture
   *  simply does not set it. */
  altSprite?: string
  /** Seconds the alternate sprite is worn. */
  altSeconds?: number
}

/** Where one healer is in its own cycle. */
export interface RegenState {
  /** Counts down to the next repair. */
  cooldown: number
  /** Seconds left of the alternate sprite, or 0. */
  altLeft: number
}

export function newRegenState(def: RegenDef): RegenState {
  // A FULL COOLDOWN TO START, so a boss that walks in already damaged -- which
  // is what a boss summoned into a fight in progress is -- does not repair on
  // the frame it arrives. `Disabler` opens the same way for the same reason.
  return { cooldown: def.cooldown, altLeft: 0 }
}

/** What a tick of the cycle did. `healed` is 0 on every frame but the one. */
export function tickRegen(
  at: RegenState,
  dt: number,
  alive: boolean,
  health: number,
  maxHealth: number,
  def: RegenDef,
): { state: RegenState; healed: number } {
  const s: RegenState = { cooldown: at.cooldown, altLeft: Math.max(0, at.altLeft - dt) }
  // A DEAD HEALER HEALS NOTHING, and a full one does not either. The second
  // clause is what stops a hat sitting at full health with an effect playing
  // over it every nine seconds, which reads as a bug rather than as a mechanic.
  if (!alive || maxHealth <= 0) return { state: { ...s, cooldown: def.cooldown }, healed: 0 }
  if (health >= maxHealth) return { state: { ...s, cooldown: def.cooldown }, healed: 0 }
  if (health / maxHealth >= def.belowHealth) {
    // NOT ARMED, AND THE COOLDOWN IS RESET rather than left running. Otherwise
    // a boss that dropped below the threshold, was healed back above it and
    // then dropped again would repair instantly on the second crossing, which
    // is a free cast the player did nothing to earn.
    return { state: { ...s, cooldown: def.cooldown }, healed: 0 }
  }
  s.cooldown -= dt
  if (s.cooldown > 0) return { state: s, healed: 0 }
  s.cooldown = def.cooldown
  s.altLeft = def.altSprite ? (def.altSeconds ?? 1.0) : 0
  // Never past full: the caller adds this to the pool and a heal that
  // overshoots would make `health / maxHealth` wrong for one frame, which the
  // health bar would draw.
  return { state: s, healed: Math.min(def.heal, maxHealth - health) }
}
