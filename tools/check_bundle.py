#!/usr/bin/env python3
"""Check maintained documents and JSON fixtures without scanning generated dependencies."""
from pathlib import Path
import json
import math
import re

ROOT = Path(__file__).resolve().parents[1]
errors = []
EXCLUDED_PARTS = {"node_modules", "dist", "coverage", ".venv", "test-results", "artifacts"}

def maintained(path):
    return not EXCLUDED_PARTS.intersection(path.relative_to(ROOT).parts)

def check(condition, message):
    if not condition:
        errors.append(message)

markdown_paths = [p for p in sorted(ROOT.rglob('*.md')) if maintained(p)]
for p in markdown_paths:
    text = p.read_text(encoding='utf-8')
    check(not re.search(r'\[TODO|TODO:', text), f'Unfilled template: {p}')
    fence_lines = [x for x in text.splitlines() if x.startswith('```')]
    check(len(fence_lines) % 2 == 0, f'Unbalanced code fences: {p}')
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
        if target.startswith(('https://', 'http://', 'mailto:', '#')):
            continue
        relative = target.split('#')[0]
        check((p.parent / relative).exists(), f'Broken local link: {p.relative_to(ROOT)} -> {target}')
    for block in re.findall(r'```json\s*\n(.*?)\n```', text, re.S):
        try:
            json.loads(block)
        except json.JSONDecodeError as exc:
            errors.append(f'Invalid JSON example in {p.name}: {exc}')

json_paths = [p for p in ROOT.rglob('*.json') if maintained(p)]
for p in json_paths:
    try:
        json.loads(p.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        errors.append(f'Invalid JSON: {p.name}: {exc}')

cfg = json.loads((ROOT/'examples/default-config.json').read_text())
check(cfg['timing']['physicsHz'] == 60, 'Unexpected physics cadence')
check(cfg['timing']['decisionIntervalTicks'] / cfg['timing']['physicsHz'] == .1, 'Wrong decision cadence')
check(cfg['ship']['respawnDelayTicks'] / cfg['timing']['physicsHz'] == 15, 'Wrong respawn default')
check(cfg['features']['width'] == 64 and cfg['actions']['discreteCount'] == 22, 'Model adapter dimensions mismatch')
check(8*7//2*2*1 == 56 and 30*29//2*2*5 == 4350, 'Schedule formula error')

p = json.loads((ROOT/'examples/constant-forward.agent.json').read_text())
m = p['model']; width = m['inputWidth']
for layer in m['layers']:
    check(layer['inputWidth'] == width, 'Dense layer input mismatch')
    check(len(layer['weights']) == layer['inputWidth']*layer['outputWidth'], 'Dense weights length mismatch')
    check(len(layer['bias']) == layer['outputWidth'], 'Dense bias length mismatch')
    check(all(isinstance(v,(int,float)) and math.isfinite(v) for v in layer['weights']+layer['bias']), 'Nonfinite model value')
    width = layer['outputWidth']
check(width == m['outputWidth'] == 22, 'Dense output mismatch')
check(p['metadata']['trainingStatus'] == 'untrained', 'Example must be marked untrained')

# Fixture-level geometry checks. Full swept collision/connectivity remains P02 work.
data = json.loads((ROOT/'examples/twin-harbors.map.json').read_text())
polys = [island['polygon'] for island in data['islands']]
def inside(point, polygon):
    x,y=point; result=False
    for i in range(len(polygon)):
        ax,ay=polygon[i-1]; bx,by=polygon[i]
        if (ay>y)!=(by>y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
            result=not result
    return result

def distance_segment(p,a,b):
    dx=b[0]-a[0]; dy=b[1]-a[1]
    u=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)))
    return math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dy)

def clearance(p):
    if any(inside(p,poly) for poly in polys): return -1
    return min(distance_segment(p,poly[i-1],poly[i]) for poly in polys for i in range(len(poly)))

for base in data['bases']:
    check(len(base['spawnSlots']) == 8, 'Map needs eight spawn slots per team')
    for s in base['spawnSlots']:
        check(clearance((s['x'],s['y'])) >= cfg['ship']['radius'], 'Spawn intersects land')
for site in data['flagSites']:
    p=(site['position']['x'],site['position']['y'])
    a=(site['approach']['x'],site['approach']['y'])
    check(any(inside(p,poly) for poly in polys), f'Flag site is not on land: {site["id"]}')
    check(clearance(a) >= cfg['ship']['radius'], f'Flag approach too close to land: {site["id"]}')
    check(math.dist(p,a) <= site['radius'], f'Flag site out of approach range: {site["id"]}')
for x in range(180,1421,10):
    check(clearance((x,450)) >= cfg['ship']['radius'], 'Central corridor blocked')
# Every static land vertex has a mirrored partner in the same or opposite island.
vertices = {(x,y) for poly in polys for x,y in poly}
check(all((1600-x,y) in vertices for x,y in vertices), 'Map is not left-right symmetric')

if errors:
    print('\n'.join(errors))
    raise SystemExit(1)
print(f'PASS: {len(markdown_paths)} maintained Markdown files; local links, fences, JSON examples, {len(json_paths)} maintained JSON files, dimensions/defaults, and fixture geometry.')
print('Document/fixture validation passed; production sandbox/model/browser coverage is provided by Vitest and Playwright.')
