import type { CSSProperties } from "react";
import { gameArtStyle } from "../game/theme";
import styles from "./GameShell.module.css";

export function LandingPage() {
  return <div className={`${styles.gamePage} ${styles.heroBackdrop}`} style={gameArtStyle}>
    <nav className={styles.landingNav} aria-label="Landing navigation">
      <a className={styles.wordmark} href="#/home"><span className={styles.wordmarkMark}>PW</span> Pirates War RL</a>
      <div className={styles.landingLinks}><a className={styles.navLink} href="#game-overview">The battle</a><a className={styles.navLink} href="#/develop">Build an agent</a></div>
    </nav>
    <section className={styles.hero}>
      <div className={styles.landingWake} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.heroContent}>
        <p className={styles.kicker}>Autonomous fleets · deterministic seas</p>
        <h1>Pirates War <span>RL</span></h1>
        <p className={styles.heroLead}>Code your captain. Read the sea. Steal the enemy flag and bring it home while rival agents hunt you across a living, procedural archipelago.</p>
        <div className={styles.heroActions}><a className={styles.gameButton} href="#/menu">Enter the arena</a><a className={styles.gameButtonGhost} href="#game-overview">Discover the game</a></div>
        <div className={styles.heroBadges}><span>4 battle modes</span><span>16 built-in rivals</span><span>100% browser-played</span></div>
      </div>
      <a className={styles.scrollCue} href="#game-overview">↓ Explore the seas</a>
    </section>

    <section id="game-overview" className={styles.sales}>
      <div className={styles.salesInner}>
        <header className={styles.salesTitle}><p className={styles.kicker}>Code is your captain</p><h2>A strategy game where every choice belongs to an agent</h2><p>No manual steering and no staged outcome. Both fleets receive filtered observations, choose actions at the same boundary, and live with those decisions in the same deterministic simulation.</p></header>
        <div className={styles.featureGrid}>
          <article className={styles.featureCard}><div className={styles.featureIcon} style={{ "--icon-index": 0 } as CSSProperties} /><h3>Watch every broadside</h3><p>Directional ships, cannon smoke, near-hit bursts, wakes, flag captures, collisions, sinking and respawns turn policy decisions into a full naval spectacle.</p></article>
          <article className={styles.featureCard}><div className={styles.featureIcon} style={{ "--icon-index": 2 } as CSSProperties} /><h3>Master uncertain seas</h3><p>Choose Duel, Fleet, Fog Duel, or Fog Fleet. Procedural islands and remembered fog make navigation and information part of the fight.</p></article>
          <article className={styles.featureCard}><div className={styles.featureIcon} style={{ "--icon-index": 3 } as CSSProperties} /><h3>Bring your own captain</h3><p>Upload sandboxed JavaScript, declarative Dense JSON, or a restricted TensorFlow.js package—or face the three rival tiers and Teddy’s final bosses.</p></article>
        </div>
      </div>
    </section>

    <section className={styles.cinematicSea}>
      <div className={styles.cinematicRow}>
        <div className={`${styles.cinematicVisual} ${styles.strategyVisual}`} role="img" aria-label="Blue and green autonomous pirate fleets charting routes through a sunset archipelago"><span>Every route is a decision</span></div>
        <div className={styles.cinematicCopy}><p className={styles.kicker}>Command the whole sea</p><h2>One seed. Two minds. No excuses.</h2><p>Each match builds a fresh archipelago, scatters hazards and sets both captains loose under identical rules. Fleet agents can raid, screen a carrier, intercept intruders, hand off flags—or scuttle a damaged hull for a faster return.</p><ul><li>Simultaneous six-tick decision windows</li><li>2–6 ships in Fleet modes</li><li>Recorded actions and deterministic replays</li></ul></div>
      </div>
      <div className={`${styles.cinematicRow} ${styles.cinematicReverse}`}>
        <div className={`${styles.cinematicVisual} ${styles.fogVisual}`} role="img" aria-label="A blue pirate ship carrying a green flag while pursued through moonlit fog"><span>Knowledge survives the darkness</span></div>
        <div className={styles.cinematicCopy}><p className={styles.kicker}>Fog that remembers</p><h2>See. Remember. Outsmart.</h2><p>Fog battles begin in darkness. Ships reveal the sea around them; explored water stays charted while moving enemies vanish beyond sight. Island polygons enter the observation only when your fleet earns that knowledge.</p><ul><li>No hidden-state leaks</li><li>Shared fleet vision</li><li>Occlusion-aware targeting</li></ul></div>
      </div>
    </section>

    <section className={styles.scoreVoyage}>
      <div className={styles.scoreVoyageInner}><p className={styles.kicker}>Every move can change the score</p><h2>Raid boldly. Return the prize.</h2><p>The highest total wins when time expires.</p><div className={styles.landingScoreCards}><article><b>+1</b><span>Sink a rival ship</span></article><article><b>+3</b><span>Claim the enemy flag</span></article><article><b>+25</b><span>Deliver it to your base</span></article></div><div className={styles.salesCta}><h2>Your fleet is waiting.</h2><p>Play one match, watch a replay, or unleash a full league.</p><a className={styles.gameButton} href="#/menu">Set sail</a></div></div>
    </section>
  </div>;
}
