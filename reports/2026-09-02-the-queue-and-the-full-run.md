# The queue, and the first full run since the re-trace

**2026-09-02 · `4ef2435` → `1835d21` · CI green**

Everything in the queue is done, and the game has been played through twice.

| | commit | |
|---|---|---|
| — | `70106bd` | Narrow the description panel on small screens |
| — | `517e34a` | Hero facing, DAD MODE sync, music level |
| — | `9b9f477` | One gear, and a settings dialog behind it |
| — | `d19e76d` | The renaming pass |
| — | `1835d21` | The full 13-wave run, and the harness bugs it found |

**Your three answers**, handled: START WAVE left where it is; the panel narrows
on small screens; the Politician ships as the `.wav`, with the `.mp3` in
`reference/audio`.

---

## The narrower panel

Measured over 540 placements per viewport:

| | worst hidden | any hidden |
|---|---|---|
| 844×390, fixed 226 | 2 | 15 / 540 |
| 844×390, adaptive | **0** | **0 / 540** |
| 568×320, fixed 226 | 4 | 225 / 540 |
| 568×320, adaptive | **2** | **120 / 540** |

Not zero on the smallest notched screen and it cannot be: a six-option ring is
324×214 in a 472×171 strip, so there is no room beside it at any width. Nor
does going narrower help — at 120px the worst case is still two — so the floor
sits at 150, where the stat rows stop being readable. It keeps the full 226 in
525 of 540 placements at 844×390 and 255 of 540 at 568×320.

**What gives way is what the panel says**, in order: the description's font,
the rows' height, the title's size, and finally the description itself. That
last step is new. A narrow panel wraps the prose into three-word lines and at
that point it costs more height than it is worth — the rows carry the numbers,
the title the name, the price the decision.

## Hero facing — it does not reproduce

Driven and watched frame by frame at dpr 3:

```
walking left:  0 flips on the way, 0 frames facing the wrong way
walking right: 0 flips on the way, 0 frames facing the wrong way
idle after walking right: facing RIGHT — last facing kept
10 swings watched, 0 frames facing away from the target
```

Two corrections worth having. **The art is drawn facing LEFT**, not right — I
checked `hero_cory_walk_1.png` and `hero_cory_ultimate.png` — and the code's
inversion is correct for it. Treating it as right-facing would mirror
everything, which is exactly what a facing bug looks like from outside.

And the likely culprit is already fixed: the shared facing dead zone went from
0.15 to 0.26 in the map re-trace, because the new road bends back on itself and
0.15 flipped a unit round to walk downhill backwards. That dead zone is the
hero's too.

## DAD MODE — it was firing 240ms early

The visual transformation is **not** the flash. He fades out on the frame he
drops to 25%; the SUV appears 500ms later. Everything used to fire at once at
the start, so the line was talking while he was still a man fading out.

Measured off the recording in 20ms windows: **260ms of room tone**, then
speech, and that first syllable is the loudest window in the line. Starting the
cue at `transformPauseMs − leadIn` puts the word on the vehicle:

```
transformPauseMs 500   lead-in 260   so the cue starts at 240ms
  SUV appeared at        476ms
  voice cue started at   225ms
  its first word at      485ms          9ms from the SUV
  sting started at       476ms  at 0.297, still ducked under the line
```

The sting moved with it and hangs off a new `transformed` event from the hero,
not a second timer set to the same number.

## Music was louder than the voice

```
before   music -15.4 dBFS   voice -15.7   music 0.3 dB LOUDER
after    music -26.4 dBFS   voice -15.7   music 10.7 dB under
```

Decoded in the browser at the levels the game actually plays. That is why the
lines were buried. The step down lives in `music.json`'s `busGain`, not in the
slider's default, so the slider sits at 100% and is still balanced — a control
that has to default to 28% reads as broken.

**And music has its own volume now.** Three channels — sfx, music, voice — set
and stored independently. The old save key keeps its name; the two new ones
default to full rather than inheriting it.

## The settings dialog

One gear where there were four controls. Measured at dpr 3, at both viewports
and both ends of the zoom band, **by position**:

```
844x390   gear at 792,338 44x44 on screen
          6 of 6 controls reachable, none overlapping
          tapped the board behind the panel: hero moved false, towers 0 -> 0
          tapped MUSIC at 45% then 85% of the row: 0.00 -> 1.00
          dragged MUSIC left from 85% to 40%: 1.00 -> 0.00
          CONTINUE: panel closed, Game paused false
```

**That probe earned its keep immediately.** The slider did not work at dpr 3
and looked like it did: `pointer.x` is canvas pixels, three times the number
the layout is written in, so every press resolved past the right-hand end and
the value sat pinned at 100%. A handler-fired check would have passed.

That is the fourth bug from the same confusion, in code written *after* the
helper that exists to prevent it — `worldToScreen` takes a world point and this
is a pointer, so it did not apply.

The whole row is the slider, not the handle: a 22px circle is under half what a
thumb can land on.

## The renaming pass

Towers mapped by the numbers rather than by the old names:

| id | evidence | role | new |
|---|---|---|---|
| withholding | 0.65s interval, no splash, no slow | fast single | **Slingshot** |
| rounding | 64px splash | splash | **Mortar** |
| extension | slowFactor 0.45 | slows | **Bramble** |
| writeoff | ignoresArmor, 44 damage | ignores armour | **Grinder** |
| escalation | 215 range, the longest | long range | **Longshot** |
| shelter | supportRadius 215, fires at nothing | support | **Beacon** |

**The pairs needed a decision.** Each tower has one unnamed tier 2 and *two*
tier-3 branches, so the two names in each pair are the two branches. I assigned
within each pair by mechanic rather than by list order:

| tower | | |
|---|---|---|
| Slingshot | Hailstorm = damage ×1.9, ignores armour | Repeater = faster, chains |
| Grinder | Bonesaw = damage ×2.2, executes | Rasp = faster, ramps |
| Mortar | Thunderhead = splash ×1.6 with a slow | Siege = heavy, anti-armour |
| Bramble | Thicket = longer slow, chains | Deadfall = damage and a stun |
| Beacon | Signal Fire = bigger radius | Bonfire = hotter, smaller |
| Longshot | Marksman = damage and ramp | Deadeye = splash, chain, reach |

Grinder's and Mortar's are the two I flipped against the order you listed them
in. **Longshot's is the pair I am least happy with**: both words mean precision
and one of the branches is splash-and-chain. Any of these is a one-line change.

**Enemies**: three fightable types against four roles, so "big brute" landed on
the 66hp basic — the slower and tougher of the two basics.

| id | | role | new |
|---|---|---|---|
| shredder | 122 speed, 40hp | fast weak | **Scrapper** |
| lateFiler | 58 speed, 66hp | big brute | **Bruiser** |
| finalNotice | 40 speed, 140hp, 7 armour | slow armoured | **Buckethead** |

**Verdicts needed a decision too**: five names, four slots — because the screen
is a title plus a subtitle.

```
win title  HELD THE LINE          loss title  OVERRUN
flawless   Not a scratch. Nothing reached the gate.
clean      A few got through. The line held.
narrow     Barely standing.
lost       The doors are open.
```

`clean` had no name in your list, so it is written to match.

All six tower descriptions were rewritten; five lightly, and Bramble's is new
prose because "gives everything in range more time to think" was a filing joke
rather than a description of a slow. One more string went with them: a tower
inside a Beacon reads **"+30% lit"** rather than "+30% sheltered".

**Nothing clips.** Driven at 568×320 at dpr 3, every tower taken to tier 2 and
both branches opened, every piece of text measured against its panel: 12 branch
panels and 6 sell panels, every word inside it.

Painted text is untouched and unaffected: Moe's sign, the Courjahan sign,
DO NOT BUILD HERE, and COURJAHAN'S TAVERN in the plate. All four are family
names or an instruction, not tax terms. `NAMING.md` carries the full mapping.

---

## The full run

```
844x390   won   13 of 13 waves   20 of 20 lives   239s
568x320   won   13 of 13 waves   20 of 20 lives   238s
          59.7 fps, 0 frames over 120ms, worst 117ms
          no missing art, no page errors
```

Watched every loop, not just at the ends: NaN positions, anything off the
plate, an enemy part-transparent between the arch and the gate gap, a tower off
the map, and every HUD rectangle against every other and against the screen.
**None of it fired.**

### The finding is the difficulty

A driver that only builds what it can afford, upgrades what it has and spends
its abilities on the leader **never loses a life, at either viewport**. Seven
pads filled by wave 5, then it coasts:

| wave | lost | earned | towers |
|---|---|---|---|
| 1 | 0 | 117 | 1 |
| 5 | 0 | 193 | 7 |
| 9 | 0 | 416 | 7 |
| 13 | 0 | 1067 | 7 |

Cory goes down repeatedly along the way — waves 3, 8, 11, 12 — and it costs
nothing, because a hero death costs no lives. He is free to throw away.

### Two things from looking rather than from a check

- **The camera never frames a fight.** Several wave screenshots are of empty
  grass, because the camera follows the hero and the hero was sent to the far
  end of the lane. A player who taps nothing gets the same result.
- **A tower's tier dots sit about 50 world pixels below its base**, which at
  this zoom reads as detached rather than as standing on the ground with it.

### Three probe bugs found on the way

All of the kind that make a broken thing look fine.

- **`build()`**, the shared helper every scenario places a tower through, still
  drove `g.menu` — BuildMenu, deleted when the ring landed. Every scenario that
  built a tower had been failing rather than testing.
- **The `spec` scenario** drove the same dead object, so the tier-3 fork had no
  coverage at all.
- **The first `full13` run reported "100% long frames"**, which was nonsense:
  it counted the driver's own 220ms polling loop, not the game's frames. The
  59.7 fps above comes from its own `requestAnimationFrame` counter.

```sh
sh tools/harness/build.sh
DPR=3 sh tools/harness/run.sh full13 560 844x390
DPR=3 sh tools/harness/run.sh full13 560 568x320
```

---

## Your uploads

`map_world.png` arrived at **3840×2160 and 17.6MB**, beside the 2.69MB WebP
made from it. `content.test.ts` fails on it correctly — an image over 3MB on
the boot path is the check that exists because a map plate once arrived as a
12.6MB PNG. It is in `reference/art` now. The duplicate
`public/assets/map_world.webp` is deleted (byte-identical, md5 `c62ccd53`).

The five node PNGs stay where you put them. Nothing loads any of it, but
`assets/nodes` is **4MB every player downloads**: 2.69MB of world map and 1.4MB
of icons. Worth converting when they are wired up.

## What was NOT checked

- **A losing run.** Neither playthrough came close to losing, so the results
  screen's OVERRUN title and "The doors are open." verdict have not been seen
  on a real loss — only in the data.
- **The renamed strings on the title and loadout screens.** The tower names
  appear on loadout cards; I checked the in-run panels, not those.
- **`both.sh` across every scenario.** Run on `ui` and `proximity` only.
- **The settings panel with a notch.** Driven flat at both sizes; the safe-area
  inset case is arithmetic in the test, not a picture.
- **The title screen's volume control**, which still moves only the
  sound-effects channel now that there are three. A real inconsistency, left
  because it is a different surface from the in-game HUD.

## Still outstanding

1. Base difficulty — a bot cannot lose. This is the one that matters now.
2. The title screen's volume control against the three channels.
3. Longshot's Marksman/Deadeye pair, if the mechanics should drive the names.
4. `assets/nodes` weight, when the overworld is wired up.
