import { useEffect } from "react";
import { fleetAudio } from "../audio/mixer";
import type { TeamId } from "../contracts/types";
import { freshPolicySeed, gameSession, resolveFleetSize } from "../game/session";
import { gameArtStyle } from "../game/theme";
import { BrandCrest } from "./Brand";
import styles from "./GameShell.module.css";

export function PostGamePage() {
  const request = gameSession.request;
  const result = gameSession.result;
  useEffect(() => {
    if (!result) return;
    fleetAudio.stopAmbience();
    void fleetAudio.playCue(result.draw ? "match_draw" : "match_victory");
  }, [result]);

  if (!request || !result) return <section className={styles.resultPage} style={gameArtStyle}><div className={styles.resultCard}><a className={styles.resultBrandLink} href="#/menu" aria-label="Pirates War RL main menu"><BrandCrest className={styles.resultBrand} decorative /></a><h1>No result yet</h1><a className={styles.gameButton} href="#/game/new">Start a battle</a></div></section>;

  const winner = result.draw ? "Draw at sea" : result.winnerId === request.blue.id ? `${request.blue.alias} wins` : result.winnerId === request.green.id ? `${request.green.alias} wins` : "Battle concluded";
  const events = result.replay.worldEvents;
  const cannons = events.filter(event => event.type === "CannonFired").length;
  const deliveries = events.filter(event => event.type === "FlagCaptured").length;
  const count = (teamId: TeamId, type: string, points?: number) => events.filter(event => event.teamId === teamId && event.type === type && (points === undefined || event.points === points)).length;
  const breakdown = {
    blue: { kills: result.blueKills, pickups: count("blue", "FlagPickedUp", 3), deliveries: count("blue", "FlagCaptured") },
    rose: { kills: result.roseKills, pickups: count("rose", "FlagPickedUp", 3), deliveries: count("rose", "FlagCaptured") },
  };
  const outcomeReason = result.forfeits.length ? "Battle decided by agent forfeit" : result.draw ? "Time expired · points tied" : "Time expired · victory by total score";
  const retry = () => {
    const policySeed = freshPolicySeed();
    gameSession.begin({ ...request, policySeed, shipsPerTeam: request.mode.includes("fleet") ? resolveFleetSize(request.fleetSizeChoice, policySeed) : 1 });
    location.hash = "/game/live";
  };
  const replay = () => { gameSession.replay(request, result); location.hash = "/game/live"; };

  return <section className={styles.resultPage} style={gameArtStyle}>
    <div className={styles.resultCard}>
      <a className={styles.resultBrandLink} href="#/menu" aria-label="Pirates War RL main menu"><BrandCrest className={styles.resultBrand} decorative /></a>
      <p className={styles.kicker}>Battle complete</p>
      <h1>{winner}</h1>
      <p>{outcomeReason}</p>
      <div className={styles.finalScore}>
        <div><strong>{result.blueScore}</strong><span>{request.blue.alias} · points</span></div>
        <b>—</b>
        <div><strong>{result.roseScore}</strong><span>{request.green.alias} · points</span></div>
      </div>
      <div className={`${styles.buttonRow} ${styles.resultActions}`}>
        <button className={styles.gameButton} onClick={retry}>Try again</button>
        <button className={styles.gameButtonGhost} onClick={replay}>Watch replay</button>
        {request.returnTo === "#/league" ? <a className={styles.gameButtonGhost} href="#/league">Return to league</a> : <a className={styles.gameButtonGhost} href="#/game/new">Change captains</a>}
        <a className={styles.gameButtonGhost} href="#/menu">Main menu</a>
      </div>
      <div className={styles.scoreBreakdown}>
        <div><small>Blue score log</small><b>{breakdown.blue.kills} × 1</b><span>Kills</span><b>{breakdown.blue.pickups} × 3</b><span>Pickups</span><b>{breakdown.blue.deliveries} × 25</b><span>Deliveries</span></div>
        <div><small>Green score log</small><b>{breakdown.rose.kills} × 1</b><span>Kills</span><b>{breakdown.rose.pickups} × 3</b><span>Pickups</span><b>{breakdown.rose.deliveries} × 25</b><span>Deliveries</span></div>
      </div>
      <div className={styles.statGrid}>
        <div className={styles.stat}><small>Battle time</small><b>{(result.tick / 60).toFixed(1)} s</b></div>
        <div className={styles.stat}><small>Cannon shots</small><b>{cannons}</b></div>
        <div className={styles.stat}><small>Combat kills</small><b>{result.blueKills + result.roseKills}</b></div>
        <div className={styles.stat}><small>Flag deliveries</small><b>{deliveries}</b></div>
      </div>
    </div>
  </section>;
}
