/// <reference lib="webworker" />
import { QuickJSPolicyRuntime, type SandboxOptions } from "../agents/quickjs-runtime";
import { TfjsLayersAdapter } from "../agents/tfjs-adapter";
import { DenseJsonAdapter } from "../agents/dense-json";
import type { ModelAdapter } from "../agents/model-adapter";
import type { WorkerModelPackage } from "../agents/worker-runner";
import type { Observation } from "../contracts/types";

type Request =
  | { id: number; type: "init"; source: string; options: SandboxOptions; resetContext: unknown; modelPackage?: WorkerModelPackage }
  | { id: number; type: "act"; observation: Observation; budgetMs: number }
  | { id: number; type: "dispose" };

let runtime: QuickJSPolicyRuntime | null = null;
let adapters: ModelAdapter[] = [];
function disposeRuntime(): void { runtime?.dispose(); runtime = null; adapters.forEach(adapter => adapter.dispose()); adapters = []; }

self.onmessage = async (message: MessageEvent<Request>) => {
  const request = message.data;
  try {
    if (request.type === "init") {
      disposeRuntime(); const models = new Map<string, ModelAdapter>();
      if (request.modelPackage) {
        const files = new Map(request.modelPackage.files ?? []);
        try { for (const item of request.modelPackage.models ?? []) { const descriptor = item.descriptor; const adapter = await TfjsLayersAdapter.load(item.modelJson, files, item.modelDirectory, descriptor.id, descriptor.inputWidth, descriptor.outputWidth, descriptor.maxBatch); adapters.push(adapter); models.set(descriptor.id, adapter); } for (const item of request.modelPackage.denseModels ?? []) { const adapter = new DenseJsonAdapter(item.model, item.id, item.maxBatch); adapters.push(adapter); models.set(item.id, adapter); } }
        catch (error) { disposeRuntime(); throw error; }
      }
      try { runtime = await QuickJSPolicyRuntime.create(request.source, request.options, models); await runtime.reset(request.resetContext, request.options.loadBudgetMs ?? 10_000); }
      catch (error) { disposeRuntime(); throw error; }
      self.postMessage({ id: request.id, ok: true, value: { logs: runtime.logs } });
    } else if (request.type === "act") {
      if (!runtime) throw new Error("Agent worker is not initialized.");
      const value = await runtime.act(request.observation, request.budgetMs);
      self.postMessage({ id: request.id, ok: true, value: { action: value, logs: runtime.logs } });
    } else {
      disposeRuntime();
      self.postMessage({ id: request.id, ok: true, value: null });
      self.close();
    }
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
