import type { FleetRLConfig, Interaction, MapDefinition, Point, ShipAction, TeamId } from "../contracts/types";

export interface ShipState {
  id: string;
  teamId: TeamId;
  spawnPosition: Point;
  spawnHeading: number;
  position: Point;
  velocity: Point;
  heading: number;
  radius: number;
  health: number;
  alive: boolean;
  respawnAtTick: number | null;
  protectionUntilTick: number;
  cooldownTicks: number;
  carriedFlagId: string | null;
  heldAction: ShipAction;
}

export type FlagStateKind = "at-home" | "carried" | "on-land" | "in-water";
export interface FlagState {
  id: string;
  ownerTeamId: TeamId;
  state: FlagStateKind;
  position: Point | null;
  carrierShipId: string | null;
  siteId: string | null;
  changedAtTick: number;
  pickupScored: boolean;
}

export interface ProjectileState {
  id: string;
  ownerTeamId: TeamId;
  ownerShipId: string;
  position: Point;
  previousPosition: Point;
  direction: Point;
  targetShipId: string;
  radius: number;
  damage: number;
  distanceTraveled: number;
  remainingRange: number;
  spawnedAtTick: number;
}

export type WorldEvent = {
  id: string;
  tick: number;
  type: string;
  shipId?: string;
  otherShipId?: string;
  teamId?: TeamId;
  flagId?: string;
  projectileId?: string;
  position?: Point;
  detail?: string;
  damage?: number;
  otherDamage?: number;
  impactSpeed?: number;
  otherImpactSpeed?: number;
  shotDistance?: number;
  closeRange?: boolean;
  points?: number;
};

export interface MatchOutcome {
  kind: "win" | "draw" | "forfeit" | "double-forfeit";
  winner: TeamId | null;
  reason: "time-limit" | "forfeit";
  endedAtTick: number;
}

export interface WorldState {
  engineVersion: "fleetrl-engine-ts-v6";
  tick: number;
  seed: number;
  tieBreakRngState: number;
  nextEntitySequence: number;
  config: FleetRLConfig;
  map: MapDefinition;
  ships: ShipState[];
  flags: FlagState[];
  projectiles: ProjectileState[];
  scores: Record<TeamId, number>;
  kills: Record<TeamId, number>;
  discoveredIslandIds: Record<TeamId, string[]>;
  events: WorldEvent[];
  outcome: MatchOutcome | null;
}

export interface StepControls {
  blue: ShipAction[];
  rose: ShipAction[];
}

export interface InteractionIntent {
  shipId: string;
  interaction: Interaction;
}
