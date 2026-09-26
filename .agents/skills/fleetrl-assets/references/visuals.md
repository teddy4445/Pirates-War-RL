# Visual production reference

## Style and source conventions

Create friendly top-down pirate-game art, not a realistic military simulator. Use light cyan water, sand shores, soft green islands, warm wooden hulls, cream sails, deep navy outlines, and Blue/Rose team accents. Reference palette: blue #2563EB, rose #E04465, water #C9EEF2, deep water #8FD0DF, sand #F4DFAA, land #87BA8A, ink #20324C. Use a circle emblem for Blue and a diamond emblem for Rose.

Author shapes in SVG or Canvas drawing functions. Keep editable sources; export raster assets only when the renderer needs them. Do not bundle third-party fonts. Build a single source hull/sail that can be rendered consistently, rather than unrelated pictures for every direction.

## Asset inventory

| Asset group | Required outputs |
|---|---|
| Ships | 8 headings x 2 faction appearances; 2-3 sail/wake phases or procedural equivalents |
| Environment | Water pattern, island fill/shores, 2 home base markers, neutral shore flag sites |
| Flags | Blue/Rose home, carried, placed, and floating presentation; lightweight wave motion |
| Projectiles | Small cannonball, muzzle flash, smoke puff, impact, water splash |
| Ship effects | Wake, damage flash, sinking/bubbles, respawn/protection ring |
| Interface | Mode emblems, play/pause/step/mute/fullscreen icons, state badges |

Use 128x128 px ship source frames, centered physical-hull pivots, and common transparent padding. At normal camera zoom the hull should remain readable around 32-44 CSS px. Atlas directions in heading order: E, SE, S, SW, W, NW, N, NE. Heading 0 is east and positive headings turn clockwise.

If rotating source geometry procedurally, keep sail/shadow rendering direction-aware. A slightly illustrative hull should not become visually upside-down merely because a single sprite is rotated. With spritesheets, select the nearest heading with hysteresis; motion/physics heading stays continuous.

## Animation contract

Drive animation from engine events or current visible state. Suggested timings: flash 80 ms, recoil/smoke 150 ms, splash 300 ms, sinking 900 ms, flag bounce 200 ms, capture ring 600 ms. Keep these in a presentation configuration. A sinking ship is already dead physically; the image can disappear later. A transfer arc is not a projectile and cannot change who carries the flag.

Align four anchors: hull center, bow/muzzle, stern/wake, and carried-flag attachment. Preview hitbox circles to check them. Do not encode functional collision geometry in aesthetic SVG outlines. Island artwork must follow the map polygons, not introduce invisible land.

Use bounded particle pools; scale wake emission by ship speed; skip offscreen/hidden effects. Separate simulation and cosmetic RNG streams. Reduced motion disables bobbing/particles/zoom/shake and substitutes simple fades. Ensure essential gameplay events remain clear without sound or animation.

## Optional generation briefs

Only use these when an authorized image-generation capability exists. Otherwise create equivalent original vector geometry.

Directional ship brief: "A small friendly top-down pirate ship for a 2D educational capture-the-flag game, warm wooden hull, cream sail, clean dark outline, soft restrained shading, readable at small size, no text, no logos, transparent background, fixed centered hull pivot. Produce a consistent directional reference for east/southeast/south/southwest/west/northwest/north/northeast. Preserve identical ship proportions, palette, lighting, and canvas padding. This is gameplay artwork, not a screenshot or poster."

Environment brief: "A coherent top-down 2D pirate-game asset set: small sandy islands with green vegetation, simple water-friendly silhouettes, compact home flag posts, neutral shoreline flag posts, isolated on transparent backgrounds. No text, UI, people, perspective terrain, or franchise references. Match the wooden ship's soft vector style."

These briefs do not guarantee a perfect atlas. Inspect and repair frame registration/transparency; regenerate individual directions if required. Never cut an inconsistent grid blindly and claim it is complete.

## Manifest and QA

Each asset entry contains ID, category, path, source path, width/height, pivot normalized to [0,1], frame names/timing, license/provenance, and optional generation seed/tool version. For procedural renderers, record source module and named drawing variant instead of inventing a file path.

Review a contact sheet and actual in-game scale. Check empty alpha borders, sail clipping, left/right mirroring of emblems, wake/muzzle alignment, faction readability in grayscale, fog masking, and animation during pause/seek. Record which screenshots were inspected. A screenshot is proof of appearance in that scene, not proof of gameplay correctness.
