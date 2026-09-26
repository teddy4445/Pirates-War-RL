from __future__ import annotations

import random
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


def require_torch() -> Any:
    try:
        import torch
    except ImportError as error:
        raise RuntimeError('DQN support requires the training extra: pip install -e ".[train]"') from error
    return torch


def build_network() -> Any:
    torch = require_torch()
    return torch.nn.Sequential(
        torch.nn.Linear(64, 64), torch.nn.ReLU(),
        torch.nn.Linear(64, 64), torch.nn.ReLU(),
        torch.nn.Linear(64, 22),
    )


@dataclass
class Transition:
    observation: np.ndarray
    action: int
    reward: float
    next_observation: np.ndarray
    next_mask: np.ndarray
    done: bool


class ReplayBuffer:
    def __init__(self, capacity: int, seed: int):
        self.data: deque[Transition] = deque(maxlen=capacity)
        self.rng = random.Random(seed)

    def append(self, transition: Transition) -> None:
        self.data.append(transition)

    def sample(self, count: int) -> list[Transition]:
        return self.rng.sample(list(self.data), count)

    def __len__(self) -> int:
        return len(self.data)


def choose_action(network: Any, observation: np.ndarray, mask: np.ndarray, epsilon: float, rng: np.random.Generator) -> int:
    legal = np.flatnonzero(mask)
    if not len(legal):
        return 4
    if rng.random() < epsilon:
        return int(rng.choice(legal))
    torch = require_torch()
    with torch.no_grad():
        values = network(torch.as_tensor(observation, dtype=torch.float32).unsqueeze(0))[0].cpu().numpy()
    return int(legal[np.argmax(values[legal])])


def optimize(network: Any, target: Any, optimizer: Any, batch: list[Transition], gamma: float) -> float:
    torch = require_torch()
    observations = torch.as_tensor(np.stack([item.observation for item in batch]), dtype=torch.float32)
    actions = torch.as_tensor([item.action for item in batch], dtype=torch.int64)
    rewards = torch.as_tensor([item.reward for item in batch], dtype=torch.float32)
    next_observations = torch.as_tensor(np.stack([item.next_observation for item in batch]), dtype=torch.float32)
    next_masks = torch.as_tensor(np.stack([item.next_mask for item in batch]).astype(bool), dtype=torch.bool)
    done = torch.as_tensor([item.done for item in batch], dtype=torch.float32)
    predicted = network(observations).gather(1, actions[:, None]).squeeze(1)
    with torch.no_grad():
        next_values = target(next_observations).masked_fill(~next_masks, -torch.inf).max(dim=1).values
        next_values = torch.where(torch.isfinite(next_values), next_values, torch.zeros_like(next_values))
        expected = rewards + gamma * (1.0 - done) * next_values
    loss = torch.nn.functional.smooth_l1_loss(predicted, expected)
    optimizer.zero_grad(set_to_none=True); loss.backward()
    torch.nn.utils.clip_grad_norm_(network.parameters(), 10.0); optimizer.step()
    return float(loss.detach().cpu())


def save_checkpoint(path: Path, network: Any, optimizer: Any, metadata: dict[str, Any]) -> None:
    torch = require_torch(); path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"format": "fleetrl-dqn-checkpoint-v1", "architecture": [64, 64, 64, 22], "model_state": network.state_dict(), "optimizer_state": optimizer.state_dict(), "metadata": metadata}, path)


def load_checkpoint(path: Path) -> tuple[Any, dict[str, Any]]:
    torch = require_torch()
    payload = torch.load(path, map_location="cpu", weights_only=True)
    if payload.get("format") != "fleetrl-dqn-checkpoint-v1" or payload.get("architecture") != [64, 64, 64, 22]:
        raise ValueError("Checkpoint is not a supported FleetRL 64-64-64-22 DQN.")
    network = build_network(); network.load_state_dict(payload["model_state"]); network.eval()
    return network, dict(payload.get("metadata", {}))
