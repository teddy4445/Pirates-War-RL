export async function registerOfflineWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return null;
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
}

function request(type: "CHECK_READY" | "PREPARE_OFFLINE"): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) { resolve(false); return; }
    const channel = new MessageChannel(); const timer = setTimeout(() => reject(new Error("Offline worker did not respond.")), 30_000);
    channel.port1.onmessage = event => { clearTimeout(timer); if (event.data?.error) reject(new Error(String(event.data.error))); else resolve(Boolean(event.data?.ready)); };
    controller.postMessage({ type }, [channel.port2]);
  });
}
export const checkOfflineReady = () => request("CHECK_READY");
export const prepareOffline = async () => { const registration = await registerOfflineWorker(); if (!navigator.serviceWorker.controller && registration) await new Promise<void>(resolve => { const listener = () => { navigator.serviceWorker.removeEventListener("controllerchange", listener); resolve(); }; navigator.serviceWorker.addEventListener("controllerchange", listener); setTimeout(resolve, 1500); }); return request("PREPARE_OFFLINE"); };
