import type { FlagView, KnownLegalActions, ObservableEvent, Observation, Point, ShipView, TeamAction, TeamId } from "../contracts/types";
import { API_VERSION } from "../contracts/types";
import { neutralAction } from "../contracts/validation";
import { circleOverlapsPolygon, distance, segmentOccluded } from "./geometry";
import type { FlagState, ShipState, WorldEvent, WorldState } from "./types";

const sortId = <T extends { id: string }>(items: T[]): T[] => items.sort((a, b) => a.id.localeCompare(b.id));
const fogMode = (state: WorldState): boolean => state.config.mode === "fog-duel" || state.config.mode === "fog-fleet";

function toShipView(state: WorldState, ship: ShipState): ShipView {
  return {
    id: ship.id,
    teamId: ship.teamId,
    position: { ...ship.position },
    velocity: { ...ship.velocity },
    heading: ship.heading,
    health: ship.health,
    alive: ship.alive,
    cooldownTicks: ship.cooldownTicks,
    respawnTicksRemaining: ship.respawnAtTick === null ? 0 : Math.max(0, ship.respawnAtTick - state.tick),
    protectionTicksRemaining: Math.max(0, ship.protectionUntilTick - state.tick),
    carriedFlagId: ship.carriedFlagId,
  };
}

function sensorsFor(state: WorldState, teamId: TeamId): { shipId: string; position: Point; radius: number }[] {
  return state.ships.filter(ship => ship.teamId === teamId && ship.alive).sort((a, b) => a.id.localeCompare(b.id)).map(ship => ({ shipId: ship.id, position: { ...ship.position }, radius: state.config.vision.sensorRadius }));
}

function pointVisible(state: WorldState, sensors: ReturnType<typeof sensorsFor>, point: Point): boolean {
  if (!fogMode(state)) return true;
  return sensors.some(sensor => distance(sensor.position, point) <= sensor.radius + 1e-9 && !segmentOccluded(sensor.position, point, state.map.islands));
}

function flagVisibilityPoint(state: WorldState, flag: FlagState): Point | null {
  if (flag.carrierShipId) return state.ships.find(ship => ship.id === flag.carrierShipId)?.position ?? null;
  if (flag.siteId) return state.map.flagSites.find(site => site.id === flag.siteId)?.approach ?? flag.position;
  return flag.position;
}

function toFlagView(state: WorldState, flag: FlagState, teamId: TeamId, sensors: ReturnType<typeof sensorsFor>): FlagView {
  const carrier = flag.carrierShipId ? state.ships.find(ship => ship.id === flag.carrierShipId) : null;
  const knownThroughOwnCarrier = carrier?.teamId === teamId;
  const visibilityPoint = flagVisibilityPoint(state, flag);
  const known = !fogMode(state) || knownThroughOwnCarrier || (visibilityPoint !== null && pointVisible(state, sensors, visibilityPoint));
  if (!known) return { id: flag.id, ownerTeamId: flag.ownerTeamId, known: false, state: "unknown", position: null, carrierShipId: null };
  return { id: flag.id, ownerTeamId: flag.ownerTeamId, known: true, state: flag.state, position: flag.state === "carried" ? (carrier ? { ...carrier.position } : null) : flag.position ? { ...flag.position } : null, carrierShipId: flag.carrierShipId };
}

function filteredEvents(state: WorldState, teamId: TeamId, sensors: ReturnType<typeof sensorsFor>, source: readonly WorldEvent[]): ObservableEvent[] {
  const ownIds = new Set(state.ships.filter(ship => ship.teamId === teamId).map(ship => ship.id));
  const publicTypes = new Set(["FlagCaptured", "MatchEnded"]);
  const records: ObservableEvent[] = [];
  for (const item of source) {
    const ownExperience = (item.shipId ? ownIds.has(item.shipId) : false) || (item.otherShipId ? ownIds.has(item.otherShipId) : false);
    const visible = !fogMode(state) || publicTypes.has(item.type) || ownExperience || (item.position ? pointVisible(state, sensors, item.position) : false);
    if (!visible) continue;
    const sanitized: ObservableEvent = { id: item.id, tick: item.tick, type: item.type };
    if (item.teamId) sanitized.teamId = item.teamId;
    if (item.flagId) sanitized.flagId = item.flagId;
    if (item.projectileId && (publicTypes.has(item.type) || (item.position ? pointVisible(state, sensors, item.position) : false))) sanitized.projectileId = item.projectileId;
    if (item.position && (publicTypes.has(item.type) || pointVisible(state, sensors, item.position))) sanitized.position = { ...item.position };
    if (item.shipId && (ownIds.has(item.shipId) || !fogMode(state) || (item.position ? pointVisible(state, sensors, item.position) : false))) sanitized.shipId = item.shipId;
    if (item.otherShipId && (ownIds.has(item.otherShipId) || !fogMode(state) || (item.position ? pointVisible(state, sensors, item.position) : false))) sanitized.otherShipId = item.otherShipId;
    if (item.detail && (ownExperience || publicTypes.has(item.type))) sanitized.detail = item.detail;
    records.push(sanitized);
  }
  return records;
}

function knownLegal(
  state: WorldState,
  ship: ShipState,
  visibleFlags: FlagView[],
  ownShips: ShipView[],
  visibleEnemies: ShipView[],
): KnownLegalActions {
  if (!ship.alive) return { canFire: false, fireTargetShipIds: [], pickupFlagIds: [], giveTargetShipIds: [], placementSiteIds: [], canDrop: false };
  const protectedNow = ship.protectionUntilTick > state.tick;
  const fireTargetShipIds = protectedNow || ship.cooldownTicks > 0 ? [] : visibleEnemies.filter(enemy => enemy.alive && distance(ship.position, enemy.position) <= state.config.combat.projectileRange + 1e-9 && !segmentOccluded(ship.position, enemy.position, state.map.islands)).map(enemy => enemy.id).sort();
  const pickupFlagIds = visibleFlags.filter(flag => {
    if (!flag.known || flag.state === "unknown" || flag.state === "carried" || (flag.ownerTeamId === ship.teamId && flag.state === "at-home") || ship.carriedFlagId) return false;
    const authoritative = state.flags.find(candidate => candidate.id === flag.id);
    const point = authoritative ? flagVisibilityPoint(state, authoritative) : flag.position;
    return point !== null && distance(ship.position, point) <= state.config.flags.pickupRadius + 1e-9;
  }).map(flag => flag.id).sort();
  const giveTargetShipIds = ship.carriedFlagId ? ownShips.filter(candidate => candidate.id !== ship.id && candidate.alive && !candidate.carriedFlagId && candidate.protectionTicksRemaining === 0 && distance(ship.position, candidate.position) <= state.config.flags.giveRadius && !segmentOccluded(ship.position, candidate.position, state.map.islands)).map(candidate => candidate.id).sort() : [];
  const knownOccupied = new Set(visibleFlags.filter(flag => flag.known && flag.state === "on-land").map(flag => state.flags.find(candidate => candidate.id === flag.id)?.siteId).filter((value): value is string => Boolean(value)));
  const placementSiteIds = ship.carriedFlagId ? state.map.flagSites.filter(site => !site.reservedHome && !knownOccupied.has(site.id) && distance(ship.position, site.approach) <= state.config.flags.placeRadius + 1e-9).map(site => site.id).sort() : [];
  return { canFire: fireTargetShipIds.length > 0, fireTargetShipIds, pickupFlagIds: protectedNow ? [] : pickupFlagIds, giveTargetShipIds: protectedNow ? [] : giveTargetShipIds, placementSiteIds: protectedNow ? [] : placementSiteIds, canDrop: !protectedNow && ship.carriedFlagId !== null };
}

export function buildObservation(
  state: WorldState,
  teamId: TeamId,
  decisionId: number,
  actionAppliesAtTick: number,
  sourceEvents: readonly WorldEvent[] = state.events,
): Observation {
  const sensors = sensorsFor(state, teamId);
  const knownIslandIds = new Set(state.discoveredIslandIds?.[teamId] ?? []);
  if (!fogMode(state) || state.config.vision.staticMapKnown) for (const island of state.map.islands) knownIslandIds.add(island.id);
  else for (const sensor of sensors) for (const island of state.map.islands) if (circleOverlapsPolygon(sensor.position, sensor.radius, island.polygon)) knownIslandIds.add(island.id);
  const knownIslands = state.map.islands.filter(island => knownIslandIds.has(island.id));
  const ownState = state.ships.filter(ship => ship.teamId === teamId).sort((a, b) => a.id.localeCompare(b.id));
  const ships = ownState.map(ship => toShipView(state, ship));
  const enemies = sortId(state.ships.filter(ship => ship.teamId !== teamId && (!fogMode(state) || (ship.alive && pointVisible(state, sensors, ship.position)))).map(ship => toShipView(state, ship)));
  const flags = sortId(state.flags.map(flag => toFlagView(state, flag, teamId, sensors)));
  const projectiles = sortId(state.projectiles.filter(projectile => !fogMode(state) || pointVisible(state, sensors, projectile.position)).map(projectile => ({ id: projectile.id, position: { ...projectile.position }, direction: { ...projectile.direction }, ownerTeamId: projectile.ownerTeamId, remainingRange: projectile.remainingRange })));
  const heldActions: TeamAction = { actions: ownState.map(ship => ({ ...ship.heldAction, interact: { ...ship.heldAction.interact } })) };
  const legal: Record<string, KnownLegalActions> = {};
  for (const ship of ownState) legal[ship.id] = knownLegal(state, ship, flags, ships, enemies);
  return {
    apiVersion: API_VERSION,
    mode: state.config.mode,
    teamId,
    decisionId,
    observedAtTick: state.tick,
    actionAppliesAtTick,
    simulationTimeS: state.tick / state.config.timing.physicsHz,
    remainingTimeS: Math.max(0, (state.config.match.durationTicks - state.tick) / state.config.timing.physicsHz),
    world: { ...state.config.world },
    score: { ...state.scores },
    kills: { ...state.kills },
    ships,
    enemies,
    flags,
    projectiles,
    bases: state.map.bases.map(base => ({ teamId: base.teamId, homePost: { ...base.homePost }, deliveryZone: { center: { ...base.deliveryZone.center }, radius: base.deliveryZone.radius }, approach: { ...base.approach } })).sort((a, b) => a.teamId.localeCompare(b.teamId)),
    islands: knownIslands.map(island => ({ id: island.id, polygon: island.polygon.map(([x, y]): [number, number] => [x, y]) })).sort((a, b) => a.id.localeCompare(b.id)),
    flagSites: state.map.flagSites.filter(site => site.reservedHome || knownIslands.some(island => circleOverlapsPolygon(site.position, 1e-6, island.polygon))).map(site => ({ id: site.id, position: { ...site.position }, approach: { ...site.approach }, radius: site.radius, reservedHome: site.reservedHome })).sort((a, b) => a.id.localeCompare(b.id)),
    sensors,
    heldActions,
    publicRules: {
      physicsHz: state.config.timing.physicsHz, decisionIntervalTicks: state.config.timing.decisionIntervalTicks,
      shipRadius: state.config.ship.radius, maxSpeed: state.config.ship.maxSpeed, maxHealth: state.config.ship.maxHealth,
      cooldownTicks: state.config.combat.cooldownTicks, respawnDelayTicks: state.config.ship.respawnDelayTicks,
      spawnProtectionTicks: state.config.ship.spawnProtectionTicks, projectileRange: state.config.combat.projectileRange,
      projectileSpeed: state.config.combat.projectileSpeed, projectileDamage: state.config.combat.damage,
      minDamageMultiplier: state.config.combat.minDamageMultiplier, maxDamageMultiplier: state.config.combat.maxDamageMultiplier,
      closeRangeFraction: state.config.combat.closeRangeFraction, impactDamagePerSpeed: state.config.combat.impactDamagePerSpeed,
      pickupRadius: state.config.flags.pickupRadius, placeRadius: state.config.flags.placeRadius, giveRadius: state.config.flags.giveRadius,
      sensorRadius: state.config.vision.sensorRadius, matchDurationTicks: state.config.match.durationTicks,
      captureTarget: state.config.match.captureTarget, obstacleRayRange: state.config.features.obstacleRayRange,
    },
    legal,
    events: filteredEvents(state, teamId, sensors, sourceEvents),
  };
}

export function neutralTeamAction(observation: Observation): TeamAction {
  return { actions: observation.ships.map(ship => neutralAction(ship.id)) };
}
