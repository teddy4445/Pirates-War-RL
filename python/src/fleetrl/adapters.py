from __future__ import annotations

import math
from typing import Any

import numpy as np

from .core import neutral_action
from .geometry import distance, sweep_circle_against_map, wrap_heading


def _clamp(value: float, minimum: float = -1.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _relative(origin: dict[str, float], target: dict[str, float], width: float, height: float) -> tuple[float, float]:
    return _clamp((target["x"] - origin["x"]) / width), _clamp((target["y"] - origin["y"]) / height)


def _nearest(origin: dict[str, float], items: list[dict[str, Any]]) -> dict[str, Any] | None:
    return min(items, key=lambda item: (distance(origin, item["position"]), item["id"]), default=None)


def encode_ship_v1(observation: dict[str, Any], ship_id: str) -> np.ndarray:
    ship = next((item for item in observation["ships"] if item["id"] == ship_id), None)
    if ship is None:
        raise ValueError(f"encode_ship_v1 rejected non-owned ship {ship_id}.")
    rules = observation["publicRules"]; width = observation["world"]["width"]; height = observation["world"]["height"]
    diagonal = math.hypot(width, height)
    home = next(item for item in observation["bases"] if item["teamId"] == observation["teamId"])
    enemy_base = next(item for item in observation["bases"] if item["teamId"] != observation["teamId"])
    home_rel = _relative(ship["position"], home["deliveryZone"]["center"], width, height)
    enemy_rel = _relative(ship["position"], enemy_base["approach"], width, height)
    enemy_flag = next((item for item in observation["flags"] if item["ownerTeamId"] != observation["teamId"]), None)
    own_flag = next((item for item in observation["flags"] if item["ownerTeamId"] == observation["teamId"]), None)
    enemy_point = enemy_flag["position"] if enemy_flag and enemy_flag["known"] else None
    own_point = own_flag["position"] if own_flag and own_flag["known"] else None
    nearest_enemy = _nearest(ship["position"], [item for item in observation["enemies"] if item["alive"]])
    nearest_mate = _nearest(ship["position"], [item for item in observation["ships"] if item["id"] != ship["id"] and item["alive"]])
    other_team = "rose" if observation["teamId"] == "blue" else "blue"
    values: list[float] = [
        _clamp(ship["position"]["x"] / width, 0, 1), _clamp(ship["position"]["y"] / height, 0, 1),
        _clamp(ship["velocity"]["x"] / rules["maxSpeed"]), _clamp(ship["velocity"]["y"] / rules["maxSpeed"]),
        math.sin(ship["heading"]), math.cos(ship["heading"]), _clamp(ship["health"] / rules["maxHealth"], 0, 1),
        _clamp(ship["cooldownTicks"] / max(1, rules["cooldownTicks"]), 0, 1), 1.0 if ship["carriedFlagId"] else 0.0,
        1.0 if ship["alive"] else 0.0, _clamp(ship["respawnTicksRemaining"] / max(1, rules["respawnDelayTicks"]), 0, 1),
        _clamp(ship["protectionTicksRemaining"] / max(1, rules["spawnProtectionTicks"]), 0, 1),
        home_rel[0], home_rel[1], enemy_rel[0], enemy_rel[1],
        _clamp(distance(ship["position"], home["deliveryZone"]["center"]) / diagonal, 0, 1),
        _clamp(distance(ship["position"], enemy_base["approach"]) / diagonal, 0, 1),
        _clamp(observation["remainingTimeS"] / (rules["matchDurationTicks"] / rules["physicsHz"]), 0, 1),
        _clamp((observation["score"][observation["teamId"]] - observation["score"][other_team]) / max(1, rules["captureTarget"])),
    ]
    enemy_flag_rel = _relative(ship["position"], enemy_point, width, height) if enemy_point else (0.0, 0.0)
    enemy_on_own = bool(enemy_flag and enemy_flag["state"] == "carried" and enemy_flag["carrierShipId"] and any(item["id"] == enemy_flag["carrierShipId"] for item in observation["ships"]))
    values.extend([1.0 if enemy_flag and enemy_flag["known"] else 0.0, *enemy_flag_rel, 1.0 if enemy_on_own else 0.0, 1.0 if enemy_flag and enemy_flag["state"] == "at-home" else 0.0])
    own_flag_rel = _relative(ship["position"], own_point, width, height) if own_point else (0.0, 0.0)
    values.extend([1.0 if own_flag and own_flag["known"] else 0.0, *own_flag_rel])
    if nearest_enemy:
        rel = _relative(ship["position"], nearest_enemy["position"], width, height)
        bearing = wrap_heading(math.atan2(nearest_enemy["position"]["y"] - ship["position"]["y"], nearest_enemy["position"]["x"] - ship["position"]["x"]) - ship["heading"])
        values.extend([1, *rel, _clamp(nearest_enemy["velocity"]["x"] / rules["maxSpeed"]), _clamp(nearest_enemy["velocity"]["y"] / rules["maxSpeed"]), math.sin(nearest_enemy["heading"]), math.cos(nearest_enemy["heading"]), _clamp(nearest_enemy["health"] / rules["maxHealth"], 0, 1), 1.0 if nearest_enemy["carriedFlagId"] == (own_flag or {}).get("id") else 0.0, _clamp(distance(ship["position"], nearest_enemy["position"]) / diagonal, 0, 1), math.sin(bearing), math.cos(bearing)])
    else:
        values.extend([0.0] * 12)
    if nearest_mate:
        rel = _relative(ship["position"], nearest_mate["position"], width, height)
        values.extend([1, *rel, _clamp(nearest_mate["health"] / rules["maxHealth"], 0, 1), 1.0 if nearest_mate["carriedFlagId"] == (enemy_flag or {}).get("id") else 0.0, _clamp(distance(ship["position"], nearest_mate["position"]) / diagonal, 0, 1), math.sin(nearest_mate["heading"]), math.cos(nearest_mate["heading"])])
    else:
        values.extend([0.0] * 8)
    map_data = {"world": dict(observation["world"]), "islands": [{"id": item["id"], "polygon": item["polygon"]} for item in observation["islands"]]}
    for ray in range(8):
        angle = ship["heading"] + ray * math.pi / 4
        ray_range = rules["obstacleRayRange"]
        end = {"x": ship["position"]["x"] + math.cos(angle) * ray_range, "y": ship["position"]["y"] + math.sin(angle) * ray_range}
        values.append(_clamp(sweep_circle_against_map(ship["position"], end, rules["shipRadius"], map_data)["time"], 0, 1))
    legal = observation["legal"].get(ship_id, {})
    values.extend([
        1.0 if observation["teamId"] == "blue" else 0.0, 1.0 if observation["mode"] in ("duel", "fleet") else 0.0,
        _clamp(len(observation["ships"]) / 8, 0, 1), _clamp(observation["score"][observation["teamId"]] / max(1, rules["captureTarget"]), 0, 1),
        _clamp(observation["score"][other_team] / max(1, rules["captureTarget"]), 0, 1),
        1.0 if own_flag and own_flag["known"] and own_flag["state"] == "at-home" else 0.0,
        1.0 if legal.get("pickupFlagIds") else 0.0, 1.0 if legal.get("giveTargetShipIds") else 0.0,
    ])
    if len(values) != 64:
        raise RuntimeError(f"ship-64-v1 produced {len(values)} values.")
    result = np.asarray(values, dtype=np.float32)
    if not np.isfinite(result).all():
        raise ValueError("ship-64-v1 produced a non-finite value.")
    return result


def decode_discrete_v1(observation: dict[str, Any], ship_id: str, action_id: int) -> dict[str, Any]:
    ship = next((item for item in observation["ships"] if item["id"] == ship_id), None)
    if ship is None:
        raise ValueError(f"decode_discrete_v1 rejected non-owned ship {ship_id}.")
    if isinstance(action_id, bool) or not isinstance(action_id, (int, np.integer)) or not 0 <= int(action_id) <= 21:
        raise ValueError("discrete-22-v1 action_id must be an integer from 0 to 21.")
    action_id = int(action_id)
    if action_id <= 17:
        motion = action_id % 9
        fire = bool(action_id // 9)
        legal = observation["legal"].get(ship_id, {})
        target = _nearest(ship["position"], [item for item in observation["enemies"] if item["id"] in legal.get("fireTargetShipIds", [])])
        return {"shipId": ship_id, "throttle": motion // 3 - 1, "turn": motion % 3 - 1, "fire": bool(fire and target), "fireTargetShipId": target["id"] if fire and target else None, "interact": {"type": "none"}}
    action = neutral_action(ship_id); legal = observation["legal"].get(ship_id)
    if not legal:
        return action
    if action_id == 18 and legal["pickupFlagIds"]:
        choices = [item for item in observation["flags"] if item["id"] in legal["pickupFlagIds"] and item["position"]]
        target = _nearest(ship["position"], choices)
        if target: action["interact"] = {"type": "pickup", "flagId": target["id"]}
    elif action_id == 19 and legal["giveTargetShipIds"]:
        target = _nearest(ship["position"], [item for item in observation["ships"] if item["id"] in legal["giveTargetShipIds"]])
        if target: action["interact"] = {"type": "give", "targetShipId": target["id"]}
    elif action_id == 20 and legal["placementSiteIds"]:
        candidates = [{**item, "position": item["approach"]} for item in observation["flagSites"] if item["id"] in legal["placementSiteIds"]]
        target = _nearest(ship["position"], candidates)
        if target: action["interact"] = {"type": "place", "flagSiteId": target["id"]}
    elif action_id == 21 and legal["canDrop"]:
        action["interact"] = {"type": "drop"}
    return action


def discrete_action_mask_v1(observation: dict[str, Any], ship_id: str) -> np.ndarray:
    ship = next((item for item in observation["ships"] if item["id"] == ship_id), None)
    if ship is None:
        raise ValueError(f"mask rejected non-owned ship {ship_id}.")
    mask = np.zeros(22, dtype=np.int8)
    if not ship["alive"]:
        mask[4] = 1
        return mask
    mask[:9] = 1
    legal = observation["legal"].get(ship_id, {})
    if legal.get("canFire"): mask[9:18] = 1
    mask[18] = bool(legal.get("pickupFlagIds")); mask[19] = bool(legal.get("giveTargetShipIds"))
    mask[20] = bool(legal.get("placementSiteIds")); mask[21] = bool(legal.get("canDrop"))
    return mask
