import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DenseJsonAdapter, parseDenseAgentJson, runDenseController, validateDenseAgentPackage } from "../src/agents/dense-json";
import { QuickJSPolicyRuntime } from "../src/agents/quickjs-runtime";
import { TfjsLayersAdapter } from "../src/agents/tfjs-adapter";
import { validateTfjsModelJson } from "../src/agents/tfjs-schema";
import { importTfjsZip } from "../src/agents/import";
import { defaultConfig, twinHarbors } from "../src/content/fixtures";
import { buildObservation } from "../src/sim/observation";
import { createInitialWorld } from "../src/sim/world";

const denseText = () => readFileSync(`${process.cwd()}/examples/constant-forward.agent.json`, "utf8");
const observation = () => buildObservation(createInitialWorld({ ...defaultConfig, mode: "duel" }, twinHarbors, 2), "blue", 1, 6);

describe("P06 dense and restricted model adapters", () => {
  it("loads the supplied untrained Dense package and selects action 7", async () => {
    const packaged = parseDenseAgentJson(denseText());
    const result = await runDenseController(packaged, observation());
    expect(Object.values(result.actionIds)).toEqual([7]);
    expect(result.actions[0]).toEqual(expect.objectContaining({ throttle: 1, turn: 0, fire: false }));
  });

  it("rejects nonfinite or dimensionally inconsistent Dense weights", () => {
    const packaged = JSON.parse(denseText());
    packaged.model.layers[0].weights[0] = null;
    expect(validateDenseAgentPackage(packaged).ok).toBe(false);
    packaged.model.layers[0].weights[0] = 0;
    packaged.model.layers[0].outputWidth = 21;
    expect(validateDenseAgentPackage(packaged).ok).toBe(false);
  });

  it("bridges asynchronous guest prediction and pumps QuickJS jobs", async () => {
    const packaged = parseDenseAgentJson(denseText());
    const adapter = new DenseJsonAdapter(packaged.model);
    const source = readFileSync(`${process.cwd()}/examples/neural-agent.js`, "utf8");
    const runtime = await QuickJSPolicyRuntime.create(source, {}, new Map([["policy", adapter]]));
    const output = await runtime.act(observation());
    expect(output.actions[0]).toEqual(expect.objectContaining({ throttle: 1, turn: 0, fire: false }));
    runtime.dispose(); adapter.dispose();
  });

  it("rejects remote shards and executable TF.js layers", () => {
    const topology = { class_name: "Sequential", config: { layers: [{ class_name: "Lambda", config: {} }] } };
    expect(() => validateTfjsModelJson({ modelTopology: topology, weightsManifest: [{ paths: ["https://evil/model.bin"], weights: [] }] })).toThrow(/Unsupported/);
    const allowed = { class_name: "Sequential", config: { layers: [{ class_name: "Dense", config: { activation: "linear" } }] } };
    expect(() => validateTfjsModelJson({ modelTopology: allowed, weightsManifest: [{ paths: ["https://evil/model.bin"], weights: [] }] })).toThrow(/Remote/);
  });

  it("loads the real restricted TF.js ZIP and matches its declared constant-forward action", async () => {
    const bytes = new Uint8Array(readFileSync(`${process.cwd()}/examples/tfjs-constant-forward.agent.zip`)); const packaged = await importTfjsZip(bytes); const item = packaged.models[0]!;
    const adapter = await TfjsLayersAdapter.load(item.modelJson, packaged.files, item.modelDirectory, item.descriptor.id, item.descriptor.inputWidth, item.descriptor.outputWidth, item.descriptor.maxBatch);
    const result = await adapter.predict([Array<number>(64).fill(0)]); expect(result[0]?.indexOf(Math.max(...result[0]!))).toBe(7); adapter.dispose();
  });
});
