import { describe, expect, it } from "vitest";
import { defaultConfig, twinHarbors } from "../src/content/fixtures";
import { neutralAction } from "../src/contracts/validation";
import { ReplayRecorder, parseReplay, seekReplay, serializeReplay, stateChecksum } from "../src/replay/replay";
import type { CommittedDecision } from "../src/sim/scheduler";
import { createInitialWorld, stepWorld } from "../src/sim/world";

describe("P07 authoritative replay", () => {
  it("T05 reproduces the same state from recorded accepted actions", () => {
    const config = { ...defaultConfig, mode: "duel" as const, replay: { ...defaultConfig.replay, keyframeEveryTicks: 12, checksumEveryTicks: 6 } };
    const initial = createInitialWorld(config, twinHarbors, 31);
    const blueId = initial.ships.find(ship => ship.teamId === "blue")!.id;
    const roseId = initial.ships.find(ship => ship.teamId === "rose")!.id;
    const recorder = new ReplayRecorder(initial, { blue: "builtin-blue", rose: "builtin-rose" }, "2026-09-25T00:00:00.000Z");
    const decisions = new Map<number, CommittedDecision>();
    for (const applyAtTick of [0, 6, 12, 18]) {
      const decision: CommittedDecision = { decisionId: applyAtTick / 6, applyAtTick, controls: { blue: [{ ...neutralAction(blueId), throttle: 1, turn: applyAtTick === 12 ? 1 : 0 }], rose: [neutralAction(roseId)] }, fallback: { blue: false, rose: false }, errors: { blue: [], rose: [] } };
      decisions.set(applyAtTick, decision); recorder.recordDecision(decision);
    }
    let live = initial;
    while (live.tick < 24) { live = stepWorld(live, decisions.get(live.tick)?.controls); recorder.capture(live); }
    const replay = recorder.finalize(live);
    const restored = seekReplay(replay, 24);
    expect(restored.verified).toBe(true);
    expect(stateChecksum(restored.state)).toBe(stateChecksum(live));
  });

  it("T06 serializes and plays without any agent callback", () => {
    const initial = createInitialWorld({ ...defaultConfig, mode: "duel" }, twinHarbors, 32);
    const record = new ReplayRecorder(initial, { blue: "deleted", rose: "deleted" }).finalize(initial);
    const parsed = parseReplay(serializeReplay(record));
    expect(seekReplay(parsed, 0).verified).toBe(true);
  });

  it("T08 rejects an incompatible engine instead of silently rerunning", () => {
    const initial = createInitialWorld({ ...defaultConfig, mode: "duel" }, twinHarbors, 33);
    const record = new ReplayRecorder(initial, { blue: "a", rose: "b" }).finalize(initial) as any;
    record.header.engineVersion = "future-engine";
    expect(() => seekReplay(record, 0)).toThrow(/requires future-engine/);
  });
});
