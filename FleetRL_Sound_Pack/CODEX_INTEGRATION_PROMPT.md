# Codex prompt: integrate the actual FleetRL audio pack

Paste the following into Codex with this folder available in the workspace.

---

Integrate the provided `FleetRL_Sound_Pack` into the FleetRL browser game. Inspect the existing repository and the project's game rules before editing. This is presentation-layer work; do not change physics, observations, rewards, scoring, decision timing, model inference or tournament outcomes.

1. Read `README.md`, `audio-manifest.json`, `docs/INTEGRATION.md` and `docs/EVENT_MAPPING.md`. Inspect the existing audio/runtime abstractions and use the current architecture instead of creating duplicate managers.
2. Copy the audio files and manifest to a predictable public asset path. Reuse `integration/fleetrl-audio.js` or adapt it to the existing architecture. Keep original stable sound IDs. Use WAV buffers for precise ambience loops; compressed Ogg is optional for effects, with a WAV fallback.
3. Activate audio only after a clear user gesture. Add master, effects, interface and ambience volume controls, mute and persisted preferences. Keep ambience off initially. Include a classroom preset that lowers effects and disables hover, low-health repetition and nonessential notifications.
4. Connect sounds to the game's actual event schema. Treat `docs/EVENT_MAPPING.md` as a semantic mapping, not a claim that those event names already exist in the code. Play each permitted event only once. Rotate effect variants using a presentation-only mechanism, not the game RNG.
5. Apply the viewer's visibility permissions before playing world sounds. Hidden enemy shots, collisions, sinking, movement and pickups must stay silent. A public score update may have a neutral cue without leaking location. Omniscient classroom sound is allowed only in a visibly labeled spectator perspective. Never provide audio nodes or analysis buffers to student code.
6. Limit simultaneous effects to 12, prioritize score/results cues, and rate-limit low-health alerts and frequent sounds. Confirm the output mix is comfortable with multiple ships firing. Treat recommended gain values as starting points, not calibrated loudness.
7. Replay sounds from recorded authorized events, not by rerunning agents. Seeking, pausing or switching matches must cancel stale playback. Do not emit all skipped events after a seek. Suppress audio above 2x speed, or implement an explicitly documented thinning strategy. Headless training and tournament computation must be silent.
8. Add tests for event deduplication, fog filtering, mute, voice limits, disposal, missing file/decode fallback, replay seeking and deterministic simulation results with audio enabled versus disabled.
9. Add an asset-audition route or developer panel using the provided preview as a reference. Audition cannon overlap, a whole flag relay, sinking/respawn and a 60-second ambience loop. Do not claim perceptual review without actually listening.

Run existing tests and describe changed files, actual verification, and any integration gaps. Do not invent gameplay features just because an optional sound exists; ignore unsupported cues until the matching feature exists.

---
