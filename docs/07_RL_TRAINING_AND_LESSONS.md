# 07. Reinforcement-learning training and teaching progression

Status: historical training design retained for the optional native Python kit. Browser lessons and browser-side training were removed from the Pirates War RL product flow. Use [05](05_OBSERVATION_ACTION_AND_MODEL_API.md) for policy interfaces, [06](06_TIMING_DETERMINISM_AND_REPLAYS.md) for delayed control, and [PYTHON_TRAINING_GUIDE](PYTHON_TRAINING_GUIDE.md) for the supported development workflow.

## Contents

1. What the first release teaches
2. Environment/training interfaces
3. Algorithms and model export
4. Rewards and evaluation
5. Training UI and reproducibility

## 1. Suggested lesson progression

| Lesson | Task | RL idea | Evidence of completion |
|---|---|---|---|
| 1 | Manually steer, fire, and inspect a Duel | Observations, actions, transitions | Student identifies acceleration, cooldown, and delayed action. |
| 2 | Write a reflex/finite-state flag agent | Policy and baseline | Valid imported agent captures in a simple map. |
| 3 | Train tabular Q-learning on navigation/flag pickup | Discretization, exploration, Bellman update | Real Q-table, visits, and learning curve. |
| 4 | Compare sparse and shaped rewards | Credit assignment and reward hacking | Same evaluation task, different reward designs. |
| 5 | Train a small DQN | Function approximation, replay, target network | Exported network reproduces checkpoint actions. |
| 6 | Move to Fleet with shared control | Roles, coordination, joint outcomes | Compare shared independent decisions against a scripted coordinator. |
| 7 | Play Fog Duel | Partial observability, memory | Contrast a reactive agent with a stateful search policy. |
| 8 | Play Fog Fleet and the class league | Shared sensing, robustness, empirical evaluation | Pairwise outcomes and a failure-case replay. |

Keep navigation and introductory challenges as configuration presets of the same engine. A reduced challenge may disable combat, use one ship, and replace the objective with a reachable waypoint, but must declare a distinct challenge/rules hash. Never compare its rewards/results directly with capture-the-flag rankings.

PPO, recurrent neural policies, self-play leagues, and strictly decentralized communication are extensions. Do not advertise them as implemented simply because their names fit into a dropdown. Version 1 allows external policies within the supported inference formats and has working built-in Q-learning and DQN training.

## 2. Training environment contract

Provide a renderer-free adapter with reset(seed, config) and a decision-step operation. Return next filtered observation, reward, terminated, truncated, and a diagnostic record. Use the same simulation and action-delay queue as matches. Ship death is not episode termination because respawn exists. A capture ends an episode only when the challenge's terminal rule says so. A match time limit is a truncation unless the task explicitly defines it as terminal; document bootstrap handling.

A training transition records observation at issue time, issued action, action actually applied during the interval, pending-control context, next observation, reward components, and done flags. Do not shift action/reward timestamps in plots to make curves appear better. For a delayed-control MDP, include the queued action in the learner state; a compressed `ship-64-v1` network deliberately omits some physical/control details and must be described as a reactive approximation rather than a mathematically complete Markov state.

Expose own held controls in rich observations for advanced agents/encoders. Keep the initial 64-feature encoder stable; adding delay/history features requires a new encoder ID and a matching model shape. Test the delay queue on a tiny deterministic task before interpreting learning results.

Training runs in a dedicated worker using trusted platform trainer code. Student-uploaded policy scripts still run in the normal sandbox. Do not execute a pasted optimizer in the host realm just because it is called training. A fully user-programmable training-code sandbox is future scope; the first release exposes algorithm settings, architecture, reward configuration, and editable policy examples.

## 3. Actual algorithms

### Tabular Q-learning

Implement epsilon-greedy exploration, finite state bins, alpha/gamma, terminal-aware update, visit counts, and seeded randomness. For a beginner preset, discretize target bearing into 8 bins, target distance into 4, health into 3, carrying into 2, and enemy visibility into 2. Publish bin boundaries and target-selection rules. The discretization is intentionally lossy, and the classroom should inspect aliasing rather than claim it solves full naval control.

Use `discrete-22-v1`; expose Q-table visualization only for visited states. Export as a supported script/data package with the exact discretizer, action decoder, seed metadata, and table. No hidden neural network is needed. Verify round-trip equality of policy decisions.

### Small DQN

Start with a Dense network 64 -> 64 ReLU -> 64 ReLU -> 22 linear, matching `ship-64-v1` and `discrete-22-v1`. Use a bounded experience buffer, mini-batch updates, a separate target network, masked next-action evaluation where appropriate, and an explicit target-update schedule. Defaults to benchmark, not promises: buffer 20,000 transitions; batch 64; gamma 0.99; learning rate 0.001; target copy every 500 gradient steps; epsilon 1.0 to 0.05 over a configurable training horizon. Show transition steps, gradient steps, and episodes separately.

Start with Duel against a frozen baseline. In Fleet, a shared per-ship network is one simple centralized-observation strategy, not a complete multi-agent learning algorithm. Team rewards can be copied to per-ship samples, but that credit-assignment choice must be documented. Batch ship inference and keep opponent checkpoints frozen during an evaluation batch.

TF.js provides model operations, not an automatically complete DQN trainer. Implement and test the RL loop. Dispose tensors outside their required lifetime, including asynchronous predictions and optimizer state. Avoid wrapping async work in a cleanup pattern that disposes before completion. Bound buffers and checkpoints. Stop/pause must actually halt stepping/gradient work without discarding the last saved checkpoint.

Export a supported sequential Dense checkpoint to `dense-json-v1` for text-only submission. Validate layer orientations with numeric forward-pass comparisons; transpose TF.js kernel layout when required by the exported row-major output-by-input format. Alternatively export an approved TF.js Layers package with all shards. Never export only weights without architecture, normalization/encoder, and action-decoder metadata.

## 4. Rewards and evaluation

Separate three quantities in every UI: environment objective (captures/outcome), training reward, and league score. A high shaped return does not mean a high win rate.

Competition objective: +1 for an own flag capture and -1 for an opponent capture as a simple default reward; league ranking is based on W/D/L points, not accumulated training reward. Do not additionally add terminal win reward in that preset without labeling the change. Give, place, pickup, and repeated drop/pick loops receive no positive default reward.

For teaching, offer a clearly labeled optional shaping preset. A state potential can encourage useful navigation, using `r_shaped = r_task + beta * (gamma*Phi(next)-Phi(current))` with bounded Phi and terminal handling. A shaping rule must be evaluated for cycling, unintended objectives, and information leakage. Privileged distance-to-hidden-flag shaping reveals information through training reward; disable it for strict partial-observability experiments or explicitly label the training privilege. Do not claim every dense reward preserves the optimal policy.

Diagnostic hit/damage incentives are optional ablations, not default tournament ranking. Add reward-hacking tests: repeated flag passing, pickup/drop cycling, farming respawning ships, camping, and refusing to finish. Compare shaped and sparse agents on the same unshaped objective and held-out seeds.

Use frozen random, flag-chaser, defender, and finite-state baseline packages with documented logic. An instructor's developed AI can be imported as another immutable agent. Do not claim a shipped model is trained unless real training produced its weights and recorded metadata.

## 5. Training Lab requirements

Show algorithm, model architecture, environment hash, baseline version, training/evaluation seeds, reward preset, exploration schedule, progress, elapsed wall time, simulated time, measured steps/s, and device/backend. Plot actual raw episode returns plus clearly defined rolling averages. Keep rolling-window size visible. Add loss, success/capture rate, invalid decisions, and evaluation results; an empty chart stays empty before training.

Allow pause, resume, stop, save checkpoint, evaluate a frozen checkpoint, compare runs, and export agent/run metrics. Suspend training while launching official local tournament timing. Save hyperparameters and RNG state where supported; do not promise bit-exact resumed GPU training across devices.

Evaluate on held-out seeds and multiple opponent styles. Report sample counts and uncertainty; use seeds or mirrored seed-pairs as the clustering unit when computing bootstrap intervals. Keep train/test seed lists disjoint. Never select and report only successful runs. A model may learn slowly or fail on a hard task; show that honestly and provide easier curriculum presets instead of inventing progress.
