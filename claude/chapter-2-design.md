# Chapter 2: "Other Game"

Status: design only, nothing built. Written 2026-09-13.

## The pitch

The kids loved the game, so more levels get offered, and instead they start
throwing out mechanics that have nothing to do with tower defense. The answer
is "that's a whole other game," and then we build it anyway, inside the old
game.

"Other Game" is the working name and the joke at the same time.

In fiction it is a genre break. Out of fiction it is a second game that shares
Courjahan Defense's art library, hero kits and enemy roster. Treat it as a
second game, not a level type, and budget accordingly.

Reference points: Vampire Survivors, Archero, survival.io.

## Unlock structure

**Other Game is hidden entirely until story level 10 is cleared.** Not greyed
out, not a locked padlock, not visible at all. It then appears as its own entry
point alongside story mode. Hidden beats locked here, because the reveal is the
joke and a padlock spoils it.

It opens with the comic: the boys asking for more, the mechanics pile-up, the
"that's a whole other game" beat, and then it starts anyway.

**Other Game has numbered levels, not one endless run.** Each level is a fixed
survival stage with a boss, cleared or failed. This reuses the story
progression model already in the repo rather than inventing a second one.

Note for the world map: this touches open item 9 in `claude/context.md`. The
map shows 20 slots against a scope of 10 story levels. Other Game levels are a
candidate for the back half, but they need their own entry point rather than
sitting on the story road.

## The comic library

**This is a reader over comic art that already exists, not a new art project.**
The game's comics were written as one continuous story, so collected in order
they should read as a single book. New art is limited to a cover and possibly
one or two bridge pages where the story jumps.

- Unlocks when story mode is cleared.
- Presents as a cover the player taps, then pages through.
- Book one is the full story-mode comic, every existing page in narrative
  order.
- Book two unlocks on clearing level 2. **Open: story level 2 or Other Game
  level 2?** Recorded as Other Game level 2 pending an answer.

What the work actually is:

1. **Inventory.** Find every comic page asset already in the repo and confirm
   what exists. Nothing else can be scoped until this is done.
2. **A manifest.** An ordered list in `/src/data/` naming each page in
   narrative order, per book. Ordering is data, not code.
3. **The reader.** Cover, page turn, back out, and resume where the player left
   off. Swipe on touch, tap zones as a fallback.
4. **Bridge pages.** Only where the inventory shows a genuine gap.

Two risks worth checking during the inventory:

- **Export resolution.** If pages were exported to fit a cutscene frame, they
  may be too small to read full screen, and upscaling will look soft.
- **Baked-in interface.** Any "tap to continue" prompts, captions or frames
  painted into a page will look wrong in a reader. Same class of problem as the
  HUD double peanut.

Both are cheap to check and expensive to discover after the reader is built.

## The loop

Thirty seconds: drag to move, the hero shoots on its own, things die, gems
drop, you level, you pick one of three upgrades, more things arrive.

Per level: intensity ramps in bands, elites partway through, boss at the end,
level ends on the kill or on death.

Target length is about 8 minutes per level, not the 20 to 30 a run in the genre
usually takes. Shorter means more attempts, which is what the kids want and
what a phone session supports.

## Controls

Floating drag stick. Touch anywhere, the stick anchors where the thumb lands,
the hero moves relative to it. Not point and click, not a fixed pad in the
corner. Release stops the hero.

Thumb occlusion is real on a 375x667 screen. Anchor the camera so the hero sits
above centre rather than dead centre.

Active powers are tap buttons on the opposite side. Two maximum. One
hold-to-fire power allowed.

## Heroes

All heroes run in **ultimate form for the whole level**. The 50% transformation
does not apply in this mode.

That creates a rule worth keeping: **the base-form power becomes the automatic
weapon, and the ultimate powers become the buttons.** The auto weapon fires at
the nearest enemy with no input. This caps buttons at two, and it makes each
hero feel different for free without authoring anything new.

Courtland as the worked example: Mind Laser is the auto weapon, held on the
nearest target. Seismic and Mind Control are the two buttons. That finally
gives `fx_mind_control` a mechanic, which is open item 4 in the context doc.

Open: do heroes keep the 50% health buff and temporary invincibility as a
survival beat, or does it go with the transform? Recommend keeping it as a
one-per-level second wind under a different name. The code already exists.

## Enemies

Reuse the existing roster at reduced scale. A swarm enemy is the same art at
60 to 70%, less health, no armour, walking straight at the hero instead of
along a path.

| Class | Source | Count on screen |
|---|---|---|
| Swarm | existing enemies, scaled down | up to 200 |
| Elite | existing enemies, full size | 1 to 6 |
| Boss | existing bosses, unchanged | 1 |

Density target is 200 concurrent. Design to it from the first line of code, not
after.

## The draft

This is the core loop, not a feature. A survivors-like with no level-up draft
is a screensaver.

Pick one of three at each level up, within a level. Starting pool of roughly
20:

- new auto weapons (existing tower projectiles make good ones)
- upgrades to the weapon already held
- passive stats: move speed, pickup radius, cooldown, max health, contact armour
- hero power modifiers: Seismic wider, Mind Control lasting longer

The draft resets each level. If a between-level meta layer is wanted later, the
points skill tree that story mode gave up is sitting unused with a test already
guarding it.

## Towers as a crossover

Worth doing, cheap version only. A drop that lets the hero place one real tower
from the tower defense game for 20 seconds, after which it expires. No pads, no
build menu, no economy. It reuses tower art and tower firing code unchanged.

It is also the joke: one tower survived the genre change.

Do not rebuild the pad system for this. The build menu is already deleted and
seven harness scenarios still drive its ghost.

## Maps and art

**Open bounded arena, not forward only.** Forward only removes kiting, and
kiting is the entire skill of the genre.

Arena roughly 3000x3000 world units with a camera follow, and a visible fence
or cliff at the edge so the boundary reads as deliberate rather than as a bug.

**Ground is a repeating tile, not a stitched plate.** This is far cheaper than
the Level 6 problem: one render per biome instead of six panels chained edge to
edge. The level segment rules do not apply here because it is a different
artifact.

Reuse unchanged: heroes, enemies, bosses, tower sprites, existing FX, HUD, and
the entire existing comic library.

New art needed: 3 ground tiles, about 12 prop sprites, an XP gem, a draft card
frame, the drag stick ring, the arena boundary, a comic cover, and any bridge
pages the inventory turns up. That is the whole list.

Render rules live in `claude/chapter-2-art-rules.md`.

## Engine risks

This is the part most likely to kill the mode and it should be proven before
anything is built on top of it.

A tower defense sim moves dozens of enemies along a fixed path, each tracking a
single number: how far along it is. This moves hundreds at free positions, each
chasing a moving target, pushing apart from each other, and checked against
every projectile on screen. Thirty things checking thirty things is 900 tests
per frame. Two hundred checking two hundred is 40,000, sixty times a second, on
a phone. That gap is why the mode needs different code underneath, not a new
level file.

- All enemies from one texture atlas, so the phone draws them in one pass
  rather than 200. Sprites, not Containers. Containers break batching.
- No Arcade physics body per enemy. Phaser's collision system is too heavy per
  object at this count. Custom position step plus a uniform grid spatial hash,
  so each enemy only tests against neighbours in its own cell.
- Object pool with a hard cap and off-screen culling. Allocate 200 enemies once
  at startup and recycle them. Never allocate mid-level.
- Contact damage on a tick, not per frame.
- Gems merge when they cluster, or the pickup layer becomes the bottleneck
  before the enemies do.
- Budget: 200 enemies plus hero plus projectiles holding 45fps at 375x667 on
  the harness.

**Kill criterion**, agreed in writing before content is built on top: if the
prototype cannot hold 45fps at 200 enemies, redesign toward fewer and larger
enemies rather than shipping it slow. The revert is deleting the prototype
directory. Nothing in story mode depends on it.

## Tuning

The soak harness does not transfer, and this is a methodology break rather than
a tooling gap.

Soak works in story mode because tower defense has no moment-to-moment input.
Towers are placed, then the level plays itself, so a machine running it 480
times plays it the same way a person does and the win rate it reports is real.
In Other Game the player dodges every second. A bot that dodges badly dies at
minute two and a kid who is good at it walks past the boss. The number measures
the bot, not the player.

The 35 to 45% win rate band is retired for this mode. What replaces it:

1. A scripted bot policy run over seeds, as a crash and performance smoke test.
   Not a balance signal.
2. Real playtests with the kids, instrumented: time of death, level reached,
   which draft picks got taken and which never do.
3. A target shape rather than a win rate. An 8 minute level, with the first
   three attempts dying around 5 to 6 minutes.

Boss health comes from watching the boys play, not from a soak.

## Build order

1. **Comic inventory.** Cheap, unblocks the library, and answers the resolution
   question before anything gets built on a bad assumption.
2. **Prototype.** One arena, one hero, one enemy type, drag stick, auto-fire,
   200 enemy performance test. No draft, no art, no meta. This answers the only
   question that can kill the mode.
3. Comic library reader and the story-mode unlock.
4. Draft system and the upgrade pool.
5. Art pass: tiles and props.
6. Hero kits for all five.
7. Other Game level 1, boss, and the level-10 unlock gate.

## Open decisions

1. Book two unlocks on story level 2 or Other Game level 2.
2. How many Other Game levels are in scope.
3. Does the 50% second wind survive in this mode.
4. Does the tower drop go into level 1 or wait.
5. Whether "Other Game" is the literal in-game name or a placeholder.
