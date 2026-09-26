# Integration notes

## Runtime boundaries

The audio pack belongs exclusively to the authorized presentation layer. The pure game engine emits semantic events. Visibility filtering and viewer selection determine which events can be heard. Neither game stepping nor a student's policy waits for a sound to load or finish.

The helper is a browser ES module. Serve the game through its normal development/production server; do not fetch a manifest from `file://`. The independent audition page embeds its data and has no such fetch requirement.

```js
import { FleetRLAudio } from './fleetrl-audio.js';
const audio = await FleetRLAudio.fromManifest('/assets/fleetrl-audio/audio-manifest.json');

// Attach this to a visible Enable audio button or equivalent user action.
async function enableAudio() {
  await audio.unlock();
  await audio.preload();
  void audio.play('ui_confirm');
}

// Existing authorized presentation event, not raw hidden simulation state.
function onPermittedCannonEvent(event) {
  void audio.playEvent('cannon_fire', event, { permitted: true, pan: 0 });
}
```

The literal asset path is an example to adapt to the repository. Event IDs should be stable strings. World-event permission defaults to false in `playEvent`. UI sounds can use `play` directly. The caller remains responsible for deciding visibility correctly; the helper cannot infer it from a raw event.

## Playback and variations

Effects are mono; use a stereo panner in [-1,1] derived from the visible scene. Do not infer or reveal hidden coordinates. Background water is stereo and should not be attached to a hidden ship. Ship-team colors and carried-flag colors do not require different sound files.

Use variant group IDs when available. The supplied helper cycles group variants independently of simulation randomness. Tune variation selection as presentation-only behavior. Avoid pitching all sounds randomly: melodic interface/flag cues should retain a consistent identity.

Decoded WAV loop buffers cover exactly 24 seconds. Set source.loop to true and use the full buffer duration. Do not fade each repetition to silence; fade only when starting or stopping the ambient layer. The helper implements that approach. Keep only one ambience bed active.

## Initial mix

The manifest provides master/effects/UI/ambience gains and per-sound gains. Keep ambience off until enabled. These are conservative starting values, not a loudness standard. A file's safe peak does not guarantee a many-voice mix cannot overload. Check the actual mix and add an output dynamics stage or lower gains if necessary.

For class, favor brief flag and result cues over continuous background. Keep hover sounds off. Low-health warnings belong to the selected friendly ship, no more than once every eight seconds; never alarm continuously for every ship.

## Replay and headless operation

Call `audio.resetTimeline()` on new matches and replay seeks. It cancels pending playback, stops active voices, resets deduplication and drops old rate-limit state. Do not immediately replay all events preceding the new cursor. Stop or fade audio on pause and do not accumulate a backlog. The supplied helper does not know the simulation's replay speed; the caller should suppress audio above 2x.

No sound should run during headless training or batch evaluation. In Classroom Live, only the selected visual match emits sound. Match results in background jobs should update the table silently rather than playing hundreds of victory cues.

## Failure behavior

Audio failure must never fail a match. `play()` catches decoding/playback errors, logs a warning and returns false. The application should report manifest loading failures gracefully and continue silently. Ogg effects fall back to WAV when loading or decoding fails. Local test transport mocked actual bytes because the QA browser blocks URL navigation; verify the deployed paths and content types in the real app.

## Scope

This is a playback helper and asset pack, not a finished game integration. Sound events such as `movement_start`, `cannon_flyby` and `checkpoint_saved` are optional and should remain unused until the game has the corresponding feature. No sonar or whistle mechanic is added by the existence of audio assets.
