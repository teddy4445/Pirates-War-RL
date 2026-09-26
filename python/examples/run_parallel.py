"""Minimal simultaneous two-team PettingZoo Parallel rollout."""
from fleetrl.envs import FleetRLParallelEnv

environment = FleetRLParallelEnv(mode="fleet", max_decisions=20)
observations, infos = environment.reset(seed=7)
while environment.agents:
    actions = {agent: environment.action_space(agent).sample() for agent in environment.agents}
    observations, rewards, terminations, truncations, infos = environment.step(actions)
print("completed a native headless parallel rollout")
