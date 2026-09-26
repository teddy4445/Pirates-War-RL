from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from .adapters import discrete_action_mask_v1
from .dqn import ReplayBuffer, Transition, build_network, choose_action, optimize, require_torch, save_checkpoint
from .envs import FleetRLGymEnv
from .qlearning import QTable, state_key


def terminal_for_bootstrap(terminated: bool, truncated: bool) -> bool:
    """Only a rule-defined match ending suppresses value bootstrap; collection cutoffs do not."""
    del truncated
    return terminated


def _mask(info: dict[str, Any]) -> np.ndarray:
    rich = info["richObservation"]
    return discrete_action_mask_v1(rich, rich["ships"][0]["id"])


def train_qlearning(args: argparse.Namespace, output: Path) -> dict[str, Any]:
    env = FleetRLGymEnv(args.mode, max_decisions=args.episode_decisions); rng = np.random.default_rng(args.seed)
    table = QTable(alpha=args.alpha, gamma=args.gamma); observation, info = env.reset(seed=args.seed)
    episode_return = 0.0; returns: list[float] = []; errors: list[float] = []
    for step in range(args.steps):
        epsilon = max(args.epsilon_end, args.epsilon_start + (args.epsilon_end - args.epsilon_start) * step / max(1, args.steps - 1))
        state = state_key(observation); mask = _mask(info); action = table.choose(state, mask, epsilon, rng)
        next_observation, reward, terminated, truncated, next_info = env.step(action)
        episode_done = terminated or truncated
        errors.append(table.update(state, action, reward, state_key(next_observation), _mask(next_info), terminal_for_bootstrap(terminated, truncated)))
        observation, info = next_observation, next_info; episode_return += reward
        if episode_done:
            returns.append(episode_return); episode_return = 0.0
            observation, info = env.reset(seed=args.seed + len(returns))
    if episode_return or not returns: returns.append(episode_return)
    metadata = {"algorithm": "qlearning", "mode": args.mode, "seed": args.seed, "steps": args.steps, "episodes": len(returns), "rewardPreset": "capture-difference-v1", "trained": True}
    table.save(output / "qtable.json", metadata)
    return {**metadata, "episodeReturns": returns, "visitedStates": len(table.values), "meanAbsoluteTdError": float(np.mean(np.abs(errors))) if errors else None}


def train_dqn(args: argparse.Namespace, output: Path) -> dict[str, Any]:
    torch = require_torch(); torch.manual_seed(args.seed); np.random.seed(args.seed)
    env = FleetRLGymEnv(args.mode, max_decisions=args.episode_decisions); rng = np.random.default_rng(args.seed)
    network = build_network(); target = build_network(); target.load_state_dict(network.state_dict()); target.eval()
    optimizer = torch.optim.Adam(network.parameters(), lr=args.learning_rate)
    replay = ReplayBuffer(args.buffer_size, args.seed); observation, info = env.reset(seed=args.seed)
    returns: list[float] = []; losses: list[float] = []; episode_return = 0.0; gradient_steps = 0
    for step in range(args.steps):
        epsilon = max(args.epsilon_end, args.epsilon_start + (args.epsilon_end - args.epsilon_start) * step / max(1, args.steps - 1))
        action = choose_action(network, observation, _mask(info), epsilon, rng)
        next_observation, reward, terminated, truncated, next_info = env.step(action)
        episode_done = terminated or truncated
        replay.append(Transition(observation.copy(), action, reward, next_observation.copy(), _mask(next_info), terminal_for_bootstrap(terminated, truncated)))
        observation, info = next_observation, next_info; episode_return += reward
        if len(replay) >= args.batch_size:
            losses.append(optimize(network, target, optimizer, replay.sample(args.batch_size), args.gamma)); gradient_steps += 1
            if gradient_steps % args.target_every == 0:
                target.load_state_dict(network.state_dict())
        if episode_done:
            returns.append(episode_return); episode_return = 0.0
            observation, info = env.reset(seed=args.seed + len(returns))
    if episode_return or not returns: returns.append(episode_return)
    metadata = {"algorithm": "dqn", "mode": args.mode, "seed": args.seed, "steps": args.steps, "gradientSteps": gradient_steps, "episodes": len(returns), "rewardPreset": "capture-difference-v1", "featureEncoder": "ship-64-v1", "actionDecoder": "discrete-22-v1", "trained": True}
    save_checkpoint(output / "checkpoint.pt", network, optimizer, metadata)
    return {**metadata, "episodeReturns": returns, "lastLoss": losses[-1] if losses else None, "meanLoss": float(np.mean(losses)) if losses else None, "bufferSize": len(replay)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a real tabular Q-learning or PyTorch DQN FleetRL policy.")
    parser.add_argument("--algorithm", choices=("qlearning", "dqn"), default="dqn")
    parser.add_argument("--mode", choices=("duel", "fog-duel"), default="duel")
    parser.add_argument("--steps", type=int, default=10_000); parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--output", type=Path, default=Path("runs/demo")); parser.add_argument("--episode-decisions", type=int, default=1800)
    parser.add_argument("--gamma", type=float, default=0.99); parser.add_argument("--alpha", type=float, default=0.2)
    parser.add_argument("--epsilon-start", type=float, default=1.0); parser.add_argument("--epsilon-end", type=float, default=0.05)
    parser.add_argument("--learning-rate", type=float, default=0.001); parser.add_argument("--buffer-size", type=int, default=20_000)
    parser.add_argument("--batch-size", type=int, default=64); parser.add_argument("--target-every", type=int, default=500)
    args = parser.parse_args()
    if args.steps < 1 or args.batch_size < 1 or args.target_every < 1:
        parser.error("steps, batch-size, and target-every must be positive")
    args.output.mkdir(parents=True, exist_ok=True)
    metrics = train_qlearning(args, args.output) if args.algorithm == "qlearning" else train_dqn(args, args.output)
    (args.output / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
