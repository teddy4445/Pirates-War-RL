# First Codex session

## Prepare the project

Extract the complete bundle into a new project directory. Preserve `.agents/skills/fleetrl-assets/`. Open that directory in Codex. This is a local source project: Node.js is a developer build tool, not a requirement for students who visit the finished website.

## Paste this first

```text
Read AGENTS.md, README.md, and docs/12_CODEX_BUILD_PLAN.md.
We are building FleetRL, a browser-only pirate capture-the-flag teaching game.
Read docs/01_GAME_LOGIC.md, docs/05_OBSERVATION_ACTION_AND_MODEL_API.md,
docs/06_TIMING_DETERMINISM_AND_REPLAYS.md, and docs/13_DEFAULTS_AND_DECISION_LOG.md.

Implement P01 only. Inspect the repository before writing files.
Create a brief implementation checklist, then implement and test the stage.
Keep the simulation independent of the UI, and do not use host eval for agents.
Preserve all specifications and examples. Do not create a backend or use paid APIs.
Maintain IMPLEMENTATION_STATUS.md with files changed, actual verification results,
remaining limitations, and the next prompt. Finish with a runnable development command.
```

Then use P02, P03, and the remaining prompts in [12_CODEX_BUILD_PLAN.md](docs/12_CODEX_BUILD_PLAN.md), one session/stage at a time. When resuming, tell Codex to read `IMPLEMENTATION_STATUS.md` first.

## Invoke the asset skill when its stage arrives

```text
Use $fleetrl-assets to create and integrate the free visual and audio assets
for FleetRL. Follow docs/02_DESIGN_SYSTEM.md and docs/04_VISUALS_AND_AUDIO_WORKFLOW.md.
Use procedural SVG/Canvas and the bundled JavaScript sound synthesizer first.
Do not call a paid service or invent unavailable tools. Verify directional ship
alignment, event-driven animations, reduced motion, mute, and fog-safe sound.
```

Repository skill discovery and `AGENTS.md` behavior are documented in [sources S01-S02](docs/14_SOURCES.md). The skill is already placed in the project; the optional standalone `skill.zip` is not required for this workflow.

## Definition of a completed product

The final stage must demonstrate the real loop: create/import an agent, validate it, run a match, train a small policy, export/reimport it, run a multi-agent round-robin, click a recorded match in Classroom Live, and watch the same outcome with observation/action inspection. All four game modes must work. A static production build must load its workers and WASM without relying on a development server.
