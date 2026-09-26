from __future__ import annotations

import argparse
import json

from .envs import FleetRLGymEnv


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a real native headless FleetRL rollout.")
    parser.add_argument("--mode", choices=("duel", "fleet", "fog-duel", "fog-fleet"), default="duel")
    parser.add_argument("--seed", type=int, default=7); parser.add_argument("--decisions", type=int, default=120)
    parser.add_argument("--policy", choices=("random", "forward"), default="random")
    args = parser.parse_args()
    env = FleetRLGymEnv(args.mode, max_decisions=args.decisions)
    observation, info = env.reset(seed=args.seed); total = 0.0; steps = 0; terminated = truncated = False
    while not terminated and not truncated:
        action = 7 if args.policy == "forward" and args.mode in ("duel", "fog-duel") else env.action_space.sample()
        observation, reward, terminated, truncated, info = env.step(action); total += reward; steps += 1
    print(json.dumps({"mode": args.mode, "seed": args.seed, "decisions": steps, "return": total, "terminated": terminated, "truncated": truncated, "outcome": info.get("outcome")}, indent=2))


if __name__ == "__main__":
    main()
