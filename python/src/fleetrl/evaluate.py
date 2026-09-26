from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .adapters import discrete_action_mask_v1
from .dqn import choose_action, load_checkpoint
from .envs import FleetRLGymEnv


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a frozen trusted local FleetRL checkpoint.")
    parser.add_argument("--checkpoint", type=Path, required=True); parser.add_argument("--episodes", type=int, default=20)
    parser.add_argument("--seed", type=int, default=10_000); parser.add_argument("--max-decisions", type=int, default=1800)
    args = parser.parse_args(); network, metadata = load_checkpoint(args.checkpoint)
    mode = str(metadata.get("mode", "duel")); env = FleetRLGymEnv(mode, max_decisions=args.max_decisions); rng = np.random.default_rng(args.seed)
    records = []
    for episode in range(args.episodes):
        observation, info = env.reset(seed=args.seed + episode); total = 0.0; decisions = 0; terminated = truncated = False
        while not terminated and not truncated:
            rich = info["richObservation"]; mask = discrete_action_mask_v1(rich, rich["ships"][0]["id"])
            action = choose_action(network, observation, mask, 0.0, rng)
            observation, reward, terminated, truncated, info = env.step(action); total += reward; decisions += 1
        records.append({"seed": args.seed + episode, "return": total, "decisions": decisions, "terminated": terminated, "truncated": truncated, "outcome": info.get("outcome")})
    wins = sum(bool(record["outcome"] and record["outcome"].get("winner") == "blue") for record in records)
    draws = sum(bool(record["outcome"] and record["outcome"].get("winner") is None) for record in records)
    losses = sum(bool(record["outcome"] and record["outcome"].get("winner") == "rose") for record in records)
    incomplete = args.episodes - wins - draws - losses
    print(json.dumps({"checkpoint": str(args.checkpoint), "episodes": args.episodes, "wins": wins, "draws": draws, "losses": losses, "incomplete": incomplete, "records": records}, indent=2))


if __name__ == "__main__":
    main()
