import { encodeShipV1 } from "../contracts/adapters";
import type { GameMode, Observation, Point, ShipAction, ShipView, TeamAction } from "../contracts/types";
import { neutralAction } from "../contracts/validation";
import { distance, wrapHeading } from "../sim/geometry";
import { deriveSeed, XorShift32 } from "../sim/rng";
import { navigationWaypoint } from "./navigation";

export type BuiltinPolicyKind =
  | "duel-cadet" | "duel-hunter" | "duel-ace"
  | "fleet-deckhands" | "fleet-vanguard" | "fleet-armada"
  | "fog-duel-scout" | "fog-duel-stalker" | "fog-duel-phantom"
  | "fog-fleet-watch" | "fog-fleet-veil" | "fog-fleet-spectral";

export interface BuiltinPolicyDefinition {
  id: string;
  alias: string;
  hash: string;
  kind: BuiltinPolicyKind;
  mode: GameMode;
  level: 1 | 2 | 3;
  description: string;
}

export const builtinPolicyDefinitions: BuiltinPolicyDefinition[] = [
  { id: "captain-duel-harbor-cadet", alias: "Harbor Cadet · Level 1", hash: "builtin-duel-harbor-cadet-v1", kind: "duel-cadet", mode: "duel", level: 1, description: "A reliable objective runner with conservative speed and point-blank fire." },
  { id: "captain-duel-tide-hunter", alias: "Tide Hunter · Level 2", hash: "builtin-duel-tide-hunter-v1", kind: "duel-hunter", mode: "duel", level: 2, description: "Adds own-flag recovery, faster helm control, and selective cannon pressure." },
  { id: "captain-duel-blackwake-ace", alias: "Blackwake Ace · Level 3", hash: "builtin-duel-blackwake-ace-v1", kind: "duel-ace", mode: "duel", level: 3, description: "Runs the full obstacle planner, aggressive intercepts, and health-aware flag tactics." },
  { id: "captain-fleet-deckhand-squadron", alias: "Deckhand Squadron · Level 1", hash: "builtin-fleet-deckhand-squadron-v1", kind: "fleet-deckhands", mode: "fleet", level: 1, description: "A simple coordinated rush with safe obstacle routing." },
  { id: "captain-fleet-coral-vanguard", alias: "Coral Vanguard · Level 2", hash: "builtin-fleet-coral-vanguard-v1", kind: "fleet-vanguard", mode: "fleet", level: 2, description: "Splits raiding and home recovery while using focused fire." },
  { id: "captain-fleet-storm-armada", alias: "Storm Armada · Level 3", hash: "builtin-fleet-storm-armada-v1", kind: "fleet-armada", mode: "fleet", level: 3, description: "Coordinates raider, escort, and interceptor roles with carrier hand-offs." },
  { id: "captain-fog-duel-lantern-scout", alias: "Lantern Scout · Level 1", hash: "builtin-fog-duel-lantern-scout-v1", kind: "fog-duel-scout", mode: "fog-duel", level: 1, description: "Searches the enemy approach and reacts only to genuinely visible threats." },
  { id: "captain-fog-duel-mist-stalker", alias: "Mist Stalker · Level 2", hash: "builtin-fog-duel-mist-stalker-v1", kind: "fog-duel-stalker", mode: "fog-duel", level: 2, description: "Adds flag recovery and stronger local combat without hidden-state access." },
  { id: "captain-fog-duel-phantom-corsair", alias: "Phantom Corsair · Level 3", hash: "builtin-fog-duel-phantom-corsair-v1", kind: "fog-duel-phantom", mode: "fog-duel", level: 3, description: "Uses known terrain, visible-event reactions, and fast capture routes." },
  { id: "captain-fog-fleet-watchlight-crew", alias: "Watchlight Crew · Level 1", hash: "builtin-fog-fleet-watchlight-crew-v1", kind: "fog-fleet-watch", mode: "fog-fleet", level: 1, description: "A steady shared-vision fleet with uncomplicated objective play." },
  { id: "captain-fog-fleet-veil-squadron", alias: "Veil Squadron · Level 2", hash: "builtin-fog-fleet-veil-squadron-v1", kind: "fog-fleet-veil", mode: "fog-fleet", level: 2, description: "Spreads sensors across lanes and assigns a dedicated recovery ship." },
  { id: "captain-fog-fleet-spectral-armada", alias: "Spectral Armada · Level 3", hash: "builtin-fog-fleet-spectral-armada-v1", kind: "fog-fleet-spectral", mode: "fog-fleet", level: 3, description: "Combines shared sight, escorts, interception, and aggressive legal targeting." },
];

const profiles = new Map(builtinPolicyDefinitions.map(definition => [definition.kind, definition]));
export const isBuiltinPolicyKind = (kind: string): kind is BuiltinPolicyKind => profiles.has(kind as BuiltinPolicyKind);

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

function nearestEnemy(observation: Observation, ship: ShipView, carrierOnly = false): ShipView | undefined {
  const ownFlag = observation.flags.find(flag => flag.ownerTeamId === observation.teamId);
  return [...observation.enemies].filter(enemy => enemy.alive && (!carrierOnly || enemy.carriedFlagId === ownFlag?.id)).sort(byDistance(ship.position))[0];
}

function ownFlagRecoveryTarget(observation: Observation): Point | null {
  const ownFlag = observation.flags.find(flag => flag.ownerTeamId === observation.teamId);
  return ownFlag?.known && ownFlag.state !== "at-home" ? reachableFlagPoint(observation, observation.teamId) : null;
}

function primaryObjective(observation: Observation, ship: ShipView): Point {
  const home = observation.bases.find(base => base.teamId === observation.teamId)!;
  const enemyBase = observation.bases.find(base => base.teamId === enemyTeam(observation))!;
  const recovery = ownFlagRecoveryTarget(observation);
  if (ship.carriedFlagId) return home.deliveryZone.center;
  if (recovery && observation.ships.length === 1) return recovery;
  return reachableFlagPoint(observation, enemyTeam(observation)) ?? enemyBase.approach;
}

interface HelmProfile { level: 1 | 2 | 3; fireRangeFraction: number; throttleScale: number; caution: number; }

function actionToward(observation: Observation, ship: ShipView, target: Point, helm: HelmProfile, preferredEnemy?: ShipView): ShipAction {
  if (!ship.alive) return neutralAction(ship.id);
  const legal = observation.legal[ship.id];
  if (legal?.pickupFlagIds.length) return { ...neutralAction(ship.id), throttle: -.6, interact: { type: "pickup", flagId: legal.pickupFlagIds[0]! } };
  const ownFlag = observation.flags.find(flag => flag.ownerTeamId === observation.teamId);
  const ownFlagAway = ownFlag?.known && ownFlag.state !== "at-home";
  if (ownFlagAway && observation.ships.length === 1 && ship.carriedFlagId && legal?.canDrop) return { ...neutralAction(ship.id), throttle: .3, interact: { type: "drop" } };
  if (helm.level >= 3 && ship.carriedFlagId && ship.health <= 44 && legal?.giveTargetShipIds.length) return { ...neutralAction(ship.id), interact: { type: "give", targetShipId: legal.giveTargetShipIds[0]! } };

  const waypoint = navigationWaypoint(observation, ship, target);
  const desiredBearing = wrapHeading(Math.atan2(waypoint.y - ship.position.y, waypoint.x - ship.position.x) - ship.heading);
  const rays = encodeShipV1(observation, ship.id).slice(48, 56);
  const front = rays[0] ?? 1;
  const clockwise = Math.max(rays[1] ?? 1, rays[2] ?? 1);
  const counterClockwise = Math.max(rays[7] ?? 1, rays[6] ?? 1);
  let turn = clamp(desiredBearing / (.72 - helm.level * .07));
  if (front < .2 + helm.caution * .16) turn = clockwise >= counterClockwise ? 1 : -1;
  else if (Math.abs(desiredBearing) < .32 && Math.min(clockwise, counterClockwise) < .18) turn += clockwise >= counterClockwise ? .38 : -.38;

  const enemy = preferredEnemy ?? nearestEnemy(observation, ship);
  const selectedEnemy = enemy && legal?.fireTargetShipIds.includes(enemy.id) ? enemy : [...observation.enemies].filter(candidate => legal?.fireTargetShipIds.includes(candidate.id)).sort(byDistance(ship.position))[0];
  const selectedDistance = selectedEnemy ? distance(ship.position, selectedEnemy.position) : Infinity;
  const urgentDefense = Boolean(selectedEnemy?.carriedFlagId && selectedEnemy.carriedFlagId === ownFlag?.id);
  const fire = Boolean(legal?.canFire && selectedEnemy && (urgentDefense || selectedDistance <= observation.publicRules.projectileRange * helm.fireRangeFraction));
  const targetDistance = distance(ship.position, waypoint);
  const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
  let throttle = front < .1 ? -.6 : Math.abs(turn) > .84 ? .42 : front < .32 ? .62 : helm.throttleScale;
  if (front < .06 && Math.abs(desiredBearing) > 1.8) { turn = 0; throttle = -1; }
  else if (targetDistance < 85 && speed > observation.publicRules.maxSpeed * .38) throttle = -.8;
  else if (targetDistance < 45) throttle = .24;
  return { shipId: ship.id, throttle: clamp(throttle), turn: clamp(turn), fire, fireTargetShipId: fire ? selectedEnemy!.id : null, interact: { type: "none" } };
}

function policyFor(definition: BuiltinPolicyDefinition, observation: Observation): TeamAction {
  const level = definition.level;
  const fog = definition.mode.startsWith("fog");
  const duel = definition.mode === "duel";
  const helm: HelmProfile = {
    level,
    throttleScale: level === 1 ? (fog ? .3 : duel ? .45 : .55) : level === 2 ? (fog ? .5 : duel ? .62 : .74) : (fog ? .68 : duel ? .78 : .9),
    fireRangeFraction: level === 1 ? .28 : level === 2 ? .5 : .72,
    caution: level === 1 ? .35 : level === 2 ? .62 : .82,
  };
  const home = observation.bases.find(base => base.teamId === observation.teamId)!;
  const recovery = ownFlagRecoveryTarget(observation);
  const carrier = observation.ships.find(ship => ship.alive && ship.carriedFlagId);

  return { actions: observation.ships.map((ship, index) => {
    if (level === 1 || observation.ships.length === 1) return actionToward(observation, ship, primaryObjective(observation, ship), helm, level >= 2 ? nearestEnemy(observation, ship, true) : undefined);
    if (ship.carriedFlagId) return actionToward(observation, ship, home.deliveryZone.center, helm);
    const defender = index === observation.ships.length - 1;
    if (defender) {
      const intruder = nearestEnemy(observation, ship, true) ?? [...observation.enemies].filter(enemy => enemy.alive && distance(enemy.position, home.deliveryZone.center) < (level === 3 ? 440 : 320)).sort(byDistance(ship.position))[0];
      const direction = observation.teamId === "blue" ? 1 : -1;
      const patrol = { x: home.approach.x + direction * (level === 3 ? 220 : 165), y: home.approach.y + Math.sin((observation.decisionId + index * 23) / 26) * 130 };
      return actionToward(observation, ship, intruder?.position ?? recovery ?? patrol, helm, intruder);
    }
    if (level === 3 && carrier && carrier.id !== ship.id) {
      const attacker = nearestEnemy(observation, ship, true) ?? nearestEnemy(observation, ship);
      const escortPoint = { x: carrier.position.x + (home.deliveryZone.center.x - carrier.position.x) * .18, y: carrier.position.y + (home.deliveryZone.center.y - carrier.position.y) * .18 };
      return actionToward(observation, ship, attacker && distance(attacker.position, carrier.position) < 280 ? attacker.position : escortPoint, helm, attacker);
    }
    return actionToward(observation, ship, primaryObjective(observation, ship), helm, nearestEnemy(observation, ship, true));
  }) };
}

/** Creates a deterministic per-match captain with small recorded helm variation. */
export function createBuiltinPolicy(kind: BuiltinPolicyKind, seed: number): (observation: Observation) => TeamAction {
  const definition = profiles.get(kind);
  if (!definition) throw new Error(`Unknown built-in policy ${kind}.`);
  const rng = new XorShift32(deriveSeed(seed, `builtin-${kind}`));
  return observation => ({ actions: policyFor(definition, observation).actions.map(action => {
    if (!observation.ships.find(ship => ship.id === action.shipId)?.alive) return action;
    const scale = definition.level === 1 ? .035 : definition.level === 2 ? .025 : .018;
    const throttleDrift = (rng.nextFloat() - .5) * scale;
    const helmDrift = (rng.nextFloat() - .5) * scale * 1.8;
    return { ...action, throttle: clamp(action.throttle + throttleDrift), turn: clamp(action.turn + helmDrift), interact: { ...action.interact } };
  }) });
}
