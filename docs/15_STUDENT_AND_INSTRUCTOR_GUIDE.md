# 15. Player and agent-developer guide

Status: current runbook for Pirates War RL. There is no instructor or classroom-management mode.

## Play a match

Open the landing page, enter the arena, and choose New Game. Select a captain for Blue and Green. Either side can use a ready-made captain or a session upload. Choose Duel, Fleet, Fog Duel, or Fog Fleet, set the deterministic seed, select spectator/team vision, and choose whether sound is enabled.

Start Battle performs a production preflight for both policies, computes the deterministic match, and opens the full-screen broadcast. All movement, turning, firing, and flag interactions come from agent code. Pause/continue affects the broadcast only. Close opens the actual post-game result without changing the outcome.

## Bring an agent

A JavaScript captain is a plain `.js` file or bounded ZIP with `manifest.json` and `agent.js`. A model captain is either declarative `dense-json-v1` or a restricted TensorFlow.js Layers ZIP with all local shards. The browser does not accept Python source, pickle, `.pt`, arbitrary training checkpoints, remote model URLs, Lambda layers, or custom executable layers.

Use the developer-guide page for the exact observation/action contract and limits. Test the exact exported artifact in New Game before adding it to a League. Fog agents receive only authoritative visible information; spectator rendering, audio, and result statistics are not policy inputs.

## Run a league

Open League, upload any additional captains, choose mode and seed count, then start. Each pair plays both colors on every seed. Use Pause After Battle for a clean boundary. Final standings use match outcome and the documented tie-breakers. Exported JSON and recorded replays describe real completed matches; no demonstration row is mixed into standings.

## Develop with Python

Download the optional Python kit from the developer guide. It runs locally and is never a website backend. Use its headless simulation, Gymnasium/PettingZoo adapters, rule opponents, training commands, evaluation, and Dense exporter. Import the resulting `.agent.json` directly in New Game or League.

Treat local `.pt` files as trusted training state. The browser accepts only the declarative export. A short smoke run proves the toolchain, not strategic quality.

## Integrity boundary

Pirates War RL is a static local game and match viewer. It does not provide accounts, authenticated submissions, anti-cheat, tamper-resistant grading, or a hosted competition service. Share agent packages and result exports through whatever external channel the event organizer chooses.
