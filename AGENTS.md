# FleetRL repository instructions

## Product

Implement the browser-only, 2D pirate capture-the-flag reinforcement-learning teaching platform described in `docs/`. The deliverable is a working static web application, not only a prototype UI. The current repository starts as a specification bundle.

## Read before changing code

Read `README.md`, the current stage in `docs/12_CODEX_BUILD_PLAN.md`, and the documents relevant to that stage. Read `docs/01_GAME_LOGIC.md`, `docs/05_OBSERVATION_ACTION_AND_MODEL_API.md`, and `docs/06_TIMING_DETERMINISM_AND_REPLAYS.md` before touching simulation or agent behavior.

## Non-negotiable constraints

- Runtime: browser JavaScript only. TypeScript/build tooling is allowed during development. No required backend, Python runtime, paid API, login, or cloud inference.
- Use a pure fixed-step simulation independent of React, Canvas, audio, clocks, and model frameworks. Spatial positions are continuous, not tile-based.
- Keep rendering, simulation, policy decisions, training, and tournament scheduling separate.
- Apply both teams' decisions at the same simulation boundary; never apply whichever result arrives first.
- Execute uploaded JavaScript only in QuickJS/WASM inside dedicated agent workers. Never run it through host `eval`, `new Function`, dynamic import, script tags, or a host-realm JavaScript interpreter shortcut.
- A Web Worker alone is not the sandbox. QuickJS heap limits do not bound host tensor/GPU memory. Do not describe browser timeouts as hard real-time guarantees.
- Generate observations through the authoritative visibility filter. Hidden state must not leak through fields, masks, events, debug output, sounds, or neural features.
- Keep immutable agent/config/engine versions and accepted-action logs. Replays do not rerun student policies.
- No fabricated standings, training curves, test results, agent performance, or successful uploads. Label demonstration data explicitly.
- Freeze policy learning during evaluation. Reset all agent/runtime state between matches.
- Distinguish local classroom results from tamper-resistant online grading.
- Use no paid assets. Record provenance for external assets. Do not silently spend money or call generation services.
- Keep real gameplay, accessibility, and the observation/action inspector ahead of decorative polish.

## Stack direction

Start with Vite, TypeScript, React, CSS Modules/custom properties, Canvas 2D, native Web Workers, QuickJS/WASM, TensorFlow.js for small-model training, IndexedDB behind repositories, Vitest, and Playwright. Choose and lock compatible stable dependency versions during bootstrap; do not invent versions. Avoid adding a large game engine, state framework, chart framework, or backend unless a measured need justifies an explicit decision.

## Workflow

Implement one stage at a time, with a runnable vertical slice and tests. Preserve existing user changes. Do not rewrite the whole repository between stages. Maintain `IMPLEMENTATION_STATUS.md` with completed stages, actual commands/results, limitations, and the next stage. Keep unimplemented features disabled and labeled, not silently faked.

During development, establish and maintain these project scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, and `test:e2e`. After changes, run the relevant tests and then typecheck/build. Report failures and anything not run. Do not claim browser tests passed without actually running them.

## Asset workflow

Use `.agents/skills/fleetrl-assets/SKILL.md` for ships, islands, effects, and sound. Use coherent SVG/Canvas art and procedural Web Audio/PCM synthesis as the no-cost default. Optional image generation is only a development aid when an authorized tool is actually available; generated artwork never defines collisions or mechanics.

## Review blockers

Reject hidden-state access by policies, replay/inference coupling, unbounded agent execution, result tables based on reward instead of match outcome, incomplete archive validation, mutable tournament submissions, and live deadline measurements taken while unrelated training workloads are running.
