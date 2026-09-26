import type { MapDefinition, Point } from "../contracts/types";
import { twinHarbors } from "../content/fixtures";
import { validateMap } from "./map";
import { deriveSeed, XorShift32 } from "./rng";

export interface GeneratedMap { map: MapDefinition; attempts: number; usedFallback: boolean; failure?: string; }

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 900;
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const rotatePoint = (point: Point): Point => ({ x: round(WORLD_WIDTH - point.x), y: round(WORLD_HEIGHT - point.y) });
const rotatePolygon = (points: [number, number][]): [number, number][] => points.map(([x, y]): [number, number] => [round(WORLD_WIDTH - x), round(WORLD_HEIGHT - y)]).reverse();

function islandPair(rng: XorShift32, index: number): { north: [number, number][]; south: [number, number][]; northSite: Point; northApproach: Point; southSite: Point; southApproach: Point } {
  const cx = 560 + rng.nextFloat() * 480;
  const cy = 145 + index * 92 + rng.nextFloat() * 24;
  const radiusX = 62 + rng.nextFloat() * 78;
  const radiusY = 42 + rng.nextFloat() * 34;
  const vertexCount = 8 + (rng.nextUint32() % 2) * 4;
  const north: [number, number][] = [];
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const angle = vertex / vertexCount * Math.PI * 2;
    const bottom = vertex === vertexCount / 4;
    const factor = bottom ? 1.12 : .76 + rng.nextFloat() * .24;
    north.push([round(cx + Math.cos(angle) * radiusX * factor), round(cy + Math.sin(angle) * radiusY * factor)]);
  }
  const bottom = north[vertexCount / 4]!;
  const northSite = { x: bottom[0], y: bottom[1] };
  const northApproach = { x: northSite.x, y: round(northSite.y + 28) };
  return { north, south: rotatePolygon(north), northSite, northApproach, southSite: rotatePoint(northSite), southApproach: rotatePoint(northApproach) };
}

function centralIsland(rng: XorShift32): { polygon: [number, number][]; northSite: Point; northApproach: Point; southSite: Point; southApproach: Point } {
  const radiusX = 150 + rng.nextFloat() * 110;
  const radiusY = 86 + rng.nextFloat() * 72;
  const halfVertices = 5 + rng.nextUint32() % 3;
  const factors = Array.from({ length: halfVertices }, () => .78 + rng.nextFloat() * .22);
  const polygon: [number, number][] = [];
  for (let vertex = 0; vertex < halfVertices * 2; vertex += 1) {
    const angle = vertex / (halfVertices * 2) * Math.PI * 2;
    const factor = factors[vertex % halfVertices]!;
    polygon.push([round(WORLD_WIDTH / 2 + Math.cos(angle) * radiusX * factor), round(WORLD_HEIGHT / 2 + Math.sin(angle) * radiusY * factor)]);
  }
  const southEdge = polygon.reduce((best, point) => point[1] > best[1] ? point : best, polygon[0]!);
  const northEdge = rotatePoint({ x: southEdge[0], y: southEdge[1] });
  const southSite = { x: southEdge[0], y: southEdge[1] };
  const southApproach = { x: southSite.x, y: round(southSite.y + 28) };
  const northSite = northEdge;
  const northApproach = { x: northSite.x, y: round(northSite.y - 28) };
  return { polygon, northSite, northApproach, southSite, southApproach };
}

function wreckPair(rng: XorShift32, index: number): { north: [number, number][]; south: [number, number][] } {
  const cx = 340 + index * 125 + rng.nextFloat() * 86;
  const cy = 190 + rng.nextFloat() * 520;
  const halfLength = 28 + rng.nextFloat() * 27;
  const halfWidth = 9 + rng.nextFloat() * 9;
  const angle = -.55 + rng.nextFloat() * 1.1;
  const local: [number, number][] = [[-halfLength, -halfWidth], [halfLength * .72, -halfWidth], [halfLength, 0], [halfLength * .72, halfWidth], [-halfLength, halfWidth], [-halfLength * 1.08, 0]];
  const north = local.map(([x, y]): [number, number] => [round(cx + x * Math.cos(angle) - y * Math.sin(angle)), round(cy + x * Math.sin(angle) + y * Math.cos(angle))]);
  return { north, south: rotatePolygon(north) };
}

function centralWreck(rng: XorShift32): [number, number][] {
  const halfLength = 48 + rng.nextFloat() * 30;
  const halfWidth = 14 + rng.nextFloat() * 9;
  const angle = rng.nextFloat() * Math.PI;
  const local: [number, number][] = [[-halfLength, -halfWidth], [halfLength, -halfWidth], [halfLength, halfWidth], [-halfLength, halfWidth]];
  return local.map(([x, y]): [number, number] => [round(WORLD_WIDTH / 2 + x * Math.cos(angle) - y * Math.sin(angle)), round(WORLD_HEIGHT / 2 + x * Math.sin(angle) + y * Math.cos(angle))]);
}

export function generateProceduralMap(seed: number, maxAttempts = 24): GeneratedMap {
  const rng = new XorShift32(deriveSeed(seed, "map-generation"));
  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const map: MapDefinition = structuredClone(twinHarbors);
    const homeIslands = map.islands.filter(island => island.id.includes("home-island"));
    const homeSites = map.flagSites.filter(site => site.reservedHome);
    const islands = [...homeIslands];
    const sites = [...homeSites];
    const centralLayout = rng.nextUint32() % 4 === 0;
    let islandPairCount = 0;
    if (centralLayout) {
      const island = centralIsland(rng);
      islands.push({ id: "archipelago-central", polygon: island.polygon });
      sites.push(
        { id: "archipelago-central-north-site", position: island.northSite, approach: island.northApproach, radius: 34, reservedHome: false },
        { id: "archipelago-central-south-site", position: island.southSite, approach: island.southApproach, radius: 34, reservedHome: false },
      );
    } else {
      islandPairCount = 1 + rng.nextUint32() % 3;
      for (let index = 0; index < islandPairCount; index += 1) {
        const pair = islandPair(rng, index);
        islands.push({ id: `archipelago-${index + 1}-north`, polygon: pair.north }, { id: `archipelago-${index + 1}-south`, polygon: pair.south });
        sites.push(
          { id: `archipelago-${index + 1}-north-site`, position: pair.northSite, approach: pair.northApproach, radius: 34, reservedHome: false },
          { id: `archipelago-${index + 1}-south-site`, position: pair.southSite, approach: pair.southApproach, radius: 34, reservedHome: false },
        );
      }
    }
    const wreckCount = rng.nextUint32() % 7;
    for (let index = 0; index < Math.floor(wreckCount / 2); index += 1) {
      const wreck = wreckPair(rng, index);
      islands.push({ id: `wreck-shoal-${index + 1}-north`, polygon: wreck.north }, { id: `wreck-shoal-${index + 1}-south`, polygon: wreck.south });
    }
    if (wreckCount % 2) islands.push({ id: "wreck-shoal-central", polygon: centralWreck(rng) });
    map.id = `shifting-archipelago-${seed}`;
    map.islands = islands;
    map.flagSites = sites;
    map.metadata = { generator: "fleetrl-archipelago-v3", seed, attempt, maxAttempts, symmetry: "180-degree", layout: centralLayout ? "central-island" : "island-pairs", islandPairs: islandPairCount, neutralIslandCount: centralLayout ? 1 : islandPairCount * 2, wreckCount, flagRelocation: "nearest-neutral-island" };
    const validation = validateMap(map, 12);
    if (validation.valid) return { map, attempts: attempt, usedFallback: false };
    lastErrors = validation.errors;
  }
  const fallback: MapDefinition = structuredClone(twinHarbors);
  fallback.id = `procedural-fallback-${seed}`;
  fallback.metadata = { generator: "fleetrl-archipelago-v3", seed, maxAttempts, fallback: twinHarbors.id, failure: lastErrors.join("; ") };
  return { map: fallback, attempts: maxAttempts, usedFallback: true, failure: `Generation exhausted ${maxAttempts} attempts: ${lastErrors.join("; ")}` };
}
