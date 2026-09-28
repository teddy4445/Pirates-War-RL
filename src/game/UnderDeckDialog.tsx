import { useEffect, useMemo, useState } from "react";
import type { CaptainSourceFile } from "../policies/teddy-agents";
import type { TournamentEntry } from "../tournament/runner";
import styles from "../app/GameShell.module.css";

function filesFor(entry: TournamentEntry): CaptainSourceFile[] {
  if (entry.sourceFiles?.length) return entry.sourceFiles;
  const metadata = {
    name: entry.alias,
    kind: entry.kind,
    hash: entry.hash,
    supportedModes: entry.supportedModes ?? ["duel", "fleet", "fog-duel", "fog-fleet"],
    provenance: entry.student,
  };
  if (entry.kind === "script") return [
    { path: "submission.json", language: "json", content: JSON.stringify(metadata, null, 2) },
    { path: "agent.js", language: "javascript", content: entry.payload ?? "Source was not retained for this session." },
  ];
  if (entry.kind === "dense") return [{ path: "captain.agent.json", language: "json", content: entry.payload ?? JSON.stringify(metadata, null, 2) }];
  return [
    { path: "package-metadata.json", language: "json", content: JSON.stringify(metadata, null, 2) },
    { path: "captain-package.zip", language: "binary", content: "Validated TensorFlow.js ZIP bytes are retained for execution. Binary model shards are not rendered as text." },
  ];
}
interface Props { entry: TournamentEntry; team: "blue" | "green"; onClose(): void; }

export function UnderDeckDialog({ entry, team, onClose }: Props) {
  const files = useMemo(() => filesFor(entry), [entry]);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    setSelected(0);
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [entry.id, onClose]);
  const file = files[selected] ?? files[0]!;
  const difficulty = entry.difficulty === "boss" ? "Final boss" : entry.difficulty ? `Level ${entry.difficulty}` : "Custom submission";
  return <div className={styles.deckOverlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.deckDialog} role="dialog" aria-modal="true" aria-labelledby={`${team}-deck-title`}>
      <header className={styles.deckHeader}><div><p className={styles.kicker}>{team === "blue" ? "Blue" : "Green"} fleet · Under the deck</p><h2 id={`${team}-deck-title`}>{entry.alias}</h2></div><button className={styles.deckClose} type="button" onClick={onClose} aria-label="Close under the deck">×</button></header>
      <div className={styles.deckBadges}><span>{difficulty}</span><span>{entry.targetMode ?? "Uploaded"}</span><span>{entry.architecture ?? entry.kind}</span></div>
      <p>{entry.description ?? `${entry.student} · immutable hash ${entry.hash}`}</p>
      <div className={styles.deckWorkspace}>
        <nav className={styles.deckFiles} aria-label={`${entry.alias} files`}>{files.map((candidate, index) => <button type="button" className={index === selected ? styles.deckFileActive : ""} onClick={() => setSelected(index)} key={candidate.path}><span>{candidate.path}</span><small>{candidate.language}</small></button>)}</nav>
        <div className={styles.deckCode}><div className={styles.deckCodeTitle}><strong>{file.path}</strong><span>{entry.hash}</span></div><pre><code>{file.content}</code></pre></div>
      </div>
    </section>
  </div>;
}
