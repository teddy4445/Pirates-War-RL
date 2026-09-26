from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np


def discretize_ship64(features: np.ndarray) -> tuple[int, int, int, int, int]:
    """Published lossy beginner state: bearing, distance, health, carrying, visibility."""
    carrying = int(features[8] > 0.5)
    if carrying:
        dx, dy = float(features[12]), float(features[13])
    elif features[20] > 0.5:
        dx, dy = float(features[21]), float(features[22])
    else:
        dx, dy = float(features[14]), float(features[15])
    angle = (np.arctan2(dy, dx) + 2 * np.pi) % (2 * np.pi)
    bearing_bin = int(angle / (2 * np.pi / 8)) % 8
    distance_bin = int(np.digitize(min(1.0, float(np.hypot(dx, dy))), [0.12, 0.3, 0.6], right=False))
    health_bin = int(np.digitize(float(features[6]), [1 / 3, 2 / 3], right=False))
    visible = int(features[28] > 0.5)
    return bearing_bin, distance_bin, health_bin, carrying, visible


def state_key(features: np.ndarray) -> str:
    return ":".join(str(value) for value in discretize_ship64(features))


@dataclass
class QTable:
    alpha: float = 0.2
    gamma: float = 0.99
    values: dict[str, np.ndarray] = field(default_factory=dict)
    visits: dict[str, int] = field(default_factory=dict)

    def row(self, state: str) -> np.ndarray:
        if state not in self.values:
            self.values[state] = np.zeros(22, dtype=np.float32)
            self.visits[state] = 0
        return self.values[state]

    def choose(self, state: str, mask: np.ndarray, epsilon: float, rng: np.random.Generator) -> int:
        legal = np.flatnonzero(mask)
        if not len(legal):
            return 4
        if rng.random() < epsilon:
            return int(rng.choice(legal))
        row = self.row(state)
        return int(legal[np.argmax(row[legal])])

    def update(self, state: str, action: int, reward: float, next_state: str, next_mask: np.ndarray, done: bool) -> float:
        row = self.row(state)
        legal = np.flatnonzero(next_mask)
        bootstrap = 0.0 if done or not len(legal) else float(np.max(self.row(next_state)[legal]))
        target = reward + self.gamma * bootstrap
        error = target - float(row[action])
        row[action] = np.float32(float(row[action]) + self.alpha * error)
        self.visits[state] = self.visits.get(state, 0) + 1
        return error

    def save(self, path: Path, metadata: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "format": "fleetrl-qtable-v1", "featureEncoder": "ship-64-v1", "actionDecoder": "discrete-22-v1",
            "discretizer": {"bearingBins": 8, "distanceBoundaries": [0.12, 0.3, 0.6], "healthBoundaries": [1 / 3, 2 / 3], "carryingBins": 2, "enemyVisibilityBins": 2},
            "alpha": self.alpha, "gamma": self.gamma, "metadata": metadata,
            "states": {key: {"q": [float(value) for value in row], "visits": self.visits.get(key, 0)} for key, row in sorted(self.values.items())},
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
