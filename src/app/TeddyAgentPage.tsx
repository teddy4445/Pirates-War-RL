import { useMemo, useState } from "react";
import type { GameMode } from "../contracts/types";
import { gameArtStyle } from "../game/theme";
import { teddyAgentDefinitions } from "../policies/teddy-agents";
import styles from "./GameShell.module.css";
import { BrandCrest } from "./Brand";

const modeNames: Record<GameMode, string> = { duel: "Duel", fleet: "Fleet", "fog-duel": "Fog Duel", "fog-fleet": "Fog Fleet" };

const commands = `# 1. Work against the matching headless rules
python -m fleetrl.rollout --mode fog-fleet --seed 7 --decisions 600

# 2. Optional DRL route
python -m fleetrl.train --algorithm dqn --mode fog-fleet --steps 100000 --seed 7 --output runs/fog-fleet
python -m fleetrl.evaluate --checkpoint runs/fog-fleet/checkpoint.pt --episodes 40
python -m fleetrl.export --checkpoint runs/fog-fleet/checkpoint.pt --format dense-json --output agents/fog-fleet.agent.json

# 3. Test the exact exported or packaged submission in New Game and League
npm run verify`;

export function TeddyAgentPage() {
  const [mode, setMode] = useState<GameMode>("duel");
  const definition = useMemo(() => teddyAgentDefinitions.find(item => item.mode === mode)!, [mode]);
  const [fileIndex, setFileIndex] = useState(0);
  const file = definition.files[fileIndex] ?? definition.files[0]!;
  const chooseMode = (next: GameMode) => { setMode(next); setFileIndex(0); };
  return <section className={styles.screen} style={gameArtStyle}>
    <div className={styles.screenTop}><a className={styles.backLink} href="#/develop" aria-label="Back to develop your agent">←</a><header className={styles.screenTitle}><p className={styles.kicker}>Final-boss logbook</p><h1>Teddy's Agent</h1><p>How the four boss submissions were built through the same public route available to every student.</p></header><a className={styles.screenBrandLink} href="#/menu" aria-label="Pirates War RL main menu"><BrandCrest className={styles.screenBrand} decorative /></a></div>
    <div className={styles.guide}>
      <section className={styles.parchmentPanel}><h2>The challenge</h2><p>There are sixteen official opponents: Level 1, Level 2, Level 3, and one Teddy final boss for each of the four game modes. A student champion should beat all sixteen under the declared mode, rules, seeds, side assignments, and decision budget—not merely win one favorable demonstration.</p><div className={styles.deckBadges}><span>16 opponents</span><span>4 modes</span><span>100 ms decisions</span><span>No hidden state</span></div></section>
      <div className={styles.guideGrid}><section className={styles.parchmentPanel}><h2>1 · Start with the public contract</h2><p>Teddy's bosses receive the same filtered <code>fleetrl-agent-v1</code> observations as uploads. Fog bosses remember only positions they genuinely observed. They use known island polygons, legal-action masks, seeded <code>api.random()</code>, and one action per friendly ship.</p></section><section className={styles.parchmentPanel}><h2>2 · Develop in the matching game</h2><p>The native Python kit reproduces fixed-step physics, delayed actions, observations, scoring, and seeded maps. It supports rule policies, Q-learning, and DQN. Training is optional; a strong state machine and a neural policy enter through the same immutable submission contract.</p></section></div>
      <div className={styles.guideGrid}><section className={styles.parchmentPanel}><h2>3 · Evaluate, do not guess</h2><p>Use held-out seeds, both colors, varied fleet sizes, and the exact target mode. Record points, kills, first pickups, deliveries, draws, fallbacks, and latency separately. Test strategic scuttling as well as ordinary deaths. Freeze learning before evaluation. A short smoke run proves plumbing only and is never presented as evidence of strength.</p></section><section className={styles.parchmentPanel}><h2>4 · Package and freeze</h2><p>Each current Teddy boss is an ordinary JavaScript package: <code>manifest.json</code>, <code>agent.js</code>, and documentation. The browser executes that exact source in QuickJS/WASM. The immutable hash shown in “Under the deck” identifies the opponent version used in a match and replay.</p></section></div>
      <section className={styles.parchmentPanel}><h2>Reproduce the student workflow</h2><pre className={styles.codeBlock}>{commands}</pre><p>The four current final bosses use auditable JavaScript state machines rather than claiming unverified neural training. Students may use the same approach or train DQN locally and upload the compatible Dense export. Either route is judged only by actual matches.</p></section>
      <section className={styles.parchmentPanel}><h2>Inspect the final bosses</h2><div className={styles.modeGrid}>{teddyAgentDefinitions.map(item => <label className={styles.modeTile} key={item.mode}><input type="radio" name="teddy-mode" checked={mode === item.mode} onChange={() => chooseMode(item.mode)} /><strong>{modeNames[item.mode]}</strong><span>{item.alias}</span></label>)}</div><div className={styles.deckWorkspace}><nav className={styles.deckFiles} aria-label={`${definition.alias} files`}>{definition.files.map((candidate, index) => <button type="button" className={index === fileIndex ? styles.deckFileActive : ""} onClick={() => setFileIndex(index)} key={candidate.path}><span>{candidate.path}</span><small>{candidate.language}</small></button>)}</nav><div className={styles.deckCode}><div className={styles.deckCodeTitle}><strong>{file.path}</strong><span>{definition.hash}</span></div><pre><code>{file.content}</code></pre></div></div><div className={styles.buttonRow}><a className={styles.gameButton} href="#/game/new">Challenge the bosses</a><a className={styles.gameButtonGhost} href="#/develop">Back to the agent guide</a></div></section>
    </div>
  </section>;
}
