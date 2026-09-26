# Checks performed

`audio-report.json` records numerical checks on all 49 masters and their Ogg copies: format, count, finite samples, non-silence, digital peaks, estimated four-times-oversampled true peaks, loop endpoints, decode success, SHA-256 integrity and bit-identical WAV regeneration. The highest estimated true peak was approximately -2.72 dBFS. This is not a loudness calibration or an assertion that arbitrary overlapping mixes cannot clip.

`browser-report.json` records actual Chromium decoding of all 49 embedded Ogg previews, individual playback, loop stopping, mute and responsive layouts. The helper loaded 49 buffers and passed fail-closed world-event permission, duplicate-event suppression, 12-voice limiting, ambience startup, gain clamping and disposal checks. No uncaught browser errors were observed in those tests.

The managed Chromium browser blocks URL navigation. Tests injected the preview as a self-contained HTML document. The helper's fetch responses were mocked using actual asset bytes; Web Audio nodes and decoding were real. Deployed networking and other browsers remain untested. `preview-desktop.png` and `preview-mobile.png` show the reviewed preview UI.

No acoustic listening through headphones or speakers was performed. Final audition, comfort, mix, and stylistic review remain required. No full game integration, hidden-world observation correctness, or tournament logic is certified by these audio tests.

## Repeat

```bash
python -m pip install -r qa/requirements.txt
python qa/validate_audio.py
python qa/browser_qa.py
```

Node is needed for regeneration tests. Browser tests require Chromium available to Playwright (the script uses a system `chromium` when present). The generator itself does not require Python packages. The optional Ogg exporter requires ffmpeg.
