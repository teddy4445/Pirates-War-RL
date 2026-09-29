import type { AgentManifest, FleetRLConfig, GameMode, Observation, ShipAction, TeamAction } from "./types";
import { API_VERSION, CONFIG_VERSION, RULES_VERSION } from "./types";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };
const modes = new Set<GameMode>(["duel", "fleet", "fog-duel", "fog-fleet"]);
const finitePositive = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateConfig(value: unknown): ValidationResult<FleetRLConfig> {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["config must be an object"] };
  if (value.schemaVersion !== CONFIG_VERSION) errors.push(`schemaVersion must be ${CONFIG_VERSION}`);
  if (value.rulesVersion !== RULES_VERSION) errors.push(`rulesVersion must be ${RULES_VERSION}`);
  if (!modes.has(value.mode as GameMode)) errors.push("mode is invalid");
  if (typeof value.mapId !== "string" || !value.mapId) errors.push("mapId is required");
  if (!Number.isInteger(value.shipsPerTeam) || Number(value.shipsPerTeam) < 1 || Number(value.shipsPerTeam) > 8) errors.push("shipsPerTeam must be an integer from 1 to 8");
  for (const [name, child] of [["world", value.world], ["timing", value.timing], ["ship", value.ship], ["combat", value.combat], ["flags", value.flags], ["match", value.match], ["vision", value.vision], ["features", value.features], ["actions", value.actions]] as const) {
    if (!isRecord(child)) errors.push(`${name} must be an object`);
  }
  const world = isRecord(value.world) ? value.world : {};
  if (!finitePositive(world.width) || !finitePositive(world.height)) errors.push("world dimensions must be finite and positive");
  const timing = isRecord(value.timing) ? value.timing : {};
  if (timing.physicsHz !== 60 || timing.decisionIntervalTicks !== 6 || timing.actionLatencyWindows !== 1) errors.push(`timing must preserve the ${RULES_VERSION} 60 Hz / 6 tick / one-window contract`);
  const combat = isRecord(value.combat) ? value.combat : {};
  if (!finitePositive(combat.damage)) errors.push("combat damage must be finite and positive");
  if (!finitePositive(combat.minDamageMultiplier) || !finitePositive(combat.maxDamageMultiplier) || Number(combat.maxDamageMultiplier) < Number(combat.minDamageMultiplier)) errors.push("combat damage multipliers must be finite, positive, and ordered");
  if (typeof combat.closeRangeFraction !== "number" || !Number.isFinite(combat.closeRangeFraction) || combat.closeRangeFraction <= 0 || combat.closeRangeFraction >= 1) errors.push("combat closeRangeFraction must be within (0,1)");
  if (!finitePositive(combat.impactDamagePerSpeed)) errors.push("combat impactDamagePerSpeed must be finite and positive");
  if (combat.rammingDamage !== true) errors.push(`combat rammingDamage must be enabled for ${RULES_VERSION}`);
  const ship = isRecord(value.ship) ? value.ship : {};
  if (!finitePositive(ship.maxSpeed) || !finitePositive(ship.flagCarrierSpeedMultiplier) || Number(ship.flagCarrierSpeedMultiplier) > 1) errors.push("ship speeds must be finite, positive, and the carrier multiplier cannot exceed 1");
  if (!finitePositive(ship.respawnDelayTicks) || !finitePositive(ship.scuttleRespawnTicks) || Number(ship.scuttleRespawnTicks) * 2 !== Number(ship.respawnDelayTicks)) errors.push("scuttleRespawnTicks must be exactly half respawnDelayTicks");
  const match = isRecord(value.match) ? value.match : {};
  const points = isRecord(match.points) ? match.points : {};
  if (!finitePositive(match.scoreNormalizationTarget) || points.kill !== 1 || points.pickup !== 3 || points.delivery !== 25) errors.push(`${RULES_VERSION} scoring must be kill 1, pickup 3, delivery 25`);
  const features = isRecord(value.features) ? value.features : {};
  if (features.encoder !== "ship-64-v1" || features.width !== 64) errors.push("features must use ship-64-v1 width 64");
  const actions = isRecord(value.actions) ? value.actions : {};
  if (actions.decoder !== "discrete-22-v1" || actions.discreteCount !== 22) errors.push("actions must use discrete-22-v1 with 22 actions");
  return errors.length ? { ok: false, errors } : { ok: true, value: value as unknown as FleetRLConfig };
}

function validateShipAction(action: unknown, ownShipIds: ReadonlySet<string>): string[] {
  if (!isRecord(action)) return ["ship action must be an object"];
  const errors: string[] = [];
  if (typeof action.shipId !== "string" || !ownShipIds.has(action.shipId)) errors.push("shipId must identify an owned ship");
  for (const key of ["throttle", "turn"] as const) if (typeof action[key] !== "number" || !Number.isFinite(action[key]) || action[key] < -1 || action[key] > 1) errors.push(`${key} must be finite and within [-1,1]`);
  if (typeof action.fire !== "boolean") errors.push("fire must be boolean");
  if (action.scuttle !== undefined && typeof action.scuttle !== "boolean") errors.push("scuttle must be boolean when provided");
  if (action.fireTargetShipId !== undefined && action.fireTargetShipId !== null && (typeof action.fireTargetShipId !== "string" || !action.fireTargetShipId)) errors.push("fireTargetShipId must be a non-empty string or null");
  if (!isRecord(action.interact) || !["none", "pickup", "give", "place", "drop"].includes(String(action.interact.type))) errors.push("interact is invalid");
  return errors;
}

export function validateTeamAction(value: unknown, ownShipIds: ReadonlySet<string>): ValidationResult<TeamAction> {
  if (!isRecord(value) || !Array.isArray(value.actions)) return { ok: false, errors: ["team action must contain an actions array"] };
  if (value.actions.length > ownShipIds.size) return { ok: false, errors: ["actions array exceeds owned ship count"] };
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const candidate of value.actions) {
    errors.push(...validateShipAction(candidate, ownShipIds));
    if (isRecord(candidate) && typeof candidate.shipId === "string") {
      if (seen.has(candidate.shipId)) errors.push(`duplicate shipId ${candidate.shipId}`);
      seen.add(candidate.shipId);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: value as TeamAction };
}

export function neutralAction(shipId: string): ShipAction {
  return { shipId, throttle: 0, turn: 0, fire: false, fireTargetShipId: null, scuttle: false, interact: { type: "none" } };
}

/** Resolves backward-compatible `fire:true` actions against only the agent's filtered observation. */
export function resolveFireTargets(observation: Observation, value: TeamAction): TeamAction {
  const ownById = new Map(observation.ships.map(ship => [ship.id, ship]));
  const enemiesById = new Map(observation.enemies.map(ship => [ship.id, ship]));
  return { actions: value.actions.map(action => {
    const legal = observation.legal[action.shipId];
    if (!action.fire || !legal?.canFire) return { ...action, fire: false, fireTargetShipId: null, interact: { ...action.interact } };
    const legalIds = new Set(legal.fireTargetShipIds);
    const explicit = action.fireTargetShipId;
    if (explicit && !legalIds.has(explicit)) return { ...action, fire: false, fireTargetShipId: null, interact: { ...action.interact } };
    let targetId = explicit ?? null;
    if (!targetId) {
      const own = ownById.get(action.shipId);
      const target = own ? [...legalIds].map(id => enemiesById.get(id)).filter((enemy): enemy is NonNullable<typeof enemy> => Boolean(enemy)).sort((left, right) => Math.hypot(left.position.x - own.position.x, left.position.y - own.position.y) - Math.hypot(right.position.x - own.position.x, right.position.y - own.position.y) || left.id.localeCompare(right.id))[0] : undefined;
      targetId = target?.id ?? null;
    }
    return { ...action, fire: targetId !== null, fireTargetShipId: targetId, interact: { ...action.interact } };
  }) };
}

export function validateAgentManifest(value: unknown): ValidationResult<AgentManifest> {
  if (!isRecord(value)) return { ok: false, errors: ["manifest must be an object"] };
  const errors: string[] = [];
  if (value.packageVersion !== "fleetrl-package-v1") errors.push("unsupported packageVersion");
  if (value.apiVersion !== API_VERSION) errors.push("unsupported apiVersion");
  if (value.controlScope !== "team") errors.push("controlScope must be team");
  if (typeof value.name !== "string" || value.name.trim().length < 1 || value.name.length > 100) errors.push("name must contain 1-100 characters");
  if (typeof value.entry !== "string" || !/^[A-Za-z0-9._/-]+$/.test(value.entry) || value.entry.includes("..") || value.entry.startsWith("/")) errors.push("entry must be a safe relative path");
  if (!Array.isArray(value.models) || value.models.length > 8) errors.push("models must be an array with at most 8 entries");
  else {
    const modelIds = new Set<string>();
    value.models.forEach((candidate, index) => {
      if (!isRecord(candidate)) { errors.push(`models[${index}] must be an object`); return; }
      if (typeof candidate.id !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(candidate.id) || modelIds.has(candidate.id)) errors.push(`models[${index}].id must be unique and safe`); else modelIds.add(candidate.id);
      if (candidate.format !== "tfjs-layers" && candidate.format !== "dense-json-v1") errors.push(`models[${index}].format is unsupported`);
      if (candidate.format === "tfjs-layers" && (typeof candidate.modelPath !== "string" || !/^[A-Za-z0-9._/-]+$/.test(candidate.modelPath) || candidate.modelPath.includes("..") || candidate.modelPath.startsWith("/"))) errors.push(`models[${index}].modelPath must be a safe relative path`);
      if (candidate.inputWidth !== 64) errors.push(`models[${index}].inputWidth must be 64 for ship-64-v1`);
      if (candidate.outputWidth !== 22) errors.push(`models[${index}].outputWidth must be 22 for discrete-22-v1`);
      if (!Number.isInteger(candidate.maxBatch) || Number(candidate.maxBatch) < 1 || Number(candidate.maxBatch) > 8) errors.push(`models[${index}].maxBatch is invalid`);
      if (candidate.featureEncoder !== "ship-64-v1" || candidate.actionDecoder !== "discrete-22-v1") errors.push(`models[${index}] requires ship-64-v1 and discrete-22-v1`);
    });
  }
  if (!Array.isArray(value.supportedModes) || value.supportedModes.some(mode => !modes.has(mode as GameMode))) errors.push("supportedModes is invalid");
  return errors.length ? { ok: false, errors } : { ok: true, value: value as unknown as AgentManifest };
}
