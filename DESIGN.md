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

**Built:** the two linear tiers, with stats, costs and build times in `towers.json` as per-tier multipliers on the base stats. Tapping a placed tower opens its panel — current stats, next tier cost, upgrade and sell. Selling returns `rules.towerUpgrades.sellRefund` of everything sunk in. The **branching tier-3 specializations are not built**; tier 3 is currently a single linear step.

**Build time scales with tier.** Tier 1 places instantly. Tier 2 and tier 3 upgrades take time to complete, during which the tower fires at reduced rate. This creates a real mid-wave decision: upgrade now and go soft for eight seconds, or hold and upgrade during the gap.

**Built.** Tier 1 has no entry at all, which is what makes it instant. Tiers 2 and 3 carry `buildSeconds`, and the tower's tier only goes up when the work *finishes*, so it keeps its old stats and its reduced rate for the whole build rather than getting the new ones for free. Rate while building is `rules.towerUpgrades.buildFireRate`.

---

## Armour and its counterplay

Armour is subtracted flat from every hit, which by construction punishes fast,
weak towers hardest and barely touches slow, heavy ones. That made the design's
own rule — *single-target DPS is the armoured counter* — false in the data:
Withholding is single-target and was keeping 36% of its damage against a brute,
the same as the AOE towers.

**Towers pierce armour; the amount is the counterplay knob.**

| archetype | pierce at tier 1 | why |
|---|---|---|
| single-target | high | the named answer to armour |
| control | low | visibly working, never the answer |
| AOE | none | armoured units must stay threatening to an AOE-only board |

Pierce climbs with tier, so **upgrading a single-target tower is the reachable
answer to an armoured wave** — the player who did not draw the specialist still
has a route, and it costs peanuts. A hit always lands at least 1, so nothing is
ever fully immune.

Two other answers exist and both are deliberate: **Write-Off** ignores armour
outright (the specialist draw), and **Cory's Depreciation** strips up to 7
armour from anything within 96px of him, which is a positioning decision rather
than a purchase.

---

## Economy — the player should never be comfortable

Peanuts are scarce relative to what the player wants, always. Three rules keep
them that way:

1. **The opening buys exactly one tower.** Not a loadout. Opening rich enough
   to fill the board meant every decision in the run was made during wave 1.
2. **Upgrades are the main sink.** Tier 2 costs 1.2x the tower, tier 3 costs
   2.2x, so a fully upgraded tower is roughly 4.4x its build price and a serious
   commitment to one pad.
3. **No dead surplus.** Total run income is close to the cost of a maxed board,
   so the board is only finished as the run ends. A player accumulating peanuts
   with nothing to buy is a tuning failure, not a player achievement.

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

**Death rule: when a hero goes down, they are off the board for `reviveSeconds` (25s for Cory), then walk back on at full health from where they entered the map.** They also return at full health at the next node.

*Revised on tester feedback, Phase 1.* The original rule was stay-down for the whole encounter with no respawn timer. Two testers lost Cory around wave four and then played eight more waves without him; it read as a broken game rather than as a climax, and there was no way to tell whether he was coming back. The revive is deliberately slow — a quarter of a minute is most of a wave — so losing him still costs something, and **Last Stand does not re-arm across it**, which is what keeps the transformation a once-per-encounter beat rather than a cooldown.

This is deliberately punishing within a fight without ending the run. See Open Decisions for why not permadeath-for-the-run.

**Healing: heroes fully restore between encounters.** Required, or the Last Stand threshold breaks after the first fight.

**The signature mechanic: Last Stand.** Every hero transforms at **25% health**. Once per encounter, which follows automatically from the death and healing rules above. This is the family fingerprint on the game and it should be loud, funny, and genuinely powerful. Screen effect, sound cue, the works.

Design consequence worth naming: Last Stand fires once per encounter, revive or no revive. You drop to 25%, transform, and either turn the fight or go out swinging — and if you go out, the next 25 seconds are played without him and the transformation does not come back. That is what keeps the death a climax now that the board is not simply short a hero for the rest of the level.

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

### Act one boss: The Politician

He is not a wall of health with a big attack. He does not attack at all.

- **Very high health, no armour, very slow.** Every tower hurts him; none of
  them hurt him enough on their own.
- **He taxes.** Every few seconds he takes a *percentage of the peanuts the
  player is currently holding*. He never touches a tower or the hero.
- **That percentage is the counterplay.** Hoarding is punished and spending is
  rewarded: peanuts on the board cannot be taxed, peanuts in the bank can. A
  player who sat on a pile all run has the worst possible fight.
- **He escalates.** At 60% and 30% health the share he takes goes up and the
  interval between takes goes down, so a slow kill costs more than a fast one.
- **Nothing holds him.** He walks through the line rather than being blocked,
  or a player could park him off-screen and never have the fight.
- **Killing him pays a large lump sum**, which is what makes racing him worth
  it rather than merely surviving him.
- **He arrives with a small escort of standard enemies**, not another wave. He
  is the fight.

Full boss treatment: name card on entrance, a health bar across the top marked
at both phase thresholds, and his own sound sting. The tax itself gets a cue,
a red flash on the peanuts counter and a rising "-N PEANUTS" off him, because
a resource vanishing quietly is the one thing a player will not forgive.

Tax percentages, intervals, phase thresholds and the kill payout are all in
`enemies.json`; the wave and its escort are in `waves.json`.

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

Branching node map, 14 nodes deep, three acts. Two or three paths forward at
each step. Target run length 20 to 30 minutes.

**Status: proposed, not built.** This section is the design and the data
structure. Phase 1 is still the linear 13-wave sequence, and stays that way
until the loop is confirmed fun.

### What carries, and what does not

**The board does not carry. The loadout does.**

Every battle node is a fresh board: empty pads, nothing built. What survives a
node is the tower roster, the modifiers, the lives, and the run currency. This
is the decision that shapes everything else, so it is worth being explicit
about what it buys and what it costs.

It buys: every node is a real decision again. A board that persists makes the
first four nodes the whole run — by node 9 a maxed board plays itself, and
SHOP and FORGE become win-more. It also keeps the economy rules above intact
*per node* rather than having to be re-derived for a 15-node curve.

It costs: rebuilding fifteen times can get repetitive. The mitigation is that
the roster changes underneath you — a run where FORGE swapped your Write-Off
for something else is not the same rebuild — and that battle nodes are short.
Three to five waves, not thirteen.

### Two currencies, and why

The split falls out of the board not carrying.

- **Peanuts** — the battle budget. Granted fresh at the start of each battle
  node, plus kill income during it. **Wiped when the node ends.** Peanuts only
  ever buy and upgrade towers on the board in front of you. Every rule in
  *Economy* above applies unchanged, per node: the opening buys exactly one
  tower, upgrades are the sink, no dead surplus.

- **Receipts** — the run currency. Earned for clearing a node, more from an
  ELITE, most from a BOSS. Spent only at SHOP and FORGE. Receipts never buy a
  tower on the board.

One currency doing both jobs sounds simpler and is worse: peanuts spent on
towers at node 5 are peanuts not spent at the shop at node 6, so every build
becomes a decision about a screen the player cannot see. That is not tension,
it is a tax on planning. Two currencies keep the two decision spaces from
contaminating each other, and let the shop be tuned without retuning the
board.

(Receipts because Cory works in tax and a tax man hoards receipts. The name is
placeholder-quality; the separation is not.)

### The map

Fourteen rows, five lanes. About 45 nodes on the map, of which a run visits
14 — the map is a thing you route through, not a thing you clear.

| Act | Rows | Shape |
|---|---|---|
| 1 | 1–5 | Row 1 a single BATTLE, row 5 the BOSS |
| 2 | 6–10 | Row 10 the BOSS |
| 3 | 11–14 | Row 14 the BOSS |

The map **converges to a single node at each act boundary**. That is what makes
the acts readable, and it is where the board resets.

**Edges are generated by walking paths, not by wiring a graph.** Six walks per
act from its first row to its boss; at each row a walk steps to lane−1, lane,
or lane+1; a step that would cross an existing edge is rejected and re-rolled.
The union of the walks is the DAG. This is the Slay the Spire construction, and
it is the right one here for a specific reason: no-crossing means the result
draws correctly on a flat orthogonal grid, which is the only kind of grid this
game has.

**The walks alone are not enough, and this is worth writing down because it is
not obvious.** Prototyped over 400 seeds, the union of six walks leaves **only
about 36% of nodes with more than one way forward**. More walks barely help —
twelve walks reaches 55% and turns the map into porridge. A branching map whose
nodes are mostly forced is a corridor with decoration.

So the generator needs an explicit second pass: walk the rows top to bottom and
give every node a second exit where one can be added without crossing,
creating the target node if it does not exist yet. Top to bottom matters — a
node the pass creates is itself given exits when its own row comes round.

With the pass, over 400 seeds:

| | share of nodes on a choice row |
|---|---|
| one way forward | 19.6% |
| two ways | 74.8% |
| three ways | 5.7% |

The residual 20% are nodes on lane 0 and lane 4, where the only second edge
available would cross one already drawn. That is inherent to no-crossing on a
flat grid and it is a fair price: the alternative is a map that cannot be drawn
without ambiguity.

Two rows are single-exit **by design** and are not counted above: the row
before each boss, which converges on it.

### Node types

Every non-battle node offers a real decision. A node that is a reward with no
choice attached is a loading screen with a picture on it.

- **BATTLE** — three to five waves on a fresh board. Clearing pays Receipts.
- **ELITE** — harder waves, a guaranteed modifier, and more Receipts. The
  decision is made on the map, before entering: an ELITE is visibly an ELITE,
  and taking one is a bet that your roster is ahead of the curve.
- **SHOP** — four things, each priced in JSON: buy one modifier from three;
  buy a permanent tower upgrade; remove a negative modifier, at a steep price;
  buy back a life. The decision is that Receipts are always short of all four.
- **EVENT** — a short text scene, two or three options, a real tradeoff. Some
  certain, some a gamble. A gamble **always announces itself as one and shows
  its odds** — a hidden coin flip reads as the game cheating. This is where the
  game's voice lives.
- **FORGE** — permanently modify one tower, or swap one for a random draw. The
  modify is the certain option; the swap is the gamble. Same shape as an event,
  applied to the roster.
- **REST** — restore lives, or fully heal and buff the hero. Mutually
  exclusive, and that is the whole node.
- **BOSS** — ends each act. Row 5, 10 and 14.

### Placement rules

Weights per act live in JSON. These rules override the weights:

1. Row 1 is always BATTLE.
2. The last row of each act is always BOSS.
3. **The row before a BOSS is always REST or SHOP.** Structurally the most
   important rule here: without a guaranteed chance to prepare, a boss is a
   coin flip on whatever state you happened to arrive in.
4. Act 1 contains exactly one SHOP and exactly one EVENT, and no ELITE before
   row 3. Act 1 teaches; it does not ambush.
5. Acts 2 and 3 weight toward ELITE, EVENT and SHOP.
6. No two adjacent nodes on the same path share a non-BATTLE type.
7. Every row contains at least one BATTLE or ELITE, so no route skips combat.

### What the player sees

**The current act in full. Of every later act, only its boss.**

Enough to plan a route — which is real planning, and the point of the map —
and not enough to plan the run. One rule, easy to read, easy to draw.

### Generation is a pure function of the seed

`generateMap(seed)` returns the whole map with every node's contents already
decided: which waves a battle runs, which three modifiers a shop stocks, which
event text an event node shows, what a forge would draw.

Deciding contents at generation time rather than on arrival is not a
performance choice. It means a save and reload cannot reroll a shop, the same
seed is the same run, and — the part that matters for building this at all —
the entire map system is testable without Phaser.

### Data structure

```ts
type NodeType = 'battle' | 'elite' | 'shop' | 'event' | 'forge' | 'rest' | 'boss'

interface MapNode {
  /** 'r03l2' — row and lane. Stable for a given seed. */
  id: string
  act: number            // 1..3
  row: number            // 0-based, whole map
  lane: number           // 0..lanes-1, the x position on a flat grid
  type: NodeType
  /** Reachable from here. Empty on the final boss. */
  next: string[]
  /** Fixed at generation. A node is the same every time it is drawn. */
  payload: NodePayload
}

type NodePayload =
  | { kind: 'battle'; waveIds: string[]; peanutBudget: number; receipts: number }
  | { kind: 'elite';  waveIds: string[]; peanutBudget: number; receipts: number
                      modifier: string }
  | { kind: 'boss';   waveIds: string[]; peanutBudget: number; receipts: number
                      bossId: string }
  | { kind: 'shop';   modifiers: string[]; upgrades: string[] }
  | { kind: 'event';  eventId: string }
  | { kind: 'forge';  draw: string[] }
  | { kind: 'rest' }

interface RunMap {
  seed: number
  lanes: number
  nodes: Record<string, MapNode>
  entry: string
  /** Row-major, for drawing. */
  byRow: string[][]
}

interface MapProgress {
  /** null before the first choice. */
  currentId: string | null
  visited: string[]
  /** Legally reachable right now — the only nodes the map screen accepts. */
  open: string[]
}
```

### Files this would add

Data:

- `mapgen.json` — lanes, rows per act, type weights per act, path count
- `events.json` — the event scripts, where the voice lives
- `shop.json` — every price
- `modifiers.json` — the modifier pool

Systems, all Phaser-free and therefore all testable:

- `Rng.ts` — seeded PRNG
- `MapGen.ts` — `generateMap(seed)`
- `MapProgress.ts` — position, and what is open

`tools/mapgen_probe.py` is the prototype the branching figures above were
measured with, kept for the same reason `measure_art.py` is: so the numbers can
be re-derived rather than re-guessed.

Scenes:

- `MapScene.ts` — draws the map. **Composed against the 1280x720 design box
  and fitted with `fitCameraToDesign`, like every other menu.** Fourteen rows
  do not fit 720px, so it scrolls vertically — a list scroll on the fixed UI
  camera, not a camera gesture. `CameraRig` stays GameScene's alone.
- `EventScene.ts`, `ShopScene.ts`, `ForgeScene.ts`, `RestScene.ts`

### The one large refactor this needs

GameScene currently owns the whole run: it indexes the 13-wave list, and calls
`endRun` when the last one ends. Under a node map it plays **one node's waves
and hands back an outcome**. `status.wave` and `status.waveCount` become
node-local, and `endRun` moves out to a run controller that owns the map, the
Receipts, the lives and the roster.

That is the piece to scope carefully and the piece most likely to break what
already works.

### Still open

1. **Currency name.** Receipts, or something better. And whether the split is
   accepted at all.
2. **Modifier categories.** *In-run boons* above describes boons only, but a
   shop that sells the removal of a negative modifier means curses exist. Where
   do they come from — ELITEs, lost gambles, both? Proposed three categories:
   pure boon, trade (real upside, real cost), curse (a downside carrying a
   payout). Not yet specified anywhere.
3. **Roster size.** How many towers carry, and whether FORGE's swap replaces a
   roster slot or adds to it.
4. **Lives.** Proposed: they carry across nodes, which is what makes the
   shop's buy-back worth anything. Not confirmed.
5. **Maps.** A fresh board per node means either one map replayed fourteen
   times or several. Proposed: one map per act, reused within it. Phase 1 has
   one.

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

## Input

**Nothing in the game may be keyboard-only.** Keys are shortcuts and never the
only route: every action they reach also has a visible, tappable target. The
game is played on phones, and a screen whose only way forward is a keypress is
a screen a player cannot leave.

**Anything that spends peanuts asks first.** A confirm dialog on the dialog
plate, stating the cost, with a way out. A misjudged tap must never be able to
empty the player's pockets.

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
- **Hero death:** off the board for `reviveSeconds`, then back at full health at the map entrance; returns at full next node.
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

---

## Open question — custom loadout vs the draft

**Asked by a tester, Phase 1. Not built, and not decided.** He wants to choose
his towers, abilities and hero rather than be dealt them. This is written down
so the decision is made deliberately, because it goes at the middle of the
game rather than at the edge of it.

### Why it conflicts

The draft is not a UI on top of the game; it is the reason a run differs from
the last one. Three things lean on it:

- **The Banner tree buys variance.** Its slots, its guarantees and its swap
  nodes are all worth something *because* the hand is not yours to choose. A
  player who picks their own four towers has nothing left to unlock but
  numbers.
- **Runs stop being different.** There is one best opening in a six-tower
  pool. Free choice converges on it within a session, and then every run opens
  identically — which is the failure mode the earlier draw-5-upfront model had
  and the progressive unlock replaced.
- **Forge nodes lose their point.** A mid-run swap is a real decision only
  when the hand was dealt.

None of that means the tester is wrong. What he is actually reporting is that
*being dealt a hand you cannot play* is unfun — which is a fixable problem
that does not require handing over the whole draft.

### Four ways to give him what he wants, cheapest first

1. **A mulligan.** One free re-deal of the whole hand on the loadout screen,
   before the map. Costs almost nothing to build, removes the "this hand is
   dead on arrival" feeling, and keeps every property above. *This is the one
   to try first.*
2. **A pity pick and a ban.** Before the deal, nominate one tower you want in
   the draw and one you never want to see. The hand is still dealt; the tails
   of the distribution are cut off. Preserves variance, kills the worst runs.
3. **Custom loadout as a Banner unlock.** The right to choose is bought, one
   slot at a time: pick your hero, then one opening tower, then an ability.
   Turns the request into progression rather than into an escape from it, and
   is the best long-term fit — but it only makes sense once the Banner tree
   exists, which is Phase 2.
4. **A separate mode.** SANDBOX beside RUN on the title: pick everything, play
   the same map, **earn no Banner Points**. Honest, easy to explain, and it
   costs the roguelite nothing because it is not the roguelite. The risk is
   that it becomes the mode everyone plays and the drafted run withers.

### What any of them would involve

The plumbing is already there, which is the good news. `RunState` carries
`heroId`, `abilities`, `openingTowers`, `reserveTowers` and `seed`, and
everything downstream — GameScene, the HUD, the build menu, the harness —
reads run state and never the draft. `LoadoutScene` calls `draftAbilities`
and `draftOpeningTowers` and then `setRunState`. **A custom loadout is a
different way to fill the same object.**

So the work is not wiring, it is these four decisions:

- **A picker screen.** The bulk of it: every tower and every ability laid out,
  tap to select, honouring `towersAtStart` and `abilitiesDrawn`. Roughly a
  day, and it wants the same card layout the loadout screen already has.
- **The archetype guarantee.** `draftOpeningTowers` guarantees an opening hand
  covers one damage option and one control or AOE option, so no run opens
  unwinnable. A free picker can violate that. Enforce it, or let the player
  build a hand that cannot win and say so on the screen?
- **Banner Points.** Does a hand you chose pay the same as a hand you were
  dealt? If yes, the draft is optional. If no, custom is a practice mode. This
  is the actual decision; everything else follows from it.
- **Saved loadouts.** If picking is allowed, the last one has to persist, or
  it is a chore every run. One more field in save data.

Recommendation: ship the mulligan now, revisit 3 when the Banner tree lands,
and do not build 4 unless the tester still wants it after the mulligan.
