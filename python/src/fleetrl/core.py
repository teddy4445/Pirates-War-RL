from __future__ import annotations

import copy
import math
from typing import Any

from .geometry import add, circle_overlaps_polygon, clamp_magnitude, distance, dot, scale, segment_occluded, subtract, sweep_circle_against_map, sweep_moving_circles, wrap_heading
from .rng import XorShift32, derive_seed

TEAM_IDS = ("blue", "rose")


def _update_island_discoveries(state: dict[str, Any]) -> None:
    fog = state["config"]["mode"] in ("fog-duel", "fog-fleet")
    state.setdefault("discoveredIslandIds", {"blue": [], "rose": []})
    for team_id in TEAM_IDS:
        known = set(state["discoveredIslandIds"][team_id])
        if not fog or state["config"]["vision"]["staticMapKnown"]:
            known.update(island["id"] for island in state["map"]["islands"])
        else:
            for ship in (item for item in state["ships"] if item["teamId"] == team_id and item["alive"]):
                for island in state["map"]["islands"]:
                    if circle_overlaps_polygon(ship["position"], state["config"]["vision"]["sensorRadius"], island["polygon"]):
                        known.add(island["id"])
        state["discoveredIslandIds"][team_id] = sorted(known)


def neutral_action(ship_id: str) -> dict[str, Any]:
    return {"shipId": ship_id, "throttle": 0.0, "turn": 0.0, "fire": False, "fireTargetShipId": None, "interact": {"type": "none"}}


def create_world(config: dict[str, Any], map_data: dict[str, Any], seed: int) -> dict[str, Any]:
    count = 1 if config["mode"] in ("duel", "fog-duel") else config["shipsPerTeam"]
    ships: list[dict[str, Any]] = []
    for team_id in TEAM_IDS:
        base = next(base for base in map_data["bases"] if base["teamId"] == team_id)
        for index in range(count):
            spawn = base["spawnSlots"][index]
            ship_id = f"{team_id}-{index + 1}"
            ships.append({"id": ship_id, "teamId": team_id, "spawnPosition": {"x": spawn["x"], "y": spawn["y"]}, "spawnHeading": spawn["heading"], "position": {"x": spawn["x"], "y": spawn["y"]}, "velocity": {"x": 0.0, "y": 0.0}, "heading": spawn["heading"], "radius": config["ship"]["radius"], "health": config["ship"]["maxHealth"], "alive": True, "respawnAtTick": None, "protectionUntilTick": 0, "cooldownTicks": 0, "carriedFlagId": None, "heldAction": neutral_action(ship_id)})
    ships.sort(key=lambda item: item["id"])
    flags = []
    for owner in TEAM_IDS:
        base = next(base for base in map_data["bases"] if base["teamId"] == owner)
        flags.append({"id": f"{owner}-flag", "ownerTeamId": owner, "state": "at-home", "position": dict(base["homePost"]), "carrierShipId": None, "siteId": base["homeFlagSiteId"], "changedAtTick": 0})
    state = {"engineVersion": "fleetrl-engine-py-v5", "tick": 0, "seed": seed & 0xFFFFFFFF, "tieBreakRngState": derive_seed(seed, "tie-break"), "nextEntitySequence": 1, "config": copy.deepcopy(config), "map": copy.deepcopy(map_data), "ships": ships, "flags": flags, "projectiles": [], "scores": {"blue": 0, "rose": 0}, "kills": {"blue": 0, "rose": 0}, "discoveredIslandIds": {"blue": [], "rose": []}, "events": [], "outcome": None}
    _update_island_discoveries(state)
    return state


def _emit(state: dict[str, Any], event_type: str, **fields: Any) -> None:
    record = {"id": f"e-{state['tick']}-{state['nextEntitySequence']}", "tick": state["tick"], "type": event_type, **fields}
    state["nextEntitySequence"] += 1
    state["events"].append(record)


def _protected(ship: dict[str, Any], tick: int) -> bool:
    return ship["protectionUntilTick"] > tick


def _can_occupy(state: dict[str, Any], ship: dict[str, Any], position: dict[str, float]) -> bool:
    if sweep_circle_against_map(position, position, ship["radius"], state["map"])["hit"]: return False
    return not any(other["alive"] and other["id"] != ship["id"] and distance(position, other["position"]) < ship["radius"] + other["radius"] - 1e-7 for other in state["ships"])


def _respawns_and_cooldowns(state: dict[str, Any]) -> None:
    amount = state["config"]["ship"]["radius"] * 2.5
    offsets = ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
    for ship in state["ships"]:
        if ship["alive"]:
            if ship["cooldownTicks"] > 0: ship["cooldownTicks"] -= 1
            continue
        if ship["respawnAtTick"] is None or ship["respawnAtTick"] > state["tick"]: continue
        candidate = next(({"x": ship["spawnPosition"]["x"] + x * amount, "y": ship["spawnPosition"]["y"] + y * amount} for x, y in offsets if _can_occupy(state, ship, {"x": ship["spawnPosition"]["x"] + x * amount, "y": ship["spawnPosition"]["y"] + y * amount})), None)
        if candidate is None: continue
        ship.update({"alive": True, "position": candidate, "velocity": {"x": 0.0, "y": 0.0}, "heading": ship["spawnHeading"], "health": state["config"]["ship"]["maxHealth"], "cooldownTicks": 0, "respawnAtTick": None, "protectionUntilTick": state["tick"] + state["config"]["ship"]["spawnProtectionTicks"], "carriedFlagId": None, "heldAction": neutral_action(ship["id"])})
        _emit(state, "ShipRespawned", shipId=ship["id"], teamId=ship["teamId"], position=dict(ship["position"]))


def _impact_damage(state: dict[str, Any], inward_speed: float) -> int:
    if not state["config"]["combat"]["rammingDamage"] or inward_speed <= 0:
        return 0
    return math.floor(inward_speed * state["config"]["combat"]["impactDamagePerSpeed"] + 0.5)


def _add_damage(damage: dict[str, float], ship_id: str, amount: float) -> None:
    if amount > 0:
        damage[ship_id] = damage.get(ship_id, 0) + amount


def _resolve_contacts(state: dict[str, Any], damage: dict[str, float], killer_teams: dict[str, str]) -> None:
    living = sorted((ship for ship in state["ships"] if ship["alive"]), key=lambda item: item["id"])
    for iteration in range(4):
        for left_index, left in enumerate(living):
            for right in living[left_index + 1:]:
                delta = subtract(right["position"], left["position"])
                actual = math.hypot(delta["x"], delta["y"])
                minimum = left["radius"] + right["radius"]
                if actual >= minimum - 1e-9: continue
                normal = scale(delta, 1.0 / actual) if actual > 1e-9 else {"x": 1.0, "y": 0.0}
                correction = (minimum - actual) / 2.0 + 1e-7
                left["position"] = subtract(left["position"], scale(normal, correction)); right["position"] = add(right["position"], scale(normal, correction))
                relative = dot(subtract(right["velocity"], left["velocity"]), normal)
                left_damage = right_damage = 0
                left_impact_speed = right_impact_speed = 0.0
                if iteration == 0 and relative < 0:
                    left_impact_speed = max(0.0, dot(left["velocity"], normal))
                    right_impact_speed = max(0.0, dot(right["velocity"], scale(normal, -1.0)))
                    left_damage = 0 if _protected(left, state["tick"]) else _impact_damage(state, left_impact_speed)
                    right_damage = 0 if _protected(right, state["tick"]) else _impact_damage(state, right_impact_speed)
                    _add_damage(damage, left["id"], left_damage); _add_damage(damage, right["id"], right_damage)
                    if left["teamId"] != right["teamId"]:
                        if left_damage > 0: killer_teams[left["id"]] = right["teamId"]
                        if right_damage > 0: killer_teams[right["id"]] = left["teamId"]
                if relative < 0:
                    impulse = relative / 2.0
                    left["velocity"] = add(left["velocity"], scale(normal, impulse)); right["velocity"] = subtract(right["velocity"], scale(normal, impulse))
                if iteration == 0: _emit(state, "ShipContact", shipId=left["id"], otherShipId=right["id"], position=scale(add(left["position"], right["position"]), 0.5), damage=left_damage, otherDamage=right_damage, impactSpeed=left_impact_speed, otherImpactSpeed=right_impact_speed)


def _intercept_direction(origin: dict[str, float], target: dict[str, Any], projectile_speed: float) -> dict[str, float]:
    relative = subtract(target["position"], origin)
    a = dot(target["velocity"], target["velocity"]) - projectile_speed * projectile_speed
    b = 2.0 * dot(relative, target["velocity"])
    c = dot(relative, relative)
    intercept_time = None
    if abs(a) <= 1e-12:
        candidate = -c / b if abs(b) > 1e-12 else -1.0
        if candidate > 1e-9:
            intercept_time = candidate
    else:
        discriminant = b * b - 4.0 * a * c
        if discriminant >= 0:
            root = math.sqrt(discriminant)
            candidates = sorted(value for value in ((-b - root) / (2.0 * a), (-b + root) / (2.0 * a)) if value > 1e-9)
            intercept_time = candidates[0] if candidates else None
    aim = relative if intercept_time is None else add(relative, scale(target["velocity"], intercept_time))
    magnitude = math.hypot(aim["x"], aim["y"])
    return scale(aim, 1.0 / magnitude) if magnitude > 1e-12 else {"x": math.cos(target["heading"]), "y": math.sin(target["heading"])}


def _projectile_damage(state: dict[str, Any], shot_distance: float) -> int:
    combat = state["config"]["combat"]
    range_fraction = max(0.0, min(1.0, shot_distance / combat["projectileRange"]))
    multiplier = combat["maxDamageMultiplier"] - (combat["maxDamageMultiplier"] - combat["minDamageMultiplier"]) * range_fraction
    return max(1, math.floor(combat["damage"] * multiplier + 0.5))


def _spawn_projectiles(state: dict[str, Any]) -> None:
    config = state["config"]
    for ship in state["ships"]:
        if not ship["alive"] or _protected(ship, state["tick"]) or not ship["heldAction"]["fire"] or ship["cooldownTicks"] > 0: continue
        opponents = [item for item in state["ships"] if item["teamId"] != ship["teamId"] and item["alive"]]
        requested_id = ship["heldAction"].get("fireTargetShipId")
        requested = next((item for item in opponents if item["id"] == requested_id), None) if requested_id else None
        target = requested
        if target is None and not requested_id:
            candidates = sorted((item for item in opponents if distance(ship["position"], item["position"]) <= config["combat"]["projectileRange"] + 1e-9), key=lambda item: (distance(ship["position"], item["position"]), item["id"]))
            target = candidates[0] if candidates else None
        if target is None: continue
        direction = _intercept_direction(ship["position"], target, config["combat"]["projectileSpeed"])
        muzzle = add(ship["position"], scale(direction, ship["radius"] + config["combat"]["projectileRadius"] + 1))
        if sweep_circle_against_map(ship["position"], muzzle, config["combat"]["projectileRadius"], state["map"])["hit"]: continue
        projectile_id = f"projectile-{state['nextEntitySequence']}"; state["nextEntitySequence"] += 1
        state["projectiles"].append({"id": projectile_id, "ownerTeamId": ship["teamId"], "ownerShipId": ship["id"], "targetShipId": target["id"], "position": muzzle, "previousPosition": dict(muzzle), "direction": direction, "radius": config["combat"]["projectileRadius"], "damage": config["combat"]["damage"], "distanceTraveled": 0.0, "remainingRange": config["combat"]["projectileRange"], "spawnedAtTick": state["tick"]})
        ship["cooldownTicks"] = config["combat"]["cooldownTicks"]
        _emit(state, "CannonFired", shipId=ship["id"], teamId=ship["teamId"], projectileId=projectile_id, position=dict(muzzle))


def _drop_flag(state: dict[str, Any], ship: dict[str, Any], reason: str = "manual") -> None:
    if not ship["carriedFlagId"]: return
    flag = next(flag for flag in state["flags"] if flag["id"] == ship["carriedFlagId"])
    occupied = {item["siteId"] for item in state["flags"] if item["id"] != flag["id"] and item["siteId"]}
    sites = sorted((item for item in state["map"]["flagSites"] if not item["reservedHome"] and item["id"] not in occupied), key=lambda item: (distance(ship["position"], item["position"]), item["id"]))
    site = sites[0] if sites else None
    flag.update({"state": "on-land" if site else "in-water", "position": dict(site["position"] if site else ship["position"]), "carrierShipId": None, "siteId": site["id"] if site else None, "changedAtTick": state["tick"]}); ship["carriedFlagId"] = None
    _emit(state, "FlagRelocatedToIsland" if site else "FlagDroppedWater", shipId=ship["id"], flagId=flag["id"], position=dict(flag["position"]), detail=f"{reason}:{site['id']}" if site else reason)


def _resolve_projectiles(state: dict[str, Any], previous: dict[str, dict[str, float]], damage: dict[str, float], killer_teams: dict[str, str]) -> None:
    config = state["config"]; dt = 1.0 / config["timing"]["physicsHz"]; retained = []
    for projectile in sorted(state["projectiles"], key=lambda item: item["id"]):
        projectile["previousPosition"] = dict(projectile["position"])
        travel = min(projectile["remainingRange"], config["combat"]["projectileSpeed"] * dt)
        desired = add(projectile["position"], scale(projectile["direction"], travel)); terrain = sweep_circle_against_map(projectile["position"], desired, projectile["radius"], state["map"])
        hit_time = terrain["time"] if terrain["hit"] else 1.000000001; target = None
        for ship in state["ships"]:
            if not ship["alive"] or ship["teamId"] == projectile["ownerTeamId"]: continue
            collision = sweep_moving_circles(projectile["position"], desired, projectile["radius"], previous.get(ship["id"], ship["position"]), ship["position"], ship["radius"])
            if collision is not None and (collision < hit_time - 1e-9 or (abs(collision - hit_time) <= 1e-9 and target and ship["id"] < target["id"])):
                hit_time, target = collision, ship
        impact = add(projectile["position"], scale(subtract(desired, projectile["position"]), min(1.0, hit_time)))
        if target:
            shot_distance = projectile.get("distanceTraveled", 0.0) + travel * min(1.0, hit_time)
            protected = _protected(target, state["tick"])
            actual_damage = 0 if protected else _projectile_damage(state, shot_distance)
            close_range = shot_distance <= config["combat"]["projectileRange"] * config["combat"]["closeRangeFraction"] + 1e-9
            if not protected: damage[target["id"]] = damage.get(target["id"], 0) + actual_damage; killer_teams[target["id"]] = projectile["ownerTeamId"]
            fields = {"projectileId": projectile["id"], "shipId": projectile["ownerShipId"], "otherShipId": target["id"], "position": impact, "damage": actual_damage, "shotDistance": shot_distance, "closeRange": close_range}
            if protected: fields["detail"] = "protected"
            _emit(state, "ProjectileHitShip", **fields); continue
        if terrain["hit"]: _emit(state, "ProjectileHitTerrain", projectileId=projectile["id"], shipId=projectile["ownerShipId"], position=impact); continue
        projectile["position"] = desired; projectile["remainingRange"] -= travel; projectile["distanceTraveled"] = projectile.get("distanceTraveled", 0.0) + travel
        if projectile["remainingRange"] <= 1e-7: _emit(state, "ProjectileExpired", projectileId=projectile["id"], shipId=projectile["ownerShipId"], position=dict(desired))
        else: retained.append(projectile)
    state["projectiles"] = retained
    for ship in state["ships"]:
        amount = damage.get(ship["id"], 0)
        if ship["alive"] and amount > 0:
            ship["health"] = max(0, ship["health"] - amount); _emit(state, "ShipDamaged", shipId=ship["id"], teamId=ship["teamId"], position=dict(ship["position"]), damage=amount, detail=str(amount))
    for ship in sorted((item for item in state["ships"] if item["alive"] and item["health"] <= 0), key=lambda item: item["id"]):
        _drop_flag(state, ship, "carrier-death")
        killer = killer_teams.get(ship["id"])
        if killer: state["kills"][killer] += 1
        ship.update({"alive": False, "velocity": {"x": 0.0, "y": 0.0}, "respawnAtTick": state["tick"] + config["ship"]["respawnDelayTicks"], "protectionUntilTick": 0, "cooldownTicks": 0, "heldAction": neutral_action(ship["id"])})
        fields = {"shipId": ship["id"], "teamId": ship["teamId"], "position": dict(ship["position"])}
        if killer: fields["detail"] = f"killer:{killer}"
        _emit(state, "ShipSunk", **fields)


def _flag_point(state: dict[str, Any], flag: dict[str, Any]) -> dict[str, float] | None:
    if flag["siteId"]:
        site = next((item for item in state["map"]["flagSites"] if item["id"] == flag["siteId"]), None)
        return site["approach"] if site else flag["position"]
    return flag["position"]


def _resolve_interactions(state: dict[str, Any], intents: list[dict[str, Any]]) -> None:
    eligible = {ship["id"]: ship for ship in state["ships"] if ship["alive"] and not _protected(ship, state["tick"])}
    possession = {ship["id"]: ship["carriedFlagId"] for ship in state["ships"]}; snapshots = {flag["id"]: copy.deepcopy(flag) for flag in state["flags"]}
    pickups: dict[str, list[tuple[dict[str, Any], float]]] = {}; other = []
    for intent in sorted(intents, key=lambda item: item["shipId"]):
        ship = eligible.get(intent["shipId"]); interaction = intent["interaction"]
        if not ship or interaction["type"] == "none": continue
        if interaction["type"] != "pickup": other.append(intent); continue
        flag = snapshots.get(interaction.get("flagId"))
        if not flag or flag["state"] == "carried" or possession[ship["id"]] or (flag["ownerTeamId"] == ship["teamId"] and flag["state"] == "at-home"): continue
        point = _flag_point(state, flag); separation = distance(ship["position"], point) if point else math.inf
        if separation <= state["config"]["flags"]["pickupRadius"] + 1e-9: pickups.setdefault(flag["id"], []).append((ship, separation))
    rng = XorShift32(state["tieBreakRngState"])
    for flag_id, candidates in sorted(pickups.items()):
        candidates.sort(key=lambda item: (item[1], item[0]["id"])); best = candidates[0][1]; tied = [item for item in candidates if abs(item[1] - best) <= 1e-9]
        winner = tied[rng.next_uint32() % len(tied)][0] if len(tied) > 1 else tied[0][0]
        flag = next(item for item in state["flags"] if item["id"] == flag_id)
        if flag["ownerTeamId"] == winner["teamId"]:
            base = next(item for item in state["map"]["bases"] if item["teamId"] == flag["ownerTeamId"]); flag.update({"state": "at-home", "position": dict(base["homePost"]), "carrierShipId": None, "siteId": base["homeFlagSiteId"], "changedAtTick": state["tick"]}); _emit(state, "FlagRecovered", flagId=flag_id, shipId=winner["id"], teamId=winner["teamId"], position=dict(base["homePost"]))
        else:
            flag.update({"state": "carried", "position": None, "carrierShipId": winner["id"], "siteId": None, "changedAtTick": state["tick"]}); winner["carriedFlagId"] = flag_id; _emit(state, "FlagPickedUp", flagId=flag_id, shipId=winner["id"], teamId=winner["teamId"], position=dict(winner["position"]))
    state["tieBreakRngState"] = rng.state
    occupied = {flag["siteId"] for flag in state["flags"] if flag["siteId"]}
    for intent in other:
        ship = eligible.get(intent["shipId"]); interaction = intent["interaction"]
        if not ship: continue
        carried_id = possession[ship["id"]]; carried = next((flag for flag in state["flags"] if flag["id"] == carried_id), None)
        if interaction["type"] == "drop" and carried and carried["carrierShipId"] == ship["id"]: _drop_flag(state, ship, "manual")
        elif interaction["type"] == "give" and carried and carried["carrierShipId"] == ship["id"]:
            receiver = eligible.get(interaction.get("targetShipId"))
            if receiver and receiver["id"] != ship["id"] and receiver["teamId"] == ship["teamId"] and not possession[receiver["id"]] and distance(ship["position"], receiver["position"]) <= state["config"]["flags"]["giveRadius"] and not segment_occluded(ship["position"], receiver["position"], state["map"]["islands"]):
                ship["carriedFlagId"] = None; receiver["carriedFlagId"] = carried["id"]; carried["carrierShipId"] = receiver["id"]; carried["changedAtTick"] = state["tick"]; _emit(state, "FlagGiven", flagId=carried["id"], shipId=ship["id"], otherShipId=receiver["id"], teamId=ship["teamId"], position=dict(receiver["position"]))
        elif interaction["type"] == "place" and carried and carried["carrierShipId"] == ship["id"]:
            site = next((item for item in state["map"]["flagSites"] if item["id"] == interaction.get("flagSiteId")), None)
            if site and not site["reservedHome"] and site["id"] not in occupied and distance(ship["position"], site["approach"]) <= state["config"]["flags"]["placeRadius"]:
                ship["carriedFlagId"] = None; carried.update({"state": "on-land", "position": dict(site["position"]), "carrierShipId": None, "siteId": site["id"], "changedAtTick": state["tick"]}); occupied.add(site["id"]); _emit(state, "FlagPlaced", flagId=carried["id"], shipId=ship["id"], teamId=ship["teamId"], position=dict(site["position"]))


def _returns_captures_outcome(state: dict[str, Any]) -> None:
    config = state["config"]
    for flag in state["flags"]:
        if flag["state"] in ("in-water", "on-land") and state["tick"] - flag["changedAtTick"] >= config["flags"]["looseReturnTicks"]:
            base = next(item for item in state["map"]["bases"] if item["teamId"] == flag["ownerTeamId"]); flag.update({"state": "at-home", "position": dict(base["homePost"]), "carrierShipId": None, "siteId": base["homeFlagSiteId"], "changedAtTick": state["tick"]}); _emit(state, "FlagAutoReturned", flagId=flag["id"], teamId=flag["ownerTeamId"], position=dict(base["homePost"]))
    captures = []
    for ship in (item for item in state["ships"] if item["alive"] and not _protected(item, state["tick"]) and item["carriedFlagId"]):
        flag = next(item for item in state["flags"] if item["id"] == ship["carriedFlagId"]); own = next(item for item in state["flags"] if item["ownerTeamId"] == ship["teamId"]); base = next(item for item in state["map"]["bases"] if item["teamId"] == ship["teamId"])
        if (not config["flags"]["requireOwnFlagHome"] or own["state"] == "at-home") and distance(ship["position"], base["deliveryZone"]["center"]) <= base["deliveryZone"]["radius"]: captures.append((ship, flag))
    for ship, flag in sorted(captures, key=lambda item: item[0]["id"]):
        enemy_base = next(item for item in state["map"]["bases"] if item["teamId"] == flag["ownerTeamId"]); state["scores"][ship["teamId"]] += 1; ship["carriedFlagId"] = None; flag.update({"state": "at-home", "position": dict(enemy_base["homePost"]), "carrierShipId": None, "siteId": enemy_base["homeFlagSiteId"], "changedAtTick": state["tick"]}); _emit(state, "FlagCaptured", flagId=flag["id"], shipId=ship["id"], teamId=ship["teamId"], position=dict(ship["position"]))
    blue, rose = state["scores"]["blue"], state["scores"]["rose"]
    reason = "capture-target" if blue >= config["match"]["captureTarget"] or rose >= config["match"]["captureTarget"] else "time-limit" if state["tick"] + 1 >= config["match"]["durationTicks"] else None
    if reason:
        capture_winner = None if blue == rose else "blue" if blue > rose else "rose"
        kill_winner = None if state["kills"]["blue"] == state["kills"]["rose"] else "blue" if state["kills"]["blue"] > state["kills"]["rose"] else "rose"
        winner = capture_winner if capture_winner else kill_winner
        outcome_reason = "kill-tiebreak" if reason == "time-limit" and not capture_winner and kill_winner else reason
        state["outcome"] = {"kind": "win" if winner else "draw", "winner": winner, "reason": outcome_reason, "endedAtTick": state["tick"]}; fields = {"detail": f"{state['outcome']['kind']}:{outcome_reason}"};
        if winner: fields["teamId"] = winner
        _emit(state, "MatchEnded", **fields)


def step_world(previous: dict[str, Any], controls: dict[str, list[dict[str, Any]]] | None = None) -> dict[str, Any]:
    state = copy.deepcopy(previous); state["events"] = []
    if previous["outcome"]: return state
    controls = controls or {}; action_by_ship = {action["shipId"]: action for team in TEAM_IDS for action in controls.get(team, [])}; intents = []
    _respawns_and_cooldowns(state); previous_positions = {ship["id"]: dict(ship["position"]) for ship in state["ships"]}; dt = 1.0 / state["config"]["timing"]["physicsHz"]
    damage: dict[str, float] = {}; killer_teams: dict[str, str] = {}
    for ship in state["ships"]:
        if not ship["alive"]: continue
        activated = action_by_ship.get(ship["id"]); action = copy.deepcopy(activated) if activated else {**copy.deepcopy(ship["heldAction"]), "interact": {"type": "none"}}
        if activated and activated["interact"]["type"] != "none": intents.append({"shipId": ship["id"], "interaction": copy.deepcopy(activated["interact"])})
        ship["heldAction"] = {**copy.deepcopy(action), "interact": {"type": "none"}}
        ship["heading"] = wrap_heading(ship["heading"] + action["turn"] * state["config"]["ship"]["maxTurnRate"] * dt)
        forward = {"x": math.cos(ship["heading"]), "y": math.sin(ship["heading"])}; velocity = add(ship["velocity"], scale(forward, action["throttle"] * state["config"]["ship"]["acceleration"] * dt)); velocity = scale(velocity, math.exp(-state["config"]["ship"]["dragPerSecond"] * dt)); ship["velocity"] = clamp_magnitude(velocity, state["config"]["ship"]["maxSpeed"])
        collision = sweep_circle_against_map(ship["position"], add(ship["position"], scale(ship["velocity"], dt)), ship["radius"], state["map"]); ship["position"] = collision["position"]
        if collision["hit"] and collision["normal"]:
            inward = dot(ship["velocity"], collision["normal"])
            impact_speed = max(0.0, -inward)
            impact_damage = 0 if _protected(ship, state["tick"]) else _impact_damage(state, impact_speed)
            _add_damage(damage, ship["id"], impact_damage)
            if inward < 0: ship["velocity"] = subtract(ship["velocity"], scale(collision["normal"], inward))
            _emit(state, "TerrainContact", shipId=ship["id"], position=dict(ship["position"]), damage=impact_damage, impactSpeed=impact_speed)
    _resolve_contacts(state, damage, killer_teams); _update_island_discoveries(state); _spawn_projectiles(state); _resolve_projectiles(state, previous_positions, damage, killer_teams); _resolve_interactions(state, intents); _returns_captures_outcome(state); state["tick"] += 1
    return state


def canonical_kinematics(state: dict[str, Any]) -> dict[str, Any]:
    return {"tick": state["tick"], "ships": [{key: ship[key] for key in ("id", "position", "velocity", "heading", "health", "alive")} for ship in sorted(state["ships"], key=lambda item: item["id"])]}
