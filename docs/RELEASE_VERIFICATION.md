# Release verification

Verified: 2026-09-28. Scope: local Windows Pirates War RL release candidate, production static build, and downloadable Python kit. This report records executed checks; it is not a claim of public deployment or tamper-resistant grading.

## Release artifacts

| Artifact | Evidence |
|---|---|
| Static website | `dist/`, 97 files, 28,429,207 bytes after the verified rules-v5 and GitHub Pages build |
| GitHub Pages configuration | Actions deployment workflow with clean-runner Python-kit generation, `CNAME` for `rl.teddylazebnik.com`, `.nojekyll`, direct-route recovery, and relative-path-safe output |
| Generated hero | `public/assets/backgrounds/pirates-war-hero.png`, SHA-256 `02113100C053C73EF31A5471CCE10702AD430E1C6C6667F653366CE71CFF6D2C` |
| Python kit | `public/downloads/FleetRL_Python_Training_Bundle.zip` and matching `dist/downloads/` copy |
| Python kit SHA-256 | `6324733dfe4afe88af4760eedebe03bb1ee3aaa33ebf9fbc6012bf50cbd32ffd` |
| Python kit manifest | 42 packaged files, each hash checked before installation |
| Clean-run exported agent | `artifacts/python-bundle-smoke/downloaded-bundle.agent.json` |
| Exported agent SHA-256 | `f9cd73603f55c46e93f65d1be4f3a06ae77081f9014ed193d3c65a2b54447a84` |

The package hash is valid for the release tested here. Recompute it after changing Python source, resources, tests, or included documents.

## Commands and actual results

| Command | Result |
|---|---|
| `npm run examples:build` | Generated the real restricted TF.js ZIP and copied all examples into the public static bundle. |
| `npm run verify` | ESLint passed; 16 Vitest files / 93 tests passed; TypeScript passed; Vite production build passed. Tests include the 15-second respawn default, 15–300 second match-duration clamp/materialization, the 25% cannon reduction, full-state cross-language cases, friendly/enemy impact damage, terrain impacts, simultaneous lethal ramming, selected-target predictive aim, range-scaled damage, flag relocation, sink tiebreaks, procedural archipelagos/wrecks, fog island discovery, knockout scheduling, all 16 mode-specific captains, all four Teddy packages in the real QuickJS runtime, adjacent ladder ordering, and a complete built-in pickup/capture match. |
| `npm run pages:check` | Passed the custom-domain, relative-path, direct-route recovery, service-worker, offline-manifest, and required-download checks for `https://rl.teddylazebnik.com/`. |
| `npm run bundle:check` | 44 maintained Markdown files, 49 maintained JSON files, local links, fences, schemas/defaults, fixture geometry, and trusted example-agent fixtures passed. |
| `npm run python:test` | 35 tests passed. |
| `npm run parity` | Regenerated 12 trajectories (4 modes × 3 seeds × 240 ticks), 10 complete gameplay-state cases, 6 adapter cases, and 3 `fleetrl-archipelago-v3` maps; Python 20 passed; TypeScript 4 files / 35 tests passed. |
| `npm run python:package:check` | Confirmed the maintained package and downloadable ZIP were byte-current. |
| `npm run test:e2e -- tests/e2e/shell.spec.ts` | 6 Chromium production tests passed in 57.2 s, including the mode-specific New Game roster and Under the deck source viewer, an actual Teddy QuickJS match, mirrored League evaluation of all four bosses against their Level 3 rivals, the Teddy build page, published CNAME, and repository-subpath service-worker scope. |
| `npm run python:bundle-smoke` | The current website-download ZIP hash/42-file manifest passed; clean Python 3.13 environment installed; 35 tests, rollout, short DQN, evaluation, and export passed. |
| `npm run test:e2e:bundle` | 1 Chromium test passed in 7.7 s: the exact clean-run Python export imported into New Game, captained a match, opened real results, and replayed the recording. |

The full reproducible command is `npm run release:verify`. Individual commands remain available for diagnosing a failed stage.

## Production browser coverage

The browser tests use the built application through static HTTP, not the Vite development server. They exercised:

- the game landing page, opening menu, two-captain setup, four-captain mode-specific roster, Under the deck source/file viewer for both sides, remembered mode/seed/viewpoint/sound, 2-6/random fleet size, full-screen arena, compact ship-sink HUD, pause/continue, close, post-game statistics, and policy-free X1/X2/X4/X8 replay;
- declarative Dense JSON and real restricted TensorFlow.js ZIP imports directly into opposite sides of a one-off game;
- mirrored all-vs-all League scheduling plus a completed four-slot duplicate-captain knockout bracket, animated winner tree, real standings/results, recorded match selection, replay, and return-to-league flow;
- the four Teddy final bosses running as ordinary student-format QuickJS packages and leading their Level 3 rivals in two-color mirrored evaluations on the maintained benchmark seed for Duel, Fleet, Fog Duel, and Fog Fleet;
- the consolidated developer reference, Teddy's Agent process/file inspector, Python-kit download, responsive mobile landing, published CNAME, and serving with the correct service-worker scope under `/course/fleetrl/`;
- retired Learn, browser Training, Agents, Instructor, and Classroom routes returning to the new game landing page.

Import/security unit tests also reject unsafe archive paths, archive bombs by declared size, encrypted ZIP entries, remote model shards, unsupported TF.js topology, non-finite/oversized Dense packages, malformed actions, and invalid configs. Student JavaScript is interpreted only in QuickJS/WASM workers.

## Native package proof

The verification script copied the ZIP from the website download artifact, validated all 42 manifest hashes, extracted it to a newly created temporary directory, created a fresh virtual environment, installed `.[all]`, and then ran:

- 35 package tests;
- a 12-decision Duel rollout;
- a genuine 40-step PyTorch DQN run with 33 gradient updates, replay-buffer size 40, mean loss `0.0025953637634136776`, and last loss `0.00010258251859340817`;
- two 20-decision evaluation episodes; both reached the collection cutoff and were reported as incomplete, not wins/draws/losses;
- Dense JSON export with layers 64→64, 64→64, and 64→22.

The script copied evidence to `artifacts/python-bundle-smoke/` and safely removed the isolated temporary directory. The short run proves execution, learning updates, checkpoint/evaluation plumbing, and export compatibility. It does not demonstrate a strong policy.

## Cross-language scope

TypeScript and Python implement the engine independently. Their shared data defines rules, schemas, the curated fallback map, seeded archipelago generator, RNG vectors, adapter versions, and fixtures. Tests compare 12 explicit-action trajectories plus 10 complete gameplay scenarios at `1e-9` absolute/relative tolerance, full ordered events and authoritative observations, feature vectors at `1e-6`, masks/actions/events exactly where discrete, procedural maps separately, and PyTorch/Dense logits at `rtol=1e-5`, `atol=1e-6`. Python's default training reset now uses the same seeded procedural map as live browser matches. Same-engine replay hashes remain exact and separate from numeric parity tolerances.

## Measured browser performance

Provider: Playwright Chromium 153.0.8010.12 on the local Windows host. The browser reported 20 logical hardware threads and 32 GiB device memory. The figures below predate the game-shell redesign and remain simulation reference measurements; browser training is no longer a product feature.

| Measurement | Result |
|---|---:|
| Presentation sampling | 121 frames in 2004.9 ms; 60.35 FPS |
| Headless fixed-step sample | 50 decisions / 300 physics ticks in 1768 ms |
| Mean decision step | 35.36 ms |
| Fixed physics throughput | 169.68 ticks/s |
| Historical Python/browser compatibility sample | 200 transitions at 1,751.3 steps/s |

Raw measurements are in `artifacts/performance.json`. They are local observations, not universal device guarantees. Browser deadlines remain best-effort and are not hard real-time guarantees.

## Visual evidence

- `artifacts/screenshots/pirates-war-mobile-landing.png` — current responsive Pirates War RL landing page at mobile size.
- The desktop landing, main menu, setup, full-screen match, post-game, League, and developer guide were inspected in the in-app production browser during this verification. The rules-v5 preview was run as a six-ship Fleet match on seed 7 with a 90-second limit. The bottom-center counter showed independent Blue and Green return chips updating in whole seconds (including several simultaneous respawns), without covering the sink HUD or controls. Turtles, jellyfish, manta shadows, kelp fragments, foam eddies, fish, waves, islands, wrecks, bars, and combat effects rendered coherently; the added sea life remained subtle and below ships. A six-ship Fog Fleet on seed 1 confirmed black unexplored water, dim remembered water, clear terrain-clipped sight, hidden dynamic-state filtering, and separate health/cannon bars. A four-slot duplicate-captain bracket completed all battles, animated winners left-to-right, exposed replays, and crowned one champion.

The release uses the generated cinematic hero, calibrated directional Blue/Green ship frames, separately rendered Blue/Red objective flags, polygon-masked terrain textures, ocean/shore/fog overlays, combat effects including a distinct close-range white-gold burst, icon sprites, and real three-state button sprites. Audio is driven by game/UI events with user-gesture initialization, ambience, mute controls, limits, replay deduplication, and fog-safe gating.

## Remaining limitations

- No accounts, shared submission portal, cloud sync, authentication, or tamper-resistant online grading are included.
- ONNX, PPO/recurrent policies, strict decentralized fleet execution, and arbitrary student training-code execution remain disabled extensions.
- No public host, repository setting, or DNS record was modified. GitHub Pages must be set to **GitHub Actions**, the custom domain must be entered in repository settings, and the `rl` DNS CNAME must target the actual account's `<github-owner>.github.io` hostname before the public site is live.
- Managed-browser playback and file/sample QA passed, but the final classroom speaker/headphone audition requires a human listener on the target equipment.
- Game and uploaded-agent state is session-scoped; reloading clears a one-off match setup. League results can be exported before leaving the session.
- `fleetrl-rules-v1` through `fleetrl-rules-v4` replays are not compatible with the version-5 respawn rules; replay loading rejects the engine mismatch instead of recomputing a different result.
