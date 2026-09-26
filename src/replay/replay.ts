import type { Observation, TeamId } from "../contracts/types";
import { ENGINE_VERSION } from "../contracts/types";
import type { CommittedDecision } from "../sim/scheduler";
import type { MatchOutcome, WorldEvent, WorldState } from "../sim/types";
import { stepWorld } from "../sim/world";

export interface ReplayHeader {
  schemaVersion: "fleetrl-replay-v1";
  engineVersion: typeof ENGINE_VERSION;
  configVersion: string;
  rulesVersion: string;
  mapId: string;
  seed: number;
  agentSeeds: Record<TeamId, number>;
  createdAtIso: string;
  agentHashes: Record<TeamId, string>;
  outcome: MatchOutcome | null;
}
export interface ReplayCommand {
  decisionId: number;
  applyAtTick: number;
  controls: CommittedDecision["controls"];
  fallback: Record<TeamId, boolean>;
}
export interface ReplayKeyframe { tick: number; state: WorldState; }
export interface ReplayChecksum { tick: number; hash: string; }
export interface ReplayInspection { decisionId: number; teamId: TeamId; observation: Observation; rawAction?: unknown; validatedAction?: unknown; fallback: boolean; latencyMs?: number; }
export interface ReplayRecord {
  header: ReplayHeader;
  initialState: WorldState;
  commands: ReplayCommand[];
  runtimeEvents: { tick: number; teamId?: TeamId; type: string; detail: string }[];
  worldEvents: WorldEvent[];
  keyframes: ReplayKeyframe[];
  checksums: ReplayChecksum[];
  optionalInspection: ReplayInspection[];
}

const clone = <T>(value: T): T => structuredClone(value);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export function stateChecksum(state: WorldState): string {
  const text = canonical(state);
  let high = 0xcbf29ce4;
  let low = 0x84222325;
  for (const byte of new TextEncoder().encode(text)) {
    low ^= byte;
    const nextLow = Math.imul(low, 0x1b3);
    const carry = Math.floor((low >>> 0) * 0x1b3 / 0x1_0000_0000);
    high = (Math.imul(high, 0x1b3) + carry + Math.imul(low, 0x100)) >>> 0;
    low = nextLow >>> 0;
  }
  return `${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
}

export class ReplayRecorder {
  private readonly record: ReplayRecord;
  private readonly keyframeEvery: number;
  private readonly checksumEvery: number;
  private readonly worldEventIds = new Set<string>();

  constructor(initialState: WorldState, agentHashes: Record<TeamId, string>, agentSeedsOrCreatedAt: Record<TeamId, number> | string = { blue: initialState.seed, rose: initialState.seed }, createdAtIso = new Date().toISOString()) {
    const agentSeeds = typeof agentSeedsOrCreatedAt === "string" ? { blue: initialState.seed, rose: initialState.seed } : agentSeedsOrCreatedAt;
    const createdAt = typeof agentSeedsOrCreatedAt === "string" ? agentSeedsOrCreatedAt : createdAtIso;
    this.keyframeEvery = initialState.config.replay.keyframeEveryTicks;
    this.checksumEvery = initialState.config.replay.checksumEveryTicks;
    this.record = {
      header: { schemaVersion: "fleetrl-replay-v1", engineVersion: ENGINE_VERSION, configVersion: initialState.config.schemaVersion, rulesVersion: initialState.config.rulesVersion, mapId: initialState.map.id, seed: initialState.seed, agentSeeds: { ...agentSeeds }, createdAtIso: createdAt, agentHashes: { ...agentHashes }, outcome: null },
      initialState: clone(initialState), commands: [], runtimeEvents: [], worldEvents: [], keyframes: [{ tick: initialState.tick, state: clone(initialState) }], checksums: [{ tick: initialState.tick, hash: stateChecksum(initialState) }], optionalInspection: [],
    };
  }

  recordDecision(decision: CommittedDecision, inspections: ReplayInspection[] = []): void {
    this.record.commands.push({ decisionId: decision.decisionId, applyAtTick: decision.applyAtTick, controls: clone(decision.controls), fallback: { ...decision.fallback } });
    this.record.optionalInspection.push(...clone(inspections));
  }

  recordRuntimeEvent(entry: ReplayRecord["runtimeEvents"][number]): void { this.record.runtimeEvents.push(clone(entry)); }

  capture(state: WorldState): void {
    for (const item of state.events) if (!this.worldEventIds.has(item.id)) { this.worldEventIds.add(item.id); this.record.worldEvents.push(clone(item)); }
    if (state.tick % this.keyframeEvery === 0 && !this.record.keyframes.some(frame => frame.tick === state.tick)) this.record.keyframes.push({ tick: state.tick, state: clone(state) });
    if (state.tick % this.checksumEvery === 0 && !this.record.checksums.some(item => item.tick === state.tick)) this.record.checksums.push({ tick: state.tick, hash: stateChecksum(state) });
    if (state.outcome) this.record.header.outcome = { ...state.outcome };
  }

  finalize(finalState: WorldState): ReplayRecord {
    this.capture(finalState);
    this.record.keyframes.sort((a, b) => a.tick - b.tick);
    this.record.checksums.sort((a, b) => a.tick - b.tick);
    this.record.commands.sort((a, b) => a.applyAtTick - b.applyAtTick || a.decisionId - b.decisionId);
    return clone(this.record);
  }
}

export interface ReplaySeekResult { state: WorldState; verified: boolean; expectedHash: string | null; actualHash: string | null; }

export function seekReplay(replay: ReplayRecord, targetTick: number): ReplaySeekResult {
  if (replay.header.engineVersion !== ENGINE_VERSION) throw new Error(`Replay requires ${replay.header.engineVersion}; this build provides ${ENGINE_VERSION}.`);
  if (!Number.isInteger(targetTick) || targetTick < replay.initialState.tick) throw new Error("Replay target tick is invalid.");
  const frame = [...replay.keyframes].filter(candidate => candidate.tick <= targetTick).sort((a, b) => b.tick - a.tick)[0] ?? { tick: replay.initialState.tick, state: replay.initialState };
  let state = clone(frame.state);
  const commands = new Map(replay.commands.map(command => [command.applyAtTick, command]));
  while (state.tick < targetTick && !state.outcome) {
    const command = commands.get(state.tick);
    state = stepWorld(state, command?.controls);
  }
  const expected = replay.checksums.find(item => item.tick === state.tick)?.hash ?? null;
  const actual = expected ? stateChecksum(state) : null;
  return { state, verified: expected === null || expected === actual, expectedHash: expected, actualHash: actual };
}

export function serializeReplay(record: ReplayRecord): string { return JSON.stringify(record); }
export function parseReplay(text: string): ReplayRecord {
  const value = JSON.parse(text) as ReplayRecord;
  if (value?.header?.schemaVersion !== "fleetrl-replay-v1" || !value.initialState || !Array.isArray(value.commands) || !Array.isArray(value.keyframes)) throw new Error("Invalid fleetrl-replay-v1 record.");
  return value;
}
