# 01. Game logic

Status: normative gameplay specification. Numerical defaults are proposed balancing values in [13](13_DEFAULTS_AND_DECISION_LOG.md), not measurements. See [05](05_OBSERVATION_ACTION_AND_MODEL_API.md) for actions and [06](06_TIMING_DETERMINISM_AND_REPLAYS.md) for clocks.

## Contents

1. World and match modes
2. Entities and movement
3. Collisions and combat
4. Flag lifecycle and interactions
5. Death, respawn, and match outcomes
6. Event resolution and invariants

## 1. World and match modes

Use a top-down, continuous 2D plane. Coordinates and distances are world units (WU), not CSS pixels. The default map is 1600 x 900 WU. Positive x points right, positive y points down. Heading 0 points east; positive headings turn clockwise. Normalize heading to [-pi, pi). Camera zoom/resolution must never change physics.

Water is navigable. Islands and wreck shoals are closed, simple, non-self-intersecting polygons with solid interiors. The map boundary is solid. Water decoration, palm trees, huts, foam, bubbles, and visual ship bobbing are not colliders. There is no grid snapping, real buoyancy, wind, tide, or inventory. Solid-terrain impacts can damage a moving ship under the versioned collision rule below.

| Mode ID | Ships per team | Visibility |
|---|---:|---|
| `duel` | 1 | Full dynamic world observation |
| `fleet` | 3 by default, configurable 2-8 | Full dynamic world observation |
| `fog-duel` | 1 | Radius-limited, terrain-occluded |
| `fog-fleet` | 3 by default, configurable 2-8 | Union of friendly ship sensors |

One team-policy agent controls all ships on its side. Fleet count and visibility are independent configuration dimensions. All four modes use the same physical rules and API. Duel is still capture-the-flag, not elimination-only combat. Respawn means sinking an opponent does not end a match.

The game flow uses a seeded symmetric archipelago: one home island near each end and either one large 180-degree-symmetric central island or one to three irregular neutral-island pairs. Zero to six physical wreck shoals are generated as mirrored pairs plus an optional central wreck for odd counts. Seeded size, coastline, position, and count variation must preserve exact 180-degree symmetry and at least two water routes around central obstacles. Home bases have a land flag post and an adjacent water delivery zone. Store exact polygons, water spawn points, delivery zones, and flag sites as map data. Mirror a map/side assignment geometrically for fairness; do not merely recolor ships. Validate navigable connectivity and minimum corridor width for the largest ship collider. The original curated map remains a deterministic fallback if bounded generation cannot produce a valid layout.

## 2. Entities and movement

### Ship

Required authoritative fields: stable match-local `id`, `teamId`, spawn position/heading, position `(x,y)`, velocity `(vx,vy)`, heading, radius, health, alive/respawning status, remaining cannon cooldown ticks, respawn tick, spawn-protection expiry tick, carried flag ID or null, and currently held control. Keep the same ship ID after respawn. Reset physical state, not the student's entire team-policy memory, on a ship respawn.

Proposed values: radius 12 WU; health 100; acceleration 55 WU/s^2; drag coefficient 0.7 /s; maximum speed 80 WU/s; maximum turn rate 2.4 rad/s. Controls are throttle in [-1,1] and turn in [-1,1]. Negative throttle accelerates backward; it is not instant reverse motion. Neutral throttle coasts and slows through drag. There is no teleport or direct velocity-setting action.

At every physics tick with dt = 1/60 s:

```text
heading1 = wrap(heading0 + turn * maxTurnRate * dt)
forward  = (cos(heading1), sin(heading1))
v1       = (v0 + throttle * acceleration * forward * dt) * exp(-drag * dt)
v1       = clampMagnitude(v1, maxSpeed)
p1       = sweepAndResolve(p0, p0 + v1 * dt, shipRadius)
```

Resolve velocity components that point into a collision surface. Translation has inertia; turning changes acceleration direction rather than rotating existing velocity instantly. This is deliberately simple arcade kinematics. A neutral fallback stops further acceleration/firing/interactions but does not erase momentum.

### Other entities

- Base: team, static land flag post, water delivery zone, ship spawn slots.
- Flag: immutable owner team, state, carrier or world position, and drop/placement timestamp.
- Projectile: owner team/ship, selected target ship, position, lead direction, base damage, radius, distance traveled/remaining, spawn tick.
- Flag site: static ID, land point near a shoreline, adjacent navigable-water approach point, and interaction radius.
- Match: rules/config hashes, engine version, tick, seed streams, scores, terminal outcome, events.

## 3. Collisions and combat

Use circle ship hitboxes independent of artwork direction. Use swept circle versus polygon/boundary collision so a ship cannot tunnel across a thin island. Resolve ships against each other deterministically with non-penetration, a fixed iteration count, and stable contact ordering. Distances to land account for the ship radius. Avoid naive center-only tests.

Collision damage is enabled for friendly and enemy hull contacts. For equal-mass ships, the shared center of mass is their midpoint. At the first closing contact in a tick, compute each hull's own velocity component toward that midpoint; negative/away components clamp to zero. Each hull independently takes `round(0.2 * inwardSpeed)` health, so a stationary or separating hull takes no damage even when the other ship strikes it. For a terrain or world-boundary sweep, use the ship's velocity component into the outward collision normal and apply the same formula. Spawn protection suppresses collision damage but not physical separation. Damage from every hull, terrain, and projectile impact in one tick is accumulated before health/deaths are resolved. An enemy contact that sinks a ship credits the opposing fleet; friendly-contact and terrain-only sinks have no opponent kill credit.

`fire: true` holds the cannon trigger during the action window. Fire when alive, unprotected, cooldown is zero, and at least one visible enemy is a legal target. `fireTargetShipId` may select one of `legal[shipId].fireTargetShipIds`; backward-compatible actions that omit it select the nearest legal visible enemy by distance then ID. An unavailable or hidden explicit target makes that shot a no-op. Target selection is independent of hull heading.

At launch, solve the constant-velocity intercept for the selected ship using its currently observed position/velocity and projectile speed. Aim and spawn just outside the firing ship along that direction, not its hull direction. The projectile is ballistic after launch, not homing: later target turns can evade it, and islands can block it. This makes short shots naturally more accurate because there is less flight time in which the target can change course.

Default projectile: speed 320 WU/s; radius 3 WU; base damage 18.75; maximum travel distance 250 WU; cannon cooldown 48 ticks (0.8 s). Actual hit damage decreases linearly with traveled distance `d`: `round(18.75 * (1.6 - 0.95 * clamp(d/250, 0, 1)))`, for 30 damage at zero travel and 12 at maximum range. A hit at or below 25% of maximum range (62.5 WU) is marked `closeRange` for a distinct point-blank presentation effect. Place the muzzle only if its short sweep from the ship is not blocked by terrain. Projectiles stop at the first island/boundary or enemy ship impact and otherwise expire at maximum travel distance. Friendly fire is off; friendly ships do not block friendly cannonballs. Physical impact damage remains active for every hull contact. Each projectile damages at most one ship.

Use continuous swept collision against relative target motion where necessary. If multiple hull, terrain, and projectile impacts share a tick, gather damage then apply it simultaneously. Ships alive at the start of the firing phase can both shoot and then sink in that tick. A shielded enemy consumes the projectile but takes no damage. Do not damage a ship twice because an effect/replay event fires twice.

Visual recoil, muzzle flash, smoke, splashes, and hit flashes consume events; they do not decide hits. No gore or realistic violence is needed.

## 4. Flag lifecycle and interactions

There are exactly two logical flags, one owned by each team. A ship carries at most one flag. In version 1, ships carry the enemy flag; recovering their own loose flag returns it directly home. This prevents a team from hiding its own flag indefinitely.

### States

| State | Meaning |
|---|---|
| `at-home` | At its owner's designated land post; no carrier. |
| `carried` | Attached to exactly one living enemy ship; no independent ground position. |
| `on-land` | Placed at a validated shoreline flag site; no carrier. |
| `in-water` | Floating at a navigable-water location only when no eligible neutral shoreline site exists. |

Every flag transition is atomic. The initial state is `at-home`. Public home-post coordinates are not evidence that a flag is still there under fog of war.

### Pickup: `interact: { type: "pickup", flagId }`

A living, unprotected ship within 30 WU of the flag can interact. For a land flag, the ship remains in water and reaches the shoreline site. Use the predefined water approach corridor and distance rule; do not require a land flag to have a completely water-only line segment to its land endpoint. Reject access through the far side of an island.

Picking up an enemy flag requires an empty carrier slot and changes the flag to `carried`. Picking up one's own flag in `in-water` or `on-land` immediately returns it to `at-home`. One cannot pick up one's own home flag or take a flag directly from a living carrier. Sink the carrier or intercept the dropped flag instead.

### Give: `interact: { type: "give", targetShipId }`

Transfer the carried enemy flag to a living, unprotected teammate within 36 WU and with a clear water segment between the ships. The receiver must have an empty slot. No receiver action is required. Self-transfer is invalid. Transfer cannot form a multi-hop chain within one decision; every interaction is checked against the pre-interaction possession snapshot. A transfer is never a capture and awards no default training reward.

### Set flag on land: `interact: { type: "place", flagSiteId }`

Place a carried enemy flag at a valid shoreline site within 30 WU. Sites are explicit map entities, not arbitrary `(x,y)` coordinates supplied by a policy. Reject sites with an existing flag, inaccessible approach, or illegal terrain. Home posts are reserved for their own flags and are not placement targets. Neutral shoreline sites supply the strategic land-placement mechanic without permitting unreachable flags deep inside an island. Placing a flag does not score.

### Drop: `interact: { type: "drop" }`

Dropping a carried enemy flag, including on carrier death, relocates it to the closest unoccupied neutral shoreline site by distance from the carrier, then by stable site ID. Both home posts are reserved and are never eligible, so a drop cannot place the enemy flag on either player's base. The flag becomes `on-land` and is reachable from the site's water approach. If a custom map has no eligible neutral site, fall back to a valid water drop at the carrier's position. A floating flag has no blocking collider and cannot damage ships.

### Deliver/capture: automatic

When a living, unprotected carrier enters its own base's water delivery zone, and its own flag is `at-home`, score one capture. The carried enemy flag returns to its owner's home post immediately. Clear the carrier slot. Do not reset other ships, health, or positions. Emit exactly one capture event. If the home flag is absent, the carrier must wait or help recover it; there is no score simply for placing a flag near home.

### Automatic return

A loose flag in water or on land returns home after 30 simulation seconds without a new pickup/placement. A flag being carried does not auto-return. Transfers do not create extra flags. Timers are integer ticks and never depend on animation completion or wall time.

### Contention

Two ships requesting the same loose flag are competing for one atomic resource. Determine legality from the same snapshot; award by smallest interaction distance, then a deterministic seeded tie-break independent of array/team order. A return of the owner's flag can enable a delivery later in the same tick because return/transfer resolution precedes capture evaluation. Log tie-break outcomes for tests.

## 5. Death, respawn, and outcome

Health <= 0 produces death once. Immediately remove the ship from movement, collisions, sensing, firing, and interactions. Drop its flag, clear held controls and pending per-ship interactions, and emit `ShipSunk`. The sinking animation lasts about 0.9 s but has no gameplay authority.

Respawn after `respawnDelayTicks = 900` (15 s by default). Restore full health, zero velocity, original heading, no flag, zero cannon cooldown, and the original spawn slot. If occupied, search a fixed set of validated offsets around that slot; if none is free, retry next tick rather than overlap or teleport to an unrelated area. Spawn protection lasts 60 ticks: allow movement, suppress incoming damage, firing, and flag interactions/capture. A visible shield communicates this state. Its duration is configurable and must be included in observations where visible.

The agent runtime persists through its own ships' deaths. It is reset only at match start or after a runtime failure under the documented timeout rules. Dead ships receive neutral actions and cannot carry over stale commands into their respawn.

Default match limit: 180 simulation seconds, configurable from 15 through 300 seconds in New Game and League. The first team to deliver one enemy flag wins. Evaluate score conditions after all captures in a tick. Simultaneous threshold crossings with equal scores are a draw. At the time limit, higher capture score wins; if captures are tied, the team with more enemy ships sunk wins; equal captures and sinks draw. Damage remains a diagnostic and is never a hidden tiebreaker. Infrastructure cancellation is not a draw. Agent-forfeit rules are in [06](06_TIMING_DETERMINISM_AND_REPLAYS.md).

## 6. Tick order and invariants

At a tick boundary:

1. Activate a committed action batch if this is a decision boundary; collect one-shot interaction intents.
2. Process due respawns/protection expiries and cannon cooldown readiness using integer ticks.
3. Integrate all living ships and resolve contacts; spawn permitted shots from the firing phase.
4. Sweep all projectiles; accumulate simultaneous damage; resolve deaths and death drops.
5. Resolve valid interactions of surviving ships atomically, then automatic returns and deliveries. One flag has at most one explicit interaction transition in this phase; delivery may follow a valid transition.
6. Evaluate terminal conditions; emit ordered events, rewards, and observations/snapshots as appropriate.

The exact order must be implemented once and covered by tests. Do not scatter it across UI callbacks.

Required invariants: health is bounded; no living ship overlaps solid land beyond tolerance; each flag has exactly one location/carrier; carrier references are bidirectionally consistent; dead ships cannot carry/sense/shoot; scores only change on capture; all timers advance with ticks; out-of-range or impossible interactions are no-ops with diagnostics; changing graphics or audio cannot change the outcome.
