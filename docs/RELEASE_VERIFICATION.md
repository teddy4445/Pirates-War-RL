# Release verification

Verified: 2026-09-29. Scope: local Windows Pirates War RL rules-v6 release candidate, production static build, and downloadable Python kit. This report records executed checks; public deployment is verified separately after the release commit.

## Release artifacts

| Artifact | Evidence |
|---|---|
| Static website | `dist/`, 99 files, 33,670,670 bytes after the verified rules-v6 and GitHub Pages build |
| GitHub Pages configuration | Actions deployment workflow with clean-runner Python-kit generation, `CNAME` for `rl.teddylazebnik.com`, `.nojekyll`, direct-route recovery, and relative-path-safe output |
| Generated hero | `public/assets/backgrounds/pirates-war-hero.png`, SHA-256 `02113100C053C73EF31A5471CCE10702AD430E1C6C6667F653366CE71CFF6D2C` |
| Generated strategy scene | `public/assets/backgrounds/strategy-fleets-v1.png`, SHA-256 `00ec3f6e0b30e5a31e9565507a8b91566667cd51a950e595194c97ec45f69935` |
| Generated fog scene | `public/assets/backgrounds/fog-chase-v1.png`, SHA-256 `8fb4e26bd6bc1df53c4588b054076aba2cae233277fa5c601871cdaa62ce6589` |
| Python kit | `public/downloads/FleetRL_Python_Training_Bundle.zip` and matching `dist/downloads/` copy |
| Python kit SHA-256 | `3dcf20587007f1a5e7125e41368095efe5c24f4b8f3f3777fc257ecddac73d25` |
| Python kit manifest | 42 packaged files, each hash checked before installation |

The package hash is valid for the release tested here. Recompute it after changing Python source, resources, tests, or included documents.

## Commands and actual results

| Command | Result |
|---|---|
| `npm run examples:build` | Generated the real restricted TF.js ZIP and copied all examples into the public static bundle. |
| `npm run lint`, `npm run test`, `npm run build` | ESLint passed; 16 Vitest files / 96 tests passed; TypeScript and Vite production build passed. Tests include v6 scoring, safe scuttling and half respawn, 88-unit maximum speed, the 95% carrier cap, the existing combat/collision/fog rules, all 16 mode-specific captains, QuickJS Teddy packages, adjacent ladder ordering, and objective-driven play. |
| `npm run pages:check` | Passed the custom-domain, relative-path, direct-route recovery, service-worker, offline-manifest, and required-download checks for `https://rl.teddylazebnik.com/`. |
| `npm run bundle:check` | 44 maintained Markdown files, 49 maintained JSON files, local links, fences, schemas/defaults, fixture geometry, and trusted example-agent fixtures passed. |
| `npm run python:test` | 37 tests passed. |
| `npm run parity` | Regenerated 12 trajectories (4 modes × 3 seeds × 240 ticks), 11 complete gameplay-state cases, 6 adapter cases, and 3 `fleetrl-archipelago-v3` maps; Python 21 passed; TypeScript 4 files / 36 tests passed. |
| `npm run python:package:check` | Confirmed the maintained package and downloadable ZIP were byte-current. |
| `npm run test:e2e -- tests/e2e/shell.spec.ts` | 6 Chromium production tests passed in 50.9 s, including the score-based result screen, mode-specific New Game roster and Under the deck source viewer, imported agents, mirrored League evaluation of all four bosses against their Level 3 rivals, the Teddy build page, responsive landing, published CNAME, and repository-subpath service-worker scope. |
| `npm run python:package` / `npm run python:package:check` | Rebuilt the 188,542-byte website download and confirmed it was byte-current after the Python rules/action changes. |

The full reproducible command is `npm run release:verify`. Individual commands remain available for diagnosing a failed stage.

## Production browser coverage

The browser tests use the built application through static HTTP, not the Vite development server. They exercised:

- the expanded animated landing page, opening menu, two-captain setup, four-captain mode-specific roster, Under the deck source/file viewer for both sides, remembered mode/seed/viewpoint/sound, 2-6/random fleet size, full-screen arena, compact ship-sink HUD, pause/continue, close, score totals/breakdowns without decision/fallback cards, and policy-free X1/X2/X4/X8 replay;
- declarative Dense JSON and real restricted TensorFlow.js ZIP imports directly into opposite sides of a one-off game;
- mirrored all-vs-all League scheduling plus a completed four-slot duplicate-captain knockout bracket, animated winner tree, real standings/results, recorded match selection, replay, and return-to-league flow;
- the four Teddy final bosses running as ordinary student-format QuickJS packages and leading their Level 3 rivals in two-color mirrored evaluations on the maintained benchmark seed for Duel, Fleet, Fog Duel, and Fog Fleet;
- the consolidated developer reference, Teddy's Agent process/file inspector, Python-kit download, responsive mobile landing, published CNAME, and serving with the correct service-worker scope under `/course/fleetrl/`;
- retired Learn, browser Training, Agents, Instructor, and Classroom routes returning to the new game landing page.

Import/security unit tests also reject unsafe archive paths, archive bombs by declared size, encrypted ZIP entries, remote model shards, unsupported TF.js topology, non-finite/oversized Dense packages, malformed actions, and invalid configs. Student JavaScript is interpreted only in QuickJS/WASM workers.

## Native package proof

This focused rules-v6 release rebuilt the website ZIP, checked it byte-for-byte against its maintained inputs, ran all 37 native package tests, and included the Python side in every cross-language parity fixture. The longer isolated install/train/export smoke was not rerun because the training/export interfaces did not change; its older evidence under `artifacts/python-bundle-smoke/` is retained as historical execution evidence and is not attributed to this ZIP hash.

## Cross-language scope

TypeScript and Python implement the engine independently. Their shared data defines rules, schemas, the curated fallback map, seeded archipelago generator, RNG vectors, adapter versions, and fixtures. Tests compare 12 explicit-action trajectories plus 11 complete gameplay scenarios—including score-at-timeout and half-respawn scuttling—at `1e-9` absolute/relative tolerance, full ordered events and authoritative observations, feature vectors at `1e-6`, masks/actions/events exactly where discrete, procedural maps separately, and PyTorch/Dense logits at `rtol=1e-5`, `atol=1e-6`. Python's default training reset uses the same seeded procedural map as live browser matches. Same-engine replay hashes remain exact and separate from numeric parity tolerances.

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
- The desktop and 390×844 landing were inspected in the in-app production browser with no console errors or horizontal overflow. The generated strategy fleet and fog-chase panels, animated hero/current layers, score cards, feature copy, and responsive stacking rendered coherently. The production Chromium flow also completed a full game/result/replay sequence, a duplicate-captain bracket, and every mirrored Teddy boss benchmark.

The release uses the generated cinematic hero, calibrated directional Blue/Green ship frames, separately rendered Blue/Red objective flags, polygon-masked terrain textures, ocean/shore/fog overlays, combat effects including a distinct close-range white-gold burst, icon sprites, and real three-state button sprites. Audio is driven by game/UI events with user-gesture initialization, ambience, mute controls, limits, replay deduplication, and fog-safe gating.

## Remaining limitations

- No accounts, shared submission portal, cloud sync, authentication, or tamper-resistant online grading are included.
- ONNX, PPO/recurrent policies, strict decentralized fleet execution, and arbitrary student training-code execution remain disabled extensions.
- This document covers the local artifact. The release task separately copies the verified tree to the deployment repository, pushes it, waits for the Pages workflow, and probes `https://rl.teddylazebnik.com/`.
- Managed-browser playback and file/sample QA passed, but the final classroom speaker/headphone audition requires a human listener on the target equipment.
- Game and uploaded-agent state is session-scoped; reloading clears a one-off match setup. League results can be exported before leaving the session.
- `fleetrl-rules-v1` through `fleetrl-rules-v5` replays are not compatible with the version-6 score, speed, and scuttle rules; replay loading rejects the engine mismatch instead of recomputing a different result.
