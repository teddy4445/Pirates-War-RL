# 13. Proposed defaults and decision log

Status: implemented versioned defaults chosen to remove ambiguity. They are configurable, not user-approved empirical balance results. Keep [default-config.json](../examples/default-config.json), browser resources, and packaged Python resources synchronized and validated.

## Numerical defaults

| Setting | Default | Meaning |
|---|---:|---|
| World | 1600 x 900 WU | Camera-independent continuous coordinates |
| Physics | 60 Hz | Fixed integer ticks |
| Presentation | 30 FPS target | Not a physics clock |
| Decision interval | 6 ticks | 100 ms simulated time |
| Policy deadline | 100 ms wall time | Best-effort browser budget |
| Control latency | 1 decision window | Equal for both sides |
| Fleet | 3 ships/side | Duel 1; game setup offers 2-6 or random (engine config remains 2-8) |
| Sensor radius | 220 WU | Fog uses team union and island occlusion |
| Static map known | true | Agents receive exact island polygons; optional fog discovery can disable this |
| Ship radius / health | 12 WU / 100 | Same class in initial release |
| Acceleration / max speed | 55 WU/s^2 / 80 WU/s | Throttle [-1,1] |
| Drag / max turn rate | 0.7 /s / 2.4 rad/s | Simple inertial movement |
| Cannon base damage / cooldown | 18.75 / 48 ticks | Actual damage falls from 30 point-blank to 12 at maximum range |
| Projectile speed / radius / range | 320 WU/s / 3 WU / 250 WU | Physical projectile, not instant hitscan |
| Damage multipliers / close range | 1.60× to 0.65× / first 25% of range | Linear by actual projectile travel; rounded to integer damage |
| Collision damage | 0.2 health per inward WU/s | Per-hull midpoint component for ships; inward-normal component for terrain |
| Pickup/place / give range | 30 / 36 WU | Valid shoreline approach required |
| Loose flag auto-return | 1800 ticks | 30 simulated seconds |
| Respawn / spawn protection | 900 / 60 ticks | 15 s / 1 s |
| Match duration / target | 10800 ticks / 1 capture | Default 180 s; setup range 15–300 s; tied captures use ship sinks, then draw |
| Base delivery radius | 36 WU | Center in navigable water |
| Feature encoder / discrete actions | ship-64-v1 / discrete-22-v1 | Rich API still supports continuous controls |
| Obstacle-ray range | 180 WU | Static terrain only |
| Default tournament seed count | 1 per pair, mirrored | Increase for a research-quality evaluation |
| Default tournament concurrency | 1 match job | Tune after measuring target device |
| Informal entry cap | 3/student | Graded single-checkpoint comparison normally 1 |
| Replay keyframe / checksum spacing | 120 / 60 ticks | Replay uses accepted actions |
| Optional snapshot track | 10 Hz | Featured/exported portability track |

## Key decisions

D01. Static browser app, no mandatory backend/login/cloud inference. File collection for class is external to the app until a shared service is explicitly added.

D02. Use one pure simulation with several adapters, not separate practice/training/tournament engines.

D03. Four modes are the cross-product of one/fleet ships and full/fog visibility. A team policy controls the fleet; default fog shares friendly sensors. Strict decentralization is deferred.

D04. Use 60 Hz physics, a 30 FPS display target, and 100 ms decisions with one-window latency. Do not implement wall-clock-as-physics or earliest-reply-wins.

D05. "Give flag" means direct teammate transfer; "bring back" means automatic home delivery/scoring; "set flag on land" means legal shoreline placement. Ships never sail over land.

D06. Only enemy flags are carried. Recovering one's own loose flag returns it home; one's own flag must be home to score. This is a design choice to keep the rules understandable.

D07. Death drops a flag immediately and schedules respawn in simulation ticks. The sinking animation is independent. Neutral fallback preserves momentum.

D08. Source scripts use QuickJS isolation; models are validated data consumed by trusted adapters. No host eval and no automatic Python/checkpoint execution.

D09. Support scripts, text-only Dense JSON, and restricted TF.js models in the first completed release. Add ONNX only through a tested later adapter. Do not assume arbitrary network/export compatibility.

D10. Small Q-learning/DQN trainers are real product features. Advanced training-code execution, PPO, recurrence, and learned communication are later extensions.

D11. Use an accessible blue/rose light tool UI around a cute pirate arena. Use original procedural assets/sound first. No paid generation dependency or font bundle.

D12. Freeze submissions, run round-robin headlessly, rank by defined W/D/L points, and feature recorded matches. A seed alone is not a replay. No fake metrics or claims of instant tournaments.

D13. Store local data with export/backup and quota-aware retention. A projector instructor view is not authenticated administration. Locally reported scores are not tamper-proof remote grades.

D14. The native Python package is an independent renderer-free implementation, never a website backend or JavaScript wrapper. TypeScript and Python share versioned data and conformance fixtures, not runtime code.

D15. Use `xorshift32` with named FNV-1a/mixed streams for cross-language gameplay determinism. Keep cosmetic randomness on separate streams. Compare continuous trajectories with declared tolerances and discrete events/actions exactly; do not claim universal GPU bit identity.

D16. The mandatory Python transfer contract is `dense-json-v1` with `ship-64-v1` and `discrete-22-v1`. PyTorch checkpoints are locally trusted training state and are never accepted by the browser. Browser imports reject unsupported preprocessing instead of silently discarding it.

D17. The generated Python ZIP is a maintained build artifact with an internal SHA-256 manifest and stale-artifact check. Offline readiness includes that ZIP and all browser worker/WASM/audio/example resources before the UI reports success.

D18. Source raster sheets are measured inputs. Production art uses a calibrated eight-heading atlas and separately encoded hull/objective appearance; terrain is presentation-only over authoritative polygons. Sound comes from the supplied locally synthesized pack and remains visibility-gated.

D19. Browser wall-time latency is measured for diagnostics but never feeds logical match time, standings, or training reward. Evaluation freezes policy learning. Capped collection episodes are reported as truncated/incomplete and remain bootstrap-eligible rather than being relabeled as match losses or terminals.

D20. The browser product is now the game-first **Pirates War RL** viewer. It has a sales landing page, opening game menu, one-time two-agent setup, full-viewport autonomous broadcast, post-game statistics, a game-styled League, and one developer reference. Manual control, Learn, browser Training, persistent Agents, Instructor, and Classroom flows are removed. The native Python training/export kit remains optional. The visual direction is a cohesive cute pirate game using the generated hero background, original atlases/overlays, three-state button sprites, and local procedural audio.

D21. Website matches use the seeded `fleetrl-archipelago-v3` generator: either one large symmetric central island or one to three irregular mirrored island pairs, plus zero to six physical wreck shoals, with the curated map as a bounded fallback. A single delivered flag wins. On timeout, captures are compared first and ship sinks second. Manual and death drops relocate the flag to the nearest available neutral island site (stable ID breaks equal-distance ties); home posts are excluded. Five obstacle-aware built-in captains replace the three introductory baselines. These changes are mirrored in the native Python rules and conformance fixtures.

D22. Island collision geometry is an explicit agent input. With the default `vision.staticMapKnown=true`, every policy always receives all exact polygons and static sites. If a configuration disables static-map knowledge in a fog mode, touching any part of an island with a friendly sensor reveals and permanently remembers that island's whole polygon and its neutral sites for that team. The browser and Python implementations share this contract. Built-in captains route around the polygons they actually know rather than reading authoritative hidden terrain.

D23. `fleetrl-rules-v2` introduces target-selected predictive cannon fire. An agent may name one visible legal enemy per firing ship; omitted targets select the nearest legal visible enemy for source compatibility. Aim uses a constant-velocity intercept independent of hull heading, but launched projectiles remain ballistic and terrain-blocked. Damage decreases linearly with actual travel distance from 1.60× to 0.65× base damage, and the first 25% of range is marked for a point-blank visual effect. This changes authoritative outcomes, so browser/Python engines are version 2 and version-1 replays are not silently replayed under the new rules.

D24. Game setup remembers the last choices and resolves Fleet to 2–6 ships, including a recorded random option. Built-in captains receive small variation from an independent recorded agent seed, never from simulation or cosmetic RNG. Fog presentation follows an explored-map model: unseen space is black, discovered space is dimmed, and current terrain-clipped sensor union is clear; only the selected player's fog perspective is offered. Replays cycle X1/X2/X4/X8. League supports both mirrored all-vs-all and seeded 4/8/16-slot knockout brackets with duplicate captain slots and recorded match playback. Health and authoritative cannon cooldown are separate below-hull bars.

D25. `fleetrl-rules-v3` enables deterministic impact damage for friendly/enemy ship contacts and solid terrain. Each hull takes `round(0.2 * inwardSpeed)` from its own velocity component toward the equal-mass midpoint; terrain uses the component into the outward contact normal. All collision and projectile damage in a tick resolves simultaneously. Spawn protection suppresses health loss. Enemy ramming sinks credit the opposing team, while friendly/terrain-only sinks do not. Browser/Python engines are version 3; version-1 and version-2 replays are rejected rather than recomputed under changed outcomes.

D26. `fleetrl-rules-v4` reduces cannon base damage by exactly 25%, from 25 to 18.75, while retaining the distance curve and close-range threshold. Browser and Python engines are version 4. The native Python adapters now use the same seeded `fleetrl-archipelago-v3` map generator as live browser matches by default; explicit custom maps remain supported. Cross-language conformance covers full gameplay state, ordered events, filtered observations, maps, adapters, and trajectories. Earlier replays are rejected rather than silently recomputed with weaker cannon fire.

D27. `fleetrl-rules-v5` triples the default ship respawn delay from 300 to 900 physics ticks (5 to 15 simulation seconds). New Game and League expose a remembered integer match-duration setting clamped to 15–300 seconds and materialize it as `durationTicks`. The live/replay HUD shows per-ship return countdowns at bottom center; a fog viewpoint exposes all friendly timers but only enemy timers derived from a sink credited to that viewpoint's team. Additional turtles, jellyfish, manta shadows, kelp fragments, and foam eddies are deterministic presentation-only Canvas layers with no collision, observation, policy, or gameplay RNG role. Browser/Python engines are version 5, and older replays are rejected instead of being recomputed under the longer respawn rule.

## Change control

Any change to physics, interaction order, visibility, action timing, encoder order, reward semantics, or tie-breaking needs: a decision-log entry, version bump where applicable, updated examples/schemas, regression tests, and a migration/replay compatibility note. Pure presentation changes must not alter a match hash/outcome. Balance experiments must preserve old configs so previously recorded tournaments remain interpretable.

## Deliberately excluded initially

Realistic naval simulation, wind/tides, damageable islands, inventories/ammo types, networked human multiplayer, server accounts, anti-cheat promises, large models, arbitrary Python, private cloud checkpoints, photorealistic assets, background music licensing, or a sprawling map editor. None is needed for the agreed learning/gameplay loop.
