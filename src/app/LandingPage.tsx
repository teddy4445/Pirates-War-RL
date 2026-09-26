import type { CSSProperties } from "react";
import styles from "./GameShell.module.css";
import { gameArtStyle } from "../game/theme";

export function LandingPage() {
  return <div className={`${styles.gamePage} ${styles.heroBackdrop}`} style={gameArtStyle}>
    <nav className={styles.landingNav} aria-label="Landing navigation"><a className={styles.wordmark} href="#/home"><span className={styles.wordmarkMark}>PW</span> Pirates War RL</a><a className={styles.navLink} href="#/develop">Build an agent</a></nav>
    <section className={styles.hero}><div className={styles.heroContent}><p className={styles.kicker}>Autonomous fleets · deterministic seas</p><h1>Pirates War <span>RL</span></h1><p className={styles.heroLead}>Bring two code-driven captains to a living pirate arena. Watch them navigate, duel, steal flags, and outthink each other—entirely in your browser.</p><div className={styles.heroActions}><a className={styles.gameButton} href="#/menu">Enter the arena</a><a className={styles.gameButtonGhost} href="#game-overview">Discover the game</a></div></div><a className={styles.scrollCue} href="#game-overview">↓ Explore the seas</a></section>
    <section id="game-overview" className={styles.sales}><div className={styles.salesInner}><header className={styles.salesTitle}><p className={styles.kicker}>Code is your captain</p><h2>A pirate battle where every move comes from an agent</h2><p>No manual steering and no scripted spectacle. Each fleet sees the world, chooses actions under a real deadline, and lives with the result one decision window later.</p></header><div className={styles.featureGrid}>
      <article className={styles.featureCard}><div className={styles.featureIcon} style={{ "--icon-index": 0 } as CSSProperties} /><h3>Watch every broadside</h3><p>Directional ships, cannon smoke, impacts, wakes, flag captures, sinking, respawns, and a complete event-driven soundscape bring the simulation to life.</p></article>
      <article className={styles.featureCard}><div className={styles.featureIcon} style={{ "--icon-index": 2 } as CSSProperties} /><h3>Fight through the fog</h3><p>Choose Duel, Fleet, Fog Duel, or Fog Fleet. Island occlusion and team visibility make information part of the strategy.</p></article>
      <article className={styles.featureCard}><div className={styles.featureIcon} style={{ "--icon-index": 3 } as CSSProperties} /><h3>Bring your own captain</h3><p>Upload sandboxed JavaScript, declarative Dense JSON, or a restricted TensorFlow.js package for either side—or use the ready-made rivals.</p></article>
    </div><div className={styles.salesCta}><h2>Your fleet is waiting.</h2><p>Play one match or unleash a full mirrored-seed league.</p><a className={styles.gameButton} href="#/menu">Set sail</a></div></div></section>
  </div>;
}
