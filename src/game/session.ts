import type { GameMode, TeamId } from "../contracts/types";
import type { MatchJob, MatchResult, TournamentEntry } from "../tournament/runner";

export type FleetSizeChoice = 2 | 3 | 4 | 5 | 6 | "random";
export type LeagueFormat = "round-robin" | "knockout";
export const DEFAULT_MATCH_DURATION_SECONDS = 180;
export const MIN_MATCH_DURATION_SECONDS = 15;
export const MAX_MATCH_DURATION_SECONDS = 300;

export function clampMatchDurationSeconds(value: number): number {
  return Math.max(MIN_MATCH_DURATION_SECONDS, Math.min(MAX_MATCH_DURATION_SECONDS, Math.round(Number.isFinite(value) ? value : DEFAULT_MATCH_DURATION_SECONDS)));
}

export interface GameSetupSnapshot {
  mode: GameMode;
  seed: number;
  blue: TournamentEntry;
  green: TournamentEntry;
  sound: boolean;
  viewpoint: "spectator" | TeamId;
  fleetSizeChoice: FleetSizeChoice;
  durationSeconds: number;
}

export interface StoredGamePreferences {
  mode: GameMode;
  seed: number;
  blueId: string;
  greenId: string;
  sound: boolean;
  viewpoint: "spectator" | TeamId;
  fleetSizeChoice: FleetSizeChoice;
  durationSeconds?: number;
}

export interface MatchRequest {
  mode: GameMode;
  seed: number;
  blue: TournamentEntry;
  green: TournamentEntry;
  sound: boolean;
  viewpoint: "spectator" | TeamId;
  shipsPerTeam: number;
  fleetSizeChoice: FleetSizeChoice;
  durationSeconds: number;
  policySeed: number;
  returnTo: "#/menu" | "#/league";
}

export interface KnockoutRoundSnapshot {
  round: number;
  participantIds: string[];
  resultIds: string[];
  winnerIds: string[];
}

export interface LeagueSnapshot {
  mode: GameMode;
  firstSeed: number;
  seedCount: number;
  format: LeagueFormat;
  shipsPerTeam: number;
  bracketSize: 4 | 8 | 16;
  durationSeconds: number;
  entries: TournamentEntry[];
  results: MatchResult[];
  jobs: MatchJob[];
  knockoutRounds: KnockoutRoundSnapshot[];
}

let request: MatchRequest | null = null;
let result: MatchResult | null = null;
let pending: Promise<MatchResult> | null = null;
let league: LeagueSnapshot | null = null;
let lastSetup: GameSetupSnapshot | null = null;
let playbackMode: "live" | "replay" = "live";

const storageKey = "pirates-war-rl:last-game-settings:v1";
export function freshPolicySeed(): number {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0]!;
}
export function resolveFleetSize(choice: FleetSizeChoice, randomSeed: number): number {
  return choice === "random" ? 2 + randomSeed % 5 : choice;
}
function loadPreferences(): StoredGamePreferences | null {
  try { const raw = globalThis.localStorage?.getItem(storageKey); return raw ? JSON.parse(raw) as StoredGamePreferences : null; } catch { return null; }
}
function storePreferences(next: GameSetupSnapshot): void {
  try { globalThis.localStorage?.setItem(storageKey, JSON.stringify({ mode: next.mode, seed: next.seed, blueId: next.blue.id, greenId: next.green.id, sound: next.sound, viewpoint: next.viewpoint, fleetSizeChoice: next.fleetSizeChoice, durationSeconds: clampMatchDurationSeconds(next.durationSeconds) } satisfies StoredGamePreferences)); } catch { /* Storage is optional. */ }
}

export const gameSession = {
  get request(): MatchRequest | null { return request; },
  get result(): MatchResult | null { return result; },
  get league(): LeagueSnapshot | null { return league; },
  get lastSetup(): GameSetupSnapshot | null { return lastSetup ? structuredClone(lastSetup) : null; },
  get storedPreferences(): StoredGamePreferences | null { return loadPreferences(); },
  get playbackMode(): "live" | "replay" { return playbackMode; },
  rememberSetup(next: GameSetupSnapshot): void { lastSetup = structuredClone(next); storePreferences(next); },
  begin(next: MatchRequest): void { request = structuredClone(next); result = null; pending = null; playbackMode = "live"; },
  replay(nextRequest: MatchRequest, nextResult: MatchResult): void { request = structuredClone(nextRequest); result = structuredClone(nextResult); pending = null; playbackMode = "replay"; },
  finish(next: MatchResult): void { result = structuredClone(next); pending = null; },
  resolveMatch(factory: () => Promise<MatchResult>): Promise<MatchResult> { if (result) return Promise.resolve(structuredClone(result)); if (!pending) pending = factory().then(next => { result = structuredClone(next); pending = null; return structuredClone(next); }, error => { pending = null; throw error; }); return pending; },
  clearMatch(): void { result = null; pending = null; },
  saveLeague(next: LeagueSnapshot): void { league = structuredClone(next); },
  clearLeague(): void { league = null; },
};
