# Cross-language parity

Browser and Python engines implement the rules independently and share packaged config, map, action schema, versions, RNG vectors, and conformance fixtures. Neither calls the other at runtime.

`xorshift32` uses unsigned 32-bit shifts with zero remapped to `0x6d2b79f5`. Named streams use UTF-8 FNV-1a followed by the documented avalanche mixer. Gameplay and presentation randomness are separate.

The authoritative trajectory fixture contains 12 cases: every mode across seeds 1, 7, and 99, each for 240 fixed physics ticks with explicit controls. A second Python-generated gameplay fixture compares complete canonical states, ordered events, and both teams' authoritative filtered observations for targeted close and distant shots, predictive leading, enemy and friendly hull impacts, solid-terrain impacts, death/flag relocation, simultaneous capture, fog island discovery, respawn protection, and the timeout sink tiebreak. Browser tests compare the native TypeScript engine to these fixtures at absolute/relative tolerance `1e-9`; discrete values and ordering must match exactly.

Adapter fixtures cover full observation, a known legal fire target, fog-hidden opponents/flags, a dead own ship, legal pickup, and legal give/place/drop; they compare 64 float32 features at `1e-6`, masks exactly, and all 22 decoded actions exactly. Native combat tests additionally cover selected-target velocity lead, distance-scaled damage, and the close-range marker. Python's default Gymnasium/PettingZoo reset materializes the same seeded procedural map used by a live browser match; passing an explicit map remains an intentional override.

The Python export test compares PyTorch and Dense JSON logits at `rtol=1e-5`, `atol=1e-6`. Browser model tests validate the same orientation and deterministic argmax. Same-engine replay hashes remain exact and separate from cross-language floating-point tolerances.

Procedural physics tests start from materialized maps. The `fleetrl-archipelago-v3` generator is deterministic and bounded, covering a single symmetric central island or mirrored island pairs plus zero-to-six wreck hazards; the curated map is the readable fallback after exhausted validation attempts. Policy wall-clock enforcement and rendering are browser concerns and are not simulated by the headless trainer. Cross-language continuous values are guaranteed within the declared tolerances, not as universal CPU/GPU bit identity.
