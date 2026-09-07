import { test, expect } from "@playwright/test";
import { openApp } from "./helpers/app";

test.describe("initial UI", () => {
  test("renders the generator with all controls", async ({ page }) => {
    await openApp(page);

    await expect(page.locator("#generator.lucienne")).toBeVisible();
    await expect(page.locator("#collection-url")).toBeVisible();
    await expect(page.locator("button.load-url-button")).toHaveText("Load URL");
    // The default URL from src/main.ts is offered in the datalist
    await expect(page.locator("#defaultURLs option").first()).toHaveAttribute(
      "value",
      "https://vorsatzpapier.projektemacher.org/patterns/collection.json"
    );
    await expect(page.locator("datalist#defaultURLs option").first()).toHaveText("Sammlung Vorsatzpapier");
  });

  test("cutting table controls are disabled before an image is loaded", async ({ page }) => {
    await openApp(page);

    await expect(page.locator("dual-range-slider.cut-y")).toHaveJSProperty("disabled", true);
    await expect(page.locator("dual-range-slider.cut-x")).toHaveJSProperty("disabled", true);
    await expect(page.locator("input.offset-y")).toBeDisabled();
    await expect(page.locator("input.offset-x")).toBeDisabled();
    await expect(page.locator("rotating-input.rotation-y")).toHaveJSProperty("disabled", true);
    await expect(page.locator("rotating-input.rotation-x")).toHaveJSProperty("disabled", true);
    await expect(page.locator("input.box.rulers")).toBeDisabled();
    await expect(page.locator(".cutting-table-viewer .square")).toHaveClass(/disabled/);
  });

  test("renderer controls exist and the JSON download link starts disabled", async ({ page }) => {
    await openApp(page);

    const outputViewer = page.locator(".output-viewer");
    await expect(outputViewer.locator("image-resolution-select")).toBeVisible();
    await expect(outputViewer.locator("grid-size-selector")).toBeVisible();
    await expect(outputViewer.locator("offscreencanvas-download")).toBeVisible();
    await expect(outputViewer.locator(".zoomin")).toHaveClass(/disabled/);
    await expect(outputViewer.locator(".zoomout")).toHaveClass(/disabled/);
    await expect(outputViewer.locator(".fullscreen")).toHaveClass(/disabled/);
    await expect(outputViewer.locator(".fullwidth")).toHaveClass(/disabled/);

    await expect(page.locator("#downloadJSON")).toHaveClass(/disabled/);
    await expect(page.locator("#downloadJSON")).toHaveText("Download as JSON");
    await expect(page.locator(".status-container")).toBeEmpty();
  });
});
