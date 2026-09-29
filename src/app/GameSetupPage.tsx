import { useState } from "react";
import { fleetAudio } from "../audio/mixer";
import type { GameMode, TeamId } from "../contracts/types";
import { AgentPicker } from "../game/AgentPicker";
import { assignedEntry } from "../game/import-agent";
import { clampMatchDurationSeconds, DEFAULT_MATCH_DURATION_SECONDS, freshPolicySeed, gameSession, resolveFleetSize, type FleetSizeChoice } from "../game/session";
import { gameArtStyle } from "../game/theme";
import { builtinEntries, preflightTournamentEntry, type TournamentEntry } from "../tournament/runner";
import { BrandCrest } from "./Brand";
import styles from "./GameShell.module.css";

const modes: { id: GameMode; name: string; detail: string }[] = [
  { id: "duel", name: "Duel", detail: "One ship per fleet" },
  { id: "fleet", name: "Fleet", detail: "Choose 2–6 ships per fleet" },
  { id: "fog-duel", name: "Fog Duel", detail: "One ship · explored-map fog" },
  { id: "fog-fleet", name: "Fog Fleet", detail: "Choose 2–6 ships · shared sight" },
];

export function GameSetupPage() {
  const remembered = gameSession.lastSetup;
  const stored = gameSession.storedPreferences;
  const initialMode = remembered?.mode ?? stored?.mode ?? "duel";
  const builtins = builtinEntries(initialMode);
  const entryFor = (id: string | undefined, fallback: TournamentEntry) => builtins.find(entry => entry.id === id) ?? fallback;
  const initialViewpoint = remembered?.viewpoint ?? stored?.viewpoint ?? "spectator";
  const [mode, setMode] = useState<GameMode>(initialMode);
  const [seed, setSeed] = useState(remembered?.seed ?? stored?.seed ?? 7);
  const [blue, setBlue] = useState<TournamentEntry>(remembered?.blue ?? entryFor(stored?.blueId, builtins[0]!));
  const [green, setGreen] = useState<TournamentEntry>(remembered?.green ?? entryFor(stored?.greenId, builtins[1]!));
  const [sound, setSound] = useState(remembered?.sound ?? stored?.sound ?? true);
  const [viewpoint, setViewpoint] = useState<"spectator" | TeamId>(initialMode.startsWith("fog") && initialViewpoint === "spectator" ? "blue" : initialViewpoint);
  const [fleetSizeChoice, setFleetSizeChoice] = useState<FleetSizeChoice>(remembered?.fleetSizeChoice ?? stored?.fleetSizeChoice ?? 3);
  const [durationSeconds, setDurationSeconds] = useState(clampMatchDurationSeconds(remembered?.durationSeconds ?? stored?.durationSeconds ?? DEFAULT_MATCH_DURATION_SECONDS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fog = mode.startsWith("fog");

  const chooseMode = (next: GameMode) => {
    setMode(next);
    const compatible = builtinEntries(next);
    if (blue.supportedModes && !blue.supportedModes.includes(next)) setBlue(compatible[0]!);
    if (green.supportedModes && !green.supportedModes.includes(next)) setGreen(compatible[1] ?? compatible[0]!);
    if (next.startsWith("fog") && viewpoint === "spectator") setViewpoint("blue");
  };

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const policySeed = freshPolicySeed();
      const shipsPerTeam = mode.includes("fleet") ? resolveFleetSize(fleetSizeChoice, policySeed) : 1;
      await Promise.all([preflightTournamentEntry(blue, mode, shipsPerTeam), preflightTournamentEntry(green, mode, shipsPerTeam)]);
      if (sound) { await fleetAudio.unlock(); fleetAudio.setMuted(false); } else fleetAudio.setMuted(true);
      const selectedViewpoint = fog && viewpoint === "spectator" ? "blue" : viewpoint;
      const matchDuration = clampMatchDurationSeconds(durationSeconds);
      gameSession.rememberSetup({ mode, seed, blue, green, sound, viewpoint: selectedViewpoint, fleetSizeChoice, durationSeconds: matchDuration });
      gameSession.begin({ mode, seed, blue: assignedEntry(blue, "blue"), green: assignedEntry(green, "green"), sound, viewpoint: selectedViewpoint, shipsPerTeam, fleetSizeChoice, durationSeconds: matchDuration, policySeed, returnTo: "#/menu" });
      location.hash = "/game/live";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setBusy(false); }
  };

  return <section className={styles.screen} style={gameArtStyle}>
    <div className={styles.screenTop}><a className={styles.backLink} href="#/menu" aria-label="Back to main menu">←</a><header className={styles.screenTitle}><p className={styles.kicker}>New game</p><h1>Choose your captains</h1><p>Every movement, shot, and flag action comes from agent code.</p></header><a className={styles.screenBrandLink} href="#/menu" aria-label="Pirates War RL main menu"><BrandCrest className={styles.screenBrand} decorative /></a></div>
    {error && <div className={styles.errorBox} role="alert">Preflight failed: {error}</div>}
    <div className={styles.setupGrid}>
      <AgentPicker team="blue" mode={mode} value={blue} onChange={setBlue} />
      <section className={styles.parchmentPanel}>
        <div className={styles.versus}>VS</div><h2>Battle rules</h2>
        <div className={styles.modeGrid}>{modes.map(item => <label key={item.id} className={styles.modeTile}><input type="radio" name="game-mode" checked={mode === item.id} onChange={() => chooseMode(item.id)} /><strong>{item.name}</strong><span>{item.detail}</span></label>)}</div>
        {mode.includes("fleet") && <label className={styles.gameField}>Ships per fleet<select aria-label="Ships per fleet" value={fleetSizeChoice} onChange={event => setFleetSizeChoice(event.target.value === "random" ? "random" : Number(event.target.value) as FleetSizeChoice)}><option value="random">Random · 2 to 6</option>{[2, 3, 4, 5, 6].map(count => <option value={count} key={count}>{count} ships</option>)}</select></label>}
        <label className={styles.gameField}>Seed<input type="number" value={seed} onChange={event => setSeed(Number(event.target.value) || 0)} /></label>
        <label className={styles.gameField}>Battle time · seconds<input aria-label="Battle time in seconds" type="number" min="15" max="300" step="1" value={durationSeconds} onChange={event => setDurationSeconds(Number(event.target.value))} onBlur={() => setDurationSeconds(clampMatchDurationSeconds(durationSeconds))} /></label>
        <label className={styles.gameField}>View<select value={viewpoint} onChange={event => setViewpoint(event.target.value as typeof viewpoint)}>{!fog && <option value="spectator">Omniscient broadcast</option>}<option value="blue">Blue fleet vision</option><option value="rose">Green fleet vision</option></select></label>
        <label className={styles.gameField}>Sound<select value={sound ? "on" : "off"} onChange={event => setSound(event.target.value === "on")}><option value="on">On · full battle mix</option><option value="off">Muted</option></select></label>
        <p className={styles.agentMeta}>Shifting Archipelago · 0–6 wreck hazards · one capture wins · settings are remembered · 100 ms decisions</p>
      </section>
      <AgentPicker team="green" mode={mode} value={green} onChange={setGreen} />
    </div>
    <div className={styles.setupFooter}><button className={styles.gameButton} disabled={busy} onClick={() => void start()}>{busy ? "Inspecting both captains…" : "Start battle"}</button></div>
  </section>;
}
