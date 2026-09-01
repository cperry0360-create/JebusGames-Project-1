# Attributions

Every asset in this project that was not made for it, what it is licensed
under, and where that licence was read from.

This file is the record. The credits roll is the *presentation* of it, and the
two are kept in step: the roll's MUSIC section reads `src/data/music.json`,
and a test fails if a track there names no artist, licence or source.

**Licences below were read from the licence file shipped with the pack, in
this repository — not assumed from the vendor's usual terms.** Where something
could not be confirmed it says so, loudly, rather than reading as settled.

## The short version

Everything third-party here is CC0 or CC-BY. Nothing is commercially
restricted, nothing is share-alike, nothing requires a fee. **One** CC-BY item
remains — "Battle BGM" — and it is the only one where crediting is a
**condition of use** rather than a courtesy. It is credited in the roll.

The level 1 track is now "Airport Attack", which is CC0: no attribution is
required, and it is credited anyway.

## Assets

| Asset | Used for | Source | Licence | Attribution required? | In the credits roll? |
|---|---|---|---|---|---|
| **Kenney — Tower Defense (top-down)** | Three projectile tiles and the title-screen scenery | kenney.nl, via the GitHub mirror `ETdoFresh/kenney.nl` | **CC0 1.0** — verbatim from `public/assets/kenney/License.txt`: *"License (Creative Commons Zero, CC0) … Credit (Kenney or www.kenney.nl) would be nice but is not mandatory."* | No | Yes — "Assets · KENNEY — CC0" |
| **Kenney — Impact Sounds, Interface Sounds, UI Audio, RPG Audio** | 32 of the 39 sound cues: tower fire, hits, deaths, clicks, errors, coins, building | Same mirror; `tools/getsfx.py` records which file became which cue | **CC0 1.0** — see `public/assets/audio/CREDITS.md` | No | Yes — same line |
| **Kenney Future** (`KenneyFuture.ttf`) | The display face: the title, the department headers, the names at the end | kenney.nl font package | **CC0 1.0** — verbatim from `public/assets/fonts/License.txt`: *"License: (Creative Commons Zero, CC0) … Support us by crediting (Kenney or www.kenney.nl), this is not mandatory."* | No | Yes — same line, "fonts" named in its note |
| **"Airport Attack"** — Ivan Stanton (*northivanastan* on OpenGameArt) | Level 1 gameplay music | <https://opengameart.org/content/airport-attack> | **CC0** | No — given anyway | Yes — MUSIC section |
| **FluidR3 GM soundfont** | Rendering "Airport Attack" from the MIDI the artist published to the MP3 the game ships | FluidR3 GM (Frank Wen) | **MIT** | Yes | Yes — named on the track's own credit line |
| **"Battle BGM"** — syncopika | Title, loadout and credits music | <https://opengameart.org/content/battle-bgm> | **CC BY 3.0** | **Yes** | Yes — MUSIC section |
| **Phaser** | The engine. Ships inside the bundle. | phaser.io / npm `phaser` | **MIT** — read from `LICENSE.md` in the package: *"The MIT License (MIT) … Copyright (c) 2026 Richard Davey, Phaser Studio Inc."* | Yes, the copyright notice must travel with the bundle | **No — see below** |

## What could and could not be verified

**Verified from the repository:**

- Every Kenney licence, read from the `License.txt` shipped inside each pack
  directory. All three say Creative Commons Zero explicitly. Attribution is
  described as welcome and *not mandatory* in each.
- The **goblin voice line** (`sfx-goblin-spawn.wav`): recorded by Elijah for
  this project. Original work, no third-party licence involved. Measured from
  the file itself: 44.1 kHz mono, 1.44s, peaking at -1.4 dBFS.

**NOT verified — flagged rather than guessed:**

- **Both opengameart.org URLs.** `opengameart.org` is blocked by this
  development environment's network egress proxy, so neither source page could
  be opened. The URLs are recorded as supplied.
- **Everything about "Battle BGM".** The file arrived as `battle.mp3` with
  **no ID3 title, artist, album or licence** — only an encoder tag
  (`TSSE = Lavf52.93.0`, i.e. ffmpeg). The artist *syncopika*, the title, the
  CC BY 3.0 licence and the URL are all recorded from what was supplied and
  **none of them could be confirmed against the file or the source page.**
- **Everything about "Airport Attack" except the audio itself.** The MP3
  carries no ID3 title, artist or licence. The artist *Ivan Stanton*
  (*northivanastan*), the CC0 licence, the URL, and the fact that it was
  rendered from MIDI with the **FluidR3 GM** soundfont are all recorded as
  supplied and **could not be confirmed against the file or the source page.**
  CC0 asks for nothing, so nothing is at risk in the way it is for a CC-BY
  track; the FluidR3 MIT notice is the part that carries an actual obligation.

*Electric Dream* (Of Far Different Nature, CC BY 4.0) was the level 1 track and
has been replaced. It is no longer referenced by the game or shipped in
`public/`, so its CC-BY credit has been removed from this file and from the
roll — the roll's MUSIC section is generated from `src/data/music.json`, so
removing the track removed the credit with it. The history has it if it ever
comes back.

**Before release, open both source pages and confirm the artist, the exact
licence version, and the required attribution wording.** CC-BY requires the
credit to be given "in the manner specified by the author", and that wording is
on the page neither of us can currently reach.

## Gaps found by this audit

**Phaser was not credited anywhere.** It is MIT, and MIT requires the copyright
notice and permission text to be included with any substantial portion of the
software — which a bundled engine is. Vite inlines the library into the built
JavaScript, so nothing carried the notice.

Fixed by adding it to the credits roll's PROGRAMMING department and to this
file. The full licence text lives with the package; a link and the copyright
line is the ordinary practice for a bundled MIT library, and is what the roll
now carries.

Nothing else was missing: the three Kenney packs and the font were already
credited (and are CC0, so were not required to be), and both music tracks were
added to the roll in the same change that added the tracks themselves.

## Original work

Everything else is made for this project: all painted art (the map, the
hero, the enemies, the towers, the props, the UI plates, the tavern), the six
multi-second audio stings (generated by `tools/mksfx.py`), and all code.

