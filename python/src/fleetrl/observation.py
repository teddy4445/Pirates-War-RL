from __future__ import annotations

import copy
from typing import Any, Iterable

from .core import neutral_action
from .geometry import circle_overlaps_polygon, distance, segment_occluded

API_VERSION = "fleetrl-agent-v1"


def _fog(state: dict[str, Any]) -> bool:
    return state["config"]["mode"] in ("fog-duel", "fog-fleet")


def _ship_view(state: dict[str, Any], ship: dict[str, Any]) -> dict[str, Any]:
    respawn = 0 if ship["respawnAtTick"] is None else max(0, ship["respawnAtTick"] - state["tick"])
    return {
        "id": ship["id"], "teamId": ship["teamId"],
        "position": dict(ship["position"]), "velocity": dict(ship["velocity"]),
        "heading": ship["heading"], "health": ship["health"], "alive": ship["alive"],
        "cooldownTicks": ship["cooldownTicks"], "respawnTicksRemaining": respawn,
        "protectionTicksRemaining": max(0, ship["protectionUntilTick"] - state["tick"]),
        "carriedFlagId": ship["carriedFlagId"],
    }


def _sensors(state: dict[str, Any], team_id: str) -> list[dict[str, Any]]:
    radius = state["config"]["vision"]["sensorRadius"]
    return [
        {"shipId": ship["id"], "position": dict(ship["position"]), "radius": radius}
        for ship in sorted(state["ships"], key=lambda item: item["id"])
        if ship["teamId"] == team_id and ship["alive"]
    ]


def _point_visible(state: dict[str, Any], sensors: Iterable[dict[str, Any]], point: dict[str, float]) -> bool:
    if not _fog(state):
        return True
    return any(
        distance(sensor["position"], point) <= sensor["radius"] + 1e-9
        and not segment_occluded(sensor["position"], point, state["map"]["islands"])
        for sensor in sensors
    )


def _flag_visibility_point(state: dict[str, Any], flag: dict[str, Any]) -> dict[str, float] | None:
    if flag["carrierShipId"]:
        carrier = next((ship for ship in state["ships"] if ship["id"] == flag["carrierShipId"]), None)
        return carrier["position"] if carrier else None
    if flag["siteId"]:
        site = next((item for item in state["map"]["flagSites"] if item["id"] == flag["siteId"]), None)
        return site["approach"] if site else flag["position"]
    return flag["position"]


def _flag_view(state: dict[str, Any], flag: dict[str, Any], team_id: str, sensors: list[dict[str, Any]]) -> dict[str, Any]:
    carrier = next((ship for ship in state["ships"] if ship["id"] == flag["carrierShipId"]), None) if flag["carrierShipId"] else None
    point = _flag_visibility_point(state, flag)
    known = not _fog(state) or (carrier is not None and carrier["teamId"] == team_id) or (point is not None and _point_visible(state, sensors, point))
    if not known:
        return {"id": flag["id"], "ownerTeamId": flag["ownerTeamId"], "known": False, "state": "unknown", "position": None, "carrierShipId": None}
    position = dict(carrier["position"]) if flag["state"] == "carried" and carrier else (dict(flag["position"]) if flag["position"] else None)
    return {"id": flag["id"], "ownerTeamId": flag["ownerTeamId"], "known": True, "state": flag["state"], "position": position, "carrierShipId": flag["carrierShipId"]}


def _filtered_events(state: dict[str, Any], team_id: str, sensors: list[dict[str, Any]], source: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    own_ids = {ship["id"] for ship in state["ships"] if ship["teamId"] == team_id}
    public_types = {"FlagCaptured", "MatchEnded"}
    records: list[dict[str, Any]] = []
    for item in source:
        own_experience = item.get("shipId") in own_ids or item.get("otherShipId") in own_ids
        visible_at_position = bool(item.get("position") and _point_visible(state, sensors, item["position"]))
        if _fog(state) and item["type"] not in public_types and not own_experience and not visible_at_position:
            continue
        record = {key: item[key] for key in ("id", "tick", "type")}
        for key in ("teamId", "flagId"):
            if key in item:
                record[key] = item[key]
        if "projectileId" in item and (item["type"] in public_types or visible_at_position):
            record["projectileId"] = item["projectileId"]
        if "position" in item and (item["type"] in public_types or visible_at_position):
            record["position"] = dict(item["position"])
        for key in ("shipId", "otherShipId"):
            if key in item and (item[key] in own_ids or not _fog(state) or visible_at_position):
                record[key] = item[key]
        if "detail" in item and (own_experience or item["type"] in public_types):
            record["detail"] = item["detail"]
        records.append(record)
    return records


def _known_legal(state: dict[str, Any], ship: dict[str, Any], flags: list[dict[str, Any]], own: list[dict[str, Any]], enemies: list[dict[str, Any]]) -> dict[str, Any]:
    empty = {"canFire": False, "fireTargetShipIds": [], "pickupFlagIds": [], "giveTargetShipIds": [], "placementSiteIds": [], "canDrop": False}
    if not ship["alive"]:
        return empty
    protected = ship["protectionUntilTick"] > state["tick"]
    fire_targets = [] if protected or ship["cooldownTicks"] > 0 else sorted(
        enemy["id"] for enemy in enemies
        if enemy["alive"] and distance(ship["position"], enemy["position"]) <= state["config"]["combat"]["projectileRange"] + 1e-9
        and not segment_occluded(ship["position"], enemy["position"], state["map"]["islands"])
    )
    pickups = []
    for view in flags:
        if not view["known"] or view["state"] in ("unknown", "carried") or (view["ownerTeamId"] == ship["teamId"] and view["state"] == "at-home") or ship["carriedFlagId"]:
            continue
        authoritative = next((item for item in state["flags"] if item["id"] == view["id"]), None)
        point = _flag_visibility_point(state, authoritative) if authoritative else view["position"]
        if point is not None and distance(ship["position"], point) <= state["config"]["flags"]["pickupRadius"] + 1e-9:
            pickups.append(view["id"])
    give = []
    if ship["carriedFlagId"]:
        give = [
            item["id"] for item in own
            if item["id"] != ship["id"] and item["alive"] and not item["carriedFlagId"]
            and item["protectionTicksRemaining"] == 0
            and distance(ship["position"], item["position"]) <= state["config"]["flags"]["giveRadius"]
            and not segment_occluded(ship["position"], item["position"], state["map"]["islands"])
        ]
    occupied = {
        authoritative["siteId"]
        for view in flags if view["known"] and view["state"] == "on-land"
        for authoritative in state["flags"] if authoritative["id"] == view["id"] and authoritative["siteId"]
    }
    placements = []
    if ship["carriedFlagId"]:
        placements = [
            site["id"] for site in state["map"]["flagSites"]
            if not site["reservedHome"] and site["id"] not in occupied
            and distance(ship["position"], site["approach"]) <= state["config"]["flags"]["placeRadius"] + 1e-9
        ]
    return {
        "canFire": bool(fire_targets),
        "fireTargetShipIds": fire_targets,
        "pickupFlagIds": [] if protected else sorted(pickups),
        "giveTargetShipIds": [] if protected else sorted(give),
        "placementSiteIds": [] if protected else sorted(placements),
        "canDrop": not protected and ship["carriedFlagId"] is not None,
    }


def build_observation(
    state: dict[str, Any], team_id: str, decision_id: int = 0,
    action_applies_at_tick: int | None = None, source_events: Iterable[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if team_id not in ("blue", "rose"):
        raise ValueError(f"Unknown team: {team_id}")
    config = state["config"]
    applies = state["tick"] + config["timing"]["decisionIntervalTicks"] if action_applies_at_tick is None else action_applies_at_tick
    sensors = _sensors(state, team_id)
    known_island_ids = set(state.get("discoveredIslandIds", {}).get(team_id, []))
    if not _fog(state) or config["vision"]["staticMapKnown"]:
        known_island_ids.update(item["id"] for item in state["map"]["islands"])
    else:
        for sensor in sensors:
            for island in state["map"]["islands"]:
                if circle_overlaps_polygon(sensor["position"], sensor["radius"], island["polygon"]):
                    known_island_ids.add(island["id"])
    known_islands = [item for item in state["map"]["islands"] if item["id"] in known_island_ids]
    own_state = sorted((ship for ship in state["ships"] if ship["teamId"] == team_id), key=lambda item: item["id"])
    ships = [_ship_view(state, ship) for ship in own_state]
    enemies = sorted([
        _ship_view(state, ship) for ship in state["ships"] if ship["teamId"] != team_id
        and (not _fog(state) or (ship["alive"] and _point_visible(state, sensors, ship["position"])))
    ], key=lambda item: item["id"])
    flags = sorted((_flag_view(state, flag, team_id, sensors) for flag in state["flags"]), key=lambda item: item["id"])
    projectiles = sorted([
        {"id": item["id"], "position": dict(item["position"]), "direction": dict(item["direction"]), "ownerTeamId": item["ownerTeamId"], "remainingRange": item["remainingRange"]}
        for item in state["projectiles"] if not _fog(state) or _point_visible(state, sensors, item["position"])
    ], key=lambda item: item["id"])
    legal = {ship["id"]: _known_legal(state, ship, flags, ships, enemies) for ship in own_state}
    held = {"actions": [copy.deepcopy(ship["heldAction"]) for ship in own_state]}
    rules = {
        "physicsHz": config["timing"]["physicsHz"], "decisionIntervalTicks": config["timing"]["decisionIntervalTicks"],
        "shipRadius": config["ship"]["radius"], "maxSpeed": config["ship"]["maxSpeed"], "maxHealth": config["ship"]["maxHealth"],
        "cooldownTicks": config["combat"]["cooldownTicks"], "respawnDelayTicks": config["ship"]["respawnDelayTicks"],
        "spawnProtectionTicks": config["ship"]["spawnProtectionTicks"], "projectileRange": config["combat"]["projectileRange"],
        "projectileSpeed": config["combat"]["projectileSpeed"], "projectileDamage": config["combat"]["damage"],
        "minDamageMultiplier": config["combat"]["minDamageMultiplier"], "maxDamageMultiplier": config["combat"]["maxDamageMultiplier"],
        "closeRangeFraction": config["combat"]["closeRangeFraction"], "impactDamagePerSpeed": config["combat"]["impactDamagePerSpeed"],
        "pickupRadius": config["flags"]["pickupRadius"], "placeRadius": config["flags"]["placeRadius"], "giveRadius": config["flags"]["giveRadius"],
        "sensorRadius": config["vision"]["sensorRadius"], "matchDurationTicks": config["match"]["durationTicks"],
        "captureTarget": config["match"]["captureTarget"], "obstacleRayRange": config["features"]["obstacleRayRange"],
    }
    events = list(state["events"] if source_events is None else source_events)
    return {
        "apiVersion": API_VERSION, "mode": config["mode"], "teamId": team_id,
        "decisionId": decision_id, "observedAtTick": state["tick"], "actionAppliesAtTick": applies,
        "simulationTimeS": state["tick"] / config["timing"]["physicsHz"],
        "remainingTimeS": max(0.0, (config["match"]["durationTicks"] - state["tick"]) / config["timing"]["physicsHz"]),
        "world": dict(config["world"]), "score": dict(state["scores"]), "kills": dict(state["kills"]), "ships": ships, "enemies": enemies,
        "flags": flags, "projectiles": projectiles,
        "bases": sorted([{"teamId": base["teamId"], "homePost": dict(base["homePost"]), "deliveryZone": {"center": dict(base["deliveryZone"]["center"]), "radius": base["deliveryZone"]["radius"]}, "approach": dict(base["approach"])} for base in state["map"]["bases"]], key=lambda item: item["teamId"]),
        "islands": sorted([{"id": item["id"], "polygon": copy.deepcopy(item["polygon"])} for item in known_islands], key=lambda item: item["id"]),
        "flagSites": sorted([{"id": item["id"], "position": dict(item["position"]), "approach": dict(item["approach"]), "radius": item["radius"], "reservedHome": item["reservedHome"]} for item in state["map"]["flagSites"] if item["reservedHome"] or any(circle_overlaps_polygon(item["position"], 1e-6, island["polygon"]) for island in known_islands)], key=lambda item: item["id"]),
        "sensors": sensors, "heldActions": held, "publicRules": rules, "legal": legal,
        "events": _filtered_events(state, team_id, sensors, events),
    }


def neutral_team_action(observation: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    return {"actions": [neutral_action(ship["id"]) for ship in observation["ships"]]}
