---
name: fleetrl-assets
description: Create and integrate coherent, no-cost 2D pirate-game visuals and short sound effects for FleetRL. Use for directional ship sprites, islands, flags, cannonballs, wakes, splashes, sinking/respawn animations, procedural audio, asset manifests, or visual/audio QA. Prefer original SVG/Canvas art and local JavaScript sound synthesis. Do not use for game-physics changes, model training, or a request that only needs text analysis.
---

# FleetRL assets

## Inputs and outputs

Accept an asset task, the current project, optional existing artwork, and an event/animation list. Produce editable original sources, exported assets, metadata/provenance, integration changes, and a verified preview. Do not assume an existing image is present when it is only named. Inspect actual supplied assets before editing them.

Read [visuals.md](references/visuals.md) for visual production and [audio.md](references/audio.md) for sound. In a FleetRL repository, also read `docs/02_DESIGN_SYSTEM.md` and `docs/04_VISUALS_AND_AUDIO_WORKFLOW.md` when available. The bundled references remain sufficient when this skill is used standalone.

## Workflow

1. Inspect the current asset registry, rendering scale/pivot convention, available tools, and event schema. Preserve consistent existing art where possible. Do not overwrite user artwork without retaining its source/history.
2. Select the no-cost route: original procedural SVG/Canvas visuals and local synthesis. Use an image-generation tool only when actually available and authorized; do not invent a tool/API, require payment, or upload private assets to an unapproved service. Do not block on generation tools when the procedural route works.
3. Write a small asset checklist with IDs, dimensions/durations, pivots, team variants, event triggers, and provenance. Keep physics geometry separate from appearance.
4. Create shared source geometry/palette before rendering directional frames. Use the visual reference for eight headings, consistent padding, and readable faction emblems. Generate a contact sheet and inspect all frames at their actual displayed size.
5. Generate sound with `node <skill-dir>/scripts/generate_sfx.mjs --out <project>/public/assets/audio --seed 101`, or implement equivalent browser Web Audio synthesis. Run the script, verify output, and audition the sounds when an audio preview is available. Report when listening was not possible.
6. Integrate by stable asset/event IDs. Keep simulation state authoritative. Apply observer visibility before spawning sound/effects. An omniscient spectator is a separately labeled view.
7. Add mute/volume, user-gesture audio activation, reduced effects/motion, loading fallbacks, and bounded particle/audio voice counts. Do not let visual randomness consume simulation randomness.
8. Verify in a real preview: both teams, eight directions, cannon/hit/splash/sink/respawn/flag actions, full/fog views, resizing, reduced motion, and mute. Run existing gameplay tests to show visuals did not change outcomes.
9. Deliver an asset manifest and provenance file plus a brief report of created/modified assets, actual checks, remaining limitations, and generation seed/tool/version. Do not claim generated art is production-ready without inspection.

## Constraints

- Use no purchased pack, subscription, mandatory remote font, copied franchise ship/logo, unlicensed sound, copyrighted song, or cloned voice.
- Prefer a single coherent style over mixing multiple free packs. Check each external license; "free download" is not a license.
- Keep hull pivot, collision debug circle, muzzle, flag attachment, and wake source aligned. Never change hitboxes to hide a bad sprite pivot.
- Make team identity readable through both color and emblem. Keep effects subtle, non-gory, and suitable for a classroom projector.
- Treat generated raster spritesheets as drafts until spacing, transparency, frame consistency, and licensing/provenance are checked.
- Do not claim asset generation is free when using a metered service. The default local scripts require no external API calls.

## Acceptance

Produce loadable assets, valid metadata, no missing paths, no clipped frames, no audible clicks/clipping in reviewed sounds, and working mute/reduced-motion behavior. When only file-level sound validation is possible, state that perceptual audio review is still needed. Keep a source-level fallback so the game remains usable without optional generated assets.
