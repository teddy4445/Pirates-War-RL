import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const screenshots = path.join(root, "artifacts", "screenshots");
const subpathOrigin = `http://127.0.0.1:${process.env.PLAYWRIGHT_SUBPATH_PORT ?? 4274}`;

test.describe.serial("Pirates War RL release flow", () => {
  test("runs the landing, menu, autonomous battle, pause, close, results, and replay flow", async ({ page }) => {
    test.setTimeout(120_000);
    const runtimeErrors: string[] = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") runtimeErrors.push(message.text()); });

    await page.goto("/#/home");
    await expect(page).toHaveTitle("Pirates War RL");
    await expect(page.getByRole("heading", { level: 1, name: /Pirates War/ })).toBeVisible();
    await page.getByRole("link", { name: "Enter the arena" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Main Menu" })).toBeVisible();
    await page.getByRole("link", { name: "New game" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Choose your captains" })).toBeVisible();

    await page.getByLabel("Seed").fill("73");
    await page.getByLabel("Battle time in seconds").fill("45");
    await page.getByText("Fog Duel", { exact: true }).click();
    await page.getByRole("button", { name: "Under the deck" }).first().click();
    await expect(page.getByRole("dialog")).toContainText("Lantern Scout");
    await expect(page.getByRole("button", { name: /captain-profile.json/ })).toBeVisible();
    await page.getByRole("button", { name: "Close under the deck" }).click();
    await page.getByLabel("Choose a built-in captain").nth(1).selectOption("captain-teddy-fog-wraith");
    await page.getByRole("button", { name: "Start battle" }).click();
    await expect(page.getByLabel(/Ships sunk:/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel(/Respawn countdowns/)).toBeVisible();
    await expect(page.getByText(/FOG DUEL · 1 SHIP · SEED 73/)).toBeVisible();

    await page.getByRole("button", { name: "Pause match" }).click();
    await expect(page.getByText("Paused", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue match" }).click();
    await expect(page.getByLabel(/Ships sunk:/)).toBeVisible();
    await page.getByRole("button", { name: "Close match and view results" }).click();
    await expect(page.getByText("Battle complete")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByText("Blue score log")).toBeVisible();
    await expect(page.getByText("Blue decisions")).toHaveCount(0);
    await expect(page.getByText("Blue fallbacks")).toHaveCount(0);

    await page.getByRole("button", { name: "Watch replay" }).click();
    await expect(page.getByLabel(/Ships sunk:/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Replay speed X1/ })).toBeVisible();
    await page.getByRole("button", { name: /Replay speed X1/ }).click();
    await expect(page.getByRole("button", { name: /Replay speed X2/ })).toBeVisible();
    await page.getByRole("button", { name: /Replay speed X2/ }).click();
    await page.getByRole("button", { name: /Replay speed X4/ }).click();
    await page.getByRole("button", { name: /Replay speed X8/ }).click();
    await expect(page.getByRole("button", { name: /Replay speed X1/ })).toBeVisible();
    await page.getByRole("button", { name: "Close match and view results" }).click();
    await expect(page.getByText("Battle complete")).toBeVisible();
    await page.getByRole("link", { name: "Change captains" }).click();
    await expect(page.getByLabel("Seed")).toHaveValue("73");
    await expect(page.getByLabel("Battle time in seconds")).toHaveValue("45");
    await expect(page.getByRole("radio", { name: /Fog Duel/ })).toBeChecked();
    await expect(page.getByLabel("View").locator('option[value="spectator"]')).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
  });

  test("imports supported agents directly into a one-off game", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/#/game/new");
    const cards = page.locator("article");
    await cards.nth(0).locator('input[type="file"]').setInputFiles(path.join(root, "examples", "python-dqn-smoke.agent.json"));
    await expect(cards.nth(0).getByRole("heading", { name: "Python DQN Smoke" })).toBeVisible({ timeout: 15_000 });
    await cards.nth(1).locator('input[type="file"]').setInputFiles(path.join(root, "examples", "tfjs-constant-forward.agent.zip"));
    await expect(cards.nth(1).getByRole("heading", { name: "Neural Agent Package Template" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Sound").selectOption("off");
    await page.getByRole("button", { name: "Start battle" }).click();
    await expect(page.getByLabel(/Ships sunk:/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Python DQN Smoke")).toBeVisible();
    await page.getByRole("button", { name: "Close match and view results" }).click();
    await expect(page.getByText("Battle complete")).toBeVisible();
  });

  test("runs a mirrored league and opens a recorded battle", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/#/league");
    await expect(page.getByRole("heading", { level: 1, name: "Rule the seven seas" })).toBeVisible();
    for (let index = 0; index < 2; index += 1) await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByText(/2 captains · 2 mirrored battles/)).toBeVisible();
    await page.getByRole("button", { name: "Start league" }).click();
    await expect(page.getByText("League complete")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("2 / 2 battles resolved")).toBeVisible();
    await page.getByRole("button", { name: "Replay" }).first().click();
    await expect(page.getByLabel(/Ships sunk:/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Close match and view results" }).click();
    await page.getByRole("link", { name: "Return to league" }).click();
    await expect(page.getByText("League complete")).toBeVisible();
    await page.getByRole("button", { name: "New league" }).click();
    await page.getByLabel("Competition format").selectOption("knockout");
    await expect(page.getByLabel("Bracket size")).toHaveValue("4");
    for (let slot = 1; slot <= 4; slot += 1) await page.getByLabel(`Knockout captain ${slot}`).selectOption("builtin-duel-harbor-cadet-v2");
    await expect(page.getByLabel("Knockout bracket from opening round to champion")).toBeVisible();
    await page.getByRole("button", { name: "Draw bracket" }).click();
    await expect(page.getByText("Champion crowned")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("3 / 3 battles resolved")).toBeVisible();
    await expect(page.getByLabel("Knockout bracket from opening round to champion").getByText("LEAGUE WINNER")).toBeVisible();
  });

  test("keeps every Teddy boss above its Level 3 rival in mirrored evaluation", async ({ page }) => {
    test.setTimeout(240_000);
    const cases = [
      { mode: "duel", boss: "Teddy's Duel Leviathan" },
      { mode: "fleet", boss: "Teddy's Fleet Sovereign" },
      { mode: "fog-duel", boss: "Teddy's Fog Wraith" },
      { mode: "fog-fleet", boss: "Teddy's Fog Dominion" },
    ];
    await page.goto("/#/league");
    for (const item of cases) {
      await page.getByLabel("Mode").selectOption(item.mode);
      for (let index = 0; index < 2; index += 1) await page.getByRole("button", { name: "Remove" }).first().click();
      await expect(page.getByText(/2 captains · 2 mirrored battles/)).toBeVisible();
      await page.getByRole("button", { name: "Start league" }).click();
      await expect(page.getByText("League complete")).toBeVisible({ timeout: 90_000 });
      await expect(page.getByRole("table").first().locator("tbody tr").first()).toContainText(item.boss);
      await page.getByRole("button", { name: "New league" }).click();
    }
  });

  test("explains the agent contract, downloads the Python kit, and renders responsively", async ({ page }) => {
    test.setTimeout(60_000);
    mkdirSync(screenshots, { recursive: true });
    await page.goto("/#/develop");
    await expect(page.getByRole("heading", { level: 1, name: "Develop your agent" })).toBeVisible();
    await expect(page.getByText("100 ms", { exact: true })).toBeVisible();
    await expect(page.getByText("32 MiB", { exact: true }).first()).toBeVisible();
    await page.getByRole("link", { name: "Read Teddy's Agent build log" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Teddy's Agent" })).toBeVisible();
    await expect(page.getByText("16 opponents", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /agent.js/ })).toBeVisible();
    await page.getByRole("link", { name: "Back to the agent guide" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download Python kit" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("FleetRL_Python_Training_Bundle.zip");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/home");
    await expect(page.getByRole("heading", { level: 1, name: /Pirates War/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: path.join(screenshots, "pirates-war-mobile-landing.png"), fullPage: true });

    await page.goto(`${subpathOrigin}/course/fleetrl/#/menu`);
    await expect(page.getByRole("heading", { level: 1, name: "Main Menu" })).toBeVisible();
    await expect(page.getByRole("link", { name: "League" })).toBeVisible();
    const cname = await page.request.get(`${subpathOrigin}/course/fleetrl/CNAME`);
    expect((await cname.text()).trim()).toBe("rl.teddylazebnik.com");
    const workerScope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(workerScope).toBe(`${subpathOrigin}/course/fleetrl/`);
  });

  test("redirects removed classroom and training routes into the game landing", async ({ page }) => {
    for (const route of ["learn", "training/new", "agents", "instructor", "classroom/new"]) {
      await page.goto(`/#/${route}`);
      await expect(page.getByRole("heading", { level: 1, name: /Pirates War/ })).toBeVisible();
      await expect(page.getByRole("link", { name: "Enter the arena" })).toBeVisible();
    }
  });
});
