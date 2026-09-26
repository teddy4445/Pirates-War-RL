# 10. Testing, security, and acceptance

Status: required gates. These are tests to implement, not claims that the unbuilt system has passed them. Keep IDs stable for [traceability](16_REQUIREMENTS_TRACEABILITY.md).

## Test layers

Use pure unit/property tests for simulation and schemas, integration tests for workers/runtime/replays, and actual browser tests for UI/Canvas/storage/audio. Run production-build browser tests as well as the development server. Use deterministic fixtures and injected clocks; timing tests should not rely solely on flaky sleeps.

## Core gameplay tests

| ID | Required behavior |
|---|---|
| G01 | Two identical initial states plus accepted actions produce equal state/event traces in the same tested runtime. |
| G02 | Acceleration, drag, speed clamp, reverse thrust, and heading wrap obey units; render FPS does not change physics. |
| G03 | Swept ship/projectile collisions prevent tunneling through thin islands and boundaries. |
| G04 | Two simultaneous lethal hits sink both ships; array/team order does not award a survivor. |
| G05 | Fire cooldown/range/damage, friendly-fire-off, protection, and first-hit projectile removal are correct. |
| G06 | Exactly two flags exist; carry references remain consistent through pickup/drop/transfer/death. |
| G07 | Give requires range/clear water/empty receiver; no same-tick transfer chain or duplicate possession. |
| G08 | Land placement uses legal shoreline sites; water-only ships can retrieve valid land flags without crossing an island. |
| G09 | Own loose flag recovery, loose auto-return, delivery-home requirement, and no double scoring work. |
| G10 | Respawn occurs after configured simulation ticks; occupied spawn slots resolve safely; old actions do not reactivate. |
| G11 | Time-limit tie, simultaneous threshold tie, and capture terminal cases produce the specified outcome. |
| G12 | All four modes use the same combat/flag physics and stable API; curated maps remain connected/navigable. |

Property tests should generate random valid sequences of movement, combat, drops, gives, and deaths and check all invariants from [01](01_GAME_LOGIC.md). Include nearly coincident positions, exact-range boundaries, degenerate input, high-speed movement, and contested flags.

## Visibility and policy-isolation tests

F01: construct two worlds that differ only in unobservable hidden entity state and verify byte-equivalent serialized policy observations, feature vectors, action masks, and observable events, unless a permitted observation consequence occurs. This is the main fog non-interference test.

F02: hidden events do not spawn visible sound/trails/particles. Omniscient spectator mode does not modify agent inputs. Selected-ship view is distinct from default team-union view.

F03: full mode includes relevant dynamic cooldown/respawn/flag/projectile state; fog mode omits hidden enemy fields instead of marking true data invisible. Own experienced damage must not reveal the unseen attacker position.

F04: encoder masks unknown fields, chooses nearest entities deterministically, returns exactly 64 finite values, and uses world coordinates. Special-action masks do not query hidden dynamic occupancy.

## Timing and replay tests

T01: send both policy requests from the same tick and commit at the same application tick regardless of reply order. T02: accept before-deadline replies; neutralize late replies; ignore duplicates/stale generation IDs; test precise boundary convention. T03: hung promises/guest loops cannot block the UI indefinitely; worker recreation logs a memory reset. T04: repeated failure and double-forfeit rules match standings logic. T05: live and headless runs driven by the same accepted trace match. T06: replay works with agent files removed and does not invoke `act` or `predict`. T07: seek/keyframe/event playback is stable and sound is not duplicated. T08: a missing/incompatible replay is labeled, never silently rerun as the original. T09: a deliberately delayed control toy environment validates training action/reward alignment.

Use fake/injected clocks for scheduler unit tests plus real browser integration tests under artificial CPU contention. Report observed jitter rather than declaring a hard 100 ms guarantee.

## Upload/security tests

S01: reject malformed/traversal/symlink/duplicate/case-collision/oversized ZIPs and decompression bombs before exhausting memory. S02: reject remote model paths, unknown/custom executable layers, incompatible shapes, nonfinite weights, and oversized tensors. S03: guest attempts to access DOM, fetch, WebSocket, IndexedDB, filesystem, host constructors, or opponent state fail. S04: infinite loops, huge allocations, deep recursion, log spam, getters, cyclic output, and never-settled promises are bounded. S05: host tensor memory is monitored separately from QuickJS heap; cleanup after repeated load/dispose does not grow without bound. S06: guest strings/source/names are rendered as text; HTML/script and CSV formula injection do not execute. S07: no cross-match policy memory leaks or cross-team handles. S08: schema errors cannot crash tournament processing. S09: model initialization/execution errors are visible and do not count as successful inference.

These tests reduce risk, not prove a perfect sandbox. Keep security dependencies updated and review guest/host bindings before accepting arbitrary public submissions.

## Learning and model tests

R01: Q-learning update matches a hand-calculated transition, including terminal/truncated distinctions. R02: target DQN weights do not update on every online gradient step accidentally. R03: epsilon exploration and evaluation argmax are seeded and separated. R04: exported Dense/TF.js forward passes agree on fixed inputs within declared tolerance. R05: Q-table/model export-import preserves encoder/action versions and decisions. R06: replay-buffer/tensor/checkpoint bounds and stop/pause work. R07: real training curves differ from an empty run and no static demo data enters them. R08: training/evaluation seeds are disjoint and labels identify privileged shaping. R09: pickup/drop/passing/damage-farming cannot inflate the default objective.

A smoke-test training run need not beat every opponent. Report its actual behavior; functional algorithm tests and measured learning experiments are different forms of evidence.

## Tournament/classroom tests

C01: N=8,K=1 schedules exactly 56 unique jobs, each side mirrored, no self-play. C02: resume/reload does not duplicate standings or skip frozen jobs. C03: wins/draws/losses/forfeits and win-versus-score-rate calculations use correct denominators. C04: provisional uneven standings are labeled. C05: clicking a completed matrix cell selects a real seed/side replay and returns to preserved dashboard state. C06: featured playback pauses new jobs by default; cancellation does not masquerade as agent defeat. C07: changed frozen packages create a new tournament identity. C08: storage preflight and quota failure pause safely without silently losing required classroom replays. C09: aliases and exports exclude private contact information by default.

## UI, accessibility, and deployment tests

U01: every specified route has empty/loading/error/populated states. U02: keyboard focus, dialogs, matrix navigation, and text equivalents work. U03: screenshots at the specified sizes reveal no overlap/clipping. U04: mute and reduced-motion affect Canvas/audio, not just CSS. U05: directional pivots and ship-hitbox alignment are stable. U06: audio starts only after a user gesture and scrubbing/fast replay does not spam effects. U07: production static hosting resolves JS workers, WASM, models, and relative routes. U08: a prepared offline classroom session opens with cached required assets. U09: IndexedDB errors/migrations/import rollback are handled. U10: hidden-tab interruption is visible and does not award false competitive results.

## Release gate

Demonstrate a recorded end-to-end session: import a script, import the untrained text model, train/export/reimport a small actual DQN, play Duel/Fleet/Fog modes, trigger give/place/death/respawn, run an 8-agent round-robin, click a result, inspect the historical decision, export the tournament, reload, and replay it. Include command outputs and screenshots from real runs. Separate achieved metrics, targets, and unsupported features in the release notes.
