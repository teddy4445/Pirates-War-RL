from __future__ import annotations

import copy
import json
from importlib.resources import files
from typing import Any

import pytest

from fleetrl import ENGINE_VERSION, RULES_VERSION
from fleetrl.core import create_world, step_world
from fleetrl.observation import build_observation
from fleetrl.resources import load_config, load_conformance, load_map

FIXTURE = load_conformance("gameplay-v1.json")


def _deep_merge(target: dict[str, Any], patch: dict[str, Any]) -> None:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_merge(target[key], value)
        else:
            target[key] = copy.deepcopy(value)


def _apply_setup(state: dict[str, Any], setup: dict[str, Any]) -> None:
    for ship_id, patch in setup.get("ships", {}).items():
        _deep_merge(next(item for item in state["ships"] if item["id"] == ship_id), patch)
    for flag_id, patch in setup.get("flags", {}).items():
        _deep_merge(next(item for item in state["flags"] if item["id"] == flag_id), patch)
    _deep_merge(state, setup.get("world", {}))


def _canonical_state(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "tick": state["tick"], "seed": state["seed"], "tieBreakRngState": state["tieBreakRngState"],
        "nextEntitySequence": state["nextEntitySequence"],
        "ships": [copy.deepcopy(item) for item in sorted(state["ships"], key=lambda item: item["id"])],
        "flags": [copy.deepcopy(item) for item in sorted(state["flags"], key=lambda item: item["id"])],
        "projectiles": [copy.deepcopy(item) for item in sorted(state["projectiles"], key=lambda item: item["id"])],
        "scores": copy.deepcopy(state["scores"]), "kills": copy.deepcopy(state["kills"]),
        "discoveredIslandIds": copy.deepcopy(state["discoveredIslandIds"]), "outcome": copy.deepcopy(state["outcome"]),
    }


def _compare(actual: Any, expected: Any, path: str = "root") -> None:
    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        difference = abs(actual - expected)
        allowed = FIXTURE["absoluteTolerance"] + FIXTURE["relativeTolerance"] * abs(expected)
        assert difference <= allowed, f"{path}: {actual} versus {expected}"
    elif isinstance(expected, list):
        assert len(actual) == len(expected), path
        for index, value in enumerate(expected):
            _compare(actual[index], value, f"{path}[{index}]")
    elif isinstance(expected, dict):
        assert set(actual) == set(expected), path
        for key, value in expected.items():
            _compare(actual[key], value, f"{path}.{key}")
    else:
        assert actual == expected, path


def test_packaged_versions_and_default_config_match_gameplay_fixture() -> None:
    versions = json.loads(files("fleetrl").joinpath("data", "versions.json").read_text(encoding="utf-8"))
    assert load_config() == FIXTURE["defaultConfig"]
    assert FIXTURE["rulesVersion"] == RULES_VERSION == versions["rulesVersion"]
    assert versions["pythonEngine"] == ENGINE_VERSION == "fleetrl-engine-py-v5"
    assert versions["browserEngine"] == "fleetrl-engine-ts-v5"


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda case: case["id"])
def test_packaged_authoritative_gameplay_cases(case: dict[str, Any]) -> None:
    config = load_config(); _deep_merge(config, case.get("configPatch", {}))
    map_data = load_map(); _deep_merge(map_data, case.get("mapPatch", {}))
    state = create_world(config, map_data, case["seed"]); _apply_setup(state, case.get("setup", {}))
    schedule = {item["tick"]: item["controls"] for item in case.get("schedule", [])}
    events: list[dict[str, Any]] = []
    for _ in range(case["tickCount"]):
        state = step_world(state, schedule.get(state["tick"])); events.extend(copy.deepcopy(state["events"]))
    _compare(_canonical_state(state), case["expected"]["state"], f"{case['id']}.state")
    _compare(events, case["expected"]["events"], f"{case['id']}.events")
    for team in ("blue", "rose"):
        observation = build_observation(state, team, decision_id=9, action_applies_at_tick=state["tick"] + config["timing"]["decisionIntervalTicks"], source_events=events)
        _compare(observation, case["expected"]["observations"][team], f"{case['id']}.observation.{team}")
