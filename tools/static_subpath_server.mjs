import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "dist"); const prefix = "/course/fleetrl"; const port = Number(process.argv[3] ?? 4174);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".ogg": "audio/ogg", ".zip": "application/zip" };
createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", `http://${request.headers.host}`).pathname);
  if (!pathname.startsWith(prefix)) { response.writeHead(404).end("Not found"); return; }
  let relative = pathname.slice(prefix.length).replace(/^\/+/, ""); if (!relative) relative = "index.html";
  let file = path.resolve(root, relative); if (!file.startsWith(`${root}${path.sep}`) && file !== root) { response.writeHead(403).end("Forbidden"); return; }
  if (!existsSync(file) || !statSync(file).isFile()) file = path.join(root, "index.html");
  response.setHeader("content-type", types[path.extname(file)] ?? "application/octet-stream"); createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`FleetRL subpath server http://127.0.0.1:${port}${prefix}/`));
