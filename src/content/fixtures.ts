import defaultConfigJson from "../../python/src/fleetrl/data/default-config.json";
import twinHarborsJson from "../../python/src/fleetrl/data/maps/twin-harbors.map.json";
import type { FleetRLConfig, MapDefinition } from "../contracts/types";
import { validateConfig } from "../contracts/validation";
import { validateMap } from "../sim/map";

const configResult = validateConfig(defaultConfigJson);
if (!configResult.ok) throw new Error(`Bundled default config is invalid: ${configResult.errors.join(", ")}`);
const map = twinHarborsJson as unknown as MapDefinition;
const mapResult = validateMap(map, configResult.value.ship.radius);
if (!mapResult.valid) throw new Error(`Bundled map is invalid: ${mapResult.errors.join(", ")}`);

export const defaultConfig: FleetRLConfig = configResult.value;
export const twinHarbors: MapDefinition = map;
