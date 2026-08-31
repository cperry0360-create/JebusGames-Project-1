"""Synthesises the game's big dramatic stings with the stdlib only.

Most of the game's audio is Kenney CC0, fetched by tools/getsfx.py. These five
are the ones none of Kenney's packs cover: a hero transformation, a boss
arrival, an ultimate weapon and the two run endings all need a *sting* — a
composed, several-second swell — and the packs are all short one-shot impacts
and interface blips. So these are generated. 22.05 kHz, mono, 16-bit WAV.

    python3 tools/mksfx.py public/assets/audio
"""
import math, random, struct, wave, sys, os

SR = 22050

def env(i, n, attack=0.01, release=0.4):
    t = i / SR
    dur = n / SR
    a = min(1.0, t / attack) if attack > 0 else 1.0
    r = min(1.0, (dur - t) / release) if release > 0 else 1.0
    return max(0.0, a * min(1.0, r))

def saw(ph):
    return 2.0 * (ph - math.floor(ph + 0.5))

def render(path, fn, seconds, gain=0.6):
    n = int(SR * seconds)
    frames = bytearray()
    for i in range(n):
        v = fn(i, n) * gain
        v = max(-1.0, min(1.0, v))
        frames += struct.pack('<h', int(v * 32767))
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(bytes(frames))
    print(f'{os.path.basename(path):22s} {seconds:.2f}s  {len(frames)//2} samples')

rnd = random.Random(4)

# DAD MODE: a can crack, then a rising distorted power chord.
def dadmode(i, n):
    t = i / SR
    out = 0.0
    if t < 0.13:                                   # the crack
        out += (rnd.random() * 2 - 1) * math.exp(-t * 34) * 0.9
    if t > 0.08:
        u = t - 0.08
        f = 92 + 116 * min(1.0, u / 0.55)          # rising root
        for mult, amp in ((1.0, 0.55), (1.5, 0.34), (2.0, 0.22)):
            out += saw(f * mult * u) * amp
        out = math.tanh(out * 2.6)                 # distortion
        out *= min(1.0, u / 0.02) * max(0.0, 1 - u / 1.05)
    return out * env(i, n, 0.005, 0.25)

# Short UI blips.
def build(i, n):
    t = i / SR
    f = 320 + 260 * min(1.0, t / 0.09)
    return math.sin(2 * math.pi * f * t) * env(i, n, 0.004, 0.12)

def leak(i, n):
    t = i / SR
    f = 240 - 120 * min(1.0, t / 0.3)
    return (math.sin(2 * math.pi * f * t) * 0.7
            + (rnd.random() * 2 - 1) * 0.18 * math.exp(-t * 8)) * env(i, n, 0.004, 0.25)

def cast(i, n):
    t = i / SR
    f = 540 + 300 * math.sin(t * 26)
    return (saw(f * t) * 0.5 + math.sin(2 * math.pi * f * 2 * t) * 0.3) * env(i, n, 0.004, 0.18)

# The Politician taxes you: a cash-register clunk with the money going the
# wrong way, so it never reads as a reward.
def tax(i, n):
    t = i / SR
    ding = math.sin(2 * math.pi * 880 * t) * math.exp(-t * 26)
    drop = math.sin(2 * math.pi * (420 - 260 * min(1.0, t / 0.35)) * t)
    clunk = (rnd.random() * 2 - 1) * 0.22 * math.exp(-t * 30)
    return (ding * 0.45 + drop * 0.5 + clunk) * env(i, n, 0.003, 0.22)


# Boss entrance: a low horn swell under a slow bell, more arrival than threat.
def boss(i, n):
    t = i / SR
    horn = (saw(72 * t) * 0.34 + saw(108 * t) * 0.22) * min(1.0, t / 0.45)
    bell = math.sin(2 * math.pi * 330 * t) * math.exp(-t * 2.2) * 0.3
    return (horn + bell) * env(i, n, 0.05, 0.5)



# SERVER NUKE: a long descending whine that stops dead, then the hit. The
# wind-up is the ability, so the sound has to carry the whole cast.
def nuke(i, n):
    t = i / SR
    dur = n / SR
    charge = 0.0
    if t < dur * 0.78:
        u = t / (dur * 0.78)
        f = 1650 - 1180 * u
        charge = (math.sin(2 * math.pi * f * t) * 0.34
                  + saw(f * 0.5 * t) * 0.2) * (0.25 + 0.75 * u)
    boom = 0.0
    if t > dur * 0.80:
        u = t - dur * 0.80
        boom = (math.sin(2 * math.pi * (58 - 20 * min(1.0, u / 0.4)) * t) * 0.9
                + (rnd.random() * 2 - 1) * 0.5 * math.exp(-u * 5))
        boom = math.tanh(boom * 1.8)
    return (charge + boom) * env(i, n, 0.02, 0.35)


# The last life. Not the same as losing one of twenty: a single low bell left
# ringing, so the player hears the difference without reading the counter.
def lastlife(i, n):
    t = i / SR
    bell = (math.sin(2 * math.pi * 147 * t) * 0.6
            + math.sin(2 * math.pi * 220.5 * t) * 0.25
            + math.sin(2 * math.pi * 294 * t) * 0.15)
    return bell * math.exp(-t * 1.4) * env(i, n, 0.006, 0.6)


# Run won: a rising major arpeggio that lands, played straight. The game is
# silly, but clearing thirteen waves is not a joke.
def won(i, n):
    steps = (262, 330, 392, 523)
    step = 0.19
    t = i / SR
    k = min(len(steps) - 1, int(t / step))
    u = t - k * step
    v = 0.0
    for h, a in ((1, 0.6), (2, 0.22), (3, 0.1)):
        v += math.sin(2 * math.pi * steps[k] * h * t) * a
    # The last note rings on rather than being cut off with the rest.
    hold = math.exp(-u * (1.2 if k == len(steps) - 1 else 7.0))
    return v * hold * env(i, n, 0.006, 0.5)


# Run lost: the same shape falling, and detuned, so it is recognisably the
# other end of the same joke.
def lost(i, n):
    steps = (392, 330, 262, 175)
    step = 0.24
    t = i / SR
    k = min(len(steps) - 1, int(t / step))
    u = t - k * step
    f = steps[k]
    v = (math.sin(2 * math.pi * f * t) * 0.55
         + math.sin(2 * math.pi * f * 1.006 * t) * 0.35   # detune, for the sag
         + saw(f * 0.5 * t) * 0.12)
    hold = math.exp(-u * (1.0 if k == len(steps) - 1 else 5.0))
    return v * hold * env(i, n, 0.01, 0.55)


out = sys.argv[1]
render(os.path.join(out, 'sfx-dadmode.wav'), dadmode, 1.15, 0.78)
render(os.path.join(out, 'sfx-build.wav'), build, 0.16, 0.42)
render(os.path.join(out, 'sfx-leak.wav'), leak, 0.36, 0.5)
render(os.path.join(out, 'sfx-cast.wav'), cast, 0.28, 0.4)
render(os.path.join(out, 'sfx-tax.wav'), tax, 0.5, 0.55)
render(os.path.join(out, 'sfx-boss.wav'), boss, 1.6, 0.66)
render(os.path.join(out, 'sfx-nuke.wav'), nuke, 2.4, 0.7)
render(os.path.join(out, 'sfx-last-life.wav'), lastlife, 1.8, 0.62)
render(os.path.join(out, 'sfx-won.wav'), won, 1.3, 0.5)
render(os.path.join(out, 'sfx-lost.wav'), lost, 1.6, 0.52)
