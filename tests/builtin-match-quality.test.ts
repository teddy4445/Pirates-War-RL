import { describe, expect, it } from "vitest";
import { builtinEntries, runTournamentMatch, type MatchJob } from "../src/tournament/runner";

describe("built-in captain match quality", () => {
  it("finishes an active objective-driven fleet match without fallbacks", async () => {
    const entries = builtinEntries();
    const job: MatchJob = {
      id: "builtin-quality-seed-7",
      leftId: entries[0]!.id,
      rightId: entries[1]!.id,
      blueId: entries[0]!.id,
      roseId: entries[1]!.id,
      seed: 7,
      state: "pending",
    };
    const result = await runTournamentMatch(job, entries, "fleet");
    expect(result.forfeits).toEqual([]);
    expect((result.metrics?.blue.fallbacks ?? 1) + (result.metrics?.rose.fallbacks ?? 1)).toBe(0);
    expect((result.metrics?.blue.flagPickups ?? 0) + (result.metrics?.rose.flagPickups ?? 0)).toBeGreaterThan(0);
    expect(result.blueScore + result.roseScore).toBe(1);
    expect(result.tick).toBeLessThan(result.replay.initialState.config.match.durationTicks);
  }, 20_000);
});
