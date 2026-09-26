from __future__ import annotations

import json

import numpy as np

from fleetrl.dqn import build_network, require_torch, save_checkpoint
from fleetrl.export import export_dense
from fleetrl.train import terminal_for_bootstrap


def test_collection_truncation_keeps_bootstrap_but_match_termination_does_not() -> None:
    assert terminal_for_bootstrap(False, True) is False
    assert terminal_for_bootstrap(True, False) is True


def _dense_forward(model: dict, row: np.ndarray) -> np.ndarray:
    values = row.astype(np.float32)
    for layer in model["layers"]:
        weights = np.asarray(layer["weights"], dtype=np.float32).reshape(layer["outputWidth"], layer["inputWidth"])
        bias = np.asarray(layer["bias"], dtype=np.float32)
        values = weights @ values + bias
        if layer["activation"] == "relu":
            values = np.maximum(values, 0)
        values = values.astype(np.float32)
    return values


def test_pytorch_checkpoint_exports_exact_dense_orientation(tmp_path) -> None:
    torch = require_torch(); torch.manual_seed(42)
    network = build_network(); optimizer = torch.optim.Adam(network.parameters(), lr=0.001)
    checkpoint = tmp_path / "checkpoint.pt"; output = tmp_path / "agent.agent.json"
    save_checkpoint(checkpoint, network, optimizer, {"algorithm": "dqn", "trained": True, "steps": 1})
    package = export_dense(checkpoint, output, "Round trip")
    parsed = json.loads(output.read_text(encoding="utf-8"))
    assert parsed["controller"] == "shared-dense-argmax-v1"
    rng = np.random.default_rng(8)
    for _ in range(4):
        row = rng.uniform(-1, 1, 64).astype(np.float32)
        with torch.no_grad():
            expected = network(torch.as_tensor(row).unsqueeze(0))[0].numpy()
        actual = _dense_forward(package["model"], row)
        np.testing.assert_allclose(actual, expected, rtol=1e-5, atol=1e-6)
