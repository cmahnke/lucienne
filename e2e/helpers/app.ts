import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { mockIIIF } from "../fixtures/mock";

/**
 * Opens the demo page with all IIIF traffic mocked and waits for the
 * collection dropdown to be populated by the auto-load mechanism.
 */
export async function openApp(page: Page, path = "/") {
  await mockIIIF(page);
  await page.goto(path);
  await expect(page.locator("#select-Collection")).toBeVisible();
}

/**
 * Selects the first manifest of the mocked collection, then the first canvas
 * of that manifest and waits for the image (and its controls) to be loaded.
 */
export async function loadTestImage(page: Page, path = "/") {
  await openApp(page, path);

  // Collection -> Manifest
  await page.locator("#select-Collection .display").click();
  await page.locator("#select-Collection .option", { hasText: "Test Manifest One" }).click();
  await expect(page.locator("#select-Manifest")).toBeVisible();

  // Manifest -> Image (triggers loading of the image info.json)
  await page.locator("#select-Manifest .display").click();
  await page.locator("#select-Manifest .option", { hasText: "Canvas One" }).click();

  // The image service URL setter removes the "disabled" class from the JSON
  // download link (CuttingTable.ts:308-314), updateLines() enables the controls
  await expect(page.locator("#downloadJSON")).not.toHaveClass(/disabled/);
  await expect(page.locator(".cutting-table-viewer .square")).not.toHaveClass(/disabled/);
}

/**
 * Reads the JSON document that the "Download as JSON" link generates
 * on click (a data: URL href built from Cuts.toJSONLD()).
 */
export async function downloadCutJson(page: Page): Promise<{ [key: string]: unknown }> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#downloadJSON").click()]);
  const path = await download.path();
  if (path === null) {
    throw new Error("Download path was null");
  }
  const contents = await import("node:fs/promises").then((fs) => fs.readFile(path, "utf-8"));
  return JSON.parse(contents);
}
