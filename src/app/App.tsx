import { useEffect, useState, type MouseEvent } from "react";
import { fleetAudio } from "../audio/mixer";
import { DeveloperGuidePage } from "./DeveloperGuidePage";
import { GameMatchPage } from "./GameMatchPage";
import { GameMenuPage } from "./GameMenuPage";
import { GameSetupPage } from "./GameSetupPage";
import { LandingPage } from "./LandingPage";
import { LeaguePage } from "./LeaguePage";
import { PostGamePage } from "./PostGamePage";
import { TeddyAgentPage } from "./TeddyAgentPage";

const currentRoute = () => location.hash.replace(/^#\/?/, "") || "home";

export function App() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => { const update = () => setRoute(currentRoute()); addEventListener("hashchange", update); if (!location.hash) location.replace("#/home"); return () => removeEventListener("hashchange", update); }, []);
  let content;
  if (route === "home") content = <LandingPage />;
  else if (route === "menu") content = <GameMenuPage />;
  else if (route === "game/new") content = <GameSetupPage />;
  else if (route === "game/live") content = <GameMatchPage />;
  else if (route === "game/results") content = <PostGamePage />;
  else if (route === "league") content = <LeaguePage />;
  else if (route === "develop") content = <DeveloperGuidePage />;
  else if (route === "develop/teddy") content = <TeddyAgentPage />;
  else content = <LandingPage />;
  const uiClick = (event: MouseEvent<HTMLElement>) => { const control = (event.target as HTMLElement).closest("button, a"); if (!control) return; void (async () => { try { if (!fleetAudio.isUnlocked) await fleetAudio.unlock(); await fleetAudio.playCue(control.getAttribute("aria-label")?.toLowerCase().includes("back") ? "ui_back" : "ui_click"); } catch { /* visual controls remain usable without Web Audio */ } })(); };
  return <><a className="skip-link" href="#main-content">Skip to content</a><main id="main-content" onClickCapture={uiClick}>{content}</main></>;
}
