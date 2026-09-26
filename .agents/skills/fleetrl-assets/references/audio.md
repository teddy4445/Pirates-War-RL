# Audio production reference

## No-cost default

Use original oscillator/noise synthesis. No voice, background music, copied recordings, paid API, or external samples are necessary. The included Node script writes 44.1 kHz, 16-bit, mono PCM WAV files using built-in modules only. Node is a development tool; students' browsers use the exported files or an equivalent Web Audio implementation.

```bash
node .agents/skills/fleetrl-assets/scripts/generate_sfx.mjs --out public/assets/audio --seed 101
```

Specify `--force` only to intentionally replace previously generated files. The script validates arguments and avoids overwriting existing output by default. Its manifest records seed, file bytes, duration, peak amplitude, and RMS. It does not perform a human listening test.

## Sound recipes

| ID | Character | Duration |
|---|---|---:|
| cannon | Soft low pitched downward thump plus short filtered noise | 0.18 s |
| hit | Small wooden click/thud, not a realistic explosion | 0.14 s |
| splash | Gentle filtered noise burst with rounded envelope | 0.32 s |
| sink | Quiet descending bubbles/noise | 0.85 s |
| flag_pickup | Two-note upward pluck | 0.22 s |
| flag_give | Short friendly ascending cue | 0.18 s |
| flag_place | Soft downward cue | 0.20 s |
| capture | Restrained three-note success arpeggio | 0.55 s |
| respawn | Small rising shimmer | 0.38 s |
| ui_click | Quiet short tick | 0.05 s |

Use at least a small fade-in/fade-out to avoid waveform discontinuities. Remove DC and peak-limit exported files conservatively; the bundled generator caps at 0.7 full scale (approximately -3.1 dBFS). Apply additional mixer gain: master 0.35 and effects 0.7 as starting points, not calibrated loudness. Listen on ordinary speakers/headphones before finalizing.

## Browser integration

Create/resume AudioContext only after a user gesture. Provide mute and master/effects controls, persist user preferences, and handle suspended contexts. Use a maximum of about 12 simultaneous effects initially and prioritize captures/hits over repetitive wake/UI cues. Keep ambient water/music off by default.

Play an effect once per event ID, not every rendered frame. Use a separate replay event cursor; scrubbing should not emit all skipped events. Mute or thin effects at fast playback. Do not replay old sounds on resume. Stop/disconnect completed voices and release buffers when the scene is disposed.

Filter sound by viewer perspective before routing it to the mixer. An off-screen/hidden enemy shot must not reveal that enemy's position to a policy or player. Omniscient classroom sound is allowed only in a labeled spectator view. Do not expose audio nodes or analyzer data to policy code.

## QA

Verify RIFF/WAVE headers, sample count, mono format, finite samples, no clipping, fades, and deterministic regeneration from the same seed. Test invalid CLI arguments and non-overwrite behavior. Audition each effect for comfort and consistent loudness. Verify mute, user-gesture activation, replay scrubbing, and overlapping shots in the browser. File-level tests are not an auditory review; explicitly say when listening remains undone.

Keep generated audio provenance as project-authored procedural synthesis with generator version and seed. Choose the repository's intended asset license explicitly; do not automatically label all future externally sourced audio CC0.
