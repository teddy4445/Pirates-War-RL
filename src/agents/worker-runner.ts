import type { Observation, TeamAction } from "../contracts/types";
import type { ImportedTfjsModel } from "./import";
import type { DenseModelJson } from "./dense-json";
import type { SandboxOptions } from "./quickjs-runtime";

export interface WorkerModelPackage { models?: ImportedTfjsModel[]; files?: [string, Uint8Array][]; denseModels?: { id: string; model: DenseModelJson; maxBatch: number }[]; }

interface Reply { id: number; ok: boolean; value?: { action?: TeamAction; logs?: string[] }; error?: string; }

export class WorkerPolicyRunner {
  private worker: Worker;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private disposed = false;

  constructor() {
    this.worker = new Worker(new URL("../workers/agent.worker.ts", import.meta.url), { type: "module", name: "fleetrl-agent" });
    this.worker.onmessage = (message: MessageEvent<Reply>) => {
      const pending = this.pending.get(message.data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.data.id);
      if (message.data.ok) pending.resolve(message.data);
      else pending.reject(new Error(message.data.error ?? "Agent worker failed."));
    };
    this.worker.onerror = event => this.failAll(new Error(event.message || "Agent worker crashed."));
  }

  private request(payload: object, timeoutMs: number): Promise<Reply> {
    if (this.disposed) return Promise.reject(new Error("Agent worker is disposed."));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.worker.terminate();
        this.disposed = true;
        reject(new Error(`Agent worker exceeded ${timeoutMs} ms and was terminated.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, ...payload });
    });
  }

  async initialize(source: string, resetContext: unknown, options: SandboxOptions = {}, modelPackage?: WorkerModelPackage): Promise<void> {
    await this.request({ type: "init", source, resetContext, options, modelPackage }, (options.loadBudgetMs ?? 10_000) + 2_000);
  }

  async act(observation: Observation, budgetMs: number): Promise<TeamAction> {
    const reply = await this.request({ type: "act", observation, budgetMs }, budgetMs + 25);
    if (!reply.value?.action) throw new Error("Agent worker returned no action.");
    return reply.value.action;
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.disposed = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.worker.terminate();
    this.disposed = true;
    this.failAll(new Error("Agent worker disposed."));
  }
}
