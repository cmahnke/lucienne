import { test, expect } from "@playwright/test";
import { openApp } from "./helpers/app";

test.describe("collection loading", () => {
  test("auto-loads the default collection and populates the dropdown", async ({ page }) => {
    await openApp(page);

    const collectionSelect = page.locator("#select-Collection");
    await expect(collectionSelect.locator(".option")).toHaveCount(2);
    await expect(collectionSelect.locator(".option").first()).toContainText("Test Manifest One");
    await expect(collectionSelect.locator(".option").nth(1)).toContainText("Test Manifest Two");
    // Entries provide thumbnails, rendered inside the shadow DOM options
    await expect(collectionSelect.locator(".option img").first()).toBeAttached();
  });

  test("selecting a manifest loads the canvas dropdown", async ({ page }) => {
    await openApp(page);

    await page.locator("#select-Collection .display").click();
    await page.locator("#select-Collection .option", { hasText: "Test Manifest One" }).click();

    const manifestSelect = page.locator("#select-Manifest");
    await expect(manifestSelect).toBeVisible();
    await expect(manifestSelect.locator(".option")).toHaveCount(2);
    await expect(manifestSelect.locator(".option").first()).toContainText("Canvas One");
    await expect(manifestSelect.locator(".option").nth(1)).toContainText("Canvas Two");
  });
});
