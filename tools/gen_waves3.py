"""Generates src/data/waves.level3.json.

    python3 tools/gen_waves3.py            # print the table and the totals
    python3 tools/gen_waves3.py --write    # write src/data/waves.level3.json

THE COUNTS LIVE HERE, not in the JSON, and that is the point. Level 3 is tuned
by soak: the win rate moves, the numbers below move, the table is regenerated.
Editing the JSON by hand would work exactly once, and then this file would be a
lie about where its numbers came from.

WHAT IS TUNABLE IS THE CURVE AND THE COUNTS, nothing else. Tower stats, pad
positions and enemy base stats are not level 3's to change: enemies.json is
shared with levels 1 and 2, and rules.json is shared with both.

HOW IT WORKS. Each wave names its heavy units per lane and a target health.
Pom-Poms then fill each lane up to that target, split by the lane weight. That
inversion is deliberate -- the curve is what a player feels, so the curve is the
input and the counts fall out of it, rather than the other way round.

WHY THE FILLER IS POM-POM, and why there are so many of her. Every rank-and-file
enemy on this level pays less per point of health than any on levels 1 and 2:

    pompom 0.115   longsnap 0.100   catcher 0.100   zamboni 0.092
    (level 1: lateFiler 0.121, shredder 0.175, finalNotice 0.129)

rules.json is shared, so the purse is not level 3's to open, and content.test.ts
holds every level to 0.130 peanuts per point of health or the board cannot be
built fast enough to keep up. The Rainbow Reaper's 1800 does most of the lifting
and Pom-Pom is the only filler that does not drag the average under the line --
which is why she has to be about two thirds of the health in the run. It reads
as a cheer squad with a few heavies in it, which is the level this is.
"""
import collections
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = json.load(open(os.path.join(ROOT, 'src/data/enemies.json')))
HP = {k: v['maxHealth'] for k, v in E.items()}
REWARD = {k: v['peanutReward'] for k, v in E.items()}
U, L = 'upper', 'lower'
FILLER = 'pompom'

# The health curve, wave by wave, rank-and-file only -- the boss is not on it.
#
# WAVE 12 IS SET BY THE BOSS AND THE CURVE IS SET BY THE PURSE, and between them
# there is less room than there looks.
#
# From above: content.test.ts lets a boss wave arrive at most 80% heavier than
# the wave before it, and the Reaper is 9800, so wave 12 cannot be under 5445.
#
# From below: the same file wants 0.130 peanuts per point of health. Every
# rank-and-file enemy here pays less than that, so the Reaper's 1800 is the only
# thing holding the average up -- and the more rank health the run carries, the
# more it dilutes him. That puts a CEILING on total rank health of about 25500,
# which is the opposite of the direction difficulty usually pushes.
#
# So the curve has to reach 5600 by wave 12 while summing to less than that
# ceiling, which means it must be STEEP: about 30% a wave, against the 55% a step
# the cliff bound allows. It starts at 330 -- level 1 opens at 330 too -- and
# nearly doubles every two waves. That steepness is a consequence of the cast's
# economics, not a taste, and it is the first thing to revisit if the soak says
# the back half is too sharp.
CURVE = [320, 415, 540, 700, 910, 1180, 1530, 1985, 2575, 3340, 4270, 5600]

# How much of each wave's health comes down the UPPER gate. The rest comes down
# the lower one. Deliberately alternating: a board committed to one gate has to
# be wrong about half the time. 0.5 exactly would be even, and waves 9 and 11
# sit close to it on purpose -- those are the ones that punish a lopsided board.
UPPER_SHARE = [1.00, 0.00, 0.55, 0.60, 0.42, 0.60, 0.40, 0.58, 0.52, 0.45, 0.48, 0.56]

# The heavy units, per wave, per lane. Everything not listed is Pom-Pom.
#
# THREE ZAMBONIS IN THE WHOLE RUN, and that is the purse talking rather than
# taste. She is the worst payer on the board at 0.092 peanuts per point, so every
# one of her that is swapped for the equivalent health in Pom-Poms is +15 income
# at no change in load. Two came out of waves 9 and 11 to clear the 0.130 line.
# She keeps her first appearance in wave 7 and both halves of wave 12, which is
# where she is doing work rather than filling.
HEAVIES = [
    {},                                                    # 1  nothing but the squad
    {L: [('longsnap', 2)]},                                # 2
    {L: [('longsnap', 1)]},                                # 3
    {U: [('longsnap', 3)]},                                # 4
    {L: [('catcher', 2)]},                                 # 5  first Catcher
    {U: [('catcher', 2)], L: [('longsnap', 3)]},           # 6
    {L: [('zamboni', 1), ('longsnap', 2)]},                # 7  first Zamboni
    {U: [('catcher', 3)], L: [('longsnap', 3)]},           # 8
    {L: [('catcher', 2)], U: [('catcher', 2)]},            # 9
    {U: [('longsnap', 3)], L: [('catcher', 3)]},           # 10
    {U: [('catcher', 3)],
     L: [('catcher', 2), ('longsnap', 3)]},                # 11
    {U: [('zamboni', 1), ('longsnap', 4)],
     L: [('zamboni', 1), ('catcher', 3)]},                 # 12
]

NAMES = ['Kickoff', 'The Snap', 'Two Gates', 'Special Teams', 'Behind the Plate',
         'Full Count', 'Ice Time', 'Both Benches', 'Resurfacing', 'Overtime',
         'The Rivalry', 'Sudden Death']

# Seconds between spawns in a group, and how late the group starts. Tightening
# as the run goes on is the pressure the curve alone does not carry.
FILLER_INTERVAL = [1.2, 1.1, 1.0, 1.0, 0.9, 0.9, 0.9, 0.8, 0.8, 0.8, 0.8, 0.7]
HEAVY_INTERVAL = {'longsnap': 1.5, 'catcher': 2.8, 'zamboni': 4.0}
BOSS = 'unicornBoss'


def spawn(enemy, count, interval, delay, lane):
    return collections.OrderedDict([('enemy', enemy), ('count', count),
                                    ('interval', interval), ('delay', delay), ('lane', lane)])


OVERSHOOT = []


def build():
    waves = []
    for i, target in enumerate(CURVE):
        heavies = HEAVIES[i]
        spawns = []
        for lane, share in ((U, UPPER_SHARE[i]), (L, 1.0 - UPPER_SHARE[i])):
            want = target * share
            spent = 0
            for j, (enemy, n) in enumerate(heavies.get(lane, [])):
                spawns.append(spawn(enemy, n, HEAVY_INTERVAL[enemy], 2 + j, lane))
                spent += n * HP[enemy]
            # A lane whose heavies already cost more than its share of the
            # target cannot be filled DOWN, so the wave overshoots its point on
            # the curve and the step into it reads as a cliff. That is a fault
            # in HEAVIES, not something to paper over here, so it is reported.
            if spent > want + HP[FILLER]:
                OVERSHOOT.append(f'wave {i + 1} {lane}: heavies cost {spent:.0f} '
                                 f'against a budget of {want:.0f}')
            fill = max(0, round((want - spent) / HP[FILLER]))
            if fill:
                spawns.append(spawn(FILLER, fill, FILLER_INTERVAL[i],
                                    0 if not heavies.get(lane) else 3, lane))
        w = collections.OrderedDict([('name', NAMES[i]), ('spawns', spawns)])
        waves.append(w)
    waves.append(collections.OrderedDict([
        ('name', 'The Rainbow Reaper'), ('boss', BOSS),
        ('spawns', [spawn(BOSS, 1, 1.0, 2, L)])]))
    return waves


def totals(waves):
    hp = sum(s['count'] * HP[s['enemy']] for w in waves for s in w['spawns'])
    inc = sum(s['count'] * REWARD[s['enemy']] for w in waves for s in w['spawns'])
    return hp, inc


NOTE = (
    "LEVEL 3, SPORTS COMPLEX AT DUSK. Thirteen waves across two gates. GENERATED, not typed: "
    "the curve and the unit mix live in tools/gen_waves3.py and this file is its output, so "
    "retuning is a change there and a re-run rather than an edit here. Every count below fell "
    "out of a target health per wave; none of them was chosen on its own.")

HEALTH_NOTE = (
    "Total enemy health is {tot} against level 2's {l2}, {pct:+.1f}% across the run, and the run "
    "pays {ratio:.4f} peanuts per point of it. "
    "THE HEADLINE UNDERSTATES THE DIFFICULTY, for two reasons worth carrying into any retune. "
    "FIRST, THE LANE IS SHORTER: both routes walk 1560 px gate to exit against level 2's 1955, so "
    "20% less road and 20% less time under fire for the same health. A point of health here is "
    "worth more than a point on level 2 and the totals are not directly comparable. "
    "SECOND, THE ARMOUR IS HEAVIER: raw maxHealth is armour-blind, and this cast carries 3, 8 and "
    "12 where level 2's carries 0, 5 and 7. The Zamboni's 12 is past what Cory's Depreciation can "
    "strip, which is deliberate -- see content.test.ts. Damage the board actually has to output is "
    "well above the number above.")

LANE_NOTE = (
    "EVERY GROUP NAMES ITS LANE, which is what makes this level different from the two before it. "
    "Wave 1 is upper only and wave 2 lower only, so the two gates are taught one at a time; wave 13 "
    "is one gate because the boss arrives alone. Everything between comes down both. "
    "THE HEAVIER SIDE ALTERNATES so a board cannot be committed to one gate, and waves 9 and 11 sit "
    "close to even, which is the worst case for a lopsided board. "
    "This bites harder here than it would elsewhere because THE TWO ROUTES ARE THE SAME LENGTH, "
    "1560.18 and 1560.15 px -- see map_level3.json's _lanes note. Groups released from both gates "
    "on the same delay ARRIVE TOGETHER rather than staggered, so a split wave is a genuine "
    "two-front problem and not a queue.")


def main():
    waves = build()
    hp, inc = totals(waves)
    l2 = sum(s['count'] * HP[s['enemy']]
             for w in json.load(open(os.path.join(ROOT, 'src/data/waves.level2.json')))['waves']
             for s in w['spawns'])
    print(f'health {hp}  ({100 * (hp / l2 - 1):+.1f}% vs level 2)   '
          f'income {inc}   ratio {inc / hp:.4f}')
    for line in OVERSHOOT:
        print('  OVERSHOOT ' + line)
    prev = None
    for i, w in enumerate(waves):
        u = sum(s['count'] * HP[s['enemy']] for s in w['spawns'] if s['lane'] == U)
        l = sum(s['count'] * HP[s['enemy']] for s in w['spawns'] if s['lane'] == L)
        step = '' if prev is None else f'{100 * ((u + l) / prev - 1):+6.1f}%'
        print(f'{i + 1:3d} {w["name"]:20s} U{u:6d} L{l:6d} = {u + l:6d} {step}  '
              f'{"upper" if u > l else "lower"}')
        prev = u + l
    if '--write' in sys.argv:
        doc = collections.OrderedDict()
        doc['_note'] = NOTE
        doc['_health'] = HEALTH_NOTE.format(tot=hp, l2=l2, pct=100 * (hp / l2 - 1), ratio=inc / hp)
        doc['_lanes'] = LANE_NOTE
        doc['waves'] = waves
        io.open(os.path.join(ROOT, 'src/data/waves.level3.json'), 'w', encoding='utf8').write(
            json.dumps(doc, indent=2, ensure_ascii=False) + '\n')
        print('written src/data/waves.level3.json')


if __name__ == '__main__':
    main()
