import * as tf from "@tensorflow/tfjs";
import JSZip from "jszip";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
await tf.setBackend("cpu"); await tf.ready();
const model = tf.sequential();
model.add(tf.layers.dense({ inputShape: [64], units: 64, activation: "relu" }));
model.add(tf.layers.dense({ units: 64, activation: "relu" }));
model.add(tf.layers.dense({ units: 22, activation: "linear" }));
for (const [index, layer] of model.layers.entries()) {
  const [kernel, bias] = layer.getWeights();
  const nextKernel = tf.zeros(kernel.shape); const values = new Float32Array(bias.size); if (index === model.layers.length - 1) values[7] = 1; const nextBias = tf.tensor(values, bias.shape);
  layer.setWeights([nextKernel, nextBias]); nextKernel.dispose(); nextBias.dispose();
}
let artifacts;
await model.save(tf.io.withSaveHandler(async value => { artifacts = value; return { modelArtifactsInfo: { dateSaved: new Date("2026-09-26T00:00:00Z"), modelTopologyType: "JSON", modelTopologyBytes: JSON.stringify(value.modelTopology).length, weightSpecsBytes: JSON.stringify(value.weightSpecs).length, weightDataBytes: value.weightData?.byteLength ?? 0 } }; }));
if (!artifacts?.weightData || !artifacts.weightSpecs) throw new Error("TF.js did not produce weight artifacts.");
const modelJson = { format: "layers-model", generatedBy: "FleetRL deterministic example builder", convertedBy: null, modelTopology: artifacts.modelTopology, weightsManifest: [{ paths: ["weights.bin"], weights: artifacts.weightSpecs }] };
const manifest = JSON.parse(await readFile(path.join(root, "examples", "manifest-tfjs.json"), "utf8"));
const source = await readFile(path.join(root, "examples", "neural-agent.js")); const zip = new JSZip(); const date = new Date("2026-09-26T00:00:00Z");
zip.file("manifest.json", JSON.stringify(manifest, null, 2), { date }); zip.file("agent.js", source, { date }); zip.file("model/model.json", JSON.stringify(modelJson), { date }); zip.file("model/weights.bin", new Uint8Array(artifacts.weightData), { date });
const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 9 }, platform: "UNIX" });
const destinations = [path.join(root, "examples", "tfjs-constant-forward.agent.zip"), path.join(root, "public", "examples", "tfjs-constant-forward.agent.zip")];
for (const destination of destinations) { await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes); }
const publicExamples = path.join(root, "public", "examples");
await mkdir(publicExamples, { recursive: true });
for (const name of await readdir(path.join(root, "examples"))) {
  if (name === "tfjs-constant-forward.agent.zip") continue;
  await copyFile(path.join(root, "examples", name), path.join(publicExamples, name));
}
model.dispose();
console.log(JSON.stringify({ files: destinations.map(destination => path.relative(root, destination)), bytes: bytes.byteLength }));
