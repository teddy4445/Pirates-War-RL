import { describe, expect, it } from "vitest";
import { clampMatchDurationSeconds } from "../src/game/session";
import { builtinEntries, knockoutWinner, makeKnockoutRoundJobs, makeRoundRobinJobs, preflightTournamentEntry, runTournamentMatch, shuffledKnockoutEntries, standings, type MatchResult, type TournamentEntry } from "../src/tournament/runner";

describe("tournament scheduling and ranking", () => {
  it("ships five distinct, valid tactical captains", async () => {
    const entries = builtinEntries();
    expect(entries).toHaveLength(5);
    expect(new Set(entries.map(entry => entry.kind)).size).toBe(5);
    await Promise.all(entries.map(entry => preflightTournamentEntry(entry, "fleet")));
  });
  it("creates every mirrored seed job exactly once", () => {
    const entries = builtinEntries(); const jobs = makeRoundRobinJobs("t", entries, [7, 8]);
    expect(jobs).toHaveLength((entries.length * (entries.length - 1) / 2) * 2 * 2); expect(new Set(jobs.map(job => job.id)).size).toBe(jobs.length);
    for (let index = 0; index < jobs.length; index += 2) expect([jobs[index]?.blueId, jobs[index]?.roseId]).toEqual([jobs[index + 1]?.roseId, jobs[index + 1]?.blueId]);
  });
  it("clamps setup duration to 15–300 seconds and records it in the match config", async () => {
    expect(clampMatchDurationSeconds(4)).toBe(15);
    expect(clampMatchDurationSeconds(501)).toBe(300);
    const entries = builtinEntries().slice(0, 2);
    const job = makeRoundRobinJobs("duration", entries, [17])[0]!;
    const result = await runTournamentMatch(job, entries, "duel", { durationSeconds: 19 });
    expect(result.replay.initialState.config.match.durationTicks).toBe(19 * result.replay.initialState.config.timing.physicsHz);
  });
  it("creates a seeded knockout draw and advances every slot exactly once per round", () => {
    const entries = [...builtinEntries().slice(0, 4)].map((entry, index) => ({ ...entry, id: `slot-${index}` }));
    const first = shuffledKnockoutEntries(entries, 42); const second = shuffledKnockoutEntries(entries, 42);
    expect(first.map(entry => entry.id)).toEqual(second.map(entry => entry.id));
    expect(new Set(first.map(entry => entry.id))).toEqual(new Set(entries.map(entry => entry.id)));
    const jobs = makeKnockoutRoundJobs("cup", first.map(entry => entry.id), 0, 9);
    expect(jobs).toHaveLength(2); expect(new Set(jobs.flatMap(job => [job.blueId, job.roseId]))).toEqual(new Set(entries.map(entry => entry.id)));
    const fakeReplay = {} as MatchResult["replay"];
    const tied: MatchResult = { id: jobs[0]!.id, blueId: jobs[0]!.blueId, roseId: jobs[0]!.roseId, seed: jobs[0]!.seed, winnerId: null, draw: true, blueScore: 0, roseScore: 0, blueKills: 2, roseKills: 2, tick: 1, forfeits: [], replay: fakeReplay };
    expect([tied.blueId, tied.roseId]).toContain(knockoutWinner(tied));
    expect(knockoutWinner(tied)).toBe(knockoutWinner(tied));
  });
  it("uses W/D/L points and preserves shared competitive rank", () => {
    const entries = builtinEntries(); const fakeReplay = {} as MatchResult["replay"];
    const results: MatchResult[] = [
      { id: "1", blueId: entries[0]!.id, roseId: entries[1]!.id, seed: 1, winnerId: entries[0]!.id, draw: false, blueScore: 1, roseScore: 0, blueKills: 0, roseKills: 0, tick: 1, forfeits: [], replay: fakeReplay },
      { id: "2", blueId: entries[2]!.id, roseId: entries[0]!.id, seed: 1, winnerId: null, draw: true, blueScore: 0, roseScore: 0, blueKills: 0, roseKills: 0, tick: 1, forfeits: [], replay: fakeReplay },
    ];
    const rows = standings(entries, results); expect(rows[0]).toEqual(expect.objectContaining({ id: entries[0]!.id, points: 4, wins: 1, draws: 1 }));
  });
  it("uses direct head-to-head before capture differential", () => {
    const entries: TournamentEntry[] = [...builtinEntries().slice(0, 3), { id: "fourth", alias: "Fourth", student: "Built-in", hash: "fourth-v1", kind: "raider" }]; const fakeReplay = {} as MatchResult["replay"];
    const result = (id: string, blueId: string, roseId: string, winnerId: string, blueScore: number, roseScore: number): MatchResult => ({ id, blueId, roseId, seed: 1, winnerId, draw: false, blueScore, roseScore, blueKills: 0, roseKills: 0, tick: 1, forfeits: [], replay: fakeReplay });
    const results = [
      result("ab", entries[0]!.id, entries[1]!.id, entries[0]!.id, 1, 0),
      result("bd", entries[1]!.id, entries[3]!.id, entries[1]!.id, 9, 0),
      result("ca", entries[2]!.id, entries[0]!.id, entries[2]!.id, 9, 0),
      result("cd", entries[2]!.id, entries[3]!.id, entries[2]!.id, 1, 0),
    ];
    const rows = standings(entries, results);
    expect(rows.map(row => row.id)).toEqual([entries[2]!.id, entries[0]!.id, entries[1]!.id, entries[3]!.id]);
    expect(rows[1]).toEqual(expect.objectContaining({ id: entries[0]!.id, headToHeadPoints: 3, differential: -8 }));
    expect(rows[2]).toEqual(expect.objectContaining({ id: entries[1]!.id, headToHeadPoints: 0, differential: 8 }));
  });
});
