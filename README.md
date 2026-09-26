# Pirates War RL

Pirates War RL is a browser-only, continuous 2D pirate capture-the-flag game for autonomous agents. Pick or upload the captain for each fleet, choose Duel, Fleet, Fog Duel, or Fog Fleet, then watch both policies navigate, fire, steal flags, and score in a full-screen broadcast. Fleet games support 2–6 ships per side or a random count. League mode offers mirrored all-vs-all standings and 4/8/16-captain knockout brackets; policy-free replays use the same deterministic simulation. An optional native Python kit provides matching headless rules for local model development and Dense JSON export.

Each seed creates a symmetric but varied archipelago ranging from one large central island to several small islands, with irregular coastlines, neutral flag sites, and zero to six physical shipwreck shoals. Five polygon-aware built-in captains provide distinct raiding, navigation, defense, gunnery, and fleet-coordination strategies, including complete steal-and-return routes and subtle recorded per-match helm variation. Cannons select visible enemy ships independently of hull heading, lead their current velocity, and use a version-4 base damage of 18.75 (25% below the prior value), with stronger close-range hits while remaining physical, terrain-blocked projectiles. Hull-to-hull and hull-to-land impacts also cost health in proportion to each ship's inward speed. One delivered enemy flag wins; if time expires, captures and then ship sinks decide the result.

The release is fully client-side at runtime: no backend, login, API key, paid service, CDN, cloud inference, or Python installation is required by the website. Python is an optional downloadable training workflow, not a web server.

## Run the browser application

Requirements: Node.js 22.12 or newer.

```text
npm ci
npm run dev
```

For the production build:

```text
npm run build
npm run preview
```

Deploy the contents of `dist/` to ordinary static HTTP(S) hosting. Hash routing and relative assets support non-root paths. Double-click `file://` use is not promised because workers, WASM, and service workers require an HTTP origin.

For GitHub Pages, this repository includes a tested Actions deployment, `CNAME` for `rl.teddylazebnik.com`, `.nojekyll`, and direct-route recovery. Put this folder at the root of its own GitHub repository, select **GitHub Actions** as the Pages source, configure the same custom domain in repository settings, and point the DNS `rl` CNAME to the repository owner's `<owner>.github.io` hostname. See [the GitHub Pages deployment guide](docs/GITHUB_PAGES_DEPLOYMENT.md).

## Verify the release

```text
npm run verify
npm run python:test
npm run parity
npm run pages:check
npm run test:e2e -- tests/e2e/shell.spec.ts
npm run python:bundle-smoke
npm run test:e2e:bundle
```

`npm run release:verify` runs the full sequence, including asset/example regeneration and Python packaging. See [the actual release record](docs/RELEASE_VERIFICATION.md) for commands, counts, measurements, screenshots, hashes, and limitations.

## Browser workflows

- `#/home`: cinematic game landing page and product overview.
- `#/menu`: opening game menu with New Game, League, agent development, and Exit.
- `#/game/new`: choose both code-driven captains, mode, 2–6/random fleet size, seed, 15–300 second battle time, viewpoint, and sound. The latest setup is remembered. Either side may use a built-in policy, uploaded JavaScript, Dense JSON, restricted TensorFlow.js ZIP, or pasted JavaScript.
- `#/game/live`: full-viewport autonomous broadcast with all HUD data inside the arena, health and cannon-ready bars, bottom-center per-ship respawn countdowns, explored-map fog, pause/continue, sound, and close controls. Replays add a cyclic X1/X2/X4/X8 speed control. There is no manual steering.
- `#/game/results`: real match outcome, score, combat/event counts, policy diagnostics, retry, replay, and captain-change actions.
- `#/league`: session roster import, mirrored all-vs-all or 4/8/16-captain knockout scheduling, animated bracket/standings, sequential execution, result export, and replay selection for every completed battle.
- `#/develop`: the complete agent contract, observation/action semantics, execution/resource limits, supported formats, and optional Python workflow.

The old Learn, browser Training, persistent Agent Library, Instructor, Classroom, and manual-control routes are removed. Unknown and retired routes return to the game landing page.

## Python training kit

The maintained package lives under `python/`; the site serves its generated ZIP from `public/downloads/`. A typical extracted-kit workflow is:

```text
python -m venv .venv
# activate .venv for your platform
python -m pip install -e ".[train,test]"
python -m fleetrl.rollout --mode duel --seed 7
python -m fleetrl.train --algorithm dqn --mode duel --steps 10000 --seed 7 --output runs/demo
python -m fleetrl.evaluate --checkpoint runs/demo/checkpoint.pt --episodes 20
python -m fleetrl.export --checkpoint runs/demo/checkpoint.pt --format dense-json --output agents/demo.agent.json
python -m pytest
```

Import the exported `.agent.json` directly in New Game or League. Raw Python, pickle, `.pt`, and training-framework checkpoint ZIPs are deliberately not browser submissions. Load PyTorch checkpoints only when they were created locally or come from a trusted source.

## Architecture and safety boundaries

- `src/sim/` is pure fixed-step TypeScript independent of React, Canvas, audio, wall clocks, storage, and model frameworks.
- Both teams observe the same boundary and their decisions activate simultaneously after one decision window. Headless mode removes display pacing, not game semantics.
- Fog observations pass through the authoritative visibility filter; render/audio/inspectors do not provide policy input. Exact island polygons are public by default; optional hidden-map configurations reveal and remember a complete polygon when any part enters friendly sensor range.
- Uploaded JavaScript executes only inside QuickJS/WASM in dedicated workers. A worker alone is not treated as a sandbox.
- Dense and restricted TF.js packages are validated data consumed by trusted adapters with archive, topology, shape, parameter, and resource bounds.
- Replays store accepted/fallback actions and events; playback never reruns student policies.
- Python and TypeScript are independent implementations checked against shared versioned resources and conformance fixtures; the same seed creates the same default map in training and live play.

## Main documents

| Document | Purpose |
|---|---|
| [Game logic](docs/01_GAME_LOGIC.md) | Movement, combat, flag lifecycle, respawn, scoring, and ordering. |
| [Agent/runtime architecture](docs/03_ARCHITECTURE_AND_AGENT_RUNTIME.md) | Static boundaries, sandboxing, intake, and model inference. |
| [Observation/action/model API](docs/05_OBSERVATION_ACTION_AND_MODEL_API.md) | Agent-visible contracts, fog, encoders, and formats. |
| [Timing and replays](docs/06_TIMING_DETERMINISM_AND_REPLAYS.md) | Fixed clocks, delayed controls, deadlines, and recordings. |
| [Training](docs/07_RL_TRAINING_AND_LESSONS.md) | Q-learning, DQN, rewards, evaluation, and lessons. |
| [Tournaments/Classroom Live](docs/08_TOURNAMENTS_AND_CLASSROOM_LIVE.md) | Frozen rosters, scheduling, metrics, standings, and playback. |
| [Storage/deployment](docs/11_STORAGE_EXPORT_AND_DEPLOYMENT.md) | IndexedDB, backups, offline preparation, and static hosting. |
| [Defaults/decisions](docs/13_DEFAULTS_AND_DECISION_LOG.md) | Versioned defaults, choices, and deferred scope. |
| [Python guide](docs/PYTHON_TRAINING_GUIDE.md) | Native environment and command workflow. |
| [Compatibility](docs/MODEL_EXPORT_AND_COMPATIBILITY.md) | Exact Dense transfer contract. |
| [Cross-language parity](docs/CROSS_LANGUAGE_PARITY.md) | Shared data, tolerances, and conformance scope. |
| [Release verification](docs/RELEASE_VERIFICATION.md) | Executed commands, measurements, screenshots, and known limits. |
| [GitHub Pages deployment](docs/GITHUB_PAGES_DEPLOYMENT.md) | Actions workflow, custom domain, DNS, and verification. |

## Assets and examples

`ASSET_MANIFEST.json` records every production derivative, source hash, crop/calibration data, collision role, and review state. The production ship atlas uses eight calibrated headings for Blue and Green hulls with separate carried-objective variants. Terrain textures and the generated hero background are presentation-only. Animated ocean currents, moving wave bands, fish schools, turtles, jellyfish, manta shadows, kelp fragments, foam eddies, island dressing, submerged wreck bubbles, shoreline foam, persistent explored-map fog masks, wakes, smoke, sinking/respawn effects, UI icons, three-state button sprites, and the locally synthesized audio pack complete the game presentation without paid/sample dependencies.

`examples/` includes the script starter, constant-forward Dense model, a real restricted TF.js package, map/config fixtures, and a short Python DQN smoke export. These are explicitly teaching or compatibility fixtures, not claimed competitive agents.

## Scope

All four game modes, one-off matches, mirrored all-vs-all leagues, knockout leagues, replay playback, and the browser/Python transfer path are implemented. Browser-side policy training, manual control, classroom management, accounts, remote tournaments, ONNX, PPO/recurrent agents, strict decentralized fleets, and public grading are outside this product flow. The numerical settings are versioned defaults, not empirical balance claims, and short local smoke training is not evidence of strategic quality.
