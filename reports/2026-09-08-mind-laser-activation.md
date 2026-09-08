# The Mind Laser arms like everything else

**Tap the medallion to arm, press and hold the board to fire.** The drag is
gone, and so is the line of text that existed to explain it. Everything past
the press — the beam following the finger, the chrome refusal, the release, the
budget, the cooldown — is byte-for-byte what it was.

| commit | what | CI |
|---|---|---|
| `b425f21` | Arm the Mind Laser with a tap, and fire it from the board | **green** — test + typecheck success (run 226); `deploy` skipped, which is correct off `main` |
| `6f76749` | Say nothing when the beam is armed, and let the picture say it | **green** — test + typecheck success (run 227) |
| `b40f037` | this report, markdown only | **green** — test + typecheck success (run 228) |

**`main` is `b99e413`. This work is on `claude/mind-laser-activation-b7lzrh`,
two commits ahead, zero behind — a fast-forward.** Merge command at the bottom
and at the top of the reply this report came with.

---

## 1. What changed

### The interaction

`castHeroSlot` had three branches — `targeted`, `held`, `instant`. It has two
now: `targeted || held` share one arming branch, and `instant` is unchanged.

```ts
if (a.activation === 'targeted' || a.activation === 'held') {
  const armed = this.targeting.arm({ kind: 'power', id: slot })
  if (armed === 'toggled') { this.clearSelection('toggle'); play(this, 'click'); return }
  ...
}
```

That single line is most of the change. Everything the armed state consists of
— the medallion glow, the CANCEL button, the disc round the hero, the
`targeting` input gate, the toggle-off — is derived from `targeting.request`,
so putting the held ability into the same request gets all of it at once and
there is no second implementation to drift.

The trigger moved from the medallion press to the **board** press. A targeted
ability commits on the release, through `onClick`, because a tap has nothing to
say between its two halves. A held one does — the beam is live for as long as
the finger is down — so it commits on the press, through a new
`pressArmedHold`, wired into GameScene's own `pointerdown`. The release was
already wired: HudScene's scene-level `pointerup` calls `releaseHeldAbility`.

`pressArmedHold` does four things and nothing else:

1. Returns immediately if nothing held is armed. **The ability cannot fire
   without being armed first.**
2. If the press is not on the board, disarms — free — *unless* it landed on the
   ability row. That exception is not cosmetic: HudScene's InputPlugin runs
   before GameScene's, so by the time the world hears a press on a medallion
   the medallion has already toggled or re-armed, and disarming here would undo
   it. Verified in the harness: `medallion at 583,348  inside the ability
   row=true`.
3. Re-asks `powerRefusal`. Arming spends nothing and takes no time off the
   clock, so the gate that passed at the medallion can have closed before the
   press — the hero goes down, is healed back out of his powered form, or (by
   arming a second time during a live beam) puts the ability on cooldown. One
   re-check closes all three. Without it, arming during a live beam and
   pressing after the release was a free beam with no cooldown check.
4. Resolves the request (`resolveTap(true)`), starts the beam, and hands the
   pressed point straight to `aimHeldAbility` — the only thing allowed to write
   an aim, and still free to refuse the point if it turns out to be over chrome.

Two supporting changes, both consequences of the press now belonging to the
board rather than to a button:

- **The camera rig claims the pointer while a held ability is armed.**
  `claims: (p, over) => this.armedHold !== null || this.chromeUnderPointer(p, over)`.
  Without it the drag that aims the beam is also a pan, and the map slides out
  from under the aim. It is claimed at the press, once per pointer, which is
  what stops that finger becoming half of a pinch while still leaving the rig
  live for a second finger.
- **`pressFiredBeam`** stops the release that ends the beam from also landing
  on the board as a tap. Letting go over a build pad would otherwise open the
  drawer on it.

### How arming is shown to the player

**Exactly the two things Mind Control uses, and nothing else.**

1. **The medallion highlights.** `TargetingMode.pendingAbility` returns the id
   for any `kind !== 'rally'` request, and the bar draws its glow from it. That
   already covered hero powers; the laser gets it by being one. Visible in
   `courtland-2-laser-armed.png`: the third medallion carries a bright ring the
   other two do not.
2. **A disc round the hero, in the hero's own colour**, painted by the same
   four lines of `drawTargetArea` that paint Mind Control's. One change there:
   the radius is `skillReach(p)` rather than `p.castRadius`. Mind Control is
   unaffected — `skillReach` returns `castRadius` for a targeted ability — and
   the laser gets its 520px reach instead of a circle of radius zero.

The disc means *how far the beam goes*, not *where you may press*: a beam is
`range` long whichever way it is pointed, the press names a direction, and a
press past the edge still fires. That is stated in the comment at the call
site. It is the one place the two abilities' discs differ in meaning, and the
alternative — a second visual language for one ability — is worse.

### The text

`"${a.name}: drag to aim, let go to stop."` is gone, and **nothing replaced
it.** The first attempt did replace it, with a line naming the way out the way
Mind Control's does. The rendered frame killed that:

> Mind Laser: hold on the board. Tap the medallion again, or CANCEL, to back
> out.

was still on the glass, wrapped over two lines above the ability bar, **while
the beam was firing** — telling the player to do the thing they were already
doing. See commit `6f76749`.

The two lines are not the same kind of thing. Mind Control's names a
**legality**: `castRadius` can refuse a tap, so "tap inside the ring" says
something the picture cannot. A beam has no boundary, so the only thing a line
could say is how to work the button — which is the string that was removed and
the signal that the button is wrong.

### What was NOT changed

- Mind Control, and every other ability. `powerart` re-cast all ten hero
  abilities and every one drew its own art.
- `holdSeconds`, `damage`, `range`, `beamWidth`, `tickSeconds`, `cooldown` — no
  edit to `heroes.json` at all.
- `updateHeldBeam` in full: the `onBoard` gate, `h.left`, `h.fired`, the damage
  tick, the corridor test, the interrupt re-checks.
- `endHeldAbility`, and the rule that the cooldown starts there and only when
  the beam fired.
- The facing-direction beam drawn before a board aim arrives, and the comment
  explaining it. It is one frame long in the common path now — `pressArmedHold`
  hands `aimHeldAbility` a board point immediately — but `aimHeldAbility` is
  still free to refuse that point, and a beam with no legal aim yet still has
  to point somewhere. The comment says that rather than pretending the old
  reasoning still reads unchanged.

## 2. Verification

### Which checks came from rendered frames

**Two, and only two.** Both from `tools/harness/shots/` at 844x390, DPR 3
(2532x1170 canvas):

- `courtland-2-laser-armed.png` — the armed state. The third medallion's ring,
  and the disc's edge crossing the map on the hero's right. This is the frame
  that says the armed state *reads*; the numbers can only say a disc was
  painted.
- `courtland-3-laser-sustain.png` — the beam firing, **with no text over the
  board.** This is the frame that killed the replacement toast, and then the
  frame that confirmed it was gone.

Reproduce:

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh courtland 240 844x390
python3 tools/harness/shrink.py tools/harness/shots/courtland-2-laser-armed.png 950
```

Screenshots are not committed — `tools/harness/shots/` is gitignored, and the
command above is the reproduction.

### Which did not

Everything else is a number or a state read out of the live scene. The
`courtland` scenario is **not** one of the nine that are known not to assert;
it fails on its own faults and did, repeatedly, during this work.

Driven through real pointer events — `mousedown`, `mousemove`, `mouseup`
dispatched on the canvas — at **844x390, 667x375 and 1280x720**. All three:
`RESULT Courtland's three behave as specified`.

| the brief's test | what the run printed (844x390) |
|---|---|
| tapping the medallion arms and spends nothing | `armed=true  pendingAbility=heroSlot3  mode=targeting  beam lit=false  cooldown ready=true` |
| …and the armed state is drawn | `targetArea draw commands=27` |
| tapping twice disarms with nothing spent | `armed=false  beam lit=false  cooldown ready=true` |
| it cannot fire without being armed | `pressed the board with nothing armed: beam lit=false` |
| arm, tap outside the board → disarm, nothing spent | `armed, then tapped the counters: armed=false  beam lit=false  cooldown ready=true` |
| arm, press the board → fires, disarms | `beam lit=true  onBoard=true  armed still=false  mode=normal` |
| …aimed at what was pressed | `pressed 434,384: aim=434,383  angle off by 0.00 deg` |
| …follows the finger | `dragged to 715,499: aim=714,498  angle off by 0.17 deg` |
| …and the map holds still | `the map moved 0.0px under the aiming drag` |
| …and it damages what it is held on | `held on a walking enemy: 66 -> -18 (alive=false)` |
| …spends only the held time | `budget spent while held: 0.68s of 10s` |
| a sample on chrome is refused, not clamped | `dragged over the counters: aim held at 258,248 = true` |
| release stops it, then the cooldown starts | `after mouseup: beam lit=false  cooldown ready=false` |
| …and the release is not also a board tap | `mode=normal` |
| a beam that fired nothing spends nothing | `a press with fired=false: cooldown ready=true` |
| the budget ends it on its own | `with the budget wound to 0.05s: beam lit=false` |

Angles at the other two viewports: 0.35°/0.26° at 667x375, 0.01°/0.01° at
1280x720. The residual is the enemy walking between the `worldToScreen` and the
event, not the aim.

Two of those are poked rather than gestured, and are labelled so in the
scenario: `fired = false` and `left = 0.05`. A real `mousedown`/`mouseup` pair
cannot be guaranteed to fall inside one frame, and holding a beam for its full
ten seconds tests `sleep`. What they drive is the branch, which is the rule the
whole ability rests on.

Also run:

- `npm test` — **994 tests, 994 pass.** Four test files touched:
  `heropowers.test.ts` gains the arming contract, `heroes.test.ts` and
  `uichrome.test.ts` had assertions that named the old shape,
  and nothing else moved.
- `sh tools/tsdiff.sh b99e413` — baseline 211 distinct errors, working tree
  211, **nothing introduced.** (`npm install` still 403s in this environment;
  `tsc` on its own is noise. CI's own `npx tsc --noEmit` is green on both
  commits, which is the real answer.)
- `powerart` at 844x390 — `RESULT every hero ability drew its own art`. This
  scenario drove the held ability by calling `castHeroSlot` and reading
  `G.held`, which now arms rather than fires; it presses the board with a real
  pointer instead.

### Not checked

- **Touch.** The harness synthesises mouse events only. The board press is
  delivered through the same `pointerdown` every tap-to-build in the game
  already uses, so a touch that failed to deliver it would have broken tower
  building long ago — but that is an inference, not a measurement.
- **Two fingers during a beam.** The rig claims the firing pointer at its
  press; a second finger arriving mid-beam still finds a live rig, by design.
  Not driven.
- **The `screens` layout sweep.** No HUD rectangle moved and no new chrome was
  added — the two visible changes are a disc in world space and a toast that
  was deleted — so the frames above are the check that applies. `screens` was
  not re-run.

## 3. Two harness faults that looked exactly like product bugs

Both cost a round, and both are the failure mode CLAUDE.md warns about: *do not
trust a first red result.*

**1. A bare synthetic `mousedown` is never dispatched to the scene.** Pressing
the board with the ability armed did nothing — no beam, no disarm, which is a
combination the new code cannot produce. A sentinel written into
`pressTakenByUi` before the press survived it: GameScene's `pointerdown`
handler had not run at all. Adding a `mousemove` to the same point first fixed
it. `click()` has always moved first, which is why no other scenario ever hit
this and why it read as a product bug. The scenario has a `press()` helper now,
documented, that moves first for the same reason.

**2. Asserting the aim against a walking enemy measures the wave's speed.** The
aim was reported ~10° off on three viewports out of four — consistent,
reproducible, and exactly what a real aiming error looks like. `press()` moves
the pointer and waits a beat before the button goes down, and an enemy covers
ten degrees of arc from the hero in that time. The aim is now checked against a
**stationary** point on the lane (0.00°–0.35°), and the enemy is tracked
separately with the finger following it, which is what a player does with a
beam anyway.

A third, cheaper one: a duplicate `const cn` inside one scenario block is a
`SyntaxError` that takes the whole harness module down, and the run reports as
a scenario that printed nothing rather than as a broken file. Worth a
`node --check` on the extracted `<script type="module">` before a run; not
added to the repo this session.

## 4. Where this leaves the repository

**Done and green, on a branch.** `claude/mind-laser-activation-b7lzrh` is
`b425f21` + `6f76749`, both CI-green, fast-forwardable onto `main` (`b99e413`).
Nothing here is in the game until it is merged.

```bash
git checkout main && git merge --ff-only claude/mind-laser-activation-b7lzrh && git push origin main
```

**Open, and carried forward from `2026-09-08-merge-and-branch-audit.md`:**

1. **`claude/mind-laser-glacier-fixes-ne2f14` is still unmerged**, 4 ahead and
   now further behind, conflict-free but not a fast-forward. It touches the
   same ability. Whoever merges this branch should look at that one in the same
   sitting, or it will keep drifting.
2. Five branches are fully contained in `main` and could be deleted.
3. **From `2026-09-08-the-crash.md`, unchanged:** the 56.6 MB world-map
   TileSprite, `map_level5.webp` at half the resolution of the other four,
   124.7 MB of level-only art still loaded at boot, and the absent web app
   manifest.
4. **The iPhone crash report** is still the thing to wait for — the
   diagnostics are live on `main` now, and no report has come back from a build
   that has them.

**Not blocked on anything.** Nothing in this change waits on a decision; it
waits on a merge.
