# 04. Visual and audio generation workflow

Status: implementation instructions plus one reusable Codex skill. The bundle does not include finished game artwork, a trained AI, or a running game. It does include a working dependency-free sound synthesis script for development.

## Use the skill

The actual skill is [fleetrl-assets/SKILL.md](../.agents/skills/fleetrl-assets/SKILL.md). It covers BOTH visuals and audio in one consistent asset pipeline. Its bundled references describe the complete asset list, animation metadata, generation briefs, and audio recipes.

```text
Use $fleetrl-assets to create FleetRL's visual/audio assets and integrate them.
Follow docs/02_DESIGN_SYSTEM.md. Keep the engine unchanged.
Use no paid services, no mandatory remote downloads, and no copyrighted franchise art.
Generate coherent directional ships, islands, flags, cannon/splash/sinking effects,
and short event sounds. Verify gameplay readability and fog-safe playback.
```

## No-cost default

Visuals: author original SVG shapes or procedural Canvas drawing code. Render a common hull/sail geometry into directional frames if a spritesheet is useful. Derive visual variation from presentation state, never from hidden game information. Generate contact sheets and inspect pivots, clipping, transparency, and silhouette readability. Store editable source and atlas metadata next to exported assets.

Audio: run the included JavaScript synthesizer during development:

```bash
node .agents/skills/fleetrl-assets/scripts/generate_sfx.mjs --out public/assets/audio --seed 101
```

It creates short mono PCM WAV effects and a provenance/measurement manifest. It needs Node during asset production only; the final browser plays static files or uses equivalent Web Audio synthesis. Preview every sound before shipping: a valid WAV and a safe measured peak do not guarantee pleasant perceived loudness.

Optional external assets: Kenney's 2D Pirate Pack is listed as CC0 by its creator [source S11](14_SOURCES.md). Download only when network use is allowed, keep license/provenance, and do not mix incompatible visual styles. The game must remain buildable without that pack. Do not redistribute font files as part of this specification bundle.

Optional generative tools: use only an actually available, authorized tool. Generation is not automatically free, and Codex must not invent tool names or credentials. If unavailable, complete the procedural pipeline rather than blocking. Generated raster artwork needs cleanup and pivot/atlas checks; one attractive image is not a usable directional spritesheet.

## Asset integration contract

Create an `asset-manifest.json` with stable IDs, relative paths, category, dimensions/duration, pivot, animation frame IDs/FPS, license/provenance, and generator version/seed where applicable. Resolve assets by ID, not scattered literal filenames. Preload only the assets needed for the next scene and show a graceful loading/error state.

Map domain events to presentation events exactly once. Replay time controls animation time; wall time does not determine physical death/respawn. In observer perspectives, only visible/permitted events may produce graphics or sound. Omniscient classroom playback is explicitly labeled.

Audio starts after a user gesture, with master/effects volume and mute. Web Audio autoplay restrictions and user controls must be respected [S12](14_SOURCES.md). Default no background music, no voice acting, no copied songs, and no aggressive bass. Short effects are enough.

## Required review outputs

Deliver editable visual source, exported assets, atlas/manifest metadata, a contact sheet or in-app preview, generated WAVs, a sound preview page, and a license/provenance file. Check normal/reduced-motion, muted/unmuted, both teams, eight headings, full/fog views, and classroom projector scale. Report which tools actually ran and which assets were manually reviewed.
