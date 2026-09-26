from __future__ import annotations

import copy
import math
from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces
from pettingzoo import ParallelEnv

from .adapters import decode_discrete_v1, discrete_action_mask_v1, encode_ship_v1
from .core import create_world, neutral_action, step_world
from .geometry import distance, wrap_heading
from .observation import build_observation
from .procedural_map import generate_map
from .resources import load_config

TEAM_IDS = ("blue", "rose")
MAX_FLEET_SLOTS = 8


def scripted_team_action(observation: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Deterministic public-observation flag chaser used as a frozen baseline."""
    team_id = observation["teamId"]
    home = next(base for base in observation["bases"] if base["teamId"] == team_id)
    enemy_base = next(base for base in observation["bases"] if base["teamId"] != team_id)
    enemy_flag = next(flag for flag in observation["flags"] if flag["ownerTeamId"] != team_id)
    result: list[dict[str, Any]] = []
    for ship in observation["ships"]:
        if not ship["alive"]:
            result.append(neutral_action(ship["id"])); continue
        legal = observation["legal"][ship["id"]]
        if legal["pickupFlagIds"]:
            result.append(decode_discrete_v1(observation, ship["id"], 18)); continue
        target = home["deliveryZone"]["center"] if ship["carriedFlagId"] else (enemy_flag["position"] if enemy_flag["known"] and enemy_flag["position"] else enemy_base["approach"])
        desired = math.atan2(target["y"] - ship["position"]["y"], target["x"] - ship["position"]["x"])
        bearing = wrap_heading(desired - ship["heading"])
        turn = max(-1.0, min(1.0, bearing / 0.7))
        nearest_enemy = min(
            (enemy for enemy in observation["enemies"] if enemy["alive"]),
            key=lambda enemy: ((enemy["position"]["x"] - ship["position"]["x"]) ** 2 + (enemy["position"]["y"] - ship["position"]["y"]) ** 2, enemy["id"]),
            default=None,
        )
        selected_enemy = nearest_enemy if nearest_enemy and nearest_enemy["id"] in legal.get("fireTargetShipIds", []) else next((enemy for enemy in sorted(observation["enemies"], key=lambda item: (distance(ship["position"], item["position"]), item["id"])) if enemy["id"] in legal.get("fireTargetShipIds", [])), None)
        fire = bool(legal["canFire"] and selected_enemy)
        result.append({"shipId": ship["id"], "throttle": 1.0 if abs(bearing) < 2.4 else 0.25, "turn": turn, "fire": fire, "fireTargetShipId": selected_enemy["id"] if fire else None, "interact": {"type": "none"}})
    return {"actions": result}


class DelayedJointEngine:
    """Low-level simultaneous boundary engine with one decision-window latency."""

    def __init__(self, config: dict[str, Any] | None = None, map_data: dict[str, Any] | None = None):
        self.config_template = copy.deepcopy(config or load_config())
        # Default training episodes use the same seeded procedural map as live
        # browser matches. Explicit map injection remains available for custom
        # scenarios and focused tests.
        self.map_template = copy.deepcopy(map_data) if map_data is not None else None
        self.state: dict[str, Any] | None = None
        self.current: dict[str, list[dict[str, Any]]] = {team: [] for team in TEAM_IDS}
        self.decision_id = 0

    def reset(self, seed: int, config: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
        selected = copy.deepcopy(config or self.config_template)
        selected_map = (
            copy.deepcopy(self.map_template)
            if self.map_template is not None
            else generate_map(seed)
        )
        self.state = create_world(selected, selected_map, seed)
        self.current = {
            team: [neutral_action(ship["id"]) for ship in self.state["ships"] if ship["teamId"] == team]
            for team in TEAM_IDS
        }
        self.decision_id = 0
        return self.observations()

    def observations(self, source_events: list[dict[str, Any]] | None = None) -> dict[str, dict[str, Any]]:
        if self.state is None:
            raise RuntimeError("Reset the engine before requesting observations.")
        interval = self.state["config"]["timing"]["decisionIntervalTicks"]
        result = {
            team: build_observation(self.state, team, self.decision_id, self.state["tick"] + interval, source_events)
            for team in TEAM_IDS
        }
        # These controls are committed for the interval beginning at this boundary.
        for team in TEAM_IDS:
            result[team]["heldActions"] = {"actions": copy.deepcopy(self.current[team])}
        return result

    def step(self, issued: dict[str, dict[str, list[dict[str, Any]]]]) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
        if self.state is None:
            raise RuntimeError("Reset the engine before stepping.")
        applied = copy.deepcopy(self.current)
        accepted = {
            team: copy.deepcopy(issued.get(team, {"actions": [neutral_action(ship["id"]) for ship in self.state["ships"] if ship["teamId"] == team]})["actions"])
            for team in TEAM_IDS
        }
        event_log: list[dict[str, Any]] = []
        interval = self.state["config"]["timing"]["decisionIntervalTicks"]
        for _ in range(interval):
            if self.state["outcome"]:
                break
            self.state = step_world(self.state, applied)
            event_log.extend(copy.deepcopy(self.state["events"]))
        self.current = accepted
        self.decision_id += 1
        observations = self.observations(event_log)
        return observations, {
            "issuedActions": accepted, "appliedActions": applied, "events": event_log,
            "decisionId": self.decision_id - 1, "appliedFromPreviousDecision": True,
            "outcome": copy.deepcopy(self.state["outcome"]),
        }


def _reward(events: list[dict[str, Any]], team_id: str) -> tuple[float, dict[str, float]]:
    opponent = "rose" if team_id == "blue" else "blue"
    captures = sum(1 for event in events if event["type"] == "FlagCaptured" and event.get("teamId") == team_id)
    conceded = sum(1 for event in events if event["type"] == "FlagCaptured" and event.get("teamId") == opponent)
    components = {"capture": float(captures), "conceded": float(-conceded)}
    return components["capture"] + components["conceded"], components


def _team_tensor(observation: dict[str, Any]) -> dict[str, Any]:
    features = np.zeros((MAX_FLEET_SLOTS, 64), dtype=np.float32)
    masks = np.zeros((MAX_FLEET_SLOTS, 22), dtype=np.int8)
    slots = np.zeros(MAX_FLEET_SLOTS, dtype=np.int8)
    for index, ship in enumerate(observation["ships"][:MAX_FLEET_SLOTS]):
        features[index] = encode_ship_v1(observation, ship["id"])
        masks[index] = discrete_action_mask_v1(observation, ship["id"])
        slots[index] = 1
    # Gymnasium MultiDiscrete expects a tuple containing one mask per slot.
    return {"features": features, "action_mask": tuple(masks[index] for index in range(MAX_FLEET_SLOTS)), "ship_mask": slots}


def _decode_team(observation: dict[str, Any], action: Any) -> dict[str, list[dict[str, Any]]]:
    ships = observation["ships"]
    values = np.asarray(action, dtype=np.int64).reshape(-1)
    if len(values) < len(ships):
        raise ValueError(f"Expected one action per ship ({len(ships)}), received {len(values)}.")
    return {"actions": [decode_discrete_v1(observation, ship["id"], int(values[index])) for index, ship in enumerate(ships)]}


class FleetRLGymEnv(gym.Env):
    """Learner-team Gymnasium adapter against a frozen scripted opponent."""

    metadata = {"render_modes": []}

    def __init__(self, mode: str = "duel", learner_team: str = "blue", max_decisions: int | None = None):
        super().__init__()
        if mode not in ("duel", "fleet", "fog-duel", "fog-fleet"):
            raise ValueError(f"Unsupported mode: {mode}")
        if learner_team not in TEAM_IDS:
            raise ValueError(f"Unsupported learner team: {learner_team}")
        config = load_config(); config["mode"] = mode
        self.engine = DelayedJointEngine(config)
        self.mode = mode; self.learner_team = learner_team
        self.opponent_team = "rose" if learner_team == "blue" else "blue"
        self.max_decisions = max_decisions
        self.decisions = 0
        self._observations: dict[str, dict[str, Any]] | None = None
        duel = mode in ("duel", "fog-duel")
        self.action_space = spaces.Discrete(22) if duel else spaces.MultiDiscrete(np.full(MAX_FLEET_SLOTS, 22, dtype=np.int64))
        self.observation_space = spaces.Box(-1.0, 1.0, shape=(64,), dtype=np.float32) if duel else spaces.Dict({
            "features": spaces.Box(-1.0, 1.0, shape=(MAX_FLEET_SLOTS, 64), dtype=np.float32),
            "action_mask": spaces.Tuple(tuple(spaces.MultiBinary(22) for _ in range(MAX_FLEET_SLOTS))), "ship_mask": spaces.MultiBinary(MAX_FLEET_SLOTS),
        })

    def _encoded(self, observation: dict[str, Any]) -> Any:
        return encode_ship_v1(observation, observation["ships"][0]["id"]) if self.mode in ("duel", "fog-duel") else _team_tensor(observation)

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None) -> tuple[Any, dict[str, Any]]:
        super().reset(seed=seed)
        actual_seed = int(seed if seed is not None else self.np_random.integers(0, 2**32))
        config = copy.deepcopy(self.engine.config_template)
        if options and "config" in options:
            config.update(copy.deepcopy(options["config"]))
            config["mode"] = self.mode
        self._observations = self.engine.reset(actual_seed, config)
        self.decisions = 0
        rich = self._observations[self.learner_team]
        return self._encoded(rich), {"seed": actual_seed, "richObservation": rich, "initialControls": "neutral"}

    def step(self, action: Any) -> tuple[Any, float, bool, bool, dict[str, Any]]:
        if self._observations is None:
            raise RuntimeError("Call reset before step.")
        learner_obs = self._observations[self.learner_team]
        if self.mode in ("duel", "fog-duel"):
            learner = {"actions": [decode_discrete_v1(learner_obs, learner_obs["ships"][0]["id"], int(action))]}
        else:
            learner = _decode_team(learner_obs, action)
        opponent = scripted_team_action(self._observations[self.opponent_team])
        issued = {self.learner_team: learner, self.opponent_team: opponent}
        self._observations, transition = self.engine.step(issued)
        self.decisions += 1
        reward, components = _reward(transition["events"], self.learner_team)
        terminated = transition["outcome"] is not None
        truncated = bool(self.max_decisions is not None and self.decisions >= self.max_decisions and not terminated)
        rich = self._observations[self.learner_team]
        info = {**transition, "rewardComponents": components, "richObservation": rich, "learnerTeam": self.learner_team}
        return self._encoded(rich), reward, terminated, truncated, info


class FleetRLParallelEnv(ParallelEnv):
    """PettingZoo Parallel adapter: one agent per team, one action per ship slot."""

    metadata = {"name": "fleetrl_parallel_v1", "render_modes": [], "is_parallelizable": True}

    def __init__(self, mode: str = "fleet", max_decisions: int | None = None):
        if mode not in ("duel", "fleet", "fog-duel", "fog-fleet"):
            raise ValueError(f"Unsupported mode: {mode}")
        config = load_config(); config["mode"] = mode
        self.engine = DelayedJointEngine(config); self.mode = mode; self.max_decisions = max_decisions
        self.possible_agents = list(TEAM_IDS); self.agents = list(self.possible_agents)
        self.decisions = 0; self._observations: dict[str, dict[str, Any]] | None = None
        self._action_space = spaces.MultiDiscrete(np.full(MAX_FLEET_SLOTS, 22, dtype=np.int64))
        self._observation_space = spaces.Dict({
            "features": spaces.Box(-1.0, 1.0, shape=(MAX_FLEET_SLOTS, 64), dtype=np.float32),
            "action_mask": spaces.Tuple(tuple(spaces.MultiBinary(22) for _ in range(MAX_FLEET_SLOTS))), "ship_mask": spaces.MultiBinary(MAX_FLEET_SLOTS),
        })

    def observation_space(self, agent: str) -> spaces.Space:
        return self._observation_space

    def action_space(self, agent: str) -> spaces.Space:
        return self._action_space

    def reset(self, seed: int | None = None, options: dict[str, Any] | None = None) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
        actual_seed = int(0 if seed is None else seed)
        config = copy.deepcopy(self.engine.config_template)
        if options and "config" in options:
            config.update(copy.deepcopy(options["config"])); config["mode"] = self.mode
        self._observations = self.engine.reset(actual_seed, config); self.agents = list(self.possible_agents); self.decisions = 0
        return {team: _team_tensor(self._observations[team]) for team in self.agents}, {team: {"richObservation": self._observations[team], "seed": actual_seed, "initialControls": "neutral"} for team in self.agents}

    def step(self, actions: dict[str, Any]) -> tuple[dict[str, Any], dict[str, float], dict[str, bool], dict[str, bool], dict[str, dict[str, Any]]]:
        if self._observations is None:
            raise RuntimeError("Call reset before step.")
        issued = {team: _decode_team(self._observations[team], actions[team]) for team in self.agents}
        self._observations, transition = self.engine.step(issued); self.decisions += 1
        terminated_value = transition["outcome"] is not None
        truncated_value = bool(self.max_decisions is not None and self.decisions >= self.max_decisions and not terminated_value)
        observations = {team: _team_tensor(self._observations[team]) for team in self.agents}
        rewards: dict[str, float] = {}; infos: dict[str, dict[str, Any]] = {}
        for team in self.agents:
            rewards[team], components = _reward(transition["events"], team)
            infos[team] = {**transition, "rewardComponents": components, "richObservation": self._observations[team]}
        terminations = {team: terminated_value for team in self.agents}; truncations = {team: truncated_value for team in self.agents}
        if terminated_value or truncated_value:
            self.agents = []
        return observations, rewards, terminations, truncations, infos
