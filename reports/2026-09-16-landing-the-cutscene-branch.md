# Landing the cutscene branch on main

The brief was one line:

```
git checkout main && git merge --ff-only claude/cutscene-reorganization-wiring-t8o0vm && git push origin main
```

**It could not run as written, and the first reason it failed was not the real
one.** Both reasons are worth writing down: one is a property of this branch on
this day, and the other is a property of every session that starts in a fresh
container and will mislead the next one exactly as it misled this one.

The work is on `main` now.

## Commits

| commit | what | CI |
| --- | --- | --- |
| `de21b11` | Merge the cutscene reorganisation into main's line | run 416 — green (changes, typecheck, test) |
| `37158fd` | Merge main: the guaranteed dummy tower and the re-soak | run 421 — green (changes, typecheck, test) |
| `f463197` | Merge main: the closed CI tables for runs 415 and 417 | reports only; covered by run 423 |
| `02f6fff` | This report, the context note and the CLAUDE.md standing fact | run 423 on `main` — green on **all five** jobs |
| `c3ff5aa` | Close the CI table on run 423 | run 425 on `main` — green on changes, typecheck and test, deploy correctly **skipped** |
| `<this row>` | Record run 425 and close the table | `reports/` only, so the same three jobs and no deploy |

**Run 423 ran the deploy rather than skipping it**, because the push touches
`src/` and `public/`: `changes`, `typecheck`, `test`, `deploy / build` and
`deploy / deploy` all green, `actions/deploy-pages@v4` completing at 12:14:33Z.
The live site carries the comics. Read the job list, not the conclusion — a
green run with `deploy` skipped would have meant something different, and runs
425 onward are exactly that: three jobs and no deploy, because they touch only
`reports/`.

`main` was fast-forwarded onto `02f6fff`, so `main` and
`claude/cutscene-reorganization-wiring-m5f94i` are the same commit.

**A second thing about CI worth knowing, because it cost this session an hour
of waiting for nothing.** The Actions REST API lagged badly on run 423: it
reported `test` stuck on `npm install` and then `deploy / build` stuck on
`npm run build`, for something like fifty minutes after both had finished. The
job *logs* told the truth immediately — `get_job_logs` on the "hung" test job
returned `tests 1187 / pass 1187 / fail 0` and a completed post-job cleanup,
timestamped 12:13:19Z, while the job list still called it `in_progress`. The
whole run was over at 12:14:33Z. **When a job looks hung, read its log before
believing the status**, and do not re-run or cancel on the strength of a
`status` field alone.

## Why `--ff-only` could not work

`claude/cutscene-reorganization-wiring-t8o0vm` forked at `fe6ec82`. By the time
the brief arrived, `main` had moved **eleven commits** past that point — level
9's flank repaint and retune, Lazy Dad Mode, the PNG writer's row filter and
four report commits — and it moved **six more** while this session was working:
the guaranteed Ima Dummy Tower, its re-soak, and their CI tables.

A fast-forward asks git to move `main` to a commit that already contains it.
That was never true here, so the merge was always going to be a real merge with
real conflicts. The brief's command is the right instinct — a fast-forward is
the merge that cannot surprise you — and the answer to it failing is to make the
branch contain `main`, verify the result, and *then* fast-forward. Which is what
main's own history already does: `0e9b0a1`, `2a115d2` and `cb9fadf` are all
`Merge main: ...` commits made on a branch before `main` was moved onto it.

## The finding worth keeping: the container's clone is SHALLOW

The first thing the brief's command actually printed was not "not possible to
fast-forward". It was:

```
fatal: refusing to merge unrelated histories
```

along with a claim that `main` and `origin/main` **have 97 and 60 different
commits each**. Neither of those things is true of this repository. Both are
artefacts of the clone:

```
$ git rev-parse --is-shallow-repository
true
$ cat .git/shallow
6c309b4af49e51b46a0cbea2b896e33091283820
9e21dfae9dc84326950b711ae1de987926b1c0c5
```

A shallow clone has **grafted roots**. `git merge-base` walks back, hits a graft
and stops, so two branches that share an ancestor below the graft look like two
separate projects. `main` and `origin/main` reported *no common ancestor* and
different root commits — one of which, `6c309b4`, is also the tip of
`claude/level-9-geometry-uac8ax`, which is the tell: a root commit that is
simultaneously a live branch head is not a root commit.

**The fix is one command and it is not `--allow-unrelated-histories`:**

```bash
git fetch --unshallow origin
```

After it, `main` was simply 84 behind `origin/main`, every merge base resolved,
and the real answer — "not possible to fast-forward" — appeared.

This matters because the two failure modes read completely differently and the
wrong one invites a destructive fix. "Unrelated histories" looks like the
repository is broken or the branch was cut from a different project, and the
obvious-looking remedies — `--allow-unrelated-histories`, re-cloning over the
working tree, resetting `main` to the remote — range from noise to damage. The
honest diagnosis is that **the clone cannot see far enough back yet**. Check
`git rev-parse --is-shallow-repository` before believing anything git says about
ancestry in a fresh session.

## Three merges, four conflicts

### 1. `de21b11` — the cutscene branch into `main` at `f3d597d`

One conflict, `tools/harness/index.html`.

Both sides added a scenario in the same place, immediately after the
`difficulty` block: `main` added `lazydad` and the branch added `midwave`.
Neither touched the other's lines — git saw two insertions at one point and
could not order them. The two blocks also *shared* the trailing `return` / `}`
that sits below the conflict, which is the part that makes a careless resolution
compile and then behave wrongly: taking both halves verbatim leaves the first
block unclosed.

Resolved by keeping both, `lazydad` first, giving `lazydad` its own
`return` / `}` and leaving the shared tail to close `midwave`.

### 2. `37158fd` — `main` at `cd095ca` back into the branch

`main` moved while run 416 was still going. Two conflicts, both additive.

**`tools/harness/index.html`, the `USES_EXPECT` set.** Each side added its own
new scenario name — `midwave` here, `guaranteed` there. The resolution is the
union. This one is worth naming because a scenario missing from that set is not
a silent no-op: it is held to `RESULT *** n ***` instead of to an assertion
counter, so dropping either name would have quietly changed how its scenario is
judged.

**`src/scenes/GameScene.ts`.** The branch inserted `queueMidWaveComic`,
`openDueComic` and `endMidWaveComic` directly above `grantTowerUnlocks`, and
`main` rewrote *that method's doc comment in place* — from a one-liner to the
paragraph explaining that the reserve index is measured off the opening hand's
length rather than off `towersAtStart`. One edit region, two unrelated changes.

Resolved by keeping all three new methods and taking **main's** comment: the
one-liner the branch carried is precisely the text main replaced. `git diff
origin/main -- src/scenes/GameScene.ts` afterwards shows `grantTowerUnlocks`
itself byte-identical to main's.

### 3. `f463197` — `main` at `40abbe0` back into the branch

No conflict. 23 lines into `reports/2026-09-16-dummy-tower-guaranteed.md` and
nothing under `src/`. Taken so the branch could be fast-forwarded onto rather
than merged into `main`.

## Verification, on the merged tree rather than on either side of it

**Tests: 1187 of 1187 pass.**

```bash
node --test 'tests/*.test.ts'
```

The one that mattered most here is `assets.test.ts`. This merge is the exact
shape CLAUDE.md's asset-sweep standing fact warns about — the branch `git mv`s
every comic under `art-source/cutscenes/` and publishes new WebPs, while `main`
moved independently — and a manifest key pointing at a file that moved is what
that test names. It stayed green throughout.

**Typecheck: green on CI, and the local tool is blind here.**

```bash
sh tools/tsdiff.sh cd095ca
# baseline cd095ca: 214 distinct errors; working tree: 215
# --- introduced by the working tree ---
# src/scenes/CutsceneScene.ts: error TS2339: Property 'events' does not exist on type 'CutsceneScene'.
```

That is the sandbox, not the code, and this is exactly the case CLAUDE.md's
typechecking section describes. `this.events` is a public `Phaser.Scene` member;
without `node_modules` the base class does not resolve, so every member access
on it reads as an error. The line is the branch's own, unchanged by any
resolution here, and `npx tsc --noEmit` passed on runs 416 and 421 with real
Phaser types. **Not something to "fix".**

**Harness: every scenario either side owns, at 844x390.**

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh midwave 200 844x390      # 54 checks, all passed
sh tools/harness/run.sh guaranteed 200 844x390   # no faults; 27 checks
sh tools/harness/run.sh lazydad 200 844x390      # normal unchanged, all five knobs moved
```

Running all three is the point rather than a formality: they are the only thing
in this repository that can tell whether the harness conflict was resolved
correctly, because no test imports Phaser and the file the conflict was in is
the harness itself.

**Screens: the merged tree is clean everywhere except one pre-existing fault.**

```bash
sh tools/harness/run.sh screens 140 667x375
sh tools/harness/run.sh screens 140 844x390
sh tools/harness/run.sh screens 140 1400x900
INSETS=0,47,21,47 sh tools/harness/run.sh screens 140 844x390
```

| viewport | Title | WorldMap | Loadout | Cutscene | Game |
| --- | --- | --- | --- | --- | --- |
| 667x375 | 1 | 0 | 0 | 0 | 0 |
| 844x390 | 1 | 0 | 0 | 0 | 0 |
| 844x390 + notch | 1 | 0 | 0 | 0 | 0 |
| 1400x900 | 0 | 0 | 0 | 0 | 0 |

The single fault is `SMALL Title [title:version-stamp (hidden dev door, not a
tap target)]`, and it is pre-existing rather than argued to be: **neither side
of this merge touches `src/scenes/TitleScene.ts`**, checked with `git diff
--stat fe6ec82 origin/main -- src/scenes/TitleScene.ts` and the same against the
branch, both empty.

The picture was read as well as the numbers. `screens-4-cutscene-1400x900.png`
shows level 1's opening panel at 1/3 with the SKIP control clear of it and
nothing cropped — which is the screen this whole branch exists to change, so a
green counter alone would not have been enough.

**Soak: all ten levels, 480 seeds, identical to main's published figures.**

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  node --experimental-strip-types tools/soak/level.ts 480 level$i | head -1
done
```

```
405 218 422 328 343 83 133 146 119 117
```

Every one of those matches the `guaranteed` column `cd095ca` published, to the
run. That is the measurement, and there is also a reason it had to come out that
way: `tools/soak/` is byte-identical to main's, `Sim.ts` imports nothing from
`src/scenes/` and nothing from `Cutscenes.ts`, `MidWave.ts` or `StuckWatch.ts`
(the only mentions of those names anywhere under `tools/soak/` are comments),
and every JSON the simulator reads is unchanged. The measurement and the
construction agree, which is the useful state to be in.

## What was NOT checked

- **Portrait is gated, not audited.** 375x667 and 390x844 get the rotate
  overlay, which is the correct answer for a landscape-only game.
- **No device.** Everything here is the headless harness at a set viewport. The
  iPhone crash is untouched by this work and none of it is evidence either way.
- **The mid-wave comics were not re-derived against the wave tables in this
  session.** `tests/midwave.test.ts` does that on every run and it is green; the
  branch's own report covers the derivation.
- **`tools/harness/run.sh difficulty` was not run.** It is red on `main` and was
  before this work — see the open item below — so running it here would have
  added a known red without moving it.
- **No soak on the non-normal modes** (`nobuild`, `supportonly`,
  `noabilities`). `tools/soak/run.ts` covers those; only the per-level normal
  driver was used, because that is the column `cd095ca` published and the one a
  comparison could be made against.

## Where this leaves the repository

**In flight: nothing from this session.** `main` and
`claude/cutscene-reorganization-wiring-m5f94i` point at the same commit,
`02f6fff`, green on all five jobs with the Pages deploy published.

**`claude/cutscene-reorganization-wiring-t8o0vm` is now fully contained in
`main`** and can be deleted whenever someone wants to tidy the branch list. It
was not deleted here — that is not what the brief asked for, and a stale branch
costs nothing.

**`main` is moving fast and this is worth knowing before starting a merge.** It
advanced seventeen commits across two other sessions during this one, twice
mid-CI, which turned one merge into three. None of it conflicted badly, but the
pattern to expect is: merge, push, watch CI, re-fetch, and be ready to do it
again rather than assuming the fast-forward will still be there.

**Open items carried forward, none of them touched here:**

- **`tools/harness/run.sh difficulty` is RED on `main`** and was before
  2026-09-16. Two faults, both from the same stale expectation: section 3 looks
  for the difficulty readout on the HUD, and the HUD deliberately stopped
  showing it. The second fault falls out of the first. The fix is a paired edit,
  because `difficulty.test.ts` asserts the scenario's current text in three
  places.
- **The soak's lifesteal has never fired.** `Sim.ts` calls
  `night.healFor(e as never, dealt)` and `SimEnemy` has no `maxHealth`, so
  `lifestealHeal` computes `NaN` and `healed > 0` rejects it silently. Level 5's
  vampires have drunk nothing in every published soak. Fixing it moves level 5's
  published win rate, so it is a retune rather than a bug fix and has been left
  alone deliberately.
- **No level is inside the 35–45% band any more**, following the guaranteed
  dummy tower. `cd095ca`'s message and
  `reports/2026-09-16-dummy-tower-guaranteed.md` carry the three columns and the
  control that separates the pool effect from the guarantee effect. Nothing was
  retuned there, and nothing was retuned here. Level 2 at 45.4% is the closest
  level to the band, 0.4 points above its top edge.
- **The HUD-versus-pads question is closed** on the third attempt and
  `claude/context.md` has the paragraph to read before anyone opens a fourth.

**Waiting on a decision: whether the band is re-entered by retuning or by
changing the guarantee.** That is a design call, it is now the largest open
question in `levels.json`'s balance, and no session should take it silently.
