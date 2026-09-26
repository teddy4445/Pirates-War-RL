import type { MapDefinition, Observation, Point, ShipView } from "../contracts/types";
import { circleOverlapsPolygon, distance, sweepCircleAgainstMap } from "../sim/geometry";

interface NavigationGrid {
  cell: number;
  columns: number;
  rows: number;
  points: Point[];
  walkable: boolean[];
  neighbors: number[][];
  map: MapDefinition;
}

const grids = new Map<string, NavigationGrid>();
const routes = new Map<string, Point[]>();

function mapSignature(observation: Observation): string {
  const geometry = observation.islands.map(island => `${island.id}:${island.polygon.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(";")}`).join("|");
  return `${observation.world.width}x${observation.world.height}|${geometry}`;
}

function navigationMap(observation: Observation): MapDefinition {
  return {
    schemaVersion: "fleetrl-map-v1",
    id: "builtin-navigation-map",
    world: { ...observation.world },
    islands: observation.islands.map(island => ({ id: island.id, polygon: island.polygon.map(([x, y]): [number, number] => [x, y]) })),
    bases: [],
    flagSites: [],
  };
}

function clearLine(map: MapDefinition, start: Point, end: Point, radius: number): boolean {
  return !sweepCircleAgainstMap(start, end, radius, map).hit;
}

function gridFor(observation: Observation, signature: string): NavigationGrid {
  const cached = grids.get(signature);
  if (cached) return cached;
  const cell = 46;
  const margin = Math.max(22, observation.publicRules.shipRadius + 9);
  const columns = Math.floor((observation.world.width - margin * 2) / cell) + 1;
  const rows = Math.floor((observation.world.height - margin * 2) / cell) + 1;
  const map = navigationMap(observation);
  const points: Point[] = [];
  const walkable: boolean[] = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const point = { x: margin + column * cell, y: margin + row * cell };
    points.push(point);
    const radius = observation.publicRules.shipRadius + 5;
    const insideBounds = point.x >= radius && point.y >= radius && point.x <= observation.world.width - radius && point.y <= observation.world.height - radius;
    walkable.push(insideBounds && !map.islands.some(island => circleOverlapsPolygon(point, radius, island.polygon)));
  }
  const neighbors = points.map(() => [] as number[]);
  const offsets = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
  for (let index = 0; index < points.length; index += 1) {
    if (!walkable[index]) continue;
    const column = index % columns;
    const row = Math.floor(index / columns);
    for (const [dx, dy] of offsets) {
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
      const next = nextRow * columns + nextColumn;
      const diagonalClear = !dx || !dy || (walkable[row * columns + nextColumn] && walkable[nextRow * columns + column]);
      if (walkable[next] && diagonalClear) neighbors[index]!.push(next);
    }
  }
  const grid = { cell, columns, rows, points, walkable, neighbors, map };
  grids.set(signature, grid);
  if (grids.size > 24) grids.delete(grids.keys().next().value as string);
  return grid;
}

function closestVisibleNode(grid: NavigationGrid, point: Point, radius: number): number {
  const candidates = grid.points.map((candidate, index) => ({ index, distance: distance(point, candidate) })).filter(candidate => grid.walkable[candidate.index]).sort((left, right) => left.distance - right.distance || left.index - right.index);
  for (const candidate of candidates.slice(0, 32)) if (clearLine(grid.map, point, grid.points[candidate.index]!, radius)) return candidate.index;
  return -1;
}

function route(grid: NavigationGrid, start: Point, target: Point, radius: number): Point[] {
  const startIndex = closestVisibleNode(grid, start, radius);
  const targetIndex = closestVisibleNode(grid, target, radius);
  if (startIndex < 0 || targetIndex < 0) return [target];
  const costs = Array<number>(grid.points.length).fill(Number.POSITIVE_INFINITY);
  const estimates = Array<number>(grid.points.length).fill(Number.POSITIVE_INFINITY);
  const previous = Array<number>(grid.points.length).fill(-1);
  const open = new Set<number>([startIndex]);
  costs[startIndex] = 0;
  estimates[startIndex] = distance(grid.points[startIndex]!, grid.points[targetIndex]!);
  while (open.size) {
    let current = -1;
    let currentEstimate = Number.POSITIVE_INFINITY;
    for (const candidate of open) if (estimates[candidate]! < currentEstimate) { current = candidate; currentEstimate = estimates[candidate]!; }
    if (current === targetIndex) break;
    open.delete(current);
    for (const next of grid.neighbors[current]!) {
      const tentative = costs[current]! + distance(grid.points[current]!, grid.points[next]!);
      if (tentative >= costs[next]!) continue;
      previous[next] = current;
      costs[next] = tentative;
      estimates[next] = tentative + distance(grid.points[next]!, grid.points[targetIndex]!);
      open.add(next);
    }
  }
  if (startIndex !== targetIndex && previous[targetIndex]! < 0) return [target];
  const reversed: Point[] = [];
  for (let cursor = targetIndex; cursor >= 0 && cursor !== startIndex; cursor = previous[cursor]!) reversed.push(grid.points[cursor]!);
  reversed.reverse();
  reversed.push(target);
  return reversed;
}

export function navigationWaypoint(observation: Observation, ship: ShipView, target: Point): Point {
  const signature = mapSignature(observation);
  const grid = gridFor(observation, signature);
  const radius = observation.publicRules.shipRadius + 3;
  if (clearLine(grid.map, ship.position, target, radius)) return target;
  const targetBucket = `${Math.round(target.x / 24)}:${Math.round(target.y / 24)}`;
  const cacheKey = `${signature}|${ship.id}|${targetBucket}`;
  let path = routes.get(cacheKey);
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  if (path) path.forEach((point, index) => { const value = distance(ship.position, point); if (value < closestDistance) { closestDistance = value; closestIndex = index; } });
  if (!path || closestDistance > grid.cell * 2.7) {
    path = route(grid, ship.position, target, radius);
    routes.set(cacheKey, path);
    closestIndex = 0;
    if (routes.size > 160) routes.delete(routes.keys().next().value as string);
  }
  let waypointIndex = Math.min(path.length - 1, closestIndex + (closestDistance < grid.cell * .75 ? 1 : 0));
  for (let candidate = Math.min(path.length - 1, waypointIndex + 4); candidate > waypointIndex; candidate -= 1) {
    if (clearLine(grid.map, ship.position, path[candidate]!, radius)) { waypointIndex = candidate; break; }
  }
  return path[waypointIndex] ?? target;
}
