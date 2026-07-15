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

async function enterExhibit(page: Page, sampleIndex: number, title: string) {
  await page.getByRole("button", { name: "Open source desk" }).nth(sampleIndex).click();
  await expect(page.getByRole("heading", { name: "Keep the memory. Question the guess." })).toBeVisible();
  const confirmButton = page.getByRole("button", { name: "Confirm as remembered" });
  const confirmedAnUncertainty = (await confirmButton.count()) > 0;
  if (confirmedAnUncertainty) await confirmButton.click();
  await page.getByRole("button", { name: "Approve the story map" }).click();
  await expect(page.getByRole("heading", { name: "A memory becomes a place." })).toBeVisible();
  await page.getByRole("button", { name: "Build this true story" }).click();

  const launch = page.getByRole("button", { name: `Enter ${title}` });
  await expect(launch).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Demo fallback/)).toBeVisible();
  if (confirmedAnUncertainty) {
    await expect(page.getByText("Storyteller confirmation", { exact: true })).toBeVisible();
  }
  await launch.click();
  await expect(page.getByRole("region", { name: `${title} playable exhibit` })).toBeVisible();
}

test("collect exhibit preserves an inspectable evidence trail", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await enterExhibit(page, 0, "Lantern Lane, 1998");

  await page.getByRole("button", { name: "Painted" }).click();
  const traceButton = page.getByRole("button", { name: "Trace to 3 sources" });
  await traceButton.click();

  const drawer = page.getByRole("dialog", { name: "Source archive" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("audio")).toHaveCount(1);
  await expect(drawer.getByText(/Cited segment\s+0:00–0:05/)).toBeVisible();
  await expect(drawer.getByText("cited region").first()).toBeVisible();
  await drawer.getByRole("button", { name: "Close source archive" }).click();
  await expect(traceButton).toBeFocused();

  await page.getByRole("button", { name: "Close memory detail" }).click();
  await page.getByRole("button", { name: "Tasseled" }).click();
  await page.getByRole("button", { name: "Close memory detail" }).click();
  await page.getByRole("button", { name: "Pale" }).click();

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
  await expect(page.getByRole("button", { name: "Open the memory desk" })).toBeVisible();
  await expectCleanPage(page, browserErrors);
});
