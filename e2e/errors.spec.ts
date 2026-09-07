import { test, expect } from "@playwright/test";
import { openApp } from "./helpers/app";

test.describe("URL error handling", () => {
  test("shows an error for unreachable IIIF URLs", async ({ page }) => {
    await openApp(page);

    // Any external host is aborted by the network mock
    await page.locator("#collection-url").fill("https://broken.test/collection.json");
    await page.locator("button.load-url-button").click();

    await expect(page.locator(".status-container")).toContainText("IIIF file could not be loaded");
  });

  test("shows an error for invalid URLs", async ({ page }) => {
    await openApp(page);

    await page.locator("#collection-url").fill("not a url");
    await page.locator("button.load-url-button").click();

    await expect(page.locator(".status-container")).toContainText("Invalid URL");
  });
});
