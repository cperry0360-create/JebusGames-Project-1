# Naming inventory

Every player-facing name in the game, so the tax theme can be replaced.

**RENAMED 2026-09-02.** The NEW NAME column is what the game says now. Every
JSON id, asset key and filename is unchanged, which is what keeps the older
comments through `src/` followable — a comment about "the Filing Extension's
Amendment" is about `extension`'s `amendment`, which is Bramble's Deadfall.

Three things carry text painted into the art and are NOT covered by any of
this: **Moe's sign**, the **Courjahan** sign it swaps to when bribed, and the
**DO NOT BUILD HERE** pad marker. The map plate adds a fourth —
**COURJAHAN'S TAVERN** is painted into the picture at world (930-1007,
103-147). None of them says anything the rename contradicts: they are family
names and an instruction, not tax terms.

Read the two lists at the bottom before renaming anything: some of these names
are cosmetic (a string in a JSON file, changed in one place) and some are baked
into a filename, an asset key, a JSON key or a save file, and changing them
touches code.

---

## Towers

Six towers. Each has three tiers: tier 1 is the tower as built, tier 2 is a
straight upgrade with **no name of its own** (the panel says "TIER 2 OF 3"),
and tier 3 is a choice between two named branches.

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Tower | **Withholding Tower** | Loadout card, build menu, tower panel, all build/sell/upgrade messages | `11 damage · Short reach · 1.5/sec` / `Cuts 5 armour.` |  **Slingshot** |
| Tower tier 2 | *(unnamed)* | Tower panel: "TIER 2 OF 3" | — | |
| Tower tier 3 branch | **Garnishment** | Specialize dialog, tower panel | Damage ×1.9, ignores armour entirely |  **Hailstorm** |
| Tower tier 3 branch | **Payroll** | Specialize dialog, tower panel | Faster fire, each shot chains to 1 extra target |  **Repeater** |
| Tower | **Write-Off** | Loadout card, build menu, tower panel | `44 damage · Fair reach · 0.6/sec` / `Ignores armour entirely.` |  **Grinder** |
| Tower tier 3 branch | **Total Loss** | Specialize dialog, tower panel | Damage ×2.2, executes anything under 18% health |  **Bonesaw** |
| Tower tier 3 branch | **Carryforward** | Specialize dialog, tower panel | Damage ramps +14% per shot at the same target |  **Rasp** |
| Tower | **Rounding Error** | Loadout card, build menu, tower panel | `9 damage · Short reach · 0.9/sec` / `Hits a small area.` |  **Mortar** |
| Tower tier 3 branch | **Bankers** | Specialize dialog, tower panel | Bigger splash, splash also slows |  **Thunderhead** |
| Tower tier 3 branch | **Materiality** | Specialize dialog, tower panel | Damage ×2.3, ×1.9 again against anything armoured |  **Siege** |
| Tower | **Escalation Clause** | Loadout card, build menu, tower panel | `27 damage · Fair reach · 0.4/sec` / `Hits a wide area.` |  **Longshot** |
| Tower tier 3 branch | **Compound** | Specialize dialog, tower panel | Damage ramps +22% per shot, up to +160% |  **Marksman** |
| Tower tier 3 branch | **Penalty** | Specialize dialog, tower panel | Wider splash, chains to 2 more targets |  **Deadeye** |
| Tower | **Filing Extension** | Loadout card, build menu, tower panel | `8 damage · Short reach · 1.1/sec` / `Slows what it hits to 45%, cuts 3 armour.` |  **Bramble** |
| Tower tier 3 branch | **Deferral** | Specialize dialog, tower panel | Longer slow, chains the slow to 1 more target |  **Thicket** |
| Tower tier 3 branch | **Amendment** | Specialize dialog, tower panel | Damage ×2.6, freezes the target for 0.6s |  **Deadfall** |
| Tower | **Tax Shelter** | Loadout card, build menu, tower panel | `Huge area · +30% damage` / `Buffs nearby towers. Cannot attack.` |  **Beacon** |
| Tower tier 3 branch | **Offshore** | Specialize dialog, tower panel | Much bigger radius, neighbours also gain +20% range |  **Signal Fire** |
| Tower tier 3 branch | **Loophole** | Specialize dialog, tower panel | Stronger buff, neighbours also gain 5 armour pierce |  **Bonfire** |

## Enemies

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Enemy | **Late Filer** | Damage/kill feedback only — the name is not shown on screen during play | `Shambling, penalised, and still technically compliant.` *(flavour is in the data but is never displayed for non-boss enemies)* |  **Bruiser** |
| Enemy | **Shredder** | As above | `Fast, loud, and legally required to destroy the evidence.` *(not displayed)* |  **Scrapper** |
| Enemy | **Final Notice** | As above | `Bold red lettering. Structurally reinforced. Deeply unreasonable.` *(not displayed)* |  **Buckethead** |

## Boss

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Boss | **The Politician** | Wave 13 name, the boss arrival card (name in 56px), the boss health bar, and every tax message | Card: `Here to listen. Here to help. Here to take a percentage.` <br> Arrival: `The Politician is here. He does not attack — he taxes. Spend your peanuts.` <br> Each tax: `The Politician taxed you N peanuts. Spend it or lose it.` |  **The Politician — unchanged** |

## Hero

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Hero | **Cory** | Loadout hero card, HUD hero bar, every hero message | `Holds the line in person and shreds armour nearby.` |  *unchanged* |
| Hero title | **The Optimizer** | **Nowhere.** It is in `heroes.json` but no screen renders it | — |  *unchanged* |

## Hero abilities

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Hero passive | **Depreciation** | **Nowhere.** In `heroes.json`; the radius ring that used to show it was deliberately removed | Shreds up to 7 armour from anything near him |  *unchanged* |
| Hero active | **Haymaker** | Ability bar medallion, cast banner, refusal messages | `Haymaker!` on cast; `Haymaker: nothing in reach.` / `Haymaker is still recharging.` |  *unchanged* |
| Hero active | **Restructure** | Ability bar medallion (DAD MODE only), all its prompts | `Restructure: click a tower, then a free spot.` · `Restructure needs DAD MODE.` · `<Tower> restructured. Back in 22s.` |  *unchanged* |
| Hero ultimate state | **DAD MODE** | HUD hero bar (`· DAD MODE`), the transform, Restructure's gate | `DAD MODE is over. Restructure with it.` |  *unchanged* |

## Specials and consumables

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Special | **Molotov** | Loadout SPECIALS card, ability bar, cast banner | `85 damage, wide area · 14s cooldown` |  *unchanged* |
| Special | **Gnomes** | As above | `2 blockers for 18s · 26s cooldown` |  *unchanged* |
| Special | **Glacier** | As above | `12 damage, huge area · slows to 25% for 5s · 20s cooldown` |  *unchanged* |
| Special | **Meteor** | As above | `36 damage, wide area · 30s cooldown` |  *unchanged* |
| Special | **Chain** | As above | `46 damage, huge area · 18s cooldown` |  *unchanged* |
| Special | **Scratch Ticket** | As above, plus the scratch card overlay | `up to 900 peanuts · 25% pay nothing · 34s cooldown` <br> Result: `Scratch Ticket: N peanuts.` / `Scratch Ticket: not a winner. Keep your day job.` |  *unchanged* |
| Special | **Server Nuke** | Rare mid-run drop: earned overlay, launch confirmation, ability bar | `Deletes every enemy on the board · 0s cooldown` |  *unchanged* |
| Summoned unit | *(unnamed "blockers")* | Two gnome sprites summoned by Gnomes | Described only as "2 blockers" | |

## Waves

All thirteen wave names appear on the START WAVE button row and the wave banner.

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Wave 1 | **Paperwork** | Wave banner, HUD | 4 Late Filers |  **First Light** |
| Wave 2 | **More Paperwork** | Wave banner, HUD | 6 Late Filers |  **Scouts** |
| Wave 3 | **Deadline** | Wave banner, HUD | Late Filers + first Shredders |  **The Rabble** |
| Wave 4 | **Certified Mail** | Wave banner, HUD | Late Filers + first Final Notice |  **Tin and Bone** |
| Wave 5 | **Audit Season** | Wave banner, HUD | 12 Shredders + Late Filers |  **Pressure** |
| Wave 6 | **Registered Post** | Wave banner, HUD | 5 Final Notices + Shredders |  **The Long Push** |
| Wave 7 | **Quarterly Filing** | Wave banner, HUD | All three types |  **Breaking Ground** |
| Wave 8 | **Collections** | Wave banner, HUD | All three types |  **Hardened** |
| Wave 9 | **Second Notice** | Wave banner, HUD | All three types |  **The Swarm** |
| Wave 10 | **Penalty Interest** | Wave banner, HUD | All three types |  **No Quarter** |
| Wave 11 | **Levy** | Wave banner, HUD | All three types |  **The Gathering** |
| Wave 12 | **Final Assessment** | Wave banner, HUD | All three types |  **Last Light** |
| Wave 13 | **The Politician** | Wave banner, HUD | The boss |  **The Politician — unchanged** |

## Levels

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Level | *(no player-facing name)* | The one map is `level1` internally only; no screen names it | — | |

## Currency

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Currency | **peanuts** | The HUD counter, every cost and refusal message, the results dialog, the scratch card, the sign bribe, and a whole credits department | `<Tower> costs 80 peanuts — 30 short.` · `Sold for 48 peanuts.` · `Peanuts earned` · `He wants more peanuts.` |  *unchanged* |
| Meta currency | **Banner Points** | Results dialog headline and its all-runs row | `BANNER POINTS EARNED` · `Banner Points, all runs` |  *unchanged* |

## Modifiers, buffs and debuffs shown to the player

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Buff | **sheltered** → **lit** | Tower panel subtitle, whenever a tower is inside a Tax Shelter | `· +30% sheltered` | |
| Buff stat row | **Nearby damage** | Tower panel, on a support tower | `+30%` (or `+30% → +47%` when upgrading) | |
| State | **DAD MODE** | HUD hero bar | see Hero abilities |  *unchanged* |
| State | **BACK IN Ns** | HUD hero bar and the revive marker on the ground | `· BACK IN 12s` | |

## Screen titles and button labels

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Game title | **COURJAHAN** / **D E F E N S E** | Title screen | Tagline: `A serious tower defense in a very silly world.` | |
| Button | **START RUN** | Title screen | — |  *unchanged* |
| Button | **CREDITS** | Title screen | — |  *unchanged* |
| Screen title | **YOUR LOADOUT** | Loadout screen | Subtext: `Drawn at random for this run.` |  *unchanged* |
| Section heading | **SPECIALS** | Loadout screen | — |  *unchanged* |
| Button | **BEGIN THE RUN** | Loadout screen | — |  *unchanged* |
| Button | **REROLL (1 left)** | Loadout screen | — |  *unchanged* |
| Button | **START WAVE n** / **WAVE n · Ns** | HUD | Early-start bonus appended when there is one | |
| Button | **BUILD** | Build menu | — |  *unchanged* |
| Button | **UPGRADE · N** / **SPECIALIZE · N** / **SELL · N** | Tower panel | — | |
| Panel heading | **TIER n OF 3** / **<TOWER> — TIER 3** | Tower panel, specialize dialog | — | |
| Dialog | **PAUSED** | Pause dialog | `The wave is stopped. Nothing moves until you resume.` · RESUME · RESTART |  **SETTINGS — the pause dialog is now the settings dialog** |
| Dialog | **QUIT TO TITLE?** | Quit confirmation | `This run ends here. Towers, upgrades and peanuts are lost.` · KEEP PLAYING |  *unchanged* |
| Dialog | **THE LINE HELD** | Results, on a win | Message behind it: `Filed on time.` · TRY AGAIN · QUIT TO TITLE |  **HELD THE LINE** |
| Dialog | **THE LINE BROKE** | Results, on a loss | Message behind it: `Overrun.` |  **OVERRUN** |
| Wave banner | **CLEARED** / **OVERRUN** | HUD | — | |
| Overlay | **SERVER NUKE** | Earned announcement and launch confirmation | — |  *unchanged* |
| Toggle | **MUTED** | Audio button | — |  *unchanged* |
| Credits | **TAP TO SKIP** | Credits roll | — |  *unchanged* |

## Flavour text, tooltips and messages that carry the theme

| CATEGORY | CURRENT NAME | WHERE IT APPEARS | CURRENT DESCRIPTION TEXT | NEW NAME |
|---|---|---|---|---|
| Result verdict | Flawless | Results dialog subtitle | `Not one of them got through. Immaculate records.` | **`Not a scratch. Nothing reached the gate.`** |
| Result verdict | Clean | Results dialog subtitle | `A few slipped past. Nothing an amendment will not cover.` | **`A few got through. The line held.`** |
| Result verdict | Narrow | Results dialog subtitle | `Filed under duress, and filed.` | **`Barely standing.`** |
| Result verdict | Lost | Results dialog subtitle | `They reached the filing cabinet.` | **`The doors are open.`** |
| Win message | — | HUD message line | `Filed on time.` | **`The line held.`** |
| Easter egg | **BRIBE THE VILLAGER** | Sign bribe confirmation | `He is advertising for the competition. This buys you nothing but the sign.` · PAY UP · `He wants more peanuts.` · `The sign has been updated. Democracy.` · the painted sign then reads **COURJAHAN!** | |
| Scratch card | **NOT A WINNER** | Scratch card overlay | 17% of draws | |
| Scratch card | **BETTER LUCK, NERD** | Scratch card overlay | 8% of draws | |
| Scratch card | **JACKPOT** | Scratch card overlay | 3% of draws, 900 peanuts | |
| Scratch card | **PEANUTS** | Scratch card overlay, under a winning number | — | |
| Scratch card | **BUT YOU LOOKED GOOD DOING IT** | Scratch card overlay, under a loss | — | |
| Scratch result | — | HUD message line | `Scratch Ticket: not a winner. Keep your day job.` | |
| Build prompt | — | HUD message line | `Tap a build pad to place a tower, then START WAVE.` · `Not enough peanuts to build yet. START WAVE to earn some.` · `Every pad is built. Tap a tower to upgrade it, or START WAVE.` | |
| Build pad | **DO NOT BUILD HERE** | The one painted sign nearest the entrance | — | |
| Credits department | **PEANUT LOGISTICS** | Credits roll | With: Chief Peanut Officer, Peanut Supply Chain, Peanut Quality Assurance, Head of Peanut Compliance, Peanut Compliance (Appeals), Peanut Compliance (Appeals Denied), Catering: Peanuts | |
| Credits department | **GNOME AFFAIRS** | Credits roll | With: Gnome Wrangler, Gnome Union Liaison, Second Gnome from the Left, Gnome Path Adherence Officer, Gnome Retrieval, Gnome Retrieval Unsuccessful | |
| Credits department | **STUNTS AND DAD MODE** | Credits roll | — | |
| Credits department | **LEGAL AND COMPLIANCE** | Credits roll | With: Audit Defence, **Reminder That Cory Works in Tax, Not Audit** | |
| Credits role | Deadline Enforcement / Deadline Extension / Deadline Extension, Denied | Credits roll, PRODUCTION | — | |
| Credits role | Filing Cabinet Continuity | Credits roll, SET DRESSING | — | |
| Credits role | Foley: Peanuts | Credits roll, AUDIO | — | |
| Credits role | Percentage Returned | Credits roll | Name: `NOBODY` | |
| Credits role | Morale, Restored with Peanuts / Peanuts | Credits roll, OPERATIONS | Name on the last: `FOR EVERYTHING` | |

---

## Cosmetic renames — one string, no code

Change these in the JSON and nothing else moves. The game reads the display
name from data everywhere it is shown.

- Every `name` in `towers.json` (tower names **and** the ten specialization names)
- Every `name` and `flavor` in `enemies.json`, the boss included
- Every `name`, `title`, `blurb` in `heroes.json`, plus `passive.name`,
  `haymaker.name`, `restructure.name` and `lastStand.name` (**DAD MODE**)
- Every `name` in `abilities.json`, and the Server Nuke's `blurb`
- All thirteen wave `name`s in `waves.json`
- Every string in `rules.json` — the four Banner `verdicts` and the whole
  `signBribe` block
- Every `role`, `text` and `name` in `credits.json`
- The distance words in `wording.json`
- The loadout copy in `presentation.json` (`drawnAtRandom`, `rerollLabel`)

## Renames that touch code

These names exist as identifiers as well as words. Changing the word is safe;
changing the identifier means changing every place that reads it.

**JSON keys used as ids in code** — `withholding`, `writeoff`, `rounding`,
`escalation`, `extension`, `shelter` are the tower ids, and they appear again in
`draft.json`'s `towerWeights`. `molotov`, `gnomes`, `glacier`, `meteor`,
`chain`, `scratchTicket`, `serverNuke` are the ability ids; `serverNuke` is also
named in `rules.json` as `serverNuke.abilityId` and is special-cased in
`GameScene`. `lateFiler`, `shredder`, `finalNotice`, `politician` are the enemy
ids and are named in every wave's `spawns`. `cory` is the hero id and is the
default in `RunState`. **These are cosmetic only if you keep the key and change
the `name`.**

**Specialization ids** — `garnishment`, `payroll`, `totalloss`,
`carryforward`, `bankers`, `materiality`, `compound`, `penalty`, `deferral`,
`amendment`, `offshore`, `loophole`. Stored on a built tower and written to the
event log.

**Art keys** (`art.json` `files`, referenced by `sprite` fields):
`turret-ledger` (+ `-t2`, `-t3`), `turret-writeoff`, `turret-rounding`,
`turret-escalation`, `turret-extension`, `turret-shelter`, `enemy-filer`,
`enemy-shredder`, `enemy-notice`, `enemy-politician`, `hero-cory`,
`hero-cory-ultimate`, `unit-gnome-trowel`, `unit-gnome-rake`,
`ability-molotov`, `ability-gnomes`, `ability-glacier`, `ability-meteor`,
`ability-chain`, `ability-scratchticket`, `ability-servernuke`,
`ability-haymaker`, `ability-restructure`, `prop-sign-moes`,
`prop-sign-courjahan`, `ui-scratch-covered`, `ui-scratch-revealed`,
`ui-nuke-up`, `ui-nuke-down`.

**Filenames on disk** (renaming the file means editing `art.json` too):
`towers/tower_withholding_t1..t3.png`, `tower_writeoff.png`,
`tower_rounding.png`, `tower_escalation.png`, `tower_filing.png`,
`tower_tax.png`, `enemies/enemy_soldier.png`, `enemy_scout.png`,
`enemy_brute.png`, `enemy_boss_politician.png`, `hero/hero_cory.png`,
`hero/hero_cory_ultimate.png`, `units/gnome_trowel.png`, `gnome_rake.png`,
`abilities/ability_*.png` (all nine), `props/sign_moes.png`,
`props/sign_courjahan.png`. **Note the drift already in here:** the Filing
Extension's file is `tower_filing.png` but its key is `turret-extension`, and
the Withholding Tower's key is `turret-ledger`.

**Class and type names in code** — `Mode = 'normal' | 'targeting' |
'restructure'` in `GameScene`, `SlotKind = 'ability' | 'haymaker' |
'restructure'` in `AbilityBar`, `TaxDef` / `TaxPhase` in `types.ts`,
`tickTax` / `taxPhaseIndex` in `GameScene` and `Enemy`, and the `'taxed'` audio
cue in `audio.json`.

**Painted into the art itself** — the tavern sign reads MOE'S and the bribed
sign reads COURJAHAN!; the DO NOT BUILD HERE sign has its text painted on. A
new name for any of those needs new art, not a new string.

**Save file** — `Save.ts` stores Banner Points, the run-cleared flag, volume
and mute. **No name is stored in the save**, so renaming anything above cannot
break an existing save.
