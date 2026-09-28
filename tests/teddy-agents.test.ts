import { describe, expect, it } from "vitest";
import { QuickJSPolicyRuntime } from "../src/agents/quickjs-runtime";
import { validateTeamAction } from "../src/contracts/validation";
import { defaultConfig } from "../src/content/fixtures";
import { teddyAgentDefinitions } from "../src/policies/teddy-agents";
import { buildObservation } from "../src/sim/observation";
import { generateProceduralMap } from "../src/sim/procedural-map";
import { createInitialWorld } from "../src/sim/world";

describe("Teddy final-boss submissions", () => {
  it("loads all four exact student-style sources in QuickJS and returns valid mode actions", async () => {
    for (const [index, definition] of teddyAgentDefinitions.entries()) {
      const config = { ...structuredClone(defaultConfig), mode: definition.mode, shipsPerTeam: definition.mode.includes("fleet") ? 3 : 1 };
      const state = createInitialWorld(config, generateProceduralMap(70 + index).map, 70 + index);
      const observation = buildObservation(state, "blue", 0, 6);
      const runtime = await QuickJSPolicyRuntime.create(definition.source, { seed: 900 + index });
      try {
        await runtime.reset({ teamId: "blue", shipIds: observation.ships.map(ship => ship.id), episodeId: `teddy-${definition.mode}`, agentSeed: 900 + index, config: {} });
        const result = await runtime.act(observation);
        expect(validateTeamAction(result, new Set(observation.ships.map(ship => ship.id)))).toEqual(expect.objectContaining({ ok: true }));
      } finally { runtime.dispose(); }
      expect(definition.files.map(file => file.path)).toEqual(["manifest.json", "agent.js", "README.md"]);
      expect(definition.files[1]?.content).toBe(definition.source);
    }
  }, 20_000);
});
