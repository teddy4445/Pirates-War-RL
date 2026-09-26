import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react(), {
    name: "fleetrl-offline-asset-list",
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(path => !path.endsWith(".map")).sort();
      this.emitFile({ type: "asset", fileName: "offline-assets.json", source: JSON.stringify({ schemaVersion: "fleetrl-offline-assets-v1", assets }, null, 2) });
    },
  }],
  build: {
    target: "es2022",
    sourcemap: true,
    manifest: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
    },
  },
});
