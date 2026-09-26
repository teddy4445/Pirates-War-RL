from __future__ import annotations

import json
from importlib.resources import files

from fleetrl.core import canonical_kinematics, create_world, step_world
from fleetrl.resources import load_config, load_map


def _compare(actual, expected, absolute: float, relative: float, path: str = "root") -> None:
    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        difference = abs(actual - expected)
        allowed = absolute + relative * abs(expected)
        assert difference <= allowed, f"{path}: {actual} versus {expected}"
    elif isinstance(expected, list):
        assert len(actual) == len(expected), path
        for index, value in enumerate(expected): _compare(actual[index], value, absolute, relative, f"{path}[{index}]")
    elif isinstance(expected, dict):
        assert set(actual) == set(expected), path
        for key, value in expected.items(): _compare(actual[key], value, absolute, relative, f"{path}.{key}")
    else:
        assert actual == expected, path


def test_packaged_long_trajectory_fixtures() -> None:
    fixture = json.loads(files("fleetrl").joinpath("data", "conformance", "trajectory-v1.json").read_text(encoding="utf-8"))
    for case in fixture["cases"]:
        config = load_config(); config["mode"] = case["mode"]
        state = create_world(config, load_map(), case["seed"])
        schedule = {item["tick"]: item["controls"] for item in case["schedule"]}
        snapshots = {item["tick"]: item["state"] for item in case["snapshots"]}
        _compare(canonical_kinematics(state), snapshots[0], fixture["absoluteTolerance"], fixture["relativeTolerance"], f"{case['id']}@0")
        while state["tick"] < 240:
            state = step_world(state, schedule.get(state["tick"]))
            if state["tick"] in snapshots:
                _compare(canonical_kinematics(state), snapshots[state["tick"]], fixture["absoluteTolerance"], fixture["relativeTolerance"], f"{case['id']}@{state['tick']}")
