# 03. Architecture, student code, and neural-model execution

Status: chosen implementation design. Read [05](05_OBSERVATION_ACTION_AND_MODEL_API.md) for the wire contract and [06](06_TIMING_DETERMINISM_AND_REPLAYS.md) for scheduling. Source facts are listed in [14](14_SOURCES.md), especially S03-S07.

## Contents

1. Runtime boundaries and directory layout
2. Student submission paths
3. Import and model validation
4. Sandboxed policy lifecycle
5. Inference bridge and resource limits
6. Security and error behavior

## 1. Runtime boundaries

Use one application and one pure TypeScript simulation library. Do not implement separate gameplay engines for practice, training, tournaments, and replays. The shared core consumes validated actions and emits state/events; adapters decide how observations/actions are obtained and whether to render.

```text
Main thread: React UI + Canvas renderer + Web Audio presentation
    |
    +-- application controllers + IndexedDB repositories
    |
    +-- match coordinator worker: clock, sim-core, visibility, replay writer
    |       |
    |       +-- agent worker A: QuickJS guest + trusted model adapter
    |       +-- agent worker B: QuickJS guest + trusted model adapter
    |
    +-- training worker: trusted trainers + sim-core + TF.js
    |
    +-- tournament controller: bounded match jobs and persistence
```

Keep the worker topology manageable: a match job has one coordinator and two agent workers; do not spawn one inference worker for every ship. A team's ships share a policy runtime and may use batched inference. The host model adapter can run in that team's worker, outside QuickJS. The coordinator can terminate the entire agent worker when a host-side inference call hangs. Loaded WASM and libraries are trusted application dependencies; all submissions remain untrusted input.

Only the coordinator owns mutable world state. Send structured, copied observations and validated action messages. Never pass world objects, engine references, opponent code, host functions, or arbitrary shared memory to a guest. Main-thread rendering receives viewer-filtered snapshots, not a writable simulation handle.

Proposed directory structure to implement:

```text
src/
  app/                 routes, workspace, controllers, composition
  components/          reusable accessible UI
  styles/              tokens and CSS Modules
  sim/                 pure state, physics, combat, flags, visibility, rewards
  contracts/           versioned types, schemas, codecs, feature/action adapters
  agents/              import, registry, validation, sandbox, inference adapters
  workers/             coordinator, agent host, trainer entrypoints
  training/            Q-learning, DQN, replay buffer, evaluation, checkpoints
  tournaments/         schedule, standings, result matrix, classroom state
  rendering/           Canvas renderer, camera, sprites, effects, fog
  audio/               event mapping, mixer, synthesis/playback
  replay/              recorder, playback, keyframes, checksums
  persistence/         IndexedDB repositories, migrations, export/import
  content/             lessons, maps, baseline metadata
public/
  assets/              original or approved visual/audio files
  runtime/             version-matched WASM/runtime assets
  content/             curated starter packages and maps
```

Use dependency inversion at four boundaries: `PolicyRunner`, `ModelAdapter`, `ReplayStore`, and `Renderer`. Keep interfaces small; a full enterprise event bus or dependency-injection framework is unnecessary. Events are typed domain records, not arbitrary callbacks that mutate simulation state.

## 2. Student submission paths

Support all of these in the completed first release:

| Path | Student provides | Platform does |
|---|---|---|
| Write/paste code | One JavaScript source string | Wraps it in a versioned script package and validates `act`. |
| Upload code | UTF-8 `.js` file | Same path as paste; no arbitrary imports. |
| Text-only neural policy | One `.agent.json` | Validates architecture/weights and uses built-in encoding/decoding. |
| TF.js package | ZIP containing manifest, optional code, model JSON, and all declared weight shards | Loads a restricted Layers model through a trusted adapter. |
| Train here | Q-table or small DQN in the Training Lab | Saves an immutable checkpoint and exports an ordinary agent package. |

The website reads text/data; JavaScript source is interpreted by QuickJS, not by a homemade JavaScript parser. JSON is parsed and schema-validated. Pasting a Python function or uploading a `.pt`/pickle/checkpoint is not supported. Explain the required export instead of attempting to execute it.

The text-only dense model is a deliberate easy route: students can paste weights and architecture as JSON. It supports finite `float32` values, sequential Dense layers, and `relu`, `tanh`, or `linear` activation. It is not a claim that arbitrary neural architectures are text-convertible. TF.js layers/weight shards support a wider, explicitly checked subset. ONNX is an optional later adapter; do not expose an enabled ONNX button before it passes compatibility tests.

## 3. Import transaction

Use the same pipeline for pasted and uploaded content:

```text
read bounded bytes -> identify format -> safe archive extraction -> schema checks
 -> hash immutable files -> inspect model -> initialize isolated runner
 -> warm-up smoke tests -> behavior/latency validation -> commit to library
```

Default intake limits (configurable, never unlimited): 100 KiB source; 10 MiB compressed ZIP; 32 MiB total extracted bytes; 64 files; path depth <= 4; 2 MiB JSON document except declared dense weights within the total cap; <= 1,000,000 model parameters; input/output feature width <= 256; batch <= 8; <= 8 Dense layers for `dense-json-v1`. These are project guardrails, not proof of safety or performance.

Reject `../`, absolute paths, backslash-normalized traversal, symlinks, case-colliding names, duplicate ZIP entries, excessive decompression, unsupported files, undeclared shards, remote URLs, and unknown required manifest fields. Enforce limits while extracting; do not check only the archive's reported sizes. No scripts run during extraction. Do not mount a ZIP as a website.

Permit only exact declared model files. TF.js can reference more than one weights shard; resolve every local manifest path from validated in-memory bytes. Never let a model loader fetch arbitrary URLs. Restrict the first TF.js adapter to built-in serializable Dense/Activation/Flatten layers with fixed rank-2 numeric inputs and outputs. Reject Lambda/custom executable layers, unknown ops, dynamic/unbounded shapes, nonfinite weights, and oversized intermediate tensors. Dropout may be accepted only after evaluation-mode behavior is explicitly tested; it is not required initially.

Calculate a SHA-256 package identity from a canonical manifest and sorted `(path, file-hash)` entries. Content hashes provide identity/integrity checks, not authenticated student identity or tamper-proof grading. Editing source creates a new version. Commit the registry entry only after all mandatory checks pass; failed imports remain in a temporary report, not the tournament roster.

Validation reports must show the source/format, required mode/control scope, model shapes, parameter count, bytes, feature/action versions, reset behavior, invalid action counts, and measured decision latency on this browser/backend. A load success is not a competitive-performance claim.

## 4. Sandboxed policy lifecycle

Each match/side gets a separate QuickJS runtime, preferably a separate WASM module instance for stronger isolation. Configure memory/stack limits and an interrupt handler. QuickJS exposes these controls, but integration and host boundaries still need security tests [S03].

Lifecycle: load source under a load budget; locate required `act` and optional `reset`; initialize a seeded guest PRNG; call reset once; issue decisions; pump guest jobs as needed; sanitize returned data; dispose handles, tensors, contexts, and the runtime at match end. Ship respawn is not a team-runtime reset.

The initial source contract is a plain script declaring `function act(observation, api)` and optionally `function reset(context)`. No module imports, packages, DOM, network, storage, timers, or actual wall-clock access are provided. Expose seeded `api.random()`, bounded `api.log()`, optional `api.predict()`, and the two pure filtered-snapshot encoder/decoder helpers from [05](05_OBSERVATION_ACTION_AND_MODEL_API.md) only. Override guest `Math.random` with the same seeded source and make `Date` unavailable or a documented simulation-time-only shim. Do not expose host `performance`, host `console`, or host objects through convenience helpers.

Serialize through validated bounded data. Copy host-to-guest values without prototypes/functions; extract guest results as data with recursion, string, array, and byte limits. Reject cyclic results, getters that exceed the budget, unexpected object types, nonfinite controls, duplicate ship IDs, and actions for ships outside the team. Error messages displayed in the UI must be text, never interpreted HTML.

## 5. Neural inference bridge

The guest uses `await api.predict("policy", rows)`; the host adapter returns a 2D array of finite numbers. The platform, not the student, implements that method. All preprocessing and postprocessing is counted in the decision budget. Use batching for one shared network applied to several ships.

```text
filtered observation -> guest encode -> bounded input rows
 -> trusted model adapter -> bounded output rows -> guest decode -> actions
```

Do not put TensorFlow.js inside QuickJS. For an async bridge, create an actual guest Promise, resolve/reject it through guest handles after host inference, and explicitly execute pending QuickJS jobs under the remaining deadline. Dispose handles after settlement. Do not assume a host Promise magically becomes a guest Promise. Never run two concurrent `act` calls in one runtime.

Adapters:

- `DenseJsonAdapter`: small, audited, dependency-light forward pass over validated arrays. Row-major matrices are specified in [05](05_OBSERVATION_ACTION_AND_MODEL_API.md). Good baseline for text submission and predictable small-policy evaluation.
- `TfjsLayersAdapter`: TF.js loads approved topology/shards, runs prediction with explicit tensor disposal, and never trains during matches. TensorFlow.js documents browser model loading/saving and local persistence [S04-S05].
- Later `OnnxAdapter`: `onnxruntime-web`, explicit supported ops/shapes/provider, local model bytes, no external data fetch. ONNX browser support does not guarantee a particular exported graph is compatible; validate each model and ship matching runtime assets [S06].

Reference evaluation starts on a CPU path; accelerated backends are opt-in and labeled. Do not mix GPU and CPU latency rankings without disclosure. Warm model initialization separately before timing a match. Initialization has its own bounded timeout and is never retried indefinitely.

Resource safeguards: QuickJS heap 32 MiB, stack 512 KiB, output message <= 64 KiB, at most one batched inference call per decision initially, input/output widths <= 256, batch <= fleet size, and a bounded predicted intermediate allocation budget. A 100 ms host decision watchdog covers JavaScript, inference, queueing, bridge jobs, and serialization. Heap limits do not include TF.js tensor memory or GPU allocations; track those separately and limit models before loading. Worker termination is a recovery mechanism, not a universal hard GPU memory/time guarantee.

## 6. Failure and threat model

Catch invalid output, thrown errors, async never-resolution, infinite loops, oversized allocations, malformed models, and unsupported execution providers. Report actionable errors without crashing the whole app. A single bad ship action becomes neutral for that ship and increments a diagnostic; malformed envelopes/runtime errors fail the team decision. Repeated failures trigger the forfeit rules in [06](06_TIMING_DETERMINISM_AND_REPLAYS.md).

Workers can access network/storage APIs in their host realm; they are not sufficient isolation by themselves [S07]. Defense in depth includes audited guest bindings, separate runtimes, bounded imports, first-party runtime files, restrictive tested Content Security Policy, and no sensitive credentials in the application origin. Do not promise perfect sandboxing. Include a manual review before deploying uploads from untrusted users.

The local instructor browser is authoritative for its own classroom run, but a modified browser can alter its own displayed results. There is no secure shared online grading claim. The same pure engine may support a future trusted runner, but do not implement an unauthorized backend in this scope.
