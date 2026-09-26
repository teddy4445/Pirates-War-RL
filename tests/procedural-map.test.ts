import { describe, expect, it } from "vitest";
import { generateProceduralMap } from "../src/sim/procedural-map";
import { validateMap } from "../src/sim/map";
import fixture from "../python/src/fleetrl/data/conformance/procedural-maps-v1.json";

describe("seeded procedural maps", () => {
  it.each([1, 7, 99])("generates valid deterministic symmetric geometry for seed %i", seed => {
    const first = generateProceduralMap(seed); const second = generateProceduralMap(seed);
    expect(first).toEqual(second); expect(first.usedFallback).toBe(false); expect(validateMap(first.map)).toEqual({ valid: true, errors: [] });
    const northIslands = first.map.islands.filter(island => island.id.endsWith("-north"));
    for (const north of northIslands) { const south = first.map.islands.find(island => island.id === north.id.replace(/-north$/, "-south"))!; const expected: [number, number][] = north.polygon.map(([x, y]): [number, number] => [1600 - x, 900 - y]).reverse(); south.polygon.forEach(([x, y], index) => { const [expectedX, expectedY] = expected[index]!; expect(x).toBeCloseTo(expectedX, 6); expect(y).toBeCloseTo(expectedY, 6); }); }
    const central = first.map.islands.find(island => island.id === "archipelago-central");
    if (central) for (const [x, y] of central.polygon) expect(central.polygon.some(([otherX, otherY]) => Math.abs(otherX - (1600 - x)) < 1e-6 && Math.abs(otherY - (900 - y)) < 1e-6)).toBe(true);
    expect(first.map.flagSites.filter(site => !site.reservedHome).length).toBeGreaterThanOrEqual(2);
  });
  it("varies island count and coastline shapes by seed", () => { const maps = [1, 7, 19, 99].map(seed => generateProceduralMap(seed).map); expect(new Set(maps.map(map => map.islands.length)).size).toBeGreaterThan(1); expect(new Set(maps.flatMap(map => map.islands.filter(island => island.id.startsWith("archipelago-")).map(island => island.polygon.length))).size).toBeGreaterThan(1); });
  it("covers the seeded zero-to-six wreck range and central/multi-island layouts", () => {
    const maps = Array.from({ length: 160 }, (_, seed) => generateProceduralMap(seed).map);
    expect(new Set(maps.map(map => Number(map.metadata?.wreckCount)))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    expect(maps.some(map => map.metadata?.layout === "central-island" && map.metadata?.neutralIslandCount === 1)).toBe(true);
    expect(maps.some(map => map.metadata?.layout === "island-pairs" && Number(map.metadata?.neutralIslandCount) >= 4)).toBe(true);
  });
  it("matches the native Python procedural-map conformance fixture", () => {
    for (const item of fixture.seeds) expect(generateProceduralMap(item.seed).map).toEqual(item.map);
  });
});
