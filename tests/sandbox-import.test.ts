import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { importScriptZip, packageFromSource, scanZipEntryNames } from "../src/agents/import";
import { QuickJSPolicyRuntime } from "../src/agents/quickjs-runtime";
import { defaultConfig, twinHarbors } from "../src/content/fixtures";
import { buildObservation } from "../src/sim/observation";
import { createInitialWorld } from "../src/sim/world";

const observation = () => buildObservation(createInitialWorld({ ...defaultConfig, mode: "duel" }, twinHarbors, 1), "blue", 1, 6);

describe("P05 bounded import and QuickJS sandbox", () => {
  it("runs the supplied starter through QuickJS and returns data", async () => {
    const source = readFileSync(`${process.cwd()}/examples/agent-script.js`, "utf8");
    const runtime = await QuickJSPolicyRuntime.create(source, { seed: 99 });
    await runtime.reset({ teamId: "blue", shipIds: ["blue-1"] });
    const result = await runtime.act(observation());
    expect(result.actions[0]).toEqual(expect.objectContaining({ shipId: "blue-1" }));
    runtime.dispose();
  });

  it("does not expose host DOM, network, storage, or wall-clock APIs", async () => {
    const source = `function act(obs) { return { actions: [], probe: [typeof document, typeof fetch, typeof WebSocket, typeof indexedDB, typeof Date] }; }`;
    const runtime = await QuickJSPolicyRuntime.create(source);
    const result = await runtime.act(observation()) as any;
    expect(result.probe).toEqual(["undefined", "undefined", "undefined", "undefined", "undefined"]);
    runtime.dispose();
  });

  it("interrupts an infinite guest loop", async () => {
    const runtime = await QuickJSPolicyRuntime.create(`function act() { while (true) {} }`);
    await expect(runtime.act(observation(), 20)).rejects.toThrow();
  });

  it("creates immutable source packages and rejects oversized source", async () => {
    const packaged = await packageFromSource("function act(){return {actions:[]}}", "Test");
    expect(packaged.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(packageFromSource("x".repeat(102_401))).rejects.toThrow(/100 KiB/);
  });

  it("imports a declared script ZIP and rejects traversal before extraction", async () => {
    const good = new JSZip();
    good.file("manifest.json", JSON.stringify({ packageVersion: "fleetrl-package-v1", name: "Test", apiVersion: "fleetrl-agent-v1", controlScope: "team", entry: "agent.js", models: [], supportedModes: ["duel"] }));
    good.file("agent.js", "function act(){return {actions:[]}}");
    const imported = await importScriptZip(await good.generateAsync({ type: "uint8array" }));
    expect(imported.manifest.name).toBe("Test");

    const bad = new JSZip();
    bad.file("../evil.js", "bad");
    const bytes = await bad.generateAsync({ type: "uint8array" });
    expect(() => scanZipEntryNames(bytes)).toThrow(/Unsafe archive path/);
  });
  it("rejects a ZIP whose central directory declares oversized extraction before inflating it", async () => {
    const zip = new JSZip(); zip.file("manifest.json", "{}"); const bytes = await zip.generateAsync({ type: "uint8array" }); const copy = bytes.slice(); const view = new DataView(copy.buffer); let central = -1;
    for (let offset = 0; offset <= copy.length - 46; offset += 1) if (view.getUint32(offset, true) === 0x02014b50) { central = offset; break; }
    expect(central).toBeGreaterThanOrEqual(0); view.setUint32(central + 24, 40 * 1024 * 1024, true); expect(() => scanZipEntryNames(copy)).toThrow(/extraction exceeds/);
  });
});
