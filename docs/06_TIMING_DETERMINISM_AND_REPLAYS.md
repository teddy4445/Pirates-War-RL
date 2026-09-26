# 06. Timing, fairness, determinism, and replays

Status: normative. The key distinction is between simulation time, wall time, and presentation time. Browser scheduling is best-effort, not hard real time. See [sources S03, S07, S10](14_SOURCES.md).

## Contents

1. Three clocks and the decision pipeline
2. Deadlines and failures
3. Headless training/tournaments
4. Reproducibility
5. Replay format and retention

## 1. Three clocks

| Concern | Proposed default | Authority |
|---|---:|---|
| Physics | 60 fixed ticks per simulated second | Integer tick counter |
| Policy observation/action cadence | Every 6 ticks = 100 ms simulation time | Match coordinator |
| Decision budget | 100 ms wall time per team request | Coordinator monotonic clock |
| Display | Target 30 FPS | requestAnimationFrame and interpolation |

The screen refresh rate is not the physics rate. Use `requestAnimationFrame` for rendering and cap presentation to the configured target; never integrate using whatever dt a frame happened to take. rAF can pause in hidden tabs [S10]. Pause interactive matches on visibility loss by default rather than claiming meaningful real-time competition in a suspended tab.

### Chosen semantics: fixed one-window control latency

A continuously moving game cannot observe a state, spend up to 100 ms thinking, and apply the action retroactively to that same state. Version 1 therefore uses an explicit, equal one-decision-window delay for both teams:

```text
At simulation tick 0:
  send O_A(0), O_B(0); both declare actionAppliesAtTick = 6
  ticks 0..5 run neutral initial controls
At tick 6:
  activate both accepted A(0) and B(0), or fallback, together
  send O_A(6), O_B(6) for application at tick 12
  ticks 6..11 run the controls committed at tick 6
At tick 12: repeat
```

An early reply waits for the shared boundary. A late reply never gains a later advantage by being applied immediately. Use immutable decision IDs and activation ticks; reject stale/duplicate responses. No future observations are sent before the previous decision request is settled. This delay is part of the environment and training must reproduce it.

At each boundary, create both observations from the same authoritative state, send both requests, and start a common host-clock deadline. Account for request delivery, inference, and reply serialization within the configured budget. Keep dispatch skew small and measured. Do not `await` A before dispatching B. Use an injected clock in scheduler tests.

## 2. Deadlines and failures

Accept the first schema-valid result for a request received before its coordinator deadline. Freeze both results at the boundary/deadline. The policy host has its own interrupt deadline for guest execution; the coordinator remains the final arbiter of acceptance. These are not CPU-instruction quotas and vary with hardware/load.

Fallback is neutral control for the affected team/ship, not repeating a stale fire/transfer command. Disable fire and one-shot interaction. Keep physical momentum so fallback does not become a magic brake. A deadline failure counts even if a late action is otherwise good.

Do not overlap a new `act` with an unresolved old one. On a hung request, invalidate its generation ID, interrupt/terminate the worker, and restart in a fresh runtime if the failure policy permits. While reinitializing, apply neutral. Reset guest/model recurrent state and log `AgentRuntimeReset`. Never silently claim its memory survived.

Default forfeit threshold: 10 consecutive failed team decisions or >20% failed decisions after at least 50 requests. Freeze these settings in the tournament configuration. Invalid per-ship actions are logged separately; a configurable per-decision invalid-action threshold can escalate them, but do not invent it later to change a result. One side forfeiting gives the other a forfeit win, recorded separately from physical captures. Both forfeiting on the same boundary yields a double-forfeit result with zero league points for both. Host crash, exhausted storage, tab suspension, and explicit instructor cancellation are infrastructure interruptions, not agent losses.

A dedicated visible classroom run should stop competing training jobs and use a conservative worker count. A browser stall affects timing; record performance diagnostics and classify interrupted runs honestly. There is no guarantee that every model will meet 100 ms on every machine.

## 3. Headless execution

Headless removes rendering, audio, and wall-clock pacing; it does not remove action boundaries, latency semantics, sensing, physics steps, or deadlines.

At a headless boundary: dispatch both observations, advance the next six ticks under the currently committed controls, await both replies or their 100 ms deadlines, then commit at the next boundary. If both finish early, continue immediately; do NOT sleep 100 ms for every successful decision. If one consumes the full budget, the match remains slow. A 180 s match has 1,800 decision windows; a slow model can dominate runtime even without graphics.

The real-time and headless schedules must yield the same result given the same accepted action log. They need not accept the same actions under differing machine load; record that distinction. A separate teaching-only relaxed budget is allowed but its results must not be mixed with the competition track. Fast-forwarding a live policy match changes scheduling pressure; prefer accelerated REPLAY for demonstrations and report slow motion when inference cannot keep pace.

Training also uses the one-window delay. Maintain the pending/current control in the environment. The training adapter must construct transitions consistent with this latency (for example augment learner state with current held controls/pending-action context). Store issued and applied actions separately. In an augmented delayed-control MDP, the interval reward may depend on the previously held control while the newly issued action enters the next state's queue; that is valid, but silently relabeling the applied action as the issued one is not. Test a tiny deterministic delayed-control example before DQN training.

## 4. Determinism and seeds

Create independent seeded streams for map/layout variation, physical stochastic events, tie-breaking, each agent, and cosmetic effects. Never let drawing a wake consume the physics RNG. Never expose the simulator's private RNG seed to an agent, because it may reveal hidden randomized state. Avoid wall clocks, `Math.random`, and non-deterministic iteration in sim-core.

Record engine build/hash, rules/map hashes, agent package hashes, assigned sides, seed IDs, feature/action versions, execution provider, scheduling mode, and accepted/fallback actions. Use sorted iteration and fixed tick counts. The seed alone is not an exact replay: policy randomness, hardware-dependent floating-point inference, queueing, and deadlines may differ.

Same engine build plus accepted action trace should reproduce deterministic gameplay within the tested runtime. Do not promise universal bit-for-bit cross-browser/GPU reproducibility. Use periodic state hashes to detect divergence. Keep the original authoritative trace, not newly inferred commands, as the reference.

## 5. Replay contract

Replay must NEVER invoke a student policy or recompute its neural predictions. A clicked tournament result plays the recorded game, not a fresh match presented as the original.

Minimum replay record:

```text
header: schema/engine/config/map/agent hashes, seeds, sides, outcome
initialState: exact authoritative initial state
commands: accepted validated team actions, decision IDs, apply ticks, fallback flags
runtimeEvents: errors, timeouts, resets, provider/latency metadata
worldEvents: shots, impacts, death, respawn, flag transitions, captures
keyframes: authoritative state at fixed intervals (default 120 ticks)
checksums: periodic canonical simulation-state hashes (default 60 ticks)
optionalInspection: actual filtered observations and bounded policy debug outputs
```

The replay player restores a keyframe and steps sim-core using recorded commands, never agents. Scrubbing uses the closest preceding keyframe. Reconstruct fog views with the same visibility code, and mark omniscient/Blue/Rose/selected-ship perspectives explicitly. Inspect the actual historical observation associated with a decision, not the world at the later activation tick.

For portability, optionally retain a compressed presentation snapshot track at 10 Hz plus exact event ticks for featured/exported matches. If an engine is missing or checksums fail, use this recorded track with a clear snapshot-playback label; interpolation is visual, not recomputed physics. If neither a compatible engine nor such a track exists, explain that the historical replay cannot be rendered and offer an explicitly labeled new rerun. Do not silently change the recorded result.

The game replay exposes play/pause and one cyclic X1/X2/X4/X8 speed button; X8 returns to X1. Replay acceleration never alters recorded actions, events, or results, and repetitive audio is suppressed above X2. The underlying replay contract can later add seek, decision-step, event jump, inspection overlays, and perspective switching without invoking a policy. Scrubbing must not replay every skipped sound or fire the same event twice.

### Storage policy

Thousands of matches can exceed browser quota. Estimate and display required storage from a calibration match before a tournament. Classroom click-to-watch mode requires retaining a compatible replay for every completed matchup; do not silently evict those traces. Keep summaries separate from larger optional observation/snapshot tracks. Pause before exceeding the configured storage budget and ask the instructor to export, free space, or explicitly reduce retention/change the tournament plan. A metadata-only result must say "replay not retained".

Reserve full snapshot/inspection tracks for featured or requested matches by default; compact action/event/keyframe traces are the baseline. Export classroom archives with the associated engine build identifier and required maps/rules. No instant-run or storage-size promise is valid until measured with real agents on the target classroom device.
