import { parseDenseAgentJson } from "../agents/dense-json";
import { denseWorkerControllerSource } from "../agents/dense-worker-source";
import { WorkerPolicyRunner } from "../agents/worker-runner";
import { base64ToBytes, importTfjsZip } from "../agents/import";
import type { GameMode, Observation, TeamAction, TeamId } from "../contracts/types";
import { neutralAction, resolveFireTargets, validateTeamAction } from "../contracts/validation";
import { defaultConfig } from "../content/fixtures";
import { builtinPolicyDefinitions, createBuiltinPolicy, isBuiltinPolicyKind, type BuiltinPolicyKind } from "../policies/baselines";
import baselinesSource from "../policies/baselines.ts?raw";
import navigationSource from "../policies/navigation.ts?raw";
import { teddyAgentDefinitions, type CaptainSourceFile } from "../policies/teddy-agents";
import { ReplayRecorder, type ReplayRecord } from "../replay/replay";
import { buildObservation } from "../sim/observation";
import { generateProceduralMap } from "../sim/procedural-map";
import { deriveSeed, XorShift32 } from "../sim/rng";
import { createInitialWorld, stepWorld } from "../sim/world";
import type { AgentVersion } from "../storage/db";

export interface TournamentEntry {
  id: string;
  alias: string;
  student: string;
  hash: string;
  kind: BuiltinPolicyKind | "script" | "dense" | "tfjs";
  payload?: string;
  supportedModes?: GameMode[];
  targetMode?: GameMode;
  difficulty?: 1 | 2 | 3 | "boss";
  description?: string;
  architecture?: string;
  sourceFiles?: CaptainSourceFile[];
}
export interface MatchJob { id: string; leftId: string; rightId: string; seed: number; policySeed?: number; shipsPerTeam?: number; blueId: string; roseId: string; state: "pending" | "running" | "completed" | "failed-infrastructure"; }
export interface TeamMatchDiagnostics { decisions: number; fallbacks: number; meanLatencyMs: number; maxLatencyMs: number; flagPickups: number; }
export interface MatchResult { id: string; blueId: string; roseId: string; seed: number; winnerId: string | null; draw: boolean; blueScore: number; roseScore: number; blueKills: number; roseKills: number; tick: number; forfeits: string[]; replay: ReplayRecord; metrics?: { blue: TeamMatchDiagnostics; rose: TeamMatchDiagnostics }; }
export interface MatchOptions { shipsPerTeam?: number; policySeed?: number; durationSeconds?: number; }
interface PolicyInstance { act(observation: Observation): Promise<TeamAction>; dispose(): void; }

const immediate = (act: (observation: Observation) => TeamAction): PolicyInstance => ({ act: observation => Promise.resolve(act(observation)), dispose() {} });
async function policy(entry: TournamentEntry, teamId: TeamId, shipIds: string[], seed: number): Promise<PolicyInstance> {
  if (isBuiltinPolicyKind(entry.kind)) return immediate(createBuiltinPolicy(entry.kind, seed));
  if (entry.kind === "dense" && entry.payload) { const packaged = parseDenseAgentJson(entry.payload); const runner = new WorkerPolicyRunner(); await runner.initialize(denseWorkerControllerSource, { teamId, shipIds, episodeId: `tournament-${seed}-${entry.hash}`, agentSeed: seed, config: {} }, { seed }, { denseModels: [{ id: "policy", model: packaged.model, maxBatch: 8 }] }); return { act: observation => runner.act(observation, 100), dispose: () => runner.dispose() }; }
  if (entry.kind === "script" && entry.payload) {
    const runner = new WorkerPolicyRunner(); await runner.initialize(entry.payload, { teamId, shipIds, episodeId: `tournament-${seed}-${entry.hash}`, agentSeed: seed, config: {} }, { seed });
    return { act: observation => runner.act(observation, 100), dispose: () => runner.dispose() };
  }
  if (entry.kind === "tfjs" && entry.payload) {
    const packaged = await importTfjsZip(base64ToBytes(entry.payload)); const runner = new WorkerPolicyRunner(); await runner.initialize(packaged.source, { teamId, shipIds, episodeId: `tournament-${seed}-${entry.hash}`, agentSeed: seed, config: {} }, { seed }, { models: packaged.models, files: [...packaged.files] });
    return { act: observation => runner.act(observation, 100), dispose: () => runner.dispose() };
  }
  throw new Error(`Unsupported tournament entry ${entry.id}.`);
}

export function builtinEntries(mode?: GameMode): TournamentEntry[] {
  const trusted = builtinPolicyDefinitions.map(definition => ({
    id: definition.id,
    alias: definition.alias,
    student: "Built-in rival",
    hash: definition.hash,
    kind: definition.kind,
    supportedModes: [definition.mode],
    targetMode: definition.mode,
    difficulty: definition.level,
    description: definition.description,
    architecture: definition.level === 1 ? "Reactive objective policy" : definition.level === 2 ? "Objective and recovery state machine" : "Role-based tactical state machine",
    sourceFiles: [
      { path: "captain-profile.json", language: "json" as const, content: JSON.stringify(definition, null, 2) },
      { path: "src/policies/baselines.ts", language: "typescript" as const, content: baselinesSource },
      { path: "src/policies/navigation.ts", language: "typescript" as const, content: navigationSource },
    ],
  } satisfies TournamentEntry));
  const bosses = teddyAgentDefinitions.map(definition => ({
    id: definition.id,
    alias: definition.alias,
    student: "Teddy final boss",
    hash: definition.hash,
    kind: "script" as const,
    payload: definition.source,
    supportedModes: [definition.mode],
    targetMode: definition.mode,
    difficulty: "boss" as const,
    description: "An upload-equivalent final boss using only public observations, legal masks, seeded randomness, and persistent policy memory.",
    architecture: "Sandboxed fleetrl-package-v1 JavaScript state machine",
    sourceFiles: definition.files,
  } satisfies TournamentEntry));
  const entries = [...trusted, ...bosses];
  return mode ? entries.filter(entry => entry.targetMode === mode) : entries;
}
export function entryFromVersion(version: AgentVersion): TournamentEntry { return { id: version.id, alias: version.name, student: version.student ?? "Unassigned local", hash: version.hash, kind: version.kind, payload: version.payload, supportedModes: version.supportedModes ?? ["duel", "fleet", "fog-duel", "fog-fleet"] }; }

export async function preflightTournamentEntry(entry: TournamentEntry, mode: GameMode, shipsPerTeam = 3): Promise<void> {
  if (entry.supportedModes && !entry.supportedModes.includes(mode)) throw new Error(`${entry.alias} does not declare support for ${mode}.`);
  const config = { ...structuredClone(defaultConfig), mode, shipsPerTeam: mode.includes("fleet") ? shipsPerTeam : 1 }; const state = createInitialWorld(config, generateProceduralMap(31).map, 31); const shipIds = state.ships.filter(ship => ship.teamId === "blue").map(ship => ship.id); const instance = await policy(entry, "blue", shipIds, 31);
  try { const observation = buildObservation(state, "blue", 0, 6); const output = await instance.act(observation); const checked = validateTeamAction(output, new Set(shipIds)); if (!checked.ok) throw new Error(checked.errors.join("; ")); }
  finally { instance.dispose(); }
}

export function makeRoundRobinJobs(tournamentId: string, entries: TournamentEntry[], seeds: number[]): MatchJob[] {
  const jobs: MatchJob[] = [];
  for (let left = 0; left < entries.length; left += 1) for (let right = left + 1; right < entries.length; right += 1) for (const seed of seeds) for (const mirrored of [false, true]) {
    const first = entries[left]!, second = entries[right]!; const blue = mirrored ? second : first, rose = mirrored ? first : second;
    const id = `${tournamentId}:${first.hash}:${second.hash}:${seed}:${mirrored ? 1 : 0}`;
    jobs.push({ id, leftId: first.id, rightId: second.id, seed, policySeed: deriveSeed(seed, id), blueId: blue.id, roseId: rose.id, state: "pending" });
  }
  return jobs;
}

export function shuffledKnockoutEntries(entries: TournamentEntry[], seed: number): TournamentEntry[] {
  const result = [...entries];
  const rng = new XorShift32(deriveSeed(seed, "knockout-draw"));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = rng.nextUint32() % (index + 1);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

export function makeKnockoutRoundJobs(tournamentId: string, participantIds: string[], round: number, firstSeed: number): MatchJob[] {
  if (participantIds.length % 2) throw new Error("A knockout round requires an even number of captains.");
  const jobs: MatchJob[] = [];
  for (let index = 0; index < participantIds.length; index += 2) {
    const leftId = participantIds[index]!, rightId = participantIds[index + 1]!;
    const seed = firstSeed + round * 101 + index / 2;
    const flip = deriveSeed(seed, `${leftId}:${rightId}`) % 2 === 1;
    const blueId = flip ? rightId : leftId, roseId = flip ? leftId : rightId;
    const id = `${tournamentId}:round-${round}:pair-${index / 2}:${leftId}:${rightId}:${seed}`;
    jobs.push({ id, leftId, rightId, seed, policySeed: deriveSeed(seed, id), blueId, roseId, state: "pending" });
  }
  return jobs;
}

export function knockoutWinner(result: MatchResult): string {
  if (result.winnerId) return result.winnerId;
  if (result.blueKills !== result.roseKills) return result.blueKills > result.roseKills ? result.blueId : result.roseId;
  return deriveSeed(result.seed, `draw-break:${result.id}`) % 2 === 0 ? result.blueId : result.roseId;
}

export async function runTournamentMatch(job: MatchJob, entries: TournamentEntry[], mode: GameMode, options: MatchOptions = {}): Promise<MatchResult> {
  const blueEntry = entries.find(entry => entry.id === job.blueId)!; const roseEntry = entries.find(entry => entry.id === job.roseId)!;
  const shipsPerTeam = mode.includes("fleet") ? Math.max(2, Math.min(6, options.shipsPerTeam ?? job.shipsPerTeam ?? 3)) : 1;
  const policySeed = options.policySeed ?? job.policySeed ?? job.seed;
  const config = { ...structuredClone(defaultConfig), mode, shipsPerTeam };
  const durationSeconds = Math.max(15, Math.min(300, Math.round(options.durationSeconds ?? config.match.durationTicks / config.timing.physicsHz)));
  config.match.durationTicks = durationSeconds * config.timing.physicsHz;
  let state = createInitialWorld(config, generateProceduralMap(job.seed).map, job.seed);
  const agentSeeds = { blue: deriveSeed(policySeed, `blue:${blueEntry.hash}`), rose: deriveSeed(policySeed, `rose:${roseEntry.hash}`) };
  const recorder = new ReplayRecorder(state, { blue: blueEntry.hash, rose: roseEntry.hash }, agentSeeds);
  const bluePolicy = await policy(blueEntry, "blue", state.ships.filter(ship => ship.teamId === "blue").map(ship => ship.id), agentSeeds.blue); const rosePolicy = await policy(roseEntry, "rose", state.ships.filter(ship => ship.teamId === "rose").map(ship => ship.id), agentSeeds.rose);
  let held = { blue: { actions: state.ships.filter(ship => ship.teamId === "blue").map(ship => neutralAction(ship.id)) }, rose: { actions: state.ships.filter(ship => ship.teamId === "rose").map(ship => neutralAction(ship.id)) } };
  const consecutive = { blue: 0, rose: 0 }; const forfeits: string[] = []; let decision = 0;
  const measured = { blue: { fallbacks: 0, totalLatencyMs: 0, maxLatencyMs: 0 }, rose: { fallbacks: 0, totalLatencyMs: 0, maxLatencyMs: 0 } };
  try {
    while (!state.outcome && !forfeits.length) {
      const applyAtTick = state.tick + 6; const observations = { blue: buildObservation(state, "blue", decision, applyAtTick), rose: buildObservation(state, "rose", decision, applyAtTick) };
      const outputs = await Promise.all((["blue", "rose"] as const).map(async team => {
        const started = performance.now();
        try { const raw = await (team === "blue" ? bluePolicy : rosePolicy).act(observations[team]); const validated = validateTeamAction(raw, new Set(observations[team].ships.map(ship => ship.id))); if (!validated.ok) throw new Error(validated.errors.join("; ")); consecutive[team] = 0; const latencyMs = performance.now() - started; return { value: resolveFireTargets(observations[team], validated.value), latencyMs, fallback: false }; }
        catch { consecutive[team] += 1; const latencyMs = performance.now() - started; return { value: { actions: observations[team].ships.map(ship => neutralAction(ship.id)) }, latencyMs, fallback: true }; }
      }));
      const issued = { blue: outputs[0]!.value, rose: outputs[1]!.value }; for (const [team, output] of [["blue", outputs[0]!], ["rose", outputs[1]!]] as const) { measured[team].totalLatencyMs += output.latencyMs; measured[team].maxLatencyMs = Math.max(measured[team].maxLatencyMs, output.latencyMs); if (output.fallback) measured[team].fallbacks += 1; }
      recorder.recordDecision({ decisionId: decision, applyAtTick, controls: { blue: issued.blue.actions, rose: issued.rose.actions }, fallback: { blue: outputs[0]!.fallback, rose: outputs[1]!.fallback }, errors: { blue: [], rose: [] } });
      for (let tick = 0; tick < 6 && !state.outcome; tick += 1) { state = stepWorld(state, tick === 0 ? { blue: held.blue.actions, rose: held.rose.actions } : undefined); recorder.capture(state); }
      held = issued; decision += 1;
      if (consecutive.blue >= 10) forfeits.push(blueEntry.id); if (consecutive.rose >= 10) forfeits.push(roseEntry.id);
    }
  } finally { bluePolicy.dispose(); rosePolicy.dispose(); }
  let winnerId: string | null = state.outcome?.winner === "blue" ? blueEntry.id : state.outcome?.winner === "rose" ? roseEntry.id : null;
  if (forfeits.length === 1) winnerId = forfeits[0] === blueEntry.id ? roseEntry.id : blueEntry.id; if (forfeits.length > 1) winnerId = null;
  const replay = recorder.finalize(state); const diagnostics = (team: TeamId): TeamMatchDiagnostics => ({ decisions: decision, fallbacks: measured[team].fallbacks, meanLatencyMs: decision ? measured[team].totalLatencyMs / decision : 0, maxLatencyMs: measured[team].maxLatencyMs, flagPickups: replay.worldEvents.filter(event => event.type === "FlagPickedUp" && event.teamId === team).length });
  return { id: job.id, blueId: blueEntry.id, roseId: roseEntry.id, seed: job.seed, winnerId, draw: !winnerId && forfeits.length < 2, blueScore: state.scores.blue, roseScore: state.scores.rose, blueKills: state.kills.blue, roseKills: state.kills.rose, tick: state.tick, forfeits, replay, metrics: { blue: diagnostics("blue"), rose: diagnostics("rose") } };
}

export interface Standing { id: string; played: number; wins: number; draws: number; losses: number; points: number; headToHeadPoints: number; captures: number; conceded: number; differential: number; rank: number; }
export function standings(entries: TournamentEntry[], results: MatchResult[]): Standing[] {
  const rows = new Map(entries.map(entry => [entry.id, { id: entry.id, played: 0, wins: 0, draws: 0, losses: 0, points: 0, headToHeadPoints: 0, captures: 0, conceded: 0, differential: 0, rank: 0 }]));
  for (const result of results) {
    const blue = rows.get(result.blueId)!, rose = rows.get(result.roseId)!; blue.played += 1; rose.played += 1; blue.captures += result.blueScore; blue.conceded += result.roseScore; rose.captures += result.roseScore; rose.conceded += result.blueScore;
    if (result.winnerId === blue.id) { blue.wins += 1; blue.points += 3; rose.losses += 1; } else if (result.winnerId === rose.id) { rose.wins += 1; rose.points += 3; blue.losses += 1; } else if (result.draw) { blue.draws += 1; rose.draws += 1; blue.points += 1; rose.points += 1; } else { blue.losses += 1; rose.losses += 1; }
  }
  for (const row of rows.values()) row.differential = row.captures - row.conceded;
  for (const points of new Set([...rows.values()].map(row => row.points))) {
    const tiedIds = new Set([...rows.values()].filter(row => row.points === points).map(row => row.id));
    if (tiedIds.size < 2) continue;
    for (const result of results.filter(item => tiedIds.has(item.blueId) && tiedIds.has(item.roseId))) {
      const blue = rows.get(result.blueId)!, rose = rows.get(result.roseId)!;
      if (result.winnerId === blue.id) blue.headToHeadPoints += 3;
      else if (result.winnerId === rose.id) rose.headToHeadPoints += 3;
      else if (result.draw) { blue.headToHeadPoints += 1; rose.headToHeadPoints += 1; }
    }
  }
  const sorted = [...rows.values()].sort((a, b) => b.points - a.points || b.headToHeadPoints - a.headToHeadPoints || b.differential - a.differential || b.captures - a.captures || a.id.localeCompare(b.id));
  sorted.forEach((row, index) => { const prior = sorted[index - 1]; row.rank = prior && prior.points === row.points && prior.headToHeadPoints === row.headToHeadPoints && prior.differential === row.differential && prior.captures === row.captures ? prior.rank : index + 1; }); return sorted;
}
