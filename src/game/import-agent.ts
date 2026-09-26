import { parseDenseAgentJson } from "../agents/dense-json";
import { bytesToBase64, importScriptZip, importTfjsZip, packageFromSource } from "../agents/import";
import type { TournamentEntry } from "../tournament/runner";

const digestText = async (text: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, "0")).join("");

export async function importGameAgent(file: File): Promise<TournamentEntry> {
  if (file.name.toLowerCase().endsWith(".zip")) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const packaged = await importScriptZip(bytes);
      return { id: `upload-${packaged.sha256}`, alias: packaged.manifest.name, student: "Uploaded for this session", hash: packaged.sha256, kind: "script", payload: packaged.source, supportedModes: packaged.manifest.supportedModes };
    } catch (caught) {
      if (!(caught instanceof Error) || !caught.message.includes("model descriptors")) throw caught;
      const packaged = await importTfjsZip(bytes);
      return { id: `upload-${packaged.sha256}`, alias: packaged.manifest.name, student: "Uploaded for this session", hash: packaged.sha256, kind: "tfjs", payload: bytesToBase64(packaged.bytes), supportedModes: packaged.manifest.supportedModes };
    }
  }
  if (file.name.toLowerCase().endsWith(".json")) {
    const text = await file.text(); const packaged = parseDenseAgentJson(text); const hash = await digestText(text);
    return { id: `upload-${hash}`, alias: packaged.name, student: "Uploaded for this session", hash, kind: "dense", payload: JSON.stringify(packaged), supportedModes: packaged.supportedModes };
  }
  return entryFromSource(await file.text(), file.name.replace(/\.js$/i, ""));
}

export async function entryFromSource(source: string, name: string): Promise<TournamentEntry> {
  const packaged = await packageFromSource(source, name || "Pasted agent");
  return { id: `upload-${packaged.sha256}`, alias: packaged.manifest.name, student: "Pasted for this session", hash: packaged.sha256, kind: "script", payload: packaged.source, supportedModes: packaged.manifest.supportedModes };
}

export function assignedEntry(entry: TournamentEntry, slot: string): TournamentEntry {
  return { ...entry, id: `${entry.id}:${slot}`, alias: entry.alias };
}
