import { describe, expect, it } from "vitest";
import { builtinEntries, runTournamentMatch, type MatchJob } from "../src/tournament/runner";

describe("built-in captain match quality", () => {
  it("completes an objective-driven fleet capture on the maintained quality seed set without fallbacks", async () => {
    const ladder = builtinEntries("fleet");
    const entries = [ladder[2]!, ladder[0]!];
    let captured = false;
    for (const seed of [3, 7, 11, 19, 31]) {
      const job: MatchJob = { id: `builtin-quality-seed-${seed}`, leftId: entries[0]!.id, rightId: entries[1]!.id, blueId: entries[0]!.id, roseId: entries[1]!.id, seed, state: "pending" };
      const result = await runTournamentMatch(job, entries, "fleet");
      expect(result.forfeits).toEqual([]);
      expect((result.metrics?.blue.fallbacks ?? 1) + (result.metrics?.rose.fallbacks ?? 1)).toBe(0);
      expect((result.metrics?.blue.flagPickups ?? 0) + (result.metrics?.rose.flagPickups ?? 0)).toBeGreaterThan(0);
      if (result.blueScore + result.roseScore === 1) { captured = true; break; }
    }
    expect(captured).toBe(true);
  }, 20_000);

  it.each(["duel", "fleet", "fog-duel", "fog-fleet"] as const)("keeps the %s ladder ordered Level 3 > Level 2 > Level 1", async mode => {
    const ladder = builtinEntries(mode);
    for (const [strongerIndex, weakerIndex] of [[1, 0], [2, 1]] as const) {
      const stronger = ladder[strongerIndex]!; const weaker = ladder[weakerIndex]!;
      const job: MatchJob = { id: `ladder-${mode}-${strongerIndex}-${weakerIndex}-seed-7`, leftId: stronger.id, rightId: weaker.id, blueId: stronger.id, roseId: weaker.id, seed: 7, state: "pending" };
      const result = await runTournamentMatch(job, [stronger, weaker], mode, { shipsPerTeam: mode.includes("fleet") ? 3 : 1 });
      expect(result.forfeits).toEqual([]);
      expect(result.winnerId).toBe(stronger.id);
    }
  }, 20_000);
});
