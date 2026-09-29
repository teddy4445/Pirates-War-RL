import { describe, expect, it } from "vitest";
import { defaultConfig, twinHarbors } from "../src/content/fixtures";
import type { FleetRLConfig, ShipAction } from "../src/contracts/types";
import { neutralAction } from "../src/contracts/validation";
import { worldInvariantErrors } from "../src/sim/invariants";
import { createInitialWorld, runSteps, stepWorld } from "../src/sim/world";

const action = (shipId: string, values: Partial<ShipAction> = {}): ShipAction => ({ ...neutralAction(shipId), ...values });
const duelConfig = (changes: Partial<FleetRLConfig> = {}): FleetRLConfig => ({ ...defaultConfig, mode: "duel", shipsPerTeam: 1, ...changes });

describe("P03 combat, flags, respawn and outcomes", () => {
  it("damages friendly and enemy ships from each hull's own speed toward the shared center", () => {
    const impactConfig = { ...defaultConfig, mode: "fleet" as const, shipsPerTeam: 2, ship: { ...defaultConfig.ship, acceleration: 0, dragPerSecond: 0 } };
    const collide = (friendly: boolean) => {
      const state = createInitialWorld(impactConfig, twinHarbors, friendly ? 31 : 32);
      const left = state.ships.find(ship => ship.id === "blue-1")!;
      const right = state.ships.find(ship => ship.id === (friendly ? "blue-2" : "rose-1"))!;
      left.position = { x: 500, y: 450 }; left.velocity = { x: 40, y: 0 };
      right.position = { x: 523, y: 450 }; right.velocity = { x: -20, y: 0 };
      const next = stepWorld(state);
      return { next, left: next.ships.find(ship => ship.id === left.id)!, right: next.ships.find(ship => ship.id === right.id)! };
    };

    for (const friendly of [true, false]) {
      const { next, left, right } = collide(friendly);
      expect(left.health).toBe(92);
      expect(right.health).toBe(96);
      expect(next.events.find(record => record.type === "ShipContact")).toEqual(expect.objectContaining({ damage: 8, otherDamage: 4, impactSpeed: 40, otherImpactSpeed: 20 }));
    }
  });

  it("damages only the hull moving into a stationary ship", () => {
    const config = { ...duelConfig(), ship: { ...defaultConfig.ship, acceleration: 0, dragPerSecond: 0 } };
    const state = createInitialWorld(config, twinHarbors, 33);
    const blue = state.ships.find(ship => ship.teamId === "blue")!;
    const rose = state.ships.find(ship => ship.teamId === "rose")!;
    blue.position = { x: 500, y: 450 }; blue.velocity = { x: 50, y: 0 };
    rose.position = { x: 523, y: 450 }; rose.velocity = { x: 0, y: 0 };
    const next = stepWorld(state);
    expect(next.ships.find(ship => ship.id === blue.id)!.health).toBe(90);
    expect(next.ships.find(ship => ship.id === rose.id)!.health).toBe(100);
  });

  it("applies velocity-proportional terrain impact damage", () => {
    const map = { ...twinHarbors, islands: [{ id: "wall", polygon: [[500, 0], [501, 0], [501, 900], [500, 900]] as [number, number][] }] };
    const config = { ...duelConfig(), ship: { ...defaultConfig.ship, acceleration: 0, dragPerSecond: 0 } };
    const state = createInitialWorld(config, map, 34);
    const blue = state.ships.find(ship => ship.teamId === "blue")!;
    blue.position = { x: 487.5, y: 450 }; blue.velocity = { x: 60, y: 0 };
    const next = stepWorld(state);
    expect(next.ships.find(ship => ship.id === blue.id)!.health).toBe(88);
    expect(next.events.find(record => record.type === "TerrainContact" && record.shipId === blue.id)).toEqual(expect.objectContaining({ damage: 12, impactSpeed: 60 }));
  });

  it("resolves lethal head-on ramming simultaneously", () => {
    const config = { ...duelConfig(), ship: { ...defaultConfig.ship, acceleration: 0, dragPerSecond: 0 } };
    const state = createInitialWorld(config, twinHarbors, 35);
    const blue = state.ships.find(ship => ship.teamId === "blue")!;
    const rose = state.ships.find(ship => ship.teamId === "rose")!;
    blue.position = { x: 500, y: 450 }; blue.velocity = { x: 80, y: 0 }; blue.health = 15;
    rose.position = { x: 523, y: 450 }; rose.velocity = { x: -80, y: 0 }; rose.health = 15;
    const next = stepWorld(state);
    expect(next.ships.filter(ship => ship.alive)).toHaveLength(0);
    expect(next.events.filter(record => record.type === "ShipSunk").map(record => record.shipId).sort()).toEqual([blue.id, rose.id].sort());
    expect(next.kills).toEqual({ blue: 1, rose: 1 });
    expect(next.scores).toEqual({ blue: 1, rose: 1 });
  });

  it("aims at the selected enemy with velocity lead regardless of hull heading", () => {
    let state = createInitialWorld({ ...defaultConfig, mode: "fleet", shipsPerTeam: 2 }, twinHarbors, 4);
    const [blue, blueReserve] = state.ships.filter(ship => ship.teamId === "blue");
    const [roseDecoy, roseTarget] = state.ships.filter(ship => ship.teamId === "rose");
    blue!.position = { x: 500, y: 450 }; blue!.heading = Math.PI;
    blueReserve!.position = { x: 300, y: 700 };
    roseDecoy!.position = { x: 540, y: 450 };
    roseTarget!.position = { x: 500, y: 490 }; roseTarget!.velocity = { x: 36, y: 0 };
    state = stepWorld(state, { blue: [action(blue!.id, { fire: true, fireTargetShipId: roseTarget!.id })] });
    const shot = state.events.find(record => record.type === "CannonFired");
    expect(shot?.position?.y).toBeGreaterThan(blue!.position.y);
    expect(state.projectiles[0]?.targetShipId).toBe(roseTarget!.id);
    expect(state.projectiles[0]?.direction.x).toBeGreaterThan(0);
    expect(state.projectiles[0]?.direction.y).toBeGreaterThan(0);
    expect(roseDecoy!.health).toBe(defaultConfig.ship.maxHealth);
  });

  it("scales impact damage by traveled shot distance and marks point-blank hits", () => {
    expect(defaultConfig.combat.damage).toBe(18.75);
    const fireAtDistance = (separation: number) => {
      let state = createInitialWorld(duelConfig(), twinHarbors, 41 + separation);
      const blue = state.ships.find(ship => ship.teamId === "blue")!;
      const rose = state.ships.find(ship => ship.teamId === "rose")!;
      blue.position = { x: 500, y: 450 }; blue.heading = Math.PI / 2;
      rose.position = { x: 500 + separation, y: 450 }; rose.velocity = { x: 0, y: 0 };
      let hit = null as (typeof state.events)[number] | null;
      for (let tick = 0; tick < 55 && !hit; tick += 1) {
        state = stepWorld(state, { blue: [tick === 0 ? action(blue.id, { fire: true, fireTargetShipId: rose.id }) : neutralAction(blue.id)] });
        hit = state.events.find(record => record.type === "ProjectileHitShip") ?? null;
      }
      return { state, hit };
    };
    const close = fireAtDistance(45);
    const distant = fireAtDistance(200);
    expect(close.hit).toEqual(expect.objectContaining({ closeRange: true }));
    expect(distant.hit).toEqual(expect.objectContaining({ closeRange: false }));
    expect(close.hit!.damage).toBeGreaterThan(distant.hit!.damage!);
    expect(close.state.ships.find(ship => ship.teamId === "rose")!.health).toBeLessThan(distant.state.ships.find(ship => ship.teamId === "rose")!.health);
  });

  it("G04 resolves simultaneous lethal projectiles without an order survivor", () => {
    const state = createInitialWorld(duelConfig(), twinHarbors, 5);
    const blue = state.ships.find(ship => ship.teamId === "blue")!;
    const rose = state.ships.find(ship => ship.teamId === "rose")!;
    blue.position = { x: 500, y: 450 }; blue.heading = 0; blue.health = 25;
    rose.position = { x: 535, y: 450 }; rose.heading = -Math.PI; rose.health = 25;
    const next = stepWorld(state, { blue: [action(blue.id, { fire: true })], rose: [action(rose.id, { fire: true })] });
    expect(next.ships.filter(ship => ship.alive)).toHaveLength(0);
    expect(next.events.filter(record => record.type === "ShipSunk").map(record => record.shipId).sort()).toEqual([blue.id, rose.id].sort());
    expect(next.kills).toEqual({ blue: 1, rose: 1 });
    expect(next.scores).toEqual({ blue: 1, rose: 1 });
    expect(worldInvariantErrors(next)).toEqual([]);
  });

  it("G05 consumes shots on protection and enforces cooldown", () => {
    let state = createInitialWorld(duelConfig(), twinHarbors, 6);
    const blue = state.ships.find(ship => ship.teamId === "blue")!;
    const rose = state.ships.find(ship => ship.teamId === "rose")!;
    blue.position = { x: 500, y: 450 }; blue.heading = 0;
    rose.position = { x: 535, y: 450 }; rose.heading = -Math.PI; rose.protectionUntilTick = 10;
    state = stepWorld(state, { blue: [action(blue.id, { fire: true })] });
    expect(state.ships.find(ship => ship.id === rose.id)!.health).toBe(defaultConfig.ship.maxHealth);
    expect(state.events.some(record => record.type === "ProjectileHitShip" && record.detail === "protected")).toBe(true);
    expect(state.ships.find(ship => ship.id === blue.id)!.cooldownTicks).toBe(defaultConfig.combat.cooldownTicks);
    state = stepWorld(state, { blue: [action(blue.id, { fire: true })] });
    expect(state.events.some(record => record.type === "CannonFired")).toBe(false);
  });

  it("G06-G08 supports pickup, place, repick, and atomic teammate give", () => {
    let state = createInitialWorld({ ...defaultConfig, mode: "fleet", shipsPerTeam: 2 }, twinHarbors, 7);
    const [blueOne, blueTwo] = state.ships.filter(ship => ship.teamId === "blue");
    const enemyFlag = state.flags.find(flag => flag.ownerTeamId === "rose")!;
    blueOne!.position = { ...twinHarbors.bases.find(base => base.teamId === "rose")!.approach };
    state = stepWorld(state, { blue: [action(blueOne!.id, { interact: { type: "pickup", flagId: enemyFlag.id } })] });
    expect(state.flags.find(flag => flag.id === enemyFlag.id)!.carrierShipId).toBe(blueOne!.id);
    expect(state.scores.blue).toBe(3);
    const north = twinHarbors.flagSites.find(site => site.id === "north-neutral-site")!;
    state.ships.find(ship => ship.id === blueOne!.id)!.position = { ...north.approach };
    state = stepWorld(state, { blue: [action(blueOne!.id, { interact: { type: "place", flagSiteId: north.id } })] });
    expect(state.flags.find(flag => flag.id === enemyFlag.id)).toEqual(expect.objectContaining({ state: "on-land", siteId: north.id }));
    state.ships.find(ship => ship.id === blueTwo!.id)!.position = { ...north.approach };
    state = stepWorld(state, { blue: [action(blueTwo!.id, { interact: { type: "pickup", flagId: enemyFlag.id } })] });
    expect(state.scores.blue).toBe(3);
    const one = state.ships.find(ship => ship.id === blueOne!.id)!;
    const two = state.ships.find(ship => ship.id === blueTwo!.id)!;
    one.position = { x: 900, y: 450 }; two.position = { x: 930, y: 450 };
    state = stepWorld(state, { blue: [action(two.id, { interact: { type: "give", targetShipId: one.id } })] });
    expect(state.ships.find(ship => ship.id === one.id)!.carriedFlagId).toBe(enemyFlag.id);
    expect(state.ships.find(ship => ship.id === two.id)!.carriedFlagId).toBeNull();
    expect(worldInvariantErrors(state)).toEqual([]);
  });

  it("G09 recovers an own loose flag and requires it home for capture", () => {
    let state = createInitialWorld({ ...defaultConfig, mode: "fleet", shipsPerTeam: 2 }, twinHarbors, 8);
    const [blue, recoveryShip] = state.ships.filter(ship => ship.teamId === "blue");
    const blueFlag = state.flags.find(flag => flag.ownerTeamId === "blue")!;
    const roseFlag = state.flags.find(flag => flag.ownerTeamId === "rose")!;
    blueFlag.state = "in-water"; blueFlag.position = { x: 600, y: 450 }; blueFlag.siteId = null; blueFlag.changedAtTick = 0;
    roseFlag.state = "carried"; roseFlag.position = null; roseFlag.carrierShipId = blue!.id; roseFlag.siteId = null; blue!.carriedFlagId = roseFlag.id;
    blue!.position = { ...twinHarbors.bases.find(base => base.teamId === "blue")!.deliveryZone.center };
    state = stepWorld(state);
    expect(state.scores.blue).toBe(0);
    state.ships.find(ship => ship.id === recoveryShip!.id)!.position = { x: 600, y: 450 };
    state = stepWorld(state, { blue: [action(recoveryShip!.id, { interact: { type: "pickup", flagId: blueFlag.id } })] });
    expect(state.flags.find(flag => flag.id === blueFlag.id)!.state).toBe("at-home");
    expect(state.scores.blue).toBe(25);
  });

  it("G10 respawns on simulation ticks at a safe offset with neutral controls", () => {
    const config = duelConfig({ ship: { ...defaultConfig.ship, respawnDelayTicks: 2, spawnProtectionTicks: 3 } });
    let state = createInitialWorld(config, twinHarbors, 9);
    const blue = state.ships.find(ship => ship.teamId === "blue")!;
    blue.alive = false; blue.health = 0; blue.respawnAtTick = 2; blue.heldAction = action(blue.id, { throttle: 1, fire: true });
    state = runSteps(state, () => ({}), 3);
    const respawned = state.ships.find(ship => ship.id === blue.id)!;
    expect(respawned.alive).toBe(true);
    expect(respawned.velocity).toEqual({ x: 0, y: 0 });
    expect(respawned.heldAction).toEqual(neutralAction(blue.id));
    expect(respawned.protectionUntilTick).toBeGreaterThan(state.tick - 1);
  });

  it("G11 produces simultaneous capture draws and time-limit draws", () => {
    const config = duelConfig({ flags: { ...defaultConfig.flags, requireOwnFlagHome: false }, match: { ...defaultConfig.match, durationTicks: 1 } });
    let state = createInitialWorld(config, twinHarbors, 10);
    const blue = state.ships.find(ship => ship.teamId === "blue")!;
    const rose = state.ships.find(ship => ship.teamId === "rose")!;
    const blueFlag = state.flags.find(flag => flag.ownerTeamId === "blue")!;
    const roseFlag = state.flags.find(flag => flag.ownerTeamId === "rose")!;
    blue.carriedFlagId = roseFlag.id; roseFlag.state = "carried"; roseFlag.position = null; roseFlag.carrierShipId = blue.id; roseFlag.siteId = null;
    rose.carriedFlagId = blueFlag.id; blueFlag.state = "carried"; blueFlag.position = null; blueFlag.carrierShipId = rose.id; blueFlag.siteId = null;
    blue.position = { ...twinHarbors.bases.find(base => base.teamId === "blue")!.deliveryZone.center };
    rose.position = { ...twinHarbors.bases.find(base => base.teamId === "rose")!.deliveryZone.center };
    state = stepWorld(state);
    expect(state.scores).toEqual({ blue: 25, rose: 25 });
    expect(state.outcome).toEqual(expect.objectContaining({ kind: "draw", winner: null, reason: "time-limit" }));

    let timed = createInitialWorld({ ...config, match: { ...defaultConfig.match, durationTicks: 1 } }, twinHarbors, 11);
    timed = stepWorld(timed);
    expect(timed.outcome).toEqual(expect.objectContaining({ kind: "draw", reason: "time-limit" }));
  });

  it("relocates a dropped flag to the closest neutral island site", () => {
    let state = createInitialWorld(duelConfig(), twinHarbors, 12);
    const blue = state.ships.find(ship => ship.teamId === "blue")!;
    const roseFlag = state.flags.find(flag => flag.ownerTeamId === "rose")!;
    const north = twinHarbors.flagSites.find(site => site.id === "north-neutral-site")!;
    blue.position = { x: north.approach.x + 8, y: north.approach.y + 8 };
    blue.carriedFlagId = roseFlag.id; roseFlag.state = "carried"; roseFlag.position = null; roseFlag.carrierShipId = blue.id; roseFlag.siteId = null;
    state = stepWorld(state, { blue: [action(blue.id, { interact: { type: "drop" } })] });
    expect(state.flags.find(flag => flag.id === roseFlag.id)).toEqual(expect.objectContaining({ state: "on-land", siteId: north.id, position: north.position }));
    expect(state.events.some(record => record.type === "FlagRelocatedToIsland" && record.flagId === roseFlag.id)).toBe(true);
  });

  it("uses total points as the public match winner", () => {
    let state = createInitialWorld({ ...duelConfig(), match: { ...defaultConfig.match, durationTicks: 1 } }, twinHarbors, 13);
    state.scores.blue = 4; state.scores.rose = 3;
    state = stepWorld(state);
    expect(state.outcome).toEqual(expect.objectContaining({ kind: "win", winner: "blue", reason: "time-limit" }));
  });

  it("scuttles without crediting the opponent and respawns in half the normal time", () => {
    const config = duelConfig({ ship: { ...defaultConfig.ship, respawnDelayTicks: 10, scuttleRespawnTicks: 5 } });
    let state = createInitialWorld(config, twinHarbors, 14);
    const blue = state.ships.find(ship => ship.teamId === "blue")!;
    state = stepWorld(state, { blue: [action(blue.id, { scuttle: true })] });
    expect(state.ships.find(ship => ship.id === blue.id)).toEqual(expect.objectContaining({ alive: false, respawnAtTick: 5 }));
    expect(state.kills).toEqual({ blue: 0, rose: 0 });
    expect(state.scores).toEqual({ blue: 0, rose: 0 });
    expect(state.events.some(record => record.type === "ShipScuttled" && record.shipId === blue.id)).toBe(true);
    state = runSteps(state, () => ({}), 5);
    expect(state.ships.find(ship => ship.id === blue.id)!.alive).toBe(true);
  });

  it("uses the faster v6 hull limit and slows enemy-flag carriers by five percent", () => {
    expect(defaultConfig.ship.maxSpeed).toBe(88);
    const config = duelConfig({ ship: { ...defaultConfig.ship, acceleration: 0, dragPerSecond: 0 } });
    let state = createInitialWorld(config, twinHarbors, 15);
    const blue = state.ships.find(ship => ship.teamId === "blue")!;
    const roseFlag = state.flags.find(flag => flag.ownerTeamId === "rose")!;
    blue.velocity = { x: 100, y: 0 };
    state = stepWorld(state);
    expect(Math.hypot(state.ships.find(ship => ship.id === blue.id)!.velocity.x, state.ships.find(ship => ship.id === blue.id)!.velocity.y)).toBeCloseTo(88, 9);
    const carrier = state.ships.find(ship => ship.id === blue.id)!;
    carrier.velocity = { x: 100, y: 0 }; carrier.carriedFlagId = roseFlag.id;
    roseFlag.state = "carried"; roseFlag.position = null; roseFlag.carrierShipId = carrier.id;
    state = stepWorld(state);
    expect(Math.hypot(state.ships.find(ship => ship.id === blue.id)!.velocity.x, state.ships.find(ship => ship.id === blue.id)!.velocity.y)).toBeCloseTo(83.6, 9);
  });
});
