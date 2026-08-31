"""Synthesises the game's sound cues with the stdlib only.
Audio hosts are blocked in this environment, so the cues are generated rather
than downloaded. 22.05 kHz, mono, 16-bit WAV."""
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


out = sys.argv[1]
render(os.path.join(out, 'sfx-dadmode.wav'), dadmode, 1.15, 0.72)
render(os.path.join(out, 'sfx-build.wav'), build, 0.16, 0.42)
render(os.path.join(out, 'sfx-leak.wav'), leak, 0.36, 0.5)
render(os.path.join(out, 'sfx-cast.wav'), cast, 0.28, 0.4)
render(os.path.join(out, 'sfx-tax.wav'), tax, 0.5, 0.55)
render(os.path.join(out, 'sfx-boss.wav'), boss, 1.6, 0.66)
