import { test, expect } from "@playwright/test";
import { loadTestImage } from "./helpers/app";
import { IMAGE_SERVICE_URL } from "./fixtures/mock";

test.describe("JSON upload", () => {
  test("applies uploaded cut definitions to the controls", async ({ page }) => {
    await loadTestImage(page);

    const cutJson = JSON.stringify({
      url: IMAGE_SERVICE_URL,
      width: 512,
      height: 512,
      cuts: { Top: 100, Bottom: 400 }
    });

    const dataTransfer = await page.evaluateHandle((content) => {
      const dt = new DataTransfer();
      dt.items.add(new File([content], "cuts.json", { type: "application/json" }));
      return dt;
    }, cutJson);

    await page.dispatchEvent(".input-area", "drop", { dataTransfer });

    // The tile-loaded handler applies the JSON and syncs the controls
    // (CuttingTable.dropHandler -> cuts.loadJSON -> updateControls)
    const cutY = page.locator("dual-range-slider.cut-y");
    await expect(cutY).toHaveAttribute("value-min", "100", { timeout: 30_000 });
    await expect(cutY).toHaveAttribute("value-max", "400", { timeout: 30_000 });

    // The URL input now shows the image service URL from the JSON
    await expect(page.locator("#collection-url")).toHaveValue(IMAGE_SERVICE_URL);

    // No error message was displayed
    await expect(page.locator(".status-container")).toBeEmpty();
  });

  test("shows an error for non-JSON files", async ({ page }) => {
    await loadTestImage(page);

    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["not json"], "cuts.txt", { type: "text/plain" }));
      return dt;
    });

    await page.dispatchEvent(".input-area", "drop", { dataTransfer });

    await expect(page.locator(".status-container")).toContainText("JSON could not be loaded");
    await expect(page.locator(".status-container")).toContainText("File is not a JSON");
  });
});
