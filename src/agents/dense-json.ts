import type { GameMode, Observation, ShipAction } from "../contracts/types";
import { decodeDiscreteV1, discreteActionMaskV1, encodeShipV1 } from "../contracts/adapters";
import type { ModelAdapter } from "./model-adapter";
import { validatePredictionRows } from "./model-adapter";

export type DenseActivation = "relu" | "tanh" | "linear";
export interface DenseLayerJson { inputWidth: number; outputWidth: number; activation: DenseActivation; weights: number[]; bias: number[]; }
export interface DenseModelJson { format: "dense-json-v1"; inputWidth: number; outputWidth: number; layers: DenseLayerJson[]; }
export interface DenseAgentPackage {
  packageVersion: "fleetrl-package-v1";
  name: string;
  apiVersion: "fleetrl-agent-v1";
  controlScope: "team";
  controller: "shared-dense-argmax-v1";
  featureEncoder: "ship-64-v1";
  actionDecoder: "discrete-22-v1";
  supportedModes: GameMode[];
  model: DenseModelJson;
  metadata?: Record<string, unknown>;
}

export interface DenseValidation { ok: boolean; errors: string[]; parameterCount: number; package?: DenseAgentPackage; }
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function validateDenseAgentPackage(value: unknown, maxParameters = 1_000_000, maxLayers = 8): DenseValidation {
  const errors: string[] = [];
  let parameterCount = 0;
  if (!record(value)) return { ok: false, errors: ["Dense package must be an object."], parameterCount };
  if (value.packageVersion !== "fleetrl-package-v1" || value.apiVersion !== "fleetrl-agent-v1" || value.controlScope !== "team") errors.push("Package/API/control versions are incompatible.");
  if (value.controller !== "shared-dense-argmax-v1" || value.featureEncoder !== "ship-64-v1" || value.actionDecoder !== "discrete-22-v1") errors.push("Dense controller requires shared-dense-argmax-v1, ship-64-v1, and discrete-22-v1.");
  if (typeof value.name !== "string" || value.name.trim().length < 1 || value.name.length > 100) errors.push("Package name must contain 1-100 characters.");
  if (!Array.isArray(value.supportedModes) || value.supportedModes.some(mode => !["duel", "fleet", "fog-duel", "fog-fleet"].includes(String(mode)))) errors.push("supportedModes is invalid.");
  if (!record(value.model)) errors.push("model is required.");
  const model = record(value.model) ? value.model : {};
  if (model.format !== "dense-json-v1" || model.inputWidth !== 64 || model.outputWidth !== 22) errors.push("Model must be dense-json-v1 with shape 64 -> 22.");
  if (!Array.isArray(model.layers) || model.layers.length < 1 || model.layers.length > maxLayers) errors.push(`Model must contain 1-${maxLayers} Dense layers.`);
  let preceding = 64;
  if (Array.isArray(model.layers)) for (let index = 0; index < model.layers.length; index += 1) {
    const layer = model.layers[index];
    if (!record(layer)) { errors.push(`Layer ${index} must be an object.`); continue; }
    const inputWidth = Number(layer.inputWidth);
    const outputWidth = Number(layer.outputWidth);
    if (!Number.isInteger(inputWidth) || !Number.isInteger(outputWidth) || inputWidth < 1 || outputWidth < 1 || inputWidth > 256 || outputWidth > 256) errors.push(`Layer ${index} dimensions are invalid.`);
    if (inputWidth !== preceding) errors.push(`Layer ${index} input width does not match the previous output.`);
    if (!Array.isArray(layer.weights) || layer.weights.length !== inputWidth * outputWidth || layer.weights.some(number => typeof number !== "number" || !Number.isFinite(number) || !Number.isFinite(Math.fround(number)))) errors.push(`Layer ${index} weights must be finite row-major float32 values.`);
    if (!Array.isArray(layer.bias) || layer.bias.length !== outputWidth || layer.bias.some(number => typeof number !== "number" || !Number.isFinite(number) || !Number.isFinite(Math.fround(number)))) errors.push(`Layer ${index} bias must contain finite float32 values.`);
    if (!new Set(["relu", "tanh", "linear"]).has(String(layer.activation))) errors.push(`Layer ${index} activation is unsupported.`);
    parameterCount += Math.max(0, inputWidth * outputWidth + outputWidth);
    preceding = outputWidth;
  }
  if (preceding !== 22) errors.push("Final Dense layer must output 22 values.");
  if (parameterCount > maxParameters) errors.push(`Model has ${parameterCount} parameters; limit is ${maxParameters}.`);
  return errors.length ? { ok: false, errors, parameterCount } : { ok: true, errors, parameterCount, package: value as unknown as DenseAgentPackage };
}

function activate(value: number, activation: DenseActivation): number {
  if (activation === "relu") return Math.max(0, value);
  if (activation === "tanh") return Math.tanh(value);
  return value;
}

export class DenseJsonAdapter implements ModelAdapter {
  readonly id: string;
  readonly inputWidth = 64;
  readonly outputWidth = 22;
  readonly maxBatch: number;
  private readonly layers: { inputWidth: number; outputWidth: number; activation: DenseActivation; weights: Float32Array; bias: Float32Array }[];

  constructor(model: DenseModelJson, id = "policy", maxBatch = 8) {
    const checked = validateDenseAgentPackage({ packageVersion: "fleetrl-package-v1", name: "adapter", apiVersion: "fleetrl-agent-v1", controlScope: "team", controller: "shared-dense-argmax-v1", featureEncoder: "ship-64-v1", actionDecoder: "discrete-22-v1", supportedModes: ["duel"], model });
    if (!checked.ok) throw new Error(checked.errors.join("; "));
    this.id = id;
    this.maxBatch = maxBatch;
    this.layers = model.layers.map(layer => ({ ...layer, weights: Float32Array.from(layer.weights), bias: Float32Array.from(layer.bias) }));
  }

  async predict(rows: number[][]): Promise<number[][]> {
    validatePredictionRows(rows, this.inputWidth, this.maxBatch);
    return rows.map(row => {
      let values = Float32Array.from(row);
      for (const layer of this.layers) {
        const output = new Float32Array(layer.outputWidth);
        for (let out = 0; out < layer.outputWidth; out += 1) {
          let sum = layer.bias[out] ?? 0;
          const offset = out * layer.inputWidth;
          for (let input = 0; input < layer.inputWidth; input += 1) sum += (layer.weights[offset + input] ?? 0) * (values[input] ?? 0);
          output[out] = Math.fround(activate(sum, layer.activation));
        }
        values = output;
      }
      const output = Array.from(values); if (output.some(value => !Number.isFinite(value))) throw new Error("Dense prediction contained a non-finite value."); return output;
    });
  }

  dispose(): void {}
}

export async function runDenseController(packageValue: DenseAgentPackage, observation: Observation): Promise<{ actions: ShipAction[]; actionIds: Record<string, number>; qValues: Record<string, number[]> }> {
  const adapter = new DenseJsonAdapter(packageValue.model);
  try {
    const ships = observation.ships.filter(ship => ship.alive).sort((a, b) => a.id.localeCompare(b.id));
    if (!ships.length) return { actions: [], actionIds: {}, qValues: {} };
    const rows = ships.map(ship => encodeShipV1(observation, ship.id));
    const outputs = await adapter.predict(rows);
    const actions: ShipAction[] = [];
    const actionIds: Record<string, number> = {};
    const qValues: Record<string, number[]> = {};
    ships.forEach((ship, index) => {
      const values = outputs[index] ?? [];
      const mask = discreteActionMaskV1(observation, ship.id);
      let best = mask.findIndex(Boolean);
      if (best < 0) best = 4;
      for (let candidate = best + 1; candidate < values.length; candidate += 1) if (mask[candidate] && (values[candidate] ?? -Infinity) > (values[best] ?? -Infinity)) best = candidate;
      actionIds[ship.id] = best;
      qValues[ship.id] = [...values];
      actions.push(decodeDiscreteV1(observation, ship.id, best));
    });
    return { actions, actionIds, qValues };
  } finally { adapter.dispose(); }
}

export function parseDenseAgentJson(text: string, maxBytes = 33_554_432): DenseAgentPackage {
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("Dense JSON exceeds the configured byte limit.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Agent JSON must be valid UTF-8 JSON."); }
  const result = validateDenseAgentPackage(value);
  if (!result.ok || !result.package) throw new Error(result.errors.join("; "));
  return result.package;
}
