from __future__ import annotations

import copy
import math
from typing import Any

from .map_validation import validate_map
from .resources import load_map
from .rng import XorShift32, derive_seed

WORLD_WIDTH = 1600
WORLD_HEIGHT = 900


def _rounded(value: float) -> float:
    return math.floor(value * 1_000_000 + .5) / 1_000_000


def _rotate_point(point: dict[str, float]) -> dict[str, float]:
    return {"x": _rounded(WORLD_WIDTH - point["x"]), "y": _rounded(WORLD_HEIGHT - point["y"])}


def _rotate_polygon(points: list[list[float]]) -> list[list[float]]:
    return [[_rounded(WORLD_WIDTH - x), _rounded(WORLD_HEIGHT - y)] for x, y in reversed(points)]


def _island_pair(rng: XorShift32, index: int) -> dict[str, Any]:
    cx = 560 + rng.random() * 480
    cy = 145 + index * 92 + rng.random() * 24
    radius_x = 62 + rng.random() * 78
    radius_y = 42 + rng.random() * 34
    vertex_count = 8 + (rng.next_uint32() % 2) * 4
    north: list[list[float]] = []
    for vertex in range(vertex_count):
        angle = vertex / vertex_count * math.pi * 2
        factor = 1.12 if vertex == vertex_count // 4 else .76 + rng.random() * .24
        north.append([_rounded(cx + math.cos(angle) * radius_x * factor), _rounded(cy + math.sin(angle) * radius_y * factor)])
    bottom = north[vertex_count // 4]
    north_site = {"x": bottom[0], "y": bottom[1]}
    north_approach = {"x": north_site["x"], "y": _rounded(north_site["y"] + 28)}
    return {"north": north, "south": _rotate_polygon(north), "northSite": north_site, "northApproach": north_approach, "southSite": _rotate_point(north_site), "southApproach": _rotate_point(north_approach)}


def _central_island(rng: XorShift32) -> dict[str, Any]:
    radius_x = 150 + rng.random() * 110
    radius_y = 86 + rng.random() * 72
    half_vertices = 5 + rng.next_uint32() % 3
    factors = [.78 + rng.random() * .22 for _ in range(half_vertices)]
    polygon: list[list[float]] = []
    for vertex in range(half_vertices * 2):
        angle = vertex / (half_vertices * 2) * math.pi * 2
        factor = factors[vertex % half_vertices]
        polygon.append([_rounded(WORLD_WIDTH / 2 + math.cos(angle) * radius_x * factor), _rounded(WORLD_HEIGHT / 2 + math.sin(angle) * radius_y * factor)])
    south_edge = max(polygon, key=lambda point: point[1])
    north_site = _rotate_point({"x": south_edge[0], "y": south_edge[1]})
    south_site = {"x": south_edge[0], "y": south_edge[1]}
    return {"polygon": polygon, "northSite": north_site, "northApproach": {"x": north_site["x"], "y": _rounded(north_site["y"] - 28)}, "southSite": south_site, "southApproach": {"x": south_site["x"], "y": _rounded(south_site["y"] + 28)}}


def _wreck_pair(rng: XorShift32, index: int) -> dict[str, Any]:
    cx = 340 + index * 125 + rng.random() * 86
    cy = 190 + rng.random() * 520
    half_length = 28 + rng.random() * 27
    half_width = 9 + rng.random() * 9
    angle = -.55 + rng.random() * 1.1
    local = [[-half_length, -half_width], [half_length * .72, -half_width], [half_length, 0], [half_length * .72, half_width], [-half_length, half_width], [-half_length * 1.08, 0]]
    north = [[_rounded(cx + x * math.cos(angle) - y * math.sin(angle)), _rounded(cy + x * math.sin(angle) + y * math.cos(angle))] for x, y in local]
    return {"north": north, "south": _rotate_polygon(north)}


def _central_wreck(rng: XorShift32) -> list[list[float]]:
    half_length = 48 + rng.random() * 30
    half_width = 14 + rng.random() * 9
    angle = rng.random() * math.pi
    local = [[-half_length, -half_width], [half_length, -half_width], [half_length, half_width], [-half_length, half_width]]
    return [[_rounded(WORLD_WIDTH / 2 + x * math.cos(angle) - y * math.sin(angle)), _rounded(WORLD_HEIGHT / 2 + x * math.sin(angle) + y * math.cos(angle))] for x, y in local]


def generate_map(seed: int, max_attempts: int = 24) -> dict[str, Any]:
    """Deterministic, symmetric archipelago generator shared with the browser."""
    rng = XorShift32(derive_seed(seed, "map-generation"))
    last_errors: list[str] = []
    for attempt in range(1, max_attempts + 1):
        result = copy.deepcopy(load_map())
        islands = [item for item in result["islands"] if "home-island" in item["id"]]
        sites = [item for item in result["flagSites"] if item["reservedHome"]]
        central_layout = rng.next_uint32() % 4 == 0
        pair_count = 0
        if central_layout:
            island = _central_island(rng)
            islands.append({"id": "archipelago-central", "polygon": island["polygon"]})
            sites.extend([
                {"id": "archipelago-central-north-site", "position": island["northSite"], "approach": island["northApproach"], "radius": 34, "reservedHome": False},
                {"id": "archipelago-central-south-site", "position": island["southSite"], "approach": island["southApproach"], "radius": 34, "reservedHome": False},
            ])
        else:
            pair_count = 1 + rng.next_uint32() % 3
            for index in range(pair_count):
                pair = _island_pair(rng, index)
                islands.extend([{"id": f"archipelago-{index + 1}-north", "polygon": pair["north"]}, {"id": f"archipelago-{index + 1}-south", "polygon": pair["south"]}])
                sites.extend([
                    {"id": f"archipelago-{index + 1}-north-site", "position": pair["northSite"], "approach": pair["northApproach"], "radius": 34, "reservedHome": False},
                    {"id": f"archipelago-{index + 1}-south-site", "position": pair["southSite"], "approach": pair["southApproach"], "radius": 34, "reservedHome": False},
                ])
        wreck_count = rng.next_uint32() % 7
        for index in range(wreck_count // 2):
            wreck = _wreck_pair(rng, index)
            islands.extend([{"id": f"wreck-shoal-{index + 1}-north", "polygon": wreck["north"]}, {"id": f"wreck-shoal-{index + 1}-south", "polygon": wreck["south"]}])
        if wreck_count % 2:
            islands.append({"id": "wreck-shoal-central", "polygon": _central_wreck(rng)})
        result["id"] = f"shifting-archipelago-{seed}"
        result["islands"] = islands
        result["flagSites"] = sites
        result["metadata"] = {"generator": "fleetrl-archipelago-v3", "seed": seed, "attempt": attempt, "maxAttempts": max_attempts, "symmetry": "180-degree", "layout": "central-island" if central_layout else "island-pairs", "islandPairs": pair_count, "neutralIslandCount": 1 if central_layout else pair_count * 2, "wreckCount": wreck_count, "flagRelocation": "nearest-neutral-island"}
        last_errors = validate_map(result)
        if not last_errors:
            return result
    fallback = copy.deepcopy(load_map())
    fallback_source_id = fallback["id"]
    fallback["id"] = f"procedural-fallback-{seed}"
    fallback["metadata"] = {"generator": "fleetrl-archipelago-v3", "seed": seed, "maxAttempts": max_attempts, "fallback": fallback_source_id, "failure": "; ".join(last_errors)}
    return fallback
