import { encodeShipV1 } from "../contracts/adapters";
import type { Observation, Point, ShipAction, ShipView, TeamAction } from "../contracts/types";
import { neutralAction } from "../contracts/validation";
import { distance, wrapHeading } from "../sim/geometry";
import { deriveSeed, XorShift32 } from "../sim/rng";
import { navigationWaypoint } from "./navigation";

export type BuiltinPolicyKind = "raider" | "navigator" | "guardian" | "corsair" | "admiral";

const clamp = (value: number): number => Math.max(-1, Math.min(1, value));
const byDistance = (origin: Point) => (left: ShipView, right: ShipView): number => distance(origin, left.position) - distance(origin, right.position) || left.id.localeCompare(right.id);
const enemyTeam = (observation: Observation) => observation.teamId === "blue" ? "rose" : "blue";

function reachableFlagPoint(observation: Observation, ownerTeamId: "blue" | "rose"): Point | null {
  const flag = observation.flags.find(candidate => candidate.ownerTeamId === ownerTeamId);
  if (!flag?.known || !flag.position) return null;
  if (flag.state === "at-home") return observation.bases.find(base => base.teamId === ownerTeamId)?.approach ?? flag.position;
  if (flag.state === "on-land") {
    const site = [...observation.flagSites].sort((left, right) => distance(flag.position!, left.position) - distance(flag.position!, right.position) || left.id.localeCompare(right.id))[0];
    return site?.approach ?? flag.position;
  }
  return flag.position;
}

function nearestEnemy(observation: Observation, ship: ShipView, flagCarrierOnly = false): ShipView | undefined {
  const ownFlag = observation.flags.find(flag => flag.ownerTeamId === observation.teamId);
  return [...observation.enemies].filter(enemy => enemy.alive && (!flagCarrierOnly || enemy.carriedFlagId === ownFlag?.id)).sort(byDistance(ship.position))[0];
}

function objectiveTarget(observation: Observation, ship: ShipView): Point {
  const home = observation.bases.find(base => base.teamId === observation.teamId)!;
  const enemyBase = observation.bases.find(base => base.teamId === enemyTeam(observation))!;
  const ownFlag = observation.flags.find(flag => flag.ownerTeamId === observation.teamId);
  const ownFlagAway = ownFlag?.known && ownFlag.state !== "at-home";
  if (ship.carriedFlagId) return ownFlagAway && observation.ships.length === 1 ? reachableFlagPoint(observation, observation.teamId) ?? home.deliveryZone.center : home.deliveryZone.center;
  if (ownFlagAway && observation.ships.length === 1) return reachableFlagPoint(observation, observation.teamId) ?? home.approach;
  return reachableFlagPoint(observation, enemyTeam(observation)) ?? enemyBase.approach;
}

function actionToward(observation: Observation, ship: ShipView, target: Point, caution: number, preferredEnemy?: ShipView, fireRangeFraction = .32): ShipAction {
  if (!ship.alive) return neutralAction(ship.id);
  const legal = observation.legal[ship.id];
  if (legal?.pickupFlagIds.length) return { ...neutralAction(ship.id), throttle: -1, interact: { type: "pickup", flagId: legal.pickupFlagIds[0]! } };
  const ownFlag = observation.flags.find(flag => flag.ownerTeamId === observation.teamId);
  const mustRecoverInDuel = observation.ships.length === 1 && ship.carriedFlagId && ownFlag?.known && ownFlag.state !== "at-home";
  if (mustRecoverInDuel && legal?.canDrop) return { ...neutralAction(ship.id), throttle: .35, interact: { type: "drop" } };
  if (ship.carriedFlagId && ship.health <= 42 && legal?.giveTargetShipIds.length) return { ...neutralAction(ship.id), interact: { type: "give", targetShipId: legal.giveTargetShipIds[0]! } };
  const waypoint = navigationWaypoint(observation, ship, target);
  const desiredBearing = wrapHeading(Math.atan2(waypoint.y - ship.position.y, waypoint.x - ship.position.x) - ship.heading);
  const rays = encodeShipV1(observation, ship.id).slice(48, 56);
  const front = rays[0] ?? 1;
  const clockwise = Math.max(rays[1] ?? 1, rays[2] ?? 1);
  const counterClockwise = Math.max(rays[7] ?? 1, rays[6] ?? 1);
  let turn = clamp(desiredBearing / .58);
  if (front < .24 + caution * .18) turn = clockwise >= counterClockwise ? 1 : -1;
  else if (Math.abs(desiredBearing) < .32 && Math.min(clockwise, counterClockwise) < .18) turn += clockwise >= counterClockwise ? .38 : -.38;
  const enemy = preferredEnemy ?? nearestEnemy(observation, ship);
  const selectedEnemy = enemy && legal?.fireTargetShipIds.includes(enemy.id) ? enemy : [...observation.enemies].filter(candidate => legal?.fireTargetShipIds.includes(candidate.id)).sort(byDistance(ship.position))[0];
  const selectedDistance = selectedEnemy ? distance(ship.position, selectedEnemy.position) : Infinity;
  const urgentDefense = Boolean(selectedEnemy?.carriedFlagId && selectedEnemy.carriedFlagId === ownFlag?.id);
  const fire = Boolean(legal?.canFire && selectedEnemy && (urgentDefense || selectedDistance <= observation.publicRules.projectileRange * fireRangeFraction));
  const targetDistance = distance(ship.position, waypoint);
  const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
  let throttle = front < .12 ? -.55 : Math.abs(turn) > .82 ? .42 : front < .34 ? .62 : 1;
  if (front < .07 && Math.abs(desiredBearing) > 1.8) { turn = 0; throttle = -1; }
  else if (targetDistance < 85 && speed > observation.publicRules.maxSpeed * .38) throttle = -.8;
  else if (targetDistance < 45) throttle = .24;
  return { shipId: ship.id, throttle, turn: clamp(turn), fire, fireTargetShipId: fire ? selectedEnemy!.id : null, interact: { type: "none" } };
}

function ownFlagRecoveryTarget(observation: Observation): Point | null {
  const ownFlag = observation.flags.find(flag => flag.ownerTeamId === observation.teamId);
  return ownFlag?.known && ownFlag.state !== "at-home" ? reachableFlagPoint(observation, observation.teamId) : null;
}

export function raiderPolicy(observation: Observation): TeamAction {
  const recovery = ownFlagRecoveryTarget(observation);
  return { actions: observation.ships.map((ship, index) => actionToward(observation, ship, recovery && !ship.carriedFlagId && index === observation.ships.length - 1 ? recovery : objectiveTarget(observation, ship), .22)) };
}

export function navigatorPolicy(observation: Observation): TeamAction {
  const sites = observation.flagSites.filter(site => !site.reservedHome);
  const recovery = ownFlagRecoveryTarget(observation);
  return { actions: observation.ships.map((ship, index) => {
    if (recovery && !ship.carriedFlagId && index === observation.ships.length - 1) return actionToward(observation, ship, recovery, .95);
    const objective = objectiveTarget(observation, ship);
    if (ship.carriedFlagId || distance(ship.position, objective) < 420 || sites.length === 0) return actionToward(observation, ship, objective, .9);
    const route = [...sites].sort((left, right) => Math.abs(left.approach.y - (index % 2 ? observation.world.height * .67 : observation.world.height * .33)) - Math.abs(right.approach.y - (index % 2 ? observation.world.height * .67 : observation.world.height * .33)) || distance(ship.position, left.approach) - distance(ship.position, right.approach))[0];
    return actionToward(observation, ship, route?.approach ?? objective, 1);
  }) };
}

export function guardianPolicy(observation: Observation): TeamAction {
  const home = observation.bases.find(base => base.teamId === observation.teamId)!;
  const recovery = ownFlagRecoveryTarget(observation);
  return { actions: observation.ships.map((ship, index) => {
    if (ship.carriedFlagId || index === 0) return actionToward(observation, ship, objectiveTarget(observation, ship), .55);
    const intruder = nearestEnemy(observation, ship, true) ?? [...observation.enemies].filter(enemy => enemy.alive && distance(enemy.position, home.deliveryZone.center) < 360).sort(byDistance(ship.position))[0];
    const direction = observation.teamId === "blue" ? 1 : -1;
    const patrol = { x: home.deliveryZone.center.x + direction * (170 + index * 38), y: home.deliveryZone.center.y + Math.sin((observation.decisionId + index * 31) / 22) * 145 };
    return actionToward(observation, ship, intruder?.position ?? recovery ?? patrol, .65, intruder, .58);
  }) };
}

export function corsairPolicy(observation: Observation): TeamAction {
  return { actions: observation.ships.map(ship => {
    if (ship.carriedFlagId || observation.legal[ship.id]?.pickupFlagIds.length) return actionToward(observation, ship, objectiveTarget(observation, ship), .45);
    const quarry = nearestEnemy(observation, ship, true) ?? nearestEnemy(observation, ship);
    return actionToward(observation, ship, quarry?.position ?? objectiveTarget(observation, ship), .35, quarry, .9);
  }) };
}

export function admiralPolicy(observation: Observation): TeamAction {
  const home = observation.bases.find(base => base.teamId === observation.teamId)!;
  const carrier = observation.ships.find(ship => ship.alive && ship.carriedFlagId);
  const recovery = ownFlagRecoveryTarget(observation);
  return { actions: observation.ships.map((ship, index) => {
    const legal = observation.legal[ship.id];
    if (ship.carriedFlagId && ship.health < 45 && legal?.giveTargetShipIds.length) return { ...neutralAction(ship.id), interact: { type: "give", targetShipId: legal.giveTargetShipIds[0]! } };
    if (ship.carriedFlagId) return actionToward(observation, ship, home.deliveryZone.center, .78);
    if (carrier && carrier.id !== ship.id) {
      const attacker = nearestEnemy(observation, ship, true) ?? nearestEnemy(observation, ship);
      const escortPoint = { x: carrier.position.x + (home.deliveryZone.center.x - carrier.position.x) * .16, y: carrier.position.y + (home.deliveryZone.center.y - carrier.position.y) * .16 };
      return actionToward(observation, ship, attacker && distance(attacker.position, carrier.position) < 260 ? attacker.position : escortPoint, .72, attacker, .52);
    }
    const lastRole = observation.ships.length > 1 && index === observation.ships.length - 1;
    if (lastRole) {
      const enemyCarrier = nearestEnemy(observation, ship, true);
      const direction = observation.teamId === "blue" ? 1 : -1;
      return actionToward(observation, ship, enemyCarrier?.position ?? recovery ?? { x: home.approach.x + direction * 190, y: home.approach.y }, .75, enemyCarrier, .62);
    }
    return actionToward(observation, ship, objectiveTarget(observation, ship), .68);
  }) };
}

export const builtinPolicies: Record<BuiltinPolicyKind, (observation: Observation) => TeamAction> = {
  raider: raiderPolicy,
  navigator: navigatorPolicy,
  guardian: guardianPolicy,
  corsair: corsairPolicy,
  admiral: admiralPolicy,
};

/** Creates a deterministic per-match captain with subtle seeded helm variation. */
export function createBuiltinPolicy(kind: BuiltinPolicyKind, seed: number): (observation: Observation) => TeamAction {
  const rng = new XorShift32(deriveSeed(seed, `builtin-${kind}`));
  return observation => ({ actions: builtinPolicies[kind](observation).actions.map(action => {
    if (!observation.ships.find(ship => ship.id === action.shipId)?.alive) return action;
    const throttleDrift = (rng.nextFloat() - .5) * .055;
    const helmDrift = (rng.nextFloat() - .5) * .11;
    return { ...action, throttle: clamp(action.throttle + throttleDrift), turn: clamp(action.turn + helmDrift), interact: { ...action.interact } };
  }) });
}
