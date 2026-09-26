# 12. Codex build plan: sequential implementation prompts

Status: development sequence. Run these in the same repository. Each stage must leave a runnable increment. Dependencies are real: do not build decorative training/tournament pages before their data pipelines exist.

## Session rule

Prefix every prompt after P01 with: "Read AGENTS.md and IMPLEMENTATION_STATUS.md. Preserve existing working code and user changes. Implement only this stage, run its tests, and update status with actual results." The suggested commands become available during P01; they are not implemented by this specification bundle.

## P01. Bootstrap and contracts

```text
Implement P01. Read README.md and docs 01, 02, 03, 05, 06, and 13.
Create the Vite/TypeScript/React project with CSS tokens, hash routing, and a
minimal responsive shell. Add lint, typecheck, build, unit test, and browser-test
scripts with compatible pinned versions. Create versioned types/runtime schemas
for config, world entities, observations, actions, and agent manifests.
Preserve examples and specifications. Validate default-config.json with tests.
Do not implement a backend, fake metrics, or model execution yet.
```

Gate: app shell loads; core scripts pass; contract tests reject malformed actions/configs; an implementation status file exists.

## P02. Pure world and kinematics

```text
Implement P02 using docs 01, 05, 06, and 13. Build a pure sim-core with fixed
60 Hz ticks, seeded initial state, map validation, water/island polygons, circle
ships, acceleration, drag, rotation, speed limits, and swept collisions.
Add a curated symmetric map with two reachable home approaches and neutral flag
sites. Add manual controls through the same action schema and a minimal Canvas
renderer. Keep camera pixels and world units separate. No student code yet.
```

Gate: G01-G03; same actions produce the same movement independent of rendering; resize/zoom does not change physics.

## P03. Combat, flags, and respawn

```text
Implement P03 from docs 01 and 13. Add cannon cooldown/range, projectiles,
simultaneous damage/death, respawn/protection, all flag states, pickup, give,
shoreline placement, water drop, own-flag return, delivery, and match outcomes.
Use a single explicit tick ordering and typed events. Test contested pickups,
carrier death, inaccessible placement, occupied spawn, and same-tick captures.
```

Gate: G04-G12; a manual player can complete every required interaction; events do not rely on animations.

## P04. Decisions, visibility, and timing

```text
Implement P04 from docs 05 and 06. Add 100 ms decision windows with one-window
latency, parallel request dispatch, simultaneous commit, neutral fallback, and
injected-clock tests. Start with trusted built-in PolicyRunner fixtures.
Implement all four modes, radius plus island occlusion, team-union visibility,
full-state versus fog-safe observations, legal-action masks, and feature encoding.
```

Gate: F01-F04 and T01-T02; hidden-state non-interference passes; action replies cannot gain an early-commit advantage.

## P05. JavaScript sandbox and import

```text
Implement P05 from docs 03 and 05. Add paste/file upload, immutable agent versions,
separate QuickJS/WASM worker runtimes, reset/act, seeded RNG, bounded logs,
heap/stack/interrupt limits, safe output extraction, and lifecycle cleanup.
Never use host eval, new Function, or dynamic import for submissions.
Add runtime reset, timeout/forfeit handling, safe ZIP intake, and validation reports.
```

Gate: S01, S03-S04, S06-S09 and T03-T04; bad scripts do not freeze the UI or expose host capabilities; included script starter passes the real sandbox.

## P06. Neural model packages

```text
Implement P06 from docs 03 and 05. Add dense-json-v1 and the text-only .agent.json
route, built-in ship-64-v1/discrete-22-v1 adapters, and restricted TF.js Layers
ZIP loading from local validated bytes. Implement a correct asynchronous guest
predict bridge with job pumping and handle disposal. Batch fleet inference.
Add shape/parameter/op limits, model warm-up, host tensor memory tracking, and
numeric export/import tests. Keep ONNX disabled and labeled future scope.
```

Gate: S02, S05, S09, R04-R05; the untrained constant-forward package loads; the async starter works with a test network; there is no remote model fetch.

## P07. Agent Lab and replay foundation

```text
Implement P07 using docs 06 and 09. Build the editor, API reference, live
observation/action inspector, errors, decision stepping, practice setup, and
actual match results. Record accepted actions, events, keyframes, hashes,
request/application ticks, and bounded optional debug output.
Build replay without policy execution, seek, viewpoints, and event inspection.
```

Gate: T05-T08, U01-U03; deleting/unloading agents does not prevent a compatible retained replay; missing Q-values are not fabricated.

## P08. Pirate visuals and sound

```text
Implement P08 using $fleetrl-assets, docs 02 and 04, and the existing event stream.
Create coherent no-cost directional ship art, water/islands, flags, cannonballs,
hits/splashes, sinking, respawn, and short sound effects. Use original procedural
SVG/Canvas plus the included sound synthesizer. Add mute, volume, reduced motion,
asset manifests/provenance, loading fallbacks, and a preview scene.
Do not modify authoritative physics to match an animation.
```

Gate: U04-U06, F02; review screenshots at target sizes and a real animation/audio preview; report any unreviewed assets honestly.

## P09. Persistence and portable packages

```text
Implement P09 from docs 11, 03, and 06. Add IndexedDB repositories, drafts versus
immutable versions, model blobs, replay chunks, migrations, quota handling,
backup/export/import, and interrupted-operation recovery. Ensure imports are
transactional and deleting a draft does not delete a frozen tournament model.
```

Gate: U09, C08; save/reload/export/import work; a quota error is visible and does not silently lose required replay data.

## P10. Real Q-learning training

```text
Implement P10 from doc 07. Add renderer-free training via the same delayed-control
engine, a small navigation/flag curriculum, real Q-learning, seeded exploration,
state discretization, real metrics, pause/resume/stop, checkpointing, evaluation,
and a supported Q-table export. Show issued versus applied actions correctly.
Do not populate any chart with random illustrative results.
```

Gate: R01, R03, R05-R09 and T09; a real run produces an inspectable table and exports/reimports its policy.

## P11. Real DQN training and model export

```text
Implement P11 from doc 07. Add small TF.js DQN training with replay buffer,
separate target network, terminal/truncation handling, configurable epsilon and
hyperparameters, bounded tensors/checkpoints, and held-out evaluation.
Export supported Dense models to dense-json-v1 and TF.js package formats.
Report actual training behavior; do not promise improvement or hide failed runs.
```

Gate: R02-R09; tiny deterministic RL fixtures pass; a genuinely trained checkpoint survives export/import with matched forward outputs.

## P12. Round-robin and results analytics

```text
Implement P12 from docs 08 and 11. Add frozen multi-agent rosters, deterministic
mirrored-seed round-robin scheduling, bounded headless match jobs, persistence,
resume, standings, W/D/L/forfeit definitions, score-rate matrix, latency/flag
metrics, and exports. Use actual match results. Distinguish interrupted jobs
from legitimate agent failures and retain compatible replays.
```

Gate: C01-C04, C07-C09; eight agents/one seed generate exactly 56 unique mirrored games and real selectable results.

## P13. Classroom Live

```text
Implement P13 from docs 08 and 09. Add bulk preflight/freeze, projector layout,
progress/standings/matrix, alias labels, feature-this-match, seed/side selection,
spoiler-free reveal, replay controls, and return-to-dashboard state preservation.
Pause new tournament jobs while featuring playback by default. Label replay,
precomputed, and genuinely live views correctly. Add a classroom export/runbook.
```

Gate: C05-C09; clicking any retained completed matchup plays that recorded result, not a new inference run.

## P14. Lessons and instructor configuration

```text
Implement P14 from docs 07, 09, and 15. Complete the lesson briefs, student
onboarding, examples, course progress, instructor workspace, and validated
challenge builder. Allow ship/vision/respawn/time/reward/baseline settings using
versioned configs. Keep unfinished advanced algorithms/features disabled.
```

Gate: all thirteen screen functions work over real data; lesson presets and frozen rules are traceable.

## P15. Production, security, and accessibility hardening

```text
Implement P15 from docs 10 and 11. Run the complete contract/physics/security/
model/training/replay/tournament test suite and actual browser tests against a
production build. Verify first-party WASM/worker paths, static routes, capability
fallbacks, quota handling, prepared offline classroom behavior, audio gestures,
reduced motion, keyboard access, and projector/mobile layouts.
Fix failures and report measured performance with device/provider/concurrency.
Export a deployable dist bundle, actual verification report, and honest release
notes. Do not call unfinished features complete.
```

Gate: the full end-to-end release demonstration in doc 10, with actual commands, results, screenshots, and known limitations.

## Extension prompts: only after the release gate

ONNX adapter: implement with a tested operator/provider allowlist and real exported-model fixtures; no automatic PyTorch checkpoint loading. PPO/recurrent policies: add real algorithm tests, explicit memory/reset schemas, and versioned features. Decentralized fog: separate per-ship runtimes and communication, preserving the centralized track. Remote submission/verified grading: design authentication/privacy/infrastructure separately; this changes the browser-only scope and requires an explicit product decision.
