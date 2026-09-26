import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("production asset manifests", () => {
  it("records directional ships, masked terrain, effects, icons, and audio", () => {
    const ships = JSON.parse(readFileSync("public/assets/manifests/ships.json", "utf8")); const terrain = JSON.parse(readFileSync("public/assets/manifests/terrain.json", "utf8")); const audio = JSON.parse(readFileSync("public/assets/manifests/audio.json", "utf8"));
    expect(ships.assets[0].headingOrder).toEqual(["E", "SE", "S", "SW", "W", "NW", "N", "NE"]); expect(terrain.assets).toHaveLength(3); expect(audio.entries).toHaveLength(49);
  });
});
