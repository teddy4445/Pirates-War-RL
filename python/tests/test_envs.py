from __future__ import annotations

import numpy as np
from gymnasium.utils.env_checker import check_env
from pettingzoo.test import parallel_api_test

from fleetrl.envs import DelayedJointEngine, FleetRLGymEnv, FleetRLParallelEnv
from fleetrl.procedural_map import generate_map
from fleetrl.resources import load_config, load_map


def test_default_engine_uses_live_seeded_map_and_honors_explicit_override() -> None:
    config = load_config()
    default_engine = DelayedJointEngine(config)
    default_engine.reset(19)
    assert default_engine.state is not None
    assert default_engine.state["map"] == generate_map(19)

    curated_map = load_map()
    custom_engine = DelayedJointEngine(config, curated_map)
    custom_engine.reset(19)
    assert custom_engine.state is not None
    assert custom_engine.state["map"] == curated_map


def test_delayed_joint_engine_starts_with_neutral_interval() -> None:
    config = load_config(); config["mode"] = "duel"
    engine = DelayedJointEngine(config)
    observations = engine.reset(7)
    blue = observations["blue"]["ships"][0]
    issued = {
        "blue": {"actions": [{"shipId": blue["id"], "throttle": 1, "turn": 0, "fire": False, "interact": {"type": "none"}}]},
        "rose": {"actions": [{"shipId": "rose-1", "throttle": 0, "turn": 0, "fire": False, "interact": {"type": "none"}}]},
    }
    observations, first = engine.step(issued)
    assert first["appliedActions"]["blue"][0]["throttle"] == 0
    assert observations["blue"]["ships"][0]["position"] == blue["position"]
    observations, second = engine.step(issued)
    assert second["appliedActions"]["blue"][0]["throttle"] == 1
    assert observations["blue"]["ships"][0]["position"]["x"] > blue["position"]["x"]


def test_gymnasium_adapter_and_external_truncation() -> None:
    env = FleetRLGymEnv(mode="duel", max_decisions=2)
    check_env(env, skip_render_check=True)
    observation, info = env.reset(seed=3)
    assert observation.shape == (64,)
    assert info["initialControls"] == "neutral"
    _, _, terminated, truncated, info = env.step(7)
    assert not terminated and not truncated
    _, _, terminated, truncated, info = env.step(7)
    assert not terminated and truncated
    assert info["issuedActions"]["blue"][0]["throttle"] == 1


def test_parallel_adapter_contract_and_slot_padding() -> None:
    env = FleetRLParallelEnv(mode="fog-fleet", max_decisions=3)
    parallel_api_test(env, num_cycles=5)
    observations, _ = env.reset(seed=11)
    assert observations["blue"]["features"].shape == (8, 64)
    assert np.array_equal(observations["blue"]["ship_mask"], [1, 1, 1, 0, 0, 0, 0, 0])
