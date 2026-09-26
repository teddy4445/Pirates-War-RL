# FleetRL Python Training Kit

This package is a native, renderer-free Python counterpart to the static FleetRL browser application. It does not start a web server, wrap a browser, invoke Node.js, or execute browser JavaScript.

```bash
python -m pip install -e ".[env,train,test]"
python -m fleetrl.rollout --mode duel --seed 7
python -m fleetrl.train --algorithm dqn --mode duel --steps 1000 --seed 7 --output runs/demo
python -m fleetrl.evaluate --checkpoint runs/demo/checkpoint.pt --episodes 20
python -m fleetrl.export --checkpoint runs/demo/checkpoint.pt --format dense-json --output agents/demo.agent.json
python -m pytest
```

The guaranteed browser transfer format is `dense-json-v1` with `ship-64-v1` inputs and `discrete-22-v1` outputs. PyTorch checkpoints are local trusted training artifacts; never upload pickle/`.pt` files to the browser.

## Install on Windows, macOS, or Linux

Create and activate a Python 3.10+ virtual environment using your platform's normal command, then run `python -m pip install -e ".[env,train,test]"` from the extracted bundle. PyTorch training is CPU-runnable; a GPU is neither required nor assumed. The base simulation depends only on NumPy. Gymnasium, PettingZoo, PyTorch, and pytest are isolated in extras with tested pinned versions.

All four modes are supported by the native engine and team observations. `FleetRLGymEnv` exposes a 64-value/22-action Duel convenience wrapper and per-ship Fleet tensors. `FleetRLParallelEnv` exposes Blue and Green as simultaneous PettingZoo agents. A ship sinking is not terminal; match conclusion terminates, while an external collection cutoff truncates.

The first decision window is neutral. Every transition's diagnostics distinguish controls issued at the current observation boundary from controls applied during the following interval. `ship-64-v1` is intentionally lossy and does not contain the complete delayed-control queue; treat it as a reactive approximation.
