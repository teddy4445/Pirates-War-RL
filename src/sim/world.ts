import type { FleetRLConfig, MapDefinition, ShipAction, TeamId } from "../contracts/types";
import { ENGINE_VERSION } from "../contracts/types";
import { neutralAction } from "../contracts/validation";
import { add, circleOverlapsPolygon, clampMagnitude, distance, dot, scale, segmentOccluded, subtract, sweepCircleAgainstMap, sweepMovingCircles, wrapHeading } from "./geometry";
import { deriveSeed, XorShift32 } from "./rng";
import type { FlagState, InteractionIntent, ProjectileState, ShipState, StepControls, WorldEvent, WorldState } from "./types";

const teamOrder: TeamId[] = ["blue", "rose"];
const cloneAction = (action: ShipAction): ShipAction => ({ ...action, interact: { ...action.interact } });
const cloneShip = (ship: ShipState): ShipState => ({ ...ship, spawnPosition: { ...ship.spawnPosition }, position: { ...ship.position }, velocity: { ...ship.velocity }, heldAction: cloneAction(ship.heldAction) });

function updateIslandDiscoveries(state: WorldState): void {
  const fog = state.config.mode === "fog-duel" || state.config.mode === "fog-fleet";
  state.discoveredIslandIds ??= { blue: [], rose: [] };
  for (const teamId of teamOrder) {
    const known = new Set(state.discoveredIslandIds[teamId]);
    if (!fog || state.config.vision.staticMapKnown) for (const island of state.map.islands) known.add(island.id);
    else for (const ship of state.ships.filter(candidate => candidate.teamId === teamId && candidate.alive)) for (const island of state.map.islands) {
      if (circleOverlapsPolygon(ship.position, state.config.vision.sensorRadius, island.polygon)) known.add(island.id);
    }
    state.discoveredIslandIds[teamId] = [...known].sort();
  }
}

export function createInitialWorld(config: FleetRLConfig, map: MapDefinition, seed: number): WorldState {
  const shipsPerTeam = config.mode === "duel" || config.mode === "fog-duel" ? 1 : config.shipsPerTeam;
  const ships: ShipState[] = [];
  for (const teamId of teamOrder) {
    const base = map.bases.find(candidate => candidate.teamId === teamId);
    if (!base) throw new Error(`Map is missing the ${teamId} base.`);
    for (let index = 0; index < shipsPerTeam; index += 1) {
      const spawn = base.spawnSlots[index];
      if (!spawn) throw new Error(`Map has no ${teamId} spawn slot ${index + 1}.`);
      const id = `${teamId}-${index + 1}`;
      ships.push({
        id,
        teamId,
        spawnPosition: { x: spawn.x, y: spawn.y },
        spawnHeading: spawn.heading,
        position: { x: spawn.x, y: spawn.y },
        velocity: { x: 0, y: 0 },
        heading: spawn.heading,
        radius: config.ship.radius,
        health: config.ship.maxHealth,
        alive: true,
        respawnAtTick: null,
        protectionUntilTick: 0,
        cooldownTicks: 0,
        carriedFlagId: null,
        heldAction: neutralAction(id),
      });
    }
  }
  ships.sort((a, b) => a.id.localeCompare(b.id));
  const flags = teamOrder.map(ownerTeamId => {
    const base = map.bases.find(candidate => candidate.teamId === ownerTeamId);
    if (!base) throw new Error(`Map is missing ${ownerTeamId}.`);
    return { id: `${ownerTeamId}-flag`, ownerTeamId, state: "at-home" as const, position: { ...base.homePost }, carrierShipId: null, siteId: base.homeFlagSiteId, changedAtTick: 0, pickupScored: false };
  });
  const state: WorldState = {
    engineVersion: ENGINE_VERSION,
    tick: 0,
    seed: seed >>> 0,
    tieBreakRngState: deriveSeed(seed, "tie-break"),
    nextEntitySequence: 1,
    config,
    map,
    ships,
    flags,
    projectiles: [],
    scores: { blue: 0, rose: 0 },
    kills: { blue: 0, rose: 0 },
    discoveredIslandIds: { blue: [], rose: [] },
    events: [],
    outcome: null,
  };
  updateIslandDiscoveries(state);
  return state;
}

function cloneWorld(state: WorldState): WorldState {
  const discovered = state.discoveredIslandIds ?? { blue: [], rose: [] };
  return {
    ...state,
    ships: state.ships.map(cloneShip),
    flags: state.flags.map(flag => ({ ...flag, position: flag.position ? { ...flag.position } : null })),
    projectiles: state.projectiles.map(projectile => ({ ...projectile, position: { ...projectile.position }, previousPosition: { ...projectile.previousPosition }, direction: { ...projectile.direction } })),
    scores: { ...state.scores },
    kills: { ...state.kills },
    discoveredIslandIds: { blue: [...discovered.blue], rose: [...discovered.rose] },
    events: [],
    outcome: state.outcome ? { ...state.outcome } : null,
  };
}

function removeInwardVelocity(velocity: { x: number; y: number }, normal: { x: number; y: number }): { x: number; y: number } {
  const inward = dot(velocity, normal);
  return inward < 0 ? subtract(velocity, scale(normal, inward)) : velocity;
}

function addDamage(damageByShip: Map<string, number>, shipId: string, amount: number): void {
  if (amount > 0) damageByShip.set(shipId, (damageByShip.get(shipId) ?? 0) + amount);
}

function impactDamage(state: WorldState, inwardSpeed: number): number {
  if (!state.config.combat.rammingDamage || inwardSpeed <= 0) return 0;
  return Math.round(inwardSpeed * state.config.combat.impactDamagePerSpeed);
}

function resolveShipContacts(state: WorldState, damageByShip: Map<string, number>, killerTeams: Map<string, TeamId>): void {
  const living = state.ships.filter(ship => ship.alive).sort((a, b) => a.id.localeCompare(b.id));
  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (let leftIndex = 0; leftIndex < living.length; leftIndex += 1) {
      const left = living[leftIndex];
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < living.length; rightIndex += 1) {
        const right = living[rightIndex];
        if (!right) continue;
        const delta = subtract(right.position, left.position);
        const actualDistance = Math.hypot(delta.x, delta.y);
        const minimum = left.radius + right.radius;
        if (actualDistance >= minimum - 1e-9) continue;
        const normal = actualDistance > 1e-9 ? scale(delta, 1 / actualDistance) : { x: 1, y: 0 };
        const correction = (minimum - actualDistance) / 2 + 1e-7;
        left.position = subtract(left.position, scale(normal, correction));
        right.position = add(right.position, scale(normal, correction));
        const relativeSpeed = dot(subtract(right.velocity, left.velocity), normal);
        let leftDamage = 0;
        let rightDamage = 0;
        let leftImpactSpeed = 0;
        let rightImpactSpeed = 0;
        if (iteration === 0 && relativeSpeed < 0) {
          leftImpactSpeed = Math.max(0, dot(left.velocity, normal));
          rightImpactSpeed = Math.max(0, dot(right.velocity, scale(normal, -1)));
          leftDamage = isProtected(left, state.tick) ? 0 : impactDamage(state, leftImpactSpeed);
          rightDamage = isProtected(right, state.tick) ? 0 : impactDamage(state, rightImpactSpeed);
          addDamage(damageByShip, left.id, leftDamage);
          addDamage(damageByShip, right.id, rightDamage);
          if (left.teamId !== right.teamId) {
            if (leftDamage > 0) killerTeams.set(left.id, right.teamId);
            if (rightDamage > 0) killerTeams.set(right.id, left.teamId);
          }
        }
        if (relativeSpeed < 0) {
          const impulse = relativeSpeed / 2;
          left.velocity = add(left.velocity, scale(normal, impulse));
          right.velocity = subtract(right.velocity, scale(normal, impulse));
        }
        if (iteration === 0) event(state, "ShipContact", { shipId: left.id, otherShipId: right.id, position: scale(add(left.position, right.position), 0.5), damage: leftDamage, otherDamage: rightDamage, impactSpeed: leftImpactSpeed, otherImpactSpeed: rightImpactSpeed });
      }
    }
  }
}

function event(state: WorldState, type: string, fields: Omit<WorldEvent, "id" | "tick" | "type"> = {}): WorldEvent {
  const record: WorldEvent = { id: `e-${state.tick}-${state.nextEntitySequence++}`, tick: state.tick, type, ...fields };
  state.events.push(record);
  return record;
}

function isProtected(ship: ShipState, tick: number): boolean {
  return ship.protectionUntilTick > tick;
}

function interceptDirection(origin: { x: number; y: number }, target: ShipState, projectileSpeed: number): { x: number; y: number } {
  const relative = subtract(target.position, origin);
  const a = dot(target.velocity, target.velocity) - projectileSpeed * projectileSpeed;
  const b = 2 * dot(relative, target.velocity);
  const c = dot(relative, relative);
  let interceptTime: number | null = null;
  if (Math.abs(a) <= 1e-12) {
    const candidate = Math.abs(b) > 1e-12 ? -c / b : -1;
    if (candidate > 1e-9) interceptTime = candidate;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter(value => value > 1e-9).sort((left, right) => left - right);
      interceptTime = candidates[0] ?? null;
    }
  }
  const aim = interceptTime === null ? relative : add(relative, scale(target.velocity, interceptTime));
  const magnitude = Math.hypot(aim.x, aim.y);
  return magnitude > 1e-12 ? scale(aim, 1 / magnitude) : { x: Math.cos(target.heading), y: Math.sin(target.heading) };
}

function projectileDamage(state: WorldState, shotDistance: number): number {
  const combat = state.config.combat;
  const rangeFraction = Math.max(0, Math.min(1, shotDistance / combat.projectileRange));
  const multiplier = combat.maxDamageMultiplier - (combat.maxDamageMultiplier - combat.minDamageMultiplier) * rangeFraction;
  return Math.max(1, Math.round(combat.damage * multiplier));
}

function canOccupy(state: WorldState, ship: ShipState, position: { x: number; y: number }): boolean {
  const sweep = sweepCircleAgainstMap(position, position, ship.radius, state.map);
  if (sweep.hit) return false;
  return !state.ships.some(other => other.alive && other.id !== ship.id && distance(position, other.position) < ship.radius + other.radius - 1e-7);
}

function processRespawnsAndCooldowns(state: WorldState): void {
  const offsetScale = state.config.ship.radius * 2.5;
  const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  for (const ship of state.ships) {
    if (ship.alive) {
      if (ship.cooldownTicks > 0) ship.cooldownTicks -= 1;
      continue;
    }
    if (ship.respawnAtTick === null || ship.respawnAtTick > state.tick) continue;
    const candidate = offsets.map(([x, y]) => ({ x: ship.spawnPosition.x + x * offsetScale, y: ship.spawnPosition.y + y * offsetScale })).find(position => canOccupy(state, ship, position));
    if (!candidate) continue;
    ship.alive = true;
    ship.position = candidate;
    ship.velocity = { x: 0, y: 0 };
    ship.heading = ship.spawnHeading;
    ship.health = state.config.ship.maxHealth;
    ship.cooldownTicks = 0;
    ship.respawnAtTick = null;
    ship.protectionUntilTick = state.tick + state.config.ship.spawnProtectionTicks;
    ship.carriedFlagId = null;
    ship.heldAction = neutralAction(ship.id);
    event(state, "ShipRespawned", { shipId: ship.id, teamId: ship.teamId, position: { ...ship.position } });
  }
}

function spawnProjectiles(state: WorldState): void {
  for (const ship of state.ships) {
    if (!ship.alive || isProtected(ship, state.tick) || !ship.heldAction.fire || ship.cooldownTicks > 0) continue;
    const opponents = state.ships.filter(candidate => candidate.teamId !== ship.teamId && candidate.alive);
    const requestedTarget = ship.heldAction.fireTargetShipId ? opponents.find(candidate => candidate.id === ship.heldAction.fireTargetShipId) : undefined;
    const target = requestedTarget ?? (!ship.heldAction.fireTargetShipId ? [...opponents].filter(candidate => distance(ship.position, candidate.position) <= state.config.combat.projectileRange + 1e-9).sort((left, right) => distance(ship.position, left.position) - distance(ship.position, right.position) || left.id.localeCompare(right.id))[0] : undefined);
    if (!target) continue;
    const direction = interceptDirection(ship.position, target, state.config.combat.projectileSpeed);
    const muzzle = add(ship.position, scale(direction, ship.radius + state.config.combat.projectileRadius + 1));
    const muzzleSweep = sweepCircleAgainstMap(ship.position, muzzle, state.config.combat.projectileRadius, state.map);
    if (muzzleSweep.hit) continue;
    const id = `projectile-${state.nextEntitySequence++}`;
    state.projectiles.push({ id, ownerTeamId: ship.teamId, ownerShipId: ship.id, targetShipId: target.id, position: muzzle, previousPosition: { ...muzzle }, direction, radius: state.config.combat.projectileRadius, damage: state.config.combat.damage, distanceTraveled: 0, remainingRange: state.config.combat.projectileRange, spawnedAtTick: state.tick });
    ship.cooldownTicks = state.config.combat.cooldownTicks;
    event(state, "CannonFired", { shipId: ship.id, teamId: ship.teamId, projectileId: id, position: { ...muzzle } });
  }
}

function dropCarriedFlag(state: WorldState, ship: ShipState, reason: "manual" | "carrier-death" = "manual"): void {
  if (!ship.carriedFlagId) return;
  const flag = state.flags.find(candidate => candidate.id === ship.carriedFlagId);
  if (!flag) throw new Error(`Ship ${ship.id} references missing flag ${ship.carriedFlagId}.`);
  const occupied = new Set(state.flags.filter(candidate => candidate.id !== flag.id && candidate.siteId).map(candidate => candidate.siteId as string));
  const site = state.map.flagSites.filter(candidate => !candidate.reservedHome && !occupied.has(candidate.id)).sort((left, right) => distance(ship.position, left.position) - distance(ship.position, right.position) || left.id.localeCompare(right.id))[0];
  flag.state = site ? "on-land" : "in-water";
  flag.position = site ? { ...site.position } : { ...ship.position };
  flag.carrierShipId = null;
  flag.siteId = site?.id ?? null;
  flag.changedAtTick = state.tick;
  ship.carriedFlagId = null;
  event(state, site ? "FlagRelocatedToIsland" : "FlagDroppedWater", { shipId: ship.id, flagId: flag.id, position: { ...flag.position }, detail: site ? `${reason}:${site.id}` : reason });
}

function resolveProjectiles(state: WorldState, previousPositions: Map<string, { x: number; y: number }>, damage: Map<string, number>, killerTeams: Map<string, TeamId>): void {
  const dt = 1 / state.config.timing.physicsHz;
  const retained: ProjectileState[] = [];
  for (const projectile of [...state.projectiles].sort((a, b) => a.id.localeCompare(b.id))) {
    projectile.previousPosition = { ...projectile.position };
    const travel = Math.min(projectile.remainingRange, state.config.combat.projectileSpeed * dt);
    const desired = add(projectile.position, scale(projectile.direction, travel));
    const terrain = sweepCircleAgainstMap(projectile.position, desired, projectile.radius, state.map);
    let hitTime = terrain.hit ? terrain.time : 1 + 1e-9;
    let target: ShipState | null = null;
    for (const ship of state.ships) {
      if (!ship.alive || ship.teamId === projectile.ownerTeamId) continue;
      const targetStart = previousPositions.get(ship.id) ?? ship.position;
      const collisionTime = sweepMovingCircles(projectile.position, desired, projectile.radius, targetStart, ship.position, ship.radius);
      if (collisionTime === null) continue;
      if (collisionTime < hitTime - 1e-9 || (Math.abs(collisionTime - hitTime) <= 1e-9 && target && ship.id.localeCompare(target.id) < 0)) {
        hitTime = collisionTime;
        target = ship;
      }
    }
    const impactPosition = add(projectile.position, scale(subtract(desired, projectile.position), Math.min(1, hitTime)));
    if (target) {
      projectile.position = impactPosition;
      const shotDistance = projectile.distanceTraveled + travel * Math.min(1, hitTime);
      const protectedTarget = isProtected(target, state.tick);
      const actualDamage = protectedTarget ? 0 : projectileDamage(state, shotDistance);
      const closeRange = shotDistance <= state.config.combat.projectileRange * state.config.combat.closeRangeFraction + 1e-9;
      if (!protectedTarget) { damage.set(target.id, (damage.get(target.id) ?? 0) + actualDamage); killerTeams.set(target.id, projectile.ownerTeamId); }
      event(state, "ProjectileHitShip", { projectileId: projectile.id, shipId: projectile.ownerShipId, otherShipId: target.id, position: { ...impactPosition }, damage: actualDamage, shotDistance, closeRange, ...(protectedTarget ? { detail: "protected" } : {}) });
      continue;
    }
    if (terrain.hit) {
      projectile.position = impactPosition;
      event(state, "ProjectileHitTerrain", { projectileId: projectile.id, shipId: projectile.ownerShipId, position: { ...impactPosition } });
      continue;
    }
    projectile.position = desired;
    projectile.remainingRange -= travel;
    projectile.distanceTraveled += travel;
    if (projectile.remainingRange <= 1e-7) {
      event(state, "ProjectileExpired", { projectileId: projectile.id, shipId: projectile.ownerShipId, position: { ...projectile.position } });
      continue;
    }
    retained.push(projectile);
  }
  state.projectiles = retained;
  for (const ship of state.ships) {
    const amount = damage.get(ship.id) ?? 0;
    if (!ship.alive || amount <= 0) continue;
    ship.health = Math.max(0, ship.health - amount);
    event(state, "ShipDamaged", { shipId: ship.id, teamId: ship.teamId, position: { ...ship.position }, damage: amount, detail: String(amount) });
  }
  const deaths = state.ships.filter(ship => ship.alive && ship.health <= 0).sort((a, b) => a.id.localeCompare(b.id));
  for (const ship of deaths) {
    dropCarriedFlag(state, ship, "carrier-death");
    const killerTeam = killerTeams.get(ship.id);
    if (killerTeam) {
      state.kills[killerTeam] += 1;
      state.scores[killerTeam] += state.config.match.points.kill;
    }
    ship.alive = false;
    ship.velocity = { x: 0, y: 0 };
    ship.respawnAtTick = state.tick + state.config.ship.respawnDelayTicks;
    ship.protectionUntilTick = 0;
    ship.cooldownTicks = 0;
    ship.heldAction = neutralAction(ship.id);
    event(state, "ShipSunk", { shipId: ship.id, teamId: ship.teamId, position: { ...ship.position }, ...(killerTeam ? { detail: `killer:${killerTeam}`, points: state.config.match.points.kill } : {}) });
  }
}

function flagInteractionPoint(state: WorldState, flag: FlagState): { x: number; y: number } | null {
  if (flag.siteId) return state.map.flagSites.find(site => site.id === flag.siteId)?.approach ?? flag.position;
  return flag.position;
}

function resolveInteractions(state: WorldState, intents: InteractionIntent[]): void {
  const eligibleShips = new Map(state.ships.filter(ship => ship.alive && !isProtected(ship, state.tick)).map(ship => [ship.id, ship]));
  const possessionSnapshot = new Map(state.ships.map(ship => [ship.id, ship.carriedFlagId]));
  const flagSnapshot = new Map(state.flags.map(flag => [flag.id, { ...flag, position: flag.position ? { ...flag.position } : null }]));
  const pickupCandidates = new Map<string, { ship: ShipState; distance: number }[]>();
  const otherIntents: InteractionIntent[] = [];
  for (const intent of intents.sort((a, b) => a.shipId.localeCompare(b.shipId))) {
    const ship = eligibleShips.get(intent.shipId);
    if (!ship || intent.interaction.type === "none") continue;
    if (intent.interaction.type !== "pickup") { otherIntents.push(intent); continue; }
    const flag = flagSnapshot.get(intent.interaction.flagId);
    if (!flag || flag.state === "carried" || possessionSnapshot.get(ship.id)) continue;
    if (flag.ownerTeamId === ship.teamId && flag.state === "at-home") continue;
    const target = flagInteractionPoint(state, flag);
    if (!target) continue;
    const separation = distance(ship.position, target);
    if (separation > state.config.flags.pickupRadius + 1e-9) continue;
    const candidates = pickupCandidates.get(flag.id) ?? [];
    candidates.push({ ship, distance: separation });
    pickupCandidates.set(flag.id, candidates);
  }
  const rng = new XorShift32(state.tieBreakRngState);
  for (const [flagId, candidates] of [...pickupCandidates].sort(([a], [b]) => a.localeCompare(b))) {
    candidates.sort((a, b) => a.distance - b.distance || a.ship.id.localeCompare(b.ship.id));
    const bestDistance = candidates[0]?.distance;
    if (bestDistance === undefined) continue;
    const tied = candidates.filter(candidate => Math.abs(candidate.distance - bestDistance) <= 1e-9).sort((a, b) => a.ship.id.localeCompare(b.ship.id));
    const winner = tied.length > 1 ? tied[rng.nextUint32() % tied.length] : tied[0];
    if (!winner) continue;
    const flag = state.flags.find(candidate => candidate.id === flagId);
    if (!flag) continue;
    if (tied.length > 1) event(state, "InteractionTieBreak", { flagId, shipId: winner.ship.id, detail: tied.map(item => item.ship.id).join(",") });
    if (flag.ownerTeamId === winner.ship.teamId) {
      const home = state.map.bases.find(base => base.teamId === flag.ownerTeamId);
      if (!home) continue;
      flag.state = "at-home"; flag.position = { ...home.homePost }; flag.carrierShipId = null; flag.siteId = home.homeFlagSiteId; flag.changedAtTick = state.tick; flag.pickupScored = false;
      event(state, "FlagRecovered", { flagId: flag.id, shipId: winner.ship.id, teamId: winner.ship.teamId, position: { ...home.homePost } });
    } else {
      const pickupPoints = flag.pickupScored ? 0 : state.config.match.points.pickup;
      flag.state = "carried"; flag.position = null; flag.carrierShipId = winner.ship.id; flag.siteId = null; flag.changedAtTick = state.tick; flag.pickupScored = true; winner.ship.carriedFlagId = flag.id;
      state.scores[winner.ship.teamId] += pickupPoints;
      event(state, "FlagPickedUp", { flagId: flag.id, shipId: winner.ship.id, teamId: winner.ship.teamId, position: { ...winner.ship.position }, points: pickupPoints });
    }
  }
  state.tieBreakRngState = rng.snapshot();

  const occupiedSiteIds = new Set(state.flags.filter(flag => flag.siteId).map(flag => flag.siteId as string));
  for (const intent of otherIntents) {
    const ship = eligibleShips.get(intent.shipId);
    if (!ship) continue;
    const carriedId = possessionSnapshot.get(ship.id);
    const carried = carriedId ? state.flags.find(flag => flag.id === carriedId) : null;
    if (intent.interaction.type === "drop" && carried && carried.carrierShipId === ship.id) {
      dropCarriedFlag(state, ship, "manual");
    } else if (intent.interaction.type === "give" && carried && carried.carrierShipId === ship.id) {
      const receiver = eligibleShips.get(intent.interaction.targetShipId);
      if (!receiver || receiver.id === ship.id || receiver.teamId !== ship.teamId || possessionSnapshot.get(receiver.id) || distance(ship.position, receiver.position) > state.config.flags.giveRadius || segmentOccluded(ship.position, receiver.position, state.map.islands)) continue;
      ship.carriedFlagId = null; receiver.carriedFlagId = carried.id; carried.carrierShipId = receiver.id; carried.changedAtTick = state.tick;
      event(state, "FlagGiven", { flagId: carried.id, shipId: ship.id, otherShipId: receiver.id, teamId: ship.teamId, position: { ...receiver.position } });
    } else if (intent.interaction.type === "place" && carried && carried.carrierShipId === ship.id) {
      const { flagSiteId } = intent.interaction;
      const site = state.map.flagSites.find(candidate => candidate.id === flagSiteId);
      if (!site || site.reservedHome || occupiedSiteIds.has(site.id) || distance(ship.position, site.approach) > state.config.flags.placeRadius) continue;
      ship.carriedFlagId = null; carried.state = "on-land"; carried.position = { ...site.position }; carried.carrierShipId = null; carried.siteId = site.id; carried.changedAtTick = state.tick; occupiedSiteIds.add(site.id);
      event(state, "FlagPlaced", { flagId: carried.id, shipId: ship.id, teamId: ship.teamId, position: { ...site.position } });
    }
  }
}

function resolveReturnsAndCaptures(state: WorldState): void {
  for (const flag of state.flags) {
    if ((flag.state === "in-water" || flag.state === "on-land") && state.tick - flag.changedAtTick >= state.config.flags.looseReturnTicks) {
      const base = state.map.bases.find(candidate => candidate.teamId === flag.ownerTeamId);
      if (!base) continue;
      flag.state = "at-home"; flag.position = { ...base.homePost }; flag.carrierShipId = null; flag.siteId = base.homeFlagSiteId; flag.changedAtTick = state.tick; flag.pickupScored = false;
      event(state, "FlagAutoReturned", { flagId: flag.id, teamId: flag.ownerTeamId, position: { ...base.homePost } });
    }
  }
  const captures: { ship: ShipState; flag: FlagState }[] = [];
  for (const ship of state.ships.filter(candidate => candidate.alive && !isProtected(candidate, state.tick))) {
    if (!ship.carriedFlagId) continue;
    const flag = state.flags.find(candidate => candidate.id === ship.carriedFlagId);
    const ownFlag = state.flags.find(candidate => candidate.ownerTeamId === ship.teamId);
    const base = state.map.bases.find(candidate => candidate.teamId === ship.teamId);
    if (!flag || !ownFlag || !base || (state.config.flags.requireOwnFlagHome && ownFlag.state !== "at-home")) continue;
    if (distance(ship.position, base.deliveryZone.center) <= base.deliveryZone.radius) captures.push({ ship, flag });
  }
  for (const { ship, flag } of captures.sort((a, b) => a.ship.id.localeCompare(b.ship.id))) {
    const enemyBase = state.map.bases.find(base => base.teamId === flag.ownerTeamId);
    if (!enemyBase || ship.carriedFlagId !== flag.id) continue;
    state.scores[ship.teamId] += state.config.match.points.delivery;
    ship.carriedFlagId = null;
    flag.state = "at-home"; flag.position = { ...enemyBase.homePost }; flag.carrierShipId = null; flag.siteId = enemyBase.homeFlagSiteId; flag.changedAtTick = state.tick; flag.pickupScored = false;
    event(state, "FlagCaptured", { flagId: flag.id, shipId: ship.id, teamId: ship.teamId, position: { ...ship.position }, points: state.config.match.points.delivery });
  }
}

function evaluateOutcome(state: WorldState): void {
  if (state.tick + 1 >= state.config.match.durationTicks) {
    const winner = state.scores.blue === state.scores.rose ? null : state.scores.blue > state.scores.rose ? "blue" : "rose";
    state.outcome = { kind: winner ? "win" : "draw", winner, reason: "time-limit", endedAtTick: state.tick };
  }
  if (state.outcome) event(state, "MatchEnded", { ...(state.outcome.winner ? { teamId: state.outcome.winner } : {}), detail: `${state.outcome.kind}:${state.outcome.reason}` });
}

export function stepWorld(previous: WorldState, controls?: Partial<StepControls>): WorldState {
  if (previous.outcome) return cloneWorld(previous);
  const state = cloneWorld(previous);
  const dt = 1 / state.config.timing.physicsHz;
  const actionByShip = new Map<string, ShipAction>();
  const interactionIntents: InteractionIntent[] = [];
  for (const teamId of teamOrder) {
    const actions = controls?.[teamId] ?? [];
    for (const action of actions) actionByShip.set(action.shipId, action);
  }
  processRespawnsAndCooldowns(state);
  const previousPositions = new Map(state.ships.map(ship => [ship.id, { ...ship.position }]));
  const damageByShip = new Map<string, number>();
  const killerTeams = new Map<string, TeamId>();
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    const activated = actionByShip.get(ship.id);
    const action = activated ?? { ...ship.heldAction, interact: { type: "none" as const } };
    if (activated?.scuttle) {
      dropCarriedFlag(state, ship, "carrier-death");
      ship.alive = false;
      ship.health = 0;
      ship.velocity = { x: 0, y: 0 };
      ship.respawnAtTick = state.tick + state.config.ship.scuttleRespawnTicks;
      ship.protectionUntilTick = 0;
      ship.cooldownTicks = 0;
      ship.heldAction = neutralAction(ship.id);
      event(state, "ShipScuttled", { shipId: ship.id, teamId: ship.teamId, position: { ...ship.position }, detail: "half-respawn" });
      event(state, "ShipSunk", { shipId: ship.id, teamId: ship.teamId, position: { ...ship.position }, detail: "scuttle" });
      continue;
    }
    if (activated && activated.interact.type !== "none") interactionIntents.push({ shipId: ship.id, interaction: { ...activated.interact } });
    ship.heldAction = { ...cloneAction(action), scuttle: false, interact: { type: "none" } };
    ship.heading = wrapHeading(ship.heading + action.turn * state.config.ship.maxTurnRate * dt);
    const forward = { x: Math.cos(ship.heading), y: Math.sin(ship.heading) };
    const accelerated = add(ship.velocity, scale(forward, action.throttle * state.config.ship.acceleration * dt));
    const dragged = scale(accelerated, Math.exp(-state.config.ship.dragPerSecond * dt));
    const speedLimit = state.config.ship.maxSpeed * (ship.carriedFlagId ? state.config.ship.flagCarrierSpeedMultiplier : 1);
    ship.velocity = clampMagnitude(dragged, speedLimit);
    const desired = add(ship.position, scale(ship.velocity, dt));
    const collision = sweepCircleAgainstMap(ship.position, desired, ship.radius, state.map);
    ship.position = collision.position;
    if (collision.hit && collision.normal) {
      const impactSpeed = Math.max(0, -dot(ship.velocity, collision.normal));
      const damage = isProtected(ship, state.tick) ? 0 : impactDamage(state, impactSpeed);
      addDamage(damageByShip, ship.id, damage);
      ship.velocity = removeInwardVelocity(ship.velocity, collision.normal);
      event(state, "TerrainContact", { shipId: ship.id, position: { ...ship.position }, damage, impactSpeed });
    }
  }
  resolveShipContacts(state, damageByShip, killerTeams);
  updateIslandDiscoveries(state);
  spawnProjectiles(state);
  resolveProjectiles(state, previousPositions, damageByShip, killerTeams);
  resolveInteractions(state, interactionIntents);
  resolveReturnsAndCaptures(state);
  evaluateOutcome(state);
  state.tick += 1;
  return state;
}

export function runSteps(initial: WorldState, controls: (tick: number, state: WorldState) => Partial<StepControls>, ticks: number): WorldState {
  let state = initial;
  for (let index = 0; index < ticks; index += 1) state = stepWorld(state, controls(state.tick, state));
  return state;
}

export function canonicalKinematicState(state: WorldState): unknown {
  return {
    tick: state.tick,
    ships: [...state.ships].sort((a, b) => a.id.localeCompare(b.id)).map(ship => ({ id: ship.id, position: ship.position, velocity: ship.velocity, heading: ship.heading, health: ship.health, alive: ship.alive })),
  };
}
