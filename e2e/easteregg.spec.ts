import { test, expect } from "@playwright/test";
import { loadTestImage } from "./helpers/app";

test.describe("easter egg", () => {
  test("Escape swaps in the carpet pattern and Escape again swaps back", async ({ page }) => {
    await loadTestImage(page);

    await expect(page.locator("dual-range-slider.cut-x")).toHaveJSProperty("max", 512);
    await expect(page.locator("dual-range-slider.cut-y")).toHaveJSProperty("max", 512);

    await page.keyboard.press("Escape");

    await expect(page.locator("dual-range-slider.cut-x")).toHaveJSProperty("max", 840);
    await expect(page.locator("dual-range-slider.cut-y")).toHaveJSProperty("max", 600);
    await expect(page.locator(".cutting-table-viewer canvas").first()).toBeVisible();
    await expect(page.locator(".output-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#downloadJSON")).not.toHaveClass(/disabled/);

    await page.keyboard.press("Escape");

    await expect(page.locator("dual-range-slider.cut-x")).toHaveJSProperty("max", 512);
    await expect(page.locator("dual-range-slider.cut-y")).toHaveJSProperty("max", 512);
    await expect(page.locator(".output-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  });
});
