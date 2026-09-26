import { useEffect, useMemo, useRef, useState } from "react";
import { fleetAudio } from "../audio/mixer";
import { gameSession } from "../game/session";
import { gameArtStyle } from "../game/theme";
import { ArenaCanvas } from "../rendering/ArenaCanvas";
import { seekReplay } from "../replay/replay";
import { buildObservation } from "../sim/observation";
import { runTournamentMatch, type MatchResult } from "../tournament/runner";
import type { TeamId } from "../contracts/types";
import styles from "./GameShell.module.css";

interface RespawnTimer { shipId: string; seconds: number; }

function shortShipName(shipId: string): string {
  return `#${shipId.split("-").at(-1) ?? shipId}`;
}

export function GameMatchPage() {
  const request = gameSession.request; const replayMode = gameSession.playbackMode === "replay"; const [result, setResult] = useState<MatchResult | null>(gameSession.result); const [tick, setTick] = useState(0); const [playing, setPlaying] = useState(true); const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4 | 8>(1); const [error, setError] = useState(""); const [sound, setSound] = useState(request?.sound ?? false);
  const announcedRef = useRef(false);
  useEffect(() => { if (!request) return; let active = true; const job = { id: `single:${request.blue.hash}:${request.green.hash}:${request.seed}:${request.policySeed}`, leftId: request.blue.id, rightId: request.green.id, seed: request.seed, policySeed: request.policySeed, shipsPerTeam: request.shipsPerTeam, blueId: request.blue.id, roseId: request.green.id, state: "pending" as const }; void gameSession.resolveMatch(() => runTournamentMatch(job, [request.blue, request.green], request.mode, { shipsPerTeam: request.shipsPerTeam, policySeed: request.policySeed, durationSeconds: request.durationSeconds })).then(next => { if (!active) return; setResult(next); setTick(next.replay.initialState.tick); setPlaying(true); fleetAudio.resetCursor(); }).catch(caught => active && setError(caught instanceof Error ? caught.message : String(caught))); return () => { active = false; }; }, [request]);
  const maxTick = result?.tick ?? 0; const sought = useMemo(() => result ? seekReplay(result.replay, Math.min(tick, maxTick)).state : null, [maxTick, result, tick]);
  const recentEvents = useMemo(() => result ? result.replay.worldEvents.filter(event => event.tick <= tick && event.tick >= tick - 72) : [], [result, tick]);
  useEffect(() => { if (!result || !sound || announcedRef.current) return; announcedRef.current = true; void fleetAudio.playCue("match_start"); void fleetAudio.startAmbience(request?.mode.startsWith("fog") ? "harbor" : "calm"); return () => fleetAudio.stopAmbience(); }, [request?.mode, result, sound]);
  useEffect(() => { if (!playing || !result) return; let frame = 0; let last = performance.now(); let carry = 0; const loop = (now: number) => { const elapsed = Math.min(100, now - last); last = now; carry += elapsed / 1000 * result.replay.initialState.config.timing.physicsHz * playbackSpeed; const whole = Math.floor(carry); carry -= whole; if (whole > 0) setTick(value => { const next = Math.min(maxTick, value + whole); if (next >= maxTick) setPlaying(false); return next; }); frame = requestAnimationFrame(loop); }; frame = requestAnimationFrame(loop); return () => cancelAnimationFrame(frame); }, [maxTick, playbackSpeed, playing, result]);
  useEffect(() => { if (!result || tick < maxTick) return; const timer = setTimeout(() => { location.hash = "/game/results"; }, 900); return () => clearTimeout(timer); }, [maxTick, result, tick]);
  useEffect(() => { if (!sound || !sought || !request || playbackSpeed > 2) return; const events = request.viewpoint === "spectator" ? sought.events : buildObservation(sought, request.viewpoint, 0, sought.tick + sought.config.timing.decisionIntervalTicks).events; fleetAudio.playEvents(events); }, [playbackSpeed, request, sought, sound]);
  const toggleSound = async () => { if (!sound && !fleetAudio.isUnlocked) await fleetAudio.unlock(); const next = !sound; fleetAudio.setMuted(!next); setSound(next); if (next) void fleetAudio.startAmbience(request?.mode.startsWith("fog") ? "harbor" : "calm"); else fleetAudio.stopAmbience(); };
  const togglePlaying = () => { const next = !playing; setPlaying(next); void fleetAudio.playCue(next ? "ui_resume" : "ui_pause"); };
  const cycleSpeed = () => setPlaybackSpeed(value => value === 1 ? 2 : value === 2 ? 4 : value === 4 ? 8 : 1);
  const close = () => { setPlaying(false); fleetAudio.stopAmbience(); location.hash = "/game/results"; };
  if (!request) return <section className={styles.loadingScreen} style={gameArtStyle}><div className={styles.loadingCard}><h1>No battle configured</h1><p>Choose two captains before entering the arena.</p><a className={styles.gameButton} href="#/game/new">Open game setup</a></div></section>;
  if (error) return <section className={styles.loadingScreen} style={gameArtStyle}><div className={styles.loadingCard}><h1>Battle interrupted</h1><p>{error}</p><a className={styles.gameButton} href="#/game/new">Return to setup</a></div></section>;
  if (!result || !sought) return <section className={styles.loadingScreen} style={gameArtStyle}><div className={styles.loadingCard}><p className={styles.kicker}>Preparing the arena</p><h1>Captains at the ready</h1><p>Both agents are running their full deterministic battle before the broadcast begins.</p><div className={styles.loadingBar} /></div></section>;
  const remaining = Math.max(0, (sought.config.match.durationTicks - sought.tick) / sought.config.timing.physicsHz);
  const perspectiveTeam = request.viewpoint === "spectator" ? null : request.viewpoint;
  const orderedTeams: [TeamId, TeamId] = perspectiveTeam === "rose" ? ["rose", "blue"] : ["blue", "rose"];
  const fogRestricted = sought.config.mode.startsWith("fog") && perspectiveTeam !== null;
  const timersFor = (teamId: TeamId): RespawnTimer[] => {
    if (!fogRestricted || perspectiveTeam === teamId) return sought.ships.filter(ship => ship.teamId === teamId && !ship.alive && ship.respawnAtTick !== null).map(ship => ({ shipId: ship.id, seconds: Math.ceil(Math.max(0, ship.respawnAtTick! - sought.tick) / sought.config.timing.physicsHz) })).sort((a, b) => a.seconds - b.seconds || a.shipId.localeCompare(b.shipId));
    const latestKnownSink = new Map<string, number>();
    for (const event of result.replay.worldEvents) if (event.tick <= sought.tick && event.type === "ShipSunk" && event.teamId === teamId && event.shipId && event.detail === `killer:${perspectiveTeam}`) latestKnownSink.set(event.shipId, event.tick);
    return [...latestKnownSink].map(([shipId, sunkAt]) => ({ shipId, seconds: Math.ceil(Math.max(0, sunkAt + sought.config.ship.respawnDelayTicks - sought.tick) / sought.config.timing.physicsHz) })).filter(item => item.seconds > 0).sort((a, b) => a.seconds - b.seconds || a.shipId.localeCompare(b.shipId));
  };
  const teamLabel = (teamId: TeamId) => perspectiveTeam ? (teamId === perspectiveTeam ? "Your fleet" : "Enemy") : teamId === "blue" ? "Blue" : "Green";
  const leftTimers = timersFor(orderedTeams[0]); const rightTimers = timersFor(orderedTeams[1]);
  return <section className={styles.match}>
    <div className={styles.arenaFill}><ArenaCanvas state={sought} events={recentEvents} fill spectator={request.viewpoint === "spectator"} viewpointTeam={request.viewpoint === "spectator" ? undefined : request.viewpoint} /></div>
    <div className={styles.matchShade} />
    <header className={styles.matchHud}>
      <div className={styles.teamHud}><span className={styles.hudScore}>{sought.scores.blue}</span><div><small>BLUE FLEET</small><strong>{request.blue.alias}</strong></div></div>
      <div className={styles.matchClock}><b>{Math.floor(remaining / 60)}:{Math.floor(remaining % 60).toString().padStart(2, "0")}</b><span>{request.mode.replace("fog-", "FOG ").toUpperCase()} · {sought.config.shipsPerTeam} {sought.config.shipsPerTeam === 1 ? "SHIP" : "SHIPS"} · SEED {request.seed}</span></div>
      <div className={styles.teamHud}><div><small>GREEN FLEET</small><strong>{request.green.alias}</strong></div><span className={styles.hudScore}>{sought.scores.rose}</span></div>
    </header>
    <div className={styles.matchStats} aria-label={`Ships sunk: Blue ${sought.kills.blue}, Green ${sought.kills.rose}`}>
      <span><i className={styles.blueStat} />Blue <b>{sought.kills.blue}</b></span><small>ships sunk</small><span>Green <b>{sought.kills.rose}</b><i className={styles.greenStat} /></span>{!playing && <em>Paused</em>}
    </div>
    <div className={styles.respawnHud} aria-label={`Respawn countdowns. ${teamLabel(orderedTeams[0])}: ${leftTimers.map(item => `${shortShipName(item.shipId)} ${item.seconds} seconds`).join(", ") || "all ships afloat"}. ${teamLabel(orderedTeams[1])}: ${rightTimers.map(item => `${shortShipName(item.shipId)} ${item.seconds} seconds`).join(", ") || (fogRestricted && orderedTeams[1] !== perspectiveTeam ? "no known countdown" : "all ships afloat")}.`}>
      <small>RETURN TO SEA</small>
      <div className={`${styles.respawnSide} ${orderedTeams[0] === "blue" ? styles.respawnBlue : styles.respawnGreen}`}><span>{teamLabel(orderedTeams[0])}</span>{leftTimers.length ? leftTimers.map(item => <b key={item.shipId}>{shortShipName(item.shipId)} · {item.seconds}s</b>) : <em>All afloat</em>}</div>
      <i aria-hidden="true" />
      <div className={`${styles.respawnSide} ${orderedTeams[1] === "blue" ? styles.respawnBlue : styles.respawnGreen}`}><span>{teamLabel(orderedTeams[1])}</span>{rightTimers.length ? rightTimers.map(item => <b key={item.shipId}>{shortShipName(item.shipId)} · {item.seconds}s</b>) : <em>{fogRestricted && orderedTeams[1] !== perspectiveTeam ? "No known countdown" : "All afloat"}</em>}</div>
    </div>
    <div className={styles.matchControls}><button className={styles.roundControl} onClick={togglePlaying} aria-label={playing ? "Pause match" : "Continue match"} title={playing ? "Pause" : "Continue"}>{playing ? "Ⅱ" : "▶"}</button>{replayMode && <button className={styles.roundControl} onClick={cycleSpeed} aria-label={`Replay speed X${playbackSpeed}. Activate for next speed.`} title="Replay speed">X{playbackSpeed}</button>}<button className={styles.roundControl} onClick={() => void toggleSound()} aria-label={sound ? "Mute sound" : "Enable sound"} title={sound ? "Mute" : "Sound on"}>{sound ? "♪" : "×♪"}</button><button className={styles.roundControl} onClick={close} aria-label="Close match and view results" title="End match">×</button></div>
  </section>;
}
