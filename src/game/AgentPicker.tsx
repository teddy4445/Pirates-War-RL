import { useState } from "react";
import type { GameMode } from "../contracts/types";
import { builtinEntries, type TournamentEntry } from "../tournament/runner";
import { entryFromSource, importGameAgent } from "./import-agent";
import styles from "../app/GameShell.module.css";

const starter = `function reset(context) {}
function act(observation, api) {
  return { actions: observation.ships.map(ship => api.decodeDiscreteV1(ship.id, 7)) };
}`;

interface Props { team: "blue" | "green"; mode: GameMode; value: TournamentEntry; onChange(entry: TournamentEntry): void; }

export function AgentPicker({ team, mode, value, onChange }: Props) {
  const builtins = builtinEntries(); const [showCode, setShowCode] = useState(false); const [name, setName] = useState(`${team === "blue" ? "Blue" : "Green"} Challenger`); const [source, setSource] = useState(starter); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const loadFile = async (file: File) => { setBusy(true); setError(""); try { const next = await importGameAgent(file); if (next.supportedModes && !next.supportedModes.includes(mode)) throw new Error(`${next.alias} does not declare support for ${mode}.`); onChange(next); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); } };
  const useCode = async () => { setBusy(true); setError(""); try { onChange(await entryFromSource(source, name)); setShowCode(false); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); } };
  return <article className={`${styles.agentCard} ${team === "blue" ? styles.blueCard : styles.greenCard}`}>
    <div className={styles.agentBanner}><span className={styles.teamCrest} aria-hidden="true">{team === "blue" ? "●" : "◆"}</span><div><small>{team === "blue" ? "BLUE FLEET" : "GREEN FLEET"}</small><h2>{value.alias}</h2></div></div>
    <label className={styles.gameField}>Choose a built-in captain<select value={builtins.some(item => item.id === value.id) ? value.id : "custom"} onChange={event => { const selected = builtins.find(item => item.id === event.target.value); if (selected) onChange(selected); }}><option value="custom" disabled>Custom · {value.alias}</option>{builtins.map(entry => <option key={entry.id} value={entry.id}>{entry.alias}</option>)}</select></label>
    <div className={styles.agentActions}><label className={`${styles.miniButton} ${busy ? styles.disabled : ""}`}>Upload agent<input hidden type="file" accept=".js,.zip,.json,.agent.json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void loadFile(file); event.target.value = ""; }} /></label><button className={styles.miniButton} type="button" onClick={() => setShowCode(value => !value)}>Paste JavaScript</button></div>
    <p className={styles.agentMeta}>{builtins.some(item => item.id === value.id) ? "Tactical built-in captain · obstacle-aware · objective-driven" : `${value.kind.toUpperCase()} · ${value.hash.slice(0, 12)}… · session only`}</p>
    {showCode && <div className={styles.codeDrawer}><label className={styles.gameField}>Agent name<input value={name} onChange={event => setName(event.target.value)} /></label><label className={styles.gameField}>agent.js<textarea value={source} spellCheck={false} onChange={event => setSource(event.target.value)} /></label><button className={styles.miniButton} type="button" disabled={busy} onClick={() => void useCode()}>Use this code</button></div>}
    {error && <p className={styles.inlineError} role="alert">{error}</p>}
  </article>;
}
