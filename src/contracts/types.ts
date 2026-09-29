export const API_VERSION = "fleetrl-agent-v1" as const;
export const CONFIG_VERSION = "fleetrl-config-v1" as const;
export const RULES_VERSION = "fleetrl-rules-v6" as const;
export const ENGINE_VERSION = "fleetrl-engine-ts-v6" as const;

export type TeamId = "blue" | "rose";
export type GameMode = "duel" | "fleet" | "fog-duel" | "fog-fleet";
export type Point = { x: number; y: number };
export type Circle = { center: Point; radius: number };
export type Interaction =
  | { type: "none" }
  | { type: "pickup"; flagId: string }
  | { type: "give"; targetShipId: string }
  | { type: "place"; flagSiteId: string }
  | { type: "drop" };
export type ShipAction = { shipId: string; throttle: number; turn: number; fire: boolean; fireTargetShipId?: string | null; scuttle?: boolean; interact: Interaction };
export type TeamAction = { actions: ShipAction[] };

export interface ShipView {
  id: string;
  teamId: TeamId;
  position: Point;
  velocity: Point;
  heading: number;
  health: number;
  alive: boolean;
  cooldownTicks: number;
  respawnTicksRemaining: number;
  protectionTicksRemaining: number;
  carriedFlagId: string | null;
}

export interface FlagView {
  id: string;
  ownerTeamId: TeamId;
  known: boolean;
  state: "at-home" | "carried" | "on-land" | "in-water" | "unknown";
  position: Point | null;
  carrierShipId: string | null;
}

export interface ProjectileView { id: string; position: Point; direction: Point; ownerTeamId: TeamId; remainingRange: number; }
export interface BaseView { teamId: TeamId; homePost: Point; deliveryZone: Circle; approach: Point; }
export interface IslandView { id: string; polygon: [number, number][]; }
export interface FlagSiteView { id: string; position: Point; approach: Point; radius: number; reservedHome: boolean; }
export interface SensorView { shipId: string; position: Point; radius: number; }
export interface KnownLegalActions { canFire: boolean; fireTargetShipIds: string[]; pickupFlagIds: string[]; giveTargetShipIds: string[]; placementSiteIds: string[]; canDrop: boolean; canScuttle: boolean; }
export interface ObservableEvent { id: string; tick: number; type: string; shipId?: string; otherShipId?: string; teamId?: TeamId; flagId?: string; projectileId?: string; position?: Point; detail?: string; points?: number; }
export interface PublicRulesView {
  physicsHz: number;
  decisionIntervalTicks: number;
  shipRadius: number;
  maxSpeed: number;
  flagCarrierSpeedMultiplier: number;
  maxHealth: number;
  cooldownTicks: number;
  respawnDelayTicks: number;
  scuttleRespawnTicks: number;
  spawnProtectionTicks: number;
  projectileRange: number;
  projectileSpeed: number;
  projectileDamage: number;
  minDamageMultiplier: number;
  maxDamageMultiplier: number;
  closeRangeFraction: number;
  impactDamagePerSpeed: number;
  pickupRadius: number;
  placeRadius: number;
  giveRadius: number;
  sensorRadius: number;
  matchDurationTicks: number;
  scoreNormalizationTarget: number;
  scorePoints: { kill: number; pickup: number; delivery: number };
  obstacleRayRange: number;
}
export interface Observation {
  apiVersion: typeof API_VERSION;
  mode: GameMode;
  teamId: TeamId;
  decisionId: number;
  observedAtTick: number;
  actionAppliesAtTick: number;
  simulationTimeS: number;
  remainingTimeS: number;
  world: { width: number; height: number };
  score: Record<TeamId, number>;
  kills: Record<TeamId, number>;
  ships: ShipView[];
  enemies: ShipView[];
  flags: FlagView[];
  projectiles: ProjectileView[];
  bases: BaseView[];
  islands: IslandView[];
  flagSites: FlagSiteView[];
  sensors: SensorView[];
  heldActions: TeamAction;
  publicRules: PublicRulesView;
  legal: Record<string, KnownLegalActions>;
  events: ObservableEvent[];
}

export interface FleetRLConfig {
  schemaVersion: typeof CONFIG_VERSION;
  rulesVersion: typeof RULES_VERSION;
  mode: GameMode;
  mapId: string;
  shipsPerTeam: number;
  world: { width: number; height: number };
  timing: { physicsHz: number; renderFpsTarget: number; decisionIntervalTicks: number; decisionBudgetMs: number; actionLatencyWindows: number };
  ship: { radius: number; maxHealth: number; acceleration: number; maxSpeed: number; flagCarrierSpeedMultiplier: number; dragPerSecond: number; maxTurnRate: number; respawnDelayTicks: number; scuttleRespawnTicks: number; spawnProtectionTicks: number };
  combat: { projectileSpeed: number; projectileRadius: number; projectileRange: number; damage: number; minDamageMultiplier: number; maxDamageMultiplier: number; closeRangeFraction: number; impactDamagePerSpeed: number; cooldownTicks: number; friendlyFire: boolean; rammingDamage: boolean; friendlyShipsBlockShots: boolean };
  flags: { pickupRadius: number; placeRadius: number; giveRadius: number; looseReturnTicks: number; requireOwnFlagHome: boolean };
  match: { durationTicks: number; scoreNormalizationTarget: number; points: { kill: number; pickup: number; delivery: number } };
  vision: { sensorRadius: number; islandsOcclude: boolean; fleetSharing: "team-union"; staticMapKnown: boolean };
  features: { encoder: "ship-64-v1"; width: 64; obstacleRayRange: number };
  actions: { decoder: "discrete-22-v1"; discreteCount: 22 };
  runtime: Record<string, number>;
  import: Record<string, number>;
  tournament: { seedCount: number; mirrorSides: boolean; concurrency: number; informalEntriesPerStudent: number; points: { win: number; draw: number; loss: number; doubleForfeit: number } };
  replay: { keyframeEveryTicks: number; checksumEveryTicks: number; optionalSnapshotHz: number; retainClassroomReplays: boolean };
  audio: { masterGain: number; effectsGain: number; maxVoices: number; musicEnabled: boolean };
}

export interface MapDefinition {
  schemaVersion: "fleetrl-map-v1";
  id: string;
  world: { width: number; height: number };
  islands: { id: string; polygon: [number, number][] }[];
  bases: { teamId: TeamId; homeFlagSiteId: string; homePost: Point; approach: Point; deliveryZone: Circle; spawnSlots: { x: number; y: number; heading: number }[] }[];
  flagSites: { id: string; position: Point; approach: Point; radius: number; reservedHome: boolean }[];
  metadata?: Record<string, unknown>;
}

export interface AgentManifest {
  packageVersion: "fleetrl-package-v1";
  name: string;
  apiVersion: typeof API_VERSION;
  controlScope: "team";
  entry: string;
  models: ModelDescriptor[];
  supportedModes: GameMode[];
}

export interface ModelDescriptor {
  id: string;
  format: "tfjs-layers" | "dense-json-v1";
  modelPath?: string;
  inputWidth: number;
  outputWidth: number;
  maxBatch: number;
  featureEncoder: "ship-64-v1";
  actionDecoder: "discrete-22-v1";
}
