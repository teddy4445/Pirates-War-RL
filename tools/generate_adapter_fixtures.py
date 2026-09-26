from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python" / "src"))

from fleetrl.adapters import decode_discrete_v1, discrete_action_mask_v1, encode_ship_v1  # noqa: E402
from fleetrl.core import create_world, neutral_action  # noqa: E402
from fleetrl.observation import build_observation  # noqa: E402
from fleetrl.resources import load_config, load_map  # noqa: E402


def record(name: str, state: dict, team: str, ship_id: str) -> dict:
    observation = build_observation(state, team, decision_id=3, action_applies_at_tick=state["tick"] + 6)
    return {
        "name": name, "teamId": team, "shipId": ship_id, "observation": observation,
        "features": encode_ship_v1(observation, ship_id).tolist(),
        "mask": discrete_action_mask_v1(observation, ship_id).astype(bool).tolist(),
        "decoded": [decode_discrete_v1(observation, ship_id, action_id) for action_id in range(22)],
    }


def main() -> None:
    map_data = load_map(); cases = []

    config = load_config(); config["mode"] = "duel"
    state = create_world(config, map_data, 101)
    cases.append(record("full-initial", state, "blue", "blue-1"))

    state = create_world(config, map_data, 106)
    blue = next(item for item in state["ships"] if item["id"] == "blue-1")
    rose = next(item for item in state["ships"] if item["id"] == "rose-1")
    rose["position"] = {"x": blue["position"]["x"] + 120, "y": blue["position"]["y"]}
    cases.append(record("known-fire-target", state, "blue", "blue-1"))

    config = load_config(); config["mode"] = "fog-duel"
    state = create_world(config, map_data, 102)
    cases.append(record("fog-hidden-opponent-and-flag", state, "blue", "blue-1"))

    state = create_world(config, map_data, 103); ship = next(item for item in state["ships"] if item["id"] == "blue-1")
    ship.update({"alive": False, "health": 0, "respawnAtTick": 123, "protectionUntilTick": 0, "heldAction": neutral_action("blue-1")})
    state["tick"] = 23
    cases.append(record("dead-own-ship", state, "blue", "blue-1"))

    config = load_config(); config["mode"] = "fleet"
    state = create_world(config, map_data, 104); blue = next(item for item in state["ships"] if item["id"] == "blue-1")
    enemy_flag = next(item for item in state["flags"] if item["ownerTeamId"] == "rose")
    enemy_flag.update({"state": "in-water", "position": dict(blue["position"]), "carrierShipId": None, "siteId": None})
    cases.append(record("known-legal-pickup", state, "blue", "blue-1"))

    state = create_world(config, map_data, 105)
    carrier = next(item for item in state["ships"] if item["id"] == "blue-1"); mate = next(item for item in state["ships"] if item["id"] == "blue-2")
    site = next(item for item in map_data["flagSites"] if item["id"] == "north-neutral-site")
    carrier["position"] = dict(site["approach"]); mate["position"] = {"x": site["approach"]["x"] + 20, "y": site["approach"]["y"]}
    enemy_flag = next(item for item in state["flags"] if item["ownerTeamId"] == "rose")
    enemy_flag.update({"state": "carried", "position": None, "carrierShipId": carrier["id"], "siteId": None}); carrier["carriedFlagId"] = enemy_flag["id"]
    cases.append(record("known-give-place-drop", state, "blue", "blue-1"))

    output = {"schemaVersion": "fleetrl-adapter-conformance-v1", "absoluteTolerance": 1e-6, "relativeTolerance": 1e-6, "cases": cases}
    target = ROOT / "python" / "src" / "fleetrl" / "data" / "conformance" / "adapters-v1.json"
    target.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {target.relative_to(ROOT)} with {len(cases)} cases")


if __name__ == "__main__":
    main()
