import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const domain = "rl.teddylazebnik.com";
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const file = relative => path.join(dist, ...relative.split("/"));

check(existsSync(file("index.html")), "dist/index.html is missing");
check(existsSync(file("404.html")), "dist/404.html is missing");
check(existsSync(file(".nojekyll")), "dist/.nojekyll is missing");
check(existsSync(file("CNAME")) && readFileSync(file("CNAME"), "utf8").trim() === domain, `dist/CNAME must contain only ${domain}`);
check(existsSync(file("sw.js")), "dist/sw.js is missing");
check(
  existsSync(file("downloads/FleetRL_Python_Training_Bundle.zip")),
  "Python training bundle is missing from the Pages artifact; generate it before the Vite build with: python tools/package_python.py",
);

if (existsSync(file("index.html"))) {
  const html = readFileSync(file("index.html"), "utf8");
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]).filter(value => !/^(?:https?:|data:|#)/.test(value));
  for (const reference of references) {
    check(!reference.startsWith("/"), `Root-absolute reference is not repository-subpath safe: ${reference}`);
    const normalized = reference.replace(/^\.\//, "").split(/[?#]/, 1)[0];
    check(Boolean(normalized) && existsSync(file(normalized)), `Referenced build file is missing: ${reference}`);
  }
  check(html.includes(`href="https://${domain}/"`), "Canonical custom-domain URL is missing from index.html");
}

if (existsSync(file("offline-assets.json"))) {
  const offline = JSON.parse(readFileSync(file("offline-assets.json"), "utf8"));
  check(offline.schemaVersion === "fleetrl-offline-assets-v1", "Offline asset manifest schema is invalid");
  for (const asset of offline.assets ?? []) check(existsSync(file(asset)) && statSync(file(asset)).isFile(), `Offline manifest entry is missing: ${asset}`);
} else failures.push("dist/offline-assets.json is missing");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else console.log(`PASS: GitHub Pages artifact is relative-path safe and configured for https://${domain}/`);
