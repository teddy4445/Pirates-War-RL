import { useEffect, useRef } from "react";
import type { Point, TeamId } from "../contracts/types";
import { pointInPolygon, sweepCircleAgainstMap } from "../sim/geometry";
import { buildObservation } from "../sim/observation";
import type { WorldEvent, WorldState } from "../sim/types";
import { assetUrls, loadRenderImage } from "./assets";
import styles from "./ArenaCanvas.module.css";

interface Props { state: WorldState; events?: readonly WorldEvent[]; selectedShipId?: string | undefined; viewpointTeam?: TeamId | undefined; spectator?: boolean; fill?: boolean; }
const teamColor: Record<TeamId, string> = { blue: "#2563eb", rose: "#16815f" };
const hash = (text: string): number => { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0; };
const unit = (seed: number, offset: number): number => ((Math.imul(seed ^ offset, 2654435761) >>> 0) % 10000) / 10000;
const centroid = (polygon: readonly [number, number][]): Point => ({ x: polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length, y: polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length });

export function ArenaCanvas({ state, events = state.events, selectedShipId, viewpointTeam, spectator = false, fill = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogMemoryRef = useRef<{ key: string; explored: HTMLCanvasElement; current: HTMLCanvasElement; layer: HTMLCanvasElement; lastTick: number } | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    let disposed = false;
    const requestDraw = () => { if (!disposed) draw(); };
    const shipsImage = loadRenderImage(assetUrls.ships, requestDraw);
    const waterImage = loadRenderImage(assetUrls.water, requestDraw);
    const grassImage = loadRenderImage(assetUrls.grass, requestDraw);
    const sandImage = loadRenderImage(assetUrls.sand, requestDraw);
    const effectsImage = loadRenderImage(assetUrls.effects, requestDraw);
    const oceanRipplesImage = loadRenderImage(assetUrls.oceanRipples, requestDraw);
    const shoreFoamImage = loadRenderImage(assetUrls.shoreFoam, requestDraw);

    const drawPalm = (context: CanvasRenderingContext2D, x: number, y: number, size: number, phase: number, motionTick: number) => {
      const sway = Math.sin(motionTick * .035 + phase) * .13;
      context.save(); context.translate(x, y); context.rotate(sway);
      context.strokeStyle = "#6c4825"; context.lineWidth = Math.max(1.5, size * .14); context.lineCap = "round"; context.beginPath(); context.moveTo(0, size * .45); context.quadraticCurveTo(size * .08, 0, 0, -size * .48); context.stroke();
      context.translate(0, -size * .48); context.strokeStyle = "#276a43"; context.lineWidth = Math.max(1.2, size * .11);
      for (let leaf = 0; leaf < 6; leaf += 1) { const angle = leaf / 6 * Math.PI * 2 + Math.sin(motionTick * .025 + phase) * .05; context.beginPath(); context.moveTo(0, 0); context.quadraticCurveTo(Math.cos(angle) * size * .35, Math.sin(angle) * size * .18, Math.cos(angle) * size * .58, Math.sin(angle) * size * .4); context.stroke(); }
      context.fillStyle = "#6b4b2a"; context.beginPath(); context.arc(0, 0, size * .09, 0, Math.PI * 2); context.fill(); context.restore();
    };

    const draw = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(320, parent.clientWidth);
      const height = fill ? Math.max(240, parent.clientHeight) : Math.max(240, Math.round(width * state.map.world.height / state.map.world.width));
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d"); if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const sx = width / state.map.world.width, sy = height / state.map.world.height, scale = Math.min(sx, sy);
      const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const motionTick = reducedMotion ? 0 : state.tick;
      const observation = viewpointTeam && !spectator ? buildObservation(state, viewpointTeam, 0, state.tick + state.config.timing.decisionIntervalTicks, events) : null;
      const visibleShips = observation ? new Set([...observation.ships, ...observation.enemies].map(ship => ship.id)) : null;
      const visibleProjectiles = observation ? new Set(observation.projectiles.map(item => item.id)) : null;
      const visibleFlags = observation ? new Set(observation.flags.filter(flag => flag.known).map(flag => flag.id)) : null;
      const visibleEvents = observation ? new Set(observation.events.map(item => item.id)) : null;
      const visibleIslands = observation ? new Set(observation.islands.map(item => item.id)) : null;
      const visibleFlagSites = observation ? new Set(observation.flagSites.map(item => item.id)) : null;

      const waterGradient = context.createLinearGradient(0, 0, 0, height); waterGradient.addColorStop(0, "#197ea9"); waterGradient.addColorStop(.5, "#25a7c7"); waterGradient.addColorStop(1, "#137b9f"); context.fillStyle = waterGradient; context.fillRect(0, 0, width, height);
      if (waterImage.complete && waterImage.naturalWidth) { const pattern = context.createPattern(waterImage, "repeat"); if (pattern) { context.save(); context.globalAlpha = .27; context.translate((motionTick * .16) % 96, (motionTick * .05) % 64); context.fillStyle = pattern; context.fillRect(-100, -70, width + 200, height + 140); context.restore(); } }

      context.lineCap = "round";
      for (let band = 0; band < 18; band += 1) {
        const seed = hash(`${state.seed}:current:${band}`); const baseY = unit(seed, 1) * height; const speed = 8 + unit(seed, 2) * 14; const phase = (motionTick * speed * .015 + unit(seed, 3) * width) % (width + 180) - 90;
        context.strokeStyle = `rgba(205,249,255,${.08 + unit(seed, 4) * .14})`; context.lineWidth = 1 + unit(seed, 5) * 2; context.beginPath(); context.moveTo(phase - 55, baseY); context.bezierCurveTo(phase - 20, baseY - 7, phase + 18, baseY + 7, phase + 58, baseY); context.stroke();
      }
      for (let y = 20; y < height; y += 34) { context.strokeStyle = "rgba(255,255,255,.14)"; context.lineWidth = 1; context.beginPath(); for (let x = -30; x < width + 30; x += 24) { const py = y + Math.sin((x + motionTick * .55) / 29 + y * .02) * 2.6; if (x < 0) context.moveTo(x, py); else context.lineTo(x, py); } context.stroke(); }

      for (let ribbon = 0; ribbon < 7; ribbon += 1) {
        const seed = hash(`${state.seed}:ribbon:${ribbon}`); const y = unit(seed, 2) * height; const drift = ((motionTick * (.025 + unit(seed, 3) * .018) + unit(seed, 4) * width) % (width + 320)) - 160;
        context.strokeStyle = `rgba(4,76,111,${.035 + unit(seed, 5) * .04})`; context.lineWidth = 18 + unit(seed, 6) * 28; context.beginPath(); context.moveTo(drift - 240, y); context.bezierCurveTo(drift - 80, y - 55, drift + 80, y + 55, drift + 250, y); context.stroke();
      }
      for (let school = 0; school < 12; school += 1) {
        const seed = hash(`${state.seed}:fish:${school}`); const direction = unit(seed, 1) > .5 ? 1 : -1; const x = ((unit(seed, 2) * width + direction * motionTick * (.035 + unit(seed, 3) * .05)) % (width + 100) + width + 100) % (width + 100) - 50; const y = 40 + unit(seed, 4) * Math.max(1, height - 80);
        context.save(); context.translate(x, y); context.scale(direction, 1); context.strokeStyle = `rgba(4,54,78,${.1 + unit(seed, 5) * .1})`; context.lineWidth = 1.2;
        for (let fish = 0; fish < 3; fish += 1) { const fx = fish * -11, fy = (fish - 1) * 5; context.beginPath(); context.moveTo(fx - 5, fy - 2); context.quadraticCurveTo(fx, fy, fx - 5, fy + 2); context.moveTo(fx - 5, fy); context.lineTo(fx - 9, fy - 3); context.moveTo(fx - 5, fy); context.lineTo(fx - 9, fy + 3); context.stroke(); }
        context.restore();
      }
      for (let sparkle = 0; sparkle < 26; sparkle += 1) { const seed = hash(`${state.seed}:sparkle:${sparkle}`); const pulse = .5 + .5 * Math.sin(motionTick * (.035 + unit(seed, 1) * .025) + unit(seed, 2) * 9); context.fillStyle = `rgba(235,255,247,${.08 + pulse * .22})`; context.beginPath(); context.arc(unit(seed, 3) * width, unit(seed, 4) * height, .7 + pulse * 1.3, 0, Math.PI * 2); context.fill(); }

      // Cosmetic sea life uses only the presentation tick and deterministic
      // visual hashes. None of these shapes exist in world state or collision.
      for (let eddy = 0; eddy < 16; eddy += 1) {
        const seed = hash(`${state.seed}:foam-eddy:${eddy}`); const x = unit(seed, 1) * width, y = unit(seed, 2) * height; const phase = motionTick * (.025 + unit(seed, 3) * .02) + unit(seed, 4) * Math.PI * 2; const radius = 7 + unit(seed, 5) * 12;
        context.strokeStyle = `rgba(220,252,255,${.08 + (.5 + Math.sin(phase) * .5) * .1})`; context.lineWidth = 1.1; context.beginPath(); context.arc(x, y, radius, phase, phase + Math.PI * 1.25); context.stroke(); context.beginPath(); context.arc(x + radius * .35, y - radius * .18, radius * .55, phase + Math.PI, phase + Math.PI * 1.75); context.stroke();
      }
      for (let jelly = 0; jelly < 8; jelly += 1) {
        const seed = hash(`${state.seed}:jelly:${jelly}`); const x = ((unit(seed, 1) * width + motionTick * (.012 + unit(seed, 2) * .018)) % (width + 50)) - 25; const y = 24 + unit(seed, 3) * Math.max(1, height - 48) + Math.sin(motionTick * .025 + jelly) * 5; const size = 5 + unit(seed, 4) * 5;
        context.save(); context.translate(x, y); context.fillStyle = `rgba(${unit(seed, 5) > .5 ? "190,229,255" : "232,201,255"},.16)`; context.strokeStyle = "rgba(225,246,255,.22)"; context.lineWidth = 1; context.beginPath(); context.arc(0, 0, size, Math.PI, Math.PI * 2); context.quadraticCurveTo(0, size * .6, -size, 0); context.fill(); context.stroke(); for (let tentacle = -1; tentacle <= 1; tentacle += 1) { context.beginPath(); context.moveTo(tentacle * size * .45, size * .15); context.quadraticCurveTo(tentacle * size * .7 + Math.sin(motionTick * .045 + jelly + tentacle) * 2, size * .85, tentacle * size * .4, size * 1.35); context.stroke(); } context.restore();
      }
      for (let turtle = 0; turtle < 5; turtle += 1) {
        const seed = hash(`${state.seed}:turtle:${turtle}`); const direction = unit(seed, 1) > .5 ? 1 : -1; const x = ((unit(seed, 2) * width + direction * motionTick * (.018 + unit(seed, 3) * .025)) % (width + 80) + width + 80) % (width + 80) - 40; const y = 36 + unit(seed, 4) * Math.max(1, height - 72); const size = 8 + unit(seed, 5) * 5; const paddle = Math.sin(motionTick * .08 + turtle) * .32;
        context.save(); context.translate(x, y); context.scale(direction, 1); context.rotate((unit(seed, 6) - .5) * .35); context.fillStyle = "rgba(12,83,77,.2)"; context.beginPath(); context.ellipse(0, 0, size, size * .62, 0, 0, Math.PI * 2); context.fill(); context.fillStyle = "rgba(92,164,128,.2)"; context.beginPath(); context.arc(size * 1.03, 0, size * .28, 0, Math.PI * 2); context.fill(); for (const side of [-1, 1]) { context.save(); context.rotate(side * (.72 + paddle)); context.beginPath(); context.ellipse(0, side * size * .48, size * .65, size * .18, side * .25, 0, Math.PI * 2); context.fill(); context.restore(); } context.restore();
      }
      for (let manta = 0; manta < 4; manta += 1) {
        const seed = hash(`${state.seed}:manta:${manta}`); const angle = unit(seed, 1) * Math.PI * 2; const travel = motionTick * (.014 + unit(seed, 2) * .018); const x = ((unit(seed, 3) * width + Math.cos(angle) * travel) % (width + 100) + width + 100) % (width + 100) - 50; const y = ((unit(seed, 4) * height + Math.sin(angle) * travel) % (height + 80) + height + 80) % (height + 80) - 40; const size = 12 + unit(seed, 5) * 8; const wing = Math.sin(motionTick * .045 + manta) * size * .12;
        context.save(); context.translate(x, y); context.rotate(angle); context.fillStyle = "rgba(3,52,72,.13)"; context.beginPath(); context.moveTo(size, 0); context.bezierCurveTo(size * .25, -size * .18, -size * .55, -size - wing, -size, -size * .2); context.quadraticCurveTo(-size * .55, 0, -size, size * .2); context.bezierCurveTo(-size * .55, size + wing, size * .25, size * .18, size, 0); context.fill(); context.strokeStyle = "rgba(3,52,72,.12)"; context.lineWidth = 1.2; context.beginPath(); context.moveTo(-size * .75, 0); context.quadraticCurveTo(-size * 1.35, size * .08, -size * 1.65, -size * .08); context.stroke(); context.restore();
      }
      for (let kelp = 0; kelp < 11; kelp += 1) {
        const seed = hash(`${state.seed}:kelp-fragment:${kelp}`); const x = ((unit(seed, 1) * width + motionTick * (.008 + unit(seed, 2) * .012)) % (width + 40)) - 20; const y = unit(seed, 3) * height; const angle = unit(seed, 4) * Math.PI * 2 + Math.sin(motionTick * .018 + kelp) * .28;
        context.save(); context.translate(x, y); context.rotate(angle); context.strokeStyle = "rgba(31,105,82,.2)"; context.lineWidth = 1.5; context.beginPath(); context.quadraticCurveTo(5, -5, 10, 0); context.quadraticCurveTo(15, 5, 20, 0); context.stroke(); for (const leaf of [5, 11, 17]) { context.fillStyle = "rgba(58,133,91,.16)"; context.beginPath(); context.ellipse(leaf, leaf % 2 ? -2 : 2, 3.5, 1.5, leaf * .2, 0, Math.PI * 2); context.fill(); } context.restore();
      }

      if (oceanRipplesImage.complete && oceanRipplesImage.naturalWidth) { const frame = Math.floor(motionTick / 18) % 5; for (const site of state.map.flagSites) { if (visibleFlagSites && !visibleFlagSites.has(site.id)) continue; const x = site.approach.x * sx, y = site.approach.y * sy; context.globalAlpha = .38; context.drawImage(oceanRipplesImage, frame * 128, 0, 128, 96, x - 34, y - 24, 68, 48); context.globalAlpha = 1; } }

      for (const island of state.map.islands) {
        if (visibleIslands && !visibleIslands.has(island.id)) continue;
        const isWreck = island.id.startsWith("wreck-"); const center = centroid(island.polygon); const islandSeed = hash(`${state.seed}:${island.id}`);
        context.beginPath(); island.polygon.forEach(([x, y], index) => index === 0 ? context.moveTo(x * sx, y * sy) : context.lineTo(x * sx, y * sy)); context.closePath(); context.lineJoin = "round";
        if (isWreck) {
          context.fillStyle = "rgba(39,91,95,.72)"; context.strokeStyle = "rgba(188,232,206,.62)"; context.lineWidth = 7; context.fill(); context.stroke();
          const angle = (unit(islandSeed, 8) - .5) * 1.1; context.save(); context.translate(center.x * sx, center.y * sy); context.rotate(angle); const wreckSize = 36 * scale;
          context.fillStyle = "#4d3426"; context.strokeStyle = "#211d1b"; context.lineWidth = 2; context.beginPath(); context.moveTo(-wreckSize, -wreckSize * .28); context.lineTo(wreckSize * .72, -wreckSize * .2); context.lineTo(wreckSize, 0); context.lineTo(wreckSize * .55, wreckSize * .3); context.lineTo(-wreckSize * .9, wreckSize * .22); context.closePath(); context.fill(); context.stroke();
          context.strokeStyle = "#39291f"; context.lineWidth = 3; context.beginPath(); context.moveTo(-wreckSize * .05, 0); context.lineTo(-wreckSize * .18, -wreckSize * .85); context.stroke(); context.beginPath(); context.moveTo(-wreckSize * .18, -wreckSize * .78); context.lineTo(wreckSize * .42, -wreckSize * .48); context.stroke();
          for (let bubble = 0; bubble < 4; bubble += 1) { const rise = reducedMotion ? 0 : (motionTick * (.22 + bubble * .04) + bubble * 13) % 42; context.strokeStyle = "rgba(219,253,255,.62)"; context.lineWidth = 1; context.beginPath(); context.arc((bubble - 1.5) * 9, -rise, 2 + bubble % 2, 0, Math.PI * 2); context.stroke(); }
          context.restore(); continue;
        }
        context.lineWidth = 16; const sandPattern = sandImage.complete ? context.createPattern(sandImage, "repeat") : null; context.strokeStyle = sandPattern ?? "#f4dfaa"; context.stroke(); const grassPattern = grassImage.complete ? context.createPattern(grassImage, "repeat") : null; context.fillStyle = grassPattern ?? "#78aa77"; context.fill();
        if (shoreFoamImage.complete && shoreFoamImage.naturalWidth) { const foam = context.createPattern(shoreFoamImage, "repeat"); if (foam) { context.globalAlpha = .48; context.strokeStyle = foam; context.lineWidth = 12; context.stroke(); context.globalAlpha = 1; } }
        context.strokeStyle = "rgba(255,255,255,.58)"; context.lineWidth = 2; context.setLineDash([8, 7]); context.lineDashOffset = -(motionTick * .08); context.stroke(); context.setLineDash([]);

        const xs = island.polygon.map(point => point[0]), ys = island.polygon.map(point => point[1]); const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const areaHint = Math.max(1, (maxX - minX) * (maxY - minY)); const decorationCount = Math.max(3, Math.min(9, Math.round(areaHint / 5200)));
        const positions: Point[] = [];
        for (let candidate = 0; candidate < 30 && positions.length < decorationCount; candidate += 1) { const point = { x: minX + (.16 + unit(islandSeed, candidate * 2 + 10) * .68) * (maxX - minX), y: minY + (.18 + unit(islandSeed, candidate * 2 + 11) * .62) * (maxY - minY) }; if (pointInPolygon(point, island.polygon)) positions.push(point); }
        positions.forEach((point, index) => { const x = point.x * sx, y = point.y * sy; const kind = (islandSeed + index) % 6; if (kind <= 1) drawPalm(context, x, y, 12 + unit(islandSeed, index + 70) * 8, index + unit(islandSeed, index + 90) * 6, motionTick); else if (kind === 2) { context.fillStyle = "#316d47"; context.beginPath(); context.arc(x, y, 5 * scale + 2, 0, Math.PI * 2); context.fill(); context.fillStyle = "#68a353"; context.beginPath(); context.arc(x - 3, y - 2, 3 * scale + 1, 0, Math.PI * 2); context.arc(x + 4, y, 3 * scale + 1, 0, Math.PI * 2); context.fill(); } else if (kind === 3) { context.fillStyle = "#6f756d"; context.strokeStyle = "#46534d"; context.lineWidth = 1; context.beginPath(); context.ellipse(x, y, 6 * scale + 2, 4 * scale + 1, unit(islandSeed, index + 50) * Math.PI, 0, Math.PI * 2); context.fill(); context.stroke(); } else if (kind === 4) { for (let flower = 0; flower < 3; flower += 1) { context.fillStyle = flower % 2 ? "#fff0a8" : "#f59bb4"; context.beginPath(); context.arc(x + flower * 3 - 3, y + Math.sin(flower * 2) * 2, 1.5, 0, Math.PI * 2); context.fill(); } } else { context.strokeStyle = "#76502d"; context.lineWidth = 2; context.beginPath(); context.moveTo(x - 6, y + 3); context.lineTo(x + 6, y - 3); context.moveTo(x - 2, y - 4); context.lineTo(x + 3, y + 5); context.stroke(); } });
        if (areaHint > 9800) {
          const x = center.x * sx, y = center.y * sy; const landmark = islandSeed % 6;
          if (landmark === 0) { context.fillStyle = "#8b562d"; context.strokeStyle = "#3d2d22"; context.lineWidth = 1.5; context.fillRect(x - 6, y - 4, 12, 9); context.strokeRect(x - 6, y - 4, 12, 9); context.fillStyle = "#d9b65d"; context.beginPath(); context.moveTo(x - 8, y - 4); context.lineTo(x, y - 11); context.lineTo(x + 8, y - 4); context.closePath(); context.fill(); }
          else if (landmark === 1) { context.strokeStyle = "#667064"; context.lineWidth = 4; context.beginPath(); context.moveTo(x - 9, y + 7); context.lineTo(x - 7, y - 8); context.lineTo(x + 1, y - 4); context.lineTo(x + 8, y - 10); context.lineTo(x + 9, y + 6); context.stroke(); }
          else if (landmark === 2) { const flicker = reducedMotion ? 0 : Math.sin(motionTick * .17 + islandSeed) * 2; context.fillStyle = "rgba(255,174,55,.24)"; context.beginPath(); context.arc(x, y, 10 + flicker, 0, Math.PI * 2); context.fill(); context.fillStyle = "#ffb43f"; context.beginPath(); context.moveTo(x - 3, y + 4); context.quadraticCurveTo(x - 5, y - 5 - flicker, x, y - 8); context.quadraticCurveTo(x + 7, y - 3, x + 3, y + 4); context.fill(); context.strokeStyle = "#694125"; context.lineWidth = 2; context.beginPath(); context.moveTo(x - 7, y + 5); context.lineTo(x + 7, y + 1); context.moveTo(x - 6, y); context.lineTo(x + 6, y + 6); context.stroke(); }
          else if (landmark === 3) { context.fillStyle = "#9c642f"; context.strokeStyle = "#4f3421"; context.lineWidth = 1; context.fillRect(x - 9, y - 6, 9, 9); context.strokeRect(x - 9, y - 6, 9, 9); context.beginPath(); context.arc(x + 6, y + 1, 5, 0, Math.PI * 2); context.fill(); context.stroke(); }
          else if (landmark === 4) { const shimmer = reducedMotion ? .35 : .25 + Math.sin(motionTick * .06 + islandSeed) * .1; context.fillStyle = `rgba(53,177,184,${shimmer})`; context.strokeStyle = "rgba(224,255,239,.6)"; context.lineWidth = 1; context.beginPath(); context.ellipse(x, y, 12, 6, unit(islandSeed, 66) * Math.PI, 0, Math.PI * 2); context.fill(); context.stroke(); }
          if (landmark % 2 === 0 && !reducedMotion) { const orbit = motionTick * .02 + islandSeed; context.strokeStyle = "rgba(255,255,238,.72)"; context.lineWidth = 1.3; for (let gull = 0; gull < 2; gull += 1) { const gx = x + Math.cos(orbit + gull * 2.4) * (18 + gull * 5), gy = y - 18 + Math.sin(orbit + gull * 2.4) * 5; context.beginPath(); context.arc(gx - 2, gy, 3, Math.PI * 1.1, Math.PI * 1.85); context.arc(gx + 3, gy, 3, Math.PI * 1.15, Math.PI * 1.9); context.stroke(); } }
        }
      }

      for (const base of state.map.bases) { context.beginPath(); context.arc(base.deliveryZone.center.x * sx, base.deliveryZone.center.y * sy, base.deliveryZone.radius * scale, 0, Math.PI * 2); context.setLineDash([5, 5]); context.lineDashOffset = -motionTick * .12; context.strokeStyle = teamColor[base.teamId]; context.lineWidth = 3; context.stroke(); context.setLineDash([]); }
      for (const flag of state.flags) {
        if (!flag.position || (visibleFlags && !visibleFlags.has(flag.id))) continue;
        const x = flag.position.x * sx, y = flag.position.y * sy; const wave = reducedMotion ? 0 : Math.sin(motionTick * .13 + hash(flag.id)) * 3;
        context.strokeStyle = "#20324c"; context.lineWidth = 2; context.beginPath(); context.moveTo(x, y + 8); context.lineTo(x, y - 14); context.stroke(); context.fillStyle = flag.ownerTeamId === "blue" ? "#2563eb" : "#e04465"; context.beginPath(); context.moveTo(x, y - 14); context.quadraticCurveTo(x + 8, y - 12 + wave, x + 16, y - 9); context.lineTo(x, y - 3); context.closePath(); context.fill();
      }

      for (const ship of state.ships) {
        if (!ship.alive || (visibleShips && !visibleShips.has(ship.id))) continue;
        const x = ship.position.x * sx, y = ship.position.y * sy + (reducedMotion ? 0 : Math.sin(motionTick * .12 + hash(ship.id)) * 1.4); context.save(); context.translate(x, y);
        const speed = Math.hypot(ship.velocity.x, ship.velocity.y) / state.config.ship.maxSpeed;
        const size = Math.max(38, Math.min(58, width / 18));
        context.fillStyle = "rgba(1,24,37,.24)"; context.beginPath(); context.ellipse(2, size * .2, size * .31, size * .13, ship.heading, 0, Math.PI * 2); context.fill();
        if (speed > .08 && !reducedMotion) { context.save(); context.rotate(ship.heading); for (let wake = 0; wake < 3; wake += 1) { const phase = (motionTick * (.45 + wake * .08) + wake * 17) % 32; context.strokeStyle = `rgba(221,251,255,${.18 + speed * .34 - wake * .035})`; context.lineWidth = 2 + speed * 2 - wake * .3; context.beginPath(); context.moveTo(-12 - phase * .35, -4 - wake * 3); context.quadraticCurveTo(-25 - phase, 0, -36 - phase, -7 - wake * 2); context.moveTo(-12 - phase * .35, 4 + wake * 3); context.quadraticCurveTo(-25 - phase, 0, -36 - phase, 7 + wake * 2); context.stroke(); } context.restore(); }
        if (shipsImage.complete && shipsImage.naturalWidth) { const normalized = ((ship.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); const heading = Math.round(normalized / (Math.PI / 4)) % 8; const carryingEnemy = Boolean(ship.carriedFlagId && state.flags.find(flag => flag.id === ship.carriedFlagId)?.ownerTeamId !== ship.teamId); const row = ship.teamId === "blue" ? (carryingEnemy ? 1 : 0) : (carryingEnemy ? 3 : 2); context.drawImage(shipsImage, heading * 128, row * 128, 128, 128, -size / 2, -size / 2, size, size); }
        else { context.rotate(ship.heading); context.fillStyle = teamColor[ship.teamId]; context.beginPath(); context.moveTo(size / 2, 0); context.lineTo(-size / 2, size / 3); context.lineTo(-size / 2, -size / 3); context.closePath(); context.fill(); }
        const hit = [...events].reverse().find(item => item.type === "ProjectileHitShip" && item.otherShipId === ship.id && (!visibleEvents || visibleEvents.has(item.id)));
        if (hit && state.tick - hit.tick < 14) { const hitFade = 1 - (state.tick - hit.tick) / 14; context.strokeStyle = hit.closeRange ? `rgba(255,255,238,${hitFade})` : `rgba(255,238,174,${hitFade})`; context.lineWidth = hit.closeRange ? 5 : 3; context.beginPath(); context.arc(0, 0, size * (.3 + (1 - hitFade) * .25), 0, Math.PI * 2); context.stroke(); }
        if (ship.health < state.config.ship.maxHealth * .55 && !reducedMotion) for (let puff = 0; puff < 3; puff += 1) { const rise = (motionTick * (.13 + puff * .025) + puff * 9) % 25; context.fillStyle = `rgba(49,55,58,${.32 - rise / 110})`; context.beginPath(); context.arc(-4 + puff * 4, -14 - rise, 3 + rise * .08, 0, Math.PI * 2); context.fill(); }
        if (ship.protectionUntilTick > state.tick) { context.strokeStyle = "rgba(255,219,86,.9)"; context.lineWidth = 2; context.setLineDash([3, 3]); context.lineDashOffset = -motionTick * .2; context.beginPath(); context.arc(0, 0, size * .38, 0, Math.PI * 2); context.stroke(); context.setLineDash([]); }
        if (ship.id === selectedShipId) { context.strokeStyle = "#fff"; context.lineWidth = 3; context.beginPath(); context.arc(0, 0, size * .43, 0, Math.PI * 2); context.stroke(); }
        const healthY = size * .52; context.fillStyle = "rgba(4,18,28,.82)"; context.fillRect(-size * .36 - 1, healthY - 1, size * .72 + 2, 6); context.fillStyle = ship.health > 55 ? "#64e6a1" : ship.health > 25 ? "#ffd05f" : "#ff716d"; context.fillRect(-size * .36, healthY, size * .72 * ship.health / state.config.ship.maxHealth, 4); context.fillStyle = "rgba(255,255,255,.45)"; context.fillRect(-size * .35, healthY + .5, size * .68 * ship.health / state.config.ship.maxHealth, 1);
        const readyRatio = 1 - Math.min(1, ship.cooldownTicks / Math.max(1, state.config.combat.cooldownTicks)); const cannonY = healthY + 7; context.fillStyle = "rgba(4,18,28,.82)"; context.fillRect(-size * .36 - 1, cannonY - 1, size * .72 + 2, 5); context.fillStyle = readyRatio >= 1 ? "#ffe36e" : "#d9a928"; context.fillRect(-size * .36, cannonY, size * .72 * readyRatio, 3); if (readyRatio >= 1) { context.shadowColor = "#ffe36e"; context.shadowBlur = 5; context.fillStyle = "#fff1a8"; context.fillRect(-size * .36, cannonY, size * .72, 2); context.shadowBlur = 0; } context.restore();
      }

      for (const projectile of state.projectiles) { if (visibleProjectiles && !visibleProjectiles.has(projectile.id)) continue; const x = projectile.position.x * sx, y = projectile.position.y * sy; context.strokeStyle = "rgba(255,226,147,.56)"; context.lineWidth = 2; context.beginPath(); context.moveTo(projectile.previousPosition.x * sx, projectile.previousPosition.y * sy); context.lineTo(x, y); context.stroke(); context.fillStyle = "#172536"; context.strokeStyle = "#f8c55c"; context.lineWidth = 1.5; context.beginPath(); context.arc(x, y, Math.max(2.5, projectile.radius * scale), 0, Math.PI * 2); context.fill(); context.stroke(); }

      for (const item of events) {
        if (!item.position || (visibleEvents && !visibleEvents.has(item.id))) continue;
        const age = Math.max(0, state.tick - item.tick), x = item.position.x * sx, y = item.position.y * sy; if (age > 72) continue;
        const progress = age / 72, fade = Math.max(0, 1 - progress);
        if (effectsImage.complete && (item.type === "ProjectileHitShip" || item.type === "ProjectileHitTerrain" || item.type === "ShipSunk") && age < 24) { const frame = item.type === "ProjectileHitShip" ? 1 : item.type === "ProjectileHitTerrain" ? 2 : 3; const effectSize = 38 + age * 1.1; context.globalAlpha = Math.max(0, 1 - age / 24); context.drawImage(effectsImage, frame * 128, 0, 128, 128, x - effectSize / 2, y - effectSize / 2, effectSize, effectSize); context.globalAlpha = 1; }
        if (item.type === "ProjectileHitShip" && item.closeRange && age < 30) { const burst = age / 30, alpha = 1 - burst; const glow = context.createRadialGradient(x, y, 0, x, y, 34 + age * .8); glow.addColorStop(0, `rgba(255,255,239,${alpha * .88})`); glow.addColorStop(.28, `rgba(255,206,74,${alpha * .52})`); glow.addColorStop(1, "rgba(255,116,38,0)"); context.fillStyle = glow; context.beginPath(); context.arc(x, y, 34 + age * .8, 0, Math.PI * 2); context.fill(); context.save(); context.translate(x, y); context.rotate(hash(item.id) * .001 + motionTick * .018); for (let ray = 0; ray < 10; ray += 1) { const angle = ray / 10 * Math.PI * 2, inner = 12 + age * .7, outer = 32 + age * 1.25; context.strokeStyle = `rgba(${ray % 2 ? "255,244,172" : "255,135,61"},${alpha})`; context.lineWidth = ray % 2 ? 2 : 3; context.beginPath(); context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner); context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer); context.stroke(); } context.restore(); context.strokeStyle = `rgba(255,251,214,${alpha})`; context.lineWidth = 4; context.beginPath(); context.arc(x, y, 12 + age * 1.15, 0, Math.PI * 2); context.stroke(); }
        if (item.type === "CannonFired" && age < 18) { context.fillStyle = `rgba(255,207,83,${1 - age / 18})`; context.beginPath(); context.arc(x, y, 4 + age * .45, 0, Math.PI * 2); context.fill(); for (let puff = 0; puff < 3; puff += 1) { context.fillStyle = `rgba(225,235,224,${Math.max(0, .34 - age / 58 - puff * .05)})`; context.beginPath(); context.arc(x + (puff - 1) * 6, y - age * .3 - puff * 3, 3 + age * .12 + puff, 0, Math.PI * 2); context.fill(); } }
        if (item.type === "ProjectileHitTerrain" || item.type === "ProjectileExpired") { context.strokeStyle = `rgba(222,252,255,${fade})`; context.lineWidth = 2; context.beginPath(); context.arc(x, y, 5 + age * .55, 0, Math.PI * 2); context.stroke(); }
        if (item.type === "ShipContact" && ((item.damage ?? 0) > 0 || (item.otherDamage ?? 0) > 0) && age < 22) { const impactFade = 1 - age / 22, force = Math.min(1, ((item.damage ?? 0) + (item.otherDamage ?? 0)) / 48); context.strokeStyle = `rgba(255,209,96,${impactFade})`; context.lineWidth = 2 + force * 3; context.beginPath(); context.arc(x, y, 8 + age * (.55 + force * .3), 0, Math.PI * 2); context.stroke(); context.save(); context.translate(x, y); context.rotate(hash(item.id) * .001); for (let spark = 0; spark < 7; spark += 1) { const angle = spark / 7 * Math.PI * 2, inner = 7 + age * .35, outer = 13 + age * (.65 + force * .35); context.strokeStyle = `rgba(255,${spark % 2 ? 235 : 143},77,${impactFade})`; context.lineWidth = 1 + force * 1.5; context.beginPath(); context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner); context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer); context.stroke(); } context.restore(); }
        if (item.type === "TerrainContact" && age < 18) { context.strokeStyle = `rgba(235,255,245,${1 - age / 18})`; context.lineWidth = 1.5; for (let splash = 0; splash < 3; splash += 1) { context.beginPath(); context.arc(x + (splash - 1) * 5, y, 3 + age * (.2 + splash * .03), Math.PI, Math.PI * 2); context.stroke(); } }
        if (item.type === "ShipSunk") { context.save(); context.translate(x, y + age * .17); context.rotate(age * .012); context.globalAlpha = fade * .68; context.fillStyle = "#4b3428"; context.beginPath(); context.ellipse(0, 0, 22 * (1 - progress * .35), 8 * (1 - progress * .55), 0, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1; for (let debris = 0; debris < 4; debris += 1) { const angle = debris / 4 * Math.PI * 2 + .4; context.strokeStyle = `rgba(92,58,34,${fade})`; context.lineWidth = 2; context.beginPath(); context.moveTo(Math.cos(angle) * (6 + age * .2), Math.sin(angle) * (4 + age * .12)); context.lineTo(Math.cos(angle) * (13 + age * .32), Math.sin(angle) * (8 + age * .22)); context.stroke(); } for (let bubble = 0; bubble < 6; bubble += 1) { context.strokeStyle = `rgba(220,252,255,${fade * .7})`; context.beginPath(); context.arc((bubble - 2.5) * 7, -age * (.22 + bubble * .018), 2 + bubble % 3, 0, Math.PI * 2); context.stroke(); } context.restore(); }
        if (item.type === "ShipRespawned") { context.strokeStyle = `rgba(255,231,120,${fade})`; context.lineWidth = 3; context.beginPath(); context.arc(x, y, 12 + age * .75, 0, Math.PI * 2); context.stroke(); }
        if (item.type === "FlagCaptured" || item.type === "FlagPickedUp" || item.type === "FlagRelocatedToIsland") { context.strokeStyle = `rgba(255,228,103,${fade})`; context.lineWidth = 3; context.beginPath(); context.arc(x, y, 10 + age * .6, 0, Math.PI * 2); context.stroke(); for (let ray = 0; ray < 6; ray += 1) { const angle = ray / 6 * Math.PI * 2 + motionTick * .025; context.beginPath(); context.moveTo(x + Math.cos(angle) * (12 + age * .25), y + Math.sin(angle) * (12 + age * .25)); context.lineTo(x + Math.cos(angle) * (18 + age * .45), y + Math.sin(angle) * (18 + age * .45)); context.stroke(); } }
      }

      if (observation && state.config.mode.startsWith("fog") && viewpointTeam) {
        const maskWidth = 800, maskHeight = 450;
        const key = `${state.map.id}:${state.seed}:${viewpointTeam}`;
        let memory = fogMemoryRef.current;
        if (!memory || memory.key !== key) {
          const createMask = () => { const result = document.createElement("canvas"); result.width = maskWidth; result.height = maskHeight; return result; };
          memory = { key, explored: createMask(), current: createMask(), layer: createMask(), lastTick: -1 };
          fogMemoryRef.current = memory;
        }
        if (state.tick < memory.lastTick) memory.explored.getContext("2d")?.clearRect(0, 0, maskWidth, maskHeight);
        memory.lastTick = state.tick;
        const maskScaleX = maskWidth / state.map.world.width, maskScaleY = maskHeight / state.map.world.height;
        const currentContext = memory.current.getContext("2d")!;
        currentContext.clearRect(0, 0, maskWidth, maskHeight);
        currentContext.fillStyle = "#fff";
        for (const sensor of observation.sensors) {
          currentContext.beginPath();
          for (let ray = 0; ray < 128; ray += 1) {
            const angle = ray / 128 * Math.PI * 2;
            const end = { x: sensor.position.x + Math.cos(angle) * sensor.radius, y: sensor.position.y + Math.sin(angle) * sensor.radius };
            const visibleEnd = sweepCircleAgainstMap(sensor.position, end, 0, state.map).position;
            if (ray === 0) currentContext.moveTo(visibleEnd.x * maskScaleX, visibleEnd.y * maskScaleY); else currentContext.lineTo(visibleEnd.x * maskScaleX, visibleEnd.y * maskScaleY);
          }
          currentContext.closePath(); currentContext.fill();
        }
        memory.explored.getContext("2d")!.drawImage(memory.current, 0, 0);
        const fogContext = memory.layer.getContext("2d")!;
        fogContext.globalCompositeOperation = "source-over"; fogContext.clearRect(0, 0, maskWidth, maskHeight); fogContext.fillStyle = "#01070c"; fogContext.fillRect(0, 0, maskWidth, maskHeight);
        fogContext.globalCompositeOperation = "destination-out"; fogContext.filter = "blur(5px)"; fogContext.drawImage(memory.explored, 0, 0); fogContext.filter = "none";
        fogContext.globalCompositeOperation = "source-over"; fogContext.fillStyle = "rgba(3,18,29,.68)"; fogContext.fillRect(0, 0, maskWidth, maskHeight);
        fogContext.globalCompositeOperation = "destination-out"; fogContext.filter = "blur(5px)"; fogContext.drawImage(memory.current, 0, 0); fogContext.filter = "none"; fogContext.globalCompositeOperation = "source-over";
        context.drawImage(memory.layer, 0, 0, width, height);
      }
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(parent); return () => { disposed = true; observer.disconnect(); };
  }, [events, fill, selectedShipId, spectator, state, viewpointTeam]);
  return <canvas ref={canvasRef} className={styles.canvas} aria-label="Pirates War RL arena. Ship positions, captures, sinks, and match state are also available in the HUD." />;
}
