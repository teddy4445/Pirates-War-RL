import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ReplayRecord } from "../replay/replay";
import type { GameMode } from "../contracts/types";

export interface StoredRecord { id: string; schemaVersion: string; updatedAt: string; [key: string]: unknown; }
export interface AgentDraft extends StoredRecord { schemaVersion: "fleetrl-agent-draft-v1"; name: string; source: string; }
export interface AgentVersion extends StoredRecord { schemaVersion: "fleetrl-agent-version-v1"; name: string; student?: string; hash: string; kind: "script" | "dense" | "tfjs"; payload: string; supportedModes?: GameMode[]; }
export interface TrainingRun extends StoredRecord { schemaVersion: "fleetrl-training-run-v1"; status: "idle" | "running" | "paused" | "complete" | "cancelled" | "error"; algorithm: "qlearning" | "dqn"; steps: number; metrics: unknown[]; }
export interface TournamentPlan extends StoredRecord { schemaVersion: "fleetrl-tournament-v1"; status: string; roster: unknown[]; jobs: unknown[]; results: unknown[]; }
export interface ReplayEntry extends StoredRecord { schemaVersion: "fleetrl-replay-entry-v1"; replay: ReplayRecord; }

interface FleetDB extends DBSchema {
  workspaces: { key: string; value: StoredRecord };
  agentDrafts: { key: string; value: AgentDraft };
  agentVersions: { key: string; value: AgentVersion; indexes: { "by-hash": string } };
  modelBlobs: { key: string; value: StoredRecord };
  challengeVersions: { key: string; value: StoredRecord };
  trainingRuns: { key: string; value: TrainingRun };
  checkpoints: { key: string; value: StoredRecord };
  tournamentPlans: { key: string; value: TournamentPlan };
  matchResults: { key: string; value: StoredRecord };
  replayChunks: { key: string; value: ReplayEntry };
  lessonProgress: { key: string; value: StoredRecord };
  assetCacheMetadata: { key: string; value: StoredRecord };
}

export type StoreName = "workspaces" | "agentDrafts" | "agentVersions" | "modelBlobs" | "challengeVersions" | "trainingRuns" | "checkpoints" | "tournamentPlans" | "matchResults" | "replayChunks" | "lessonProgress" | "assetCacheMetadata";
let database: Promise<IDBPDatabase<FleetDB>> | null = null;

export function fleetDb(): Promise<IDBPDatabase<FleetDB>> {
  database ??= openDB<FleetDB>("fleetrl-local-v1", 1, {
    upgrade(db) {
      db.createObjectStore("workspaces", { keyPath: "id" });
      db.createObjectStore("agentDrafts", { keyPath: "id" });
      const versions = db.createObjectStore("agentVersions", { keyPath: "id" }); versions.createIndex("by-hash", "hash", { unique: true });
      db.createObjectStore("modelBlobs", { keyPath: "id" }); db.createObjectStore("challengeVersions", { keyPath: "id" });
      db.createObjectStore("trainingRuns", { keyPath: "id" }); db.createObjectStore("checkpoints", { keyPath: "id" });
      db.createObjectStore("tournamentPlans", { keyPath: "id" }); db.createObjectStore("matchResults", { keyPath: "id" });
      db.createObjectStore("replayChunks", { keyPath: "id" }); db.createObjectStore("lessonProgress", { keyPath: "id" });
      db.createObjectStore("assetCacheMetadata", { keyPath: "id" });
    },
  });
  return database;
}

export function normalizeStorageError(error: unknown): Error {
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "UnknownError")) return new Error("Local storage quota was exceeded. Export your workspace, then remove runs or replays you no longer need.");
  return error instanceof Error ? error : new Error(String(error));
}

export async function putRecord<Name extends StoreName>(store: Name, value: FleetDB[Name]["value"]): Promise<void> {
  try { await (await fleetDb()).put(store, value as never); } catch (error) { throw normalizeStorageError(error); }
}
export async function getRecord<Name extends StoreName>(store: Name, id: string): Promise<FleetDB[Name]["value"] | undefined> { return (await fleetDb()).get(store, id) as Promise<FleetDB[Name]["value"] | undefined>; }
export async function listRecords<Name extends StoreName>(store: Name): Promise<FleetDB[Name]["value"][]> { return (await fleetDb()).getAll(store) as Promise<FleetDB[Name]["value"][]>; }

export async function putImmutableAgent(value: AgentVersion): Promise<void> {
  const db = await fleetDb();
  const existing = await db.getFromIndex("agentVersions", "by-hash", value.hash);
  if (existing && existing.payload !== value.payload) throw new Error("Agent hash collision or immutable version mismatch.");
  if (!existing) await putRecord("agentVersions", value);
}

export async function exportLocalWorkspace(): Promise<Blob> {
  const db = await fleetDb(); const payload: Record<string, unknown> = { schemaVersion: "fleetrl-workspace-export-v1", exportedAt: new Date().toISOString(), provenance: "local-browser" };
  for (const name of db.objectStoreNames) payload[name] = await db.getAll(name);
  return new Blob([JSON.stringify(payload)], { type: "application/json" });
}

export async function importLocalWorkspace(text: string): Promise<{ stores: number; records: number }> {
  if (new TextEncoder().encode(text).byteLength > 52_428_800) throw new Error("Workspace backup exceeds the 50 MiB import limit.");
  let value: unknown; try { value = JSON.parse(text); } catch { throw new Error("Workspace backup must be valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as Record<string, unknown>).schemaVersion !== "fleetrl-workspace-export-v1") throw new Error("Workspace backup schema is unsupported.");
  const payload = value as Record<string, unknown>; const db = await fleetDb(); const names = Array.from(db.objectStoreNames) as StoreName[]; const prepared = new Map<StoreName, StoredRecord[]>(); let records = 0;
  for (const name of names) {
    const items = payload[name] ?? []; if (!Array.isArray(items)) throw new Error(`Workspace store ${name} must be an array.`);
    const seen = new Set<string>(); const valid = items.map((item, index) => { if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Workspace ${name}[${index}] must be an object.`); const record = item as StoredRecord; if (typeof record.id !== "string" || !record.id || typeof record.schemaVersion !== "string" || typeof record.updatedAt !== "string") throw new Error(`Workspace ${name}[${index}] lacks versioned record fields.`); if (seen.has(record.id)) throw new Error(`Workspace ${name} contains duplicate id ${record.id}.`); seen.add(record.id); return structuredClone(record); });
    prepared.set(name, valid); records += valid.length;
  }
  for (const record of prepared.get("agentVersions") ?? []) {
    const incoming = record as AgentVersion; if (incoming.schemaVersion !== "fleetrl-agent-version-v1" || !["script", "dense", "tfjs"].includes(incoming.kind) || typeof incoming.hash !== "string" || typeof incoming.payload !== "string") throw new Error(`Workspace agent version ${incoming.id} is invalid.`);
    const byId = await db.get("agentVersions", incoming.id); const byHash = await db.getFromIndex("agentVersions", "by-hash", incoming.hash);
    if ((byId && (byId.hash !== incoming.hash || byId.payload !== incoming.payload)) || (byHash && byHash.payload !== incoming.payload)) throw new Error(`Workspace agent version ${incoming.id} conflicts with immutable local content.`);
  }
  const transaction = db.transaction(names, "readwrite");
  try { for (const [name, items] of prepared) for (const item of items) await transaction.objectStore(name).put(item as never); await transaction.done; }
  catch (error) { try { transaction.abort(); } catch { /* already aborted */ } throw normalizeStorageError(error); }
  return { stores: names.length, records };
}

export async function storageEstimate(): Promise<{ usage: number | null; quota: number | null; persisted: boolean | null }> {
  const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  return { usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted };
}

export function resetDatabaseHandleForTests(): void { database = null; }
