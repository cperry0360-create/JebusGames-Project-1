"""Copies the game's CC0 sound cues out of Kenney's audio packs.

The packs are cloned from the github mirror at ETdoFresh/kenney.nl (the
kenney.nl download hosts are not reachable from the build environment, but
github is). Point SRC at that clone and run this; it copies only the files the
game actually plays, renamed to their cue name, and refuses to guess if one is
missing.

    git clone --filter=blob:none --sparse https://github.com/ETdoFresh/kenney.nl
    python3 tools/getsfx.py /path/to/kenney.nl

Everything Kenney covers well comes from here. The four big dramatic stings —
Last Stand, the boss entrance, and the two run endings — are not in any of
these packs and are synthesised by tools/mksfx.py instead.
"""
import os
import shutil
import sys

# cue name -> (pack, file). One entry per sound the game plays.
CUES = {
    # --- towers. One per firing tower, chosen to be audibly distinct, since
    # five of them fire at once for most of a wave.
    'tower-withholding': ('kenney_impactsounds', 'impactGeneric_light_000.ogg'),
    'tower-writeoff':    ('kenney_impactsounds', 'impactWood_heavy_001.ogg'),
    'tower-rounding':    ('kenney_impactsounds', 'impactTin_medium_000.ogg'),
    'tower-escalation':  ('kenney_impactsounds', 'impactMetal_heavy_003.ogg'),
    'tower-extension':   ('kenney_impactsounds', 'impactPlate_light_002.ogg'),

    # --- combat. Three hit variants, cycled, so a wave does not machine-gun
    # one sample.
    'hit-a':     ('kenney_impactsounds', 'impactSoft_medium_000.ogg'),
    'hit-b':     ('kenney_impactsounds', 'impactSoft_medium_002.ogg'),
    'hit-c':     ('kenney_impactsounds', 'impactSoft_medium_004.ogg'),
    'death':     ('kenney_impactsounds', 'impactSoft_heavy_003.ogg'),
    'hero-hit':  ('kenney_impactsounds', 'impactPunch_medium_000.ogg'),

    # --- building
    'build':     ('kenney_rpgaudio', 'metalLatch.ogg'),
    'upgrade':   ('kenney_interfacesounds', 'confirmation_003.ogg'),
    'sell':      ('kenney_rpgaudio', 'handleSmallLeather.ogg'),

    # --- money. Coins are as close as the packs get to a bag of peanuts.
    'peanuts':   ('kenney_rpgaudio', 'handleCoins.ogg'),
    'taxed':     ('kenney_rpgaudio', 'handleCoins2.ogg'),

    # --- interface
    'click':     ('kenney_interfacesounds', 'click_002.ogg'),
    'hover':     ('kenney_uiaudio', 'rollover2.ogg'),
    'error':     ('kenney_interfacesounds', 'error_006.ogg'),
    'broke':     ('kenney_interfacesounds', 'error_003.ogg'),
    'open':      ('kenney_interfacesounds', 'open_001.ogg'),
    'close':     ('kenney_interfacesounds', 'close_001.ogg'),

    # --- waves and lives
    'wave-start':   ('kenney_impactsounds', 'impactBell_heavy_001.ogg'),
    'wave-cleared': ('kenney_interfacesounds', 'confirmation_002.ogg'),
    'life-lost':    ('kenney_interfacesounds', 'bong_001.ogg'),

    # --- abilities. One each; the rare drop is synthesised.
    'cast-molotov':      ('kenney_impactsounds', 'impactGlass_heavy_000.ogg'),
    'cast-gnomes':       ('kenney_rpgaudio', 'dropLeather.ogg'),
    'cast-glacier':      ('kenney_interfacesounds', 'glass_003.ogg'),
    'cast-meteor':       ('kenney_impactsounds', 'impactMining_002.ogg'),
    'cast-chain':        ('kenney_interfacesounds', 'glitch_002.ogg'),
    'cast-scratchticket': ('kenney_interfacesounds', 'scratch_003.ogg'),
    'haymaker':          ('kenney_impactsounds', 'impactPunch_heavy_001.ogg'),
    'scratching':        ('kenney_interfacesounds', 'scratch_001.ogg'),
}

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'audio')


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)

    missing = []
    for cue, (pack, name) in sorted(CUES.items()):
        found = None
        for root, _dirs, files in os.walk(os.path.join(src, pack)):
            if name in files:
                found = os.path.join(root, name)
                break
        if not found:
            missing.append(f'{cue}: {pack}/{name}')
            continue
        dest = os.path.join(OUT, f'sfx-{cue}.ogg')
        shutil.copyfile(found, dest)
        print(f'  sfx-{cue}.ogg  <- {pack}/{name}  ({os.path.getsize(dest)} bytes)')

    if missing:
        print('\nMISSING, nothing guessed in their place:')
        for m in missing:
            print('  ' + m)
        return 1
    print(f'\n{len(CUES)} cues copied to {os.path.normpath(OUT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
