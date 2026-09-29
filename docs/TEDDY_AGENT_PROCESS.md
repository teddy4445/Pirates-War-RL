# Teddy's Agent process

Status: implemented reference challenge. The interactive version is available at `#/develop/teddy`.

## Challenge roster

Pirates War RL now provides four separate four-opponent ladders:

| Mode | Level 1 | Level 2 | Level 3 | Final boss |
|---|---|---|---|---|
| Duel | Harbor Cadet | Tide Hunter | Blackwake Ace | Teddy's Duel Leviathan |
| Fleet | Deckhand Squadron | Coral Vanguard | Storm Armada | Teddy's Fleet Sovereign |
| Fog Duel | Lantern Scout | Mist Stalker | Phantom Corsair | Teddy's Fog Wraith |
| Fog Fleet | Watchlight Crew | Veil Squadron | Spectral Armada | Teddy's Fog Dominion |

The three numbered rivals are trusted built-ins with increasing movement, recovery, combat, and coordination behavior. Each Teddy boss is different: it is an ordinary `fleetrl-package-v1` JavaScript submission with `manifest.json`, `agent.js`, and `README.md`. The exact source runs inside a dedicated QuickJS/WASM worker under the same limits and filtered observation contract as uploaded student JavaScript.

## Development workflow

1. Pick exactly one target mode. A package declares only that supported mode.
2. Develop against the public `fleetrl-agent-v1` contract. Use known island polygons, filtered enemies and flags, legal-action masks, and seeded `api.random()`. Never read authoritative hidden state.
3. Use the native Python kit for matching rollouts or optional Q-learning/DQN. A student may instead build a state machine directly in JavaScript.
4. Evaluate on held-out seeds, both colors, and relevant fleet sizes. Record total points, kills, pickups, deliveries, draws, fallbacks, and latency separately. Freeze learning before evaluation.
5. Package and preflight the exact artifact that will compete. Replays identify the immutable agent hash and never rerun a policy.
6. Inspect or copy the shipped boss files through **Under the deck** on New Game or through the Teddy's Agent page.

The current Teddy versions are auditable JavaScript state machines, not a claim of neural training. They use a defensive opening in Duel, a dedicated Fleet sentry, legitimate last-seen memory in fog, visible-projectile evasion, legal target selection, flag recovery, carrier escort, polygon-aware waypoint selection, and legal strategic scuttling for badly damaged non-carriers far from home. This is intentionally a workflow students can reproduce without privileged tools.

## Maintained evaluation gates

- Unit tests load all four exact Teddy sources in QuickJS and validate their actions against the authoritative schema.
- Ladder tests require Level 2 to defeat Level 1 and Level 3 to defeat Level 2 on the maintained seed in all four modes.
- A separate fleet quality seed set requires a real flag pickup and completed capture without fallbacks.
- Production Chromium runs mirrored Level 3-versus-Teddy evaluations for all four modes. The Teddy entry must lead the resulting standings; side assignment alone cannot satisfy this gate.

These gates are regression evidence on declared seeds, not a universal claim that an agent cannot be beaten. The student challenge is to build a submission that beats every one of the sixteen opponents under the announced evaluation schedule.
