# 05. Observation, action, and model contract

Status: normative public interface, `fleetrl-agent-v1`. Use this document to implement TypeScript types, runtime schemas, docs, examples, and tests together. Do not silently change units, array order, or feature meanings.

## Contents

1. Team-policy contract
2. Observation and fog rules
3. Action validation
4. Feature encoder and discrete action adapter
5. Submission/model schemas
6. Reset, memory, and compatibility

## 1. Team-policy contract

A submitted agent controls ONE TEAM, even in Duel. The interface does not change to a single ship as the fleet grows.

```ts
type TeamId = "blue" | "rose";
type Interaction =
  | { type: "none" }
  | { type: "pickup"; flagId: string }
  | { type: "give"; targetShipId: string }
  | { type: "place"; flagSiteId: string }
  | { type: "drop" };
type ShipAction = {
  shipId: string;
  throttle: number; // finite, [-1,1]
  turn: number;     // finite, [-1,1], clockwise positive
  fire: boolean;
  fireTargetShipId?: string | null; // selected legal visible enemy; nearest legal target if omitted
  scuttle?: boolean; // one-shot self-sink; half normal respawn, no opponent kill/point
  interact: Interaction;
};
type TeamAction = { actions: ShipAction[] };
type AgentAPI = {
  random(): number; // seeded [0,1), never wall-clock seeded
  log(message: string): void; // bounded, optional UI diagnostics
  predict(modelId: string, rows: number[][]): Promise<number[][]>;
  encodeShipV1(shipId: string): number[]; // current filtered snapshot only
  decodeDiscreteV1(shipId: string, actionId: number): ShipAction;
};
// Required; may return directly or resolve a guest Promise:
// act(observation, api) -> TeamAction | Promise<TeamAction>
// Optional: reset({teamId, shipIds, episodeId, agentSeed, config}) -> void
```

`config` in reset is a public rules subset, not engine internals. `episodeId` is an opaque match-local identifier. `agentSeed` is independent of the private simulation RNG seed. Guest state persists across decisions, is reset between matches, and is reset with a visible diagnostic after a killed worker. Treat no runtime persistence as guaranteed across failures.

A beginner can return neutral actions for every living ship. Rule policies, state machines, Q-tables, and neural policies all implement the same interface. A state machine is an example policy, not an environment requirement.

## 2. Observation

All times are simulation ticks/seconds. All coordinates and speeds are in WU/WU per second. Lists have stable, documented sorting by ID unless a helper explicitly selects nearest objects. No policy receives live references into the world.

```ts
type Point = { x: number; y: number };
type ShipView = {
  id: string; teamId: TeamId; position: Point; velocity: Point;
  heading: number; health: number; alive: boolean;
  cooldownTicks: number; respawnTicksRemaining: number;
  protectionTicksRemaining: number; carriedFlagId: string | null;
};
type FlagView = {
  id: string; ownerTeamId: TeamId;
  known: boolean;
  state: "at-home" | "carried" | "on-land" | "in-water" | "unknown";
  position: Point | null;
  carrierShipId: string | null;
};
type Observation = {
  apiVersion: "fleetrl-agent-v1";
  mode: "duel" | "fleet" | "fog-duel" | "fog-fleet";
  teamId: TeamId;
  decisionId: number;
  observedAtTick: number;
  actionAppliesAtTick: number; // normally observedAtTick + 6
  simulationTimeS: number;
  remainingTimeS: number;
  world: { width: number; height: number };
  score: { blue: number; rose: number };
  kills: { blue: number; rose: number }; // public credited enemy-sink count; one score point each
  ships: ShipView[];          // ALL own ships, including respawning ships
  enemies: ShipView[];        // filtered; full mode includes respawn state
  flags: FlagView[];          // exactly two; unknown fields are null
  projectiles: ProjectileView[]; // position, direction, ownerTeamId, remainingRange
  bases: BaseView[];          // public post, water delivery zone, approach
  islands: IslandView[];      // known complete collision polygons
  flagSites: FlagSiteView[];  // known land position and water approach
  sensors: SensorView[];      // own living ship ID, position, radius
  heldActions: TeamAction; // own controls already committed for the current interval
  publicRules: PublicRulesView; // normalization constants and public gameplay rules
  legal: Record<string, KnownLegalActions>;
  events: ObservableEvent[];  // filtered events since preceding observation
};
```

`PublicRulesView` includes configured world/ship/combat/flag/vision/match constants needed to interpret units, cooldowns, masks, and feature normalization, including `impactDamagePerSpeed`. It excludes private RNG state, hidden entity data, runtime secrets, and opponent code. `heldActions` contains only the observing team's committed controls/interaction intents; it makes the one-window pipeline inspectable. The helper methods use the exact same filtered snapshot supplied for that decision, reject non-owned ship IDs, and cannot query authoritative hidden state.

Implement the referenced view types with only the specified public geometry and fields; no arbitrary engine object spread. `BaseView` exposes team ID, land post, delivery-zone center/radius, and water approach. `FlagSiteView` exposes ID, land point, water approach, radius, and reserved-home status. `KnownLegalActions` contains `canFire`, `fireTargetShipIds`, known legal pickup flag IDs, give-target ship IDs, placement-site IDs, `canDrop`, and `canScuttle`. A fire target is listed only when it is alive, visible to the team, within projectile range of that ship, and has an unobstructed direct line through known terrain. Lists must be computed from the observation's knowledge plus own state, not unseen dynamic state. Validation at execution can still fail as the world changes during the one-window latency.

### Full observation

Expose all dynamic ships (including enemy respawn/protection/cooldown), flags, projectiles, and public rules. Internal RNG state and opponent policy memory/parameters are not game-state fields. Calling this mode full observation refers to physical game state; it does not mean the learner sees an opponent's private recurrent state or that learning opponents make a stationary single-agent MDP.

### Fog observation

A dynamic entity is visible when its center is within at least one living friendly ship's sensor radius and the sensor-to-entity segment is not occluded by island interior. Define boundary epsilon consistently. Sensors do not sweep through land. For shoreline flag posts, use the site's water approach visibility plus interaction geometry so a flag remains observable from its valid approach.

`vision.staticMapKnown` defines terrain knowledge. Its default is `true`: every observation includes every island's exact collision polygon and every static flag site, including in fog modes. When it is `false`, an island stays hidden until any friendly living ship's sensor circle touches any part of its polygon. That contact reveals the island's complete polygon—not only the intersecting coast—and remembers it for that team for the rest of the match. A neutral flag site is revealed with the island that contains it; both home sites remain public. This discovery state is team-specific, deterministic, and part of the recorded world state. Obstacle rays and built-in navigation use only the terrain present in that team's filtered observation.

Default `fog-fleet` is centralized team control with shared visibility: the union of all friendly sensor regions. All own ships' telemetry is known, even if separated. This is still partially observable but is NOT decentralized execution. An optional future per-ship mode must use separate runtimes and explicit communication, not reuse this union silently.

Hidden enemies are omitted, not returned with `visible: false` and real coordinates. Hidden flags remain `known: false`, `state: "unknown"`, `position: null`, and `carrierShipId: null`. Carried flags on one's own ships are known. Score changes/time are public; off-screen enemy death, shot, pickup, and location are not automatically public. Own damage/death information may be reported because it is directly experienced, but omit an unseen attacker's position/ID.

Do not provide automatic last-known updates from hidden truth. Students may keep their own memories. A UI memory overlay may show a stale marker with the last genuinely observed tick, never extrapolated truth disguised as knowledge. Entity ordering, list lengths beyond visible content, feature masks, logs, sounds, particle trails, and timers must not reveal hidden locations or hidden transitions.

Policy observations must not include training-only reward decomposition, tournament statistics about the opponent, or omniscient replay data. A trainer can receive a separate privileged reward record under a declared training configuration; the evaluated policy cannot.

## 3. Action semantics and validation

Each decision supplies up to one action for each own ship. Missing ships receive neutral. Unknown IDs, duplicate IDs, wrong types, NaN/infinity, oversized arrays, and throttle/turn outside [-1,1] are validation errors; neutralize the affected ship rather than silently guessing. Reject an invalid envelope as a failed decision. Log invalid attempts separately from legal-but-unsuccessful interactions.

An action is checked twice: schema/ownership at intake and physical legality at activation. A valid pickup attempt may become a no-op if another ship moved the flag in the intervening 100 ms. Such a no-op is not a parser error or automatic forfeit.

Throttle/turn/fire/target are held for the next six physics ticks. An `interact` command and optional `scuttle` are consumed once at activation, not retried every tick. A living ship may scuttle even while protected or carrying a flag; its flag is dropped normally, no opponent receives kill credit, and its respawn delay is halved. Cooldowns govern held fire. A legal target is selected independently of ship heading and launched with deterministic constant-velocity lead; the projectile does not home after launch. When `fire` is true and `fireTargetShipId` is omitted, the platform selects the nearest legal visible enemy. Dead/protected ships have the restrictions in [01](01_GAME_LOGIC.md). The safe action is `{throttle:0, turn:0, fire:false, fireTargetShipId:null, scuttle:false, interact:{type:"none"}}` with the correct ship ID.

## 4. Built-in feature and discrete-action adapters

Implement `encodeShipV1(observation, shipId)` -> exactly 64 finite float32 values. This is a convenience adapter for small models, not a replacement for the rich observation object. Always encode from the filtered object. Use width W, height H, diagonal D, maxSpeed V, maxHealth HP, maxCooldown C, configured respawn/protection durations, and score normalization target G = 25. Clamp ratios to documented ranges and use a denominator of at least 1 for disabled timers. Normalized positions are [0,1]; relative coordinates/velocities are [-1,1].

| Indices | Values in exact order |
|---|---|
| 0-11 | x/W, y/H, vx/V, vy/V, sin(heading), cos(heading), health/HP, cooldown/C, carryingEnemyFlag, alive, remainingRespawn/configuredRespawn, remainingProtection/configuredProtection |
| 12-19 | homeDelivery dx/W, homeDelivery dy/H, enemyApproach dx/W, enemyApproach dy/H, homeDelivery distance/D, enemyApproach distance/D, remainingTime/matchLimit, (ownScore-enemyScore)/G |
| 20-27 | enemyFlagKnown, enemyFlag dx/W, enemyFlag dy/H, enemyFlagCarriedByOwnTeam, enemyFlagAtHome, ownFlagKnown, ownFlag dx/W, ownFlag dy/H |
| 28-39 | nearestVisibleEnemyPresent, dx/W, dy/H, vx/V, vy/V, sin(heading), cos(heading), health/HP, carriesOwnFlag, distance/D, sin(relativeBearing), cos(relativeBearing) |
| 40-47 | nearestLivingTeammatePresent, dx/W, dy/H, health/HP, carriesEnemyFlag, distance/D, sin(heading), cos(heading) |
| 48-55 | 8 land/boundary clearance rays at ship-relative angles k*pi/4, k=0..7; distance/maxRayRange |
| 56-63 | teamIsBlue, fullObservation, ownFleetSize/8, ownScore/G, enemyScore/G, ownFlagKnownAtHome, anyKnownLegalPickup, anyKnownLegalGive |

Relative positions/bearings are from the controlled ship. Nearest selection uses distance then ID. For no visible enemy/teammate, zero the entire corresponding block, including its mask. Unknown flag coordinates/associated state bits are zeroed; static home geometry remains in the navigation block. Rays consider known static terrain/boundary inflated by ship radius, not unseen ships; 1 means clear up to `maxRayRange = 180 WU`. A dead own ship uses its actual own known state and mask; its action is neutralized. Do not mix pixel camera coordinates into features.

Implement `discrete-22-v1` for Q-learning/DQN:

- IDs 0-17: `fireIndex = floor(id/9)`; `m = id % 9`; throttle = `floor(m/3)-1`; turn = `(m%3)-1`; when firing, target the nearest known legal enemy by distance then ID; interaction none.
- ID 18: neutral motion plus pickup of nearest known legal flag.
- ID 19: neutral motion plus give to nearest known legal teammate.
- ID 20: neutral motion plus place at nearest known legal neutral shoreline site.
- ID 21: contextual neutral special—drop if carrying a flag; otherwise scuttle when alive.

Choose nearest using actual distance then ID, not original array order. Missing special-action candidates produce neutral actions. ID 4 is neutral/coast; ID 7 is forward/straight without firing. Restrict this adapter intentionally; raw agents retain continuous controls and explicit target IDs. Mask firing when protected/dead/on cooldown or when no visible legal target exists. During Q target computation, apply the same legality conventions consistently.

For one shared fleet network, stack one 64-value row per living own ship in ID order and return one 22-value row per ship. Select argmax with smallest-index ties for evaluation. A stochastic policy uses the seeded agent RNG. A fleet action cannot be represented by one accidentally shared scalar action unless that is explicitly the student's policy.

## 5. Package and neural model schemas

A script package manifest:

```json
{
  "packageVersion": "fleetrl-package-v1",
  "name": "Harbor Starter",
  "apiVersion": "fleetrl-agent-v1",
  "controlScope": "team",
  "entry": "agent.js",
  "models": [],
  "supportedModes": ["duel", "fleet", "fog-duel", "fog-fleet"]
}
```

For TF.js add a model descriptor such as:

```json
{
  "id": "policy",
  "format": "tfjs-layers",
  "modelPath": "model/model.json",
  "inputWidth": 64,
  "outputWidth": 22,
  "maxBatch": 8,
  "featureEncoder": "ship-64-v1",
  "actionDecoder": "discrete-22-v1"
}
```

The ZIP contains `manifest.json`, `agent.js`, `model/model.json`, and every weight shard referenced by that JSON. The platform infers and validates shard paths from the local model manifest, not a guessed single `weights.bin`. The file names may differ; format/shape validation is authoritative. `supportedModes` is a compatibility declaration to test, not proof of policy competence.

Text-only `.agent.json` combines a declarative controller and dense model:

```text
packageVersion: fleetrl-package-v1
name: descriptive student label
apiVersion: fleetrl-agent-v1
controlScope: team
controller: shared-dense-argmax-v1
featureEncoder: ship-64-v1
actionDecoder: discrete-22-v1
model:
  format: dense-json-v1
  inputWidth: 64
  outputWidth: 22
  layers:
    - inputWidth, outputWidth, activation
      weights: flat row-major float array of outputWidth*inputWidth
      bias: float array of outputWidth
```

For each dense layer, `y[j] = activation(bias[j] + sum_i(weights[j*inputWidth+i]*x[i]))`. Adjacent layer dimensions must match. Every number must be finite. Casting to float32 must remain finite. Argmax output is interpreted as scores/Q-values, not necessarily probabilities. The included constant-forward JSON is intentionally untrained and demonstrates this exact format.

A `shared-dense-argmax-v1` controller needs no JavaScript source: host-owned encoding, validated forward pass, deterministic argmax, and decoding supply the policy. Exporting a DQN to this route requires an actual supported Dense network; reject unsupported topology rather than dropping layers. A metadata label such as `algorithm: "DQN"` never proves training occurred.

## 6. Compatibility, memory, and debug

A package can include documented source/model metadata but no executable dependencies. Version the observation, feature encoder, action decoder, rules, and model format independently. Reject incompatible versions with a migration explanation. Shape agreement alone is insufficient: 64 features in the wrong order is a different encoder.

Provide `reset` examples and a recurrent-memory extension point; do not imply an ordinary feed-forward DQN automatically remembers fog history. For later recurrent models require explicit named hidden-state input/output, bounds, reset behavior, and backend support. Keep this disabled until implemented/tested.

Optional policy debug values (Q-values, chosen discrete IDs, finite state names) are bounded, non-authoritative telemetry. Never invent attention/value plots when the agent does not expose them. Full diagnostic logs are not inputs to the opponent. The Inspector must show `observedAtTick`, `actionAppliesAtTick`, raw/validated action, latency, and fallback status.
