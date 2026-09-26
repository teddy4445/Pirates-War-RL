# 09. Pirates War RL screens and game flow

Status: implemented game-first product flow. Hash routing keeps the static build portable.

## Screen inventory

| Route | Purpose | Primary actions |
|---|---|---|
| `#/home` | Cinematic sales landing page explaining autonomous pirate combat | Enter the arena; open developer guide |
| `#/menu` | Opening game menu | New Game; League; How to Develop My Agent; Exit |
| `#/game/new` | One-time match setup for both fleets | Pick/upload/paste each agent; choose mode, 2–6/random fleet size, seed, viewpoint, sound; start |
| `#/game/live` | Full-viewport autonomous match broadcast | Pause/continue; replay X1/X2/X4/X8; mute/unmute; close to results |
| `#/game/results` | Real outcome and post-game statistics | Retry; replay; change captains; return to league/menu |
| `#/league` | Game-styled all-vs-all and knockout setup/results | Upload roster; configure; run/pause; inspect animated bracket; export; replay any completed match |
| `#/develop` | Complete authoring and package reference | Download Python kit; test an agent in New Game |

Unknown and retired routes render the landing page. Learn, browser Training, persistent Agent Library, Instructor, Classroom, and manual-practice routes are not part of the application.

## Primary journey

Landing -> Main Menu -> New Game -> Match -> Results is the single-match flow. Both captains are selected at setup time and exist for the current browser session. Each side independently accepts a built-in opponent, uploaded JavaScript, pasted JavaScript, Dense JSON, or a restricted TensorFlow.js ZIP. Preflight validates both captains before the arena opens.

There is no manual steering. Both policies observe the same simulation boundary, return team actions, and activate simultaneously one decision window later. The match page fills the browser viewport without a site header. The score, clock, mode, seed, fleet names, latest event, sound state, and playback state live inside the arena presentation.

Closing a broadcast ends only playback and opens the post-game screen; the already-computed deterministic result remains intact. Replays consume recorded accepted actions/events and never rerun an uploaded policy. Their speed control cycles X1, X2, X4, X8, then X1. In fog modes the broadcast is restricted to Blue or Green fleet vision: unknown water begins black, currently visible terrain is clear, and previously explored terrain remains dimmed without exposing hidden dynamic entities.

New Game remembers the most recently started mode, seed, built-in selections, fleet-size choice, viewpoint, and sound. Session-uploaded captain bytes are remembered while the current page session remains alive; after a full reload, unavailable uploads safely fall back to built-ins rather than fabricating a restored package.

## League journey

Main Menu -> League -> choose all-vs-all or knockout -> configure roster/mode/seeds/fleet size -> run schedule -> standings or bracket -> choose recorded battle -> full-screen replay -> post-game -> return to League.

The league runs one match at a time. In all-vs-all, every distinct pair plays both color assignments for every selected seed; standings use win 3, draw 1, loss 0, followed by the documented tie-break order. Knockout accepts 4, 8, or 16 independently chosen slots, permits repeated captain packages, performs a seeded opening draw, and advances recorded winners through a left-to-right bracket. Results are based on capture outcomes, never reward. Uploaded captains are session-scoped and immutable for the scheduled run.

## Developer journey

The developer guide is one reference page rather than a lesson system. It documents:

- JavaScript `reset`/`act` and team-action structure;
- visible observation fields, legal interactions, fog filtering, and delayed activation;
- the 100 ms best-effort decision budget and worker/QuickJS/archive/model limits;
- accepted script, Dense JSON, and restricted TensorFlow.js formats;
- rejected raw Python, pickle, `.pt`, remote URLs, and executable custom layers;
- commands for training/evaluation/export in the optional native Python kit.

## Presentation and accessibility

The landing/menu/results screens use the generated pirate-battle background, original ship/terrain/effect atlases, three-state button sprites, and locally synthesized UI/battle/ambience cues. The arena uses authoritative simulation geometry; presentation art never defines collisions.

All setup and results information is available as text outside the canvas. Controls are keyboard-focusable and named. Mobile supports the landing, menu, setup, developer guide, league tables, and full-screen broadcast; desktop remains preferable for editing or uploading larger policies.
