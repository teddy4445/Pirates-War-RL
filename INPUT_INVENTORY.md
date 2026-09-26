# FleetRL input inventory

Inventory date: 2026-09-25; production-derivative update: 2026-09-26. Originals remain at their supplied paths. Every shipped derivative records its source hash and treatment in `ASSET_MANIFEST.json`.

## Specification bundle

- The extracted FleetRL specification is present: `AGENTS.md`, `CODEX_START_HERE.md`, `README.md`, docs 01-16, examples, tools, and `.agents/skills/fleetrl-assets/`.
- `BUNDLE_MANIFEST.json` contains per-file SHA-256 hashes for the original specification payload. The supplied `tools/check_bundle.py` is the integrity check.
- `FleetRL_Codex_Bundle.zip` is not present inside this workspace; no extraction was required.
- No existing browser application, Python package, `package.json`, `dist/`, or implementation status file was present before this build.

## Supplied raster inputs

| Original file | Size | SHA-256 | Observed role and handling |
|---|---:|---|---|
| `ChatGPT Image Sep 25, 2026, 08_35_53 PM (1).png` | 1448x1086 ARGB | `e5ebd12b8a20cc2564d6ae8136f8dcb24ac283d8096db01db0e2fa2bd4686022` | Six-row directional ship sheet: green/blue hulls with green/blue/red flag variants, eight illustrated headings per row. Transparent background, irregular cell bounds; measure frames/pivots before slicing. |
| `ChatGPT Image Sep 25, 2026, 08_38_21 PM.png` | 1448x1086 ARGB | `acab40af8fdb2cfcffe2b88b97aad3a329ecfaab7feeaad664f5364dbf2b3d22` | Combat-effects atlas: cannonball flight/smoke, muzzle/impact bursts, fire/smoke, water splashes, sinking debris, bubbles and status sparkles. Transparent but not a uniform grid. |
| `ChatGPT Image Sep 25, 2026, 08_38_26 PM.png` | 1448x1086 ARGB | `47bedd6e8f16c81051611ed10634cfef405d9f23e4569b2bfa92f86a62e3892f` | Pirate strategy GUI icon sheet: health, attack, tools, cooldown, flags, visibility, targeting, movement, team, stop/pause/play, trophies and range overlays. Transparent, inconsistent item sizes. |
| `ChatGPT Image Sep 25, 2026, 08_38_30 PM.png` | 1448x1086 ARGB | `ce2f22e50fb7c56e8b095a84f968a77ae6c4a1f069dfe5656bd41653d22baefd` | Ocean animation/debris atlas: wakes/waves, foam, ripples, splashes, bubbles, whirlpools, seaweed, wreckage, glints and mist. Transparent, irregular sequences. |
| `ChatGPT Image Sep 25, 2026, 08_47_39 PM.png` | 1536x1024 RGB | `f298ae22432a753182ce2a8f1c47e3091e232b4c44e53644710bb7b177fce8e7` | Ten-panel product/screen reference covering dashboard, modes, lesson, Agent Lab, Training Lab, practice, replay, tournament setup/results and Classroom Live. Reference only; displayed sample Python/PPO/metrics do not override the specifications. |
| `ChatGPT Image Sep 25, 2026, 09_08_47 PM (1).png` | 1448x1086 RGB | `f850c278feb088c84a9c54d565749bcd12af54b6c373574dec21db4919ada3a4` | Eight-panel water-material reference from deep water through shallow turquoise, calm wave lines, foam and glints. White gutters/background; panels are not verified seamless tiles. |
| `ChatGPT Image Sep 25, 2026, 09_08_47 PM (2).png` | 1448x1086 RGB | `b16e4506693e5e961da149b7a6dfbd00020494ab109012cb1f1b28f6c31b1319` | Twenty-panel sand/grass/dirt/rock/shore terrain-material reference. White gutters and rounded panels; not a collision map or verified seamless atlas. |
| `ChatGPT Image Sep 25, 2026, 09_08_47 PM (3).png` | 1448x1086 ARGB | `8120a9a560a61a51f480824c1d6d61995cf6fc930735dff896679b0288ca1ae4` | Shoreline/foam, shallow-water, bubbles, glints, whirlpools, seaweed, floating wood and rocks. Transparent irregular overlays; useful only after measured extraction. |
| `ChatGPT Image Sep 25, 2026, 09_08_48 PM (4).png` | 1448x1086 ARGB | `f00f9ecaf92c3f862f5b6e83cfd5526b58b7f6c9bd7afc86e0e8ed0a95ddccf3` | Fog-edge, light pool, cloud/mist, sparkle and water-light overlay atlas. Transparent irregular overlays; fog remains presentation-only after authoritative visibility filtering. |

No duplicate PNG hashes were found. Several generated sheets contain nonuniform spacing and must not be sliced from assumed grids. RGB material/contact sheets have baked white gutters and are source references rather than immediately loadable game textures.

## Sound pack

- `FleetRL_Sound_Pack.zip` is not present, but its extracted directory is complete.
- The pack contains 49 WAV masters and 49 Ogg derivatives: 47 one-shots and two 24-second stereo loops. Stable IDs, durations, gains, categories, groups, loop metadata, and master hashes are in `FleetRL_Sound_Pack/audio-manifest.json` (`fleetrl-audio-2.0.0`, seed `20260925`).
- `FleetRL_Sound_Pack/CHECKSUMS.sha256` inventories the full deliverable. Provenance states local oscillator/noise synthesis with no recordings, samples, voices, paid services, or external generation APIs.
- File-level and managed-Chromium playback QA are supplied. The pack has not received a speaker/headphone perceptual review; classroom audition remains required.

## Missing, external, and unrelated inputs

- The likely descriptive filenames from the request are not literal filenames; the nine generic ChatGPT image files above are their content matches.
- No Kenney or other third-party art pack, external font, trained model, Python checkpoint, ONNX model, or paid asset is present.
- No RL Island project files are inside this workspace and none are treated as authority.
- There were no archives requiring extraction and therefore no user files were overwritten.

## Derived assets

The initial audit found no derivatives. The release build now generates and ships:

- `public/assets/ships/ship-atlas.png`: four rows (Blue, Blue carrying Red, Green, Green carrying Blue), eight measured 45-degree headings, common center pivots, and calibrated muzzle/wake anchors;
- `public/assets/effects/combat-effects.png`: cannonball, impact, splash, and sinking presentation frames;
- `public/assets/icons/ui-icons.png`: measured UI/control and objective icons;
- `public/assets/terrain/{water,grass,sand}-mirror-tile.jpg`: repaired mirrored tiles; land materials are masked to authoritative polygons and never define collision;
- `public/assets/audio/`: 49 Ogg files copied from the locally synthesized sound pack with a production manifest;
- generated manifests under `public/assets/manifests/` plus verified procedural Canvas fallbacks for accessibility/loading failure.

`tools/build_assets.py` recreates these files and hashes. `ASSET_MANIFEST.json` records dimensions, source hashes, extraction/crop data, heading order, pivots, collision roles, tool version, and review state. Desktop, mobile, and projector production screenshots were inspected. Managed-browser playback QA exists; human classroom speaker/headphone audition remains outstanding.
