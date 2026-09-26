import styles from "./GameShell.module.css";
import { gameArtStyle } from "../game/theme";

export function GameMenuPage() {
  return <section className={`${styles.gamePage} ${styles.gameMenu}`} style={gameArtStyle}><div className={styles.menuPanel}><p className={styles.kicker}>Pirates War RL</p><h1>Main Menu</h1><p>Choose your next voyage.</p><a className={styles.gameButton} href="#/game/new">New game</a><a className={styles.gameButton} href="#/league">League</a><a className={styles.gameButtonGhost} href="#/develop">How to develop my agent</a><a className={styles.gameButtonGhost} href="#/home">Exit to landing page</a></div></section>;
}
