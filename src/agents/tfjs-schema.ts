export interface WeightSpec { name: string; shape: number[]; dtype: "float32" | "int32" | "bool"; }
export interface WeightGroup { paths: string[]; weights: WeightSpec[]; }
export interface TfjsModelJson { modelTopology: any; weightsManifest: WeightGroup[]; format?: string; generatedBy?: string; convertedBy?: string; }
const allowedLayers = new Set(["InputLayer", "Dense", "Activation", "Flatten"]);

export function safeTfjsModelPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (/^[a-z]+:/i.test(normalized) || normalized.startsWith("/") || normalized.split("/").includes("..")) throw new Error(`Remote or unsafe model path rejected: ${path}`);
  return normalized;
}

export function validateTfjsModelJson(value: unknown): asserts value is TfjsModelJson {
  if (!value || typeof value !== "object") throw new Error("TF.js model.json must be an object.");
  const model = value as TfjsModelJson; const topology = model.modelTopology;
  if (!topology || typeof topology !== "object" || topology.class_name !== "Sequential" || !Array.isArray(topology.config?.layers)) throw new Error("Only sequential TF.js Layers topology is supported.");
  if (topology.config.layers.length > 8) throw new Error("TF.js model exceeds the 8-layer limit.");
  for (const layer of topology.config.layers) { if (!allowedLayers.has(String(layer?.class_name))) throw new Error(`Unsupported or executable TF.js layer: ${String(layer?.class_name)}`); const activation = layer?.config?.activation; if (activation && !["relu", "tanh", "linear"].includes(String(activation))) throw new Error(`Unsupported TF.js activation: ${String(activation)}`); }
  if (!Array.isArray(model.weightsManifest) || model.weightsManifest.length < 1) throw new Error("TF.js weightsManifest is required.");
  let parameters = 0;
  for (const group of model.weightsManifest) { if (!Array.isArray(group.paths) || !Array.isArray(group.weights)) throw new Error("Malformed TF.js weight group."); group.paths.forEach(safeTfjsModelPath); for (const spec of group.weights) { if (!Array.isArray(spec.shape) || !["float32", "int32", "bool"].includes(spec.dtype)) throw new Error("Unsupported TF.js weight specification."); parameters += spec.shape.reduce((product, dimension) => product * dimension, 1); } }
  if (parameters > 1_000_000) throw new Error("TF.js model exceeds the one-million-parameter limit.");
}
