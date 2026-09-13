# Chapter 2 design docs land: four files, no code, nothing built

2026-09-13

**This is a documentation drop, verified — not an implementation.** Four
markdown files now sit in `claude/`, describing a second game ("Other Game", a
hero survivors-like) that shares Courjahan Defense's art library, hero kits and
enemy roster but drops tower placement entirely. **No game code, JSON data,
test or asset was touched by any commit in this report.** Chapter 2 remains
design-only: the highest-risk unknown — holding 45fps with 200 concurrent
enemies on a phone — is unproven, and the design names it as the kill criterion
before content is built on top.

## Commits

| commit | what | CI |
| --- | --- | --- |
| `c17e2f3` | `claude/chapter-2-design.md`, `claude/chapter-2-art-rules.md` (hand upload) | run 335: **green** (`npm test` pass, `npx tsc --noEmit` pass, deploy skipped: docs only) |
| `5084b89` | `claude/context.md`, `claude/level-art-segment-rules.md` (hand upload) | run 336: **green** (`npm test` pass, `npx tsc --noEmit` pass, deploy skipped: docs only) |
| `7ebd04b` | This report | run 340: **green** (`npm test` pass, `npx tsc --noEmit` pass, deploy skipped: docs only) |

Branch: none. All commits are on `main`. `5084b89` is `origin/main` at the
time of verification.

Both uploads are the repository owner's, made through the GitHub web UI. This
session wrote only the report.

---

## 1. What this session was asked to do, and what changed under it

The original brief was to add a "Chapter 2 / Other Game" section to
`claude/context.md`, immediately after its "Level 6" section.

**`claude/context.md` did not exist.** Not in the working tree, not on `main`,
not in any branch, and never in the history of the repository —
`git log --all --diff-filter=A` returned nothing for that path. The upload
commit `c17e2f3` had added exactly two files, and `context.md` was not among
them. No other document in the repository carried a "Level 6" section or the
numbered open-items list the design doc cites, so there was nothing to insert
against and nothing to reconstruct the numbering from.

The brief was then revised: `context.md` and `level-art-segment-rules.md` were
uploaded as `5084b89`, **with the Chapter 2 section already written and already
in place**, and this session's job became verification plus this report.

**So no edit was made to `claude/context.md` by this session.** The section
described in the original brief exists because the owner wrote it, not because
it was added here.

## 2. The four files

| file | size | added by |
| --- | --- | --- |
| `claude/context.md` | 15,760 B | `5084b89` |
| `claude/level-art-segment-rules.md` | 4,460 B | `5084b89` |
| `claude/chapter-2-design.md` | 10,848 B | `c17e2f3` |
| `claude/chapter-2-art-rules.md` | 2,626 B | `c17e2f3` |

All four confirmed present on `main`.

## 3. The Chapter 2 section is where it was meant to go

`claude/context.md` heading order, by line:

```
211:## Level 6
216:## Chapter 2 / Other Game (designed, nothing built)
226:## Status as of 2026-09-07 morning
```

Nothing sits between the Level 6 section and the Chapter 2 section. Placement
is as specified. The section names the survivors-like, the hidden-until-story-
level-10 unlock and its own entry point, the comic library over existing comic
art, both design documents by path, and the 45fps-at-200-enemies risk. It does
not restate the design.

## 4. Cross-references — all resolve

| citation | in | target | resolves |
| --- | --- | --- | --- |
| open item 9 in `claude/context.md` | `chapter-2-design.md:34` | item 9: "The world map shows 20 slots while scope is 10 story levels" | **yes**, and the design doc's paraphrase ("20 slots against a scope of 10 story levels") matches the item verbatim in substance |
| open item 4 in the context doc | `chapter-2-design.md:109` | item 4: "`fx_mind_control` has art and no mechanic" | **yes**; the design doc proposes Mind Control as one of Courtland's two buttons, which is a mechanic for that art |
| `level-art-segment-rules.md` | `chapter-2-art-rules.md:3` | `claude/level-art-segment-rules.md` | **yes**, as a bare filename resolved relative to the citing file's own directory, which is `claude/` |
| `claude/chapter-2-design.md`, `claude/chapter-2-art-rules.md` | `context.md:222` | both files | **yes** |

**One correction to the brief.** The `level-art-segment-rules.md` citation is
in `chapter-2-art-rules.md`, line 3 ("Companion to `level-art-segment-rules.md`"),
**not** in `chapter-2-design.md`. The design doc cites only `context.md`, twice.
A repository-wide grep for the string returns exactly one hit. The reference
resolves either way; only its location differs from the brief.

Two premises behind the cited open items were also spot-checked, since a
citation resolving to an item that is itself stale would be worth knowing:

- `public/assets/effects/fx_mind_control.webp` exists, so item 4's "has art"
  half holds.
- `tools/measure_art.py`, which `chapter-2-art-rules.md` instructs a future
  session to run after export, exists.

## 5. CI

**Green on both upload commits**, at job level rather than workflow level —
`CLAUDE.md` warns that the two checks used to be steps in one job where a
failing test meant the typechecker never ran, and the point of reading jobs is
that this cannot hide.

Run 336 (`5084b89`, the current tip):

| job | conclusion |
| --- | --- |
| `test` — `npm test` | success |
| `typecheck` — `npx tsc --noEmit` | success |
| `changes` | success |
| `deploy` | **skipped** |

Run 335 (`c17e2f3`): workflow conclusion success.

**The skipped deploy is correct, not a fault.** `.github/workflows/checks.yml`
gates the Pages publish behind a `changes` job that diffs the push and sets
`code=false` when every changed file is a `.md` or under `reports/`. Both
uploads are markdown only, so Pages keeps serving the build it already has. The
game on the site is unchanged, which is the intended outcome for a docs commit.
This report will skip the deploy for the same reason.

## 6. Method note: the container's local `main` was stale

Worth recording because the next session in a fresh container will hit it and
the failure mode is silent.

The checked-out local `main` had diverged from `origin/main` by **79 commits
local, 106 remote**. Committing onto it would have built on a superseded
lineage. A tree diff settled it: going local → remote is 360 files changed and
56,409 insertions, with exactly **one** file present locally and absent on the
remote (`src/systems/LastStand.ts`). The remote is otherwise a strict superset,
so local `main` was a stale checkout and was reset to `origin/main` with
`git checkout -B main origin/main`. Nothing was pushed from the stale lineage.

**Check `git rev-list --left-right --count main...origin/main` before committing
to `main` in a fresh container.** The local branch can look perfectly healthy.

## 7. What was NOT checked

- **No harness run.** No UI changed, so there was no frame to verify. The four
  files are markdown.
- **No `tsdiff`.** No TypeScript changed.
- **Nothing about whether the design is achievable.** The 45fps-at-200-enemies
  budget is the design's own stated kill criterion and is entirely unproven.
  Nothing in this report is evidence about it.
- **The comic inventory has not been run.** Build order step 1 in
  `chapter-2-design.md` is an inventory of existing comic pages, and the two
  risks it is meant to surface — export resolution too small to read full
  screen, and baked-in "tap to continue" interface painted into pages — are
  unexamined. Note that root-level `comic_*.png` files are 3–7 MB each, which
  bears on the resolution question but does not answer it.
- **Open decision 1 is unanswered** and is recorded in the design doc as
  assumed: book two unlocks on Other Game level 2, pending a real answer.

---

## Where this leaves the repository

**In flight**

- Nothing. There is no branch and no open pull request from this session. All
  three commits are on `main`.

**Chapter 2: designed, nothing built**

The design is committed and cross-referenced. Build order, from
`chapter-2-design.md`, in the order it prescribes:

1. **Comic inventory** — cheap, unblocks the library, and answers the export
   resolution question before anything is built on a bad assumption.
2. **Prototype** — one arena, one hero, one enemy type, drag stick, auto-fire,
   200-enemy performance test. No draft, no art, no meta. **This is the only
   step that can kill the mode**, and the design commits in writing to
   redesigning toward fewer, larger enemies rather than shipping slow if it
   misses 45fps at 200. The revert is deleting the prototype directory; nothing
   in story mode depends on it.
3. Comic library reader and the story-mode unlock.
4. Draft system and upgrade pool.
5. Art pass: 3 ground tiles, ~12 props, 4 UI pieces.
6. Hero kits for all five.
7. Other Game level 1, boss, and the level-10 unlock gate.

**Waiting on a decision** — the design doc's own five open decisions:

1. Book two unlocks on story level 2 or Other Game level 2. *(Recorded as Other
   Game level 2 pending an answer.)*
2. How many Other Game levels are in scope. **This one blocks open item 9
   below** — the world map's 20 slots against 10 story levels — because Other
   Game levels are a candidate for the back half of that map, but the design
   requires they get their own entry point rather than sitting on the story
   road.
3. Does the 50% second wind survive in this mode. *(Design recommends keeping
   it as a one-per-level second wind under a different name; the code exists.)*
4. Does the tower drop go into level 1 or wait.
5. Whether "Other Game" is the literal in-game name or a placeholder.

**A methodology break to be aware of before anyone asks for a soak**

The soak harness **does not transfer** to Chapter 2. Soak works in story mode
because tower defense has no moment-to-moment input, so a machine plays it the
way a person does. In a survivors-like the player dodges every second and the
number measures the bot, not the player. **The 35–45% win rate band is retired
for this mode.** What replaces it: a scripted bot policy as a crash and
performance smoke test only, instrumented playtests with the kids, and a target
shape (8-minute levels, first three attempts dying around 5–6 minutes). Boss
health comes from watching the boys play.

**Carried forward, unaddressed** (from `claude/context.md` open items, still
open and untouched by this session)

- **Highest value:** the seven fake harness scenarios — see "THE TEST SUITE
  LIES" in `context.md`.
- **Awaiting Cory's word:** the Devil at 5200.
- 1. The hero's two ability medallions go dead after the Server Nuke drops.
- 2. Nine canvas-vs-ink content boxes, eight of them tower-menu glyphs up to 35%
  small. `chapter-2-art-rules.md` repeats the `measure_art.py` instruction
  specifically because of these.
- 3. Courtland's ability names disagree with his icons — art says *Seismic* and
  *Mind Control*, `heroes.json` says *Shockwave* and *Seismic*. **This now
  matters more than it did:** `chapter-2-design.md` uses Courtland as its
  worked example and names Seismic and Mind Control as his two buttons, so the
  disagreement is now baked into a design document as well as the art.
- 4. `fx_mind_control` has art and no mechanic. *(Chapter 2 proposes one, but
  proposes it in a mode that does not exist yet — story mode is unaffected and
  this item stays open.)*
- 5. Cake tiers probably too generous.
- 6. Verdict line and 2-cake tier disagree at exactly half (`>` vs `>=`).
- 7. Dialog buttons fall to ~24 CSS px when a panel scales to a phone.
- 8. World map node cakes render 24–25 CSS px, not the 32 asked for.
- 9. World map shows 20 slots while scope is 10 story levels. **See open
  decision 2 above** — Chapter 2 touches this and does not resolve it.
- 10. Establish the build pad convention before level 5.

**A note for whoever builds the prototype**

`chapter-2-design.md` is explicit that the tower-drop crossover must not
rebuild the pad system: the build menu is already deleted and seven harness
scenarios still drive its ghost. That ghost is a pre-existing item, and Chapter
2 is a reason not to resurrect what it points at.
