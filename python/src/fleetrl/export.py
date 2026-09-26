from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from .dqn import load_checkpoint


def export_dense(checkpoint: Path, output: Path, name: str) -> dict[str, Any]:
    network, metadata = load_checkpoint(checkpoint)
    linear = [layer for layer in network if layer.__class__.__name__ == "Linear"]
    activations = ["relu", "relu", "linear"]
    layers = []
    for index, layer in enumerate(linear):
        weights = layer.weight.detach().cpu().numpy().astype(np.float32)
        bias = layer.bias.detach().cpu().numpy().astype(np.float32)
        if not np.isfinite(weights).all() or not np.isfinite(bias).all():
            raise ValueError("Checkpoint contains non-finite parameters.")
        layers.append({"inputWidth": int(weights.shape[1]), "outputWidth": int(weights.shape[0]), "activation": activations[index], "weights": weights.reshape(-1).tolist(), "bias": bias.tolist()})
    package = {
        "packageVersion": "fleetrl-package-v1", "name": name, "apiVersion": "fleetrl-agent-v1", "controlScope": "team",
        "controller": "shared-dense-argmax-v1", "featureEncoder": "ship-64-v1", "actionDecoder": "discrete-22-v1",
        "supportedModes": ["duel", "fleet", "fog-duel", "fog-fleet"],
        "model": {"format": "dense-json-v1", "inputWidth": 64, "outputWidth": 22, "layers": layers},
        "metadata": {**metadata, "exportedFrom": checkpoint.name, "weightOrientation": "output-by-input-row-major", "argmaxTies": "smallest-index", "browserSafeDeclarative": True},
    }
    output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(package, separators=(",", ":")), encoding="utf-8")
    return package


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a trusted local PyTorch DQN as browser-safe Dense JSON.")
    parser.add_argument("--checkpoint", type=Path, required=True); parser.add_argument("--format", choices=("dense-json",), default="dense-json")
    parser.add_argument("--output", type=Path, required=True); parser.add_argument("--name", default="Python DQN Export")
    args = parser.parse_args(); package = export_dense(args.checkpoint, args.output, args.name)
    print(json.dumps({"output": str(args.output), "layers": [f"{layer['inputWidth']}->{layer['outputWidth']}" for layer in package["model"]["layers"]], "trained": package["metadata"].get("trained", False)}, indent=2))


if __name__ == "__main__":
    main()
