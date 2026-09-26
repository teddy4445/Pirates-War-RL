# Pirates War RL implementation status

Last updated: 2026-09-26

## Current stage

The game-first product redesign is implemented. The repository contains the static Pirates War RL browser game, optional native headless Python development kit, generated production assets, deterministic parity resources, tested download archive, production `dist/`, screenshots, and release evidence.

## Implemented

- Browser-only Vite/React/TypeScript application with a cinematic sales landing page, opening game menu, responsive/accessibility foundations, Canvas 2D arena, generated assets, event-driven audio, and subpath-safe static output.
- GitHub Pages delivery is configured through a least-privilege Actions workflow. The artifact contains `CNAME` for `rl.teddylazebnik.com`, `.nojekyll`, direct-route recovery, relative assets/workers/downloads, and a build-time Pages integrity gate. The remaining repository-settings and DNS steps are documented explicitly.
- Pure fixed-step simulation with continuous geometry, swept collisions, projectiles, simultaneous combat resolution, full flag lifecycle, stable respawns, four modes, seeded single-central or 1-3-pair symmetric archipelagos with 0-6 physical wreck shoals, authoritative fog, and delayed simultaneous decisions.
- Dedicated QuickJS/WASM agent workers; bounded script and ZIP intake; immutable versions; Dense JSON and restricted TensorFlow.js imports; bounded Dense worker inference; no host-realm student-code execution.
- One-off game setup accepts built-in or session-uploaded JavaScript, Dense JSON, and restricted TensorFlow.js captains independently for both sides, with mode, remembered seed/viewpoint/sound settings, a 15–300 second battle-time setting, and a 2-6/random fleet-size choice.
- Five distinct polygon-aware built-in captains replace the old introductory baselines: Raider, Reef Runner, Iron Guardian, Broadside Corsair, and Grand Admiral. Their navigation plans complete obstacle-safe steal-and-return routes; the quality regression requires a real pickup and capture before timeout. Small per-match helm variation uses independent recorded agent seeds, so retries on one map are not identical while replays remain exact.
- One enemy-flag delivery wins. Timeout outcomes compare captures, then ship sinks; carrier drops relocate to the nearest eligible neutral island site. TypeScript and native Python implement the same rule.
- `fleetrl-rules-v5` retains version-4 cannon/impact behavior and triples the default respawn delay from 5 to 15 simulation seconds. Friendly and enemy hulls each take `round(0.2 × own inward speed)` toward the equal-mass midpoint; terrain uses velocity into the outward contact normal. Collision and cannon damage share one simultaneous ledger, spawn protection suppresses health loss, and enemy ramming sinks count for the public kill tiebreak. Browser/Python tests cover the longer shared respawn configuration alongside asymmetric, friendly, terrain, and simultaneous lethal contacts, target choice, lead direction, range damage, and close-range marking.
- Fog observations expose exact island collision polygons by default. Optional hidden-map fog configurations reveal a complete polygon and its neutral site when any part first enters friendly sensor range, then remember that discovery for the team. TypeScript and Python share tests for this behavior.
- Arena presentation includes layered animated currents, moving fish schools, turtles, jellyfish, manta shadows, drifting kelp, foam eddies, and sun sparkles, plus irregular islands with deterministic varied dressing and landmarks, submerged wrecks, moving palms/gulls/bubbles, ship shadows, separate below-hull health and yellow cannon-ready bars, richer wakes/smoke/debris/splashes, event-timed cannon, impact, sinking, respawn, and flag effects, plus a white-gold burst and expanding ring for close-range hits. Every added sea-life layer is presentation-only and uses cosmetic hashes rather than gameplay RNG. Fog uses an Age-of-Empires-style explored map: unknown space is black, remembered space is dimmed, current terrain-clipped team vision is clear, and hidden dynamic state remains filtered. Original procedural Canvas art is recorded in `public/assets/manifests/procedural-environment.json`.
- Full-screen autonomous match arena with in-arena score/clock, compact ship-sink HUD, and a bottom-center per-ship respawn countdown for both fleets. Fog-safe enemy timers only appear for known credited sinks. Event-driven audio, pause/continue, sound, close-to-results, post-game statistics, retry, and policy-free replay are included. The old “Live broadcast” label and all manual ship controls are absent.
- Game-styled League with mirrored all-vs-all standings plus seeded 4/8/16-slot knockout brackets, duplicate captain slots, animated left-to-right winner advancement, sequential execution, pause-after-battle, JSON export, and recorded replay selection for every completed match.
- Policy-free replay playback adds a cyclic X1/X2/X4/X8 speed control and thins repetitive audio above X2.
- One developer-guide screen documents the complete contract, observations/actions, simultaneous timing, limits, supported packages, and optional Python workflow.
- Learn, browser Training, persistent Agents, Instructor, Classroom, and manual-practice UI/source flows have been removed.
- Installable native Python simulation with low-level joint actions, Gymnasium and PettingZoo adapters, all modes, deterministic procedural maps, Q-learning, PyTorch DQN, evaluation, Dense export, packaged resources, and platform guidance.
- Shared rules/config/map/schema/RNG/conformance resources and independent TypeScript/Python parity tests across all modes. Python's default training reset now materializes the identical seeded procedural map used by live browser matches; full-state gameplay fixtures cover combat, collision, flags, fog, respawn, and outcomes.
- Reproducible Python ZIP packaging, manifest hashes, stale-artifact check, clean-environment install/train/export proof, and browser import/tournament/replay integration proof.

## Latest verification

- `npm run verify`: ESLint passed; 15 Vitest files / 88 tests passed; TypeScript passed; production build passed, including the 15-second respawn default, 15–300 second match-duration clamp/materialization, reduced cannon damage, full-state cross-language scenarios, impact damage, selected-target combat, procedural layout/wreck coverage, knockout scheduling, and a full built-in-captain pickup/capture match check.
- `npm run pages:check`: the production artifact passed its custom-domain, relative-path, route-recovery, service-worker, offline-manifest, and required-download checks for `https://rl.teddylazebnik.com/`.
- `npm run bundle:check`: 43 maintained Markdown files, 49 maintained JSON files, local links, fences, schemas/defaults, fixture geometry, and trusted example-agent fixtures passed.
- `npm run python:test`: 35 passed.
- `npm run parity`: Python parity subset 20 passed; TypeScript parity subset 4 files / 35 tests passed; 12 trajectories, 10 full-state gameplay cases, 6 adapter cases, and `fleetrl-archipelago-v3` procedural-map fixtures regenerated.
- `npm run test:e2e -- tests/e2e/shell.spec.ts`: 5 production Chromium workflows passed for landing/menu/game/results/replay speed/settings memory, Dense+TF.js one-off import, all-vs-all plus duplicate-captain knockout League/replay, developer guide/Python download/responsive/subpath rendering, the published CNAME and repository-subpath service-worker scope, and retired-route handling.
- `npm run python:bundle-smoke`: the rules-v5 website download was verified; 42-file manifest passed; clean Python 3.13 install; 35 tests; rollout; 40 DQN steps / 33 gradient steps; evaluation; Dense export passed.
- `npm run test:e2e:bundle`: the clean-download Python export imported into New Game, captained a match, produced results, and replayed successfully; 1 passed.
- Python bundle SHA-256 at this verification point: `6324733dfe4afe88af4760eedebe03bb1ee3aaa33ebf9fbc6012bf50cbd32ffd` (recompute after any package/document change).
- See `docs/RELEASE_VERIFICATION.md` for measurements, screenshots, environment, and command details.

## Known limitations

- The app is a local/static game viewer, not an account system, submission server, or tamper-resistant online competition service.
- ONNX, PPO/recurrent policies, decentralized fleet execution, arbitrary user training code, and GPU-only paths remain explicitly disabled extensions.
- The short clean-bundle DQN smoke run proves training/export mechanics, not agent quality. Its two capped evaluation episodes were incomplete and are not counted as wins, draws, or losses.
- Browser policy deadlines are best-effort wall-time budgets, not hard real-time guarantees. Performance varies by device.
- Rules-v1/v2/v3/v4 replays are intentionally incompatible with the version-5 respawn rules and are rejected rather than silently producing different outcomes.
- Audio passed file-level and managed-Chromium playback checks. A human speaker/headphone classroom audition remains an operational review step.
- No public deployment was performed; `dist/` is the static deployment artifact.

## Maintenance rule

Run `npm run release:verify` after any release-affecting change. Rebuild the Python ZIP whenever packaged source, tests, resources, or included documentation changes. Do not reuse the verification numbers above after modifying those artifacts.
