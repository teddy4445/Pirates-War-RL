import styles from "./GameShell.module.css";
import { gameArtStyle } from "../game/theme";
import { BrandLogo } from "./Brand";

export function GameMenuPage() {
  return <section className={`${styles.gamePage} ${styles.gameMenu}`} style={gameArtStyle}><div className={styles.menuPanel}><h1 className={styles.visuallyHidden}>Pirates War RL main menu</h1><BrandLogo className={styles.menuLogo} /><a className={styles.gameButton} href="#/game/new">New game</a><a className={styles.gameButton} href="#/league">League</a><a className={styles.gameButtonGhost} href="#/develop">How to develop my agent</a><a className={styles.gameButtonGhost} href="#/home">Exit to landing page</a></div></section>;
}
