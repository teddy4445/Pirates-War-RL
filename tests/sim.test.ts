import { describe, expect, it } from "vitest";
import { defaultConfig, twinHarbors } from "../src/content/fixtures";
import type { MapDefinition, ShipAction } from "../src/contracts/types";
import { circleOverlapsPolygon } from "../src/sim/geometry";
import { validateMap } from "../src/sim/map";
import { canonicalKinematicState, createInitialWorld, runSteps, stepWorld } from "../src/sim/world";

const forward = (shipId: string): ShipAction => ({ shipId, throttle: 1, turn: 0, fire: false, interact: { type: "none" } });

describe("P02 pure world and kinematics", () => {
  it("G01 produces equal traces for equal initial state and actions", () => {
    const first = runSteps(createInitialWorld(defaultConfig, twinHarbors, 17), (_tick, state) => ({ blue: [forward(state.ships.find(ship => ship.teamId === "blue")!.id)] }), 240);
    const second = runSteps(createInitialWorld(defaultConfig, twinHarbors, 17), (_tick, state) => ({ blue: [forward(state.ships.find(ship => ship.teamId === "blue")!.id)] }), 240);
    expect(canonicalKinematicState(first)).toEqual(canonicalKinematicState(second));
  });

  it("G02 applies acceleration, drag, clamp, reverse and heading wrap by fixed ticks", () => {
    let state = createInitialWorld({ ...defaultConfig, mode: "duel" }, twinHarbors, 3);
    const id = state.ships.find(ship => ship.teamId === "blue")!.id;
    state = runSteps(state, () => ({ blue: [forward(id)] }), 600);
    const moving = state.ships.find(ship => ship.id === id)!;
    expect(Math.hypot(moving.velocity.x, moving.velocity.y)).toBeLessThanOrEqual(defaultConfig.ship.maxSpeed + 1e-9);
    const reverse = { ...forward(id), throttle: -1, turn: 1 };
    state = runSteps(state, () => ({ blue: [reverse] }), 120);
    const turned = state.ships.find(ship => ship.id === id)!;
    expect(turned.heading).toBeGreaterThanOrEqual(-Math.PI);
    expect(turned.heading).toBeLessThan(Math.PI);
  });

  it("G03 sweeps a fast circle into a thin island without tunneling", () => {
    const map: MapDefinition = { ...twinHarbors, islands: [{ id: "thin", polygon: [[500, 0], [501, 0], [501, 900], [500, 900]] }] };
    const state = createInitialWorld({ ...defaultConfig, mode: "duel", ship: { ...defaultConfig.ship, maxSpeed: 30_000, acceleration: 0, dragPerSecond: 0 } }, map, 1);
    const ship = state.ships.find(item => item.teamId === "blue")!;
    ship.position = { x: 480, y: 450 };
    ship.velocity = { x: 2400, y: 0 };
    const next = stepWorld(state, { blue: [{ ...forward(ship.id), throttle: 0 }] });
    const moved = next.ships.find(item => item.id === ship.id)!;
    expect(moved.position.x).toBeLessThanOrEqual(488.001);
    expect(circleOverlapsPolygon(moved.position, moved.radius, map.islands[0]!.polygon)).toBe(false);
  });

  it("validates the curated map and its navigable approaches", () => {
    expect(validateMap(twinHarbors, defaultConfig.ship.radius)).toEqual({ valid: true, errors: [] });
  });
});
