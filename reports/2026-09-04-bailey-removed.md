# Bailey removed: she was cropped, not occluded

2026-09-04.

| | commit | CI |
|---|---|---|
| Remove the Bailey peeking easter egg | `79bb450` | green — Checks passed on both the push and the pull_request event |

Open as **[PR #3](https://github.com/cperry0360-create/JebusGames-Project-1/pull/3)**,
not merged. `checks.yml` is `branches-ignore: [main]`, so a branch is the only
way this gets CI at all.

---

## The diagnosis, and why three rounds of tuning could not have worked

The map is **one painted plate**, a single `add.image` at `GROUND_DEPTH`. Every
sprite on the board is above every painted leaf on it, by construction. There
is no foliage object, so there is nothing to sort behind.

What stood in for occlusion was this, in `Bailey.update`:

    g.fillRect(s.x - this.worldHeight, s.canopyY - this.worldHeight * 2,
      this.worldHeight * 2, this.worldHeight * 2)

A **rectangle**. Her geometry mask keeps everything above `canopyY` and drops
everything below it, so what the player sees is a straight horizontal cut
across her sprite — a crop, sitting on top of the tree line.

`peakVisible` moves that cut up and down her body. That is the only thing it
does. So the amount showing was the only variable, and the amount was never the
fault:

| | value | what it showed |
|---|---|---|
| original | 0.5 | eyes cut in half — "a severed sprite" |
| `46d2b1f` | 0.33 | ears and a sliver of forehead, eyes under the line |
| `c4ff6b0` | 0.60 | eyes clear, cut across the muzzle |

Three settings, three reports, and all three were answering the wrong question.
0.60 is genuinely the best crop available — it is the midpoint of the band
between her eyes and her collar, which I measured yesterday — and a best crop
is still a crop.

**This is the same wall as the scatter props.** That system drew rocks over the
painted tree line and was deleted three commits ago for the same reason: the
plate is one image and nothing on the map can go behind it. The scatter met the
wall by putting props where they did not belong; Bailey met it by needing to be
behind something and settling for being cut. Both are `GROUND_DEPTH` being the
floor.

## What was removed

| | |
|---|---|
| `src/data/map.json` | `baileySpots` |
| `src/data/presentation.json` | the whole `bailey` block |
| `src/types.ts` | `baileySpots` on `MapDef`, `baileyPeek` on the prop roles |
| `src/data/art.json` | `prop-bailey-peek` from `files`, `prop` and `optional` |
| `src/systems/Art.ts` | `ART.prop.baileyPeek` |
| `src/scenes/GameScene.ts` | import, field, placement, shutdown hook, update call |
| deleted | `src/entities/Bailey.ts`, `src/systems/PeekSchedule.ts`, `tests/bailey.test.ts` |
| `tools/harness/` | the `bailey` scenario (95 lines), `P_BAILEY`, the `BAILEY=` switch |
| `tests/boot.test.ts` | her optional-art family |

**Two things went beyond the list I was given, both to avoid leaving orphans.**

*The whole `presentation.bailey` block, not just `peakVisible` and its notes.*
The instruction named `peakVisible`; the block also held `minGapMs`, `maxGapMs`,
`riseMs`, `holdMs`, `dropMs` and `worldHeight`, none of which anything else
reads. Leaving them is dead config of exactly the kind this repo keeps taking
back out — `scatterExclude` and the `ambient` block are the two most recent.

*Her family in `boot.test.ts`.* That test asserts every key on the `optional`
list belongs to a named family with a checked fallback, **and that no family is
an orphan**. Removing her key while leaving `{ match: /^prop-bailey-peek$/ }`
behind would have left a rule about nothing — and it also asserted
`src/entities/Bailey.ts` contains a texture check, against a file that no longer
exists, so it would have gone red.

## What was kept, deliberately

`public/assets/props/prop_bailey_peek.png` stays where it is, now unreferenced
by `art.json`. Nothing loads it; it still ships, because `public/` is copied
verbatim into the deploy. That is a deliberate exception to the rule that took
14 scatter PNGs out three commits ago, and the README says so, so nobody
"tidies" it later.

## What it would need to come back

The canopy drawn **in front of her**, as a separate overlay: the painted
foliage at each spot cut out of the plate as its own sprite, drawn above her
rather than below. Then

- her bottom edge follows the leaves instead of a horizontal line,
- `canopyY` becomes the overlay's depth rather than a cut,
- `peakVisible` becomes a real question rather than a choice of crop.

That is a plate-authoring job as much as a code one. Recorded in
`src/data/README.md` rather than only here, because that is where someone would
look before re-adding her.

## Checked

- **599 tests pass**, from 611 on `main`.
- `sh tools/tsdiff.sh origin/main`: **175** distinct errors against a baseline
  of **176**. One *fewer* — `Bailey.ts`'s own `phaser` cascade going away — and
  none introduced.
- Every JSON file re-parsed after editing. Three of the four edits removed the
  last key of an object or array, so three trailing commas had to go with them;
  `art.json` was invalid in between and the parse caught it.
- **Not checked: the board in a rendered frame.** The harness cannot run here —
  `npm` returns 403 for `phaser` and the CDNs are refused by the proxy, both
  tried again today. `realboot` is the scenario to run before merging.

## Where this leaves the repository

- **In flight:** PR #3, CI green, awaiting your merge. Not merged — you asked for a PR, so that call is yours.
- **Waiting on you:** whether to run `tools/harness/run.sh realboot` before
  merging, since nothing here has been seen rendering.
- **Open, unchanged:** re-cut the sign art at ~270px wide. The build pad reads
  52 world px against painted stones of 46-70, with nothing in CI able to
  measure it — `reports/2026-09-03-scatter-deleted.md`.
- **New, not mine to act on:** `c64737a` uploaded `map_level2.webp` and
  `level2_path_overlay.png`. The overlay is **1.99MB** and unreferenced, and
  the deploy-size guard has failed on an unreferenced upload twice before
  (`d7b42bb`, and the 12.6MB plate its comment records). Worth a look before it
  turns `main` red.
- **Still open, unchanged:** the 568x320 drawer grid lever; words on the
  drawer's tab bar, which needs `minUiSize` lowered from 15; the sign *text*
  alignment item.
- **Noted, not acted on:** `CHANGELOG.md` has not been updated since `043923e`.
- **Longer-standing, unchanged:** 18 trait phrases await approval; towers 0.91x
  the lane against a ~1.2x intent; balance not re-tuned for the v2 lane;
  `icon_confirm.png` and `assets/nodes` unreferenced; `checks` not a required
  status on PRs; `hud_peanut_icon.png` unwired.
