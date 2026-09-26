# Python training guide

The downloadable kit is a native renderer-free package, not a service for the website. It never invokes Node, a browser, or JavaScript simulation code.

## Quick start

```text
python -m venv .venv
# activate .venv using the command for Windows, macOS, or Linux
python -m pip install -e ".[train,test]"
python -m fleetrl.rollout --mode duel --seed 7
python -m fleetrl.train --algorithm qlearning --mode duel --steps 1000 --seed 7 --output runs/q
python -m fleetrl.train --algorithm dqn --mode duel --steps 10000 --seed 7 --output runs/dqn
python -m fleetrl.evaluate --checkpoint runs/dqn/checkpoint.pt --episodes 20
python -m fleetrl.export --checkpoint runs/dqn/checkpoint.pt --format dense-json --output agents/dqn.agent.json
python -m pytest
```

The Gymnasium adapter controls one learner team against `flag-chaser-v1`. Duel returns 64 float32 features and accepts one discrete action. Fleet returns eight stable ID-ordered slots with feature, ship, and legal-action masks; provide an action for every real ship. The PettingZoo Parallel adapter uses the same padded team representation for both simultaneous teams.

The environment preserves the initial neutral interval and current/pending controls. Match conclusion—including clock expiry—terminates. The optional collection cutoff truncates and remains bootstrap-eligible. Death alone does neither.

Default sparse reward is own captures minus opponent captures. It does not add terminal win reward. Training return is not win rate or league score. Q-learning uses the documented 8×4×3×2×2 lossy bins. DQN uses 64→64 ReLU→64 ReLU→22 linear, a bounded replay buffer, masked next actions, Adam, and a periodically copied target network.

PyTorch checkpoints contain trusted local training state. Load only checkpoints you created or trust. The browser accepts the exported declarative `.agent.json`, never `.pt`, pickle, or Python source.
