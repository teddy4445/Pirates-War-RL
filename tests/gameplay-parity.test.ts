import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, RULES_VERSION, type FleetRLConfig, type MapDefinition, type TeamId } from "../src/contracts/types";
import { defaultConfig, twinHarbors } from "../src/content/fixtures";
import { buildObservation } from "../src/sim/observation";
import type { StepControls, WorldEvent, WorldState } from "../src/sim/types";
import { createInitialWorld, stepWorld } from "../src/sim/world";

type JsonRecord = Record<string, any>;
type GameplayCase = {
  id: string;
  seed: number;
  tickCount: number;
  configPatch?: JsonRecord;
  mapPatch?: JsonRecord;
  setup?: { ships?: Record<string, JsonRecord>; flags?: Record<string, JsonRecord>; world?: JsonRecord };
  schedule?: { tick: number; controls: Partial<StepControls> }[];
  expected: { state: unknown; events: WorldEvent[]; observations: Record<TeamId, unknown> };
};
type Fixture = { rulesVersion: string; absoluteTolerance: number; relativeTolerance: number; defaultConfig: FleetRLConfig; cases: GameplayCase[] };

const fixture = JSON.parse(readFileSync(`${process.cwd()}/python/src/fleetrl/data/conformance/gameplay-v1.json`, "utf8")) as Fixture;

function deepMerge(target: JsonRecord, patch: JsonRecord): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) deepMerge(target[key], value);
    else target[key] = structuredClone(value);
  }
}

function compareNumeric(actual: any, expected: any, path = "root"): void {
  if (typeof expected === "number") {
    const difference = Math.abs(actual - expected);
    const allowed = fixture.absoluteTolerance + fixture.relativeTolerance * Math.abs(expected);
    if (difference > allowed) throw new Error(`${path}: ${actual} versus ${expected}`);
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error(`${path}: array length mismatch`);
    expected.forEach((value, index) => compareNumeric(actual[index], value, `${path}[${index}]`));
  } else if (expected && typeof expected === "object") {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) throw new Error(`${path}: object keys differ`);
    for (const [key, value] of Object.entries(expected)) compareNumeric(actual[key], value, `${path}.${key}`);
  } else if (!Object.is(actual, expected)) throw new Error(`${path}: ${String(actual)} versus ${String(expected)}`);
}

function applySetup(state: WorldState, setup: GameplayCase["setup"]): void {
  for (const [shipId, patch] of Object.entries(setup?.ships ?? {})) deepMerge(state.ships.find(ship => ship.id === shipId) as unknown as JsonRecord, patch);
  for (const [flagId, patch] of Object.entries(setup?.flags ?? {})) deepMerge(state.flags.find(flag => flag.id === flagId) as unknown as JsonRecord, patch);
  deepMerge(state as unknown as JsonRecord, setup?.world ?? {});
}

function canonicalState(state: WorldState): unknown {
  return {
    tick: state.tick,
    seed: state.seed,
    tieBreakRngState: state.tieBreakRngState,
    nextEntitySequence: state.nextEntitySequence,
    ships: [...state.ships].sort((a, b) => a.id.localeCompare(b.id)).map(ship => structuredClone(ship)),
    flags: [...state.flags].sort((a, b) => a.id.localeCompare(b.id)).map(flag => structuredClone(flag)),
    projectiles: [...state.projectiles].sort((a, b) => a.id.localeCompare(b.id)).map(projectile => structuredClone(projectile)),
    scores: structuredClone(state.scores),
    kills: structuredClone(state.kills),
    discoveredIslandIds: structuredClone(state.discoveredIslandIds),
    outcome: state.outcome ? structuredClone(state.outcome) : null,
  };
}

describe("Python/browser authoritative gameplay parity", () => {
  it("uses one byte-equivalent default ruleset and current engine pair", () => {
    const example = JSON.parse(readFileSync(`${process.cwd()}/examples/default-config.json`, "utf8"));
    const publicExample = JSON.parse(readFileSync(`${process.cwd()}/public/examples/default-config.json`, "utf8"));
    const versions = JSON.parse(readFileSync(`${process.cwd()}/python/src/fleetrl/data/versions.json`, "utf8"));
    expect(defaultConfig).toEqual(fixture.defaultConfig);
    expect(example).toEqual(fixture.defaultConfig);
    expect(publicExample).toEqual(fixture.defaultConfig);
    expect(fixture.rulesVersion).toBe(RULES_VERSION);
    expect(versions).toEqual(expect.objectContaining({ rulesVersion: RULES_VERSION, browserEngine: ENGINE_VERSION, pythonEngine: "fleetrl-engine-py-v6" }));
  });

  for (const testCase of fixture.cases) it(testCase.id, () => {
    const config = structuredClone(defaultConfig) as unknown as JsonRecord;
    deepMerge(config, testCase.configPatch ?? {});
    const map = structuredClone(twinHarbors) as unknown as JsonRecord;
    deepMerge(map, testCase.mapPatch ?? {});
    let state = createInitialWorld(config as FleetRLConfig, map as MapDefinition, testCase.seed);
    applySetup(state, testCase.setup);
    const schedule = new Map((testCase.schedule ?? []).map(item => [item.tick, item.controls]));
    const events: WorldEvent[] = [];
    for (let index = 0; index < testCase.tickCount; index += 1) {
      state = stepWorld(state, schedule.get(state.tick));
      events.push(...structuredClone(state.events));
    }
    compareNumeric(canonicalState(state), testCase.expected.state, `${testCase.id}.state`);
    compareNumeric(events, testCase.expected.events, `${testCase.id}.events`);
    for (const teamId of ["blue", "rose"] as const) {
      const observation = buildObservation(state, teamId, 9, state.tick + config.timing.decisionIntervalTicks, events);
      compareNumeric(observation, testCase.expected.observations[teamId], `${testCase.id}.observation.${teamId}`);
    }
  });
});
