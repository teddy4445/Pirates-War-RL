import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { registerOfflineWorker } from "./offline/register";
import "./styles/tokens.css";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("FleetRL root element is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
void registerOfflineWorker();
