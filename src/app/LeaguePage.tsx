import { useMemo, useRef, useState } from "react";
import { fleetAudio } from "../audio/mixer";
import type { GameMode } from "../contracts/types";
import { assignedEntry, importGameAgent } from "../game/import-agent";
import { clampMatchDurationSeconds, DEFAULT_MATCH_DURATION_SECONDS, freshPolicySeed, gameSession, resolveFleetSize, type FleetSizeChoice, type KnockoutRoundSnapshot, type LeagueFormat, type LeagueSnapshot } from "../game/session";
import { gameArtStyle } from "../game/theme";
import { builtinEntries, knockoutWinner, makeKnockoutRoundJobs, makeRoundRobinJobs, preflightTournamentEntry, runTournamentMatch, shuffledKnockoutEntries, standings, type MatchJob, type MatchResult, type TournamentEntry } from "../tournament/runner";
import styles from "./GameShell.module.css";

const download = (name: string, value: unknown) => { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); };
const modeOptions: { id: GameMode; label: string }[] = [{ id: "duel", label: "Duel" }, { id: "fleet", label: "Fleet" }, { id: "fog-duel", label: "Fog Duel" }, { id: "fog-fleet", label: "Fog Fleet" }];
const slotEntry = (source: TournamentEntry, index: number): TournamentEntry => ({ ...source, id: `knockout-slot-${index + 1}`, alias: source.alias });
const makeSlots = (size: number, catalog: TournamentEntry[], previous: TournamentEntry[] = []) => Array.from({ length: size }, (_, index) => previous[index] ?? slotEntry(catalog[index % catalog.length]!, index));

interface BracketProps { entries: TournamentEntry[]; rounds: KnockoutRoundSnapshot[]; results: MatchResult[]; previewIds?: string[]; onWatch?(result: MatchResult): void; }
function BracketTree({ entries, rounds, results, previewIds = [], onWatch }: BracketProps) {
  const shownRounds = rounds.length ? rounds : [{ round: 0, participantIds: previewIds, resultIds: [], winnerIds: [] }];
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const resultById = new Map(results.map(result => [result.id, result]));
  const championId = rounds.length && rounds.at(-1)?.winnerIds.length === 1 ? rounds.at(-1)!.winnerIds[0] : null;
  return <div className={styles.bracketTree} aria-label="Knockout bracket from opening round to champion">
    {shownRounds.map(round => <section className={styles.bracketRound} key={round.round}><h3>{round.participantIds.length <= 2 ? "Final" : round.round === 0 ? "Opening round" : `Round ${round.round + 1}`}</h3>{Array.from({ length: Math.ceil(round.participantIds.length / 2) }, (_, pair) => {
      const ids = round.participantIds.slice(pair * 2, pair * 2 + 2); const result = resultById.get(round.resultIds[pair] ?? ""); const winnerId = round.winnerIds[pair];
      return <article className={styles.bracketMatch} key={`${round.round}-${pair}`}>{ids.map(id => <div className={`${styles.bracketCaptain} ${winnerId === id ? styles.bracketWinner : ""}`} key={id}><span className={styles.captainCoin}>{byId.get(id)?.alias.slice(0, 1).toUpperCase() ?? "?"}</span><strong>{byId.get(id)?.alias ?? "Awaiting winner"}</strong>{winnerId === id && <small>ADVANCES</small>}</div>)}{result && onWatch && <button className={styles.bracketReplay} onClick={() => onWatch(result)}>Watch match</button>}</article>;
    })}</section>)}
    {championId && <section className={`${styles.bracketRound} ${styles.championRound}`}><h3>Champion</h3><div className={`${styles.bracketCaptain} ${styles.bracketWinner}`}><span className={styles.captainCoin}>★</span><strong>{byId.get(championId)?.alias}</strong><small>LEAGUE WINNER</small></div></section>}
  </div>;
}

export function LeaguePage() {
  const saved = gameSession.league;
  const initialCatalog = builtinEntries();
  const [format, setFormat] = useState<LeagueFormat>(saved?.format ?? "round-robin");
  const [mode, setMode] = useState<GameMode>(saved?.mode ?? "duel");
  const [firstSeed, setFirstSeed] = useState(saved?.firstSeed ?? 100);
  const [seedCount, setSeedCount] = useState(saved?.seedCount ?? 1);
  const [durationSeconds, setDurationSeconds] = useState(clampMatchDurationSeconds(saved?.durationSeconds ?? DEFAULT_MATCH_DURATION_SECONDS));
  const [fleetSizeChoice, setFleetSizeChoice] = useState<FleetSizeChoice>(saved?.shipsPerTeam && saved.shipsPerTeam >= 2 && saved.shipsPerTeam <= 6 ? saved.shipsPerTeam as FleetSizeChoice : 3);
  const [resolvedShipsPerTeam, setResolvedShipsPerTeam] = useState(saved?.shipsPerTeam ?? 3);
  const [bracketSize, setBracketSize] = useState<4 | 8 | 16>(saved?.bracketSize ?? 4);
  const [catalog, setCatalog] = useState<TournamentEntry[]>(saved ? saved.entries : initialCatalog);
  const [entries, setEntries] = useState<TournamentEntry[]>(saved?.entries ?? initialCatalog);
  const [knockoutSlots, setKnockoutSlots] = useState<TournamentEntry[]>(makeSlots(saved?.bracketSize ?? 4, saved ? saved.entries : initialCatalog, saved?.format === "knockout" ? saved.entries : []));
  const [results, setResults] = useState<MatchResult[]>(saved?.results ?? []);
  const [jobs, setJobs] = useState<MatchJob[]>(saved?.jobs ?? []);
  const [knockoutRounds, setKnockoutRounds] = useState<KnockoutRoundSnapshot[]>(saved?.knockoutRounds ?? []);
  const [stage, setStage] = useState<"setup" | "running" | "paused" | "results">(saved?.results.length ? "results" : "setup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pauseRef = useRef(false);
  const rows = useMemo(() => standings(entries, results), [entries, results]);

  const snapshot = (nextEntries: TournamentEntry[], nextResults: MatchResult[], nextJobs: MatchJob[], nextRounds: KnockoutRoundSnapshot[], shipsPerTeam = resolvedShipsPerTeam): LeagueSnapshot => ({ mode, firstSeed, seedCount, format, shipsPerTeam, bracketSize, durationSeconds: clampMatchDurationSeconds(durationSeconds), entries: nextEntries, results: nextResults, jobs: nextJobs, knockoutRounds: nextRounds });
  const persist = (nextEntries: TournamentEntry[], nextResults: MatchResult[], nextJobs: MatchJob[], nextRounds: KnockoutRoundSnapshot[], shipsPerTeam = resolvedShipsPerTeam) => gameSession.saveLeague(snapshot(nextEntries, nextResults, nextJobs, nextRounds, shipsPerTeam));

  const importFiles = async (files: FileList) => {
    setBusy(true); setError("");
    try {
      const imported: TournamentEntry[] = [];
      for (const file of [...files]) imported.push(await importGameAgent(file));
      setCatalog(previous => [...previous, ...imported.filter(next => !previous.some(item => item.hash === next.hash))]);
      setEntries(previous => [...previous, ...imported.filter(next => !previous.some(item => item.hash === next.hash))]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  const runRoundRobin = async (scheduled: MatchJob[], existing: MatchResult[], participants: TournamentEntry[], shipsPerTeam: number) => {
    pauseRef.current = false; setStage("running"); let nextResults = [...existing]; let nextJobs = [...scheduled];
    try {
      for (const job of scheduled) {
        if (nextResults.some(result => result.id === job.id)) continue;
        if (pauseRef.current) { setStage("paused"); persist(participants, nextResults, nextJobs, [], shipsPerTeam); return; }
        nextJobs = nextJobs.map(item => item.id === job.id ? { ...item, state: "running" } : item); setJobs(nextJobs);
        const result = await runTournamentMatch(job, participants, mode, { shipsPerTeam, policySeed: job.policySeed ?? job.seed, durationSeconds });
        nextResults = [...nextResults, result]; nextJobs = nextJobs.map(item => item.id === job.id ? { ...item, state: "completed" } : item); setResults(nextResults); setJobs(nextJobs); persist(participants, nextResults, nextJobs, [], shipsPerTeam);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      setStage("results"); void fleetAudio.playCue("tournament_complete");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setStage("paused"); void fleetAudio.playCue("ui_error"); }
  };

  const runKnockout = async (participants: TournamentEntry[], existingResults: MatchResult[], existingJobs: MatchJob[], existingRounds: KnockoutRoundSnapshot[], shipsPerTeam: number) => {
    pauseRef.current = false; setStage("running"); let nextResults = [...existingResults], nextJobs = [...existingJobs], nextRounds = structuredClone(existingRounds);
    try {
      let participantIds = nextRounds.length ? (nextRounds.at(-1)!.winnerIds.length === nextRounds.at(-1)!.participantIds.length / 2 ? [...nextRounds.at(-1)!.winnerIds] : [...nextRounds.at(-1)!.participantIds]) : participants.map(entry => entry.id);
      let roundIndex = nextRounds.length ? (nextRounds.at(-1)!.winnerIds.length === nextRounds.at(-1)!.participantIds.length / 2 ? nextRounds.length : nextRounds.length - 1) : 0;
      while (participantIds.length > 1) {
        let round = nextRounds.find(item => item.round === roundIndex);
        if (!round) { round = { round: roundIndex, participantIds: [...participantIds], resultIds: [], winnerIds: [] }; nextRounds = [...nextRounds, round]; setKnockoutRounds([...nextRounds]); }
        const roundJobs = makeKnockoutRoundJobs("pirates-war-knockout", round.participantIds, roundIndex, firstSeed).map(job => ({ ...job, shipsPerTeam }));
        for (const job of roundJobs) if (!nextJobs.some(item => item.id === job.id)) nextJobs.push(job);
        setJobs([...nextJobs]);
        for (let pair = 0; pair < roundJobs.length; pair += 1) {
          const job = roundJobs[pair]!;
          if (round.resultIds[pair]) continue;
          if (pauseRef.current) { setStage("paused"); persist(participants, nextResults, nextJobs, nextRounds, shipsPerTeam); return; }
          nextJobs = nextJobs.map(item => item.id === job.id ? { ...item, state: "running" } : item); setJobs([...nextJobs]);
          const result = await runTournamentMatch(job, participants, mode, { shipsPerTeam, policySeed: job.policySeed ?? job.seed, durationSeconds });
          nextResults = [...nextResults, result]; round.resultIds[pair] = result.id; round.winnerIds[pair] = knockoutWinner(result); nextJobs = nextJobs.map(item => item.id === job.id ? { ...item, state: "completed" } : item);
          setResults([...nextResults]); setJobs([...nextJobs]); setKnockoutRounds(structuredClone(nextRounds)); persist(participants, nextResults, nextJobs, nextRounds, shipsPerTeam);
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
        participantIds = [...round.winnerIds]; roundIndex += 1;
      }
      setStage("results"); void fleetAudio.playCue("tournament_complete");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setStage("paused"); void fleetAudio.playCue("ui_error"); }
  };

  const start = async () => {
    setBusy(true); setError("");
    try {
      const policySeed = freshPolicySeed(); const shipsPerTeam = mode.includes("fleet") ? resolveFleetSize(fleetSizeChoice, policySeed) : 1; setResolvedShipsPerTeam(shipsPerTeam);
      const participants = format === "round-robin" ? entries : shuffledKnockoutEntries(knockoutSlots.map((entry, index) => ({ ...entry, id: `knockout-slot-${index + 1}` })), firstSeed);
      if (participants.length < 2) throw new Error("Add at least two captains to start a league.");
      const unique = [...new Map(participants.map(entry => [entry.hash, entry])).values()]; for (const entry of unique) await preflightTournamentEntry(entry, mode, shipsPerTeam);
      setEntries(participants); setResults([]); setKnockoutRounds([]);
      if (format === "round-robin") { const scheduled = makeRoundRobinJobs("pirates-war-league", participants, Array.from({ length: seedCount }, (_, index) => firstSeed + index)).map(job => ({ ...job, shipsPerTeam })); setJobs(scheduled); persist(participants, [], scheduled, [], shipsPerTeam); void runRoundRobin(scheduled, [], participants, shipsPerTeam); }
      else { setJobs([]); persist(participants, [], [], [], shipsPerTeam); void runKnockout(participants, [], [], [], shipsPerTeam); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  const reset = () => { pauseRef.current = true; gameSession.clearLeague(); setResults([]); setJobs([]); setKnockoutRounds([]); setEntries(builtinEntries()); setCatalog(builtinEntries()); setKnockoutSlots(makeSlots(bracketSize, builtinEntries())); setStage("setup"); };
  const watch = (result: MatchResult) => {
    const blue = entries.find(entry => entry.id === result.blueId)!; const green = entries.find(entry => entry.id === result.roseId)!;
    persist(entries, results, jobs, knockoutRounds);
    const viewpoint = mode.startsWith("fog") ? "blue" : "spectator";
    gameSession.replay({ mode, seed: result.seed, blue: assignedEntry(blue, "blue-replay"), green: assignedEntry(green, "green-replay"), sound: true, viewpoint, shipsPerTeam: result.replay.initialState.config.shipsPerTeam, fleetSizeChoice: result.replay.initialState.config.shipsPerTeam as FleetSizeChoice, durationSeconds: result.replay.initialState.config.match.durationTicks / result.replay.initialState.config.timing.physicsHz, policySeed: result.seed, returnTo: "#/league" }, { ...result, blueId: `${blue.id}:blue-replay`, roseId: `${green.id}:green-replay`, winnerId: result.winnerId === blue.id ? `${blue.id}:blue-replay` : result.winnerId === green.id ? `${green.id}:green-replay` : null });
    location.hash = "/game/live";
  };
  const changeBracketSize = (value: 4 | 8 | 16) => { setBracketSize(value); setKnockoutSlots(previous => makeSlots(value, catalog, previous)); };
  const completed = results.length; const total = format === "knockout" ? bracketSize - 1 : jobs.length || entries.length * (entries.length - 1) * seedCount;

  return <section className={styles.screen} style={gameArtStyle}>
    <div className={styles.screenTop}><a className={styles.backLink} href="#/menu" aria-label="Back to main menu">←</a><header className={styles.screenTitle}><p className={styles.kicker}>League</p><h1>Rule the seven seas</h1><p>{format === "knockout" ? "Random pairings advance through a live knockout tree." : "Every pairing plays both colors on every seed."}</p></header><span aria-hidden="true" style={{ width: 48 }} /></div>
    {error && <div className={styles.errorBox} role="alert">{error}</div>}
    {stage === "setup" ? <div className={styles.leagueLayout}>
      <aside className={styles.parchmentPanel}><h2>League rules</h2>
        <label className={styles.gameField}>Competition<select aria-label="Competition format" value={format} onChange={event => setFormat(event.target.value as LeagueFormat)}><option value="round-robin">All vs all</option><option value="knockout">Knockout bracket</option></select></label>
        <label className={styles.gameField}>Mode<select value={mode} onChange={event => setMode(event.target.value as GameMode)}>{modeOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {mode.includes("fleet") && <label className={styles.gameField}>Ships per fleet<select value={fleetSizeChoice} onChange={event => setFleetSizeChoice(event.target.value === "random" ? "random" : Number(event.target.value) as FleetSizeChoice)}><option value="random">Random · 2 to 6</option>{[2, 3, 4, 5, 6].map(count => <option value={count} key={count}>{count} ships</option>)}</select></label>}
        <label className={styles.gameField}>Starting seed<input type="number" value={firstSeed} onChange={event => setFirstSeed(Number(event.target.value) || 0)} /></label>
        <label className={styles.gameField}>Battle time · seconds<input aria-label="League battle time in seconds" type="number" min="15" max="300" step="1" value={durationSeconds} onChange={event => setDurationSeconds(Number(event.target.value))} onBlur={() => setDurationSeconds(clampMatchDurationSeconds(durationSeconds))} /></label>
        {format === "round-robin" ? <label className={styles.gameField}>Seed pairs<input type="number" min="1" max="5" value={seedCount} onChange={event => setSeedCount(Math.max(1, Math.min(5, Number(event.target.value) || 1)))} /></label> : <label className={styles.gameField}>Bracket size<select aria-label="Bracket size" value={bracketSize} onChange={event => changeBracketSize(Number(event.target.value) as 4 | 8 | 16)}>{[4, 8, 16].map(size => <option value={size} key={size}>{size} captains</option>)}</select></label>}
        <p className={styles.agentMeta}>{format === "knockout" ? `${bracketSize} captains · ${bracketSize - 1} elimination battles` : `${entries.length} captains · ${entries.length * (entries.length - 1) * seedCount} mirrored battles`} · one match at a time</p>
        <button className={styles.gameButton} disabled={busy || (format === "round-robin" && entries.length < 2)} onClick={() => void start()}>{busy ? "Inspecting captains…" : format === "knockout" ? "Draw bracket" : "Start league"}</button>
      </aside>
      <section className={styles.parchmentPanel}><h2>Captain roster</h2><p>Upload captains for this session. Knockout slots may use the same captain more than once.</p><label className={styles.miniButton}>Upload captains<input hidden multiple type="file" accept=".js,.zip,.json,.agent.json" onChange={event => { if (event.target.files) void importFiles(event.target.files); event.target.value = ""; }} /></label>
        {format === "round-robin" ? <ul className={styles.leagueRoster}>{entries.map(entry => <li key={entry.id}><div><strong>{entry.alias}</strong><div className={styles.agentMeta}>{entry.kind} · {entry.hash.slice(0, 14)}…</div></div><button className={styles.miniButton} disabled={entries.length <= 2} onClick={() => setEntries(previous => previous.filter(item => item.id !== entry.id))}>Remove</button></li>)}</ul> : <><div className={styles.knockoutSlots}>{knockoutSlots.map((entry, index) => <label className={styles.gameField} key={index}>Seed {index + 1}<select aria-label={`Knockout captain ${index + 1}`} value={entry.hash} onChange={event => { const source = catalog.find(item => item.hash === event.target.value)!; setKnockoutSlots(previous => previous.map((item, slot) => slot === index ? slotEntry(source, index) : item)); }}>{catalog.map(candidate => <option value={candidate.hash} key={candidate.id}>{candidate.alias}</option>)}</select></label>)}</div><BracketTree entries={knockoutSlots} rounds={[]} results={[]} previewIds={knockoutSlots.map(entry => entry.id)} /></>}
      </section>
    </div> : <div className={styles.leagueLayout}>
      <aside className={styles.parchmentPanel}><h2>{stage === "results" ? format === "knockout" ? "Champion crowned" : "League complete" : stage === "paused" ? "League paused" : "Battles underway"}</h2><div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${total ? completed / total * 100 : 0}%` }} /></div><p>{completed} / {total} battles resolved · {resolvedShipsPerTeam} {resolvedShipsPerTeam === 1 ? "ship" : "ships"} per fleet</p><div className={styles.buttonRow}>{stage === "running" && <button className={styles.miniButton} onClick={() => { pauseRef.current = true; }}>Pause after battle</button>}{stage === "paused" && <button className={styles.gameButton} onClick={() => void (format === "knockout" ? runKnockout(entries, results, jobs, knockoutRounds, resolvedShipsPerTeam) : runRoundRobin(jobs, results, entries, resolvedShipsPerTeam))}>Continue league</button>}<button className={styles.miniButton} onClick={() => download("pirates-war-league.json", snapshot(entries, results, jobs, knockoutRounds))}>Export results</button><button className={styles.miniButton} onClick={reset}>New league</button></div>{format === "round-robin" && <p className={styles.agentMeta}>Points: win 3 · draw 1 · loss 0. Ties use head-to-head points, capture differential, then captures.</p>}{format === "knockout" && <p className={styles.agentMeta}>A tied battle advances one captain by a recorded deterministic admiralty draw-break.</p>}</aside>
      <section className={styles.parchmentPanel}>{format === "round-robin" ? <><h2>{stage === "results" ? "Final standings" : "Live standings"}</h2><div className={styles.tableWrap}><table className={styles.gameTable}><thead><tr><th>Rank</th><th>Captain</th><th>W-D-L</th><th>Pts</th><th>Diff</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.rank}</td><td>{entries.find(entry => entry.id === row.id)?.alias}</td><td>{row.wins}-{row.draws}-{row.losses}</td><td>{row.points}</td><td>{row.differential}</td></tr>)}</tbody></table></div></> : <><h2>Knockout tree</h2><BracketTree entries={entries} rounds={knockoutRounds} results={results} onWatch={watch} /></>}
        {results.length > 0 && <><h3>Recorded battles</h3><div className={styles.tableWrap}><table className={styles.gameTable}><thead><tr><th>Seed</th><th>Blue</th><th>Green</th><th>Score / sinks</th><th>Watch</th></tr></thead><tbody>{[...results].reverse().map(result => <tr key={result.id}><td>{result.seed}</td><td>{entries.find(entry => entry.id === result.blueId)?.alias}</td><td>{entries.find(entry => entry.id === result.roseId)?.alias}</td><td>{result.blueScore}–{result.roseScore} · {result.blueKills}–{result.roseKills}</td><td><button className={styles.miniButton} onClick={() => watch(result)}>Replay</button></td></tr>)}</tbody></table></div></>}
      </section>
    </div>}
  </section>;
}
