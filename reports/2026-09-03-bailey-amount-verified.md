# Bailey's amount: it is already 0.60, and 0.60 is the answer

2026-09-03.

| | commit | CI |
|---|---|---|
| Raise Bailey so both eyes clear the foliage — *not mine, landed before this* | `c4ff6b0` | green |
| Correct the collar bound; de-stale the harness output | `e07b6bc` | green — Checks and deploy both success |
| This report | — | documentation only |

**`peakVisible` is not changed by this work, and should not be.** The raise you
asked for landed in `c4ff6b0`, from the other session, before your message.
It is 0.60 on `main` now. Measured against her own art, 0.60 is what "eyes
fully clear, foliage across the muzzle" comes out to, and it is the **midpoint**
of the band that survives measurement.

What this commit does fix is a 32-pixel error in the guard around it, and a
line of harness output that was still describing the state before the raise —
which is, I think, what you were reading.

---

## First: you are describing the state before `c4ff6b0`

Your words are the pre-`c4ff6b0` state and its own note, near-verbatim.

| you wrote | `presentation.json` at `dac2824` said |
|---|---|
| "ears and a sliver of forehead, and her eyes are below the line" | "0.33 … the ears and the top of the head with the eyes at or just under the line" |
| "My earlier instruction said 'eyes at or just below the line' and that was wrong" | that exact phrase was the `_peakVisible` note |

`c4ff6b0` replaced 0.33 with 0.60 and rewrote that note. So the capture you
measured is a 0.33 board, and the sentence you are correcting is one the repo
no longer contains.

**And the harness helped you believe it.** Its Bailey line read:

    visible 40.2 world px = 26.5 CSS px  (60% of her, the ears and the top of the head)

"the ears and the top of the head" was written when the number was 33 and was
still printed when it became 60. So the log described 0.33 while reporting
0.60. That is fixed here: the reading is derived from the value now, against
the same source rows the test asserts.

## Second: your arithmetic points at 0.60 too

Your ratio is the useful part — 110/82 = **1.34**. Her visible height is
`peakVisible x 67` world px, so the only unknown is the scale of your capture.

| if your 82px is… | scale | then your 110px is… |
|---|---|---|
| 0.33 | 3.71 px/world | 0.44 |
| **0.44** | **2.78 px/world** | **0.59** |
| 0.50 | 2.45 px/world | 0.67 |
| 0.60 | 2.04 px/world | 0.80 |

The second row is the one where both your numbers land on real values: 0.44 is
exactly "30-40% more than 0.33", and 110px at that same scale is **0.59** —
which is 0.60. Your estimate and the measurement agree.

The last row is the only reading that would need more work, and your own words
rule it out: at 0.80 the foliage crosses her **chest**, not her muzzle, and
almost nothing painted is hiding her. It also fails the collar bound below.

**Note the trap in row one.** If you had been on 0.33 and I had applied "+34%"
literally, that lands on **0.44** — and 0.44 cuts both eyes in half. Your
percentage under-shoots your own requirement, so I followed the requirement.
The test now fails 0.44 by name so that cannot be applied later by accident.

## The measurement, on her own art

`peakVisible` is the fraction of her, from the top down, that clears the line.
So every landmark is a row of the 643x872 source. Candidate lines drawn onto
the art and looked at, plus a teal mask for the collar:

| landmark | source rows | fraction |
|---|---|---|
| ear tips | 0 | 0.00 |
| eye band | 349..470 | 0.40..0.539 |
| nose leather (the muzzle) | 505..585 | 0.58..0.671 |
| **collar (teal)** | **569..716** | **0.653**..0.821 |

Read off the lines directly: 0.52 still clips the lower eye; **0.55** is where
both are clear; 0.58 is on the bridge; 0.61 crosses the top of the nose;
0.653 crosses the bottom of it and the collar appears.

    floor    0.55   below that, an eye is cut
    ceiling  0.653  above that, collar
    midpoint 0.60   <- what is shipped

## The bug this found: the collar bound was 32px too generous

The landmark comment said the collar starts at **601**. It starts at **569** —
checked by masking the collar's teal, the one colour on the sprite that appears
nowhere else on her. So the ceiling was written as 0.689 when it is 0.653, and
**any value from 0.653 to 0.689 would have shipped a visible collar and passed
the test.** 0.60 was never in danger; the guard was.

The floor moves as well, from level with the eye's lower rim (471) to 8px below
it (479). Level with it is a one-pixel margin and reads as a clipped eye.

Both bounds are now stated as source rows rather than as chosen decimals, so
the failure message names the pixel and an arithmetic raise cannot land back
inside the eye band quietly.

## The captures, and what they are

**They are reconstructions, not frames, and that is a real limitation.** The
harness cannot run in this environment at all: `npm` returns 403 for `phaser`
and the CDNs are refused by the proxy — I tried both. So there is no renderer
here.

What makes the reconstruction faithful is that Bailey is the simplest thing on
the board: a plain `add.image`, origin 0.5/0, `displaySize` from `worldHeight`,
a **rectangular** geometry mask ending at `canopyY`, no tint, no blend mode, no
shader. Compositing her over the plate PNG at the same world coordinates draws
the same pixels the renderer does, up to the camera's resampling. What it does
**not** show you is filtering at the real on-screen scale — at the opening zoom
she is 26.5 CSS px of dog, and these crops are at the plate's 3 px/world.

Reproduce, and the comparison strip:

    git show 712ab1c^:public/assets/map/map_level1_v2.png > /tmp/plate.png
    # then the compositor described above, at peakVisible 0.33 / 0.44 / 0.60

Your two tests, per spot, at 0.60:

| | is it a dog looking at you? | is something painted doing the hiding? |
|---|---|---|
| spot 0 — bushes above the waterfall (125, 526) | yes — both eyes, ears, forehead | yes, **92%** painted foliage under her |
| spot 1 — conifer lower right (1118, 630) | yes | yes, **98%** painted foliage under her |

Coverage measured over the 12 world px below each canopy line, across her 49.4
world px drawn width, classifying plate pixels as foliage / grass / stone.
**Spot 1 is the stronger of the two**, which is what the earlier report said —
and the opposite of my first impression from looking at the crops, so the
number is the one to trust, not my eye.

## Checked

- 605 tests pass. `sh tools/tsdiff.sh 58a3bdf`: 176 errors on the baseline,
  176 on the working tree, none introduced.
- The landmark rows re-measured independently of the other session's numbers.
  Its eye figure (470) and nose figure agree; its collar figure (601) does not.
- **Not checked:** anything requiring a rendered frame — filtering, the real
  on-screen size, the rise and drop in motion. No renderer here.

## Where this leaves the repository

- **Landed:** `e07b6bc` on `main`. `peakVisible` untouched at 0.60.
- **Waiting on you:** confirm the two crops read as a dog to you. If your 82px
  really was measured on a build with `peakVisible` 0.60, then my whole reading
  is wrong and the number you want is about 0.80 — which the collar bound now
  rejects, so tell me and I will bring you the trade rather than just widen it.
- **Open, unchanged:** re-cut the sign art at ~270px wide. The build pad reads
  52 world px against painted stones of 46-70, with nothing in CI able to
  measure that — see `reports/2026-09-03-scatter-deleted.md`.
- **Still open, unchanged:** the 568x320 drawer grid lever; words on the
  drawer's tab bar, which needs `minUiSize` lowered from 15; the sign *text*
  alignment item from the withdrawn message.
- **Noted, not acted on:** `CHANGELOG.md` has not been updated since
  `043923e`, about twenty deployed commits ago.
- **Longer-standing, unchanged:** 18 trait phrases await approval; towers 0.91x
  the lane against a ~1.2x intent; balance not re-tuned for the v2 lane;
  `icon_confirm.png` and `assets/nodes` unreferenced; `checks` not a required
  status on PRs; `hud_peanut_icon.png` unwired.
