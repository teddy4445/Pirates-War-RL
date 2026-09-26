# FleetRL Sound Pack

**49 original synthesized sound assets: 47 short effects and two 24-second stereo ocean loops.**

This pack contains actual exported audio, not prompts or placeholder filenames. It is designed for the cute pirate capture-the-flag game, with short, restrained effects that can coexist with classroom discussion. All files were generated locally from oscillators and seeded noise; no external audio samples, paid services, voices, or recordings were used.

## Listen first

Open `preview/index.html` in a desktop browser. Click **Play 40-second showcase**, or play individual sounds. The preview embeds every sound, so it needs no internet connection or asset server. Controls include category filters, search, master volume, mute, one-at-a-time playback and Stop all. Press Escape to stop.

For a normal audio player, open `preview/showcase.mp3`. The demo mixes a small illustrative battle with objective, interface, training and tournament cues; it is not a recording of the actual game.

A managed browser may block local HTML files. In that case, serve the extracted folder through your project's development server. The preview itself does not request a remote service.

## What's included

| Category | Assets | Examples |
|---|---:|---|
| Combat | 14 | Three cannon shots, three wood impacts, three splashes, reload, flybys and bumps |
| Ships | 5 | Two sinking variations, respawn, low health and sails catching wind |
| Flags | 8 | Pickup variations, teammate handoff, land placement, water drop, recovery, delivery and loss |
| Interface | 9 | Click variations, hover, confirm, back, error, pause, resume and notification |
| Match and tournament | 6 | Countdown, start, victory, defeat, draw and tournament complete |
| Training and validation | 5 | Start, finish, checkpoint saved, validation pass and fail |
| Ambience | 2 | Calm ocean and harbor water; 24 seconds each, stereo and looping |

The original WAV files are **44.1 kHz, 16-bit PCM**. One-shot effects are mono so the game can pan them; the ocean beds are stereo. Compressed Ogg Vorbis copies are included for optional lighter browser delivery. Use decoded WAV buffers for precision ambience looping.

## Folder guide

```text
FleetRL_Sound_Pack/
  audio/wav/                 49 PCM masters
  audio/ogg/                 49 compressed copies
  audio-manifest.json        IDs, paths, gains, variants, duration, loop metadata and hashes
  preview/index.html         Self-contained audition page
  preview/showcase.mp3       40-second mixed preview
  preview/showcase-cues.json Exact cue timestamps for the preview
  integration/              Browser playback helper and usage example
  source/                   Editable procedural synthesis/export/preview scripts
  docs/                     Integration and event-mapping notes
  qa/                       Numerical/browser reports and reproducible checks
  PROVENANCE.md             Generation and review information
  CODEX_INTEGRATION_PROMPT.md
```

## Integrate with Codex

Read `CODEX_INTEGRATION_PROMPT.md`. Copy `audio/` and `audio-manifest.json` into the game's public assets directory. Import `integration/fleetrl-audio.js` into presentation code. Keep sound out of simulation logic, the training loop, the headless tournament runner and student sandboxes.

`audio-manifest.json` provides stable IDs and initial gain recommendations. It also defines groups such as `cannon_fire`, `hull_hit`, `water_impact`, `ship_sink` and `ui_click`. The helper rotates variants without consuming the simulation's random number stream.

## Regenerate or customize

The WAV generator requires only Node.js built-ins:

```bash
node source/generate_audio.mjs --out ../FleetRL_Regenerated --seed 20260925
```

It refuses to overwrite existing generated audio unless `--force` is supplied intentionally. Sound recipes and durations live in `source/generate_audio.mjs`. The same seed reproduced all WAVs byte-for-byte in QA.

Optional compressed export requires Python and an installed `ffmpeg` executable:

```bash
python source/export_web_audio.py --root ../FleetRL_Regenerated
```

The optional showcase/preview builder uses Python with NumPy and SoundFile plus `ffmpeg`. It reads the pack next to its `source/` folder. The synthesis/export and optional QA dependencies are distinct from runtime requirements: students only play the exported files in their browsers.

## Verification and limits

All 49 WAVs and all 49 Ogg files decoded successfully. PCM headers, sample counts, channels, manifest hashes, conservative signal peaks, loop endpoints and deterministic WAV regeneration were checked. All 49 embedded previews also decoded in Chromium. The preview and helper were smoke-tested for playback, stopping, mute, event deduplication, visibility gating and the 12-voice limit.

The automated browser disallows URL navigation. Preview testing therefore injected the self-contained HTML; helper transport was mocked using the actual local file bytes. Real Web Audio decoding/playback ran, but deployment hosting, direct file-URL opening and all other browsers were not tested here.

**No perceptual listening through headphones or speakers was available.** Numerical tests and browser playback are not an auditory quality review. Audition the pack and adjust mix levels on the actual classroom speakers before release. The helper is supplied for integration; it is not evidence that a complete FleetRL game already exists.
