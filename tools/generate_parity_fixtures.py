from __future__ import annotations

import json
from pathlib import Path

from fleetrl.core import canonical_kinematics, create_world, neutral_action, step_world
from fleetrl.resources import load_config, load_map


def decision_actions(state: dict, tick: int) -> dict[str, list[dict]]:
    controls: dict[str, list[dict]] = {"blue": [], "rose": []}
    for ship in state["ships"]:
        ordinal = int(ship["id"].split("-")[-1])
        phase = (tick // 6 + ordinal + (0 if ship["teamId"] == "blue" else 2)) % 7
        action = neutral_action(ship["id"])
        action.update({
            "throttle": 1 if phase not in (0, 6) else -1 if phase == 6 else 0,
            "turn": -1 if phase in (1, 2) else 1 if phase in (4, 5) else 0,
            "fire": phase == 3,
        })
        controls[ship["teamId"]].append(action)
    return controls


def main() -> None:
    map_data = load_map()
    cases = []
    for mode in ("duel", "fleet", "fog-duel", "fog-fleet"):
        for seed in (1, 7, 99):
            config = load_config(); config["mode"] = mode
            state = create_world(config, map_data, seed)
            schedule: list[dict] = []
            snapshots = [{"tick": 0, "state": canonical_kinematics(state)}]
            for tick in range(240):
                controls = decision_actions(state, tick) if tick % 6 == 0 else None
                if controls is not None:
                    schedule.append({"tick": tick, "controls": controls})
                state = step_world(state, controls)
                if state["tick"] in (1, 6, 60, 120, 240):
                    snapshots.append({"tick": state["tick"], "state": canonical_kinematics(state)})
            cases.append({"id": f"{mode}-seed-{seed}", "mode": mode, "seed": seed, "schedule": schedule, "snapshots": snapshots})
    output = {
        "schemaVersion": "fleetrl-parity-trajectory-v1",
        "rulesVersion": "fleetrl-rules-v5",
        "mapId": map_data["id"],
        "absoluteTolerance": 1e-9,
        "relativeTolerance": 1e-9,
        "cases": cases,
    }
    target = Path(__file__).resolve().parents[1] / "python" / "src" / "fleetrl" / "data" / "conformance" / "trajectory-v1.json"
    target.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {target} ({target.stat().st_size} bytes, {len(cases)} cases)")


if __name__ == "__main__":
    main()
