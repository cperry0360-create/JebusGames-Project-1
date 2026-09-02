# The six steps, and the Politician

**2026-09-02 · `b31fdc8` → `7ca8e92` · CI green on every commit**

Everything asked for in the ordered plan is done, plus the Politician's voice
line. Six commits, each on its own subject.

| | commit | |
|---|---|---|
| 1 | `b31fdc8` | Re-trace map.json to the new plate |
| 2 | `84dc0d6` | The scrim, at every device pixel ratio |
| — | `0b9e1cc` | Move the boss size-check swatch out of the deploy |
| 3–5 | `6a40411` | The band, the tavern glow, the gate slam, the hero row, the walk |
| 6 | `ecb94f4` | Bandcamp, and four dead .wav files |
| — | `7ca8e92` | The Politician's line |

---

## What changed, and what it cost

### 1. The map (already reported)

Traced off the 3840×2160 plate rather than adjusted: 37 waypoints, `roadWidth`
61.2 → 38.0, seven build spots, the arch, the gate and the sign all re-measured.
Verified by rendering the trace back over a road mask.

### 2. The scrim — and a second, worse bug behind it

**The reported fault, fixed:** `ScratchCard` and `Dialog` built their blockers
at `(0, 0)` and relied on being oversize to reach the far corner. That works
only at devicePixelRatio 1: the UI camera's zoom is the device ratio, so at 3
the rectangle's right edge lands at half the canvas. Both are centred on the
viewport centre now.

**The one measuring found:** `setScrollFactor(0)` is the wrong tool for screen
space in GameScene. `asScreenSpace` takes an object off the world camera
entirely, so panning cannot move it whatever its scroll factor — but the UI
camera it *is* drawn by has a scroll of its own: **−844, −390** at dpr 3 on an
844×390 viewport. An object that ignores it is drawn a whole canvas up and to
the left.

That was six calls across two files, and one of them mattered a great deal:

> **At dpr 3 the Server Nuke launch panel was entirely off screen.** The player
> got a dark, dead board with the once-per-run ability behind it and no way to
> reach it or dismiss it. The screen still dimmed, because the blocker was
> three times oversize and the shift happened to be exactly one canvas — which
> is luck, not design.

The last report guessed `NukeOverlays` was "likely fine". It was not. Measuring
rather than assuming is what found it.

**Corner luminance, the assertion asked for.** A new harness scenario samples
the four screen corners with each overlay up and with it down, and checks every
corner kept the same *fraction* of its brightness — a ratio, not a raw value,
because raw luminances only agreed in the earlier measurement by accident of
what this map paints in its corners.

| dpr 3, 844×390 | kept (TL / TR / BL / BR) | |
|---|---|---|
| scratchcard, **before** | 0.641 / 0.995 / 1.000 / 1.000 | top-left quadrant only |
| scratchcard, after | 0.641 / 0.642 / 0.646 / 0.649 | α 0.35 |
| dialog | 0.536 / 0.538 / 0.549 / 0.545 | α 0.45 |
| nuke-earned | 0.208 / 0.216 / 0.219 / 0.215 | α 0.78 |
| nuke-launch | 0.271 / 0.270 / 0.278 / 0.273 | α 0.72 |

Every one matches its configured alpha. Passing at dpr 1 and 3, at 844×390 and
568×320, and **re-introducing either fault fails it again** — checked, not
assumed.

```sh
sh tools/harness/build.sh
DPR=1 sh tools/harness/run.sh scrim 140 844x390
DPR=3 sh tools/harness/run.sh scrim 140 844x390
```

`run.sh` takes `DPR=` now. Defaulting to 1 is a blind spot with a history: it
hid this and it hid the ring anchor before it.

One instrumentation note worth keeping. The probe's first run failed on
`nuke-earned` by 0.002, and the cause was the **tavern lights flickering** —
a corner near one drifted 12% between two baseline frames. Two baselines,
before and after, are averaged now, and the residual uncertainty is carried
explicitly as slack rather than hidden in a fat tolerance.

**A note on the tests.** `tests/nuke.test.ts` *required* `setScrollFactor(0)`
on all four objects. It was enforcing a real requirement — panning must not
move a modal — through the mechanism that caused the bug. It asserts the camera
split instead.

### 3. Three deletions and a stroke

**The summon highlight is an outline.** It was a pale blue disc every
half-radius along the whole lane, and over painted grass, a painted dirt road
and painted stones it read as a stain across the map. Two lines along the edges
of the legal strip now.

The interesting part is the cull. Offsetting a lane to both sides folds the
line into a bow tie on the inside of any bend tighter than the radius, so every
offset point that lands back *inside* the band is dropped — a point closer to
the lane than `within` is by definition not on the boundary. Survivors come in
runs and each run is stroked on its own, so a gap is never bridged by a chord
through the legal area.

**The tavern ambience is gone.** Seven additive glows and a chimney emitter,
placed against the old plate — two landed on the painted signboard and one on
the innkeeper. The new plate paints lit windows, hanging lanterns and chimney
smoke into the art. `src/systems/Ambient.ts` and both data blocks deleted.
Measured after: **0 additive objects, 0 particle emitters.**

**The gate slam is gone, and the enemy fades through instead.** The gate stands
open in this plate — two leaves apart with a dark gap at world x 1235–1248 — so
a heavy hit, two dust puffs and a camera shake were describing a collision that
does not happen.

The fade is measured in **distance, not time**, and that is the half worth
knowing. The way in is timed because every enemy starts from a standstill
behind the arch. The way out cannot be: the gap is fifteen world pixels and the
roster spans a wide speed range, so a timed fade lets the fastest walk out the
far side at full opacity while the slowest dissolves before reaching the gap.

```
gateway, 844x390    visible before the arch mouth   0 frames
                    part-transparent between them   0 frames
                    left at the gate                4, alpha 0.06 at x=1249
```

**Moe's sign** was already re-pointed in the re-trace; confirmed in the browser.
The sprite's bounds are `907,166 36×48` against a painted board at
`907,163 .. 943,203`. It is on the board.

### 4. The hero bar — and the part the instruction could not fix

Moved to the left of the second row. **But the premise needs qualifying, and
the measurement is why.**

At the minimum zoom the whole board is on screen, so the map's top-right corner
*is* the screen's top-right corner and there is no camera position that moves
the painted signboard out from under whatever is parked there. Measured at
844×390: the sign lands at screen **x 572..722**, the old hero row at 587..834.

The hero row is not the only element that lands there:

| zoom | what the painted sign can reach |
|---|---|
| 0.78 (min) | the hero row, the **START WAVE button**, the message row |
| 1.72 (default) | nothing |
| 2.37 (max) | the ability bar, and **both corner buttons** |

At maximum zoom the sign can be panned under any element on the screen, and so
can every other painted feature. What the move buys is real but bounded: **the
one solid plate parked there for the whole run is no longer parked there.** The
message row inherits the right-hand end — that is stroked text, and the boss
bar sharing the rectangle carries its own plate and is up for one wave in
thirteen.

If the START WAVE button on the tavern sign at minimum zoom bothers you, say
so; it is the same kind of move and I did not make it unasked.

### 5. The walk at 6 fps

Cory moves at 104 world px/s and renders 78.8 tall. A 4-frame cycle is two
steps.

| | per step | body-heights |
|---|---|---|
| 12 fps (shipped) | 17.3 px | **0.22** |
| 6 fps | 34.7 px | **0.44** |
| a human stride | | 0.40–0.45 |

His feet were taking steps half the length his speed demanded, which is what
sliding is.

**The attack keeps 12,** and the rate is split per clip to make that possible.
`impactFrame` is the third frame, so one shared rate would have moved the
swing's landing from 167 ms to 333 ms. Halving the walk to fix a slide must not
double the attack telegraph.

### 6. Bandcamp, and 57 kB of dead audio

<https://greenbearmusic.bandcamp.com> is on syncopika's line in the roll and in
the ATTRIBUTIONS.md table. CC BY 3.0 obliges only the name and the licence, so
this is a request honoured rather than a condition met. `verified` flips to
true, and the note says exactly what that rests on: **your confirmation.** The
file still carries no ID3 metadata beyond an ffmpeg encoder tag, and
opengameart.org is still blocked by this environment's egress proxy.

Deleted, all four regenerable by `tools/mksfx.py`:

| file | | |
|---|---|---|
| `sfx-build.wav` | 7.1 kB | superseded by `sfx-build.ogg` |
| `sfx-cast.wav` | 12.4 kB | superseded by the per-ability `sfx-cast-*.ogg` |
| `sfx-leak.wav` | 15.9 kB | referenced by nothing at all |
| `sfx-tax.wav` | 22.1 kB | superseded by `sfx-taxed.ogg` |

The test meant to catch this was **asserting three of those four exist** — a
hand-written list of filenames, written when they were live and never
revisited. It reads the manifest now: every cue's file must be in the deploy,
and nothing in the audio directory may be unreferenced.

---

## The Politician

7.30 seconds, wired to the boss **becoming visible** rather than to wave 13
starting. The gap is why that distinction matters:

```
boss spawned at x=-56 alpha 0.00, 1483ms after the wave started
  line played by the spawn: 0            correct — he is not visible yet
  line played once at volume 0.750, 3538ms after the spawn
                                        boss now at x=51 alpha 0.06
  expected 0.750 — matches
  boss killed mid-line: 1 of 1 still playing   correct — it plays out
  played exactly once: true
```

**Three and a half seconds separate the spawn from the entrance.** He spawns
off the plate behind the arch's stonework at alpha 0; firing on the wave would
have played the whole line to an empty screen.

**Chained, not assigned.** Two lines now want the emergence hook — the goblin's
greeting and this — and a run whose first enemy to emerge is also the boss
would have lost whichever was written second.

**Levelled by measurement**, like the other three: −1.7 dBFS peak, −16.3 dBFS
over its loudest half, so gain 0.857 against the 1.25 voice bus lands it at
−15.7 dBFS, where all four sit. The test asserts that **spread** now rather
than counting the lines — it used to say "expected three", with a comment about
a fourth being addable without re-tuning the first three, and a count would not
have caught a fourth arriving at its raw level.

**It plays out.** 7.3 seconds is longer than the boss may survive, and a line
cut off mid-sentence because you killed him quickly is worse than one that
outlives him. Verified by killing him outright mid-line.

The **DAD MODE arrangement is untouched**, and now asserted rather than only
commented: the line goes first and the sting follows it, because the duck only
reaches what *starts* during a line.

The **load-failure path needed no new code**, which is worth saying rather than
inventing one: `queueAudio` loads every cue in the manifest, `missingCues`
reports the ones that did not arrive, boot logs them, and `play()` skips a cue
whose file is absent *before* it claims a voice. Adding a cue gets all of that.

Elijah's card lists individual lines, so **"The Politician"** joins them.

```sh
sh tools/harness/run.sh politician 110 844x390
```

---

## Your two uploads

| file | | |
|---|---|---|
| `enemy_boss_beetle.png` | 968×1200, 1.5 MB | untouched, not in the manifest, nothing loads it |
| `map_world.webp` | 2.7 MB | untouched, not in the manifest, nothing loads it |
| `_check_140.png` | 52 kB | **moved** to `reference/art` |
| `sfx_politician.mp3` | 94 kB | **moved** to `reference/audio` |

`_check_140.png` failed CI on your upload commit (`b210f83`), correctly: an
underscore prefix marks a working reference and `content.test.ts` refuses one
inside the deploy. The `.mp3` moved because the cue names the `.wav` you asked
for and the two cannot both ship — **the `.mp3` is 94 kB against the `.wav`'s
650 kB**, so if you would rather ship that, it is a one-line change.

---

## What was NOT checked

- **The mp3's fidelity.** I did not decode `sfx_politician.mp3` and compare it
  to the wav, because the wav is what ships. If you want the 556 kB back, that
  comparison is the first thing to do.
- **A full 13-wave run** with all of this in place. Every scenario here is
  targeted; the loop has not been played end to end since the re-trace.
- **dpr 3 on anything but the scrim.** The ring's proximity bug is still
  unfixed and still lives at dpr 3.
- **The summon outline is wider than the road,** and that is left alone
  deliberately. It is drawn at `pathOnlyWithin` = 56; the re-traced road is 38
  across. The outline is honest about the rule — the rule was tuned against a
  road half again as wide. Narrowing it is a balance decision.

## Still outstanding

1. `worldToScreen` in `Resolution.ts`, and the ring anchor through it — the
   same canvas-vs-CSS-pixel confusion as the scrim, and the reason the build
   ring lands 401 px from its pad at dpr 3.
2. Proximity as an assertion in the placement test, and a dpr-3 harness pass.
3. Invert `fitRingAndPanel`: move the panel, not the ring.
4. The two- and three-option tight arc.
5. The dimmed icon with a lock badge for locked options.
6. Hero facing, DAD MODE audio sync, the music level.
7. The settings menu: a gear icon, three sliders, HOME / RESTART / CONTINUE.
8. The renaming pass.
