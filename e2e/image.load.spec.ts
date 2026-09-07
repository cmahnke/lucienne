import { test, expect } from "@playwright/test";
import { loadTestImage, openApp } from "./helpers/app";

test.describe("image loading", () => {
  test("loads the selected image into both viewers", async ({ page }) => {
    await loadTestImage(page);

    // OpenSeadragon viewer with the fabric overlay renders canvases
    await expect(page.locator(".cutting-table-viewer canvas").first()).toBeVisible();

    // The output renderer has loaded the tile grid
    await expect(page.locator(".output-viewer canvas").first()).toBeVisible({ timeout: 30_000 });

    // Loading an image clears the status message
    await expect(page.locator(".status-container")).toBeEmpty();
  });

  test("enables the image controls once loaded", async ({ page }) => {
    await loadTestImage(page);

    await expect(page.locator("dual-range-slider.cut-y")).toHaveJSProperty("disabled", false);
    await expect(page.locator("dual-range-slider.cut-x")).toHaveJSProperty("disabled", false);
    await expect(page.locator("input.box.rulers")).toBeEnabled();
    await expect(page.locator(".cutting-table-viewer .zoomin")).not.toHaveClass(/disabled/);
    await expect(page.locator(".cutting-table-viewer .zoomout")).not.toHaveClass(/disabled/);

    // Sliders reflect the image dimensions from the info.json (512x512)
    await expect(page.locator("dual-range-slider.cut-y")).toHaveJSProperty("max", 512);
    await expect(page.locator("dual-range-slider.cut-x")).toHaveJSProperty("max", 512);
    await expect(page.locator("dual-range-slider.cut-y")).toHaveAttribute("value-min", "0");
    await expect(page.locator("dual-range-slider.cut-y")).toHaveAttribute("value-max", "512");
    await expect(page.locator("dual-range-slider.cut-x")).toHaveAttribute("value-min", "0");
    await expect(page.locator("dual-range-slider.cut-x")).toHaveAttribute("value-max", "512");
  });

  test("auto-loads the image of a manifest with a single canvas", async ({ page }) => {
    // IIIFForm.addSelect() auto-loads the image of a single entry manifest
    // without any user interaction (IIIFForm.ts:318-325)
    await openApp(page);
    // Override the two-canvas manifest fixture after the generic mocks were
    // registered (later routes take precedence in Playwright)
    await page.route("https://iiif.test/manifest-*.json", (route) =>
      route.fulfill({ contentType: "application/ld+json", path: "e2e/fixtures/manifest-single.json" })
    );

    await page.locator("#select-Collection .display").click();
    await page.locator("#select-Collection .option", { hasText: "Test Manifest One" }).click();

    // The image is loaded right away, the manifest dropdown is disabled
    await expect(page.locator("#select-Manifest")).toHaveJSProperty("disabled", true);
    await expect(page.locator("#downloadJSON")).not.toHaveClass(/disabled/);
    await expect(page.locator(".cutting-table-viewer canvas").first()).toBeVisible();
  });
});
