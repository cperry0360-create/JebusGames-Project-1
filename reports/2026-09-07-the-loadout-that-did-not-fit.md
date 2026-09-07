# The loadout screen that did not fit, and the two panels that leaked

| commit | what it is | CI |
|---|---|---|
| `4f23283` | Reflow the loadout instead of letting it run off a short viewport | **green** — [run 172](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34139333873) |
| `009933b` | This report | **green** — [run 174](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34139863646) |

Deployed: `deploy / build` and `deploy / deploy` ran and reported **success** inside
both runs — read off the job list, not inferred. This sandbox cannot reach
github.io (the egress proxy returns 403 by policy), so the served page is Cory's to
confirm. Tests **964 → 968**.

---

## The short version

Three faults were reported and only one of them was about fitting.

1. **The ability strip was drawn on the hero panel's border**, and
2. **the blurb ran into the strip.** Both are the same defect on two edges: bare
   text reaches this block's left and right edges, and `cardPad`'s nine units are
   *inside* the painted rail, because `frameInsetFor` is deliberately only a
   fraction of the frame. "Mind Control" lost its last letter; "Holds the line"
   lost the stem of its H.
3. **The screen ran off the top.** Answered by reflowing the hero block, not by
   scaling it. At the reported ratio the screen now fits with nothing left over.

| viewport | `main` before the branch (`d9dd7cf`) | branch head before this commit (`57ebc61`) | now (`4f23283`) |
|---|---|---|---|
| **904x400** (2.26:1, the ratio reported) | 56 | 122 | **0** |
| **1400x708** (desktop window) | 25 | 91 | **11** |
| **844x390** | 58 | 124 | **20** |
| **667x375** (375x667 phone, landscape) | 87 | 153 | **153** |

Numbers are the stack's `overflow` in design units — how much taller the content is
than the room it has after every section has been squeezed to its measured floor.
Zero means the whole screen is on screen. All four are measured off rendered frames
via `sh tools/harness/run.sh screens 120 <WxH>`.

---

## 1 and 2: the containment bugs

### What was actually wrong

`frameInsetFor(w, h)` is `panelInset(...) * LO.frameInsetShare`, and `frameInsetShare`
is 0.58 — a deliberate *fraction* of the painted nine-slice frame, so content is
allowed part-way into the rail. That is right for a tower card, whose last line is
text on a dark backing and never reaches the edge. It is wrong for the hero block,
where the two things at the block's edges are bare text on the plate:

- the **chip column** is the rightmost thing on the screen that is not a frame, and
  its width is a measured fit to the longest ability label on the roster — so the
  label ends exactly at the column's edge;
- the **blurb** starts at the block's left edge, first character on the boundary.

The bottom edge had the same defect and was already fixed on this branch in `c7e9d50`
by raising the clearance from `cardPad` (9) to `cardPadBottom` (27). The sides needed
the same number. The interesting part is **where the 27 is paid from**.

### Where the clearance comes from, which is the actual fix

Widening the block's padding costs `innerW`, and beside the row `innerW` is within a
few units of wrapping the five portraits onto two lines. Two attempts measured:

| what was tried | 904x400 | 1400x708 | 844x390 | 667x375 |
|---|---|---|---|---|
| both sides widened to 27 | 0 | 11 | **44** | **153** (block back to `under`, 247 tall) |
| right side only | 0 | 11 | **44** | 73 |
| description narrowed by the rail | **16** | 11 | 44 | 73 |
| **shift within the block** (shipped) | **0** | **11** | **20** | **73**\* |

\* 73 was the figure before the tap-floor rule below sent 667x375 back to `under`.

So the rule that shipped is arrangement-dependent, and `heroPlan` says so in a
comment: laid out **under** the row, the row has the whole block and five cards of
slack, so the block simply pads wider and everything inside it moves in together.
Laid out **beside** it, the block keeps `cardPad` and the *description* shifts inside
it — the chip column left by `railR`, the blurb right by `railL` — out of the gaps
rather than out of the row.

Narrowing the description instead of shifting it does not work: it reflows the blurb
onto another line, which makes the block taller, which costs the stack more than the
clearance is worth.

### The bug underneath both of them

Phaser's `wordWrap` measures the **unspaced** advance. `BODY_SPACING` adds
letterSpacing *after* the wrap, so a line wrapped at `w` renders wider than `w` by
roughly one letterSpacing per character. On a full-width card that is a few pixels
into the padding and invisible. Three places were measuring with the plain wrap and
drawing with the tightened one, or drawing with the plain wrap and overflowing:

- the card's **name, stats and body** — visible only once a card got narrow, where it
  became the tower's last line printed through the right rail and into the card
  beside it;
- `cardNeeds`, which measures a card's height — a line short on a narrow card;
- `blurbHeightAt`, which reserves the blurb's height — one line short, which is
  exactly why the blurb was drawn on the hero panel's bottom border at 1400x708.

All four now go through `wrapWithin`, which measures the rendered width and tightens
until it fits. `tests/loadout.test.ts` pins all four.

---

## 3: the screen that ran off the top

Not solved by scaling. The standing note in this repository is that a panel scaled to
fit a phone puts its buttons at about 24 CSS px and the answer is a shorter panel
rather than a smaller one; scaling this screen makes the tower stats and the ability
labels unreadable and trades one complaint for another.

### The hero block reflows, and picks its arrangement by solving all three

Three arrangements exist now, declared as `HeroLayout`:

- `under` — the description under the portrait row. The arrangement the screen has
  always had, and the one kept for tall narrow phones.
- `beside` — the whole description (blurb and chips) to the right of the row.
- `chips-beside` — only the chip column beside the row, blurb underneath at the
  block's width. The middle option, and the one 1400x708 uses.

They are not chosen from a rule about the viewport's shape. All three are solved and
the shortest **usable** one wins, where three things disqualify a candidate:

1. it has to be **needed** — a screen that already fits is not rearranged;
2. its portrait row has to stay on **one line** — `fitHeroRow` wraps to two rather
   than going below `minPortrait`, and two rows of cards beside a description is
   taller than one row above it, so the reflow would make the thing it was meant to
   fix worse;
3. **every hero card is a button**, so it owes the same 44 CSS pixels every other
   control owes.

Rule 3 is new here and it is the one worth keeping. `minPortrait` is a floor in
**design** units and the tap floor is a floor in **CSS pixels**, and on a short
viewport those are different numbers: at 667x375 `beside` produced a one-line row of
five cards at **43 CSS px**, one pixel under, and `minPortrait` cannot see it because
it was doing exactly what it was asked. A card that cannot be tapped is worse than a
screen that scrolls, so the arrangement loses and 667x375 goes back to `under`.

What each viewport chose (printed by `screens` now, so it can be read off any run):

| viewport | hero block | dealt rows | portrait rows |
|---|---|---|---|
| 904x400 | `beside` | stacked | 1 |
| 1400x708 | `chips-beside` | stacked | 1 |
| 844x390 | `beside` | stacked | 1 |
| 667x375 | `under` | stacked | 1 |

### TOWERS and SPECIALS stay stacked, and that is now measured

The brief asked for these side by side on wide viewports. Both readings were built and
measured, and **neither pays**, so the reflow declines — but it declines from numbers
that a later reader can re-check off a run rather than from an assertion.

| dealt arrangement | 904x400 | 1400x708 | 844x390 | 667x375 |
|---|---|---|---|---|
| one column, stacked (today) | 319 | 345 | 345 | 371 |
| two columns, cards **down** each | 325 | 343 | 343 | 377 |
| two columns, cards **across** each | 383 | 331 | 383 | 357 |

- **Down** is two cards deep, exactly as deep as stacked, so all it can buy is one
  heading while it pays a card gap and a slightly narrower card. Taller on three of
  four viewports.
- **Across** is one card deep and initially measured as a large saving (279 at
  904x400). That number was an artifact of the un-tightened wrap: once `cardFace` and
  `cardNeeds` wrapped honestly, the same arrangement came out at 383. The rendered
  frame agreed before the arithmetic did — at 184 units a card's stats line was
  printed straight out of the card and into its neighbour.

`useTwoColumns` therefore guards the **card**, not the column: `minDealtCard` (160)
replaces `minColumn` as the width that has to stay readable, because a 391-unit column
holds two 184-unit cards and it is the card the player reads a tower's stats off.
`minReflowSaving` (30) is what stops a 14-unit saving rearranging half a screen.

`cardRow`'s `down` path is deleted rather than left dormant — it had one caller and
the measurement says it should never have one again.

### What is left over, honestly

- **904x400 — the ratio reported — fits with nothing left over.** The instruction
  line, both run buttons, all five heroes, both towers and both specials are on
  screen.
- **1400x708 has 11 units left over and 844x390 has 20.** Both scroll; the visible
  cost is the bottom rail of the specials cards, and at 1400x708 GLACIER's card drops
  its last line ("20s cooldown") to `maxLines` rather than spilling.
- **667x375 has 153 units left over and this is not fixed.** A hero row, two towers,
  two specials, three headings and two buttons do not fit in 498 design units at a
  44pt tap floor, and no arrangement changes that: `beside` and `chips-beside` both
  put the hero cards under 44 CSS px there. It scrolls, which is the designed
  fallback (`installScroll`), and it scrolled before this branch too — 87 units on
  `main`. **It got worse, from 87 to 153, on this branch and not in this commit**:
  Courtland's third ability makes the chip column three deep for every hero (so the
  block does not change shape as the player moves along the row), and `cardPadBottom`
  raised every panel's bottom clearance from 9 to 27. Both were deliberate; the cost
  lands on the shortest viewport.
- With a **notch** (`INSETS=0,47,21,47`, 844x390) the screen fits with **0** left
  over, because the safe area narrows the visible design box and the room maps
  differently.

---

## Coverage: a general assertion, not a specific one

The brief's point was that this reached the live site through green CI, like the
missing ability art and the tower panel before it. So the check added is not about the
loadout.

`tools/harness/index.html` gains a **`contain` scenario** asserting two rules that do
not know which screen they are on:

1. **Nothing is outside the viewport.** Measured against the camera's visible world,
   with two carve-outs that are stated rather than assumed: a subtree the scene
   *scrolls* is asked "can it be reached", against the view widened by its scroll
   range (the level select's road is deliberately longer than the screen — without
   this it reported 24 false faults); and a backdrop is exempt only if it **covers**
   the view.
2. **No child is outside its parent panel.** A card's `face` container holds
   everything drawn on that card and `inner` is the panel it was drawn into. Deflated
   by the screen's own declared padding — `cardPad` / `cardPadBottom` — so the drawer
   and the check read the same number.

It also reports sibling collisions between leaves on one card, which is how problem 3
shows up as a number.

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh contain 120 904x400     # and 1400x708, 844x390, 667x375
```

Both the loadout (**once per hero**, because the heroes no longer describe the same
number of things and the three-chip case is the one that escaped) and the level select
are walked.

**It was proved to fail before it was trusted to pass**, twice:

- run against a worktree at the deployed commit, where the reported bug is visible, it
  reports it. An earlier version of the check passed there — the panel box it was
  comparing against included the frame — and was rewritten to use the screen's own
  declared padding, which caught it;
- during this session it caught a fault I had just introduced: shifting the blurb
  right by the left rail without giving the chip column its gap back put the two
  exactly edge to edge at 667x375, on every hero. Seven faults, from a change that
  looked obviously safe.

Two deliberate overlaps are declared in the product rather than exempted in the
harness — the tower price badge over the tower icon, and the hero selection tick — via
`.setData('overlaps', true)` beside the decision that makes them overlap.

`tests/harness.test.ts` pins the scenario's shape: both screens, both rules, and the
fault convention the server exits non-zero on. That is what stops it being deleted,
gutted, or quietly narrowed to one screen — the exact failure mode the `screens` audit
had when it stopped driving the tower panel and nobody noticed for weeks.

**The `contain` scenario does not run in CI.** CI is `npm test` and `tsc`; the harness
needs Chromium. What runs in CI is the source-shape half: the four `wrapWithin` sites,
the arrangement-dependent side clearance, the tap-floor disqualifier, and the
scenario's own shape. The rendered half is `sh tools/harness/run.sh contain`, and
CLAUDE.md already requires it of every UI change.

---

## Which checks came from rendered frames

**From rendered frames** (`tools/harness/`, Chromium, running the shipping source):

- `contain` at **904x400, 1400x708, 844x390 and 667x375** — clean at all four, exit 0,
  five heroes each on the loadout plus the level select.
- `screens` at the same four, plus **844x390 with a notch** (`INSETS=0,47,21,47`) — no
  OFF, no NOTCH, no OVER, and the only SMALL is the title screen's known version stamp
  (a hidden dev door, not a tap target, and pre-existing).
- The overflow figures in every table above, and the per-viewport arrangement choices.
- **Pictures read, not just numbers**: the 2.26:1 frame showing the instruction line
  and both buttons on screen; the 1400x708 hero panel cropped at the left rail before
  and after, which is the only way the clipped H was visible; the 904x400 Courtland
  card showing all three chips clear of the right rail; the two-column dealt row at
  184 units, where the arithmetic said the arrangement was 40 units shorter and the
  picture showed the tower's stats printed into the next card.

**Not from rendered frames:**

- The 44 CSS px floor is asserted by the `screens` audit's SMALL fault at the four
  viewports above; it was **not** re-measured by hand against a physical device.
- The deployed page. This sandbox cannot reach github.io — the egress proxy returns
  403 by policy — so the deploy is confirmed from the workflow's job list and the
  Pages job's own success, and the served result is Cory's to confirm.
- Portrait orientation is gated by the rotate overlay, not audited. That is the
  correct answer for portrait rather than a skipped check.
- Nothing outside the loadout and level-select screens changed, and `contain` is the
  only new check the other screens see (it does not walk them).

---

## Where this leaves the repository

**In flight:** nothing. `main` is `009933b`, runs 172 and 174 are green on all four
jobs each, and the Pages deploy ran and succeeded inside both. The working tree is
clean and `claude/transformation-courtland-rework-89vg83` points at the same commit.

**Open, carried forward:**

- **667x375 scrolls by 153 units.** Not a regression from this commit, but it is a
  regression from `main` before this branch (87), and the cause is known: Courtland's
  third ability chip and the raised bottom clearance. If it matters, the lever is the
  chip column — it reserves the roster's *longest* ability list for every hero so the
  block does not change shape as the player moves along the row, and relaxing that to
  the selected hero's own count would give ~36 units back to four heroes out of five,
  at the cost of the row jumping. That is a design call, not a bug fix.
- **1400x708 drops GLACIER's cooldown line** to `maxLines` when the specials card is
  squeezed. The card is doing the documented thing — clip the elastic part rather than
  spill onto whatever is drawn next — but losing a stat on a desktop window is worth a
  look.
- **`minColumn` (300) is now unused.** Kept in `presentation.json` with a note saying
  so, because the number is worth not losing if a future arrangement needs a band
  floor again.
- **The `contain` check does not run in CI**, as above. Making the harness run in CI
  is the general answer to "this reached the live site through green CI" and is not
  attempted here.
- Still open from the previous report and untouched by this one: the Phase 1 loop
  itself is not yet confirmed fun, which is the whole point of the phase.
