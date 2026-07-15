import { expect, test, type Page } from "@playwright/test";

async function expectCleanPage(page: Page, browserErrors: string[]) {
  expect(browserErrors).toEqual([]);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(await page.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );
}

function collectBrowserErrors(page: Page) {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  return browserErrors;
}

async function enterExhibit(
  page: Page,
  sampleIndex: number,
  title: string,
  uncertaintyDecision: "confirm" | "preserve" = "confirm",
) {
  await page.getByRole("button", { name: "Open source desk" }).nth(sampleIndex).click();
  await expect(page.getByRole("heading", { name: "Keep the memory. Question the guess." })).toBeVisible();
  const confirmButton = page.getByRole("button", { name: "Confirm as remembered" });
  const hasUncertainty = (await confirmButton.count()) > 0;
  if (hasUncertainty) {
    await page.getByRole("button", {
      name: uncertaintyDecision === "confirm" ? "Confirm as remembered" : "Preserve uncertainty",
    }).click();
  }
  await expect(page.getByRole("button", { name: "Approve the story map" })).toBeDisabled();
  await page.getByLabel("I reviewed the displayed claims and all generated exhibit, scene, hotspot, and interaction-draft copy against the listed sources.").check();
  await page.getByRole("button", { name: "Approve the story map" }).click();
  await expect(page.getByRole("heading", { name: "A memory becomes a place." })).toBeVisible();
  await page.getByRole("button", { name: "Build this true story" }).click();

  const launch = page.getByRole("button", { name: `Approve final interaction & enter ${title}` });
  await expect(launch).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Runtime fallback/)).toBeVisible();
  if (hasUncertainty && uncertaintyDecision === "confirm") {
    await expect(page.getByText("Storyteller confirmation", { exact: true })).toBeVisible();
  }
  await launch.click();
  await expect(page.getByRole("region", { name: `${title} playable exhibit` })).toBeVisible();
}

test("collect exhibit preserves an inspectable evidence trail", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await enterExhibit(page, 0, "Lantern Lane, 1998", "preserve");

  const spatial = page.getByRole("region", {
    name: "Generated spatial interpretation: Three photographs remembered one night",
  });
  await expect(spatial).toBeVisible();
  await expect(spatial.getByText("Generated space · traceable story", { exact: true })).toBeVisible();
  await expect(spatial.getByText("Source plane", { exact: true })).toHaveCount(3);
  const spatialWorld = spatial.locator("[data-preset]").first();
  const nearPlane = spatial.locator('article[data-slot="near-left"]');
  await expect(spatialWorld).toHaveAttribute("data-preset", "memory-corridor");
  await nearPlane.evaluate((element) => { (element as HTMLElement).style.transition = "none"; });
  const corridorTransform = await nearPlane.evaluate((element) => getComputedStyle(element).transform);
  await spatialWorld.evaluate((element) => { (element as HTMLElement).dataset.preset = "gallery-arc"; });
  const arcTransform = await nearPlane.evaluate((element) => getComputedStyle(element).transform);
  await spatialWorld.evaluate((element) => { (element as HTMLElement).dataset.preset = "tabletop"; });
  const tabletopTransform = await nearPlane.evaluate((element) => getComputedStyle(element).transform);
  expect(new Set([corridorTransform, arcTransform, tabletopTransform]).size).toBe(3);
  await spatialWorld.evaluate((element) => { (element as HTMLElement).dataset.preset = "memory-corridor"; });

  await spatial.getByRole("button", { name: "Bell", exact: true }).click();
  const uncertaintyTrace = page.getByRole("button", { name: "Trace to 2 sources" });
  await uncertaintyTrace.click();
  const uncertaintyDrawer = page.getByRole("dialog", { name: "Source archive" });
  await expect(uncertaintyDrawer.getByText("Uncertainty decision", { exact: true })).toBeVisible();
  await expect(
    uncertaintyDrawer.getByText(/deliberately kept uncertain.*not confirmed as fact/i),
  ).toBeVisible();
  await uncertaintyDrawer.getByRole("button", { name: "Close source archive" }).click();
  await page.getByRole("button", { name: "Close memory detail" }).click();

  await spatial.getByRole("button", { name: "View flat exhibit" }).click();
  await expect(page.getByLabel("Interactive illustrated scene: Three photographs remembered one night")).toBeVisible();
  await page.getByRole("button", { name: "Enter spatial view" }).click();
  await expect(spatial).toBeVisible();

  const moveDeeper = spatial.getByRole("button", { name: "Move deeper" });
  await moveDeeper.click();
  await moveDeeper.click();
  await expect(moveDeeper).toBeDisabled();

  await spatial.getByRole("button", { name: "Painted", exact: true }).click();
  await spatial.getByRole("button", { name: "Turn on Evidence Lens", exact: true }).click();
  await expect(spatial.getByText("Evidence Lens active", { exact: true })).toBeVisible();
  await expect(spatial.getByText("cited photo region", { exact: true })).toBeVisible();
  const traceButton = page.getByRole("button", { name: "Trace to 3 sources" });
  await traceButton.click();

  const drawer = page.getByRole("dialog", { name: "Source archive" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("audio")).toHaveCount(1);
  await expect(drawer.getByText("AI-generated fictional demo photo · left view", { exact: true })).toBeVisible();
  await expect(drawer.getByText(/Cited segment\s+0:00–0:05/)).toBeVisible();
  await expect(drawer.getByText("cited region").first()).toBeVisible();
  await drawer.getByRole("button", { name: "Close source archive" }).click();
  await expect(traceButton).toBeFocused();

  await page.getByRole("button", { name: "Close memory detail" }).click();
  await spatial.getByRole("button", { name: "Tasseled", exact: true }).click();
  await page.getByRole("button", { name: "Close memory detail" }).click();
  await spatial.getByRole("button", { name: "Pale", exact: true }).click();

  await expect(page.getByText("Archive trail complete", { exact: true })).toBeVisible();
  await expect(page.getByText("Three lights, three citations", { exact: false })).toBeVisible();
  await expectCleanPage(page, browserErrors);
});

test("sequence exhibit rejects a wrong order and completes the true order", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The complete judge path is exercised once on desktop.");
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await enterExhibit(page, 1, "Four Moves at the Repair Bench");

  await page.getByRole("button", { name: "Ring" }).click();
  await expect(page.getByText(/That move came later/)).toBeVisible();

  for (const label of ["Turn", "Loosen", "Chain", "Ring"]) {
    await page.getByRole("button", { name: label }).click();
    if (label === "Loosen") {
      const traceButton = page.getByRole("button", { name: "Trace to 2 sources" });
      await traceButton.click();
      const drawer = page.getByRole("dialog", { name: "Source archive" });
      await expect(drawer.getByText("AI-generated fictional demo photo · small wrench", { exact: true })).toBeVisible();
      await expect(drawer.getByText(/Cited segment\s+0:04–0:06/)).toBeVisible();
      await expect(drawer.getByText("cited region").first()).toBeVisible();
      await drawer.getByRole("button", { name: "Close source archive" }).click();
      await expect(traceButton).toBeFocused();
    }
    if (label !== "Ring") {
      await page.getByRole("button", { name: "Close memory detail" }).click();
    }
  }

  await expect(page.getByText("Archive trail complete", { exact: true })).toBeVisible();
  await expect(page.getByText("The wheel turns clean", { exact: false })).toBeVisible();
  await expectCleanPage(page, browserErrors);
});

test("mobile landing page stays readable without horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile layout has a dedicated project.");
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Walk into a true story." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter Lantern Lane" })).toBeVisible();
  await expectCleanPage(page, browserErrors);
});
