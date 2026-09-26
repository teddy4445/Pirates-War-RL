from __future__ import annotations

import math

from fleetrl.core import canonical_kinematics, create_world, neutral_action, step_world
from fleetrl.resources import load_config, load_map
from fleetrl.rng import XorShift32, derive_seed


def test_rng_vectors() -> None:
    expected = [1892583, 470389255, 3882205507, 3069989445, 2854842367, 2098155156, 258808762, 794540887]
    rng = XorShift32(7)
    assert [rng.next_uint32() for _ in expected] == expected
    assert derive_seed(7, "tie-break") == 3769669561


def test_deterministic_motion_and_speed_limit() -> None:
    config, map_data = load_config(), load_map()
    first = create_world(config, map_data, 17)
    second = create_world(config, map_data, 17)
    ship_id = next(ship["id"] for ship in first["ships"] if ship["teamId"] == "blue")
    control = {"blue": [{**neutral_action(ship_id), "throttle": 1.0}]}
    for _ in range(240):
        first, second = step_world(first, control), step_world(second, control)
    assert canonical_kinematics(first) == canonical_kinematics(second)
    ship = next(item for item in first["ships"] if item["id"] == ship_id)
    assert math.hypot(ship["velocity"]["x"], ship["velocity"]["y"]) <= config["ship"]["maxSpeed"] + 1e-9


def test_simultaneous_lethal_hits() -> None:
    config, map_data = load_config(), load_map(); config["mode"] = "duel"
    state = create_world(config, map_data, 5)
    blue = next(ship for ship in state["ships"] if ship["teamId"] == "blue"); rose = next(ship for ship in state["ships"] if ship["teamId"] == "rose")
    blue.update(position={"x": 500, "y": 450}, heading=0, health=25); rose.update(position={"x": 535, "y": 450}, heading=-math.pi, health=25)
    state = step_world(state, {"blue": [{**neutral_action(blue["id"]), "fire": True}], "rose": [{**neutral_action(rose["id"]), "fire": True}]})
    assert not any(ship["alive"] for ship in state["ships"])


def test_selected_target_uses_velocity_lead_independent_of_heading() -> None:
    config, map_data = load_config(), load_map(); config["mode"] = "fleet"; config["shipsPerTeam"] = 2
    state = create_world(config, map_data, 40)
    blue, blue_reserve = [ship for ship in state["ships"] if ship["teamId"] == "blue"]
    rose_decoy, rose_target = [ship for ship in state["ships"] if ship["teamId"] == "rose"]
    blue.update(position={"x": 500, "y": 450}, heading=math.pi)
    blue_reserve["position"] = {"x": 300, "y": 700}
    rose_decoy["position"] = {"x": 540, "y": 450}
    rose_target.update(position={"x": 500, "y": 490}, velocity={"x": 36, "y": 0})
    state = step_world(state, {"blue": [{**neutral_action(blue["id"]), "fire": True, "fireTargetShipId": rose_target["id"]}]})
    projectile = state["projectiles"][0]
    assert projectile["targetShipId"] == rose_target["id"]
    assert projectile["direction"]["x"] > 0 and projectile["direction"]["y"] > 0
    assert next(ship for ship in state["ships"] if ship["id"] == rose_decoy["id"])["health"] == config["ship"]["maxHealth"]


def test_distance_scaled_damage_and_close_range_marker() -> None:
    assert load_config()["combat"]["damage"] == 18.75
    assert load_config()["ship"]["respawnDelayTicks"] / load_config()["timing"]["physicsHz"] == 15

    def fire_at(separation: float) -> tuple[dict, dict]:
        config, map_data = load_config(), load_map(); config["mode"] = "duel"
        state = create_world(config, map_data, 41 + int(separation))
        blue = next(ship for ship in state["ships"] if ship["teamId"] == "blue")
        rose = next(ship for ship in state["ships"] if ship["teamId"] == "rose")
        blue.update(position={"x": 500, "y": 450}, heading=math.pi / 2)
        rose.update(position={"x": 500 + separation, "y": 450}, velocity={"x": 0, "y": 0})
        for tick in range(55):
            selected = {**neutral_action(blue["id"]), "fire": True, "fireTargetShipId": rose["id"]} if tick == 0 else neutral_action(blue["id"])
            state = step_world(state, {"blue": [selected]})
            hit = next((event for event in state["events"] if event["type"] == "ProjectileHitShip"), None)
            if hit:
                return state, hit
        raise AssertionError("projectile did not hit")

    close_state, close_hit = fire_at(45)
    distant_state, distant_hit = fire_at(200)
    assert close_hit["closeRange"] is True and distant_hit["closeRange"] is False
    assert close_hit["damage"] > distant_hit["damage"]
    close_health = next(ship for ship in close_state["ships"] if ship["teamId"] == "rose")["health"]
    distant_health = next(ship for ship in distant_state["ships"] if ship["teamId"] == "rose")["health"]
    assert close_health < distant_health


def test_ship_impacts_use_each_hulls_inward_speed_for_friendly_and_enemy_contacts() -> None:
    for friendly in (True, False):
        config, map_data = load_config(), load_map()
        config["mode"] = "fleet"; config["shipsPerTeam"] = 2
        config["ship"]["acceleration"] = 0; config["ship"]["dragPerSecond"] = 0
        state = create_world(config, map_data, 51 if friendly else 52)
        left = next(ship for ship in state["ships"] if ship["id"] == "blue-1")
        right_id = "blue-2" if friendly else "rose-1"
        right = next(ship for ship in state["ships"] if ship["id"] == right_id)
        left.update(position={"x": 500, "y": 450}, velocity={"x": 40, "y": 0})
        right.update(position={"x": 523, "y": 450}, velocity={"x": -20, "y": 0})
        state = step_world(state)
        left = next(ship for ship in state["ships"] if ship["id"] == "blue-1")
        right = next(ship for ship in state["ships"] if ship["id"] == right_id)
        contact = next(event for event in state["events"] if event["type"] == "ShipContact")
        assert left["health"] == 92 and right["health"] == 96
        assert contact["damage"] == 8 and contact["otherDamage"] == 4
        assert contact["impactSpeed"] == 40 and contact["otherImpactSpeed"] == 20


def test_stationary_hull_takes_no_impact_damage() -> None:
    config, map_data = load_config(), load_map(); config["mode"] = "duel"
    config["ship"]["acceleration"] = 0; config["ship"]["dragPerSecond"] = 0
    state = create_world(config, map_data, 53)
    blue = next(ship for ship in state["ships"] if ship["teamId"] == "blue")
    rose = next(ship for ship in state["ships"] if ship["teamId"] == "rose")
    blue.update(position={"x": 500, "y": 450}, velocity={"x": 50, "y": 0})
    rose.update(position={"x": 523, "y": 450}, velocity={"x": 0, "y": 0})
    state = step_world(state)
    assert next(ship for ship in state["ships"] if ship["id"] == blue["id"])["health"] == 90
    assert next(ship for ship in state["ships"] if ship["id"] == rose["id"])["health"] == 100


def test_terrain_impact_damage_is_velocity_proportional() -> None:
    config, map_data = load_config(), load_map(); config["mode"] = "duel"
    config["ship"]["acceleration"] = 0; config["ship"]["dragPerSecond"] = 0
    map_data["islands"] = [{"id": "wall", "polygon": [[500, 0], [501, 0], [501, 900], [500, 900]]}]
    state = create_world(config, map_data, 54)
    blue = next(ship for ship in state["ships"] if ship["teamId"] == "blue")
    blue.update(position={"x": 487.5, "y": 450}, velocity={"x": 60, "y": 0})
    state = step_world(state)
    blue = next(ship for ship in state["ships"] if ship["id"] == blue["id"])
    contact = next(event for event in state["events"] if event["type"] == "TerrainContact" and event["shipId"] == blue["id"])
    assert blue["health"] == 88
    assert contact["damage"] == 12 and contact["impactSpeed"] == 60


def test_lethal_head_on_ramming_is_simultaneous() -> None:
    config, map_data = load_config(), load_map(); config["mode"] = "duel"
    config["ship"]["acceleration"] = 0; config["ship"]["dragPerSecond"] = 0
    state = create_world(config, map_data, 55)
    blue = next(ship for ship in state["ships"] if ship["teamId"] == "blue")
    rose = next(ship for ship in state["ships"] if ship["teamId"] == "rose")
    blue.update(position={"x": 500, "y": 450}, velocity={"x": 80, "y": 0}, health=15)
    rose.update(position={"x": 523, "y": 450}, velocity={"x": -80, "y": 0}, health=15)
    state = step_world(state)
    assert not any(ship["alive"] for ship in state["ships"])
    assert sorted(event["shipId"] for event in state["events"] if event["type"] == "ShipSunk") == sorted([blue["id"], rose["id"]])
    assert state["kills"] == {"blue": 1, "rose": 1}
