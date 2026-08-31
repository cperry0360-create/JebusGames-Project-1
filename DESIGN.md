# Courjahan Defense — Design Doc v2

JebusGames. Single-player roguelite tower defense, browser-based.

---

## Pitch

A cartoon tower defense where you never get the same loadout twice. Pick a hero, earn your towers as the run goes, and fight through a branching map. Permanent progression lives in a skill tree, not a star rating.

---

## Tone

Serious game, silly world. The mechanics are real and the difficulty is honest, but nothing takes itself too seriously.

How that shows up:
- Ability and tower names are jokes that still describe what they do
- Enemies have personality and dumb death animations
- Flavor text everywhere, especially on tooltips nobody needs to read
- The heroes are family, and the game knows it
- Never break the fun to land a joke. The joke rides on top of a game that works.

Rule of thumb: Kingdom Rush already does this. Its enemies wave at you before they eat your barracks. Aim there, then push a little sillier.

---

## Core loop

1. Pick a hero.
2. Start the run with **2 towers**.
3. Fight through a branching map of encounters.
4. Earn additional tower slots and new towers as you progress, up to a cap.
5. Between encounters, choose 1 of 3 temporary boons.
6. Win or die. Either way, earn Banner Points.
7. Spend Banner Points on the permanent skill tree.
8. Repeat with a different hero and a different hand.

---

## Towers — progressive unlock

This replaces the earlier draw-5-upfront model. Towers are **earned during the run**, not handed to you.

- Start every run with **2 towers**, drawn from the pool
- Earn a 3rd at the end of Act 1, a 4th at the end of Act 2
- **Cap is 4 by default. The 5th slot unlocks permanently on the Banner tree.**
- At **Forge** nodes you may swap one tower out for a new random draw

Why this beats the old model: the run gets an arc. Early game is tense and constrained, late game is a machine you built. And the swap at a Forge node is a real decision instead of a menu.

**16 towers in the pool.** The draw is weighted, not purely random. Your opening two must cover at least one damage option and one control or AOE option, so no run opens unwinnable.

| Archetype | Role | Count in pool |
|---|---|---|
| Single-target DPS | Armored units and bosses | 4 |
| AOE | Swarms | 3 |
| Control | Slow, stun, root | 3 |
| Anti-air | Flyers | 3 |
| Support | Buffs adjacent towers | 3 |

Economy is deliberately absent from this pool. It lives off-path in Holdings. See below.

Each tower has 2 peanut-purchased upgrade tiers plus a branching tier-3 choice between two mutually exclusive specializations.

**Build time scales with tier.** Tier 1 places instantly. Tier 2 and tier 3 upgrades take time to complete, during which the tower fires at reduced rate. This creates a real mid-wave decision: upgrade now and go soft for eight seconds, or hold and upgrade during the gap.

---

## Holdings — off-path buildings

Separate plots, scattered away from the path, visually distinct from tower slots. **They cannot target enemies.** They do not consume tower slots.

This solves a problem the earlier draft had: with a cap of 2 to 4 combat towers, nobody would ever spend a slot on an economy tower. Moving economy off-path means it competes for peanuts and space rather than for defense.

Holdings pool, pick from what the map offers:

- **Counting House** — generates peanuts each wave
- **Workshop** — reduces ability cooldowns
- **Beacon** — large radius aura, buffs any towers inside it. Placement is the whole puzzle, since the plot is fixed and far away.
- **Depot** — tower upgrades cost less
- **Mine** — accumulates peanuts that you must **tap to collect** before it caps out

The Mine is the interaction hook. Some Holdings should require active attention rather than passive income, so the player has something to manage between spawns.

Core tension: Holdings cost peanuts now for payoff later, in a game where you might not survive this wave. That is the decision.

**Siege enemies ignore Holdings.** They are off-path and out of reach. Keeps the threat model clean.

---

## Heroes

Heroes are field units with health. They fight, and they can go down.

**Death rule: when a hero goes down, they stay down for the rest of the encounter.** They return at full health at the next node. No respawn timer.

This is deliberately punishing within a fight without ending the run. See Open Decisions for why not permadeath-for-the-run.

**Healing: heroes fully restore between encounters.** Required, or the Last Stand threshold breaks after the first fight.

**The signature mechanic: Last Stand.** Every hero transforms at **25% health**. Once per encounter, which follows automatically from the death and healing rules above. This is the family fingerprint on the game and it should be loud, funny, and genuinely powerful. Screen effect, sound cue, the works.

Design consequence worth naming: Last Stand plus stay-down means every hero death is a climax. You drop to 25%, transform, and either turn the fight or go out swinging. That is a much better beat than a respawn timer, and it is the reason the stay-down rule works.

### Core five

**Cory — The Optimizer**
Mild-mannered tax advisor with the power of pure strength. Not an auditor. Never call him an auditor.
- Passive: *Depreciation* — enemies near Cory lose armor over time
- Active 1: *Haymaker* — massive single-target hit with knockback
- Active 2: *Restructure* — instantly relocate one tower anywhere on the map, free
- **Last Stand: DAD MODE** — he does not become an angrier man, he gets into an armoured SUV. Damage doubles, reach and speed grow, and he drives over the lane rather than along it, shoving aside anything he touches. Defense and precision drop. Pure haymakers.

**Courtland — The Mind**
Telepathic and brilliant. He will outsmart you in a second.
- Passive: *Ten Steps Ahead* — you see the next wave's composition before it spawns
- Active 1: *Persuade* — an enemy switches sides and fights for you until it dies
- Active 2: *Checkmate* — marks a target; all towers focus it and crit
- **Last Stand: BALLISTIC** — stops thinking, starts throwing. Attack speed triples, abilities recharge instantly, targeting logic goes out the window.

**Elijah — The Charmer**
Wins you over with words and charm.
- Passive: *Crowd Favorite* — nearby towers gain fire rate
- Active 1: *Sweet Talk* — enemies in an area stop to listen and take increased damage
- Active 2: *Rally* — heals and buffs all friendly units on the field
- **Last Stand: NINJA** — talking is over. Becomes untargetable, dashes between enemies, assassinates.

**Han (Hsiaohan) — The Omniscient**
As beautiful as she is powerful. She already knows.
- Passive: *All-Seeing* — every tower on the map gains range
- Active 1: *Foresight* — reveals and pre-damages the next wave's path
- Active 2: *Certainty* — one tower cannot miss and ignores armor for a duration
- **Last Stand: CRIMSON** — fiery red form, burns the ground wherever she walks, constant area damage aura.

**Bailey — The Good Girl**
Small brindled dog. Kind, sweet, and soooo fast.
- Passive: *Zoomies* — moves at double any other hero's speed, reaches threats first
- Active 1: *Fetch* — grabs an enemy and drags it backward along the path
- Active 2: *Good Girl* — barks; nearby enemies stop to pet her and are briefly stunned
- **Last Stand: BEAST MODE** — transforms into something enormous and not kind at all. Massive melee, terrifying, still wagging.

### Extended pool

Four more for Phase 4, built for mechanical variety rather than family flavor:

- **The Broker** — starts with 50% more peanuts, towers cost more
- **The Warden** — leaks cost half as much life, but you cap at 3 towers
- **The Engineer** — towers upgrade one tier cheaper, no hero combat ability
- **The Gambler** — draws an extra tower at every milestone, but one is random and locked

Heroes unlock through the Banner tree.

---

## Abilities

**Two kinds. You bring one of each into a run.**

### Active abilities (12 in pool, draw 1)

Cooldown-based, player-triggered, placed anywhere on the map.

1. **Molotov** — big AOE burst *(built)*
2. **Gnomes** — summon melee blockers *(built)*
3. **Glacier** — area slow plus damage vulnerability *(built)*
4. **Poison Cloud** — damage over time, lingers
5. **Scratch Ticket** — instant peanuts, but the payout is a random range and you must scratch the card to collect it. It auto-reveals after a few seconds so it never stalls a wave. *(built)*
6. **Meteor** — repeated AOE over several seconds *(built)*
7. **Overclock** — target tower doubles fire rate briefly
8. **Barricade** — temporary wall, blocks or reroutes
9. **Chain** — bounces between enemies *(built)*
10. **Vortex** — pulls enemies backward along the path
11. **Decoy** — enemies attack a fake target and stop advancing
12. **Rooted** — vines erupt and hold enemies in place; they take bonus damage while held

### The rare drop: Server Nuke

Outside the draft pool entirely. It cannot be drawn at run start and cannot be
chosen — it turns up, or it does not.

- **It drops off elites and bosses only**, at a low per-kill chance, and only
  once in a run. Trash mobs never drop it, so it always arrives as payment for
  a fight that was actually hard.
- **The drop is loud**: full-screen flash, its own sound, and a banner across
  the map. A player must never miss that they have it.
- **The cast is long on purpose.** A couple of seconds of gathering light and
  rising shake before anything happens, because the whole point is watching it
  land rather than seeing the board empty between two frames.
- **It kills everything on the map** regardless of type, health or armour.
- **A boss is the exception**: it takes a large fixed share of its maximum
  health instead of dying outright. Deleting a boss would take the encounter's
  ending away from the player, which is the one thing this must not do.
- **One use, then it is gone for the run.** It is spent the moment it is cast,
  so the wind-up cannot be used twice.

Drop chance, the tiers that can drop it, the boss health percentage and the
cast time are all in `rules.json`. Which enemies count as elite or boss is a
`tier` on each enemy, not a list of ids.

### Passive abilities (10 in pool, draw 1)

Always on, no button. These shape how the whole run plays.

1. **Undead** — enemies killed near your towers rise as weak allies for 10 seconds
2. **Overgrowth** — roots creep along the path; enemies slow progressively the further they walk
3. **Interest** — unspent peanuts generate a small return each wave
4. **Scavenger** — every 10th kill drops a random consumable
5. **Momentum** — each consecutive kill without a leak adds stacking damage
6. **Insurance** — first tower destroyed each act is rebuilt free
7. **Contagion** — damage-over-time effects spread on death
8. **Reinforced** — towers take 50% less damage from enemies
9. **Bargain** — first upgrade each wave is half price
10. **Second Wind** — hero returns from Last Stand once per act instead of going down

---

## Enemies

**The boys are designing these.** Give them the brief below.

The only hard requirement is that enemies demand specific answers, or the tower system stops mattering. Everything they invent should map to one of these:

| Type | What it forces the player to do |
|---|---|
| Swarm | Bring AOE |
| Armored | Bring single-target or armor shred |
| Flying | Bring anti-air |
| Fast | Bring control, place early |
| Shielded | Burst it down before it regenerates |
| Healer | Kill it first |
| Splitter | Punishes pure single-target |
| Burrower | Skips part of the path |
| **Siege** | **Threatens your towers directly. See below.** |

### Siege enemies

**Most enemies ignore towers. A small minority attack them.** Roughly 2 of the 10 to 12 enemy types, plus one boss mechanic.

This keeps the Reinforced passive and blocker towers meaningful without turning every wave into a defense-the-defense problem.

**Targeting rule: siege enemies always go for the tower closest to the exit.** Predictable, readable, and it gives the player a timer instead of a surprise.

Reference design, the **Rolling Bomb**:
- Slow, high health, ignores everything until it reaches its target
- Visible fuse or wind-up so the player can count down
- If it connects, the tower is **destroyed on its tile**
- The tower type stays in your loadout. You rebuild by paying peanuts.

That last line matters. With a cap of 2 to 4 towers, permanently losing a tower type would end runs unfairly. Losing the placement and the peanuts is punishing enough.

Second siege type should threaten differently: something fast that **disables** a tower for 10 seconds rather than destroying it, so the answer is control rather than burst.

### Design sheet for the boys

For each enemy:
1. What is it? Draw it.
2. What is it called?
3. How does it move? Fast, slow, flying, digging?
4. Is it tough, or weak but there are a million of them?
5. Does it do anything sneaky?
6. What happens when it dies? Make this funny.
7. What is the one thing that beats it?

Target 10 to 12 for v1.

---

## Bosses

One per act. Three for v1.

Design rules:
- A boss is a **mechanic**, not a health bar. If the player beats it by building the same thing bigger, it isn't a boss.
- Each boss invalidates one strategy and rewards another. One immune to slows. One that destroys towers so you rebuild mid-fight. One that splits into halves that must die at the same time.
- Phases. At 60% and 30% health, behavior changes.
- Telegraph everything. The player should lose and know exactly why.
- Every boss gets a name card and an entrance. This is where the tone budget gets spent.

The boys can design these too, but you set the mechanic first and let them design the creature around it.

---

## Meta progression — the Banner

Replaces the 3-star system entirely.

Runs award **Banner Points** based on depth reached, not just victory. A failed run still pays out.

Constellation-style tree, four branches: Offense, Control, Economy, Command.

Node rules:
- Mix flat passives (+range, +peanuts per kill) with **behavior changers** (Explosion leaves burning ground; slows also amplify damage)
- Gate branches behind usage (win with Bailey, finish a run using an economy tower) to push variety
- Include mutually exclusive pairs
- Hero unlocks and the 5th tower slot live here

25 to 30 nodes for v1. Do not build 30 before testing 10.

---

## In-run boons

Temporary, this run only. Offered after elites and bosses, 1 of 3.

Examples: +2 tower range, abilities cost 30% less, first tower each wave is free, enemies drop 25% more peanuts but move 10% faster.

Both layers matter. Boons create the "this run is broken in a fun way" feeling. The Banner creates the reason to come back.

---

## Run structure

Branching node map, 12 to 15 nodes deep, three acts.

- **Battle** — standard wave defense
- **Elite** — harder, guaranteed boon
- **Event** — a choice with a tradeoff
- **Forge** — swap or permanently modify a tower
- **Boss** — end of each act

Two or three paths forward at each step. Target run length 20 to 30 minutes.

---

## Phases

**Phase 1 — Prove it's fun**
Placeholder art from Kenney's free CC0 tower defense pack. Cory only. 6 towers, 4 active abilities, 3 passives, 4 enemy types, one act, no Banner tree. Stop here and play it. Do not continue until the answer is yes.

The rule was never "make it ugly." It was "don't spend money or commission anything before the loop is fun." Free, consistent, already-made art satisfies that completely.

**Phase 2 — Make it a game**
All five family heroes with Last Stand. 16 towers, 12 actives, 10 passives. Three acts, three bosses, 10 enemy types. Banner tree. Boons. Save/load.

**Phase 3 — Make it look good**
Art pass, animation, audio, juice. Screen shake, hit pause, damage numbers, particles, UI easing.

**Phase 4 — Depth**
Four extended heroes. Classes, each with its own tower pool. Second environment theme. Balance and playtest.

Classes are Phase 4. Not before.

---

## Tech

- **Renderer:** Phaser 3
- **Build:** Vite
- **Language:** TypeScript
- **Hosting:** GitHub Pages, auto-deploy on push to main
- **Art (Phase 1):** Kenney "Tower Defense (Top-Down)" pack, CC0, free. 300 assets covering ground tiles, roads, towers, enemies, particle effects and HUD numbers. Ships vector source files, so it recolors to your palette.
- **Art (Phase 3):** CraftPix vector TD kit, recolored to a locked 14-color palette
- **Animation:** Rive, or two-frame bob plus squash-stretch for v1
- **Audio:** freesound.org and Kenney's free audio packs

**The currency is peanuts.** Not gold, not coins — peanuts. Towers cost
peanuts, kills pay peanuts, and the HUD says so. It is the joke that the whole
economy is denominated in what the work actually pays.

**Critical rule:** all balance numbers live in JSON config under `/src/data/`. Tower stats, enemy stats, wave composition, ability values (including the Scratch Ticket's payout range and auto-reveal timer), hero stats, Last Stand thresholds and multipliers, node costs. Never hardcode a number you will want to tune.

---

## Decisions made

- **Siege enemies:** yes, but only a small minority. Rolling Bomb targets the tower closest to the exit, destroys the placement, tower type stays in loadout.
- **Hero death:** stays down for the rest of the encounter, returns at full next node.
- **Last Stand:** triggers at 25% health, once per encounter.
- **Orientation:** 3/4 perspective. See the note below on how to build it.

## Orientation — 3/4 view without true isometric

The look you want and the projection you use are two different decisions, and you only need one of them.

**True isometric** means the game grid itself is rotated 45 degrees. It brings real costs: screen-to-tile coordinate math, depth sorting bugs where sprites draw in front of things they should be behind, harder placement UX because the player has to figure out which diamond they're hovering, and pathfinding on a diagonal grid.

**Kingdom Rush is not isometric.** It is a flat grid with art drawn from a 3/4 angle. You get the depth, the tower height, the readable perspective, and none of the math.

**Do this.** Square grid underneath, sprites drawn at a 3/4 angle, sort by Y position so things lower on the screen draw in front. That single sort rule replaces the entire depth-sorting problem. It is maybe a third of the work of true iso and looks nearly identical for a tower defense.

If Kenney's isometric TD pack is the art you want, its sprites still work fine on a flat grid.

## Remaining decisions — resolved

- **Lanes scale by act.** Act 1 is a single path. Act 2 introduces a split or second entrance. Act 3 runs multiple paths. This is a difficulty curve the player learns rather than a fixed map property, and it makes Beacon placement and tower coverage progressively harder.
- **Hero uses a rally point, not free movement.** Tap a spot, the hero walks there and engages whatever arrives. Simpler to build than direct control, better on touch, and it gives the player something to actively manage.
- **Build time scales with upgrade tier**, not with game progress. Tier 1 instant, tier 2 and 3 take time. Consistent from the first minute so it teaches itself, and it creates upgrade-timing tension in every fight rather than arriving later as an apparent nerf.
