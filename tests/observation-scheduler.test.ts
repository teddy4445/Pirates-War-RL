import { describe, expect, it } from "vitest";
import { decodeDiscreteV1, discreteActionMaskV1, encodeShipV1 } from "../src/contracts/adapters";
import { neutralAction } from "../src/contracts/validation";
import { defaultConfig, twinHarbors } from "../src/content/fixtures";
import { buildObservation } from "../src/sim/observation";
import { commitDecision, createDecisionBatch, submitDecision } from "../src/sim/scheduler";
import { createInitialWorld, stepWorld } from "../src/sim/world";

describe("P04 visibility, adapters, and simultaneous decisions", () => {
  it("F01 produces identical fog observations and features for hidden-state variants", () => {
    const config = { ...defaultConfig, mode: "fog-duel" as const };
    const first = createInitialWorld(config, twinHarbors, 12);
    const second = createInitialWorld(config, twinHarbors, 12);
    const hidden = second.ships.find(ship => ship.teamId === "rose")!;
    hidden.position = { x: 1300, y: 700 }; hidden.heading = 1.23; hidden.health = 25; hidden.cooldownTicks = 17;
    const firstObservation = buildObservation(first, "blue", 1, 6);
    const secondObservation = buildObservation(second, "blue", 1, 6);
    expect(firstObservation).toEqual(secondObservation);
    const shipId = firstObservation.ships[0]!.id;
    expect(encodeShipV1(firstObservation, shipId)).toEqual(encodeShipV1(secondObservation, shipId));
    expect(discreteActionMaskV1(firstObservation, shipId)).toEqual(discreteActionMaskV1(secondObservation, shipId));
  });

  it("F03 omits hidden enemies in fog and includes them in full mode", () => {
    const fog = buildObservation(createInitialWorld({ ...defaultConfig, mode: "fog-duel" }, twinHarbors, 1), "blue", 1, 6);
    const full = buildObservation(createInitialWorld({ ...defaultConfig, mode: "duel" }, twinHarbors, 1), "blue", 1, 6);
    expect(fog.enemies).toHaveLength(0);
    expect(full.enemies).toHaveLength(1);
  });

  it("reveals complete island polygons once any shoreline enters fog vision and remembers them", () => {
    const config = { ...structuredClone(defaultConfig), mode: "fog-duel" as const, vision: { ...defaultConfig.vision, staticMapKnown: false } };
    let state = createInitialWorld(config, twinHarbors, 18);
    expect(buildObservation(state, "blue", 0, 6).islands.map(island => island.id)).toEqual(["blue-home-island"]);
    state.ships.find(ship => ship.id === "blue-1")!.position = { x: 650, y: 360 };
    state = stepWorld(state);
    expect(buildObservation(state, "blue", 0, 6).islands.map(island => island.id)).toContain("north-island");
    state.ships.find(ship => ship.id === "blue-1")!.position = { x: 230, y: 360 };
    expect(buildObservation(state, "blue", 0, 6).islands.map(island => island.id)).toContain("north-island");
    const full = createInitialWorld({ ...config, mode: "duel" }, twinHarbors, 18);
    expect(buildObservation(full, "blue", 0, 6).islands).toHaveLength(twinHarbors.islands.length);
  });

  it("F04 returns exactly 64 finite features and deterministic discrete decoding", () => {
    const observation = buildObservation(createInitialWorld({ ...defaultConfig, mode: "duel" }, twinHarbors, 2), "blue", 4, 6);
    const shipId = observation.ships[0]!.id;
    const features = encodeShipV1(observation, shipId);
    expect(features).toHaveLength(64);
    expect(features.every(Number.isFinite)).toBe(true);
    expect(decodeDiscreteV1(observation, shipId, 4)).toEqual(neutralAction(shipId));
    expect(decodeDiscreteV1(observation, shipId, 7)).toEqual({ ...neutralAction(shipId), throttle: 1 });
  });

  it("T01 commits both replies only for the shared future activation tick", () => {
    const state = createInitialWorld({ ...defaultConfig, mode: "duel" }, twinHarbors, 3);
    const batch = createDecisionBatch(state, 9, 1000);
    expect(batch.observations.blue.observedAtTick).toBe(0);
    expect(batch.observations.rose.observedAtTick).toBe(0);
    expect(batch.applyAtTick).toBe(6);
    const blueId = batch.observations.blue.ships[0]!.id;
    const roseId = batch.observations.rose.ships[0]!.id;
    expect(submitDecision(batch, "rose", 9, { actions: [{ ...neutralAction(roseId), throttle: 1 }] }, 1001)).toBe(true);
    expect(submitDecision(batch, "blue", 9, { actions: [{ ...neutralAction(blueId), throttle: 1 }] }, 1099)).toBe(true);
    const committed = commitDecision(batch);
    expect(committed.applyAtTick).toBe(6);
    expect(committed.fallback).toEqual({ blue: false, rose: false });
  });

  it("T02 accepts the exact deadline, rejects late/stale/duplicate, and neutralizes fallback", () => {
    const state = createInitialWorld({ ...defaultConfig, mode: "duel" }, twinHarbors, 4);
    const batch = createDecisionBatch(state, 2, 50);
    const blueId = batch.observations.blue.ships[0]!.id;
    expect(submitDecision(batch, "blue", 1, { actions: [] }, 60)).toBe(false);
    expect(submitDecision(batch, "blue", 2, { actions: [{ ...neutralAction(blueId), throttle: 1 }] }, 150)).toBe(true);
    expect(submitDecision(batch, "blue", 2, { actions: [] }, 149)).toBe(false);
    expect(submitDecision(batch, "rose", 2, { actions: [] }, 150.0001)).toBe(false);
    const committed = commitDecision(batch);
    expect(committed.fallback.rose).toBe(true);
    expect(committed.controls.rose.every(item => item.fire === false && item.interact.type === "none")).toBe(true);
  });
});
