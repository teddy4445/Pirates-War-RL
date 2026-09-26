import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeDiscreteV1, discreteActionMaskV1, encodeShipV1 } from "../src/contracts/adapters";
import type { Observation } from "../src/contracts/types";

type AdapterCase = { name: string; shipId: string; observation: Observation; features: number[]; mask: boolean[]; decoded: unknown[] };
const fixture = JSON.parse(readFileSync(`${process.cwd()}/python/src/fleetrl/data/conformance/adapters-v1.json`, "utf8")) as { absoluteTolerance: number; cases: AdapterCase[] };

describe("cross-language observation/action adapter parity", () => {
  for (const item of fixture.cases) it(item.name, () => {
    const actual = encodeShipV1(item.observation, item.shipId);
    expect(actual).toHaveLength(64);
    actual.forEach((value, index) => expect(Math.abs(value - (item.features[index] ?? Number.NaN))).toBeLessThanOrEqual(fixture.absoluteTolerance));
    expect(discreteActionMaskV1(item.observation, item.shipId)).toEqual(item.mask);
    expect(Array.from({ length: 22 }, (_, actionId) => decodeDiscreteV1(item.observation, item.shipId, actionId))).toEqual(item.decoded);
  });
});
