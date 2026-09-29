import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateAgentManifest, validateConfig, validateTeamAction } from "../src/contracts/validation";

const fixture = (name: string): unknown => JSON.parse(readFileSync(`${process.cwd()}/examples/${name}`, "utf8"));

describe("fleetrl contracts", () => {
  it("accepts the versioned default configuration", () => {
    const result = validateConfig(fixture("default-config.json"));
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    const config = fixture("default-config.json") as any;
    expect(config.ship.respawnDelayTicks / config.timing.physicsHz).toBe(15);
    expect(config.ship.scuttleRespawnTicks / config.timing.physicsHz).toBe(7.5);
    expect(config.ship.maxSpeed).toBe(88);
    expect(config.ship.flagCarrierSpeedMultiplier).toBe(.95);
    expect(config.match.points).toEqual({ kill: 1, pickup: 3, delivery: 25 });
  });

  it("rejects a drifted timing contract", () => {
    const config = fixture("default-config.json") as any;
    config.timing.decisionIntervalTicks = 5;
    const result = validateConfig(config);
    expect(result.ok).toBe(false);
  });

  it("accepts the script package manifest", () => {
    expect(validateAgentManifest(fixture("manifest-script.json")).ok).toBe(true);
  });

  it("rejects unsafe entries and malformed controls", () => {
    const manifest = fixture("manifest-script.json") as any;
    manifest.entry = "../agent.js";
    expect(validateAgentManifest(manifest).ok).toBe(false);
    const action = { actions: [{ shipId: "blue-1", throttle: Number.NaN, turn: 2, fire: "yes", interact: { type: "none" } }] };
    expect(validateTeamAction(action, new Set(["blue-1"])).ok).toBe(false);
  });
});
