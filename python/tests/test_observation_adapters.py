from __future__ import annotations

import numpy as np
import pytest

from fleetrl.adapters import decode_discrete_v1, discrete_action_mask_v1, encode_ship_v1
from fleetrl.core import create_world, step_world
from fleetrl.observation import build_observation
from fleetrl.resources import load_config, load_map
from fleetrl.resources import load_conformance


def test_observation_and_ship_64_are_public_and_finite() -> None:
    config = load_config(); config["mode"] = "fog-duel"
    state = create_world(config, load_map(), 31)
    observation = build_observation(state, "blue", decision_id=4)
    assert observation["decisionId"] == 4
    assert observation["actionAppliesAtTick"] == config["timing"]["decisionIntervalTicks"]
    assert observation["enemies"] == []
    assert next(flag for flag in observation["flags"] if flag["ownerTeamId"] == "blue")["known"] is True
    assert next(flag for flag in observation["flags"] if flag["ownerTeamId"] == "rose")["known"] is False
    assert "tieBreakRngState" not in observation
    row = encode_ship_v1(observation, "blue-1")
    assert row.shape == (64,)
    assert row.dtype == np.float32
    assert np.isfinite(row).all()
    assert row[56] == 1
    assert row[57] == 0


def test_discrete_decoder_and_mask_match_public_contract() -> None:
    config = load_config(); config["mode"] = "duel"
    state = create_world(config, load_map(), 9)
    blue = next(ship for ship in state["ships"] if ship["teamId"] == "blue")
    rose = next(ship for ship in state["ships"] if ship["teamId"] == "rose")
    rose["position"] = {"x": blue["position"]["x"] + 120, "y": blue["position"]["y"]}
    observation = build_observation(state, "blue")
    assert decode_discrete_v1(observation, "blue-1", 4)["throttle"] == 0
    assert decode_discrete_v1(observation, "blue-1", 7)["throttle"] == 1
    assert decode_discrete_v1(observation, "blue-1", 9)["fire"] is True
    assert decode_discrete_v1(observation, "blue-1", 9)["fireTargetShipId"] == "rose-1"
    mask = discrete_action_mask_v1(observation, "blue-1")
    assert mask.shape == (22,)
    assert mask[:18].all()
    assert not mask[18:].any()
    with pytest.raises(ValueError):
        decode_discrete_v1(observation, "blue-1", 22)
    with pytest.raises(ValueError):
        encode_ship_v1(observation, "rose-1")


def test_team_union_reveals_enemy_without_hidden_leaks() -> None:
    config = load_config(); config["mode"] = "fog-fleet"
    state = create_world(config, load_map(), 4)
    blue = next(ship for ship in state["ships"] if ship["id"] == "blue-3")
    rose = next(ship for ship in state["ships"] if ship["id"] == "rose-1")
    blue["position"] = {"x": 500, "y": 450}; rose["position"] = {"x": 520, "y": 450}
    observation = build_observation(state, "blue")
    assert [ship["id"] for ship in observation["enemies"]] == ["rose-1"]


def test_fog_discovers_and_remembers_complete_island_polygons() -> None:
    config = load_config(); config["mode"] = "fog-duel"; config["vision"]["staticMapKnown"] = False
    map_data = load_map(); state = create_world(config, map_data, 18)
    assert [item["id"] for item in build_observation(state, "blue")["islands"]] == ["blue-home-island"]
    next(ship for ship in state["ships"] if ship["id"] == "blue-1")["position"] = {"x": 650, "y": 360}
    state = step_world(state)
    assert "north-island" in [item["id"] for item in build_observation(state, "blue")["islands"]]
    next(ship for ship in state["ships"] if ship["id"] == "blue-1")["position"] = {"x": 230, "y": 360}
    assert "north-island" in [item["id"] for item in build_observation(state, "blue")["islands"]]


def test_packaged_adapter_conformance_fixture() -> None:
    fixture = load_conformance("adapters-v1.json")
    for case in fixture["cases"]:
        actual = encode_ship_v1(case["observation"], case["shipId"])
        np.testing.assert_allclose(actual, np.asarray(case["features"], dtype=np.float32), rtol=fixture["relativeTolerance"], atol=fixture["absoluteTolerance"])
        assert discrete_action_mask_v1(case["observation"], case["shipId"]).astype(bool).tolist() == case["mask"]
        assert [decode_discrete_v1(case["observation"], case["shipId"], action) for action in range(22)] == case["decoded"]
