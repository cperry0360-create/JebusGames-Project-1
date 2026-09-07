# The missing-asset placeholder in the ability bar

| commit | what it is | CI |
|---|---|---|
| `ee0ea6c` | The missing-icon stand-in is fitted to the slot it stands in for | **green** — run 165 |
| `REPORT_SHA` | This report | **CI_REP** |

Deployed: `deploy / build` and `deploy / deploy` both ran inside run 165 — read off the
job list, not inferred — and github-pages deployment `6308111818` for `ee0ea6c` reached
**success**. Tests **957 → 962**.

---

## The short version

**The missing files were already fixed. The fallback was not, and that is what this
commit repairs.**

---

## Which assets were failing, and why

None of the three candidates in the brief. Nothing was renamed by the WebP conversion,
no path in `heroes.json` points at a nonexistent file, and no effect asset is being
loaded as an icon. On current `main`:

- all **130** files named in `art.json` are on disk;
- every hero slot's `icon` and `fx`, and every ability's, resolves through **both hops**
  — the logical key is in the manifest, and the manifest's file is on disk.

`ability_bailey_1.webp` — Bark, the giant placeholder — **was absent from the
repository**, and so was `ability_eli_1.webp`:

| commit | `ability_bailey_1.webp` |
|---|---|
| `9172418` | **absent** |
| `2f8145f` | present (added there) |
| `622086d` onward | present |

The live site served `9172418` from 21:41 yesterday until this morning's merge at
10:07. **The iPad playtest was on that build.** The assets have been live since 10:07;
a reload will clear both symptoms.

Both symptoms follow from that one absence:

- **The giant exclamation mark** is Bark. `abilityIcon()` returns the generated stand-in
  when a texture is not loaded, and the stand-in's canvas is **256 px** in a **56 px**
  slot.
- **The blank grey circle** is Zoomies. Slot 2 is greyed until the hero transforms, so
  the bar wants `ability-bailey-2-grey`. At `9172418` the ten hero icons were missing
  from art.json's `greyable` list, so that copy had never been built.

---

## The fallback, which was still broken on main

This is the part that had nothing to do with a file, and it is why the placeholder was
*large* rather than merely present.

```js
const wantKey = usable ? base : greyKey(base)
if (this.textures.exists(wantKey) && slot.icon.texture.key !== wantKey) {
  slot.icon.setTexture(wantKey)
  fitInBox(slot.icon, base, r.boxH)      // <- inside the existence check
}
```

When the wanted texture did not exist, **the whole block was skipped, including the
fit.** And the wanted texture is `<icon>-grey`, which does not exist *precisely* when the
icon itself failed to load — nothing builds a greyscale copy of a texture that is not
there. So the sprite kept the texture *and the scale* it was constructed with, and the
256 px stand-in drew at 256 px.

Two rules now, separate on purpose:

1. **Never ask for a texture that does not exist.** An unavailable slot with no
   greyscale copy falls back to the colour icon — wrong-looking but present and legible
   — rather than to nothing.
2. **Fit whatever was actually set, unconditionally**, against the key the sprite is
   *wearing* rather than the one that was wanted. Those differ exactly when a fallback
   is in play, and fitting by a key the sprite is not showing is how a stand-in ends up
   sized for the art it replaced.

### Proved by taking the textures away, not by reasoning

All four of Bailey's keys were removed at runtime and the bar re-measured:

```
after removal: ability-molotov          56x56
               ability-gnomes           56x56
               ability-glacier          56x56
               ability-meteor           56x56
               ability-chain            56x56
               ability-scratchticket    56x56
               ability-servernuke       56x56
               generated-icon-missing   56x56  <-- STAND-IN
               generated-icon-missing   56x56  <-- STAND-IN
```

**Under the old code the same scenario does not merely draw big — it times out.** The
sprite is left on a texture that no longer exists and Phaser throws
`Cannot read properties of null (reading 'drawImage')` every frame. Exit 2 against exit
0. (That render crash is specific to *removing* a displayed texture, which is the
harness's method; a texture that never loaded is never on the sprite. The size claim is
the one that transfers, and it is the one asserted.)

---

## The test the brief asked for

`tests/assetpaths.test.ts`, new. This class has reached the deployed game twice, and the
existing `assets.test.ts` only ever walked `art.json` — so a path written into
`audio.json`, `music.json` or straight into a `.ts` file was never checked at all.

Five checks:

1. **Every string in `src/` that looks like a filename** resolves under `public/` or
   `public/assets/`. Deliberately blunt: no exemption list, because a check with one
   grows more.
2. Every key in the art manifest resolves to a real file.
3. **Every hero slot and every ability, through both hops** — the key must be in
   `art.files`, and that file must be on disk. This is the one that would have caught the
   iPad: `art.json` was self-consistent and `heroes.json` was self-consistent, and
   nothing asked the question across the two.
4. Every audio cue (`root + file + '.' + format`) and every music track.
5. The fallback is fitted — asserting the fit is *outside* the existence check, and that
   an absent greyscale copy falls back to the colour icon.

Markdown is out of scope, and that is a scope rule rather than an exemption: nothing
loads a `.md`, and `src/data/README.md` explains the manifest format using two example
paths that were never meant to be files.

**Verified that it can fail.** Removing `ability_bailey_1.webp` turns **five** tests red,
three of them new:

```
not ok 27 - every asset path written anywhere in src/ exists under public/
not ok 28 - every key in the art manifest resolves to a real file
not ok 29 - every ability and hero slot names an icon and an effect that exist
not ok 32 - every asset the manifest names is in the built output
not ok 91 - every REQUIRED manifest file is really present
```

---

## What came from rendered frames

**From rendered frames.** A new `abilityicons` scenario drives **all five heroes** on
level 3, each with **all seven draftable abilities** in the bar — 45 slots — and reports
every slot's texture key and drawn size. Run at 844x390 and 1400x708, both exit 0:

| hero | slots | any stand-in | any oversize |
|---|---|---|---|
| cory, courtland, han, eli, bailey | 9 each | none | none — all 56x56 |

The harness's usual run state pins two abilities (`molotov`, `glacier`), which exercises
two of the seven drafted paths; this one drafts all of them, which is why it covers what
Cory saw. The forced-missing frame is
`tools/harness/shots/abilityicons-bailey-missing-1400x708.png`, and the two stand-ins are
visibly the same size as the seven real icons beside them.

**NOT from rendered frames.** The file-history dates and the manifest resolution are read
from git and the filesystem. Nothing was checked against the live site — the sandbox's
egress proxy answers 403 to CONNECT for github.io by policy.

---

## Where this leaves the repository

**Closed:** the placeholder, the blank circle, and the sizing rule behind both.

**Worth knowing:** the greyscale copies are built at boot from `art.json`'s `greyable`
list. `generated-icon-missing` is not in it and does not need to be now — the fallback
above handles it — but any icon added to the bar without being added to `greyable` will
show its colour icon dimmed in the unavailable state rather than a true desaturation.
That is now a cosmetic difference rather than a blank slot.

**Not started — the ability brief from the previous message:** Star Rain's targeting,
Courtland's `fx_seismic` / `fx_mind_control` not rendering, and confirming the hero
ability set. Note that this session found `courtland.slot1` is named **Shockwave** in
`heroes.json` while the intended set says **Seismic**, and both of Courtland's slots
currently point at the same `fx-seismic` effect — which is very likely the whole of that
brief's item 2. None of it is fixed.

**Carried forward, untouched:** Bug C's black pill (not reproduced), Cory's earlier
level-select crash, pad 3 not building at 844x390, the hero tap not selecting, the fault
guard's blast radius across ~90 harness scenarios, and the cake/dialog/typography items
from earlier reports.
