import type { MapDefinition, Point } from "../contracts/types";
import { circleOverlapsPolygon, distance } from "./geometry";

export interface MapValidation { valid: boolean; errors: string[]; }

function pointIsNavigable(point: Point, radius: number, map: MapDefinition): boolean {
  if (point.x < radius || point.y < radius || point.x > map.world.width - radius || point.y > map.world.height - radius) return false;
  return !map.islands.some(island => circleOverlapsPolygon(point, radius, island.polygon));
}

function deliveryZonesConnected(map: MapDefinition, radius: number): boolean {
  const bases = [...map.bases].sort((a, b) => a.teamId.localeCompare(b.teamId));
  const start = bases[0]?.deliveryZone.center;
  const target = bases[1]?.deliveryZone.center;
  if (!start || !target) return false;
  const cell = Math.max(radius * 2.5, 30);
  const columns = Math.ceil(map.world.width / cell);
  const rows = Math.ceil(map.world.height / cell);
  const key = (x: number, y: number) => `${x},${y}`;
  const nearestCell = (p: Point) => ({ x: Math.max(0, Math.min(columns - 1, Math.round(p.x / cell))), y: Math.max(0, Math.min(rows - 1, Math.round(p.y / cell))) });
  const first = nearestCell(start);
  const goal = nearestCell(target);
  const queue = [first];
  const seen = new Set([key(first.x, first.y)]);
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    if (current.x === goal.x && current.y === goal.y) return true;
    const directions: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of directions) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (x < 0 || y < 0 || x >= columns || y >= rows || seen.has(key(x, y))) continue;
      const point = { x: Math.min(map.world.width - radius, Math.max(radius, x * cell)), y: Math.min(map.world.height - radius, Math.max(radius, y * cell)) };
      if (!pointIsNavigable(point, radius, map)) continue;
      seen.add(key(x, y));
      queue.push({ x, y });
    }
  }
  return false;
}

export function validateMap(map: MapDefinition, shipRadius = 12): MapValidation {
  const errors: string[] = [];
  if (map.schemaVersion !== "fleetrl-map-v1") errors.push("unsupported map schemaVersion");
  if (!Number.isFinite(map.world.width) || !Number.isFinite(map.world.height) || map.world.width <= 0 || map.world.height <= 0) errors.push("world dimensions must be positive and finite");
  const ids = new Set<string>();
  for (const island of map.islands) {
    if (ids.has(island.id)) errors.push(`duplicate island id ${island.id}`);
    ids.add(island.id);
    if (island.polygon.length < 3) errors.push(`island ${island.id} needs at least three vertices`);
    for (const [x, y] of island.polygon) if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > map.world.width || y > map.world.height) errors.push(`island ${island.id} has an out-of-bounds vertex`);
  }
  if (map.bases.length !== 2 || !map.bases.some(base => base.teamId === "blue") || !map.bases.some(base => base.teamId === "rose")) errors.push("map requires one blue and one rose base");
  for (const base of map.bases) {
    if (base.spawnSlots.length < 1 || base.spawnSlots.length > 8) errors.push(`${base.teamId} base needs 1-8 spawn slots`);
    for (const spawn of base.spawnSlots) if (!pointIsNavigable(spawn, shipRadius, map)) errors.push(`${base.teamId} spawn is not navigable`);
    if (!pointIsNavigable(base.deliveryZone.center, shipRadius, map)) errors.push(`${base.teamId} delivery zone is not navigable`);
  }
  const siteIds = new Set<string>();
  for (const site of map.flagSites) {
    if (siteIds.has(site.id)) errors.push(`duplicate flag site id ${site.id}`);
    siteIds.add(site.id);
    if (!pointIsNavigable(site.approach, shipRadius, map)) errors.push(`flag site ${site.id} approach is not navigable`);
    if (distance(site.position, site.approach) > site.radius + 1e-6) errors.push(`flag site ${site.id} approach exceeds its interaction radius`);
  }
  if (!deliveryZonesConnected(map, shipRadius)) errors.push("delivery zones are not connected by validated water cells");
  return { valid: errors.length === 0, errors };
}
