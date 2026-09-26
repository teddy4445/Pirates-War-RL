import JSZip from "jszip";
import type { AgentManifest, ModelDescriptor } from "../contracts/types";
import { validateAgentManifest } from "../contracts/validation";
import { validateTfjsModelJson } from "./tfjs-schema";

export interface ImportLimits { maxSourceBytes: number; maxCompressedBytes: number; maxExtractedBytes: number; maxFiles: number; maxPathDepth: number; maxJsonBytes: number; }
export const defaultImportLimits: ImportLimits = { maxSourceBytes: 102_400, maxCompressedBytes: 10_485_760, maxExtractedBytes: 33_554_432, maxFiles: 64, maxPathDepth: 4, maxJsonBytes: 2_097_152 };
export interface ImportedScriptPackage { manifest: AgentManifest; source: string; files: Map<string, Uint8Array>; sha256: string; }
export interface ImportedTfjsModel { descriptor: ModelDescriptor; modelJson: unknown; modelDirectory: string; }
export interface ImportedTfjsPackage extends ImportedScriptPackage { models: ImportedTfjsModel[]; bytes: Uint8Array; }

const utf8 = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

function safePath(raw: string, maxDepth: number): string {
  const normalized = raw.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.split("/").some(part => part === ".." || part === "") || normalized.split("/").length > maxDepth) throw new Error(`Unsafe archive path: ${raw}`);
  return normalized;
}

/** Reads central-directory names before JSZip can sanitize or coalesce them. */
export function scanZipEntryNames(bytes: Uint8Array, limits = defaultImportLimits): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names: string[] = [];
  const seen = new Set<string>();
  const seenCase = new Set<string>();
  let declaredExtracted = 0;
  for (let offset = 0; offset <= bytes.byteLength - 46; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const flags = view.getUint16(offset + 8, true); const uncompressedSize = view.getUint32(offset + 24, true);
    if (flags & 1) throw new Error("Encrypted ZIP entries are not allowed."); declaredExtracted += uncompressedSize; if (declaredExtracted > limits.maxExtractedBytes) throw new Error("Declared ZIP extraction exceeds the 32 MiB limit.");
    const end = offset + 46 + nameLength;
    if (end > bytes.byteLength) throw new Error("Truncated ZIP central directory.");
    const raw = utf8.decode(bytes.subarray(offset + 46, end));
    const nextOffset = end + extraLength + commentLength;
    const name = safePath(raw.replace(/\/$/, ""), limits.maxPathDepth);
    if (raw.endsWith("/")) { offset = nextOffset - 1; continue; }
    const lower = name.toLocaleLowerCase("en-US");
    if (seen.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
    if (seenCase.has(lower)) throw new Error(`Case-colliding ZIP entry: ${name}`);
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) throw new Error(`Symbolic links are not allowed: ${name}`);
    seen.add(name); seenCase.add(lower); names.push(name);
    if (names.length > limits.maxFiles) throw new Error("Archive file count exceeds the limit.");
    offset = nextOffset - 1;
  }
  if (!names.length) throw new Error("ZIP has no readable central-directory entries.");
  return names;
}

async function sha256Hex(parts: readonly [string, Uint8Array][]): Promise<string> {
  const chunks: Uint8Array[] = [];
  for (const [name, data] of parts) { chunks.push(encoder.encode(`${name}\0${data.byteLength}\0`), data); }
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function packageFromSource(source: string, name = "Pasted agent", limits = defaultImportLimits): Promise<ImportedScriptPackage> {
  const bytes = encoder.encode(source);
  if (bytes.byteLength > limits.maxSourceBytes) return Promise.reject(new Error("Agent source exceeds the 100 KiB limit."));
  const manifest: AgentManifest = { packageVersion: "fleetrl-package-v1", name, apiVersion: "fleetrl-agent-v1", controlScope: "team", entry: "agent.js", models: [], supportedModes: ["duel", "fleet", "fog-duel", "fog-fleet"] };
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const files = new Map<string, Uint8Array>([["agent.js", bytes], ["manifest.json", manifestBytes]]);
  return sha256Hex([...files.entries()].sort(([a], [b]) => a.localeCompare(b))).then(sha256 => ({ manifest, source, files, sha256 }));
}

export async function importScriptZip(bytes: Uint8Array, limits = defaultImportLimits): Promise<ImportedScriptPackage> {
  if (bytes.byteLength > limits.maxCompressedBytes) throw new Error("Compressed archive exceeds the 10 MiB limit.");
  const names = scanZipEntryNames(bytes, limits);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  const files = new Map<string, Uint8Array>();
  let extracted = 0;
  for (const name of names.sort()) {
    const entry = zip.file(name);
    if (!entry) throw new Error(`ZIP entry could not be read: ${name}`);
    const data = await entry.async("uint8array");
    extracted += data.byteLength;
    if (extracted > limits.maxExtractedBytes) throw new Error("Extracted archive exceeds the 32 MiB limit.");
    files.set(name, data);
  }
  const manifestBytes = files.get("manifest.json");
  if (!manifestBytes || manifestBytes.byteLength > limits.maxJsonBytes) throw new Error("A bounded manifest.json is required.");
  let rawManifest: unknown;
  try { rawManifest = JSON.parse(utf8.decode(manifestBytes)); } catch { throw new Error("manifest.json must be valid UTF-8 JSON."); }
  const validated = validateAgentManifest(rawManifest);
  if (!validated.ok) throw new Error(`Invalid manifest: ${validated.errors.join("; ")}`);
  const allowed = new Set(["manifest.json", validated.value.entry]);
  if (validated.value.models.length) throw new Error("Script import does not accept model descriptors; use the model package pipeline.");
  for (const name of files.keys()) if (!allowed.has(name)) throw new Error(`Undeclared file in script package: ${name}`);
  const sourceBytes = files.get(validated.value.entry);
  if (!sourceBytes || sourceBytes.byteLength > limits.maxSourceBytes) throw new Error("Declared agent source is missing or too large.");
  const source = utf8.decode(sourceBytes);
  const sha256 = await sha256Hex([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
  return { manifest: validated.value, source, files, sha256 };
}

export async function importTfjsZip(bytes: Uint8Array, limits = defaultImportLimits): Promise<ImportedTfjsPackage> {
  if (bytes.byteLength > limits.maxCompressedBytes) throw new Error("Compressed archive exceeds the 10 MiB limit.");
  const names = scanZipEntryNames(bytes, limits); const zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false }); const files = new Map<string, Uint8Array>(); let extracted = 0;
  for (const name of names.sort()) { const entry = zip.file(name); if (!entry) throw new Error(`ZIP entry could not be read: ${name}`); const data = await entry.async("uint8array"); extracted += data.byteLength; if (extracted > limits.maxExtractedBytes) throw new Error("Extracted archive exceeds the 32 MiB limit."); files.set(name, data); }
  const manifestBytes = files.get("manifest.json"); if (!manifestBytes || manifestBytes.byteLength > limits.maxJsonBytes) throw new Error("A bounded manifest.json is required.");
  let rawManifest: unknown; try { rawManifest = JSON.parse(utf8.decode(manifestBytes)); } catch { throw new Error("manifest.json must be valid UTF-8 JSON."); }
  const validated = validateAgentManifest(rawManifest); if (!validated.ok) throw new Error(`Invalid manifest: ${validated.errors.join("; ")}`);
  if (!validated.value.models.length || validated.value.models.some(model => model.format !== "tfjs-layers")) throw new Error("TF.js package must declare at least one tfjs-layers model and no other model formats.");
  const allowed = new Set(["manifest.json", validated.value.entry]); const models: ImportedTfjsModel[] = [];
  for (const descriptor of validated.value.models) {
    const modelPath = safePath(descriptor.modelPath!, limits.maxPathDepth); const modelBytes = files.get(modelPath); if (!modelBytes || modelBytes.byteLength > limits.maxJsonBytes) throw new Error(`Declared TF.js model JSON is missing or too large: ${modelPath}`);
    let modelJson: unknown; try { modelJson = JSON.parse(utf8.decode(modelBytes)); } catch { throw new Error(`TF.js model JSON must be valid UTF-8 JSON: ${modelPath}`); }
    validateTfjsModelJson(modelJson); allowed.add(modelPath); const directory = modelPath.includes("/") ? modelPath.slice(0, modelPath.lastIndexOf("/")) : ".";
    const manifest = modelJson as { weightsManifest: { paths: string[] }[] };
    for (const group of manifest.weightsManifest) for (const shard of group.paths) { const joined = safePath(`${directory === "." ? "" : `${directory}/`}${shard}`, limits.maxPathDepth); if (!files.has(joined)) throw new Error(`Missing declared TF.js weight shard: ${joined}`); allowed.add(joined); }
    models.push({ descriptor, modelJson, modelDirectory: directory });
  }
  for (const name of files.keys()) if (!allowed.has(name)) throw new Error(`Undeclared file in TF.js package: ${name}`);
  const sourceBytes = files.get(validated.value.entry); if (!sourceBytes || sourceBytes.byteLength > limits.maxSourceBytes) throw new Error("Declared agent source is missing or too large."); const source = utf8.decode(sourceBytes);
  const sha256 = await sha256Hex([...files.entries()].sort(([a], [b]) => a.localeCompare(b))); return { manifest: validated.value, source, files, models, bytes, sha256 };
}

export function bytesToBase64(bytes: Uint8Array): string { let binary = ""; for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768)); return btoa(binary); }
export function base64ToBytes(value: string): Uint8Array { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index); return bytes; }
