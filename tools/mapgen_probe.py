"""Prototype of the branching map generator, and the source of the numbers in
DESIGN.md's *Run structure* section.

Run from the repository root:

    python3 tools/mapgen_probe.py

Nothing at runtime reads this and no game code exists for it yet. It is here
because the claim "walking paths gives you two or three ways forward at each
step" is the kind of thing that sounds obviously true and is not: the union of
six walks leaves about a third of nodes with a single exit, which is a corridor
with decoration rather than a branching map. That is what motivates the
guarantee pass, so the measurement is kept next to the design that depends on
it.
"""

import random
import statistics
from collections import Counter

LANES = 5
WALKS = 6
# Inclusive row ranges. The last row of each act is its boss, and the map
# converges on it.
ACTS = [(1, 5), (6, 10), (11, 14)]
BOSS_ROWS = {a1 for _, a1 in ACTS}
SEEDS = 400


def generate(seed, guarantee=True):
    """Returns (nodes, edges) as sets of (row, lane) and (row, from, to)."""
    rng = random.Random(seed)
    edges, nodes = set(), set()

    for a0, a1 in ACTS:
        for _ in range(WALKS):
            # Act 1 opens on a single node, so every run starts the same way.
            lane = LANES // 2 if a0 == 1 else rng.randrange(LANES)
            for r in range(a0, a1):
                nodes.add((r, lane))
                if r == a1 - 1:
                    nxt = LANES // 2  # converge on the boss
                else:
                    # A step may not cross an edge already drawn: that is what
                    # keeps the map drawable on a flat orthogonal grid.
                    opts = [l for l in (lane - 1, lane, lane + 1)
                            if 0 <= l < LANES and not ((r, l, lane) in edges and l != lane)]
                    nxt = rng.choice(opts) if opts else lane
                edges.add((r, lane, nxt))
                lane = nxt
        nodes.add((a1, LANES // 2))

    if guarantee:
        for a0, a1 in ACTS:
            # Top to bottom, so a node this pass creates is itself given exits
            # when its own row comes round.
            for r in range(a0, a1 - 1):
                for l in sorted({l for (rr, l) in nodes if rr == r}):
                    outs = {b for (rr, a, b) in edges if rr == r and a == l}
                    while len(outs) < 2:
                        cands = [c for c in (l - 1, l, l + 1)
                                 if 0 <= c < LANES and c not in outs
                                 and not ((r, c, l) in edges and c != l)]
                        if not cands:
                            break
                        c = rng.choice(cands)
                        edges.add((r, l, c))
                        outs.add(c)
                        nodes.add((r + 1, c))
            # Anything the pass created on the penultimate row still has to
            # reach the boss.
            for l in {l for (rr, l) in nodes if rr == a1 - 1}:
                edges.add((a1 - 1, l, LANES // 2))

    return nodes, edges


def measure(guarantee):
    fanout, widths, dead, total = [], [], 0, 0
    for seed in range(SEEDS):
        nodes, edges = generate(seed, guarantee)
        out = {}
        for r, a, b in edges:
            out.setdefault((r, a), set()).add(b)
        total += len(nodes)
        for (r, l) in nodes:
            if r in BOSS_ROWS:
                continue
            n = len(out.get((r, l), ()))
            if n == 0:
                dead += 1
            # The row before a boss converges on it by design, so it is not a
            # node that failed to branch.
            if r + 1 in BOSS_ROWS:
                continue
            fanout.append(n)
        for a0, a1 in ACTS:
            for r in range(a0, a1):
                widths.append(len({l for (rr, l) in nodes if rr == r}))
    return Counter(fanout), statistics.mean(widths), dead, total / SEEDS


for guarantee in (False, True):
    c, width, dead, nodes = measure(guarantee)
    t = sum(c.values())
    label = 'walks + guarantee pass' if guarantee else 'walks alone'
    print(f'\n{label}  ({SEEDS} seeds, {LANES} lanes, {WALKS} walks per act)')
    print(f'  nodes per map {nodes:.0f}, mean row width {width:.2f}, dead ends {dead}')
    for k in sorted(c):
        print(f'  {k} way{"s" if k != 1 else " "} forward: {100 * c[k] / t:5.1f}%')
    print(f'  more than one way forward: {100 * (t - c[1]) / t:.1f}%')
