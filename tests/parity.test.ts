import { describe, expect, it } from "vitest";
import fixture from "../python/src/fleetrl/data/conformance/trajectory-v1.json";
import { defaultConfig, twinHarbors } from "../src/content/fixtures";
import type { GameMode, ShipAction, TeamId } from "../src/contracts/types";
import { canonicalKinematicState, createInitialWorld, stepWorld } from "../src/sim/world";

type Schedule = { tick: number; controls: Record<TeamId, ShipAction[]> };
function compareNumeric(actual: any, expected: any, path = "root"): void {
  if (typeof expected === "number") {
    const difference = Math.abs(actual - expected);
    const allowed = fixture.absoluteTolerance + fixture.relativeTolerance * Math.abs(expected);
    expect(difference, `${path}: ${actual} versus ${expected}`).toBeLessThanOrEqual(allowed);
  } else if (Array.isArray(expected)) {
    expect(actual, path).toHaveLength(expected.length);
    expected.forEach((value, index) => compareNumeric(actual[index], value, `${path}[${index}]`));
  } else if (expected && typeof expected === "object") {
    expect(Object.keys(actual).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) compareNumeric(actual[key], value, `${path}.${key}`);
  } else expect(actual, path).toBe(expected);
}

describe("cross-language materialized-map trajectory parity", () => {
  for (const testCase of fixture.cases) it(testCase.id, () => {
    const stateConfig = { ...defaultConfig, mode: testCase.mode as GameMode };
    let state = createInitialWorld(stateConfig, twinHarbors, testCase.seed);
    const schedule = new Map((testCase.schedule as Schedule[]).map(item => [item.tick, item.controls]));
    const expected = new Map(testCase.snapshots.map(item => [item.tick, item.state]));
    compareNumeric(canonicalKinematicState(state), expected.get(0), `${testCase.id}@0`);
    while (state.tick < 240) {
      state = stepWorld(state, schedule.get(state.tick));
      const snapshot = expected.get(state.tick);
      if (snapshot) compareNumeric(canonicalKinematicState(state), snapshot, `${testCase.id}@${state.tick}`);
    }
  });
});
