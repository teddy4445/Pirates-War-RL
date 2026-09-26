import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

test("a clean Python bundle export can captain a game and produce a replay", async ({ page }) => {
  test.setTimeout(120_000);
  const agent = path.join(process.cwd(), "artifacts", "python-bundle-smoke", "downloaded-bundle.agent.json");
  test.skip(!existsSync(agent), `Run npm run python:bundle-smoke first; missing ${agent}`);

  await page.goto("/#/game/new");
  const blueCard = page.locator("article").filter({ hasText: "BLUE FLEET" });
  await blueCard.locator('input[type="file"]').setInputFiles(agent);
  await expect(blueCard.getByRole("heading", { name: "Downloaded Bundle Smoke" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Sound").selectOption("off");
  await page.getByRole("button", { name: "Start battle" }).click();
  await expect(page.getByLabel(/Ships sunk:/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Downloaded Bundle Smoke")).toBeVisible();
  await page.getByRole("button", { name: "Close match and view results" }).click();
  await expect(page.getByText("Battle complete")).toBeVisible();
  await page.getByRole("button", { name: "Watch replay" }).click();
  await expect(page.getByLabel(/Ships sunk:/)).toBeVisible({ timeout: 30_000 });
});
