# The map-swap regressions: nine reports, three causes

**2026-09-02 · against `b209db0`**

Diagnosis only. **Nothing has been changed.**

## The short version

Seven of the nine are **one bug**: the map plate was replaced with a *different
painting*, and every world coordinate in `src/data/map.json` still describes
the old one. The lane, the arch, the gate, the tavern sign and the tavern
lights were all measured off the 1672×941 plate and never re-measured for the
3840×2160 one.

Two are independent, and one of those is worse than reported.

| # | Report | Cause | Confirmed |
|---|---|---|---|
| 1 | Lane does not match the road | **A** — stale coordinates | yes, measured |
| 3 | Gnome highlight looks bad | **A** for *where*, **C** for *how it looks* | yes |
| 4 | Moe's sign detached | **A** | yes, measured |
| 5 | Tavern effects compete with baked art | **A** | yes, measured |
| 7 | Tower renders at the map edge | **A**, probably — **not reproduced** | no |
| 8 | Camera shake fires too often | **A** — the gate is open now | yes, measured |
| 9 | Entrance fade not aligned to the arch | **A** | yes, measured |
| 2 | Modal scrim not full-screen | **B** — device pixel ratio | yes, and worse than reported |
| 6 | HUD overlaps the map | **C** — independent | yes, measured |

---

## Cause A — `map.json` describes the old painting

The new plate is not a higher-resolution export of the old one. It is a
different picture: the road runs on a different course, the arch has moved, the
gate is **open**, and the tavern and its sign are in different places. The plate
is scaled to the same 1280×720 world box, so nothing *looks* broken at load —
every coordinate is simply pointing at where something used to be.

### 1. The lane

Measured by sampling the painted road out of the source PNG every 40 world
pixels and comparing it with the lane the waypoints describe:

**The lane leaves the painted road at 11 of 33 sampled columns.** The worst
stretch is x 720–880, where the lane runs 80–120 world px above the road —
squarely on grass. Two examples:

| world x | lane y | painted road | |
|---|---|---|---|
| 800 | 333 | 431–484 | ~120px off |
| 840 | 304 | 347–452 | ~50px off |
| 1040 | 341 | 274–314 | ~30px off |

There is also **no road at all** at x 0 and x 40 — the new road starts around
x 80, so the first two waypoints are in open grass beyond the arch.

**And the lane is wider than the road.** `roadWidth` is **61.2**; the painted
road measures **35–55 world px** across at most columns.

### 4. Moe's sign

`map.json.sign` puts it at world **(841.5, 187.5)**. In the new plate the
innkeeper stands at world x ≈ 903–980, y ≈ 157–253, and the **blank board he is
holding** is at world x ≈ 907–943, y ≈ 163–203.

So the sign sprite is drawn about **65 world px to the left of the board**, in
open grass. `boardWidth` is 64; the painted board is about 36 across.

**Which is the gameplay object:** the *sprite* is. It carries the tap target,
the bribe easter egg and the swap to `sign_courjahan.png`. The innkeeper and
his blank board are painted into the plate and cannot be tapped. So the sprite
moves onto the board — the art goes where the plate already put the man.

### 5. Tavern effects

Seven lights and one chimney, and they were placed against the old plate:

| declared at | lands on, in the new plate |
|---|---|
| (952, 136), (988, 138) | the painted **COURJAHAN'S TAVERN signboard** |
| (929, 184) | the **innkeeper** |
| (1050, 162), (1100, 158), (1132, 161) | roughly right — the painted windows |
| chimney (1093, 23) | **open sky, ~80px above the painted roof** |

The new plate already has lit windows, lanterns and chimney smoke painted in.
**What they were for:** the old plate's windows were unlit and its chimney was
cold, so the glow and the smoke were the only thing making the tavern read as
occupied. That job is done by the art now. My recommendation is to delete both
— the flicker and the smoke — rather than re-place them.

### 8. Camera shake

Measured: **3 shakes in 23 seconds** of wave 1 with no towers built (the report
measured 6 in 150s — consistent). Every one is a gate arrival.

The premise is now wrong in the art: **the gate in the new plate is open.**
Two wooden leaves standing apart with a dark gap between them. An enemy walking
through an open gate has nothing to slam into, so both the shake and the impact
puff are describing something that is not there.

### 9. The entrance

`map.json` says the arch passage is open from world x 33 to 83, with piers at
0–34 and 83–130, and `emergeFromX: 0`.

Measured off the new plate, the arch passage is at world **x ≈ 50–103**, with
piers at **≈27–50** and **≈103–127**, and its base at **y ≈ 370**.

So enemies begin fading in about 50 world px before they reach the arch, at a
y that is not the arch's. The occluder rectangles crop the wrong columns of the
plate too.

### 7. Tower at the map edge — NOT REPRODUCED

I could not make this happen. Built through the ring at spot 0:

```
asked for spot 0 at world 162,456; tower is at 162,456   same place
on the glass at 277,195 in a 844x390 viewport            on screen
```

My first attempt *did* report it off screen, and that was **my probe's bug**:
it compared camera arithmetic (canvas pixels, so ×3 on this device) against a
CSS-pixel viewport. Corrected, the tower is exactly where it was asked for.

The most likely explanation is cause A wearing a different hat: the build spots
are also old-plate coordinates, so a pad can sit somewhere the new art gives no
reason for, and a tower appearing there looks misplaced. **If you can reproduce
it, the timestamp and which pad you tapped would settle it.**

---

## Cause B — the modal scrim is device-ratio dependent

This one is worse than the report says, and it is not the design box.

Measured by sampling the four screen **corners** — far from the bright card, so
any change there is the scrim and only the scrim — before and after opening the
Scratch Ticket:

| device pixel ratio | corner luminance (TL / TR / BL / BR) | |
|---|---|---|
| **1** | 62 / 66 / 66 / 63 | agree within **4** — covers the screen |
| **3** | **60 / 104 / 104 / 96** | agree within **44** — covers the **top-left only** |

At dpr 1 the scrim is correct. At dpr 3 it dims roughly the top-left quadrant
and leaves the rest of the screen untouched. Your capture was 2868×1320, which
is a retina capture, so this is what you were looking at.

The rectangle is 2532×1170 with bounds −1266,−585, which *contains* the
844×390 viewport — so the size is right and the report is right that it draws a
rectangle. The fault is that it is created at **(0,0) with `setScrollFactor(0)`
on a UI camera whose zoom is the device ratio**, and those two do not compose
the way the code assumes.

Two components share the pattern and are both affected:

- `ScratchCard.ts:140` — `rectangle(0, 0, viewW*3, viewH*3)`
- `Dialog.ts:120` — `rectangle(0, 0, viewW*2, viewH*2)`

`NukeOverlays.ts` centres its blocker at `(W/2, H/2)` instead and is likely
fine, but it should be measured rather than assumed.

**This affects every dialog in the game, not just the ticket** — including the
pause dialog and the run-over banner.

---

## Cause C — independent of the map

### 6. HUD over the tavern sign

Confirmed by projection. With the camera positioned so the tavern is in view:

```
the painted COURJAHAN'S TAVERN sign projects to  654,12 .. 786,88
the HUD hero row is at                           587,60  247x22     *** OVERLAP ***
```

Not a HUD bug and not a map bug on its own: the hero row is fixed at the
top-right of the screen, and the new plate paints the tavern sign in the map's
top-right. They collide whenever the camera looks at the tavern. It needs a
decision — move the hero bar, or accept it.

### 3. How the highlight looks

`drawPathBand` fills overlapping translucent discs of radius `within` along the
whole lane in `0x8fd0ff` at alpha 0.22 — a filled pale blue band, exactly as
described. That is a deliberate old choice (a green tint on green grass is
invisible), and it is a separate matter from the band being in the wrong place,
which is cause A.

---

## Two of the other four tasks are already done

**Electric Dream** was removed in `730d7d5`. The file is gone from
`public/assets/audio/music/`, `music.json` no longer names it, and the roll's
MUSIC section is generated from that file so its credit went with it. The only
two remaining mentions are a comment in `music.test.ts` about the original
upload filename and a paragraph in ATTRIBUTIONS.md that *records the removal*.
Still outstanding from that message: the **Bandcamp link** for Battle BGM, and
the **four unreferenced `.wav` files**, which are:

| file | |
|---|---|
| `sfx-build.wav` | 7.1 kB — superseded by `sfx-build.ogg` |
| `sfx-cast.wav` | 12.4 kB — superseded by the per-ability `sfx-cast-*.ogg` |
| `sfx-leak.wav` | 15.9 kB — referenced by nothing at all |
| `sfx-tax.wav` | 22.1 kB — superseded by `sfx-taxed.ogg` |

57 kB in total, all four regenerable by `tools/mksfx.py`.

**The hero animation** was built in `c3b0147` — both clips, one anchor, damage
on frame 3, manifest hooks with a fallback to the static idle. **But it runs at
12 fps, and you asked for 6.** You asked me to report the mismatch rather than
change the rate silently, so:

- Cory's `moveSpeed` is **104 world px/s**. He renders **78.8 world px** tall.
- A 4-frame walk cycle is two steps. At **12 fps** that is 3 cycles/second, so
  **17.3 px per step — 0.22 body-heights.**
- A human stride is about **0.4–0.45 body-heights**. So at 12 fps his feet
  take steps half the length his speed demands: **he slides, and the shipped
  value is the one that causes it.**
- At **6 fps**: 1.5 cycles/second, **34.7 px per step — 0.44 body-heights.**

Your number is the correct one and it fixes the slide. I will change 12 → 6.

---

## Nothing else has text baked into art

Checked against the rename: `pad_donotbuild.png`, `sign_moes.png` and
`sign_courjahan.png` are the three you named. The new map plate adds a fourth —
**"COURJAHAN'S TAVERN" is painted into the plate itself** at world (930–1007,
103–147). It is a family name rather than a tax term, so the rename does not
contradict it, but it is now unchangeable without a re-export.

---

## Suggested order

1. **Re-trace `map.json` to the new plate** — lane, road width, build spots,
   arch, gate, sign, ambient. One measurement pass fixes 1, 4, 5, 9, most of 3,
   and probably 7.
2. **The scrim**, on its own — it affects every dialog in the game and has
   nothing to do with the map.
3. Then 3's appearance, 6's decision, and 8's open gate.
