# CLAUDE.md

Project instructions for Claude Code. Read this before every task.

## What this is

**Courjahan Defense** — a roguelite tower defense game. JebusGames. Browser-based, single player.

Full design in `DESIGN.md`. Read it before implementing any gameplay feature.

## Stack

- **Phaser 3** for rendering
- **Vite** for build
- **TypeScript**
- **GitHub Pages** for hosting, auto-deploy on push to `main`

## Hard rules

**1. All balance numbers live in JSON under `/src/data/`.**
Tower stats, enemy stats, wave composition, ability values, hero stats, Last Stand thresholds, Holdings costs, node costs. Never hardcode a number that might need tuning. If you find yourself typing a number into a `.ts` file that affects gameplay, it belongs in JSON instead.

**2. `/reference/prototype.html` is reference, not a starting point.**
It is an old single-file HTML prototype. Read it to understand how the explosion and two-fighter abilities behaved, and what the wave pacing and tuning felt like. Do not port its code. Do not copy its architecture. Build fresh in the stack above.

**3. Rendering is a flat square grid with 3/4 perspective art.**
Not isometric. Grid math stays orthogonal. Depth is handled by sorting sprites on Y position so lower sprites draw in front. If a task seems to require isometric coordinate conversion, stop and flag it.

**4. This game uses two cameras. Never apply a camera transform globally.**

- A **world camera** renders the map and every game object on it — towers,
  enemies, the hero, projectiles. It is the only thing that zooms or pans, and
  only during an active run.
- A **fixed UI camera** renders all HUD, menus, panels and dialogs at 1:1 and
  never transforms.

Menu screens are composed against the 1280x720 design box and fitted to the
viewport by `fitCameraToDesign`, so nothing is ever cropped on any device. That
fit is a fixed transform: no gesture is ever bound to it. Gestures belong to
`CameraRig`, which lives on GameScene alone and is destroyed when the run ends.

Anything drawn in screen space inside GameScene must be registered with
`asScreenSpace`, or it will pan and zoom with the map.

**5. Do not build ahead of the current phase.**
`DESIGN.md` defines four phases. Build only what the current task asks for. If a feature would be useful later, note it and move on. Scope creep kills this project faster than any bug.

**6. Ask before large refactors.**
Propose the approach first and wait for confirmation before rewriting anything that already works.

**7. Size character art against PHYSICAL pixels:**

    source height >= world height x maxZoom x devicePixelRatio

This rule used to say "roughly 2x the render size, not 5x", and it was
measured in the wrong unit. Cory renders at 75.8 world px, so the old rule
asked for a 152px source — but the canvas draws at device resolution now, and
at maxZoom 2.37 on a devicePixelRatio-3 phone he occupies 539 physical pixels.
The rule was under-provisioning a retina screen by 3x, and the art that broke
it (470px, 6.2x the render size) is the art that is very nearly right.

Both failure directions are real, so aim at the formula rather than above it:

- **Too small** and the GPU magnifies, which is a soft, blurry sprite. That is
  what the map plate does today at 1672px for a 1280-world-px surface.
- **Too large** and the GPU minifies heavily. A 4px outline sampled down past
  about 2x becomes a grey smear, which is what happened to the whole cast the
  first time round, and there are no mipmaps to soften it (WebGL1, and 67 of
  109 textures are non-power-of-two — see RENDER-QUALITY.md).

With today's numbers — maxZoom 2.37, dpr capped at 3 by `Resolution.ts` — the
multiplier on a sprite's world height is about **7x**, and the floor of the
zoom band puts the worst minification at about 2.7x. Recompute rather than
memorise 7: the zoom band moves.

After any re-export, run `python3 tools/measure_art.py` and update
`contentWidth`/`contentHeight` in `art.json`. Those are SOURCE extents and
`fitInBox` divides by them, so they go stale silently. `displayHeight` is in
world pixels and survives a re-export untouched, so leave it alone unless the
art is meant to change size.

## Verifying a UI change

**Every UI change is verified against a rendered frame from `tools/harness/`
before it is considered done.** At 375x667, 390x844 and a desktop window, in
both orientations. Nothing may overlap, nothing may be cut off, nothing may sit
under a notch, and every interactive control must be at least 44 by 44 points.

```bash
sh tools/harness/build.sh                     # Phaser is vendored; this just works
sh tools/harness/run.sh screens 140 844x390   # walks Title, WorldMap, Loadout, Cutscene, Game
INSETS=0,47,21,47 sh tools/harness/run.sh screens 140 844x390   # with a notch
python3 tools/harness/shrink.py tools/harness/shots/screens-5-game-844x390.png 950
```

`screens` reports four faults with numbers — OFF (past the edge), NOTCH (inside
a safe-area inset), SMALL (a control under 44pt) and OVER (two texts or two
controls overlapping) — and writes a screenshot per screen. **Read the picture
as well as the numbers.** The numbers cannot see a sprite drawn behind another
one, and the picture cannot tell you which two rectangles collided.

Portrait is reported as gated rather than audited: the game is landscape-only
and a portrait viewport gets a rotate overlay. That is the correct answer for
portrait, not a skipped check.

**Do not trust a first red result.** Three of the four faults the input harness
first "found" were bugs in the harness itself, and each looked exactly like the
product bug being hunted — a modal left open makes every later check pass, a
paused scene receives no input at all, and a screenshot of a 17MB PNG can be
captured half-decoded and read as a screen cut off at the bottom. Establish
that the thing you are measuring can move before you report that it did not.

## Typechecking

`npm install` fails in the agent environment (the registry returns 403), so
there is no `node_modules` and `tsc` cannot resolve `phaser`. Every file that
imports it loses its base class and about 165 cascade errors fall out. Running
`tsc` and reading the output tells you nothing.

Use `sh tools/tsdiff.sh <known-green-commit>` instead. It typechecks the
working tree and a commit CI already accepted, and reports only the
difference. Two real errors reached CI before this existed.

## Reports

**Every report ends with a markdown file, always.** A finding that lives only
in chat scrollback cannot be shared, cannot be re-read next week, and is gone
the moment the window closes.

"Report" means ANY answer that says what was done, measured, found or decided —
not only the ones that look like formal write-ups. A one-line "CI is green" and
a closing "here is where this leaves things" are both reports. If it would be
worth reading again, it goes in the file.

- One file per report, in `reports/`, named `YYYY-MM-DD-topic.md`.
- Chat gets the summary; the file gets the whole thing — the numbers, the
  method, how to reproduce it, and what was NOT checked.
- **The file is written LAST and updated until the work is actually finished.**
  Writing it before the final commit lands leaves the commit hashes, the CI
  result and the open items in chat only — which is the exact failure this rule
  exists to prevent, and it has happened. Wait for CI, then update the file,
  then answer.
- Every such file carries, at the top, a table of the commits it covers with
  their CI status, and at the bottom a "where this leaves the repository"
  section: what is in flight, what is blocked, and what is waiting on a
  decision. Carry the still-open items forward into the next report rather than
  letting them age out of the conversation.
- Topic documents that are living records rather than dated reports keep their
  place at the repository root: `AUDIT.md`, `RENDER-QUALITY.md`, `NAMING.md`,
  `TOWER-MENU.md`, `SOAK-REPORT.md`, `ATTRIBUTIONS.md`. Update those in place
  and link them from the dated report rather than restating them.
- Keep report images out of the repository unless they carry something the
  numbers cannot. Harness screenshots are reproducible: give the command
  instead. `tools/harness/shots/` is gitignored on purpose.

## Conventions

- Prefer small, readable modules over clever abstractions
- Every gameplay system gets its own file
- Comment the *why*, not the *what*
- Keep the game playable at every commit. If a change breaks the build, fix it before adding anything else.

## Tone

The game is a serious tower defense wrapped in a silly world. Mechanics are honest and the difficulty is real, but names, flavor text, and death animations should be funny. Kingdom Rush is the reference for both look and tone. Never sacrifice a working mechanic for a joke.

## Heroes

Heroes are named after the developer's family. Get the names and spellings right:
Cory, Courtland, Eli, Han (full name Hsiaohan), and Bailey the dog.

**Eli, in the game. Elijah, the person.** The roster shipped calling him ELIJAH
on the loadout picker and Eli everywhere else. The hero is Eli — `heroes.json`
is the one place that decides it, and every UI string reads from there.
`ATTRIBUTIONS.md` and the notes in `audio.json` credit Elijah by his full name,
because those are about a person who recorded three lines rather than about a
character.

Cory works in **tax**, not audit. This matters.

## Merging

When a session cannot push to `main`, **its final message must begin with the
branch name and the exact command to merge it.** Not in a report, not at the
end — the first thing in the reply.

Three sessions in a row ended with correct, green, fast-forwardable work
sitting on a branch nobody merged, and the session after each of them opened by
discovering that the previous session's fixes were not in the game. The cost is
not the merge, it is that every following brief starts by asking whether the
last one landed.

## Current phase

**Phase 1 — prove the loop is fun.**
Placeholder art from Kenney's free CC0 tower defense pack. One map, one path, Cory only. No Banner tree, no boons, no Holdings, no siege enemies until Phase 1 is playable and confirmed fun.
