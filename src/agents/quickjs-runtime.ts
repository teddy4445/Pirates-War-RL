import { getQuickJS, type QuickJSContext, type QuickJSHandle, type QuickJSRuntime } from "quickjs-emscripten";
import type { Observation, TeamAction } from "../contracts/types";
import { decodeDiscreteV1, encodeShipV1 } from "../contracts/adapters";
import { XorShift32 } from "../sim/rng";
import type { ModelAdapter } from "./model-adapter";
import { validatePredictionRows } from "./model-adapter";

export interface SandboxOptions {
  memoryLimitBytes?: number;
  stackLimitBytes?: number;
  maxOutputBytes?: number;
  maxLogEntries?: number;
  seed?: number;
  loadBudgetMs?: number;
}

const now = () => globalThis.performance?.now() ?? Date.now();

export class QuickJSPolicyRuntime {
  private runtime: QuickJSRuntime;
  private context: QuickJSContext;
  private deadline = Number.POSITIVE_INFINITY;
  private currentObservation: Observation | null = null;
  private readonly random: XorShift32;
  private readonly maxOutputBytes: number;
  private readonly maxLogEntries: number;
  private disposed = false;
  private inferenceCalls = 0;
  private readonly models: ReadonlyMap<string, ModelAdapter>;
  readonly logs: string[] = [];

  private constructor(runtime: QuickJSRuntime, context: QuickJSContext, options: SandboxOptions, models: ReadonlyMap<string, ModelAdapter>) {
    this.runtime = runtime;
    this.context = context;
    this.random = new XorShift32(options.seed ?? 1);
    this.maxOutputBytes = options.maxOutputBytes ?? 65_536;
    this.maxLogEntries = options.maxLogEntries ?? 64;
    this.models = models;
  }

  static async create(source: string, options: SandboxOptions = {}, models: ReadonlyMap<string, ModelAdapter> = new Map()): Promise<QuickJSPolicyRuntime> {
    const sourceBytes = new TextEncoder().encode(source).byteLength;
    if (sourceBytes > 102_400) throw new Error("Agent source exceeds the 100 KiB limit.");
    const module = await getQuickJS();
    const runtime = module.newRuntime();
    runtime.setMemoryLimit(options.memoryLimitBytes ?? 33_554_432);
    runtime.setMaxStackSize(options.stackLimitBytes ?? 524_288);
    const context = runtime.newContext();
    const sandbox = new QuickJSPolicyRuntime(runtime, context, options, models);
    runtime.setInterruptHandler(() => now() > sandbox.deadline);
    try {
      sandbox.installBindings();
      sandbox.evalSync(`
        "use strict";
        for (const key of ["fetch","WebSocket","XMLHttpRequest","indexedDB","document","window","postMessage","importScripts"]) {
          try { Object.defineProperty(globalThis, key, { value: undefined, configurable: false, writable: false }); } catch {}
        }
        try { Object.defineProperty(globalThis, "Date", { value: undefined, configurable: false, writable: false }); } catch {}
        Math.random = () => __fleetrlRandom();
        const __fleetrlApi = Object.freeze({
          random: () => __fleetrlRandom(),
          log: value => __fleetrlLog(String(value)),
          encodeShipV1: shipId => JSON.parse(__fleetrlEncode(String(shipId))),
          decodeDiscreteV1: (shipId, actionId) => JSON.parse(__fleetrlDecode(String(shipId), Number(actionId))),
          predict: async (modelId, rows) => JSON.parse(await __fleetrlPredict(String(modelId), JSON.stringify(rows)))
        });
      `, options.loadBudgetMs ?? 10_000);
      sandbox.evalSync(`${source}\n;if (typeof act !== "function") throw new Error("Agent must declare function act(observation, api).");`, options.loadBudgetMs ?? 10_000);
      return sandbox;
    } catch (error) {
      sandbox.dispose();
      throw error;
    }
  }

  private installBindings(): void {
    const randomHandle = this.context.newFunction("__fleetrlRandom", () => this.context.newNumber(this.random.nextFloat()));
    const logHandle = this.context.newFunction("__fleetrlLog", value => {
      if (this.logs.length < this.maxLogEntries) this.logs.push(String(this.context.dump(value)).slice(0, 500));
      return this.context.undefined;
    });
    const encodeHandle = this.context.newFunction("__fleetrlEncode", shipIdHandle => {
      if (!this.currentObservation) throw new Error("encodeShipV1 is only available during act.");
      const result = encodeShipV1(this.currentObservation, String(this.context.dump(shipIdHandle)));
      return this.context.newString(JSON.stringify(result));
    });
    const decodeHandle = this.context.newFunction("__fleetrlDecode", (shipIdHandle, actionIdHandle) => {
      if (!this.currentObservation) throw new Error("decodeDiscreteV1 is only available during act.");
      const result = decodeDiscreteV1(this.currentObservation, String(this.context.dump(shipIdHandle)), Number(this.context.dump(actionIdHandle)));
      return this.context.newString(JSON.stringify(result));
    });
    const predictHandle = this.context.newFunction("__fleetrlPredict", (modelIdHandle, rowsHandle) => {
      const promise = this.context.newPromise();
      const modelId = String(this.context.dump(modelIdHandle));
      const adapter = this.models.get(modelId);
      let rows: unknown;
      try { rows = JSON.parse(String(this.context.dump(rowsHandle))); } catch { rows = null; }
      const settle = async () => {
        try {
          if (!adapter) throw new Error(`Unknown model adapter: ${modelId}`);
          if (++this.inferenceCalls > 1) throw new Error("Only one batched inference call is allowed per decision.");
          validatePredictionRows(rows, adapter.inputWidth, adapter.maxBatch);
          const output = await adapter.predict(rows);
          const handle = this.context.newString(JSON.stringify(output));
          promise.resolve(handle); handle.dispose();
        } catch (error) {
          const handle = this.context.newString(error instanceof Error ? error.message : String(error));
          promise.reject(handle); handle.dispose();
        } finally {
          if (!this.disposed) this.runtime.executePendingJobs();
          promise.dispose();
        }
      };
      void settle();
      return promise.handle;
    });
    for (const [name, handle] of [["__fleetrlRandom", randomHandle], ["__fleetrlLog", logHandle], ["__fleetrlEncode", encodeHandle], ["__fleetrlDecode", decodeHandle], ["__fleetrlPredict", predictHandle]] as const) {
      this.context.setProp(this.context.global, name, handle);
      handle.dispose();
    }
  }

  private evalSync(code: string, budgetMs: number): unknown {
    this.assertUsable();
    this.deadline = now() + budgetMs;
    try {
      const result = this.context.evalCode(code, "fleetrl-agent.js");
      const handle = this.context.unwrapResult(result);
      return handle.consume(value => this.context.dump(value));
    } finally {
      this.deadline = Number.POSITIVE_INFINITY;
    }
  }

  private async evalSerializedPromise(code: string, budgetMs: number): Promise<string> {
    this.assertUsable();
    this.deadline = now() + budgetMs;
    let promiseHandle: QuickJSHandle | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let terminalFailure = false;
    try {
      promiseHandle = this.context.unwrapResult(this.context.evalCode(code, "fleetrl-agent-call.js"));
      const resolution = this.context.resolvePromise(promiseHandle);
      this.runtime.executePendingJobs();
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Agent decision exceeded ${budgetMs} ms.`)), budgetMs);
      });
      const resolved = await Promise.race([resolution, timeout]);
      const value = this.context.unwrapResult(resolved);
      const serialized = value.consume(handle => this.context.getString(handle));
      if (new TextEncoder().encode(serialized).byteLength > this.maxOutputBytes) throw new Error("Agent output exceeds the 64 KiB limit.");
      return serialized;
    } catch (error) {
      terminalFailure = error instanceof Error && (error.message.includes("interrupted") || error.message.includes("exceeded"));
      throw error;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (!this.disposed && promiseHandle?.alive) promiseHandle.dispose();
      this.deadline = Number.POSITIVE_INFINITY;
      if (terminalFailure) this.dispose();
    }
  }

  async reset(context: unknown, budgetMs = 100): Promise<void> {
    const source = JSON.stringify(context);
    await this.evalSerializedPromise(`(async () => { if (typeof reset === "function") await reset(${source}); return JSON.stringify(null); })()`, budgetMs);
  }

  async act(observation: Observation, budgetMs = 100): Promise<TeamAction> {
    this.currentObservation = observation;
    this.inferenceCalls = 0;
    try {
      const source = JSON.stringify(observation);
      const serialized = await this.evalSerializedPromise(`(async () => { const result = await act(${source}, __fleetrlApi); const text = JSON.stringify(result); if (typeof text !== "string") throw new Error("Agent output must be JSON data."); return text; })()`, budgetMs);
      return JSON.parse(serialized) as TeamAction;
    } finally {
      this.currentObservation = null;
    }
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("Agent runtime is disposed.");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.context.dispose();
    this.runtime.dispose();
  }
}
