import type { MapDefinition, Point } from "../contracts/types";

const EPSILON = 1e-9;
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (p: Point, value: number): Point => ({ x: p.x * value, y: p.y * value });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
export const magnitude = (p: Point): number => Math.hypot(p.x, p.y);
export const distance = (a: Point, b: Point): number => magnitude(subtract(a, b));
export const normalize = (p: Point): Point => {
  const length = magnitude(p);
  return length <= EPSILON ? { x: 1, y: 0 } : scale(p, 1 / length);
};
export const clampMagnitude = (p: Point, maximum: number): Point => {
  const length = magnitude(p);
  return length > maximum ? scale(p, maximum / length) : p;
};

export function wrapHeading(angle: number): number {
  const tau = Math.PI * 2;
  return ((angle + Math.PI) % tau + tau) % tau - Math.PI;
}

export function closestPointOnSegment(point: Point, a: Point, b: Point): Point {
  const ab = subtract(b, a);
  const denominator = dot(ab, ab);
  if (denominator <= EPSILON) return { ...a };
  const t = Math.max(0, Math.min(1, dot(subtract(point, a), ab) / denominator));
  return add(a, scale(ab, t));
}

export function pointInPolygon(point: Point, polygon: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const intersects = a[1] > point.y !== b[1] > point.y && point.x < ((b[0] - a[0]) * (point.y - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

export function circleOverlapsPolygon(center: Point, radius: number, polygon: readonly [number, number][]): boolean {
  if (pointInPolygon(center, polygon)) return true;
  for (let index = 0; index < polygon.length; index += 1) {
    const rawA = polygon[index];
    const rawB = polygon[(index + 1) % polygon.length];
    if (!rawA || !rawB) continue;
    const closest = closestPointOnSegment(center, { x: rawA[0], y: rawA[1] }, { x: rawB[0], y: rawB[1] });
    if (distance(center, closest) <= radius + EPSILON) return true;
  }
  return false;
}

function earliestRayCircle(origin: Point, movement: Point, center: Point, radius: number): number | null {
  const relative = subtract(origin, center);
  const a = dot(movement, movement);
  if (a <= EPSILON) return magnitude(relative) <= radius ? 0 : null;
  const b = 2 * dot(relative, movement);
  const c = dot(relative, relative) - radius * radius;
  if (c <= 0) return 0;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  if (first >= -EPSILON && first <= 1 + EPSILON) return Math.max(0, Math.min(1, first));
  if (second >= -EPSILON && second <= 1 + EPSILON) return Math.max(0, Math.min(1, second));
  return null;
}

export function sweepMovingCircles(
  movingStart: Point,
  movingEnd: Point,
  movingRadius: number,
  targetStart: Point,
  targetEnd: Point,
  targetRadius: number,
): number | null {
  return earliestRayCircle(
    subtract(movingStart, targetStart),
    subtract(subtract(movingEnd, movingStart), subtract(targetEnd, targetStart)),
    { x: 0, y: 0 },
    movingRadius + targetRadius,
  );
}

function sweepPointVsCapsule(origin: Point, movement: Point, a: Point, b: Point, radius: number): { time: number; normal: Point } | null {
  const initialClosest = closestPointOnSegment(origin, a, b);
  if (distance(origin, initialClosest) <= radius + EPSILON) return { time: 0, normal: normalize(subtract(origin, initialClosest)) };
  const candidates: { time: number; normal: Point }[] = [];
  for (const endpoint of [a, b]) {
    const time = earliestRayCircle(origin, movement, endpoint, radius);
    if (time !== null) {
      const at = add(origin, scale(movement, time));
      candidates.push({ time, normal: normalize(subtract(at, endpoint)) });
    }
  }
  const edge = subtract(b, a);
  const length = magnitude(edge);
  if (length > EPSILON) {
    const tangent = scale(edge, 1 / length);
    const normal = { x: -tangent.y, y: tangent.x };
    const initialDistance = dot(subtract(origin, a), normal);
    const distanceDelta = dot(movement, normal);
    if (Math.abs(distanceDelta) > EPSILON) {
      for (const signedRadius of [-radius, radius]) {
        const time = (signedRadius - initialDistance) / distanceDelta;
        if (time < -EPSILON || time > 1 + EPSILON) continue;
        const at = add(origin, scale(movement, time));
        const along = dot(subtract(at, a), tangent);
        if (along >= -EPSILON && along <= length + EPSILON) candidates.push({ time: Math.max(0, Math.min(1, time)), normal: scale(normal, Math.sign(signedRadius) || 1) });
      }
    }
  }
  candidates.sort((left, right) => left.time - right.time);
  return candidates[0] ?? null;
}

export interface SweepResult { position: Point; time: number; normal: Point | null; hit: boolean; }

export function sweepCircleAgainstMap(start: Point, end: Point, radius: number, map: MapDefinition): SweepResult {
  const movement = subtract(end, start);
  const candidates: { time: number; normal: Point }[] = [];
  if (start.x < radius) candidates.push({ time: 0, normal: { x: 1, y: 0 } });
  if (start.x > map.world.width - radius) candidates.push({ time: 0, normal: { x: -1, y: 0 } });
  if (start.y < radius) candidates.push({ time: 0, normal: { x: 0, y: 1 } });
  if (start.y > map.world.height - radius) candidates.push({ time: 0, normal: { x: 0, y: -1 } });
  if (movement.x < -EPSILON) {
    const t = (radius - start.x) / movement.x;
    if (t >= 0 && t <= 1) candidates.push({ time: t, normal: { x: 1, y: 0 } });
  } else if (movement.x > EPSILON) {
    const t = (map.world.width - radius - start.x) / movement.x;
    if (t >= 0 && t <= 1) candidates.push({ time: t, normal: { x: -1, y: 0 } });
  }
  if (movement.y < -EPSILON) {
    const t = (radius - start.y) / movement.y;
    if (t >= 0 && t <= 1) candidates.push({ time: t, normal: { x: 0, y: 1 } });
  } else if (movement.y > EPSILON) {
    const t = (map.world.height - radius - start.y) / movement.y;
    if (t >= 0 && t <= 1) candidates.push({ time: t, normal: { x: 0, y: -1 } });
  }
  for (const island of map.islands) {
    if (pointInPolygon(start, island.polygon)) candidates.push({ time: 0, normal: scale(normalize(movement), -1) });
    for (let index = 0; index < island.polygon.length; index += 1) {
      const rawA = island.polygon[index];
      const rawB = island.polygon[(index + 1) % island.polygon.length];
      if (!rawA || !rawB) continue;
      const collision = sweepPointVsCapsule(start, movement, { x: rawA[0], y: rawA[1] }, { x: rawB[0], y: rawB[1] }, radius);
      if (collision) candidates.push(collision);
    }
  }
  candidates.sort((left, right) => left.time - right.time);
  const earliest = candidates[0];
  if (!earliest || earliest.time > 1) return { position: end, time: 1, normal: null, hit: false };
  const safeTime = Math.max(0, earliest.time - 1e-7);
  return { position: add(start, scale(movement, safeTime)), time: safeTime, normal: earliest.normal, hit: true };
}

export function segmentOccluded(a: Point, b: Point, polygons: readonly { polygon: readonly [number, number][] }[]): boolean {
  const movement = subtract(b, a);
  for (const item of polygons) {
    if (pointInPolygon(a, item.polygon) || pointInPolygon(b, item.polygon)) return true;
    for (let index = 0; index < item.polygon.length; index += 1) {
      const ra = item.polygon[index];
      const rb = item.polygon[(index + 1) % item.polygon.length];
      if (!ra || !rb) continue;
      const edgeA = { x: ra[0], y: ra[1] };
      const edge = { x: rb[0] - ra[0], y: rb[1] - ra[1] };
      const cross = movement.x * edge.y - movement.y * edge.x;
      if (Math.abs(cross) < EPSILON) continue;
      const delta = subtract(edgeA, a);
      const t = (delta.x * edge.y - delta.y * edge.x) / cross;
      const u = (delta.x * movement.y - delta.y * movement.x) / cross;
      if (t > EPSILON && t < 1 - EPSILON && u > EPSILON && u < 1 - EPSILON) return true;
    }
  }
  return false;
}
