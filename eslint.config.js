import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "python/.venv/**", "FleetRL_Sound_Pack/**", ".agents/**", "examples/**", "tools/**", "public/assets/audio/**", "public/examples/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["public/sw.js"],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.serviceworker } },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts", "*.config.ts"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.worker, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
