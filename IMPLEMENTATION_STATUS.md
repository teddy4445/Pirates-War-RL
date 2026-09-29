# Pirates War RL implementation status

Last updated: 2026-09-29

## Current stage

The game-first product redesign is implemented. The repository contains the static Pirates War RL browser game, optional native headless Python development kit, generated production assets, deterministic parity resources, tested download archive, production `dist/`, screenshots, and release evidence.

## Implemented

- Browser-only Vite/React/TypeScript application with a cinematic sales landing page, opening game menu, responsive/accessibility foundations, Canvas 2D arena, generated assets, event-driven audio, and subpath-safe static output. The landing experience now adds two original generated fleet scenes, animated ocean/current layers, richer game/scoring copy, cinematic feature panels, and responsive motion-safe transitions.
- GitHub Pages delivery is configured through a least-privilege Actions workflow. A clean runner provisions Python 3.13 and deterministically generates the downloadable Python kit before Vite builds the site. The artifact contains `CNAME` for `rl.teddylazebnik.com`, `.nojekyll`, direct-route recovery, relative assets/workers/downloads, and a build-time Pages integrity gate. The remaining repository-settings and DNS steps are documented explicitly.
- Pure fixed-step simulation with continuous geometry, swept collisions, projectiles, simultaneous combat resolution, full flag lifecycle, stable respawns, four modes, seeded single-central or 1-3-pair symmetric archipelagos with 0-6 physical wreck shoals, authoritative fog, and delayed simultaneous decisions.
- Dedicated QuickJS/WASM agent workers; bounded script and ZIP intake; immutable versions; Dense JSON and restricted TensorFlow.js imports; bounded Dense worker inference; no host-realm student-code execution.
- One-off game setup accepts built-in or session-uploaded JavaScript, Dense JSON, and restricted TensorFlow.js captains independently for both sides, with mode, remembered seed/viewpoint/sound settings, a 15–300 second battle-time setting, and a 2-6/random fleet-size choice.
- Sixteen mode-specific opponents replace the old shared captain list. Duel, Fleet, Fog Duel, and Fog Fleet each expose a Level 1, Level 2, Level 3, and Teddy final-boss ladder. The numbered policies progressively add speed, recovery, gunnery, interception, escort, and fleet roles; adjacent-level match regressions preserve the intended ordering in every mode. Small per-match helm variation uses independent recorded agent seeds, so retries on one map are not identical while replays remain exact.
- The four Teddy bosses are exact `fleetrl-package-v1` JavaScript submissions executed through the same dedicated QuickJS/WASM worker, filtered observations, seeded API, schema validation, and 100 ms budget as student code. Their defensive openings, fleet sentry, legitimate fog memory, projectile evasion, and polygon-aware routing are documented at `#/develop/teddy`. Mirrored production-browser evaluations require each boss to lead its Level 3 counterpart.
- New Game filters the roster to the selected mode and provides an **Under the deck** popup for both fleets. It displays the selected built-in's real TypeScript implementation files, each Teddy package's exact manifest/source/readme, pasted or uploaded JavaScript, declarative Dense JSON, or bounded metadata for binary TF.js packages.
- `fleetrl-rules-v6` scores every credited enemy sink at 1 point, the first enemy-flag pickup in an excursion at 3 points, and a delivery to the carrier's home base at 25 points. Matches continue until the configured time expires and the higher score wins. A dropped flag cannot be pickup-farmed; its pickup credit resets only after delivery, owner recovery, or automatic return. TypeScript and native Python implement the same rule.
- Ships can intentionally scuttle when alive and not carrying a flag. Scuttling drops no opponent kill/point and uses a 7.5-second half respawn rather than the normal 15 seconds. Built-in, Teddy, example, and Python baseline policies expose the action and reserve it for safe repositioning with no live enemy currently visible, avoiding point-denial during combat. The 22-action adapter keeps index 21 compatible: drop while carrying, scuttle otherwise.
- Version 6 also raises maximum speed from 80 to 88 world units/second and caps an enemy-flag carrier at 95% of that maximum. It retains version-5 cannon, impact, collision, fog, and respawn behavior.
- Fog observations expose exact island collision polygons by default. Optional hidden-map fog configurations reveal a complete polygon and its neutral site when any part first enters friendly sensor range, then remember that discovery for the team. TypeScript and Python share tests for this behavior.
- Arena presentation includes layered animated currents, moving fish schools, turtles, jellyfish, manta shadows, drifting kelp, foam eddies, and sun sparkles, plus irregular islands with deterministic varied dressing and landmarks, submerged wrecks, moving palms/gulls/bubbles, ship shadows, separate below-hull health and yellow cannon-ready bars, richer wakes/smoke/debris/splashes, event-timed cannon, impact, sinking, respawn, and flag effects, plus a white-gold burst and expanding ring for close-range hits. Every added sea-life layer is presentation-only and uses cosmetic hashes rather than gameplay RNG. Fog uses an Age-of-Empires-style explored map: unknown space is black, remembered space is dimmed, current terrain-clipped team vision is clear, and hidden dynamic state remains filtered. Original procedural Canvas art is recorded in `public/assets/manifests/procedural-environment.json`.
- Full-screen autonomous match arena with in-arena score/clock, compact ship-sink HUD, and a bottom-center per-ship respawn countdown for both fleets. Fog-safe enemy timers only appear for known credited sinks. Event-driven audio, pause/continue, sound, close-to-results, post-game statistics, retry, and policy-free replay are included. Results explicitly show each fleet's total and the `kills × 1 + first pickups × 3 + deliveries × 25` breakdown; the old decision/fallback boxes, “Live broadcast” label, and all manual ship controls are absent.
- Game-styled League with mirrored all-vs-all standings plus seeded 4/8/16-slot knockout brackets, duplicate captain slots, animated left-to-right winner advancement, sequential execution, pause-after-battle, JSON export, and recorded replay selection for every completed match.
- Policy-free replay playback adds a cyclic X1/X2/X4/X8 speed control and thins repetitive audio above X2.
- One developer-guide screen documents the complete contract, observations/actions, simultaneous timing, limits, supported packages, and optional Python workflow.
- Learn, browser Training, persistent Agents, Instructor, Classroom, and manual-practice UI/source flows have been removed.
- Installable native Python simulation with low-level joint actions, Gymnasium and PettingZoo adapters, all modes, deterministic procedural maps, Q-learning, PyTorch DQN, evaluation, Dense export, packaged resources, and platform guidance.
- Shared rules/config/map/schema/RNG/conformance resources and independent TypeScript/Python parity tests across all modes. Python's default training reset now materializes the identical seeded procedural map used by live browser matches; full-state gameplay fixtures cover combat, collision, flags, fog, respawn, and outcomes.
- Reproducible Python ZIP packaging, manifest hashes, stale-artifact check, clean-environment install/train/export proof, and browser import/tournament/replay integration proof.

## Latest verification

- `npm run lint`, `npm run test`, and `npm run build`: ESLint passed; 16 Vitest files / 96 tests passed; TypeScript passed; the production build passed. Coverage includes v6 scoring, half-time scuttling without opponent credit, the 10% maximum-speed increase, the 5% flag-carrier penalty, 15–300 second duration materialization, combat/collision behavior, procedural maps, all 16 opponents, QuickJS Teddy packages, adjacent ladder ordering, and objective-driven play.
- `npm run pages:check`: the production artifact passed its custom-domain, relative-path, route-recovery, service-worker, offline-manifest, and required-download checks for `https://rl.teddylazebnik.com/`.
- `npm run bundle:check`: 44 maintained Markdown files, 49 maintained JSON files, local links, fences, schemas/defaults, fixture geometry, and trusted example-agent fixtures passed.
- `npm run python:test`: 37 passed.
- `npm run parity`: Python parity subset 21 passed; TypeScript parity subset 4 files / 36 tests passed; 12 trajectories, 11 full-state gameplay cases, 6 adapter cases, and `fleetrl-archipelago-v3` procedural-map fixtures regenerated.
- `npm run test:e2e -- tests/e2e/shell.spec.ts`: 6 production Chromium workflows passed in 50.9 seconds for landing/menu/game/new score results/replay/settings memory, the mode-specific roster and Under the deck viewer, imported agents, all-vs-all plus duplicate-captain knockout League/replay, mirrored Level 3-versus-boss evaluations in all four modes, the Teddy process page, Python download/responsive/subpath rendering, the published CNAME and repository-subpath service-worker scope, and retired-route handling.
- `npm run python:package` and `npm run python:package:check`: the downloadable rules-v6 kit was rebuilt and byte-current. Text entries use canonical LF, archive paths use an OS-independent order, and ZIP metadata/storage are fixed, making the archive bytes independent of host path semantics, line endings, and DEFLATE versions. SHA-256: `b97daec788b326e1b1a86f8e4304987c7720a9b87d50947624ec955649456786`.
- See `docs/RELEASE_VERIFICATION.md` for measurements, screenshots, environment, and command details.

## Known limitations

- The app is a local/static game viewer, not an account system, submission server, or tamper-resistant online competition service.
- ONNX, PPO/recurrent policies, decentralized fleet execution, arbitrary user training code, and GPU-only paths remain explicitly disabled extensions.
- The short clean-bundle DQN smoke run proves training/export mechanics, not agent quality. Its two capped evaluation episodes were incomplete and are not counted as wins, draws, or losses.
- Browser policy deadlines are best-effort wall-time budgets, not hard real-time guarantees. Performance varies by device.
- Rules-v1/v2/v3/v4/v5 replays are intentionally incompatible with version-6 score, speed, and scuttle semantics and are rejected rather than silently producing different outcomes.
- Audio passed file-level and managed-Chromium playback checks. A human speaker/headphone classroom audition remains an operational review step.
- Local verification and public deployment evidence are recorded separately; `dist/` remains the reproducible static deployment artifact.

## Maintenance rule

Run `npm run release:verify` after any release-affecting change. Rebuild the Python ZIP whenever packaged source, tests, resources, or included documentation changes. Do not reuse the verification numbers above after modifying those artifacts.
