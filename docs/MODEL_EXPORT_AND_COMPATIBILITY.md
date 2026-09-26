# Model export and compatibility

The guaranteed transfer route is `dense-json-v1` with `ship-64-v1` inputs and `discrete-22-v1` outputs. Versions must match `fleetrl-agent-v1` and `fleetrl-rules-v5`.

The exporter supports exactly three Dense layers: 64→64 ReLU, 64→64 ReLU, and 64→22 linear. Every bias and weight is finite float32. Each layer stores a flat output-by-input row-major matrix where `y[j] = bias[j] + sum(weights[j*inputWidth+i] * x[i])`. PyTorch `Linear.weight` already uses output-by-input orientation; TensorFlow.js kernels are transposed during browser export.

Evaluation masks illegal actions, then selects the smallest index on equal maximum values. Special action IDs with no legal target decode to neutral. A shared fleet network receives one row and returns one action per living ship in stable ID order; no scalar is broadcast silently.

Import the exported `.agent.json` in New Game or League. Validation checks versions, dimensions, activations, finite float32 conversion, layer and parameter limits, and controller/encoder/decoder IDs before committing anything. Unsupported layers and preprocessing are rejected rather than discarded.

The 64-feature encoder is a convenience representation and intentionally omits some history/queue context. No normalization file is silently applied. A future richer encoder requires a new version and matching browser adapter.
