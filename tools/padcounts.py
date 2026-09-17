#!/usr/bin/env python3
"""How many build pads each level carries, read rather than typed.

    python3 tools/padcounts.py

Two map notes used to spell the list out -- "7, 15, 15, 14, 14, 18, 22, 19,
15" appeared in build_level8_map.py and build_level10_map.py -- and both went
wrong the moment any board changed size. They call `phrase()` now.

WHERE EACH COUNT COMES FROM. Levels 3, 4, 5, 7, 8, 9 and 10 keep their pads in
tools/level*_geometry.json, so that is read: a builder asking mid-run how big
another board is must not depend on whether that board's map has been
regenerated yet. Levels 1, 2 and 6 have no geometry file holding pads, so their
map is the source and is read instead.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# level -> (path relative to the repository root, key)
SOURCES = {
    1: ('src/data/map.json', 'buildSpots'),
    2: ('src/data/map_level2.json', 'buildSpots'),
    3: ('tools/level3_geometry.json', 'pads'),
    4: ('tools/level4_geometry.json', 'pads'),
    5: ('tools/level5_geometry.json', 'buildSpots'),
    6: ('src/data/map_level6.json', 'buildSpots'),
    7: ('tools/level7_geometry.json', 'pads'),
    8: ('tools/level8_geometry.json', 'buildSpots'),
    9: ('tools/level9_geometry.json', 'pads'),
    10: ('tools/level10_geometry.json', 'pads'),
}


def counts():
    out = {}
    for lv, (path, key) in SOURCES.items():
        out[lv] = len(json.load(open(os.path.join(ROOT, path)))[key])
    return out


def phrase(upto=10):
    c = counts()
    return ', '.join(str(c[lv]) for lv in range(1, upto + 1))


if __name__ == '__main__':
    c = counts()
    for lv in range(1, 11):
        print(f'level {lv:>2}: {c[lv]:>2} pads   ({SOURCES[lv][0]})')
    print(f'\n{phrase()}   total {sum(c.values())}')
