import { gameArtStyle } from "../game/theme";
import styles from "./GameShell.module.css";

const agentExample = `function reset(context) {
  // Called once for a fresh match.
}

function act(observation, api) {
  return {
    actions: observation.ships.map(ship => {
      const targetId = observation.legal[ship.id]
        .fireTargetShipIds[0] ?? null;
      return {
        shipId: ship.id,
        throttle: 1,      // -1..1
        turn: 0,          // -1..1
        fire: targetId !== null,
        fireTargetShipId: targetId,
        scuttle: false,     // one-shot self-sink; half-time respawn
        interact: { type: "none" }
      };
    })
  };
}`;

const pythonCommands = `python -m venv .venv
python -m pip install -e ".[train,test]"
python -m fleetrl.rollout --mode duel --seed 7
python -m fleetrl.train --algorithm dqn --mode duel --steps 10000 --seed 7 --output runs/demo
python -m fleetrl.evaluate --checkpoint runs/demo/checkpoint.pt --episodes 20
python -m fleetrl.export --checkpoint runs/demo/checkpoint.pt --format dense-json --output agents/demo.agent.json`;

export function DeveloperGuidePage() {
  return <section className={styles.screen} style={gameArtStyle}><div className={styles.screenTop}><a className={styles.backLink} href="#/menu" aria-label="Back to main menu">←</a><header className={styles.screenTitle}><p className={styles.kicker}>Captain's workshop</p><h1>Develop your agent</h1><p>Everything required to enter a JavaScript or model-driven fleet.</p></header><span aria-hidden="true" style={{ width: 48 }} /></div><div className={styles.guide}>
    <section className={styles.parchmentPanel}><h2>Accepted battle captains</h2><div className={styles.guideGrid}><div><h3>JavaScript</h3><p>Upload a plain <code>.js</code> file or a bounded ZIP with <code>manifest.json</code> and <code>agent.js</code>. The code runs only inside QuickJS/WASM in a dedicated worker—never through host <code>eval</code>, dynamic import, or a script tag.</p></div><div><h3>Neural policies</h3><p>Upload declarative <code>dense-json-v1</code> as <code>.agent.json</code>, or a restricted TensorFlow.js Layers ZIP with local shards. Raw Python, pickle, <code>.pt</code>, remote model URLs, Lambda layers, and custom executable layers are rejected.</p></div></div><div className={styles.buttonRow}><a className={styles.gameButtonGhost} href="#/develop/teddy">Read Teddy's Agent build log</a></div></section>
    <div className={styles.guideGrid}><section className={styles.parchmentPanel}><h2>JavaScript contract</h2><pre className={styles.codeBlock}>{agentExample}</pre><p><code>reset(context)</code> runs once. <code>act(observation, api)</code> returns one action for every living friendly ship. Fleet policies receive stable ship IDs and must decide all ship actions together. Use <code>api.random()</code> for controlled variety: its private agent seed is recorded with the replay and reset for every match; do not use wall-clock randomness.</p></section><section className={styles.parchmentPanel}><h2>Observation and output</h2><p>The observation contains public rules, own ships, visible enemies, known flags, visible projectiles/events, bases, sensors, exact known island polygons, static shoreline sites, and per-ship legal interaction masks. The default map is fully known even in fog. If a match disables static-map knowledge, sensing any part of an island reveals and remembers its complete polygon for that team. Fog modes never include hidden authoritative state.</p><p>Each action supplies <code>shipId</code>, throttle, turn, fire, an optional visible <code>fireTargetShipId</code>, optional one-shot <code>scuttle</code>, and exactly one interaction: <code>none</code>, <code>pickup</code>, <code>give</code>, <code>place</code>, or <code>drop</code>. A scuttle drops a carried flag, gives the opponent no kill or point, and returns the hull in half the normal time. Firing is independent of hull direction and automatically leads the selected ship's current velocity. When old code omits the target, the nearest legal visible enemy is selected. Invalid, missing, stale, or late output becomes a neutral fallback.</p><p>Projectiles remain physical and can strike islands or be evaded. Damage decreases linearly with actual travel distance, from 1.6× at point blank toward 0.65× at maximum range. Ships reach 88 WU/s; flag carriers are 5% slower. Scoring is 1 point per kill, 3 for a flag's first enemy pickup, and 25 for delivery; the higher score at time expiry wins. The first interval is neutral. An action observed at one 100 ms boundary activates at the next boundary, simultaneously for both fleets.</p></section></div>
    <section className={styles.parchmentPanel}><h2>Limits that matter in battle</h2><div className={styles.statGrid}><div className={styles.stat}><small>Decision budget</small><b>100 ms</b></div><div className={styles.stat}><small>QuickJS heap</small><b>32 MiB</b></div><div className={styles.stat}><small>QuickJS stack</small><b>512 KiB</b></div><div className={styles.stat}><small>Source limit</small><b>100 KiB</b></div><div className={styles.stat}><small>ZIP compressed</small><b>10 MiB</b></div><div className={styles.stat}><small>ZIP extracted</small><b>32 MiB</b></div><div className={styles.stat}><small>Model parameters</small><b>≤ 1,000,000</b></div><div className={styles.stat}><small>Output message</small><b>64 KiB</b></div></div><p>Dead ships produce no action. A fleet agent may batch at most the fleet size. Repeated failures can forfeit a match. Browser timeouts are best-effort watchdogs, not hard real-time guarantees, and model/tensor memory is validated separately from the QuickJS heap.</p></section>
    <section className={styles.parchmentPanel}><h2>Train locally with Python</h2><p>The optional native kit contains the matching headless game, Gymnasium and PettingZoo adapters, rule opponents, tabular Q-learning, PyTorch DQN, evaluation, and the compatible Dense exporter. It is not a web backend and the game does not require it.</p><pre className={styles.codeBlock}>{pythonCommands}</pre><div className={styles.buttonRow}><a className={styles.gameButton} href={`${import.meta.env.BASE_URL}downloads/FleetRL_Python_Training_Bundle.zip`} download>Download Python kit</a><a className={styles.gameButtonGhost} href="#/game/new">Test an agent in battle</a></div><p>Import the resulting <code>.agent.json</code> directly in New Game or League. The 64-feature encoder is a compact reactive representation; it deliberately omits some action-queue history and should not be described as a fully Markov state.</p></section>
  </div></section>;
}
