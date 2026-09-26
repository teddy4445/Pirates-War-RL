from __future__ import annotations

import math
from collections import deque
from typing import Any

from .geometry import circle_overlaps_polygon, distance


def _navigable(point: dict[str, float], radius: float, map_data: dict[str, Any]) -> bool:
    world = map_data["world"]
    if point["x"] < radius or point["y"] < radius or point["x"] > world["width"] - radius or point["y"] > world["height"] - radius:
        return False
    return not any(circle_overlaps_polygon(point, radius, island["polygon"]) for island in map_data["islands"])


def _delivery_zones_connected(map_data: dict[str, Any], radius: float) -> bool:
    bases = sorted(map_data["bases"], key=lambda item: item["teamId"])
    if len(bases) != 2:
        return False
    start, target = bases[0]["deliveryZone"]["center"], bases[1]["deliveryZone"]["center"]
    cell = max(radius * 2.5, 30.0); columns = math.ceil(map_data["world"]["width"] / cell); rows = math.ceil(map_data["world"]["height"] / cell)
    nearest = lambda point: (max(0, min(columns - 1, round(point["x"] / cell))), max(0, min(rows - 1, round(point["y"] / cell))))
    first, goal = nearest(start), nearest(target); queue = deque([first]); seen = {first}
    while queue:
        current = queue.popleft()
        if current == goal:
            return True
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            candidate = (current[0] + dx, current[1] + dy)
            if candidate in seen or candidate[0] < 0 or candidate[1] < 0 or candidate[0] >= columns or candidate[1] >= rows:
                continue
            point = {"x": min(map_data["world"]["width"] - radius, max(radius, candidate[0] * cell)), "y": min(map_data["world"]["height"] - radius, max(radius, candidate[1] * cell))}
            if _navigable(point, radius, map_data):
                seen.add(candidate); queue.append(candidate)
    return False


def validate_map(map_data: dict[str, Any], ship_radius: float = 12.0) -> list[str]:
    errors: list[str] = []
    if map_data.get("schemaVersion") != "fleetrl-map-v1": errors.append("unsupported map schemaVersion")
    world = map_data.get("world", {}); width, height = world.get("width", 0), world.get("height", 0)
    if not math.isfinite(width) or not math.isfinite(height) or width <= 0 or height <= 0: errors.append("world dimensions must be positive and finite")
    ids: set[str] = set()
    for island in map_data.get("islands", []):
        if island["id"] in ids: errors.append(f"duplicate island id {island['id']}")
        ids.add(island["id"])
        if len(island["polygon"]) < 3: errors.append(f"island {island['id']} needs at least three vertices")
        for x, y in island["polygon"]:
            if not math.isfinite(x) or not math.isfinite(y) or x < 0 or y < 0 or x > width or y > height: errors.append(f"island {island['id']} has an out-of-bounds vertex")
    bases = map_data.get("bases", [])
    if len(bases) != 2 or {item["teamId"] for item in bases} != {"blue", "rose"}: errors.append("map requires one blue and one rose base")
    for base in bases:
        if not 1 <= len(base["spawnSlots"]) <= 8: errors.append(f"{base['teamId']} base needs 1-8 spawn slots")
        for spawn in base["spawnSlots"]:
            if not _navigable(spawn, ship_radius, map_data): errors.append(f"{base['teamId']} spawn is not navigable")
        if not _navigable(base["deliveryZone"]["center"], ship_radius, map_data): errors.append(f"{base['teamId']} delivery zone is not navigable")
    site_ids: set[str] = set()
    for site in map_data.get("flagSites", []):
        if site["id"] in site_ids: errors.append(f"duplicate flag site id {site['id']}")
        site_ids.add(site["id"])
        if not _navigable(site["approach"], ship_radius, map_data): errors.append(f"flag site {site['id']} approach is not navigable")
        if distance(site["position"], site["approach"]) > site["radius"] + 1e-6: errors.append(f"flag site {site['id']} approach exceeds its interaction radius")
    if not errors and not _delivery_zones_connected(map_data, ship_radius): errors.append("delivery zones are not connected by validated water cells")
    return errors
