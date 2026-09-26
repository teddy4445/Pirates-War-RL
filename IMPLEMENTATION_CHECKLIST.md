# FleetRL full-build checklist

Checked items are implemented and verified, not merely represented in the interface. Evidence is in `docs/RELEASE_VERIFICATION.md` and the automated suites.

## Authority and inputs

- [x] Read the repository instructions, normative docs, examples, screen reference, sound pack, and `fleetrl-assets` workflow.
- [x] Inspect and classify every supplied PNG and the extracted sound pack.
- [x] Record actual inputs, hashes, roles, missing archives, derivatives, and review state in `INPUT_INVENTORY.md` and `ASSET_MANIFEST.json`.
- [x] Extend the decision log and traceability for Python, parity, download, assets, offline behavior, and release evidence.

## Browser stages P01-P15

- [x] P01 bootstrap/contracts: pinned lockfile, hash shell, runtime schemas, malformed-fixture tests, and project scripts.
- [x] P02 pure world/kinematics: fixed step, continuous geometry, deterministic RNG, swept collisions, manual Canvas vertical slice.
- [x] P03 combat/flags/respawn: projectiles, simultaneous damage, flag lifecycle, outcomes, invariants.
- [x] P04 timing/visibility: delayed simultaneous decisions, neutral fallback, four modes, occlusion, adapters.
- [x] P05 QuickJS/import: bounded transactional intake and dedicated sandbox workers without host execution shortcuts.
- [x] P06 model packages: Dense JSON, restricted TF.js ZIP, resource limits, worker inference, numeric round trips.
- [x] P07 Agent Lab/replays: real practice, observation/action inspection, accepted-action recordings, policy-free playback.
- [x] P08 visuals/audio: calibrated directional ships, terrain/effects/icons, manifests, mixer, fog-safe event gating, reduced motion.
- [x] P09 persistence: IndexedDB stores, immutable versions, replay/job recovery, quota errors, transactional workspace import/export.
- [x] P10 Q-learning: real delayed-control worker training, checkpoints, frozen evaluation, actual metrics/export.
- [x] P11 DQN: TF.js replay/target-network trainer, terminal/truncation handling, lifecycle-safe tensors, Dense export.
- [x] P12 tournaments: frozen mirrored round-robin, exact-once results, resume, standings, matrix, metrics, exports.
- [x] P13 Classroom Live: preflight/freeze, seed and side selection, projector reveal, retained-match playback, preserved dashboard state.
- [x] P14 lessons/configuration: onboarding, lesson progress, examples, instructor workspace, versioned challenge configuration.
- [x] P15 hardening: production security/import/browser tests, offline/subpath/static-path checks, layouts, measurements, screenshots.

## Python and compatibility stages P16-P19

- [x] P16 native Python core: installable `src/fleetrl`, deterministic simulation, all modes, rich joint-action API.
- [x] P17 learner adapters: Gymnasium and PettingZoo Parallel, masks/padding/death semantics, delayed-control queue.
- [x] P18 training/export: rollout, tabular Q-learning, PyTorch DQN, evaluate/export CLIs, tested platform documentation.
- [x] P19 parity/download: shared resources, PRNG/trajectory/adapter/procedural checks, manifest-protected reproducible ZIP.

## Release gate

- [x] `dist/` works through production static HTTP, a non-root subpath, and with cross-origin network access blocked.
- [x] Verified offline preparation caches the shell, chunks, workers, WASM, audio, examples, assets, and Python ZIP before reporting ready.
- [x] The UI-downloaded ZIP installs in a clean directory and runs tests, rollout, short DQN training, evaluation, and export.
- [x] That exported `.agent.json` imports through the production UI, runs in a tournament, and retains a playable policy-free replay.
- [x] Lint, unit, typecheck, build, Python, parity, sandbox/import/model, and production Playwright suites pass.
- [x] Desktop/mobile/projector screenshots and honest performance/resource measurements are recorded.

## Operational follow-ups, not missing software

- [ ] Audition the sound pack on the actual classroom speakers/headphones before a lesson.
- [ ] Deploy `dist/` to the chosen static host when separately authorized.
