# Spawn and exit badges, placed from lane geometry

| commit | what | CI |
|---|---|---|
| `9332930` | The four assets, `markers.json`, `systems/Markers.ts`, the renderer, two test surfaces | [run 345](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34779617034) green |
| `9994199` | This report | [run 345](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34779617034) green |
| *this commit* | Closing this table on run 345 | it edits this table and nothing else |
`e361efe`, `9332930` and `9994199` were pushed together, so only the head got a run of its own; run 345 checked the tree containing all three. Green on changes, typecheck and test; deploy is skipped on a branch.


---

## Created or extended?

**EXTENDED.** A level 9 session had already added a prop layer, and this uses it
rather than standing up a second one.

What was there: `MapDef.scenery`, `GameScene.buildScenery` and the `sceneryArt`
list, added when level 9 needed a Vlaude screen and three electrical arcs, and
written as the general form of the one-off that had placed level 1's tavern sign.
It adds an image or a sprite, y-sorts it and never looks at it again — nothing in
it has health, takes damage, blocks a shot or occupies a spot.

What this adds: `GameScene.buildLaneMarkers`, which pushes into the same
`sceneryArt` list and is torn down by the same code. Two layers that both mean
"world-positioned decoration" would be two places to remember on every shutdown,
and the restart leak that the HUD pass fixed in that exact list is the argument
against having a second.

**One difference from `buildScenery`, deliberately: markers are NOT y-sorted.**
`ySort` would put a badge at the bottom of the board in front of an enemy
standing above it, and a navigational label that occludes the thing it labels is
worse than no label. They sit at a fixed depth just above the ground layer and
below every entity.

Neither sprite is ever made interactive. There is no `setInteractive` call in
`buildLaneMarkers`, and the harness asserts `!sprite.input` on all 60 of them.

---

## Derived, not authored

`src/systems/Markers.ts` is Phaser-free and reads a level's own lanes:

- **A spawn badge** on the first waypoint of every lane that is an entrance.
- **An exit badge** on the last waypoint of every lane that merges into nothing.

No level names a marker. No coordinate is written down. Re-tracing a plate moves
them; a level 10 needs no line in the file.

### Two rules were wrong before they were right

Both were found by running the derivation over **every** level rather than over
level 1, and both are now written into the module.

**"A spawn is a lane nothing merges into" dropped level 6's second entrance.**
`lower` is an independent way in — it declares `entrance: true` and runs to its
own exit — *and* is fed by `flank`, the sneaky bottom-edge lane, at waypoint 23.
So it is both, and the single test silently drew two badges on a board with three
spawns. The rule is the pair `validateLanes` uses.

**Taking `entrance: true` at face value added a spawn that does not exist.**
`laneDefs` synthesises that flag onto whichever lane is main, unconditionally —
and on levels 3, 4 and 5 main is the shared **trunk** that the two arms merge
into, which starts in the middle of the board. Read literally it put a spawn
badge at **(733, 378)** on level 3, on the join. So the flag counts only on a
lane the map declared it on, and main falls back to the "nothing merges into it"
test.

### One deliberate departure from the brief

The brief says to place a spawn marker **at the lane's first waypoint**. Placed
literally, **29 of the 30 markers fall outside the 1280x720 plate** — waypoints
run off the frame on purpose, because enemies walk in from off-screen, so a
lane's first point is typically `(-60, y)` and its last `(1340, y)`.

**The world camera is clamped to the plate horizontally**, so a badge at
`x = -60` is not merely off to one side: there is no camera position that shows
it. The whole layer would have been visible on exactly one marker in the game —
level 9's interior door, the only one already inside the plate.

So each badge is clamped into the plate by half its own width, which puts it just
inside the mouth it belongs to, about a road and a third in. **Only the position
moves.** The angle is still the lane's own heading at its own first or last
waypoint, so the arrows still point the way the walk actually goes, and `arrowAt`
measures from wherever the badge ended up.

---

## Markers per level

Derived, not counted by hand. 30 across nine levels.

| level | spawns | exits | what they are |
|---|---|---|---|
| level1 | 1 | 1 | |
| level2 | 1 | 1 | |
| level3 | 2 | 1 | two arms into one trunk — **no badge on the trunk** |
| level4 | 2 | 1 | |
| level5 | 3 | 1 | west mouth plus the top-edge and bottom-edge lanes |
| level6 | **3** | 2 | `upper`, `lower`, **and the `flank` spawn at the bottom edge** |
| level7 | **3** | **3** | three lanes, each with its own way in and out |
| level8 | 1 | 2 | one way in, two ways out |
| level9 | **1** | 1 | **two entrance lanes sharing one painted mouth → one badge**; the exit is the interior door at (1177, 329) |

**Level 6's third spawn and level 7's three lanes are both asserted by name**, in
`tests/markers.test.ts` and in the harness. **Level 9 is registered**, and both
its entrances and its interior exit are marked — the two arms come out of one
mouth and collapse to one badge, which is what `mergeWithin` is for; drawing two
exactly on top of each other reads as a rendering fault rather than as two ways
in.

---

## The numbers, and where they live

`src/data/markers.json`. Nothing is in code.

| key | value | why |
|---|---|---|
| `badgeScreenWidth` | 40 | **CSS pixels at default zoom**, which is the unit it was asked for in. The world width falls out of it — 40 / 1.72 = **23.3 world px** — exactly as `buildPad.quietScreenWidth` already does, so changing the zoom band cannot silently resize the badge. |
| `arrowOffset` | 0.736 | Of the badge's **rendered** width, so it survives a resize. |
| `alpha` | 1.0 | Ships un-muted on purpose: a prop that arrives already faded cannot be judged. It exists so the markers can be turned down later without a re-render. |
| `mergeWithin` | 1.0 | Badge widths. Level 9's two arms start at the same point; level 8's two exits are 437 px apart and keep their own. |

**Both sprites take one scale.** They were drawn together at one size, so the
badge's scale is the arrow's scale and the artist's proportion is not re-chosen —
which is what makes `arrowOffset: 0.736` reproduce the original render at
rotation 0. Not `fitInBox`, which fits a **square** by `min(box/w, box/h)` and
would draw the 400x441 badge 36 wide when asked for 40.

### `measure_art.py`, INK

| file | canvas | ink | contentWidth × contentHeight |
|---|---|---|---|
| `marker_spawn` | 400x441 | x0-399 y0-440 | **400 × 441** |
| `marker_spawn_arrow` | 158x169 | x0-157 y0-168 | **158 × 169** |
| `marker_exit` | 400x440 | x0-399 y0-439 | **400 × 440** |
| `marker_exit_arrow` | 158x169 | x0-157 y0-168 | **158 × 169** |

**The ink fills the canvas on all four** — there is no transparent margin — so
the two numbers coincide. That is a measurement, not an assumption, and it is
worth saying because the usual failure is the opposite: `hud-peanut` shipped
512x512 against a 498x400 painting and drew 3% small forever.

Converted at WebP q95 through `tools/towebp`: PSNR 36.0–42.8 dB, 0.11 MB for all
four, registered as `levelArt.shared` so boot queues none of it.

---

## Verified from rendered frames

`tools/harness/run.sh lanemarkers` — **228 checks across all nine levels**, run at
667x375, 844x390 and 1280x720, all passing. **None of the nine scenarios that
assert nothing was used.** (The name is `lanemarkers`, not `markers`: the harness
already had a `markers` scenario for the build-pad states, and the first
insertion was shadowed dead code that reported "reached none of its expect()
calls".)

Per level, against the live scene:

- **every derived marker has a badge and an arrow on the board** — counts
  compared, then each one matched by position
- **the badge is never rotated** (`rotation === 0` on all 30)
- **the badge is 23.3 world px wide**, i.e. 40 CSS px at default zoom
- **the arrow is rotated to the lane's heading**, to within 1e-6 radians
- **the arrow sits at `arrowAt`**, i.e. 0.736 badge widths along that heading
- **spawn arrows point into the board and exit arrows point out** — checked as a
  distance to the plate's centre rather than as a sign, so it cannot be satisfied
  by a flipped convention
- **every marker is below every entity** (`depth < 0`)
- **no marker is interactive**
- **no marker sits on a build pad** — nearest pad measured per marker per level

**One observation from the frames, not a fault.** At the camera the run opens on,
the badges render about 15 CSS px rather than 40. The run opens at **cover** zoom
(0.659 on a phone), not at default zoom (1.72), and 40 was specified at default
zoom — so this is the size that was asked for, seen through the opening framing.
A reset returns to default zoom and they come up to 40.

`npm run test`: 1099 passing, including the new `tests/markers.test.ts` (seven
tests). `sh tools/tsdiff.sh c6e75fb`: 213/213, zero introduced.

---

## Where this leaves the repository

**DONE.** Every way in and every way out of every registered level carries a
badge, derived from that level's own waypoints, drawn under the cast, taking no
taps.

**OPEN:**

1. **The badges are small at the opening zoom** — about 15 CSS px, because the
   run opens zoomed out. 40 at default zoom is what the brief specified and what
   shipped; if they want to read at the opening framing the number to move is
   `badgeScreenWidth`, and it is one line.
2. **`ART.prop` was re-typed from `ArtDef['prop']`** rather than a second inline
   list in `Art.ts`. That was a two-file change made into a three-file one every
   time a prop was added; it is one declaration now, but nothing stops the next
   block from re-listing its keys the same way.
3. **The clamp is a departure from "at the lane's first waypoint"** and is
   recorded as one. If the intent was genuinely the waypoint itself, the fix is
   not in this module: it is a horizontal camera bounds margin, the same lever
   the HUD pass added vertically.
