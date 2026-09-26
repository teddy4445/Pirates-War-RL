import { beforeEach, describe, expect, it } from "vitest";
import { exportLocalWorkspace, fleetDb, getRecord, importLocalWorkspace, normalizeStorageError, putImmutableAgent, putRecord, resetDatabaseHandleForTests } from "../src/storage/db";

describe("IndexedDB repositories", () => {
  beforeEach(async () => { const db = await fleetDb(); db.close(); await indexedDB.deleteDatabase("fleetrl-local-v1"); resetDatabaseHandleForTests(); });
  it("keeps drafts mutable and content-hashed versions immutable", async () => {
    await putRecord("agentDrafts", { id: "d", schemaVersion: "fleetrl-agent-draft-v1", updatedAt: "a", name: "draft", source: "one" });
    await putRecord("agentDrafts", { id: "d", schemaVersion: "fleetrl-agent-draft-v1", updatedAt: "b", name: "draft", source: "two" });
    expect((await getRecord("agentDrafts", "d"))?.source).toBe("two");
    const version = { id: "v", schemaVersion: "fleetrl-agent-version-v1" as const, updatedAt: "a", name: "v", hash: "same", kind: "script" as const, payload: "one" };
    await putImmutableAgent(version); await expect(putImmutableAgent({ ...version, id: "v2", payload: "different" })).rejects.toThrow(/collision|immutable/);
  });
  it("round-trips a versioned workspace backup without weakening immutable hashes", async () => {
    const version = { id: "v", schemaVersion: "fleetrl-agent-version-v1" as const, updatedAt: "a", name: "v", hash: "roundtrip", kind: "script" as const, payload: "source" }; await putImmutableAgent(version);
    const backup = await (await exportLocalWorkspace()).text(); const report = await importLocalWorkspace(backup); expect(report.records).toBe(1); expect(await getRecord("agentVersions", "v")).toEqual(version);
    const changed = JSON.parse(backup); changed.agentVersions[0].payload = "tampered"; await expect(importLocalWorkspace(JSON.stringify(changed))).rejects.toThrow(/conflicts/);
  });
  it("turns quota failures into an actionable message", () => {
    expect(normalizeStorageError(new DOMException("full", "QuotaExceededError")).message).toMatch(/quota.*Export/i);
  });
});
