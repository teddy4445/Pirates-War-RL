import type { GameMode } from "../contracts/types";

export interface CaptainSourceFile {
  path: string;
  language: "javascript" | "json" | "typescript" | "markdown" | "binary";
  content: string;
}

export interface TeddyAgentDefinition {
  id: string;
  alias: string;
  hash: string;
  mode: GameMode;
  source: string;
  files: CaptainSourceFile[];
}

const labels: Record<GameMode, { id: string; alias: string }> = {
  duel: { id: "teddy-duel-leviathan", alias: "Teddy's Duel Leviathan" },
  fleet: { id: "teddy-fleet-sovereign", alias: "Teddy's Fleet Sovereign" },
  "fog-duel": { id: "teddy-fog-wraith", alias: "Teddy's Fog Wraith" },
  "fog-fleet": { id: "teddy-fog-dominion", alias: "Teddy's Fog Dominion" },
};

/**
 * This is the exact source executed for each Teddy boss. It intentionally uses
 * only the public fleetrl-agent-v1 observation and helper API available to a
 * student submission.
 */
export function teddyAgentSource(mode: GameMode): string {
  return `"use strict";
var TEDDY_MODE = ${JSON.stringify(mode)};
var memory = { lanes: {}, lastSeen: {}, decisions: 0 };

function reset(context) {
  memory = { lanes: {}, lastSeen: {}, decisions: 0, teamId: context.teamId };
}

function clamp(value) { return Math.max(-1, Math.min(1, value)); }
function distance(a, b) { var dx = a.x - b.x; var dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function wrap(angle) { while (angle >= Math.PI) angle -= Math.PI * 2; while (angle < -Math.PI) angle += Math.PI * 2; return angle; }
function otherTeam(teamId) { return teamId === "blue" ? "rose" : "blue"; }
function neutral(shipId) { return { shipId: shipId, throttle: 0, turn: 0, fire: false, fireTargetShipId: null, interact: { type: "none" } }; }
function baseFor(observation, teamId) { return observation.bases.find(function(base) { return base.teamId === teamId; }); }
function flagFor(observation, teamId) { return observation.flags.find(function(flag) { return flag.ownerTeamId === teamId; }); }
function nearest(origin, ships) {
  return ships.slice().sort(function(left, right) {
    return distance(origin, left.position) - distance(origin, right.position) || left.id.localeCompare(right.id);
  })[0];
}
function reachableFlagPoint(observation, ownerTeamId) {
  var flag = flagFor(observation, ownerTeamId);
  if (!flag || !flag.known || !flag.position) return null;
  if (flag.state === "at-home") return baseFor(observation, ownerTeamId).approach;
  if (flag.state === "on-land") {
    var sites = observation.flagSites.slice().sort(function(left, right) {
      return distance(flag.position, left.position) - distance(flag.position, right.position) || left.id.localeCompare(right.id);
    });
    return sites.length ? sites[0].approach : flag.position;
  }
  return flag.position;
}
function laneFor(observation, ship, index, api) {
  if (memory.lanes[ship.id] === undefined) {
    var fleetBand = observation.ships.length > 1 ? ((index % 3) - 1) * 0.12 : 0;
    memory.lanes[ship.id] = Math.max(0.14, Math.min(0.86, 0.5 + fleetBand + (api.random() - 0.5) * 0.16));
  }
  return memory.lanes[ship.id] * observation.world.height;
}
function pointSegmentDistance(point, start, end) {
  var dx = end.x - start.x; var dy = end.y - start.y;
  var lengthSquared = dx * dx + dy * dy;
  var t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}
function insidePolygon(point, polygon) {
  var inside = false;
  for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    var a = polygon[i]; var b = polygon[j];
    if (((a[1] > point.y) !== (b[1] > point.y)) && point.x < (b[0] - a[0]) * (point.y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function blocked(grid, point, radius) {
  if (point.x < radius || point.y < radius || point.x > grid.width - radius || point.y > grid.height - radius) return true;
  return grid.islands.some(function(island) {
    if (insidePolygon(point, island.polygon)) return true;
    for (var i = 0; i < island.polygon.length; i += 1) {
      var a = island.polygon[i]; var b = island.polygon[(i + 1) % island.polygon.length];
      if (pointSegmentDistance(point, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }) < radius) return true;
    }
    return false;
  });
}
function lineClear(grid, start, end, radius) {
  var length = distance(start, end); var steps = Math.max(1, Math.ceil(length / 24));
  for (var step = 1; step <= steps; step += 1) {
    var t = step / steps;
    if (blocked(grid, { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }, radius)) return false;
  }
  return true;
}
function navigationGrid(observation) {
  var signature = observation.world.width + "x" + observation.world.height + "|" + observation.islands.map(function(island) { return island.id + ":" + island.polygon.length; }).join("|");
  if (memory.grid && memory.grid.signature === signature) return memory.grid;
  var cell = 62; var radius = observation.publicRules.shipRadius + 7;
  var columns = Math.floor((observation.world.width - radius * 2) / cell) + 1;
  var rows = Math.floor((observation.world.height - radius * 2) / cell) + 1;
  var grid = { signature: signature, width: observation.world.width, height: observation.world.height, islands: observation.islands, cell: cell, columns: columns, rows: rows, points: [], walkable: [], neighbors: [] };
  for (var row = 0; row < rows; row += 1) for (var column = 0; column < columns; column += 1) {
    var point = { x: radius + column * cell, y: radius + row * cell };
    grid.points.push(point); grid.walkable.push(!blocked(grid, point, radius)); grid.neighbors.push([]);
  }
  var offsets = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  for (var index = 0; index < grid.points.length; index += 1) {
    if (!grid.walkable[index]) continue;
    var x = index % columns; var y = Math.floor(index / columns);
    offsets.forEach(function(offset) {
      var nx = x + offset[0]; var ny = y + offset[1];
      if (nx < 0 || nx >= columns || ny < 0 || ny >= rows) return;
      var next = ny * columns + nx;
      var diagonal = offset[0] && offset[1];
      if (grid.walkable[next] && (!diagonal || (grid.walkable[y * columns + nx] && grid.walkable[ny * columns + x]))) grid.neighbors[index].push(next);
    });
  }
  memory.grid = grid; memory.routes = {}; return grid;
}
function closestNode(grid, point) {
  var best = -1; var bestDistance = Infinity;
  for (var index = 0; index < grid.points.length; index += 1) if (grid.walkable[index]) {
    var value = distance(point, grid.points[index]);
    if (value < bestDistance) { best = index; bestDistance = value; }
  }
  return best;
}
function plannedRoute(grid, start, target) {
  var startIndex = closestNode(grid, start); var targetIndex = closestNode(grid, target);
  if (startIndex < 0 || targetIndex < 0) return [target];
  var costs = new Array(grid.points.length).fill(Infinity); var estimates = new Array(grid.points.length).fill(Infinity); var previous = new Array(grid.points.length).fill(-1); var open = [startIndex];
  costs[startIndex] = 0; estimates[startIndex] = distance(grid.points[startIndex], grid.points[targetIndex]);
  while (open.length) {
    var position = 0;
    for (var cursor = 1; cursor < open.length; cursor += 1) if (estimates[open[cursor]] < estimates[open[position]]) position = cursor;
    var current = open.splice(position, 1)[0];
    if (current === targetIndex) break;
    grid.neighbors[current].forEach(function(next) {
      var tentative = costs[current] + distance(grid.points[current], grid.points[next]);
      if (tentative >= costs[next]) return;
      previous[next] = current; costs[next] = tentative; estimates[next] = tentative + distance(grid.points[next], grid.points[targetIndex]);
      if (open.indexOf(next) < 0) open.push(next);
    });
  }
  if (startIndex !== targetIndex && previous[targetIndex] < 0) return [target];
  var reversed = [];
  for (var node = targetIndex; node >= 0 && node !== startIndex; node = previous[node]) reversed.push(grid.points[node]);
  reversed.reverse(); reversed.push(target); return reversed;
}
function navigationTerrain(observation) {
  var signature = observation.world.width + "x" + observation.world.height + "|" + observation.islands.map(function(island) { return island.id + ":" + island.polygon.length; }).join("|");
  if (memory.terrain && memory.terrain.signature === signature) return memory.terrain;
  var terrain = { signature: signature, width: observation.world.width, height: observation.world.height, islands: observation.islands, nodes: [] };
  var clearance = observation.publicRules.shipRadius + 15;
  observation.islands.forEach(function(island) {
    var center = island.polygon.reduce(function(sum, point) { return { x: sum.x + point[0], y: sum.y + point[1] }; }, { x: 0, y: 0 });
    center.x /= island.polygon.length; center.y /= island.polygon.length;
    island.polygon.forEach(function(vertex) {
      var dx = vertex[0] - center.x; var dy = vertex[1] - center.y; var length = Math.sqrt(dx * dx + dy * dy) || 1;
      var node = { x: vertex[0] + dx / length * clearance, y: vertex[1] + dy / length * clearance };
      if (!blocked(terrain, node, observation.publicRules.shipRadius + 4)) terrain.nodes.push(node);
    });
  });
  memory.terrain = terrain; return terrain;
}
function segmentIntersects(a, b, c, d) {
  function cross(p, q, r) { return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); }
  var c1 = cross(a, b, c); var c2 = cross(a, b, d); var c3 = cross(c, d, a); var c4 = cross(c, d, b);
  return ((c1 > 0 && c2 < 0) || (c1 < 0 && c2 > 0)) && ((c3 > 0 && c4 < 0) || (c3 < 0 && c4 > 0));
}
function fastLineClear(terrain, start, end) {
  return !terrain.islands.some(function(island) {
    if (insidePolygon(end, island.polygon)) return true;
    for (var index = 0; index < island.polygon.length; index += 1) {
      var a = island.polygon[index]; var b = island.polygon[(index + 1) % island.polygon.length];
      if (segmentIntersects(start, end, { x: a[0], y: a[1] }, { x: b[0], y: b[1] })) return true;
    }
    return false;
  });
}
function navigationWaypoint(observation, ship, target, laneY) {
  var terrain = navigationTerrain(observation);
  if (fastLineClear(terrain, ship.position, target)) return target;
  var best = null; var bestScore = Infinity;
  terrain.nodes.forEach(function(node) {
    if (!fastLineClear(terrain, ship.position, node)) return;
    var reachesTarget = fastLineClear(terrain, node, target);
    var score = distance(ship.position, node) + distance(node, target) + (reachesTarget ? -220 : 0) + Math.abs(node.y - laneY) * 0.04;
    if (score < bestScore) { best = node; bestScore = score; }
  });
  return best || { x: ship.position.x, y: laneY };
}
function routedTarget(observation, ship, target, index, api) {
  var laneY = laneFor(observation, ship, index, api);
  return navigationWaypoint(observation, ship, target, laneY);
}
function rememberedEnemy(observation, ship) {
  observation.enemies.forEach(function(enemy) { if (enemy.alive) memory.lastSeen[enemy.id] = { x: enemy.position.x, y: enemy.position.y, tick: observation.observedAtTick }; });
  var recent = Object.keys(memory.lastSeen).map(function(id) { return memory.lastSeen[id]; }).filter(function(item) { return observation.observedAtTick - item.tick < 600; });
  return recent.sort(function(left, right) { return distance(ship.position, left) - distance(ship.position, right); })[0] || null;
}
function objective(observation, ship, index, api) {
  var home = baseFor(observation, observation.teamId);
  var enemyTeam = otherTeam(observation.teamId);
  var enemyBase = baseFor(observation, enemyTeam);
  var ownFlag = flagFor(observation, observation.teamId);
  var ownFlagAway = ownFlag && ownFlag.known && ownFlag.state !== "at-home";
  if (ship.carriedFlagId) return home.deliveryZone.center;
  var visibleOwnFlagCarrier = observation.enemies.find(function(enemy) { return enemy.alive && enemy.carriedFlagId === (ownFlag && ownFlag.id); });
  if (observation.ships.length === 1 && observation.kills[observation.teamId] === 0) {
    if (visibleOwnFlagCarrier) return visibleOwnFlagCarrier.position;
    var openingIntruder = nearest(home.approach, observation.enemies.filter(function(enemy) { return enemy.alive && distance(enemy.position, home.approach) < 560; }));
    if (openingIntruder) return openingIntruder.position;
    var rememberedIntruder = rememberedEnemy(observation, ship);
    if (rememberedIntruder) return rememberedIntruder;
    var guardDirection = observation.teamId === "blue" ? 1 : -1;
    return { x: home.approach.x + guardDirection * 190, y: home.approach.y + Math.sin(observation.decisionId / 28) * 105 };
  }
  if (ownFlagAway && (observation.ships.length === 1 || index === observation.ships.length - 1)) return visibleOwnFlagCarrier ? visibleOwnFlagCarrier.position : rememberedEnemy(observation, ship) || reachableFlagPoint(observation, observation.teamId) || home.approach;
  if (observation.ships.length > 1 && index === observation.ships.length - 1) {
    var homeIntruder = visibleOwnFlagCarrier || nearest(home.approach, observation.enemies.filter(function(enemy) { return enemy.alive && distance(enemy.position, home.approach) < 520; }));
    if (homeIntruder) return homeIntruder.position;
    var sentryDirection = observation.teamId === "blue" ? 1 : -1;
    return { x: home.approach.x + sentryDirection * 215, y: home.approach.y + Math.sin((observation.decisionId + index * 19) / 24) * 145 };
  }
  var carrier = observation.ships.find(function(candidate) { return candidate.alive && candidate.carriedFlagId; });
  if (carrier && carrier.id !== ship.id && observation.ships.length > 1) {
    var danger = nearest(carrier.position, observation.enemies.filter(function(enemy) { return enemy.alive; }));
    if (danger && distance(danger.position, carrier.position) < 300) return danger.position;
    return { x: carrier.position.x + (home.deliveryZone.center.x - carrier.position.x) * 0.2, y: carrier.position.y + (home.deliveryZone.center.y - carrier.position.y) * 0.2 };
  }
  var enemyCarrier = observation.enemies.find(function(enemy) { return enemy.alive && enemy.carriedFlagId === (ownFlag && ownFlag.id); });
  if (enemyCarrier) return enemyCarrier.position;
  var enemyFlag = reachableFlagPoint(observation, enemyTeam);
  if (enemyFlag) return enemyFlag;
  if (TEDDY_MODE.indexOf("fog") === 0) {
    var memoryTarget = rememberedEnemy(observation, ship);
    if (memoryTarget && index === observation.ships.length - 1) return memoryTarget;
  }
  return enemyBase.approach;
}
function steer(observation, ship, target, index, api) {
  var legal = observation.legal[ship.id];
  if (!ship.alive || !legal) return neutral(ship.id);
  if (legal.pickupFlagIds.length) {
    var pickup = neutral(ship.id); pickup.throttle = -0.35; pickup.interact = { type: "pickup", flagId: legal.pickupFlagIds[0] }; return pickup;
  }
  var ownFlag = flagFor(observation, observation.teamId);
  if (ship.carriedFlagId && observation.ships.length === 1 && ownFlag && ownFlag.known && ownFlag.state !== "at-home" && legal.canDrop) {
    var drop = neutral(ship.id); drop.throttle = 0.3; drop.interact = { type: "drop" }; return drop;
  }
  if (ship.carriedFlagId && ship.health < 42 && legal.giveTargetShipIds.length) {
    var give = neutral(ship.id); give.interact = { type: "give", targetShipId: legal.giveTargetShipIds[0] }; return give;
  }
  var waypoint = routedTarget(observation, ship, target, index, api);
  var bearing = wrap(Math.atan2(waypoint.y - ship.position.y, waypoint.x - ship.position.x) - ship.heading);
  var features = api.encodeShipV1(ship.id);
  var front = features[48] || 0;
  var clockwise = Math.max(features[49] || 0, features[50] || 0);
  var counterClockwise = Math.max(features[55] || 0, features[54] || 0);
  var turn = clamp(bearing / 0.52);
  if (front < 0.3) turn = clockwise >= counterClockwise ? 1 : -1;
  else if (Math.abs(bearing) < 0.3 && Math.min(clockwise, counterClockwise) < 0.2) turn = clamp(turn + (clockwise >= counterClockwise ? 0.45 : -0.45));
  var speed = Math.sqrt(ship.velocity.x * ship.velocity.x + ship.velocity.y * ship.velocity.y);
  var remaining = distance(ship.position, waypoint);
  var throttle = front < 0.1 ? -0.75 : Math.abs(turn) > 0.86 ? 0.46 : front < 0.32 ? 0.68 : 1;
  if (remaining < 85 && speed > observation.publicRules.maxSpeed * 0.42) throttle = -0.78;
  else if (remaining < 42) throttle = 0.22;
  var legalEnemies = observation.enemies.filter(function(enemy) { return enemy.alive && legal.fireTargetShipIds.indexOf(enemy.id) >= 0; });
  var targetEnemy = nearest(ship.position, legalEnemies);
  var urgent = targetEnemy && ownFlag && targetEnemy.carriedFlagId === ownFlag.id;
  var fire = !!(legal.canFire && targetEnemy && (urgent || distance(ship.position, targetEnemy.position) <= observation.publicRules.projectileRange * 0.88));
  var incoming = observation.projectiles.filter(function(projectile) {
    if (projectile.ownerTeamId === observation.teamId) return false;
    var dx = ship.position.x - projectile.position.x; var dy = ship.position.y - projectile.position.y; var range = Math.sqrt(dx * dx + dy * dy);
    return range < 175 && range > 0 && (projectile.direction.x * dx + projectile.direction.y * dy) / range > 0.82;
  }).sort(function(left, right) { return distance(ship.position, left.position) - distance(ship.position, right.position); })[0];
  if (incoming) {
    var toShipX = ship.position.x - incoming.position.x; var toShipY = ship.position.y - incoming.position.y;
    turn = incoming.direction.x * toShipY - incoming.direction.y * toShipX >= 0 ? 1 : -1;
    throttle = 1;
  }
  return { shipId: ship.id, throttle: clamp(throttle), turn: turn, fire: fire, fireTargetShipId: fire ? targetEnemy.id : null, interact: { type: "none" } };
}
function act(observation, api) {
  memory.decisions += 1;
  return { actions: observation.ships.map(function(ship, index) { return steer(observation, ship, objective(observation, ship, index, api), index, api); }) };
}`;
}

function definition(mode: GameMode): TeddyAgentDefinition {
  const label = labels[mode];
  const source = teddyAgentSource(mode);
  const manifest = {
    packageVersion: "fleetrl-package-v1",
    name: label.alias,
    apiVersion: "fleetrl-agent-v1",
    controlScope: "team",
    entry: "agent.js",
    models: [],
    supportedModes: [mode],
  };
  return {
    id: `captain-${label.id}`,
    alias: label.alias,
    hash: `builtin-${label.id}-v1`,
    mode,
    source,
    files: [
      { path: "manifest.json", language: "json", content: JSON.stringify(manifest, null, 2) },
      { path: "agent.js", language: "javascript", content: source },
      { path: "README.md", language: "markdown", content: `# ${label.alias}\n\nFinal-boss reference submission for ${mode}. It uses only fleetrl-agent-v1 observations, seeded api.random(), legal-action masks, and the same QuickJS/WASM sandbox used for student JavaScript.` },
    ],
  };
}

export const teddyAgentDefinitions: TeddyAgentDefinition[] = (["duel", "fleet", "fog-duel", "fog-fleet"] as GameMode[]).map(definition);
