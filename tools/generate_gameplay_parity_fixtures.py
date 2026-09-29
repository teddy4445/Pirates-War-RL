from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python" / "src"))

from fleetrl.core import create_world, neutral_action, step_world  # noqa: E402
from fleetrl.observation import build_observation  # noqa: E402
from fleetrl.resources import load_config, load_map  # noqa: E402


def deep_merge(target: dict[str, Any], patch: dict[str, Any]) -> None:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            deep_merge(target[key], value)
        else:
            target[key] = copy.deepcopy(value)


def apply_setup(state: dict[str, Any], setup: dict[str, Any]) -> None:
    for ship_id, patch in setup.get("ships", {}).items():
        ship = next(item for item in state["ships"] if item["id"] == ship_id)
        deep_merge(ship, patch)
    for flag_id, patch in setup.get("flags", {}).items():
        flag = next(item for item in state["flags"] if item["id"] == flag_id)
        deep_merge(flag, patch)
    deep_merge(state, setup.get("world", {}))


def canonical_state(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "tick": state["tick"],
        "seed": state["seed"],
        "tieBreakRngState": state["tieBreakRngState"],
        "nextEntitySequence": state["nextEntitySequence"],
        "ships": [copy.deepcopy(ship) for ship in sorted(state["ships"], key=lambda item: item["id"])],
        "flags": [copy.deepcopy(flag) for flag in sorted(state["flags"], key=lambda item: item["id"])],
        "projectiles": [copy.deepcopy(item) for item in sorted(state["projectiles"], key=lambda item: item["id"])],
        "scores": copy.deepcopy(state["scores"]),
        "kills": copy.deepcopy(state["kills"]),
        "discoveredIslandIds": copy.deepcopy(state["discoveredIslandIds"]),
        "outcome": copy.deepcopy(state["outcome"]),
    }


def action(ship_id: str, **patch: Any) -> dict[str, Any]:
    result = neutral_action(ship_id)
    deep_merge(result, patch)
    return result


def materialize(case: dict[str, Any]) -> dict[str, Any]:
    config = load_config()
    deep_merge(config, case.get("configPatch", {}))
    map_data = load_map()
    deep_merge(map_data, case.get("mapPatch", {}))
    state = create_world(config, map_data, case["seed"])
    apply_setup(state, case.get("setup", {}))
    schedule = {item["tick"]: item["controls"] for item in case.get("schedule", [])}
    events: list[dict[str, Any]] = []
    for _ in range(case["tickCount"]):
        state = step_world(state, schedule.get(state["tick"]))
        events.extend(copy.deepcopy(state["events"]))
    observations = {
        team: build_observation(state, team, decision_id=9, action_applies_at_tick=state["tick"] + config["timing"]["decisionIntervalTicks"], source_events=events)
        for team in ("blue", "rose")
    }
    return {**case, "expected": {"state": canonical_state(state), "events": events, "observations": observations}}


def main() -> None:
    close_fire = action("blue-1", fire=True, fireTargetShipId="rose-1")
    distant_fire = action("blue-1", fire=True, fireTargetShipId="rose-1")
    cases = [
        {
            "id": "targeted-close-shot",
            "seed": 201,
            "tickCount": 12,
            "configPatch": {"mode": "duel"},
            "setup": {"ships": {
                "blue-1": {"position": {"x": 500, "y": 450}, "heading": 3.141592653589793},
                "rose-1": {"position": {"x": 545, "y": 450}, "velocity": {"x": 0, "y": 0}},
            }},
            "schedule": [{"tick": 0, "controls": {"blue": [close_fire]}}],
        },
        {
            "id": "targeted-leading-distant-shot",
            "seed": 202,
            "tickCount": 50,
            "configPatch": {"mode": "duel"},
            "setup": {"ships": {
                "blue-1": {"position": {"x": 500, "y": 450}, "heading": 3.141592653589793},
                "rose-1": {"position": {"x": 700, "y": 450}, "velocity": {"x": 0, "y": 18}},
            }},
            "schedule": [{"tick": 0, "controls": {"blue": [distant_fire]}}],
        },
        {
            "id": "enemy-head-on-impact",
            "seed": 203,
            "tickCount": 1,
            "configPatch": {"mode": "duel", "ship": {"acceleration": 0, "dragPerSecond": 0}},
            "setup": {"ships": {
                "blue-1": {"position": {"x": 500, "y": 450}, "velocity": {"x": 60, "y": 0}, "health": 20},
                "rose-1": {"position": {"x": 523, "y": 450}, "velocity": {"x": -60, "y": 0}, "health": 20},
            }},
        },
        {
            "id": "friendly-asymmetric-impact",
            "seed": 204,
            "tickCount": 1,
            "configPatch": {"mode": "fleet", "shipsPerTeam": 2, "ship": {"acceleration": 0, "dragPerSecond": 0}},
            "setup": {"ships": {
                "blue-1": {"position": {"x": 500, "y": 450}, "velocity": {"x": 50, "y": 0}},
                "blue-2": {"position": {"x": 523, "y": 450}, "velocity": {"x": 0, "y": 0}},
            }},
        },
        {
            "id": "solid-terrain-impact",
            "seed": 205,
            "tickCount": 1,
            "configPatch": {"mode": "duel", "ship": {"acceleration": 0, "dragPerSecond": 0}},
            "mapPatch": {"islands": [{"id": "wall", "polygon": [[500, 0], [501, 0], [501, 900], [500, 900]]}]},
            "setup": {"ships": {"blue-1": {"position": {"x": 487.5, "y": 450}, "velocity": {"x": 60, "y": 0}}}},
        },
        {
            "id": "impact-death-flag-relocation",
            "seed": 206,
            "tickCount": 1,
            "configPatch": {"mode": "duel", "ship": {"acceleration": 0, "dragPerSecond": 0}},
            "setup": {
                "ships": {
                    "blue-1": {"position": {"x": 500, "y": 450}, "velocity": {"x": 60, "y": 0}, "health": 10, "carriedFlagId": "rose-flag"},
                    "rose-1": {"position": {"x": 523, "y": 450}, "velocity": {"x": -60, "y": 0}},
                },
                "flags": {"rose-flag": {"state": "carried", "position": None, "carrierShipId": "blue-1", "siteId": None}},
            },
        },
        {
            "id": "simultaneous-capture-draw",
            "seed": 207,
            "tickCount": 1,
            "configPatch": {"mode": "duel", "flags": {"requireOwnFlagHome": False}, "match": {"durationTicks": 1}},
            "setup": {
                "ships": {
                    "blue-1": {"position": {"x": 200, "y": 450}, "carriedFlagId": "rose-flag"},
                    "rose-1": {"position": {"x": 1400, "y": 450}, "carriedFlagId": "blue-flag"},
                },
                "flags": {
                    "blue-flag": {"state": "carried", "position": None, "carrierShipId": "rose-1", "siteId": None},
                    "rose-flag": {"state": "carried", "position": None, "carrierShipId": "blue-1", "siteId": None},
                },
            },
        },
        {
            "id": "fog-island-discovery",
            "seed": 208,
            "tickCount": 1,
            "configPatch": {"mode": "fog-duel", "vision": {"staticMapKnown": False}},
            "setup": {"ships": {"blue-1": {"position": {"x": 650, "y": 360}}}},
        },
        {
            "id": "respawn-protection",
            "seed": 209,
            "tickCount": 1,
            "configPatch": {"mode": "duel"},
            "setup": {"ships": {"blue-1": {"alive": False, "health": 0, "respawnAtTick": 0, "protectionUntilTick": 0}}},
        },
        {
            "id": "timeout-score-winner",
            "seed": 210,
            "tickCount": 1,
            "configPatch": {"mode": "duel", "match": {"durationTicks": 1}},
            "setup": {"world": {"scores": {"blue": 4, "rose": 3}, "kills": {"blue": 1, "rose": 3}}},
        },
        {
            "id": "scuttle-half-respawn",
            "seed": 211,
            "tickCount": 1,
            "configPatch": {"mode": "duel"},
            "schedule": [{"tick": 0, "controls": {"blue": [action("blue-1", scuttle=True)]}}],
        },
    ]
    output = {
        "schemaVersion": "fleetrl-gameplay-parity-v1",
        "rulesVersion": "fleetrl-rules-v6",
        "absoluteTolerance": 1e-9,
        "relativeTolerance": 1e-9,
        "defaultConfig": load_config(),
        "cases": [materialize(case) for case in cases],
    }
    target = ROOT / "python" / "src" / "fleetrl" / "data" / "conformance" / "gameplay-v1.json"
    target.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {target.relative_to(ROOT)} with {len(cases)} gameplay cases")


if __name__ == "__main__":
    main()
