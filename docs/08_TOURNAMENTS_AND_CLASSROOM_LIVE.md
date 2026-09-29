# 08. Leagues and recorded match playback

Status: league calculation contract. Classroom/instructor screens were removed; a local browser accepts session uploads, schedules/runs matches, and plays recordings. It cannot automatically receive files from other computers without an external collection channel. See [11](11_STORAGE_EXPORT_AND_DEPLOYMENT.md).

## Contents

1. Tournament identity and scheduling
2. Ranking and metrics
3. Classroom Live workflow
4. Playback selection and performance
5. Result integrity and export

## 1. Freeze a roster and schedule

Students may keep many agent versions and submit several distinct agents. The instructor chooses a per-student entry cap (default 3 for informal play, 1 for a graded comparison). Agent standings and student standings are separate; do not give students more points simply because they submit more agents. Freeze immutable package hashes, aliases, exact rules, map set, seeds, execution provider, deadline policy, and engine build before scheduling.

The all-vs-all format is round-robin. Every distinct pair of roster agents plays both side assignments for every configured seed. Agents do not play themselves. Same-student agent matchups are included by default in an agent-level tournament; disabling them changes the comparison graph and must be explicit. A student-level assessment should normally use one designated checkpoint per student.

The game also provides a local knockout format for exactly 4, 8, or 16 bracket slots. Slots are independently selected and may reference the same immutable captain package more than once. The opening draw is a deterministic seeded shuffle, each later round uses the recorded winners of the preceding round, and every completed bracket match retains a selectable replay. A true in-engine draw advances one side through a recorded deterministic admiralty draw-break; this bracket-only advancement is not relabeled as a simulation win. Knockout results are shown as a left-to-right tree and are not merged into round-robin points.

For N agents and K seeds per pair, the match count is `N*(N-1)/2 * 2*K`. Examples from this formula: N=8,K=1 -> 56 matches; N=30,K=5 -> 4,350 matches. These are counts, not runtime estimates.

A match ID is derived from tournament identity, the two package hashes, map/seed ID, and side assignment. Use the same physical map/seed for the side-swapped partner, swapping which policy controls Blue/Rose. If map generation itself randomizes sides, store the exact geometry/assignment. Agent PRNG streams must follow a documented seed derivation and be reset for each match.

Create the entire job list before execution. States: pending, initializing, running, completed, interrupted, failed-infrastructure, and cancelled. Persist each completed result transactionally so reload/resume does not duplicate a match or count it twice. Agent forfeits are completed outcomes, not infrastructure failures. Retry infrastructure failures with a visible reason; never rerun a legitimate loss until it becomes a win.

## 2. Ranking and definitions

Primary league points: win 3, draw 1, loss 0; double forfeit 0 each. Rank by total league points, then direct head-to-head points among tied agents, then aggregate game-score differential, then game points scored. If still tied, share the competitive rank; alphabetic order may stabilize display but must not pretend to break the tie.

When completed match counts differ during a run, label standings provisional and show games played plus points/game. Do not crown a leader based on partial uneven schedules. Final standings require the declared schedule or explicitly report incompleteness.

Keep these quantities distinct:

```text
strict win rate = wins / completed result count
score rate      = (wins + 0.5*draws) / completed result count
league points   = 3*wins + draws
```

Forfeits count in the W/L columns and have separate reason counts. Double-forfeit results count as completed results but give neither a win nor draw; report them explicitly. Cancelled/infrastructure-interrupted jobs are excluded from rates until resolved. Show a dash, not 0%, when the denominator is zero.

Pairwise matrix defaults to score rate with W/D/L counts and denominator on hover/focus. For ordinary outcomes, opposite off-diagonal score rates sum to 1; with double forfeits they need not. Strict win rates also do not sum to 1 when draws exist. Never label score rate as win rate. Use a striped/outlined state for incomplete cells; diagonal is not applicable.

Record game points scored/conceded, flag pickups/deliveries, damage dealt/received, shots/hits, ships sunk/lost, possession time, distance traveled, median delivery time conditional on successful deliveries, mean/p50/p95 decision latency, timeout/invalid rates, and runtime reset counts. A no-delivery match has no delivery time, not zero. Aggregate latency percentiles from raw samples or a documented mergeable estimator, not averages of per-match percentiles. Store the relevant sample counts.

Confidence intervals are optional but must state method and sample unit. Mirrored games sharing a seed are correlated; a seed-pair clustered bootstrap is more defensible than pretending all shots/decisions are independent wins. Elo is deferred because it can conceal non-transitive matchups and depends on update ordering; the pairwise matrix is the first-class teaching view.

## 3. Classroom Live: before class

The instructor collects exported packages through the institution's existing upload channel or file exchange, then bulk-imports them into one browser. This bundle does not integrate any external account or promise automatic synchronization.

Preparation screen must support roster aliases, source-package validation, duplicate detection, per-student entry caps, challenge compatibility checks, a sample dry run, measured runtime/storage estimates, and a freeze button. Export the frozen roster plus match plan as a classroom archive. Keep original student names/emails private; aliases are the default projector labels.

Use an explicit state machine:

```text
Draft -> Validating -> Ready -> Frozen -> Running -> Paused -> Completed
                                             |          |
                                             +-> Interrupted/Resume
```

Changing a frozen model/config creates a new tournament, not an in-place edit. A failed preflight blocks that agent with a readable reason; it does not crash the roster. Prepare the website/runtime assets before class so the session does not depend on a first-time download.

## 4. During class

Projector layout: large leaderboard on the left, pairwise matrix in the center, selected-match card and match count/progress on the right. Header shows tournament name, mode, simulation-budget policy, live/precomputed status, and real progress. "Running locally" is a useful label; do not call the standings globally authoritative.

Controls: Run, Pause after current job, Resume, Feature matchup, Back to results, Fullscreen, Mute, Reveal scores, and Export. Do not require projecting the editor or students' raw source code. A spoiler-free reveal mode may hide scores until a replay completes while retaining the actual result internally.

Click behavior:

- Completed matrix cell with multiple seeds: open its match list, then play the selected recorded game. Show seed, sides, result, and whether it is replay or genuinely live.
- Running match: offer its delayed live spectator snapshots only if available, otherwise wait for completion. Do not label a freshly rerun game as that running result.
- Pending match: allow "Run this next" without changing its seed/config; feature it once data exists.

Selected playback uses the normal pirate renderer and sound pipeline, including cannonballs, sinking, respawn, flags, and fog perspectives. Support pause, slow motion, event jumps, and actual observation/action inspection. Returning to the matrix preserves scroll, filters, and selection.

Default classroom behavior pauses new tournament jobs while a match is being featured, allowing active jobs to finish. This protects smooth playback and reduces deadline distortion. A low-load background mode is an advanced option only after measuring the device. Keep one active match job as the conservative evaluation default; a worker pool may increase throughput only with declared concurrency and benchmarking. GPU inference may serialize or contend despite multiple workers.

Headless is faster only when computation permits. Do not promise instant completion. Show elapsed time, measured matches/minute, current active jobs, and a revised estimate based on actual completed samples. Offer an honestly labeled precomputed-results playback mode for class, rather than pretending historical outcomes are a live computation.

## 5. Integrity, export, and grading

Persist a result exactly once with its replay pointer and checksums. Clicking any completed classroom match should produce the recorded outcome under the retention requirements in [06](06_TIMING_DETERMINISM_AND_REPLAYS.md). If storage fails, pause and preserve the previous checkpoint; never discard selected/required replays silently.

Export JSON result records, readable CSV standings, pairwise data, run configuration, frozen package hashes, and replay archives. Protect CSV exports from formula injection by escaping untrusted cells that begin with spreadsheet formula characters. No arbitrary student source is executable on export/import outside the sandbox.

Label result provenance as local practice, instructor-local classroom run, or imported archive. A file hash is not proof of student authorship. A browser-only app has no secure role system or tamper-resistant shared grading. Automatic account-based submissions and trusted remote evaluation are separately designed extensions, not hidden prerequisites for using the teaching platform.
