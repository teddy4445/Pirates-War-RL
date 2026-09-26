from __future__ import annotations

import math
from typing import Any

EPSILON = 1e-9


def add(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {"x": a["x"] + b["x"], "y": a["y"] + b["y"]}


def subtract(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {"x": a["x"] - b["x"], "y": a["y"] - b["y"]}


def scale(point: dict[str, float], value: float) -> dict[str, float]:
    return {"x": point["x"] * value, "y": point["y"] * value}


def dot(a: dict[str, float], b: dict[str, float]) -> float:
    return a["x"] * b["x"] + a["y"] * b["y"]


def magnitude(point: dict[str, float]) -> float:
    return math.hypot(point["x"], point["y"])


def distance(a: dict[str, float], b: dict[str, float]) -> float:
    return magnitude(subtract(a, b))


def normalize(point: dict[str, float]) -> dict[str, float]:
    length = magnitude(point)
    return {"x": 1.0, "y": 0.0} if length <= EPSILON else scale(point, 1.0 / length)


def clamp_magnitude(point: dict[str, float], maximum: float) -> dict[str, float]:
    length = magnitude(point)
    return scale(point, maximum / length) if length > maximum else point


def wrap_heading(angle: float) -> float:
    tau = math.pi * 2.0
    return ((angle + math.pi) % tau + tau) % tau - math.pi


def closest_point_on_segment(point: dict[str, float], a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    ab = subtract(b, a)
    denominator = dot(ab, ab)
    if denominator <= EPSILON:
        return dict(a)
    amount = max(0.0, min(1.0, dot(subtract(point, a), ab) / denominator))
    return add(a, scale(ab, amount))


def point_in_polygon(point: dict[str, float], polygon: list[list[float]]) -> bool:
    inside = False
    previous = polygon[-1]
    for current in polygon:
        intersects = ((current[1] > point["y"]) != (previous[1] > point["y"]) and point["x"] < (previous[0] - current[0]) * (point["y"] - current[1]) / (previous[1] - current[1]) + current[0])
        if intersects:
            inside = not inside
        previous = current
    return inside


def circle_overlaps_polygon(center: dict[str, float], radius: float, polygon: list[list[float]]) -> bool:
    if point_in_polygon(center, polygon):
        return True
    for index, raw_a in enumerate(polygon):
        raw_b = polygon[(index + 1) % len(polygon)]
        closest = closest_point_on_segment(center, {"x": raw_a[0], "y": raw_a[1]}, {"x": raw_b[0], "y": raw_b[1]})
        if distance(center, closest) <= radius + EPSILON:
            return True
    return False


def _earliest_ray_circle(origin: dict[str, float], movement: dict[str, float], center: dict[str, float], radius: float) -> float | None:
    relative = subtract(origin, center)
    a = dot(movement, movement)
    if a <= EPSILON:
        return 0.0 if magnitude(relative) <= radius else None
    b = 2.0 * dot(relative, movement)
    c = dot(relative, relative) - radius * radius
    if c <= 0:
        return 0.0
    discriminant = b * b - 4.0 * a * c
    if discriminant < 0:
        return None
    root = math.sqrt(discriminant)
    for candidate in ((-b - root) / (2.0 * a), (-b + root) / (2.0 * a)):
        if -EPSILON <= candidate <= 1.0 + EPSILON:
            return max(0.0, min(1.0, candidate))
    return None


def sweep_moving_circles(moving_start: dict[str, float], moving_end: dict[str, float], moving_radius: float, target_start: dict[str, float], target_end: dict[str, float], target_radius: float) -> float | None:
    return _earliest_ray_circle(subtract(moving_start, target_start), subtract(subtract(moving_end, moving_start), subtract(target_end, target_start)), {"x": 0.0, "y": 0.0}, moving_radius + target_radius)


def _sweep_point_capsule(origin: dict[str, float], movement: dict[str, float], a: dict[str, float], b: dict[str, float], radius: float) -> dict[str, Any] | None:
    closest = closest_point_on_segment(origin, a, b)
    if distance(origin, closest) <= radius + EPSILON:
        return {"time": 0.0, "normal": normalize(subtract(origin, closest))}
    candidates: list[dict[str, Any]] = []
    for endpoint in (a, b):
        time = _earliest_ray_circle(origin, movement, endpoint, radius)
        if time is not None:
            at = add(origin, scale(movement, time))
            candidates.append({"time": time, "normal": normalize(subtract(at, endpoint))})
    edge = subtract(b, a)
    length = magnitude(edge)
    if length > EPSILON:
        tangent = scale(edge, 1.0 / length)
        normal = {"x": -tangent["y"], "y": tangent["x"]}
        initial_distance = dot(subtract(origin, a), normal)
        delta = dot(movement, normal)
        if abs(delta) > EPSILON:
            for signed_radius in (-radius, radius):
                time = (signed_radius - initial_distance) / delta
                if -EPSILON <= time <= 1.0 + EPSILON:
                    at = add(origin, scale(movement, time))
                    along = dot(subtract(at, a), tangent)
                    if -EPSILON <= along <= length + EPSILON:
                        candidates.append({"time": max(0.0, min(1.0, time)), "normal": scale(normal, -1.0 if signed_radius < 0 else 1.0)})
    return min(candidates, key=lambda item: item["time"]) if candidates else None


def sweep_circle_against_map(start: dict[str, float], end: dict[str, float], radius: float, map_data: dict[str, Any]) -> dict[str, Any]:
    movement = subtract(end, start)
    candidates: list[dict[str, Any]] = []
    width, height = map_data["world"]["width"], map_data["world"]["height"]
    if start["x"] < radius: candidates.append({"time": 0.0, "normal": {"x": 1.0, "y": 0.0}})
    if start["x"] > width - radius: candidates.append({"time": 0.0, "normal": {"x": -1.0, "y": 0.0}})
    if start["y"] < radius: candidates.append({"time": 0.0, "normal": {"x": 0.0, "y": 1.0}})
    if start["y"] > height - radius: candidates.append({"time": 0.0, "normal": {"x": 0.0, "y": -1.0}})
    boundaries = [
        (movement["x"] < -EPSILON, (radius - start["x"]) / movement["x"] if movement["x"] else 2, {"x": 1.0, "y": 0.0}),
        (movement["x"] > EPSILON, (width - radius - start["x"]) / movement["x"] if movement["x"] else 2, {"x": -1.0, "y": 0.0}),
        (movement["y"] < -EPSILON, (radius - start["y"]) / movement["y"] if movement["y"] else 2, {"x": 0.0, "y": 1.0}),
        (movement["y"] > EPSILON, (height - radius - start["y"]) / movement["y"] if movement["y"] else 2, {"x": 0.0, "y": -1.0}),
    ]
    for enabled, time, normal in boundaries:
        if enabled and 0 <= time <= 1:
            candidates.append({"time": time, "normal": normal})
    for island in map_data["islands"]:
        polygon = island["polygon"]
        if point_in_polygon(start, polygon):
            candidates.append({"time": 0.0, "normal": scale(normalize(movement), -1.0)})
        for index, raw_a in enumerate(polygon):
            raw_b = polygon[(index + 1) % len(polygon)]
            hit = _sweep_point_capsule(start, movement, {"x": raw_a[0], "y": raw_a[1]}, {"x": raw_b[0], "y": raw_b[1]}, radius)
            if hit: candidates.append(hit)
    if not candidates:
        return {"position": end, "time": 1.0, "normal": None, "hit": False}
    earliest = min(candidates, key=lambda item: item["time"])
    safe_time = max(0.0, earliest["time"] - 1e-7)
    return {"position": add(start, scale(movement, safe_time)), "time": safe_time, "normal": earliest["normal"], "hit": True}


def segment_occluded(a: dict[str, float], b: dict[str, float], islands: list[dict[str, Any]]) -> bool:
    movement = subtract(b, a)
    for item in islands:
        polygon = item["polygon"]
        if point_in_polygon(a, polygon) or point_in_polygon(b, polygon): return True
        for index, raw_a in enumerate(polygon):
            raw_b = polygon[(index + 1) % len(polygon)]
            edge_a = {"x": raw_a[0], "y": raw_a[1]}
            edge = {"x": raw_b[0] - raw_a[0], "y": raw_b[1] - raw_a[1]}
            cross = movement["x"] * edge["y"] - movement["y"] * edge["x"]
            if abs(cross) < EPSILON: continue
            delta = subtract(edge_a, a)
            time = (delta["x"] * edge["y"] - delta["y"] * edge["x"]) / cross
            along = (delta["x"] * movement["y"] - delta["y"] * movement["x"]) / cross
            if EPSILON < time < 1 - EPSILON and EPSILON < along < 1 - EPSILON: return True
    return False
