const CACHE = "pirates-war-rl-shell-v2";
const scoped = path => new URL(path, self.registration.scope).href;
const marker = scoped("./offline-ready-v1.json");
const core = ["./", "./index.html", "./downloads/FleetRL_Python_Training_Bundle.zip", "./assets/ships/ship-atlas.png", "./assets/terrain/water-mirror-tile.jpg", "./assets/terrain/grass-mirror-tile.jpg", "./assets/terrain/sand-mirror-tile.jpg", "./assets/effects/combat-effects.png", "./assets/icons/ui-icons.png", "./assets/manifests/audio.json", "./examples/agent-script.js", "./examples/constant-forward.agent.json", "./examples/default-config.json", "./examples/manifest-script.json", "./examples/manifest-tfjs.json", "./examples/neural-agent.js", "./examples/python-dqn-smoke.agent.json", "./examples/python-dqn-smoke.metrics.json", "./examples/README.md", "./examples/tfjs-constant-forward.agent.zip", "./examples/twin-harbors.map.json"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(async cache => { await cache.delete(marker); await cache.addAll([scoped("./"), scoped("./index.html")]); })); });
self.addEventListener("activate", event => { event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()])); });
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  if (event.request.mode === "navigate") { event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put(event.request, copy)); } return response; }).catch(() => caches.match(event.request).then(cached => cached ?? caches.match(scoped("./index.html"))))); return; }
  event.respondWith(caches.match(event.request).then(cached => cached ?? fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put(event.request, copy)); } return response; })));
});
async function ready() {
  const cache = await caches.open(CACHE); const response = await cache.match(marker); if (!response) return false;
  const saved = await response.json(); if (saved.schemaVersion !== "fleetrl-offline-ready-v1" || !Array.isArray(saved.urls)) return false;
  return (await Promise.all(saved.urls.map(url => cache.match(url)))).every(Boolean);
}
async function prepare() {
  const cache = await caches.open(CACHE); const paths = new Set(core.map(scoped));
  const assetListResponse = await fetch(scoped("./offline-assets.json"), { cache: "no-store" }); if (!assetListResponse.ok) throw new Error("Production offline asset list is unavailable.");
  const assetList = await assetListResponse.json(); if (assetList.schemaVersion !== "fleetrl-offline-assets-v1" || !Array.isArray(assetList.assets)) throw new Error("Production offline asset list is invalid.");
  paths.add(scoped("./offline-assets.json")); for (const path of assetList.assets) paths.add(scoped(`./${path}`));
  const audioResponse = await fetch(scoped("./assets/manifests/audio.json")); if (audioResponse.ok) { const audio = await audioResponse.json(); await cache.addAll((audio.entries ?? []).map(entry => scoped(`./assets/audio/${String(entry.files.ogg).split("/").pop()}`))); }
  await cache.addAll([...paths]);
  const audio = await (await cache.match(scoped("./assets/manifests/audio.json"))).json(); for (const entry of audio.entries ?? []) paths.add(scoped(`./assets/audio/${String(entry.files.ogg).split("/").pop()}`));
  await cache.put(marker, new Response(JSON.stringify({ schemaVersion: "fleetrl-offline-ready-v1", urls: [...paths].sort() }), { headers: { "content-type": "application/json" } }));
  return ready();
}
self.addEventListener("message", event => { const port = event.ports[0]; if (!port) return; if (event.data?.type === "CHECK_READY") event.waitUntil(ready().then(value => port.postMessage({ ready: value })).catch(error => port.postMessage({ error: String(error) }))); if (event.data?.type === "PREPARE_OFFLINE") event.waitUntil(prepare().then(value => port.postMessage({ ready: value })).catch(error => port.postMessage({ error: String(error) }))); });
