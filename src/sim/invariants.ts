import { circleOverlapsPolygon, distance } from "./geometry";
import type { WorldState } from "./types";

export function worldInvariantErrors(state: WorldState): string[] {
  const errors: string[] = [];
  for (const ship of state.ships) {
    if (ship.health < 0 || ship.health > state.config.ship.maxHealth) errors.push(`${ship.id} health out of bounds`);
    if (ship.alive && state.map.islands.some(island => circleOverlapsPolygon(ship.position, ship.radius, island.polygon))) errors.push(`${ship.id} overlaps solid land`);
    if (!ship.alive && ship.carriedFlagId !== null) errors.push(`${ship.id} is dead while carrying a flag`);
    if (ship.carriedFlagId) {
      const flag = state.flags.find(candidate => candidate.id === ship.carriedFlagId);
      if (!flag || flag.state !== "carried" || flag.carrierShipId !== ship.id) errors.push(`${ship.id} carry reference is inconsistent`);
    }
  }
  for (let leftIndex = 0; leftIndex < state.ships.length; leftIndex += 1) {
    const left = state.ships[leftIndex];
    if (!left?.alive) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < state.ships.length; rightIndex += 1) {
      const right = state.ships[rightIndex];
      if (right?.alive && distance(left.position, right.position) < left.radius + right.radius - 1e-4) errors.push(`${left.id} overlaps ${right.id}`);
    }
  }
  if (state.flags.length !== 2 || new Set(state.flags.map(flag => flag.id)).size !== 2) errors.push("world must contain exactly two distinct flags");
  for (const flag of state.flags) {
    if (flag.state === "carried") {
      const carrier = state.ships.find(ship => ship.id === flag.carrierShipId);
      if (!carrier?.alive || carrier.carriedFlagId !== flag.id || flag.position !== null) errors.push(`${flag.id} carrier reference is inconsistent`);
    } else if (flag.carrierShipId !== null || flag.position === null) errors.push(`${flag.id} location is inconsistent`);
  }
  if (!Number.isInteger(state.tick) || state.tick < 0) errors.push("tick must be a nonnegative integer");
  if (!Number.isInteger(state.scores.blue) || !Number.isInteger(state.scores.rose) || state.scores.blue < 0 || state.scores.rose < 0) errors.push("scores must be nonnegative integers");
  for (const teamId of ["blue", "rose"] as const) {
    const ids = state.discoveredIslandIds?.[teamId] ?? [];
    if (new Set(ids).size !== ids.length || ids.some(id => !state.map.islands.some(island => island.id === id))) errors.push(`${teamId} island discovery contains invalid IDs`);
  }
  return errors;
}
