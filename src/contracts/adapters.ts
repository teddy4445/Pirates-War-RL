import type { FlagView, Observation, Point, ShipAction } from "./types";
import { neutralAction } from "./validation";
import { distance, sweepCircleAgainstMap, wrapHeading } from "../sim/geometry";
import type { MapDefinition } from "./types";

const clamp = (value: number, minimum = -1, maximum = 1): number => Math.max(minimum, Math.min(maximum, value));
const f32 = (value: number): number => Math.fround(Number.isFinite(value) ? value : 0);
const pointForFlag = (flag: FlagView): Point | null => flag.known ? flag.position : null;
const nearest = <T extends { id: string; position: Point }>(origin: Point, items: T[]): T | undefined => [...items].sort((a, b) => distance(origin, a.position) - distance(origin, b.position) || a.id.localeCompare(b.id))[0];

function relative(origin: Point, target: Point, width: number, height: number): [number, number] {
  return [clamp((target.x - origin.x) / width), clamp((target.y - origin.y) / height)];
}

export function encodeShipV1(observation: Observation, shipId: string): number[] {
  const ship = observation.ships.find(candidate => candidate.id === shipId);
  if (!ship) throw new Error(`encodeShipV1 rejected non-owned ship ${shipId}.`);
  const rules = observation.publicRules;
  const width = observation.world.width;
  const height = observation.world.height;
  const diagonal = Math.hypot(width, height);
  const home = observation.bases.find(base => base.teamId === observation.teamId);
  const enemyBase = observation.bases.find(base => base.teamId !== observation.teamId);
  if (!home || !enemyBase) throw new Error("Observation requires two public bases.");
  const homeRel = relative(ship.position, home.deliveryZone.center, width, height);
  const enemyRel = relative(ship.position, enemyBase.approach, width, height);
  const enemyFlag = observation.flags.find(flag => flag.ownerTeamId !== observation.teamId);
  const ownFlag = observation.flags.find(flag => flag.ownerTeamId === observation.teamId);
  const enemyPoint = enemyFlag ? pointForFlag(enemyFlag) : null;
  const ownPoint = ownFlag ? pointForFlag(ownFlag) : null;
  const nearestEnemy = nearest(ship.position, observation.enemies.filter(candidate => candidate.alive));
  const nearestMate = nearest(ship.position, observation.ships.filter(candidate => candidate.id !== ship.id && candidate.alive));
  const feature: number[] = [
    clamp(ship.position.x / width, 0, 1), clamp(ship.position.y / height, 0, 1), clamp(ship.velocity.x / rules.maxSpeed), clamp(ship.velocity.y / rules.maxSpeed),
    Math.sin(ship.heading), Math.cos(ship.heading), clamp(ship.health / rules.maxHealth, 0, 1), clamp(ship.cooldownTicks / Math.max(1, rules.cooldownTicks), 0, 1),
    ship.carriedFlagId ? 1 : 0, ship.alive ? 1 : 0, clamp(ship.respawnTicksRemaining / Math.max(1, rules.respawnDelayTicks), 0, 1), clamp(ship.protectionTicksRemaining / Math.max(1, rules.spawnProtectionTicks), 0, 1),
    homeRel[0] ?? 0, homeRel[1] ?? 0, enemyRel[0] ?? 0, enemyRel[1] ?? 0,
    clamp(distance(ship.position, home.deliveryZone.center) / diagonal, 0, 1), clamp(distance(ship.position, enemyBase.approach) / diagonal, 0, 1),
    clamp(observation.remainingTimeS / (rules.matchDurationTicks / rules.physicsHz), 0, 1), clamp((observation.score[observation.teamId] - observation.score[observation.teamId === "blue" ? "rose" : "blue"]) / Math.max(1, rules.captureTarget)),
  ];
  const enemyRelFlag = enemyPoint ? relative(ship.position, enemyPoint, width, height) : [0, 0];
  feature.push(enemyFlag?.known ? 1 : 0, enemyRelFlag[0] ?? 0, enemyRelFlag[1] ?? 0, enemyFlag?.state === "carried" && Boolean(enemyFlag.carrierShipId && observation.ships.some(candidate => candidate.id === enemyFlag.carrierShipId)) ? 1 : 0, enemyFlag?.state === "at-home" ? 1 : 0);
  const ownRelFlag = ownPoint ? relative(ship.position, ownPoint, width, height) : [0, 0];
  feature.push(ownFlag?.known ? 1 : 0, ownRelFlag[0] ?? 0, ownRelFlag[1] ?? 0);
  if (nearestEnemy) {
    const rel = relative(ship.position, nearestEnemy.position, width, height);
    const bearing = wrapHeading(Math.atan2(nearestEnemy.position.y - ship.position.y, nearestEnemy.position.x - ship.position.x) - ship.heading);
    feature.push(1, rel[0] ?? 0, rel[1] ?? 0, clamp(nearestEnemy.velocity.x / rules.maxSpeed), clamp(nearestEnemy.velocity.y / rules.maxSpeed), Math.sin(nearestEnemy.heading), Math.cos(nearestEnemy.heading), clamp(nearestEnemy.health / rules.maxHealth, 0, 1), nearestEnemy.carriedFlagId === ownFlag?.id ? 1 : 0, clamp(distance(ship.position, nearestEnemy.position) / diagonal, 0, 1), Math.sin(bearing), Math.cos(bearing));
  } else feature.push(...Array<number>(12).fill(0));
  if (nearestMate) {
    const rel = relative(ship.position, nearestMate.position, width, height);
    feature.push(1, rel[0] ?? 0, rel[1] ?? 0, clamp(nearestMate.health / rules.maxHealth, 0, 1), nearestMate.carriedFlagId === enemyFlag?.id ? 1 : 0, clamp(distance(ship.position, nearestMate.position) / diagonal, 0, 1), Math.sin(nearestMate.heading), Math.cos(nearestMate.heading));
  } else feature.push(...Array<number>(8).fill(0));
  const map: MapDefinition = { schemaVersion: "fleetrl-map-v1", id: "observation-static-map", world: { ...observation.world }, islands: observation.islands.map(island => ({ id: island.id, polygon: island.polygon })), bases: [], flagSites: [] };
  for (let ray = 0; ray < 8; ray += 1) {
    const angle = ship.heading + ray * Math.PI / 4;
    const end = { x: ship.position.x + Math.cos(angle) * rules.obstacleRayRange, y: ship.position.y + Math.sin(angle) * rules.obstacleRayRange };
    const result = sweepCircleAgainstMap(ship.position, end, rules.shipRadius, map);
    feature.push(clamp(result.time, 0, 1));
  }
  const legal = observation.legal[ship.id];
  feature.push(observation.teamId === "blue" ? 1 : 0, observation.mode === "duel" || observation.mode === "fleet" ? 1 : 0, clamp(observation.ships.length / 8, 0, 1), clamp(observation.score[observation.teamId] / Math.max(1, rules.captureTarget), 0, 1), clamp(observation.score[observation.teamId === "blue" ? "rose" : "blue"] / Math.max(1, rules.captureTarget), 0, 1), ownFlag?.known && ownFlag.state === "at-home" ? 1 : 0, legal?.pickupFlagIds.length ? 1 : 0, legal?.giveTargetShipIds.length ? 1 : 0);
  if (feature.length !== 64) throw new Error(`ship-64-v1 produced ${feature.length} values.`);
  return feature.map(f32);
}

export function decodeDiscreteV1(observation: Observation, shipId: string, actionId: number): ShipAction {
  const ship = observation.ships.find(candidate => candidate.id === shipId);
  if (!ship) throw new Error(`decodeDiscreteV1 rejected non-owned ship ${shipId}.`);
  if (!Number.isInteger(actionId) || actionId < 0 || actionId > 21) throw new Error("discrete-22-v1 actionId must be an integer from 0 to 21.");
  const legal = observation.legal[shipId];
  if (actionId <= 17) {
    const fireIndex = Math.floor(actionId / 9);
    const motion = actionId % 9;
    const targets = observation.enemies.filter(enemy => legal?.fireTargetShipIds.includes(enemy.id));
    const target = nearest(ship.position, targets);
    return { shipId, throttle: Math.floor(motion / 3) - 1, turn: motion % 3 - 1, fire: Boolean(fireIndex && target), fireTargetShipId: fireIndex ? target?.id ?? null : null, interact: { type: "none" } };
  }
  const result = neutralAction(shipId);
  if (!legal) return result;
  if (actionId === 18 && legal.pickupFlagIds.length) {
    const choices = legal.pickupFlagIds.map(id => observation.flags.find(flag => flag.id === id)).filter((flag): flag is FlagView => Boolean(flag?.position));
    const target = nearest(ship.position, choices as (FlagView & { position: Point })[]);
    if (target) result.interact = { type: "pickup", flagId: target.id };
  } else if (actionId === 19 && legal.giveTargetShipIds.length) {
    const choices = observation.ships.filter(candidate => legal.giveTargetShipIds.includes(candidate.id));
    const target = nearest(ship.position, choices);
    if (target) result.interact = { type: "give", targetShipId: target.id };
  } else if (actionId === 20 && legal.placementSiteIds.length) {
    const choices = observation.flagSites.filter(site => legal.placementSiteIds.includes(site.id)).map(site => ({ ...site, position: site.approach }));
    const target = nearest(ship.position, choices);
    if (target) result.interact = { type: "place", flagSiteId: target.id };
  } else if (actionId === 21 && legal.canDrop) result.interact = { type: "drop" };
  return result;
}

export function discreteActionMaskV1(observation: Observation, shipId: string): boolean[] {
  const ship = observation.ships.find(candidate => candidate.id === shipId);
  if (!ship) throw new Error(`mask rejected non-owned ship ${shipId}.`);
  const legal = observation.legal[shipId];
  const mask = Array<boolean>(22).fill(false);
  if (!ship.alive) { mask[4] = true; return mask; }
  for (let index = 0; index < 9; index += 1) mask[index] = true;
  for (let index = 9; index < 18; index += 1) mask[index] = Boolean(legal?.canFire);
  mask[18] = Boolean(legal?.pickupFlagIds.length);
  mask[19] = Boolean(legal?.giveTargetShipIds.length);
  mask[20] = Boolean(legal?.placementSiteIds.length);
  mask[21] = Boolean(legal?.canDrop);
  return mask;
}
