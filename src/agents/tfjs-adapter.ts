import * as tf from "@tensorflow/tfjs";
import type { ModelAdapter } from "./model-adapter";
import { validatePredictionRows } from "./model-adapter";
import { safeTfjsModelPath, validateTfjsModelJson } from "./tfjs-schema";

export class TfjsLayersAdapter implements ModelAdapter {
  readonly id: string;
  readonly inputWidth: number;
  readonly outputWidth: number;
  readonly maxBatch: number;
  private readonly model: tf.LayersModel;

  private constructor(model: tf.LayersModel, id: string, inputWidth: number, outputWidth: number, maxBatch: number) {
    this.model = model; this.id = id; this.inputWidth = inputWidth; this.outputWidth = outputWidth; this.maxBatch = maxBatch;
  }

  static async load(modelJson: unknown, files: ReadonlyMap<string, Uint8Array>, modelDirectory = "model", id = "policy", inputWidth = 64, outputWidth = 22, maxBatch = 8): Promise<TfjsLayersAdapter> {
    validateTfjsModelJson(modelJson);
    const specs: tf.io.WeightsManifestEntry[] = [];
    const chunks: Uint8Array[] = [];
    for (const group of modelJson.weightsManifest) {
      specs.push(...group.weights as tf.io.WeightsManifestEntry[]);
      for (const path of group.paths) {
        const normalized = safeTfjsModelPath(`${modelDirectory}/${path}`.replace(/^\.\//, ""));
        const data = files.get(normalized);
        if (!data) throw new Error(`Missing declared TF.js weight shard: ${normalized}`);
        chunks.push(data);
      }
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const weightData = new Uint8Array(total);
    let offset = 0; for (const chunk of chunks) { weightData.set(chunk, offset); offset += chunk.byteLength; }
    await tf.setBackend("cpu"); await tf.ready();
    const handler = tf.io.fromMemory({ modelTopology: modelJson.modelTopology, weightSpecs: specs, weightData: weightData.buffer });
    const model = await tf.loadLayersModel(handler);
    const inputShape = model.inputs[0]?.shape;
    const outputShape = model.outputs[0]?.shape;
    if (inputShape?.length !== 2 || outputShape?.length !== 2 || inputShape[1] !== inputWidth || outputShape[1] !== outputWidth) { model.dispose(); throw new Error(`TF.js model shape must be [batch,${inputWidth}] -> [batch,${outputWidth}].`); }
    return new TfjsLayersAdapter(model, id, inputWidth, outputWidth, maxBatch);
  }

  async predict(rows: number[][]): Promise<number[][]> {
    validatePredictionRows(rows, this.inputWidth, this.maxBatch);
    const input = tf.tensor2d(rows, [rows.length, this.inputWidth], "float32");
    try {
      const prediction = this.model.predict(input, { batchSize: rows.length }) as tf.Tensor;
      try {
        if (prediction.rank !== 2 || prediction.shape[0] !== rows.length || prediction.shape[1] !== this.outputWidth) throw new Error("TF.js prediction shape mismatch.");
        const values = await prediction.data();
        const result: number[][] = [];
        for (let row = 0; row < rows.length; row += 1) {
          const output = Array.from(values.slice(row * this.outputWidth, (row + 1) * this.outputWidth));
          if (output.some(value => !Number.isFinite(value))) throw new Error("TF.js prediction contained a non-finite value.");
          result.push(output);
        }
        return result;
      } finally { prediction.dispose(); }
    } finally { input.dispose(); }
  }

  dispose(): void { this.model.dispose(); }
}
